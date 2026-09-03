import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import {
  MOVIES,
  pickMovies,
  answerMatches,
  type Movie,
  type CastMember,
} from './movies.ts';
import { getPetersburgData } from '../../data/contentStore.ts';

// ---------- Mode-specific state shape ----------

interface PlayerCast {
  /** Index into the movie's cast array. */
  castIndex: number;
  member: CastMember;
}

interface PetersburgRoomData {
  /** All non-bot players in a stable order — used for captain rotation. */
  rotation: string[];
  rotationIndex: number;
  /** All movies from the chosen content pack. */
  pool: Movie[];
  /** Movies queued for the rounds. */
  queue: Movie[];
  /** Index of the current round (0-based). */
  roundIndex: number;
  /** 1..total — same as roundIndex + 1. */
  round: number;
  total: number;
  score: number;
  captainId: string;
  currentMovie: Movie | null;
  /** Per-player actor assignment (only kept server-side; clients receive their own privately). */
  castByPlayer: Record<string, PlayerCast>;
  /** Has the round been resolved (captain answered or time-out)? */
  resolved: boolean;
  lastAnswer: string | null;
  lastWasCorrect: boolean | null;
  lastMovieTitle: string | null;
  /** Cast lineup revealed in the result phase (for the whole team to see). */
  lastReveal: Array<{ playerId: string; playerName: string; actorName: string; imageUrl: string }> | null;
  timer: ReturnType<typeof setInterval> | null;
  resolveTimeout: ReturnType<typeof setTimeout> | null;
  showingResult: boolean;
}

const ROUND_TIME_SEC = 90;
const RESULT_PAUSE_MS = 6000;
const TOTAL_ROUNDS = 10;
const WIN_THRESHOLD = 6;

const rooms = new Map<string, PetersburgRoomData>();

function clearTimers(data: PetersburgRoomData): void {
  if (data.timer) {
    clearInterval(data.timer);
    data.timer = null;
  }
  if (data.resolveTimeout) {
    clearTimeout(data.resolveTimeout);
    data.resolveTimeout = null;
  }
}

function getOrInitRoom(state: GameState): PetersburgRoomData {
  let data = rooms.get(state.roomCode);
  if (!data) {
    data = {
      rotation: [],
      rotationIndex: 0,
      pool: MOVIES,
      queue: [],
      roundIndex: 0,
      round: 0,
      total: TOTAL_ROUNDS,
      score: 0,
      captainId: state.hostId,
      currentMovie: null,
      castByPlayer: {},
      resolved: false,
      lastAnswer: null,
      lastWasCorrect: null,
      lastMovieTitle: null,
      lastReveal: null,
      timer: null,
      resolveTimeout: null,
      showingResult: false,
    };
    rooms.set(state.roomCode, data);
  }
  return data;
}

// Public snapshot — does NOT leak per-player actor assignments to other players.
// Each client only knows that someone was dealt an actor (via `dealt` IDs).
// Their own actor is delivered privately via `mode-petersburg-actor`.
function buildSnapshot(data: PetersburgRoomData) {
  const dealt = Object.keys(data.castByPlayer);
  return {
    round: data.round,
    total: data.total,
    score: data.score,
    captainId: data.captainId,
    dealt,
    showingResult: data.showingResult,
    lastAnswer: data.lastAnswer,
    lastWasCorrect: data.lastWasCorrect,
    lastMovieTitle: data.lastMovieTitle,
    lastReveal: data.lastReveal,
  };
}

function pushState(io: Server, state: GameState, data: PetersburgRoomData): void {
  (state as any).petersburg = buildSnapshot(data);
  state.captainId = data.captainId;
  state.currentFloor = Math.max(1, data.round);
  state.totalFloors = data.total;
  io.to(state.roomCode).emit('game-state', state);
}

function dealActorsToPlayers(movie: Movie, playerIds: string[]): Record<string, PlayerCast> {
  // Shuffle cast indices so the first N players get distinct actors when
  // possible. If players > cast.length, the assignment cycles — duplicates
  // are a feature, not a bug (Andrei explicitly asked for it).
  const indices = movie.cast.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const out: Record<string, PlayerCast> = {};
  playerIds.forEach((pid, idx) => {
    const castIndex = indices[idx % indices.length];
    out[pid] = { castIndex, member: movie.cast[castIndex] };
  });
  return out;
}

function startRound(io: Server, state: GameState): void {
  const data = getOrInitRoom(state);
  if (data.roundIndex >= data.queue.length || data.roundIndex >= data.total) {
    finishGame(io, state);
    return;
  }

  // Refresh rotation: include current human players in their existing order,
  // appending newcomers at the end so disconnects don't desync the index.
  const humans = Object.values(state.players).filter(p => !p.isBot).map(p => p.id);
  data.rotation = data.rotation.filter(id => humans.includes(id));
  for (const id of humans) {
    if (!data.rotation.includes(id)) data.rotation.push(id);
  }
  if (data.rotation.length === 0) {
    finishGame(io, state);
    return;
  }

  data.rotationIndex = data.rotationIndex % data.rotation.length;
  data.captainId = data.rotation[data.rotationIndex];

  data.round = data.roundIndex + 1;
  data.currentMovie = data.queue[data.roundIndex];
  data.resolved = false;
  data.showingResult = false;
  data.lastAnswer = null;
  data.lastWasCorrect = null;
  data.lastMovieTitle = null;
  data.lastReveal = null;

  // Deal actors to ALL humans (captain included). Bots are silent observers.
  data.castByPlayer = dealActorsToPlayers(data.currentMovie, humans);

  state.phase = 'answering';
  state.timer = ROUND_TIME_SEC;
  state.maxTimer = ROUND_TIME_SEC;

  pushState(io, state, data);

  // Private per-player actor reveal — only the imageUrl is sent. The actor's
  // name is intentionally withheld so the player has to recognize the face.
  for (const [pid, pc] of Object.entries(data.castByPlayer)) {
    io.to(pid).emit('mode-petersburg-actor', {
      imageUrl: pc.member.imageUrl,
      round: data.round,
      total: data.total,
      isCaptain: pid === data.captainId,
    });
  }

  // Tick timer.
  clearTimers(data);
  let remaining = ROUND_TIME_SEC;
  data.timer = setInterval(() => {
    remaining--;
    state.timer = remaining;
    io.to(state.roomCode).emit('timer-tick', remaining);
    if (remaining <= 0) {
      if (data.timer) { clearInterval(data.timer); data.timer = null; }
      if (!data.resolved) {
        resolveAnswer(io, state, '', /*timedOut*/ true);
      }
    }
  }, 1000);
}

function resolveAnswer(
  io: Server,
  state: GameState,
  answerText: string,
  timedOut = false,
): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved) return;
  if (!data.currentMovie) return;
  data.resolved = true;
  clearTimers(data);

  const movie = data.currentMovie;
  const isCorrect = !timedOut && answerMatches(answerText, movie);
  if (isCorrect) data.score++;
  data.lastAnswer = timedOut ? '' : answerText;
  data.lastWasCorrect = isCorrect;
  data.lastMovieTitle = movie.title;
  data.showingResult = true;

  // Build a public reveal of who had which actor — names included now.
  const reveal: Array<{ playerId: string; playerName: string; actorName: string; imageUrl: string }> = [];
  for (const [pid, pc] of Object.entries(data.castByPlayer)) {
    reveal.push({
      playerId: pid,
      playerName: state.players[pid]?.name ?? '???',
      actorName: pc.member.name,
      imageUrl: pc.member.imageUrl,
    });
  }
  data.lastReveal = reveal;

  state.phase = 'results';
  pushState(io, state, data);

  data.resolveTimeout = setTimeout(() => {
    data.roundIndex++;
    data.rotationIndex = (data.rotationIndex + 1) % Math.max(1, data.rotation.length);
    if (data.roundIndex >= data.total) {
      finishGame(io, state);
    } else {
      startRound(io, state);
    }
  }, RESULT_PAUSE_MS);
}

function finishGame(io: Server, state: GameState): void {
  const data = getOrInitRoom(state);
  clearTimers(data);
  const victory = data.score >= WIN_THRESHOLD;
  state.phase = victory ? 'victory' : 'defeat';
  data.showingResult = true;
  pushState(io, state, data);

  io.to(state.roomCode).emit('game-over', victory, {
    score: data.score,
    total: data.total,
  });
}

// ---------- ModeHandler ----------

const handler: ModeHandler = {
  start(io, state) {
    rooms.delete(state.roomCode);
    const data = getOrInitRoom(state);

    // Build initial rotation from current humans (host first if present).
    const humans = Object.values(state.players).filter(p => !p.isBot).map(p => p.id);
    const ordered: string[] = [];
    if (state.hostId && humans.includes(state.hostId)) ordered.push(state.hostId);
    for (const id of humans) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    data.rotation = ordered;
    data.rotationIndex = 0;
    data.captainId = ordered[0] ?? state.hostId;

    const packMovies = getPetersburgData(state.contentPacks?.petersburg).movies;
    data.pool = packMovies.length > 0 ? packMovies : MOVIES;
    data.queue = pickMovies(data.pool, TOTAL_ROUNDS, new Set());
    if (data.queue.length < TOTAL_ROUNDS) {
      while (data.queue.length < TOTAL_ROUNDS) {
        data.queue.push(data.pool[Math.floor(Math.random() * data.pool.length)]);
      }
    }

    data.roundIndex = 0;
    data.round = 0;
    data.score = 0;
    data.total = TOTAL_ROUNDS;
    data.resolved = false;
    data.showingResult = false;
    data.lastAnswer = null;
    data.lastWasCorrect = null;
    data.lastMovieTitle = null;
    data.lastReveal = null;
    data.castByPlayer = {};
    data.currentMovie = null;

    state.phase = 'answering';
    state.lastResults = null;
    state.totalFloors = TOTAL_ROUNDS;
    state.currentFloor = 1;

    startRound(io, state);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-petersburg-answer', (text: string) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'petersburg') return;
      if (state.phase !== 'answering') return;
      const data = rooms.get(state.roomCode);
      if (!data) return;
      if (data.captainId !== socket.id) return; // Only the captain answers.
      if (typeof text !== 'string') return;
      const trimmed = text.slice(0, 200);
      resolveAnswer(io, state, trimmed, false);
    });
  },

  // Screen (TV) joined mid-game: state.petersburg is the public snapshot.
  // Actor cards are personal (mode-petersburg-actor) and are NOT sent to screens.
  onScreenJoin(_io, socket, state) {
    socket.emit('game-state', state);
  },

  stop(_io, state) {
    const data = rooms.get(state.roomCode);
    if (data) clearTimers(data);
    rooms.delete(state.roomCode);
  },
};

export default handler;
