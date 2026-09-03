import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { pickQuestions, type SpeedQuestion } from './questions.ts';

// ---------- Mode-specific state shape ----------

const TOTAL_QUESTIONS = 15;
const QUESTION_TIME_MS = 10_000;
const RESULT_DELAY_MS = 3_000;
const MAX_BONUS = 200;
const MIN_REWARD = 50;
const WRONG_PENALTY = 50;

interface PlayerAnswerInfo {
  optionIdx: number;
  elapsedMs: number;
  correct: boolean;
  delta: number;
  wasFirst: boolean;
}

interface SpeedSnapshot {
  round: number;          // 1-based current round number
  total: number;
  scores: Record<string, number>;
  question: {
    id: string;
    text: string;
    options: string[];
  } | null;
  answered: string[];     // playerIds who already answered
  questionStartMs: number;
  // Reveal during 'results' phase
  revealCorrectIndex: number | null;
  revealAnswers: Record<string, PlayerAnswerInfo> | null;
  winnerOnFirst: string | null; // who pressed first this round
  // Final
  winner: string | null;
  finished: boolean;
}

interface SpeedRoomData {
  round: number;
  questions: SpeedQuestion[];
  current: SpeedQuestion | null;
  scores: Record<string, number>;
  answered: Set<string>;
  answerInfo: Record<string, PlayerAnswerInfo>;
  questionStartMs: number;
  winnerOnFirst: string | null;
  questionTimer: ReturnType<typeof setTimeout> | null;
  resultTimer: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
  botTimers: ReturnType<typeof setTimeout>[];
}

const rooms = new Map<string, SpeedRoomData>();

function getOrInitRoom(roomCode: string): SpeedRoomData {
  let data = rooms.get(roomCode);
  if (!data) {
    data = {
      round: 0,
      questions: [],
      current: null,
      scores: {},
      answered: new Set(),
      answerInfo: {},
      questionStartMs: 0,
      winnerOnFirst: null,
      questionTimer: null,
      resultTimer: null,
      resolved: false,
      botTimers: [],
    };
    rooms.set(roomCode, data);
  }
  return data;
}

function clearTimers(data: SpeedRoomData): void {
  if (data.questionTimer) {
    clearTimeout(data.questionTimer);
    data.questionTimer = null;
  }
  if (data.resultTimer) {
    clearTimeout(data.resultTimer);
    data.resultTimer = null;
  }
  for (const t of data.botTimers) clearTimeout(t);
  data.botTimers = [];
}

function buildSnapshot(state: GameState, data: SpeedRoomData, opts?: { reveal?: boolean; finished?: boolean; winner?: string | null }): SpeedSnapshot {
  const q = data.current;
  const safe = q
    ? { id: q.id, text: q.text, options: [...q.options] as string[] }
    : null;
  return {
    round: data.round,
    total: TOTAL_QUESTIONS,
    scores: { ...data.scores },
    question: safe,
    answered: [...data.answered],
    questionStartMs: data.questionStartMs,
    revealCorrectIndex: opts?.reveal && q ? q.correctIndex : null,
    revealAnswers: opts?.reveal ? { ...data.answerInfo } : null,
    winnerOnFirst: data.winnerOnFirst,
    winner: opts?.winner ?? null,
    finished: !!opts?.finished,
  };
}

function pushState(io: Server, state: GameState, data: SpeedRoomData, opts?: { reveal?: boolean; finished?: boolean; winner?: string | null }): void {
  (state as any).speed = buildSnapshot(state, data, opts);
  // Mirror question into top-level so generic UIs work
  if (data.current && state.phase !== 'results' && state.phase !== 'victory') {
    state.currentQuestion = {
      id: data.current.id,
      text: data.current.text,
      options: [...data.current.options],
      category: data.current.category,
      difficulty: 'medium',
    };
  }
  io.to(state.roomCode).emit('game-state', state);
}

// ---------- Game flow ----------

function startQuestion(io: Server, state: GameState): void {
  const data = getOrInitRoom(state.roomCode);
  const idx = data.round; // 0-based; we'll bump round to idx+1
  if (idx >= data.questions.length || idx >= TOTAL_QUESTIONS) {
    finishGame(io, state);
    return;
  }
  data.round = idx + 1;
  data.current = data.questions[idx];
  data.answered = new Set();
  data.answerInfo = {};
  data.winnerOnFirst = null;
  data.questionStartMs = Date.now();
  data.resolved = false;

  state.phase = 'answering';
  state.currentFloor = data.round;
  state.totalFloors = TOTAL_QUESTIONS;
  state.timer = Math.ceil(QUESTION_TIME_MS / 1000);
  state.maxTimer = Math.ceil(QUESTION_TIME_MS / 1000);

  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    p.answerTime = null;
  }

  pushState(io, state, data);

  // 10s hard timeout
  clearTimers(data);
  data.questionTimer = setTimeout(() => {
    if (!data.resolved) endQuestion(io, state);
  }, QUESTION_TIME_MS);

  // Bots: random small delay, random answer
  const bots = Object.values(state.players).filter(p => p.isBot);
  for (const bot of bots) {
    const delay = 1500 + Math.random() * 6500;
    const t = setTimeout(() => {
      if (data.resolved) return;
      if (data.answered.has(bot.id)) return;
      if (state.phase !== 'answering') return;
      const correct = data.current?.correctIndex ?? 0;
      // 65% correct, otherwise random wrong
      let pick: number;
      if (Math.random() < 0.65) {
        pick = correct;
      } else {
        const others = [0, 1, 2, 3].filter(i => i !== correct);
        pick = others[Math.floor(Math.random() * others.length)];
      }
      handleAnswer(io, state, bot.id, pick);
    }, delay);
    data.botTimers.push(t);
  }
}

function handleAnswer(io: Server, state: GameState, playerId: string, optionIdx: number): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  if (data.resolved) return;
  if (!data.current) return;
  if (state.phase !== 'answering') return;
  // ATOMIC: each player answers at most once per question
  if (data.answered.has(playerId)) return;
  if (!state.players[playerId]) return;
  if (typeof optionIdx !== 'number' || optionIdx < 0 || optionIdx > 3) return;

  const elapsedMs = Date.now() - data.questionStartMs;
  const wasFirst = data.answered.size === 0;
  const correct = optionIdx === data.current.correctIndex;

  let delta = 0;
  if (correct) {
    if (wasFirst) {
      // Speed bonus: max(50, 200 - elapsed/10)
      delta = Math.max(MIN_REWARD, Math.round(MAX_BONUS - elapsedMs / 10));
    } else {
      // Late correct answer: flat min reward, no speed bonus
      delta = MIN_REWARD;
    }
  } else {
    delta = -WRONG_PENALTY;
  }

  data.scores[playerId] = (data.scores[playerId] ?? 0) + delta;
  data.answered.add(playerId);
  data.answerInfo[playerId] = {
    optionIdx,
    elapsedMs,
    correct,
    delta,
    wasFirst,
  };
  if (wasFirst) {
    data.winnerOnFirst = playerId;
  }
  // Mirror to player.currentAnswer for any generic UI
  state.players[playerId].currentAnswer = optionIdx;
  state.players[playerId].answerTime = elapsedMs;

  pushState(io, state, data);

  // End condition: first player got it right (round over) OR everyone has answered
  const allAnswered = Object.keys(state.players).every(id => data.answered.has(id));
  const firstWasCorrect = wasFirst && correct;

  if (firstWasCorrect || allAnswered) {
    endQuestion(io, state);
  }
  // else: first player was wrong; remaining players continue answering until 10s or all answered
}

function endQuestion(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved) return;
  data.resolved = true;
  clearTimers(data);

  state.phase = 'results';
  pushState(io, state, data, { reveal: true });

  data.resultTimer = setTimeout(() => {
    if (data.round >= TOTAL_QUESTIONS) {
      finishGame(io, state);
    } else {
      startQuestion(io, state);
    }
  }, RESULT_DELAY_MS);
}

function finishGame(io: Server, state: GameState): void {
  const data = getOrInitRoom(state.roomCode);
  clearTimers(data);

  // Determine winner: highest score (negatives allowed)
  let winnerId: string | null = null;
  let bestScore = -Infinity;
  for (const [pid, score] of Object.entries(data.scores)) {
    if (score > bestScore) {
      bestScore = score;
      winnerId = pid;
    }
  }

  state.phase = 'victory';
  pushState(io, state, data, { reveal: true, finished: true, winner: winnerId });

  io.to(state.roomCode).emit('game-over', true, {
    scores: { ...data.scores },
    winner: winnerId,
  });

  rooms.delete(state.roomCode);
}

// ---------- ModeHandler ----------

const handler: ModeHandler = {
  start(io, state) {
    rooms.delete(state.roomCode);
    const data = getOrInitRoom(state.roomCode);
    data.round = 0;
    data.questions = pickQuestions(TOTAL_QUESTIONS);
    data.scores = {};
    for (const pid of Object.keys(state.players)) {
      data.scores[pid] = 0;
    }

    state.phase = 'answering';
    state.lastResults = null;
    state.currentFloor = 0;
    state.totalFloors = TOTAL_QUESTIONS;

    startQuestion(io, state);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-speed-answer', (payload: { optionIdx: number } | number) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'speed') return;
      const optionIdx = typeof payload === 'number' ? payload : payload?.optionIdx;
      if (typeof optionIdx !== 'number') return;
      handleAnswer(io, state, socket.id, optionIdx);
    });
  },

  stop(_io, state) {
    const data = rooms.get(state.roomCode);
    if (data) clearTimers(data);
    rooms.delete(state.roomCode);
  },
};

export default handler;
