import type { Server, Socket } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { JEOPARDY_GRID, type JeopardyCell, type JeopardyGrid } from './grid.ts';
import { getJeopardyData } from '../../data/contentStore.ts';
import { getTeamOf, playersOfTeam, teamsWithPlayers } from '../../utils/teams.ts';

// Full grid (with answers) per room, taken from the chosen content pack at start.
const gridByRoom = new Map<string, JeopardyGrid>();

function getGrid(roomCode: string): JeopardyGrid {
  return gridByRoom.get(roomCode) ?? JEOPARDY_GRID;
}

// ==================== TYPES ====================

interface OpenCell {
  topicIdx: number;
  valueIdx: number;
  topic: string;
  value: number;
  text: string;
  options: string[];
  correctIndex: number;
}

interface JeopardyState {
  // Public-safe view of the grid: same shape, but only `value` per cell.
  grid: { topics: string[]; cells: Record<string, { value: number }[]> };
  played: string[]; // cell keys "t,v"
  captainId: string | null;
  // teams-mode: team of the current captain (the team that picks the cell).
  captainTeamId: string | null;
  scores: Record<string, number>; // playerId -> score (can be negative)
  // teams-mode only: teamId -> team total (points of an answer go to the answerer's team).
  teamScores: Record<string, number> | null;
  // teams-mode: teams that already failed this cell (all their members are in blockedIds too).
  blockedTeamIds: string[];
  currentCell: {
    topicIdx: number;
    valueIdx: number;
    topic: string;
    value: number;
    text: string;
    options: string[];
  } | null;
  buzzerOpen: boolean;
  currentAnswererId: string | null;
  blockedIds: string[]; // already failed this cell
  reveal: { correctIndex: number; chosenIndex: number | null; correct: boolean } | null;
  message: string | null;
  // Internal: the cell with correctIndex (server-only)
  _activeCell?: OpenCell;
  // Internal: re-entrancy guard for handleAnswer (prevents socket+timeout double-fire)
  _resolving?: boolean;
}

const ANSWER_TIME_SEC = 10;
const BUZZ_WINDOW_SEC = 30;
const REVEAL_DELAY_MS = 2500;

// ==================== HELPERS ====================

/** This handler is active for 'jeopardy' in ffa/teams format (dispatched from modes/jeopardy) or the legacy 'jeopardy-comp' id. */
export function isJeopardyCompActive(state: GameState): boolean {
  if (state.gameMode === 'jeopardy-comp') return true;
  return state.gameMode === 'jeopardy' && state.teamMode !== 'coop';
}

function getJ(state: GameState): JeopardyState {
  return (state as unknown as { jeopardy: JeopardyState }).jeopardy;
}

function setJ(state: GameState, j: JeopardyState): void {
  (state as unknown as { jeopardy: JeopardyState }).jeopardy = j;
}

function cellKey(topicIdx: number, valueIdx: number): string {
  return `${topicIdx},${valueIdx}`;
}

function isTeams(state: GameState): boolean {
  return state.teamMode === 'teams' && (state.teams?.length ?? 0) > 0;
}

/** Captain for a team: prefer a connected human, then any member (bots auto-pick). */
function pickCaptainOfTeam(state: GameState, teamId: string): string | null {
  const members = playersOfTeam(state, teamId);
  if (members.length === 0) return null;
  const human = members.find(p => !p.isBot);
  return (human ?? members[0]).id;
}

/** Round-robin: the non-empty team after `fromTeamId` in state.teams order. */
function nextTeamId(state: GameState, fromTeamId: string | null): string | null {
  const teams = teamsWithPlayers(state);
  if (teams.length === 0) return null;
  const idx = teams.findIndex(t => t.id === fromTeamId);
  return teams[(idx + 1) % teams.length].id;
}

/** Ensure the captain is a present player; in teams-mode also that he belongs to captainTeamId. */
function ensureCaptain(state: GameState, j: JeopardyState): void {
  if (isTeams(state)) {
    if (!j.captainTeamId || playersOfTeam(state, j.captainTeamId).length === 0) {
      j.captainTeamId = nextTeamId(state, j.captainTeamId) ?? getTeamOf(state, state.hostId)?.id ?? null;
    }
    const cap = j.captainId ? state.players[j.captainId] : undefined;
    if (!cap || cap.teamId !== j.captainTeamId) {
      j.captainId = j.captainTeamId ? pickCaptainOfTeam(state, j.captainTeamId) : state.hostId;
    }
    return;
  }
  if (!j.captainId || !state.players[j.captainId]) j.captainId = state.hostId;
}

function winnerOf(scores: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const [id, s] of Object.entries(scores)) {
    if (s > bestScore) { best = id; bestScore = s; }
  }
  return best;
}

// Build the public state slice we send to clients (no correct answers leaked).
function publicJ(j: JeopardyState) {
  return {
    grid: j.grid,
    played: j.played,
    captainId: j.captainId,
    captainTeamId: j.captainTeamId,
    scores: j.scores,
    teamScores: j.teamScores,
    currentCell: j.currentCell,
    buzzerOpen: j.buzzerOpen,
    currentAnswererId: j.currentAnswererId,
    blockedIds: j.blockedIds,
    blockedTeamIds: j.blockedTeamIds,
    reveal: j.reveal,
    message: j.message,
    answerTimeSec: ANSWER_TIME_SEC,
    buzzWindowSec: BUZZ_WINDOW_SEC,
  };
}

function broadcast(io: Server, state: GameState): void {
  const j = getJ(state);
  // Attach a slim public view onto the GameState payload so the client store
  // can read it via `gameState.jeopardy`.
  const payload = { ...state, jeopardy: publicJ(j) };
  io.to(state.roomCode).emit('game-state', payload as GameState);
}

// ==================== TIMERS (per-room) ====================

interface RoomTimers {
  buzzWindow: ReturnType<typeof setTimeout> | null;
  answer: ReturnType<typeof setTimeout> | null;
  buzzTick: ReturnType<typeof setInterval> | null;
  answerTick: ReturnType<typeof setInterval> | null;
}

const roomTimers = new Map<string, RoomTimers>();

function getTimers(roomCode: string): RoomTimers {
  let t = roomTimers.get(roomCode);
  if (!t) {
    t = { buzzWindow: null, answer: null, buzzTick: null, answerTick: null };
    roomTimers.set(roomCode, t);
  }
  return t;
}

function clearAllTimers(roomCode: string): void {
  const t = roomTimers.get(roomCode);
  if (!t) return;
  if (t.buzzWindow) { clearTimeout(t.buzzWindow); t.buzzWindow = null; }
  if (t.answer) { clearTimeout(t.answer); t.answer = null; }
  if (t.buzzTick) { clearInterval(t.buzzTick); t.buzzTick = null; }
  if (t.answerTick) { clearInterval(t.answerTick); t.answerTick = null; }
}

// ==================== GAME FLOW ====================

function startGame(io: Server, state: GameState): void {
  const packData = getJeopardyData('jeopardy', state.contentPacks?.jeopardy);
  const grid: JeopardyGrid = { topics: [...packData.topics], cells: packData.cells };
  gridByRoom.set(state.roomCode, grid);
  const publicGrid = {
    topics: grid.topics,
    cells: Object.fromEntries(
      grid.topics.map(t => [t, grid.cells[t].map(c => ({ value: c.value }))])
    ),
  };
  const players = Object.values(state.players);
  const scores: Record<string, number> = {};
  for (const p of players) scores[p.id] = 0;

  const teams = isTeams(state);
  let teamScores: Record<string, number> | null = null;
  let captainId: string | null = state.hostId;
  let captainTeamId: string | null = null;
  if (teams) {
    teamScores = {};
    for (const t of teamsWithPlayers(state)) teamScores[t.id] = 0;
    // First captain: the host's team (host picks), else the first non-empty team.
    captainTeamId = getTeamOf(state, state.hostId)?.id ?? teamsWithPlayers(state)[0]?.id ?? null;
    captainId = state.players[state.hostId]?.teamId === captainTeamId
      ? state.hostId
      : captainTeamId ? pickCaptainOfTeam(state, captainTeamId) : state.hostId;
  }

  const j: JeopardyState = {
    grid: publicGrid,
    played: [],
    captainId,
    captainTeamId,
    scores,
    teamScores,
    currentCell: null,
    buzzerOpen: false,
    currentAnswererId: null,
    blockedIds: [],
    blockedTeamIds: [],
    reveal: null,
    message: null,
  };
  setJ(state, j);

  state.phase = 'question'; // generic phase indicating "in-game"
  state.currentQuestion = null;
  state.timer = 0;
  state.maxTimer = 0;

  broadcast(io, state);
  scheduleBotCaptainPick(io, state);
}

// Bot helpers ===

function isBot(state: GameState, id: string | null): boolean {
  return !!id && !!state.players[id]?.isBot;
}

function scheduleBotCaptainPick(io: Server, state: GameState): void {
  const j = getJ(state);
  if (!j || !isBot(state, j.captainId)) return;
  setTimeout(() => {
    const cur = getJ(state);
    if (!cur || cur.currentCell) return;
    if (!isBot(state, cur.captainId)) return;
    // Pick a random unplayed cell
    const candidates: Array<[number, number]> = [];
    for (let t = 0; t < cur.grid.topics.length; t++) {
      for (let v = 0; v < 5; v++) {
        if (!cur.played.includes(cellKey(t, v))) candidates.push([t, v]);
      }
    }
    if (candidates.length === 0) return;
    const [tIdx, vIdx] = candidates[Math.floor(Math.random() * candidates.length)];
    pickCell(io, state, cur.captainId!, tIdx, vIdx);
  }, 1500 + Math.random() * 1500);
}

function scheduleBotBuzz(io: Server, state: GameState): void {
  const j = getJ(state);
  if (!j || !j.buzzerOpen) return;
  const eligibleBots = Object.values(state.players).filter(
    p => p.isBot && !j.blockedIds.includes(p.id)
  );
  if (eligibleBots.length === 0) return;
  const bot = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];
  setTimeout(() => {
    const cur = getJ(state);
    if (!cur || !cur.buzzerOpen) return;
    if (cur.blockedIds.includes(bot.id)) return;
    handleBuzz(io, state, bot.id);
    setTimeout(() => {
      const c2 = getJ(state);
      if (!c2 || c2.currentAnswererId !== bot.id || !c2._activeCell) return;
      const correct = Math.random() < 0.55;
      const idx = correct
        ? c2._activeCell.correctIndex
        : (c2._activeCell.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
      handleAnswer(io, state, bot.id, idx);
    }, 1500 + Math.random() * 2000);
  }, 2000 + Math.random() * 5000);
}

function pickCell(io: Server, state: GameState, socketId: string, topicIdx: number, valueIdx: number): void {
  const j = getJ(state);
  if (!j) return;
  if (j.currentCell) return; // a question already in flight
  if (j.captainId !== socketId) return; // only captain picks
  if (topicIdx < 0 || topicIdx >= j.grid.topics.length) return;
  if (valueIdx < 0 || valueIdx >= 5) return;

  const key = cellKey(topicIdx, valueIdx);
  if (j.played.includes(key)) return;

  const grid = getGrid(state.roomCode);
  const topic = grid.topics[topicIdx];
  const cell: JeopardyCell | undefined = grid.cells[topic]?.[valueIdx];
  if (!cell) return;

  const open: OpenCell = {
    topicIdx,
    valueIdx,
    topic,
    value: cell.value,
    text: cell.text,
    options: cell.options,
    correctIndex: cell.correctIndex,
  };

  j.currentCell = {
    topicIdx,
    valueIdx,
    topic,
    value: cell.value,
    text: cell.text,
    options: cell.options,
  };
  j._activeCell = open;
  j.buzzerOpen = true;
  j.currentAnswererId = null;
  j.blockedIds = [];
  j.blockedTeamIds = [];
  j.reveal = null;
  j.message = `Тема: ${topic}. Цена: ${cell.value}`;

  broadcast(io, state);
  startBuzzWindow(io, state);
  scheduleBotBuzz(io, state);
}

function startBuzzWindow(io: Server, state: GameState): void {
  clearAllTimers(state.roomCode);
  const j = getJ(state);
  if (!j) return;

  const remainingPlayers = Object.values(state.players).filter(p => !j.blockedIds.includes(p.id));
  if (remainingPlayers.length === 0) {
    // Nobody left to answer — reveal & close.
    revealAndClose(io, state, false);
    return;
  }

  const t = getTimers(state.roomCode);
  state.timer = BUZZ_WINDOW_SEC;
  state.maxTimer = BUZZ_WINDOW_SEC;
  io.to(state.roomCode).emit('timer-tick', state.timer);

  t.buzzTick = setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    io.to(state.roomCode).emit('timer-tick', state.timer);
  }, 1000);

  t.buzzWindow = setTimeout(() => {
    if (t.buzzTick) { clearInterval(t.buzzTick); t.buzzTick = null; }
    // No one buzzed in time.
    const cur = getJ(state);
    if (!cur || !cur.currentCell) return;
    revealAndClose(io, state, false);
  }, BUZZ_WINDOW_SEC * 1000);
}

function handleBuzz(io: Server, state: GameState, socketId: string): void {
  const j = getJ(state);
  if (!j) return;
  if (!j.currentCell) return;
  // Atomic: first emit wins.
  if (!j.buzzerOpen) return;
  if (j.blockedIds.includes(socketId)) return;
  if (!state.players[socketId]) return;

  j.buzzerOpen = false;
  j.currentAnswererId = socketId;

  // Stop buzz window timers, start answer timer.
  const t = getTimers(state.roomCode);
  if (t.buzzWindow) { clearTimeout(t.buzzWindow); t.buzzWindow = null; }
  if (t.buzzTick) { clearInterval(t.buzzTick); t.buzzTick = null; }

  state.timer = ANSWER_TIME_SEC;
  state.maxTimer = ANSWER_TIME_SEC;
  io.to(state.roomCode).emit('timer-tick', state.timer);

  t.answerTick = setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    io.to(state.roomCode).emit('timer-tick', state.timer);
  }, 1000);

  t.answer = setTimeout(() => {
    if (t.answerTick) { clearInterval(t.answerTick); t.answerTick = null; }
    // Time's up — count as wrong.
    handleAnswer(io, state, socketId, -1, true);
  }, ANSWER_TIME_SEC * 1000);

  broadcast(io, state);
}

function handleAnswer(io: Server, state: GameState, socketId: string, answerIdx: number, isTimeout = false): void {
  const j = getJ(state);
  if (!j) return;
  if (!j.currentCell || !j._activeCell) return;
  if (j.currentAnswererId !== socketId) return;
  // Re-entrancy guard: if a parallel call (socket vs. timeout) is already
  // resolving this buzz session, drop the dupe.
  if (j._resolving) return;
  j._resolving = true;

  const t = getTimers(state.roomCode);
  if (t.answer) { clearTimeout(t.answer); t.answer = null; }
  if (t.answerTick) { clearInterval(t.answerTick); t.answerTick = null; }

  const correct = !isTimeout && answerIdx === j._activeCell.correctIndex;
  const value = j._activeCell.value;
  const teams = isTeams(state);
  const team = teams ? getTeamOf(state, socketId) : undefined;
  const who = state.players[socketId]?.name ?? 'Игрок';
  const label = team ? `${team.name} (${who})` : who;

  // Clear current answerer immediately so any straggler calls bail out at
  // the `currentAnswererId !== socketId` check above.
  j.currentAnswererId = null;

  if (correct) {
    j.scores[socketId] = (j.scores[socketId] ?? 0) + value;
    if (team && j.teamScores) j.teamScores[team.id] = (j.teamScores[team.id] ?? 0) + value;
    // The scorer (and his team) picks the next cell.
    j.captainId = socketId;
    if (team) j.captainTeamId = team.id;
    j.reveal = { correctIndex: j._activeCell.correctIndex, chosenIndex: answerIdx, correct: true };
    j.message = `${label} +${value}`;
    j.buzzerOpen = false;
    j._resolving = false;
    broadcast(io, state);
    setTimeout(() => closeCell(io, state), REVEAL_DELAY_MS);
  } else {
    j.scores[socketId] = (j.scores[socketId] ?? 0) - value;
    if (team && j.teamScores) j.teamScores[team.id] = (j.teamScores[team.id] ?? 0) - value;
    if (!j.blockedIds.includes(socketId)) j.blockedIds.push(socketId);
    if (team) {
      // Whole team is out for this cell; the buzzer stays open for the other teams.
      if (!j.blockedTeamIds.includes(team.id)) j.blockedTeamIds.push(team.id);
      for (const p of playersOfTeam(state, team.id)) {
        if (!j.blockedIds.includes(p.id)) j.blockedIds.push(p.id);
      }
    }
    // Show brief "wrong" reveal, then reopen buzzer for the rest.
    // Only the chosen (wrong) option is exposed — the correct one stays hidden
    // until the cell is finally resolved.
    j.reveal = {
      correctIndex: -1,
      chosenIndex: isTimeout ? null : answerIdx,
      correct: false,
    };
    j.message = `${label} −${value}`;
    broadcast(io, state);

    setTimeout(() => {
      const cur = getJ(state);
      if (!cur || !cur.currentCell) return;
      // Anyone left who hasn't already answered?
      const remaining = Object.keys(state.players).filter(id => !cur.blockedIds.includes(id));
      cur.reveal = null;
      cur.message = null;
      cur._resolving = false;
      if (remaining.length === 0) {
        // Dead-end: everyone has failed. Reveal answer and close the cell so
        // the captain can pick a new one.
        revealAndClose(io, state, false);
      } else {
        cur.buzzerOpen = true;
        cur.currentAnswererId = null;
        broadcast(io, state);
        startBuzzWindow(io, state);
        scheduleBotBuzz(io, state);
      }
    }, 1500);
  }
}

function revealAndClose(io: Server, state: GameState, _correct: boolean): void {
  const j = getJ(state);
  if (!j || !j._activeCell) return;
  clearAllTimers(state.roomCode);
  j.buzzerOpen = false;
  j.currentAnswererId = null;
  j._resolving = false;
  j.reveal = { correctIndex: j._activeCell.correctIndex, chosenIndex: null, correct: false };
  j.message = 'Никто не ответил правильно';
  broadcast(io, state);
  setTimeout(() => closeCell(io, state), REVEAL_DELAY_MS);
}

function closeCell(io: Server, state: GameState): void {
  const j = getJ(state);
  if (!j || !j.currentCell || !j._activeCell) return;
  const scoredThisCell = !!j.reveal?.correct;
  const key = cellKey(j._activeCell.topicIdx, j._activeCell.valueIdx);
  if (!j.played.includes(key)) j.played.push(key);
  j.currentCell = null;
  j._activeCell = undefined;
  j.buzzerOpen = false;
  j.currentAnswererId = null;
  j.blockedIds = [];
  j.blockedTeamIds = [];
  j.reveal = null;
  j.message = null;
  j._resolving = false;

  const teams = isTeams(state);

  // Game over?
  if (j.played.length >= 25) {
    state.phase = 'victory';
    broadcast(io, state);
    const stats: Record<string, unknown> = { teamMode: state.teamMode ?? 'ffa', scores: j.scores };
    if (teams && j.teamScores) {
      stats.teamScores = j.teamScores;
      stats.winnerTeamId = winnerOf(j.teamScores);
    } else {
      stats.winnerPlayerId = winnerOf(j.scores);
    }
    io.to(state.roomCode).emit('game-over', true, stats);
    clearAllTimers(state.roomCode);
    roomTimers.delete(state.roomCode);
    return;
  }

  // teams: if nobody scored on this cell the pick passes to the next team (round-robin).
  if (teams && !scoredThisCell) {
    j.captainTeamId = nextTeamId(state, j.captainTeamId);
    j.captainId = j.captainTeamId ? pickCaptainOfTeam(state, j.captainTeamId) : null;
  }
  // If captain is no longer in the room (or not in the captain team), fix it up.
  ensureCaptain(state, j);

  broadcast(io, state);
  scheduleBotCaptainPick(io, state);
}

// ==================== HANDLER ====================

const handler: ModeHandler = {
  start(io, state) {
    startGame(io, state);
  },

  registerSocket(io, socket: Socket, getState) {
    socket.on('mode-jeopardy-pick', (payload: { topicIdx: number; valueIdx: number }) => {
      const state = getState();
      if (!state || !isJeopardyCompActive(state)) return;
      if (!payload || typeof payload.topicIdx !== 'number' || typeof payload.valueIdx !== 'number') return;
      pickCell(io, state, socket.id, payload.topicIdx, payload.valueIdx);
    });

    socket.on('mode-jeopardy-buzz', () => {
      const state = getState();
      if (!state || !isJeopardyCompActive(state)) return;
      handleBuzz(io, state, socket.id);
    });

    socket.on('mode-jeopardy-answer', (index: number) => {
      const state = getState();
      if (!state || !isJeopardyCompActive(state)) return;
      if (typeof index !== 'number') return;
      handleAnswer(io, state, socket.id, index);
    });
  },

  // Screen (TV) joined mid-game: send the public grid view (no correct answers).
  onScreenJoin(_io, socket, state) {
    const j = getJ(state);
    if (!j) {
      socket.emit('game-state', state);
      return;
    }
    socket.emit('game-state', { ...state, jeopardy: publicJ(j) } as GameState);
  },

  stop(_io, state) {
    clearAllTimers(state.roomCode);
    roomTimers.delete(state.roomCode);
    gridByRoom.delete(state.roomCode);
  },
};

export default handler;
