import type { Server, Socket } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import {
  MILLIONAIRE_QUESTIONS,
  PRIZE_PYRAMID,
  pickQuestion,
  toMillionaireQuestions,
  difficultyForLevel,
  type MillionaireQuestion,
} from './questions.ts';
import { getSimpleData } from '../../data/contentStore.ts';

// ---------- Mode-specific state shape ----------

interface MillionaireHints {
  fifty: boolean;
  audience: boolean;
  friend: boolean;
  swap: boolean;
}

interface AudienceData {
  /** Percent for each option index 0..3 (sums to ~100). */
  percents: [number, number, number, number];
}

interface FriendData {
  /** What the friend suggests. */
  suggestionIndex: 0 | 1 | 2 | 3;
  /** Confidence wording. */
  text: string;
}

interface MillionaireSnapshot {
  level: number;            // 1..8 — current level being played
  hintsUsed: MillionaireHints;
  // Hints currently revealed for the active question
  fiftyEliminated: number[]; // indices of options removed
  audience: AudienceData | null;
  friend: FriendData | null;
  // Active question
  question: {
    id: string;
    text: string;
    options: string[];
  } | null;
  correctIndex: number | null;     // hidden from clients (only server knows real value); we still set to -1 for client snapshot
  // Last result info
  lastAnswerIndex: number | null;
  lastWasCorrect: boolean | null;
  // Reveal-phase visuals
  revealCorrectIndex: number | null; // shown on client during 'results'
  // Final summary (when victory/defeat)
  finalSum: number;
  finalLevel: number;
  // Pyramid metadata for client display
  pyramid: number[];
  // Scratch
  usedQuestionIds: string[];
}

interface MillionaireRoomData {
  level: number;
  hints: MillionaireHints;
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  currentQuestion: MillionaireQuestion | null;
  /** Question pool from the chosen content pack. */
  pool: MillionaireQuestion[];
  used: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  resolveTimeout: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
  lastAnswerIndex: number | null;
  lastWasCorrect: boolean | null;
  finalSum: number;
  finalLevel: number;
}

const ROUND_TIME_SEC = 30;

const rooms = new Map<string, MillionaireRoomData>();

function getOrInitRoom(roomCode: string): MillionaireRoomData {
  let data = rooms.get(roomCode);
  if (!data) {
    data = {
      level: 1,
      hints: { fifty: false, audience: false, friend: false, swap: false },
      fiftyEliminated: [],
      audience: null,
      friend: null,
      currentQuestion: null,
      pool: MILLIONAIRE_QUESTIONS,
      used: new Set(),
      timer: null,
      resolveTimeout: null,
      resolved: false,
      lastAnswerIndex: null,
      lastWasCorrect: null,
      finalSum: 0,
      finalLevel: 0,
    };
    rooms.set(roomCode, data);
  }
  return data;
}

function clearTimers(data: MillionaireRoomData): void {
  if (data.timer) {
    clearInterval(data.timer);
    data.timer = null;
  }
  if (data.resolveTimeout) {
    clearTimeout(data.resolveTimeout);
    data.resolveTimeout = null;
  }
}

function buildSnapshot(state: GameState, data: MillionaireRoomData): MillionaireSnapshot {
  const q = data.currentQuestion;
  const safe = q
    ? { id: q.id, text: q.text, options: [...q.options] as string[] }
    : null;
  return {
    level: data.level,
    hintsUsed: { ...data.hints },
    fiftyEliminated: [...data.fiftyEliminated],
    audience: data.audience,
    friend: data.friend,
    question: safe,
    correctIndex: -1, // never leak the real answer
    lastAnswerIndex: data.lastAnswerIndex,
    lastWasCorrect: data.lastWasCorrect,
    revealCorrectIndex: state.phase === 'results' && q ? q.correctIndex : null,
    finalSum: data.finalSum,
    finalLevel: data.finalLevel,
    pyramid: [...PRIZE_PYRAMID],
    usedQuestionIds: [...data.used],
  };
}

function pushState(io: Server, state: GameState, data: MillionaireRoomData): void {
  (state as any).millionaire = buildSnapshot(state, data);
  // Mirror question into top-level currentQuestion so generic state listeners can render
  if (data.currentQuestion && state.phase !== 'results') {
    state.currentQuestion = {
      id: data.currentQuestion.id,
      text: data.currentQuestion.text,
      options: [...data.currentQuestion.options],
      category: 'Миллионер',
      difficulty: data.currentQuestion.difficulty,
    };
  }
  io.to(state.roomCode).emit('game-state', state);
}

// ---------- Game flow ----------

function startQuestion(io: Server, state: GameState): void {
  const data = getOrInitRoom(state.roomCode);
  const difficulty = difficultyForLevel(data.level);
  const question = pickQuestion(data.pool, difficulty, data.used);
  if (!question) {
    // No questions left — give them what they have
    finishGame(io, state, false);
    return;
  }
  data.currentQuestion = question;
  data.fiftyEliminated = [];
  data.audience = null;
  data.friend = null;
  data.lastAnswerIndex = null;
  data.lastWasCorrect = null;
  data.resolved = false;

  state.phase = 'answering';
  state.timer = ROUND_TIME_SEC;
  state.maxTimer = ROUND_TIME_SEC;
  state.currentFloor = data.level;
  state.totalFloors = PRIZE_PYRAMID.length;

  // Reset answers
  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    p.answerTime = null;
  }

  pushState(io, state, data);

  // Tick timer
  clearTimers(data);
  let remaining = ROUND_TIME_SEC;
  data.timer = setInterval(() => {
    remaining--;
    state.timer = remaining;
    io.to(state.roomCode).emit('timer-tick', remaining);
    if (remaining <= 0) {
      if (data.timer) { clearInterval(data.timer); data.timer = null; }
      // Out of time — count as wrong
      if (!data.resolved) {
        resolveAnswer(io, state, null);
      }
    }
  }, 1000);

  // Schedule a bot answer (any bot might press first; one is enough)
  const bots = Object.values(state.players).filter(p => p.isBot);
  if (bots.length > 0) {
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const delay = 4000 + Math.random() * 18000;
    setTimeout(() => {
      if (data.resolved) return;
      if (state.phase !== 'answering') return;
      // 70% chance the bot is correct
      const correct = question.correctIndex;
      const allowed = [0, 1, 2, 3].filter(i => !data.fiftyEliminated.includes(i));
      const wrong = allowed.filter(i => i !== correct);
      const ans = Math.random() < 0.7 || wrong.length === 0
        ? correct
        : wrong[Math.floor(Math.random() * wrong.length)];
      resolveAnswer(io, state, ans, bot.id);
    }, delay);
  }
}

function resolveAnswer(
  io: Server,
  state: GameState,
  answerIndex: number | null,
  byPlayerId?: string,
): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved) return;
  if (!data.currentQuestion) return;
  data.resolved = true;
  clearTimers(data);

  const q = data.currentQuestion;
  const isCorrect = answerIndex !== null && answerIndex === q.correctIndex;
  data.lastAnswerIndex = answerIndex;
  data.lastWasCorrect = isCorrect;

  // Mark the answering player's currentAnswer for UI
  if (byPlayerId && state.players[byPlayerId]) {
    state.players[byPlayerId].currentAnswer = answerIndex;
  }

  state.phase = 'results';
  pushState(io, state, data);

  // After ~3.5s show result, then advance
  data.resolveTimeout = setTimeout(() => {
    if (!isCorrect) {
      // Drop to nearest safe haven below the reached level.
      // Safe havens (issue 1.1):
      //   reachedLevel >= 10 -> PRIZE_PYRAMID[reachedLevel-1] (or last guaranteed above)
      //   reachedLevel >= 5  -> 25 000
      //   reachedLevel >= 1  -> 1 000  (first guaranteed)
      //   else               -> 0
      const reachedLevel = data.level - 1; // last cleared level
      let prize = 0;
      if (reachedLevel >= 10) {
        // Above the third safe haven — give the last cleared level prize (or pyramid cap).
        const idx = Math.min(reachedLevel - 1, PRIZE_PYRAMID.length - 1);
        prize = idx >= 0 ? PRIZE_PYRAMID[idx] : 0;
      } else if (reachedLevel >= 5) {
        prize = 25_000;
      } else if (reachedLevel >= 1) {
        prize = 1_000;
      } else {
        prize = 0;
      }
      data.finalSum = prize;
      data.finalLevel = reachedLevel;
      finishGame(io, state, false);
      return;
    }

    // Correct — check if they just won the million
    if (data.level >= PRIZE_PYRAMID.length) {
      data.finalSum = PRIZE_PYRAMID[PRIZE_PYRAMID.length - 1];
      data.finalLevel = PRIZE_PYRAMID.length;
      finishGame(io, state, true);
      return;
    }

    // Otherwise, climb the pyramid
    data.level++;
    startQuestion(io, state);
  }, 3500);
}

function finishGame(io: Server, state: GameState, victory: boolean): void {
  const data = getOrInitRoom(state.roomCode);
  clearTimers(data);
  state.phase = victory ? 'victory' : 'defeat';
  pushState(io, state, data);

  io.to(state.roomCode).emit('game-over', victory, {
    sum: data.finalSum,
    level: data.finalLevel,
  });

  // Cleanup
  rooms.delete(state.roomCode);
}

// ---------- Hint handlers ----------

function applyFifty(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  // Atomic guard (issue 1.2): claim the hint flag BEFORE any side-effects so
  // two concurrent socket events can't both pass the check.
  if (data.hints.fifty) return;
  data.hints.fifty = true;
  if (!data.currentQuestion) return;

  const correct = data.currentQuestion.correctIndex;
  const wrongs = [0, 1, 2, 3].filter(i => i !== correct);
  // Pick 2 wrong options to remove
  const shuffled = wrongs.sort(() => Math.random() - 0.5);
  data.fiftyEliminated = [shuffled[0], shuffled[1]];

  pushState(io, state, data);
}

function applyAudience(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  // Atomic guard (issue 1.2): claim the hint flag BEFORE any side-effects.
  if (data.hints.audience) return;
  data.hints.audience = true;
  if (!data.currentQuestion) return;

  const correct = data.currentQuestion.correctIndex;
  // 60-80% to correct, rest distributed among remaining (taking 50/50 elimination into account)
  const correctPct = 60 + Math.floor(Math.random() * 21); // 60..80
  const remaining = 100 - correctPct;
  const others = [0, 1, 2, 3].filter(i => i !== correct && !data.fiftyEliminated.includes(i));
  const percents: [number, number, number, number] = [0, 0, 0, 0];
  percents[correct] = correctPct;
  // Distribute remaining randomly among others
  if (others.length > 0) {
    const splits: number[] = [];
    let acc = 0;
    for (let i = 0; i < others.length - 1; i++) {
      const v = Math.floor(Math.random() * (remaining - acc));
      splits.push(v);
      acc += v;
    }
    splits.push(remaining - acc);
    others.forEach((idx, i) => {
      percents[idx] = splits[i];
    });
  }
  // Eliminated indices stay 0
  data.audience = { percents };

  pushState(io, state, data);
}

function applyFriend(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  // Atomic guard (issue 1.2): claim the hint flag BEFORE any side-effects.
  if (data.hints.friend) return;
  data.hints.friend = true;
  if (!data.currentQuestion) return;

  const correct = data.currentQuestion.correctIndex;
  const allowed = [0, 1, 2, 3].filter(i => !data.fiftyEliminated.includes(i));
  // 70% correct, 30% random (from allowed)
  let suggestion: number;
  if (Math.random() < 0.7) {
    suggestion = correct;
  } else {
    const wrong = allowed.filter(i => i !== correct);
    suggestion = wrong.length > 0
      ? wrong[Math.floor(Math.random() * wrong.length)]
      : correct;
  }
  const phrases = [
    'Я почти уверен, что это вариант',
    'Думаю, ответ —',
    'Я бы поставил на вариант',
    'Звучит точно как',
  ];
  const text = `${phrases[Math.floor(Math.random() * phrases.length)]} ${String.fromCharCode(65 + suggestion)}.`;
  data.friend = {
    suggestionIndex: suggestion as 0 | 1 | 2 | 3,
    text,
  };

  pushState(io, state, data);
}

function applySwap(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  // Atomic guard (issue 1.2/1.3): claim the hint flag BEFORE any side-effects.
  if (data.hints.swap) return;
  data.hints.swap = true;
  if (!data.currentQuestion) return;
  if (data.resolved) return;

  // Pick a new question of the same difficulty (excluding current and used).
  const difficulty = data.currentQuestion.difficulty;
  const oldId = data.currentQuestion.id;
  // Make sure the previous question is marked used so we don't roll the same.
  data.used.add(oldId);
  const replacement = pickQuestion(data.pool, difficulty, data.used);
  if (!replacement) return; // no replacement available — keep current

  data.currentQuestion = replacement;
  // Reset hint visuals tied to the previous question (50/50 indices, audience,
  // friend) so they don't leak info about the new one.
  data.fiftyEliminated = [];
  data.audience = null;
  data.friend = null;
  // Reset per-question answer markers so the bot can re-answer.
  data.lastAnswerIndex = null;
  data.lastWasCorrect = null;
  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    p.answerTime = null;
  }

  // Reschedule a bot answer for the new question.
  const bots = Object.values(state.players).filter(p => p.isBot);
  if (bots.length > 0 && state.phase === 'answering') {
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const newQ = replacement;
    const delay = 4000 + Math.random() * 14000;
    setTimeout(() => {
      const cur = rooms.get(state.roomCode);
      if (!cur || cur.resolved) return;
      if (cur.currentQuestion?.id !== newQ.id) return;
      if (state.phase !== 'answering') return;
      const correct = newQ.correctIndex;
      const allowed = [0, 1, 2, 3].filter(i => !cur.fiftyEliminated.includes(i));
      const wrong = allowed.filter(i => i !== correct);
      const ans = Math.random() < 0.7 || wrong.length === 0
        ? correct
        : wrong[Math.floor(Math.random() * wrong.length)];
      resolveAnswer(io, state, ans, bot.id);
    }, delay);
  }

  pushState(io, state, data);
}

// ---------- ModeHandler ----------

const handler: ModeHandler = {
  start(io, state) {
    rooms.delete(state.roomCode);
    const data = getOrInitRoom(state.roomCode);
    data.level = 1;
    data.hints = { fifty: false, audience: false, friend: false, swap: false };
    data.finalSum = 0;
    data.finalLevel = 0;
    data.used = new Set();
    data.pool = toMillionaireQuestions(getSimpleData('millionaire', state.contentPacks?.millionaire).questions);

    state.phase = 'answering';
    state.currentFloor = 1;
    state.totalFloors = PRIZE_PYRAMID.length;
    state.lastResults = null;

    startQuestion(io, state);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-millionaire-answer', (answerIndex: number) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'millionaire') return;
      if (state.phase !== 'answering') return;
      if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex > 3) return;
      const data = rooms.get(state.roomCode);
      if (!data) return;
      if (data.fiftyEliminated.includes(answerIndex)) return;
      resolveAnswer(io, state, answerIndex, socket.id);
    });

    socket.on('mode-millionaire-hint', (hint: 'fifty' | 'audience' | 'friend' | 'swap') => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'millionaire') return;
      if (state.phase !== 'answering') return;
      if (hint === 'fifty') applyFifty(io, state);
      else if (hint === 'audience') applyAudience(io, state);
      else if (hint === 'friend') applyFriend(io, state);
      else if (hint === 'swap') applySwap(io, state);
    });

    // Dedicated event names — also serve as atomic-claim entry points (issue 1.2/1.3).
    socket.on('mode-millionaire-hint-fifty', () => {
      const state = getState();
      if (!state || state.gameMode !== 'millionaire' || state.phase !== 'answering') return;
      applyFifty(io, state);
    });
    socket.on('mode-millionaire-hint-audience', () => {
      const state = getState();
      if (!state || state.gameMode !== 'millionaire' || state.phase !== 'answering') return;
      applyAudience(io, state);
    });
    socket.on('mode-millionaire-hint-friend', () => {
      const state = getState();
      if (!state || state.gameMode !== 'millionaire' || state.phase !== 'answering') return;
      applyFriend(io, state);
    });
    socket.on('mode-millionaire-hint-swap', () => {
      const state = getState();
      if (!state || state.gameMode !== 'millionaire' || state.phase !== 'answering') return;
      applySwap(io, state);
    });
  },

  // Screen (TV) joined mid-game: state.millionaire is mirrored by pushState.
  onScreenJoin(_io, socket, state) {
    socket.emit('game-state', state);
  },

  stop(_io, state) {
    const data = rooms.get(state.roomCode);
    if (data) clearTimers(data);
    rooms.delete(state.roomCode);
  },
};

// Re-export pyramid for client convenience (not used directly by client, but good for tests)
export { PRIZE_PYRAMID, MILLIONAIRE_QUESTIONS };

export default handler;
