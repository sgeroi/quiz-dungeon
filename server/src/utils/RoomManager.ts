import type { GameState, Player, PlayerClass, GameMode, TeamMode } from '../../../shared/types.ts';
import { getPack } from '../data/contentStore.ts';
import { availableTeamModes, makeTeams, smallestTeam, teamSetupError } from './teams.ts';

const rooms = new Map<string, GameState>();
const playerToRoom = new Map<string, string>();
// Screens (TV role) are NOT players: separate map so getRoomByPlayer() stays null for them.
const screenToRoom = new Map<string, string>();

// Disconnected players awaiting rejoin (roomCode -> { playerName -> Player })
const disconnectedPlayers = new Map<string, Map<string, { player: Player; timeout: ReturnType<typeof setTimeout> }>>();

const REJOIN_TIMEOUT_MS = 120_000; // 2 minutes to rejoin

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345679';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    playerClass: null,
    personalHp: 100,
    maxPersonalHp: 100,
    abilityCooldown: 0,
    bonusDamage: 0,
    isAlive: true,
    isReady: false,
    currentAnswer: null,
    answerTime: null,
    streak: 0,
  };
}

export interface CreateRoomOpts {
  interactive?: boolean;
}

export function createRoom(hostSocketId: string, hostName: string, mode: GameMode = 'classic', opts: CreateRoomOpts = {}): GameState {
  const roomCode = generateRoomCode();
  const host = makePlayer(hostSocketId, hostName);

  const state: GameState = {
    roomCode,
    phase: 'lobby',
    players: { [hostSocketId]: host },
    hostId: hostSocketId,
    currentFloor: 0,
    totalFloors: 8,
    floors: [],
    timer: 0,
    maxTimer: 0,
    currentQuestion: null,
    lastResults: null,
    gameMode: mode,
    teamMode: 'coop',
    teams: [],
    interactive: !!opts.interactive,
    screenIds: [],
  };

  rooms.set(roomCode, state);
  playerToRoom.set(hostSocketId, roomCode);
  return state;
}

export function joinRoom(roomCode: string, socketId: string, playerName: string): GameState | null {
  const state = rooms.get(roomCode.toUpperCase());
  if (!state) return null;
  if (state.phase !== 'lobby') return null;
  if (Object.keys(state.players).length >= 8) return null;

  const player = makePlayer(socketId, playerName);
  state.players[socketId] = player;
  playerToRoom.set(socketId, roomCode.toUpperCase());
  return state;
}

export function rejoinRoom(roomCode: string, socketId: string, playerName: string): GameState | null {
  const code = roomCode.toUpperCase();
  const state = rooms.get(code);
  if (!state) return null;

  // Check if there's a saved disconnected player
  const dcMap = disconnectedPlayers.get(code);
  if (dcMap && dcMap.has(playerName)) {
    const { player, timeout } = dcMap.get(playerName)!;
    clearTimeout(timeout);
    dcMap.delete(playerName);
    if (dcMap.size === 0) disconnectedPlayers.delete(code);

    // Restore player with new socket ID
    const oldId = player.id;
    player.id = socketId;
    state.players[socketId] = player;
    playerToRoom.set(socketId, code);
    if (state.hostId === oldId) state.hostId = socketId;
    return state;
  }

  // If game is in lobby, allow normal join
  if (state.phase === 'lobby') {
    return joinRoom(roomCode, socketId, playerName);
  }

  // If game is in progress and player name matches someone who left (already removed)
  return null;
}

export function getRoom(roomCode: string): GameState | undefined {
  return rooms.get(roomCode.toUpperCase());
}

export function getRoomByPlayer(socketId: string): GameState | undefined {
  const code = playerToRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

/** Drop a room and forget every screen attached to it. Returns the screen socket ids. */
function destroyRoom(code: string): string[] {
  rooms.delete(code);
  const screens: string[] = [];
  for (const [sid, c] of screenToRoom) {
    if (c === code) screens.push(sid);
  }
  for (const sid of screens) screenToRoom.delete(sid);
  return screens;
}

export function removePlayer(socketId: string): { room: GameState | null; deleted: boolean; roomCode?: string } {
  const code = playerToRoom.get(socketId);
  if (!code) return { room: null, deleted: false };

  playerToRoom.delete(socketId);
  const state = rooms.get(code);
  if (!state) return { room: null, deleted: false };

  const player = state.players[socketId];
  const isInGame = state.phase !== 'lobby';

  // If game is in progress, save player for rejoin instead of deleting
  if (isInGame && player && !player.isBot) {
    if (!disconnectedPlayers.has(code)) {
      disconnectedPlayers.set(code, new Map());
    }
    const dcMap = disconnectedPlayers.get(code)!;
    const timeout = setTimeout(() => {
      dcMap.delete(player.name);
      if (dcMap.size === 0) disconnectedPlayers.delete(code);
    }, REJOIN_TIMEOUT_MS);
    dcMap.set(player.name, { player: { ...player }, timeout });
  }

  delete state.players[socketId];

  if (Object.keys(state.players).length === 0 && !disconnectedPlayers.has(code)) {
    destroyRoom(code);
    return { room: null, deleted: true, roomCode: code };
  }

  return { room: state, deleted: false, roomCode: code };
}

// Explicit leave: remove from room without saving to disconnectedPlayers.
// If host leaves mid-game, mark the room as ended so others see victory/defeat screen.
export function leaveRoom(socketId: string): { room: GameState | null; deleted: boolean; wasHost: boolean } {
  const code = playerToRoom.get(socketId);
  if (!code) return { room: null, deleted: false, wasHost: false };
  const state = rooms.get(code);
  if (!state) {
    playerToRoom.delete(socketId);
    return { room: null, deleted: false, wasHost: false };
  }
  const wasHost = state.hostId === socketId;
  playerToRoom.delete(socketId);
  delete state.players[socketId];

  // If host leaves, close the room for everyone.
  if (wasHost) {
    destroyRoom(code);
    const dc = disconnectedPlayers.get(code);
    if (dc) {
      for (const [, entry] of dc) clearTimeout(entry.timeout);
      disconnectedPlayers.delete(code);
    }
    return { room: state, deleted: true, wasHost: true };
  }

  if (Object.keys(state.players).length === 0 && !disconnectedPlayers.has(code)) {
    destroyRoom(code);
    return { room: null, deleted: true, wasHost: false };
  }
  return { room: state, deleted: false, wasHost: false };
}

// ==================== INTERACTIVE / SCREENS ====================

/** Host-only, lobby-only: toggle interactive mode (QR join, no video/mic). */
export function setInteractive(socketId: string, on: boolean): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.hostId !== socketId) return null;
  if (state.phase !== 'lobby') return null;
  state.interactive = !!on;
  return state;
}

/** Attach a screen (TV) socket to a room. Screens are not players. Any phase is allowed. */
export function addScreen(roomCode: string, socketId: string): GameState | null {
  const code = roomCode.toUpperCase();
  const state = rooms.get(code);
  if (!state) return null;
  // A socket can't be both a player and a screen.
  if (playerToRoom.has(socketId)) return null;
  const prev = screenToRoom.get(socketId);
  if (prev && prev !== code) removeScreen(socketId);
  screenToRoom.set(socketId, code);
  if (!state.screenIds) state.screenIds = [];
  if (!state.screenIds.includes(socketId)) state.screenIds.push(socketId);
  return state;
}

/** Detach a screen socket. Returns the room it was attached to (if any). */
export function removeScreen(socketId: string): GameState | null {
  const code = screenToRoom.get(socketId);
  if (!code) return null;
  screenToRoom.delete(socketId);
  const state = rooms.get(code);
  if (!state) return null;
  if (state.screenIds) state.screenIds = state.screenIds.filter((id) => id !== socketId);
  return state;
}

export function getRoomByScreen(socketId: string): GameState | undefined {
  const code = screenToRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

export function selectClass(socketId: string, playerClass: PlayerClass): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return null;

  player.playerClass = playerClass;
  return state;
}

export function setGameMode(socketId: string, mode: GameMode): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.hostId !== socketId) return null;
  if (state.phase !== 'lobby') return null;
  if (state.gameMode === mode) return state;
  state.gameMode = mode;
  // Current format may be unavailable in the new game -> first available one.
  const avail = availableTeamModes(mode);
  if (!avail.includes(state.teamMode ?? 'coop')) {
    applyTeamMode(state, avail[0] ?? 'coop');
  }
  // New game — everyone confirms readiness again (bots are always ready).
  for (const p of Object.values(state.players)) p.isReady = !!p.isBot;
  return state;
}

// ==================== TEAM MODES (see docs/TEAMS.md) ====================

/** Switch teamMode in place: entering 'teams' creates 2 teams, leaving it clears teams/teamId. */
function applyTeamMode(state: GameState, mode: TeamMode): void {
  const wasTeams = state.teamMode === 'teams';
  state.teamMode = mode;
  if (mode === 'teams') {
    if (!wasTeams || !state.teams || state.teams.length < 2) state.teams = makeTeams(2);
    for (const p of Object.values(state.players)) p.teamId = undefined;
  } else {
    state.teams = [];
    for (const p of Object.values(state.players)) p.teamId = undefined;
  }
  // Format changed — everyone confirms readiness again (bots stay ready, and
  // in teams-mode bots are seated automatically).
  for (const p of Object.values(state.players)) {
    p.isReady = !!p.isBot;
    if (p.isBot && mode === 'teams') p.teamId = smallestTeam(state)?.id;
  }
}

/** Host-only, lobby-only. Ignored when the format is unavailable for the current game. */
export function setTeamMode(socketId: string, mode: TeamMode): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.hostId !== socketId) return null;
  if (state.phase !== 'lobby') return null;
  if (!availableTeamModes(state.gameMode).includes(mode)) return state;
  if (state.teamMode === mode) return state;
  applyTeamMode(state, mode);
  return state;
}

/** Host-only, lobby-only, teams-mode only: 2..4 teams. Players of removed teams lose their team (and readiness). */
export function setTeamCount(socketId: string, n: number): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.hostId !== socketId) return null;
  if (state.phase !== 'lobby') return null;
  if (state.teamMode !== 'teams') return null;
  if (n !== 2 && n !== 3 && n !== 4) return null;
  const teams = makeTeams(n);
  const keep = new Set(teams.map((t) => t.id));
  // Preserve renamed/customised teams that survive the resize.
  state.teams = teams.map((t) => state.teams.find((old) => old.id === t.id) ?? t);
  for (const p of Object.values(state.players)) {
    if (p.teamId && !keep.has(p.teamId)) {
      p.teamId = p.isBot ? smallestTeam(state)?.id : undefined;
      if (!p.isBot) p.isReady = false;
    }
  }
  return state;
}

/** Any player (incl. host), lobby-only, teams-mode only. */
export function joinTeam(socketId: string, teamId: string): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.phase !== 'lobby') return null;
  if (state.teamMode !== 'teams') return null;
  const player = state.players[socketId];
  if (!player) return null;
  if (!state.teams.some((t) => t.id === teamId)) return null;
  player.teamId = teamId;
  return state;
}

/** Error message when the party can't start because of team setup; null when fine. */
export function getTeamSetupError(state: GameState): string | null {
  return teamSetupError(state);
}

/** Host-only, lobby-only: choose a content pack for a mode. null = builtin. */
export function setContentPack(socketId: string, mode: GameMode, packId: string | null): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;
  if (state.hostId !== socketId) return null;
  if (state.phase !== 'lobby') return null;
  if (!state.contentPacks) state.contentPacks = {};
  if (!packId) {
    delete state.contentPacks[mode];
    return state;
  }
  const pack = getPack(packId);
  if (!pack || pack.mode !== mode) return null;
  state.contentPacks[mode] = packId;
  return state;
}

export function setPlayerReady(socketId: string): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return null;

  // In teams-mode you pick a team first.
  if (state.teamMode === 'teams' && !player.teamId) return null;
  player.isReady = true;
  return state;
}

export function allPlayersReady(room: GameState): boolean {
  const players = Object.values(room.players);
  if (players.length === 0) return false;
  const needsClass = (room.gameMode ?? 'classic') === 'classic';
  if (!players.every((p) => p.isReady && (!needsClass || p.playerClass !== null))) return false;
  return teamSetupError(room) === null;
}

const BOT_NAMES = ['Гоблин-помощник', 'Мудрый Сова', 'Храбрый Ёж', 'Хитрый Лис', 'Сонный Кот', 'Быстрый Заяц', 'Мрачный Ворон'];
const BOT_CLASSES: PlayerClass[] = ['warrior', 'mage', 'healer', 'scout', 'bard', 'blacksmith'];

let botCounter = 0;

export function addBot(roomCode: string): GameState | null {
  const state = rooms.get(roomCode.toUpperCase());
  if (!state) return null;
  if (state.phase !== 'lobby') return null;
  if (Object.keys(state.players).length >= 8) return null;

  botCounter++;
  const botId = `bot-${botCounter}-${Date.now()}`;
  const usedClasses = new Set(Object.values(state.players).map(p => p.playerClass).filter(Boolean));
  const availableClass = BOT_CLASSES.find(c => !usedClasses.has(c)) ?? BOT_CLASSES[Math.floor(Math.random() * BOT_CLASSES.length)];
  const name = BOT_NAMES[botCounter % BOT_NAMES.length];

  const bot = makePlayer(botId, `🤖 ${name}`);
  bot.playerClass = availableClass;
  bot.isReady = true;
  bot.isBot = true;
  // Teams-mode: seat the bot in the smallest team.
  if (state.teamMode === 'teams') bot.teamId = smallestTeam(state)?.id;

  state.players[botId] = bot;
  return state;
}
