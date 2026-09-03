import type { Server } from 'socket.io';
import type { GameState, Player } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { getSimpleData } from '../../data/contentStore.ts';
import { getTeamOf, teamsWithPlayers } from '../../utils/teams.ts';

/**
 * «Последний герой» (Last Man Standing) — квиз на выбывание.
 * Все живые отвечают на один вопрос. Ошибка / нет ответа = −1 сердце (сердец 2).
 * Таймер: 15 c, каждый раунд −1 с, минимум 5 c. С раунда 9 — «внезапная смерть»:
 * любая ошибка выбивает сразу. Если ошиблись ВСЕ живые — помилование, никто не страдает.
 * ffa: последний живой побеждает. teams: команда жива, пока жив хоть один её игрок.
 * coop: общий запас сердец (игроки + 2), нужно пережить 15 вопросов.
 */

const HEARTS = 2;
const START_TIME_S = 15;
const MIN_TIME_S = 5;
const SUDDEN_DEATH_FROM = 9;
const MAX_QUESTIONS = 30;
const COOP_TARGET = 15;
const RESULT_DELAY_MS = 3500;
const INTRO_DELAY_MS = 1500;

interface Q { id: string; text: string; options: string[]; correctIndex: number; }
interface AnswerInfo { optionIdx: number | null; elapsedMs: number; correct: boolean; }

interface Snapshot {
  round: number;
  timeLimit: number;
  suddenDeath: boolean;
  hearts: Record<string, number>;
  alive: string[];
  eliminated: { id: string; round: number }[];
  answered: string[];
  correctCount: Record<string, number>;
  question: { id: string; text: string; options: string[] } | null;
  questionStartMs: number;
  revealCorrectIndex: number | null;
  revealAnswers: Record<string, AnswerInfo> | null;
  lastLosers: string[];
  lastEliminated: string[];
  mercy: boolean;
  coop: { hearts: number; maxHearts: number; target: number } | null;
  teamAlive: Record<string, number> | null;
  teamScores: Record<string, number> | null;
  scores: Record<string, number>;
  winner: string | null;
  winnerTeamId: string | null;
  finished: boolean;
  victory: boolean | null;
}

interface RoomData {
  round: number;
  questions: Q[];
  current: Q | null;
  hearts: Record<string, number>;
  alive: Set<string>;
  eliminated: { id: string; round: number }[];
  correctCount: Record<string, number>;
  answers: Record<string, AnswerInfo>;
  questionStartMs: number;
  timeLimit: number;
  coopHearts: number;
  coopMax: number;
  lastLosers: string[];
  lastEliminated: string[];
  mercy: boolean;
  resolved: boolean;
  timers: ReturnType<typeof setTimeout>[];
}

const rooms = new Map<string, RoomData>();

function clearTimers(d: RoomData) { for (const t of d.timers) clearTimeout(t); d.timers = []; }
function later(d: RoomData, ms: number, fn: () => void) { d.timers.push(setTimeout(fn, ms)); }

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function isTeams(state: GameState) { return state.teamMode === 'teams'; }
function isCoop(state: GameState) { return (state.teamMode ?? 'coop') === 'coop'; }

function scoresOf(state: GameState, d: RoomData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pid of Object.keys(state.players)) {
    const alive = d.alive.has(pid);
    const elim = d.eliminated.find((e) => e.id === pid);
    out[pid] = (d.correctCount[pid] ?? 0) * 10 + (d.hearts[pid] ?? 0) * 5 + (alive ? 100 : (elim?.round ?? 0));
  }
  return out;
}

function teamAliveCounts(state: GameState, d: RoomData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of state.teams ?? []) out[t.id] = 0;
  for (const pid of d.alive) { const t = getTeamOf(state, pid); if (t) out[t.id] = (out[t.id] ?? 0) + 1; }
  return out;
}

function teamScoresOf(state: GameState, d: RoomData): Record<string, number> {
  const out: Record<string, number> = {};
  const per = scoresOf(state, d);
  for (const t of state.teams ?? []) out[t.id] = 0;
  for (const [pid, sc] of Object.entries(per)) { const t = getTeamOf(state, pid); if (t) out[t.id] = (out[t.id] ?? 0) + sc; }
  return out;
}

function snapshot(state: GameState, d: RoomData, opts: { reveal?: boolean; finished?: boolean; winner?: string | null; winnerTeamId?: string | null; victory?: boolean | null } = {}): Snapshot {
  const q = d.current;
  return {
    round: d.round,
    timeLimit: d.timeLimit,
    suddenDeath: d.round >= SUDDEN_DEATH_FROM,
    hearts: { ...d.hearts },
    alive: [...d.alive],
    eliminated: [...d.eliminated],
    answered: Object.keys(d.answers),
    correctCount: { ...d.correctCount },
    question: q ? { id: q.id, text: q.text, options: [...q.options] } : null,
    questionStartMs: d.questionStartMs,
    revealCorrectIndex: opts.reveal && q ? q.correctIndex : null,
    revealAnswers: opts.reveal ? { ...d.answers } : null,
    lastLosers: opts.reveal ? [...d.lastLosers] : [],
    lastEliminated: opts.reveal ? [...d.lastEliminated] : [],
    mercy: opts.reveal ? d.mercy : false,
    coop: isCoop(state) ? { hearts: d.coopHearts, maxHearts: d.coopMax, target: COOP_TARGET } : null,
    teamAlive: isTeams(state) ? teamAliveCounts(state, d) : null,
    teamScores: isTeams(state) ? teamScoresOf(state, d) : null,
    scores: scoresOf(state, d),
    winner: opts.winner ?? null,
    winnerTeamId: opts.winnerTeamId ?? null,
    finished: !!opts.finished,
    victory: opts.victory ?? null,
  };
}

function push(io: Server, state: GameState, d: RoomData, opts?: Parameters<typeof snapshot>[2]) {
  (state as any).lastman = snapshot(state, d, opts);
  if (d.current && state.phase === 'answering') {
    state.currentQuestion = { id: d.current.id, text: d.current.text, options: [...d.current.options], category: 'Последний герой', difficulty: 'medium' };
  }
  io.to(state.roomCode).emit('game-state', state);
}

// ---------- flow ----------

function startQuestion(io: Server, state: GameState) {
  const d = rooms.get(state.roomCode); if (!d) return;
  if (d.round >= d.questions.length || d.round >= MAX_QUESTIONS) { finish(io, state); return; }
  d.round += 1;
  d.current = d.questions[d.round - 1];
  d.answers = {};
  d.lastLosers = []; d.lastEliminated = []; d.mercy = false;
  d.resolved = false;
  d.timeLimit = Math.max(MIN_TIME_S, START_TIME_S - (d.round - 1));
  d.questionStartMs = Date.now();

  state.phase = 'answering';
  state.currentFloor = d.round;
  state.totalFloors = isCoop(state) ? COOP_TARGET : MAX_QUESTIONS;
  state.timer = d.timeLimit; state.maxTimer = d.timeLimit;
  for (const p of Object.values(state.players)) { p.currentAnswer = null; p.answerTime = null; }
  push(io, state, d);

  clearTimers(d);
  later(d, d.timeLimit * 1000, () => { if (!d.resolved) endQuestion(io, state); });

  // Bots: get worse as the game speeds up.
  const pCorrect = Math.max(0.35, 0.75 - d.round * 0.03);
  for (const bot of Object.values(state.players).filter((p) => p.isBot && d.alive.has(p.id))) {
    const delay = 1000 + Math.random() * Math.max(1500, (d.timeLimit - 2) * 1000);
    later(d, delay, () => {
      if (d.resolved || !d.current) return;
      const correct = d.current.correctIndex;
      const pick = Math.random() < pCorrect ? correct : [0, 1, 2, 3].filter((i) => i !== correct)[Math.floor(Math.random() * 3)];
      handleAnswer(io, state, bot.id, pick);
    });
  }
}

function handleAnswer(io: Server, state: GameState, pid: string, optionIdx: number) {
  const d = rooms.get(state.roomCode); if (!d || d.resolved || !d.current) return;
  if (state.phase !== 'answering') return;
  if (!d.alive.has(pid) || d.answers[pid]) return;
  if (typeof optionIdx !== 'number' || optionIdx < 0 || optionIdx > 3) return;
  const elapsedMs = Date.now() - d.questionStartMs;
  const correct = optionIdx === d.current.correctIndex;
  d.answers[pid] = { optionIdx, elapsedMs, correct };
  if (correct) d.correctCount[pid] = (d.correctCount[pid] ?? 0) + 1;
  const p = state.players[pid]; if (p) { p.currentAnswer = optionIdx; p.answerTime = elapsedMs; }
  push(io, state, d);
  if ([...d.alive].every((id) => d.answers[id])) endQuestion(io, state);
}

function endQuestion(io: Server, state: GameState) {
  const d = rooms.get(state.roomCode); if (!d || d.resolved) return;
  d.resolved = true; clearTimers(d);

  const alive = [...d.alive];
  for (const id of alive) if (!d.answers[id]) d.answers[id] = { optionIdx: null, elapsedMs: d.timeLimit * 1000, correct: false };
  const losers = alive.filter((id) => !d.answers[id].correct);
  const sudden = d.round >= SUDDEN_DEATH_FROM;
  d.mercy = losers.length === alive.length && alive.length > 1 && !isCoop(state);
  d.lastLosers = d.mercy ? [] : losers;
  d.lastEliminated = [];

  if (isCoop(state)) {
    d.coopHearts = Math.max(0, d.coopHearts - losers.length);
    d.lastLosers = losers;
  } else if (!d.mercy) {
    for (const id of losers) {
      if (sudden) d.hearts[id] = 0; else d.hearts[id] = Math.max(0, (d.hearts[id] ?? 0) - 1);
      if (d.hearts[id] <= 0) { d.alive.delete(id); d.eliminated.push({ id, round: d.round }); d.lastEliminated.push(id); const p = state.players[id]; if (p) p.isAlive = false; }
    }
  }

  state.phase = 'results';
  push(io, state, d, { reveal: true });

  later(d, RESULT_DELAY_MS, () => {
    if (isCoop(state)) {
      if (d.coopHearts <= 0) return finish(io, state, false);
      if (d.round >= COOP_TARGET) return finish(io, state, true);
    } else if (isTeams(state)) {
      const aliveTeams = Object.entries(teamAliveCounts(state, d)).filter(([, n]) => n > 0);
      if (aliveTeams.length <= 1) return finish(io, state);
    } else if (d.alive.size <= 1) {
      return finish(io, state);
    }
    startQuestion(io, state);
  });
}

function finish(io: Server, state: GameState, coopVictory?: boolean) {
  const d = rooms.get(state.roomCode); if (!d) return;
  clearTimers(d);
  const scores = scoresOf(state, d);
  let winner: string | null = null; let winnerTeamId: string | null = null; let victory = true;

  if (isCoop(state)) {
    victory = !!coopVictory;
  } else if (isTeams(state)) {
    const ts = teamScoresOf(state, d); const aliveN = teamAliveCounts(state, d);
    winnerTeamId = teamsWithPlayers(state).map((t) => t.id).sort((a, b) => (aliveN[b] - aliveN[a]) || (ts[b] - ts[a]))[0] ?? null;
  } else {
    winner = Object.keys(state.players).sort((a, b) => scores[b] - scores[a])[0] ?? null;
  }

  state.phase = victory ? 'victory' : 'defeat';
  push(io, state, d, { reveal: true, finished: true, winner, winnerTeamId, victory });
  io.to(state.roomCode).emit('game-over', victory, {
    teamMode: state.teamMode ?? 'coop',
    scores,
    teamScores: isTeams(state) ? teamScoresOf(state, d) : undefined,
    winnerPlayerId: winner ?? undefined,
    winnerTeamId: winnerTeamId ?? undefined,
    rounds: d.round,
  });
  rooms.delete(state.roomCode);
}

const handler: ModeHandler = {
  start(io, state) {
    clearTimers(rooms.get(state.roomCode) ?? { timers: [] } as any);
    const players = Object.values(state.players) as Player[];
    const pool = getSimpleData('lastman', state.contentPacks?.lastman).questions
      .map((q) => ({ id: q.id, text: q.text, options: [...q.options], correctIndex: q.correctIndex }));
    const d: RoomData = {
      round: 0, questions: shuffle(pool).slice(0, MAX_QUESTIONS), current: null,
      hearts: {}, alive: new Set(players.map((p) => p.id)), eliminated: [], correctCount: {}, answers: {},
      questionStartMs: 0, timeLimit: START_TIME_S,
      coopHearts: players.length + 2, coopMax: players.length + 2,
      lastLosers: [], lastEliminated: [], mercy: false, resolved: false, timers: [],
    };
    for (const p of players) { d.hearts[p.id] = HEARTS; d.correctCount[p.id] = 0; p.isAlive = true; }
    rooms.set(state.roomCode, d);
    state.phase = 'floor-intro';
    state.lastResults = null; state.currentFloor = 0;
    push(io, state, d);
    later(d, INTRO_DELAY_MS, () => startQuestion(io, state));
  },
  registerSocket(io, socket, getState) {
    socket.on('mode-lastman-answer', (idx: number) => {
      const state = getState(); if (!state || state.gameMode !== 'lastman') return;
      handleAnswer(io, state, socket.id, idx);
    });
  },
  onScreenJoin(_io, socket, state) { socket.emit('game-state', state); },
  stop(_io, state) { const d = rooms.get(state.roomCode); if (d) clearTimers(d); rooms.delete(state.roomCode); },
};

export default handler;
