import type { GameState, Player, PlayerClass, GameMode } from '../../../shared/types.ts';

const rooms = new Map<string, GameState>();
const playerToRoom = new Map<string, string>();

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

export function createRoom(hostSocketId: string, hostName: string, mode: GameMode = 'classic'): GameState {
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

export function removePlayer(socketId: string): { room: GameState | null; deleted: boolean } {
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
    rooms.delete(code);
    return { room: null, deleted: true };
  }

  return { room: state, deleted: false };
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
    rooms.delete(code);
    const dc = disconnectedPlayers.get(code);
    if (dc) {
      for (const [, entry] of dc) clearTimeout(entry.timeout);
      disconnectedPlayers.delete(code);
    }
    return { room: state, deleted: true, wasHost: true };
  }

  if (Object.keys(state.players).length === 0 && !disconnectedPlayers.has(code)) {
    rooms.delete(code);
    return { room: null, deleted: true, wasHost: false };
  }
  return { room: state, deleted: false, wasHost: false };
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
  // New game — everyone confirms readiness again.
  for (const p of Object.values(state.players)) p.isReady = false;
  return state;
}

export function setPlayerReady(socketId: string): GameState | null {
  const state = getRoomByPlayer(socketId);
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return null;

  player.isReady = true;
  return state;
}

export function allPlayersReady(room: GameState): boolean {
  const players = Object.values(room.players);
  if (players.length === 0) return false;
  const needsClass = (room.gameMode ?? 'classic') === 'classic';
  return players.every((p) => p.isReady && (!needsClass || p.playerClass !== null));
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

  state.players[botId] = bot;
  return state;
}
