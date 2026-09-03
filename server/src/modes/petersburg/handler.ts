import type { Server } from 'socket.io';
import type { GameState, GameOverStats, Player, TeamMode } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import {
  MOVIES,
  pickMovies,
  answerMatches,
  type Movie,
  type CastMember,
} from './movies.ts';
import { getPetersburgData } from '../../data/contentStore.ts';
import { teamsWithPlayers, playersOfTeam } from '../../utils/teams.ts';

// «Угадай фильм» (gameMode 'petersburg'). Three formats (state.teamMode):
//  - coop  — everyone gets a private actor from one movie, the captain names the movie.
//  - teams — the same, but the cast is dealt inside every team; each team has its
//            own captain (rotation inside the team) and answers independently.
//  - ffa   — actors are revealed publicly one by one (every REVEAL_INTERVAL_SEC),
//            every player answers on their own; earlier answer = more points.

// ---------- Mode-specific state shape ----------

interface RevealEntry {
  playerId: string;
  playerName: string;
  teamId?: string;
  actorName: string;
  imageUrl: string;
}

interface CastCard {
  actorName: string;
  imageUrl: string;
}

interface FfaAnswer {
  correct: boolean;
  gaveUp: boolean;
  points: number;
  answer: string;
  /** How many actors were open when the player answered. */
  openedAt: number;
}

interface TeamRound {
  captainId: string;
  answered: boolean;
  answer: string;
  correct: boolean | null;
  timedOut: boolean;
}

interface PetersburgRoomData {
  mode: TeamMode;
  /** All non-bot players in a stable order — used for captain rotation (coop). */
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
  /** coop score. */
  score: number;
  captainId: string;
  currentMovie: Movie | null;
  /** Per-player actor assignment (coop/teams; clients receive their own privately). */
  castByPlayer: Record<string, CastMember[]>;
  /** Has the round been resolved (answered or time-out)? */
  resolved: boolean;
  lastAnswer: string | null;
  lastWasCorrect: boolean | null;
  lastMovieTitle: string | null;
  /** Cast lineup revealed in the result phase (coop/teams: who had whom). */
  lastReveal: RevealEntry[] | null;
  /** Actors of the movie revealed with names (ffa). */
  lastCast: CastCard[] | null;
  timer: ReturnType<typeof setInterval> | null;
  resolveTimeout: ReturnType<typeof setTimeout> | null;
  showingResult: boolean;
  // ---- ffa ----
  revealOrder: CastMember[];
  revealedCount: number;
  scores: Record<string, number>;
  ffaAnswers: Record<string, FfaAnswer>;
  // ---- teams ----
  teamRotation: Record<string, string[]>;
  teamRotationIndex: Record<string, number>;
  teamScores: Record<string, number>;
  teamRounds: Record<string, TeamRound>;
}

const ROUND_TIME_SEC = 90;
const FFA_ROUND_TIME_SEC = 45;
const REVEAL_INTERVAL_SEC = 6;
const MAX_REVEAL = 5;
const FFA_MAX_POINTS = 5;
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
      mode: state.teamMode ?? 'coop',
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
      lastCast: null,
      timer: null,
      resolveTimeout: null,
      showingResult: false,
      revealOrder: [],
      revealedCount: 0,
      scores: {},
      ffaAnswers: {},
      teamRotation: {},
      teamRotationIndex: {},
      teamScores: {},
      teamRounds: {},
    };
    rooms.set(state.roomCode, data);
  }
  return data;
}

function humanIds(state: GameState): string[] {
  return Object.values(state.players).filter(p => !p.isBot).map(p => p.id);
}

function humansOfTeam(state: GameState, teamId: string): Player[] {
  return playersOfTeam(state, teamId).filter(p => !p.isBot);
}

/** Teams that have at least one human player (bots only observe). */
function activeTeamIds(state: GameState): string[] {
  return teamsWithPlayers(state)
    .filter(t => humansOfTeam(state, t.id).length > 0)
    .map(t => t.id);
}

function ffaPoints(openedCount: number): number {
  return Math.max(1, FFA_MAX_POINTS - Math.max(1, openedCount) + 1);
}

// Public snapshot — does NOT leak per-player actor assignments to other players
// (coop/teams). Each client only knows that someone was dealt an actor (via
// `dealt` IDs); their own actor is delivered privately via `mode-petersburg-actor`.
// In ffa the revealed actors are public (without names until the result).
function buildSnapshot(data: PetersburgRoomData) {
  const dealt = Object.keys(data.castByPlayer);
  const showing = data.showingResult;
  const answers: Record<string, Omit<FfaAnswer, 'answer'> & { answer: string | null }> = {};
  for (const [pid, a] of Object.entries(data.ffaAnswers)) {
    answers[pid] = { ...a, answer: showing ? a.answer : null };
  }
  const teamRounds: Record<string, Omit<TeamRound, 'answer'> & { answer: string | null }> = {};
  for (const [tid, r] of Object.entries(data.teamRounds)) {
    teamRounds[tid] = { ...r, answer: showing ? r.answer : null };
  }
  return {
    mode: data.mode,
    round: data.round,
    total: data.total,
    score: data.score,
    captainId: data.captainId,
    dealt,
    showingResult: showing,
    lastAnswer: data.lastAnswer,
    lastWasCorrect: data.lastWasCorrect,
    lastMovieTitle: data.lastMovieTitle,
    lastReveal: data.lastReveal,
    lastCast: data.lastCast,
    // ffa
    revealed: data.mode === 'ffa'
      ? data.revealOrder.slice(0, data.revealedCount).map(m => ({ imageUrl: m.imageUrl }))
      : [],
    revealTotal: data.mode === 'ffa' ? data.revealOrder.length : 0,
    nextPoints: ffaPoints(data.revealedCount),
    scores: data.scores,
    answers,
    // teams
    teamScores: data.teamScores,
    teamRounds,
  };
}

function pushState(io: Server, state: GameState, data: PetersburgRoomData): void {
  (state as any).petersburg = buildSnapshot(data);
  state.captainId = data.mode === 'coop' ? data.captainId : undefined;
  state.currentFloor = Math.max(1, data.round);
  state.totalFloors = data.total;
  io.to(state.roomCode).emit('game-state', state);
}

function shuffledIndices(n: number): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Deal actors to a group of players. Shuffled cast indices so the first N
 * players get distinct actors when possible. If players > cast.length, the
 * assignment cycles — duplicates are a feature, not a bug (Andrei explicitly
 * asked for it). A lone player gets two actors so there is something to work with.
 */
function dealActorsToPlayers(movie: Movie, playerIds: string[]): Record<string, CastMember[]> {
  const indices = shuffledIndices(movie.cast.length);
  const out: Record<string, CastMember[]> = {};
  if (indices.length === 0) return out;
  if (playerIds.length === 1 && indices.length >= 2) {
    out[playerIds[0]] = [movie.cast[indices[0]], movie.cast[indices[1]]];
    return out;
  }
  playerIds.forEach((pid, idx) => {
    out[pid] = [movie.cast[indices[idx % indices.length]]];
  });
  return out;
}

function sendPrivateActors(io: Server, data: PetersburgRoomData, isCaptain: (pid: string) => boolean): void {
  // Private per-player actor reveal — only image URLs are sent. The actors'
  // names are intentionally withheld so the player has to recognize the face.
  for (const [pid, members] of Object.entries(data.castByPlayer)) {
    io.to(pid).emit('mode-petersburg-actor', {
      imageUrl: members[0]?.imageUrl ?? '',
      imageUrls: members.map(m => m.imageUrl),
      round: data.round,
      total: data.total,
      isCaptain: isCaptain(pid),
    });
  }
}

function startTicker(io: Server, state: GameState, data: PetersburgRoomData, seconds: number, onTick?: (remaining: number) => void): void {
  clearTimers(data);
  state.timer = seconds;
  state.maxTimer = seconds;
  let remaining = seconds;
  data.timer = setInterval(() => {
    remaining--;
    state.timer = remaining;
    io.to(state.roomCode).emit('timer-tick', remaining);
    if (remaining <= 0) {
      if (data.timer) { clearInterval(data.timer); data.timer = null; }
      if (!data.resolved) resolveRound(io, state, /*timedOut*/ true);
      return;
    }
    onTick?.(remaining);
  }, 1000);
}

function resetRoundFields(data: PetersburgRoomData): void {
  data.resolved = false;
  data.showingResult = false;
  data.lastAnswer = null;
  data.lastWasCorrect = null;
  data.lastMovieTitle = null;
  data.lastReveal = null;
  data.lastCast = null;
  data.castByPlayer = {};
  data.revealOrder = [];
  data.revealedCount = 0;
  data.ffaAnswers = {};
  data.teamRounds = {};
}

function startRound(io: Server, state: GameState): void {
  const data = getOrInitRoom(state);
  if (data.roundIndex >= data.queue.length || data.roundIndex >= data.total) {
    finishGame(io, state);
    return;
  }

  const humans = humanIds(state);
  if (humans.length === 0) {
    finishGame(io, state);
    return;
  }

  data.round = data.roundIndex + 1;
  data.currentMovie = data.queue[data.roundIndex];
  resetRoundFields(data);
  const movie = data.currentMovie;

  state.phase = 'answering';

  if (data.mode === 'ffa') {
    for (const id of humans) data.scores[id] ??= 0;
    data.revealOrder = shuffledIndices(movie.cast.length)
      .slice(0, MAX_REVEAL)
      .map(i => movie.cast[i]);
    data.revealedCount = Math.min(1, data.revealOrder.length);
    data.captainId = '';
    startTicker(io, state, data, FFA_ROUND_TIME_SEC, (remaining) => {
      const elapsed = FFA_ROUND_TIME_SEC - remaining;
      if (elapsed % REVEAL_INTERVAL_SEC === 0 && data.revealedCount < data.revealOrder.length) {
        data.revealedCount++;
        pushState(io, state, data);
      }
    });
    pushState(io, state, data);
    return;
  }

  if (data.mode === 'teams') {
    const teamIds = activeTeamIds(state);
    if (teamIds.length === 0) {
      finishGame(io, state);
      return;
    }
    for (const tid of teamIds) {
      data.teamScores[tid] ??= 0;
      // Refresh the team's rotation, keeping existing order and appending newcomers.
      const members = humansOfTeam(state, tid).map(p => p.id);
      const rot = (data.teamRotation[tid] ?? []).filter(id => members.includes(id));
      for (const id of members) if (!rot.includes(id)) rot.push(id);
      data.teamRotation[tid] = rot;
      const idx = (data.teamRotationIndex[tid] ?? 0) % rot.length;
      data.teamRotationIndex[tid] = idx;
      data.teamRounds[tid] = { captainId: rot[idx], answered: false, answer: '', correct: null, timedOut: false };
      Object.assign(data.castByPlayer, dealActorsToPlayers(movie, members));
    }
    data.captainId = '';
    startTicker(io, state, data, ROUND_TIME_SEC);
    pushState(io, state, data);
    sendPrivateActors(io, data, (pid) => Object.values(data.teamRounds).some(r => r.captainId === pid));
    return;
  }

  // ---- coop ----
  // Refresh rotation: include current human players in their existing order,
  // appending newcomers at the end so disconnects don't desync the index.
  data.rotation = data.rotation.filter(id => humans.includes(id));
  for (const id of humans) {
    if (!data.rotation.includes(id)) data.rotation.push(id);
  }
  data.rotationIndex = data.rotationIndex % data.rotation.length;
  data.captainId = data.rotation[data.rotationIndex];

  // Deal actors to ALL humans (captain included). Bots are silent observers.
  data.castByPlayer = dealActorsToPlayers(movie, humans);

  startTicker(io, state, data, ROUND_TIME_SEC);
  pushState(io, state, data);
  sendPrivateActors(io, data, (pid) => pid === data.captainId);
}

function buildReveal(state: GameState, data: PetersburgRoomData): RevealEntry[] {
  const reveal: RevealEntry[] = [];
  for (const [pid, members] of Object.entries(data.castByPlayer)) {
    for (const m of members) {
      reveal.push({
        playerId: pid,
        playerName: state.players[pid]?.name ?? '???',
        teamId: state.players[pid]?.teamId,
        actorName: m.name,
        imageUrl: m.imageUrl,
      });
    }
  }
  return reveal;
}

/** Ends the round (any format): reveals the movie and schedules the next round. */
function resolveRound(io: Server, state: GameState, timedOut: boolean): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved || !data.currentMovie) return;
  data.resolved = true;
  clearTimers(data);

  const movie = data.currentMovie;
  data.lastMovieTitle = movie.title;
  data.showingResult = true;

  if (data.mode === 'ffa') {
    data.lastCast = data.revealOrder.map(m => ({ actorName: m.name, imageUrl: m.imageUrl }));
    data.lastWasCorrect = Object.values(data.ffaAnswers).some(a => a.correct);
  } else if (data.mode === 'teams') {
    for (const r of Object.values(data.teamRounds)) {
      if (!r.answered) { r.answered = true; r.timedOut = true; r.correct = false; }
    }
    data.lastReveal = buildReveal(state, data);
    data.lastWasCorrect = Object.values(data.teamRounds).some(r => r.correct);
  } else {
    if (timedOut) { data.lastAnswer = ''; data.lastWasCorrect = false; }
    data.lastReveal = buildReveal(state, data);
  }

  state.phase = 'results';
  pushState(io, state, data);

  data.resolveTimeout = setTimeout(() => {
    data.roundIndex++;
    data.rotationIndex = (data.rotationIndex + 1) % Math.max(1, data.rotation.length);
    for (const tid of Object.keys(data.teamRotationIndex)) {
      data.teamRotationIndex[tid] = (data.teamRotationIndex[tid] + 1) % Math.max(1, data.teamRotation[tid]?.length ?? 1);
    }
    if (data.roundIndex >= data.total) {
      finishGame(io, state);
    } else {
      startRound(io, state);
    }
  }, RESULT_PAUSE_MS);
}

/** coop: the captain's answer resolves the round. */
function coopAnswer(io: Server, state: GameState, answerText: string): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved || !data.currentMovie) return;
  const isCorrect = answerMatches(answerText, data.currentMovie);
  if (isCorrect) data.score++;
  data.lastAnswer = answerText;
  data.lastWasCorrect = isCorrect;
  resolveRound(io, state, false);
}

/** ffa: personal answer (or give-up) locks the player; the round ends when everyone is locked. */
function ffaAnswer(io: Server, state: GameState, playerId: string, answerText: string, gaveUp: boolean): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved || !data.currentMovie) return;
  if (data.ffaAnswers[playerId]) return;
  if (state.players[playerId]?.isBot) return;
  const correct = !gaveUp && answerMatches(answerText, data.currentMovie);
  const points = correct ? ffaPoints(data.revealedCount) : 0;
  data.ffaAnswers[playerId] = { correct, gaveUp, points, answer: gaveUp ? '' : answerText, openedAt: data.revealedCount };
  data.scores[playerId] = (data.scores[playerId] ?? 0) + points;

  const pending = humanIds(state).filter(id => !data.ffaAnswers[id]);
  if (pending.length === 0) {
    resolveRound(io, state, false);
  } else {
    pushState(io, state, data);
  }
}

/** teams: the team captain's answer locks the team; the round ends when all teams are locked. */
function teamAnswer(io: Server, state: GameState, playerId: string, answerText: string): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved || !data.currentMovie) return;
  const teamId = state.players[playerId]?.teamId;
  if (!teamId) return;
  const r = data.teamRounds[teamId];
  if (!r || r.answered) return;
  // Only the captain answers; if the captain has left, any teammate may.
  if (r.captainId !== playerId && state.players[r.captainId]) return;
  r.answered = true;
  r.answer = answerText;
  r.correct = answerMatches(answerText, data.currentMovie);
  if (r.correct) data.teamScores[teamId] = (data.teamScores[teamId] ?? 0) + 1;

  const pending = Object.values(data.teamRounds).filter(x => !x.answered);
  if (pending.length === 0) {
    resolveRound(io, state, false);
  } else {
    pushState(io, state, data);
  }
}

function finishGame(io: Server, state: GameState): void {
  const data = getOrInitRoom(state);
  clearTimers(data);
  data.resolved = true;
  data.showingResult = true;

  let victory: boolean;
  const stats: GameOverStats = { teamMode: data.mode, total: data.total };
  if (data.mode === 'ffa') {
    victory = true;
    stats.scores = { ...data.scores };
    let best: string | undefined;
    for (const [pid, s] of Object.entries(data.scores)) {
      if (best === undefined || s > (data.scores[best] ?? 0)) best = pid;
    }
    stats.winnerPlayerId = best;
  } else if (data.mode === 'teams') {
    victory = true;
    stats.teamScores = { ...data.teamScores };
    let best: string | undefined;
    for (const [tid, s] of Object.entries(data.teamScores)) {
      if (best === undefined || s > (data.teamScores[best] ?? 0)) best = tid;
    }
    stats.winnerTeamId = best;
  } else {
    victory = data.score >= WIN_THRESHOLD;
    stats.score = data.score;
  }

  state.phase = victory ? 'victory' : 'defeat';
  pushState(io, state, data);
  io.to(state.roomCode).emit('game-over', victory, stats);
}

// ---------- ModeHandler ----------

const handler: ModeHandler = {
  start(io, state) {
    rooms.delete(state.roomCode);
    const data = getOrInitRoom(state);
    data.mode = state.teamMode ?? 'coop';

    // Build initial rotation from current humans (host first if present).
    const humans = humanIds(state);
    const ordered: string[] = [];
    if (state.hostId && humans.includes(state.hostId)) ordered.push(state.hostId);
    for (const id of humans) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    data.rotation = ordered;
    data.rotationIndex = 0;
    data.captainId = ordered[0] ?? state.hostId;

    // Team rotations: host first inside their team, then join order.
    data.teamRotation = {};
    data.teamRotationIndex = {};
    data.teamScores = {};
    if (data.mode === 'teams') {
      for (const tid of activeTeamIds(state)) {
        const members = humansOfTeam(state, tid).map(p => p.id);
        data.teamRotation[tid] = members.includes(state.hostId)
          ? [state.hostId, ...members.filter(id => id !== state.hostId)]
          : members;
        data.teamRotationIndex[tid] = 0;
        data.teamScores[tid] = 0;
      }
    }
    data.scores = {};
    if (data.mode === 'ffa') for (const id of humans) data.scores[id] = 0;

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
    resetRoundFields(data);
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
      if (typeof text !== 'string') return;
      const trimmed = text.slice(0, 200).trim();
      if (!trimmed) return;
      if (data.mode === 'ffa') {
        ffaAnswer(io, state, socket.id, trimmed, false);
      } else if (data.mode === 'teams') {
        teamAnswer(io, state, socket.id, trimmed);
      } else {
        if (data.captainId !== socket.id) return; // Only the captain answers.
        coopAnswer(io, state, trimmed);
      }
    });

    // ffa only: the player gives up on this round (0 points, unlocks the round end).
    socket.on('mode-petersburg-giveup', () => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'petersburg') return;
      if (state.phase !== 'answering') return;
      const data = rooms.get(state.roomCode);
      if (!data || data.mode !== 'ffa') return;
      ffaAnswer(io, state, socket.id, '', true);
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
