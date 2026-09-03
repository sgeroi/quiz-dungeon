import type { Server } from 'socket.io';
import type { GameState, TeamMode } from '../../../../shared/types.ts';
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
import { teamsWithPlayers } from '../../utils/teams.ts';

// ---------- Mode-specific state shape ----------
//
// Formats (state.teamMode, see docs/TEAMS.md):
//   coop  — one "contestant" ('all'): a single pyramid, the first answer of any
//           player is the party's answer, hints are shared (incl. swap).
//   ffa   — a contestant per player: everybody plays the same question of the
//           current level, each with own answer / hints (50:50, audience, friend)
//           and own safe-haven sum. Losers keep watching.
//   teams — a contestant per team: team answer = majority of members' votes
//           (tie → the option that was voted first), hints per team.
// All contestants that are still playing always share the same level, so the
// room has a single current question.

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

type ContestantStatus = 'playing' | 'out' | 'won';

/** Client-facing view of one pyramid (player / team / whole party). */
interface ContestantView {
  id: string;
  status: ContestantStatus;
  hintsUsed: MillionaireHints;
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  /** Players of this contestant who already answered this round. */
  answeredIds: string[];
  /** Votes of members (teams). Present in every phase — teammates see each other. */
  votes: Record<string, number>;
  /** Resolved answer of this round — only during 'results' (null = no answer / not yet). */
  answerIndex: number | null;
  lastWasCorrect: boolean | null;
  /** Guaranteed / won sum so far. */
  sum: number;
  /** Level at which the contestant stopped (0 while playing). */
  finalLevel: number;
}

interface MillionaireSnapshot {
  teamMode: TeamMode;
  level: number;            // 1..8 — current level being played (shared by all who still play)
  // Backward-compatible "primary" fields — the coop contestant; null-ish in ffa/teams.
  hintsUsed: MillionaireHints;
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  question: {
    id: string;
    text: string;
    options: string[];
  } | null;
  correctIndex: number | null;     // always -1 for clients
  lastAnswerIndex: number | null;
  lastWasCorrect: boolean | null;
  revealCorrectIndex: number | null; // shown on client during 'results'
  finalSum: number;
  finalLevel: number;
  pyramid: number[];
  usedQuestionIds: string[];
  // Per-format
  contestants: Record<string, ContestantView>; // key: 'all' | playerId | teamId
  scores?: Record<string, number>;       // ffa: playerId -> sum
  teamScores?: Record<string, number>;   // teams: teamId -> sum
  /** Contestants still in the game. */
  playingCount: number;
}

interface Contestant {
  id: string;
  status: ContestantStatus;
  hints: MillionaireHints;
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  votes: Record<string, { index: number; at: number }>;
  /** Decided answer for the current round (null = not decided yet). */
  answerIndex: number | null;
  decided: boolean;
  lastWasCorrect: boolean | null;
  finalSum: number;
  finalLevel: number;
}

interface MillionaireRoomData {
  mode: TeamMode;
  level: number;
  contestants: Record<string, Contestant>;
  currentQuestion: MillionaireQuestion | null;
  /** Question pool from the chosen content pack. */
  pool: MillionaireQuestion[];
  used: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  resolveTimeout: ReturnType<typeof setTimeout> | null;
  botTimeouts: ReturnType<typeof setTimeout>[];
  resolved: boolean;
}

const ROUND_TIME_SEC = 30;
const COOP_ID = 'all';

const rooms = new Map<string, MillionaireRoomData>();

function freshHints(): MillionaireHints {
  return { fifty: false, audience: false, friend: false, swap: false };
}

function makeContestant(id: string): Contestant {
  return {
    id,
    status: 'playing',
    hints: freshHints(),
    fiftyEliminated: [],
    audience: null,
    friend: null,
    votes: {},
    answerIndex: null,
    decided: false,
    lastWasCorrect: null,
    finalSum: 0,
    finalLevel: 0,
  };
}

function initRoom(state: GameState): MillionaireRoomData {
  const mode: TeamMode = state.teamMode ?? 'coop';
  const contestants: Record<string, Contestant> = {};
  if (mode === 'ffa') {
    for (const p of Object.values(state.players)) contestants[p.id] = makeContestant(p.id);
  } else if (mode === 'teams') {
    for (const t of teamsWithPlayers(state)) contestants[t.id] = makeContestant(t.id);
  } else {
    contestants[COOP_ID] = makeContestant(COOP_ID);
  }
  const data: MillionaireRoomData = {
    mode,
    level: 1,
    contestants,
    currentQuestion: null,
    pool: MILLIONAIRE_QUESTIONS,
    used: new Set(),
    timer: null,
    resolveTimeout: null,
    botTimeouts: [],
    resolved: false,
  };
  rooms.set(state.roomCode, data);
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
  for (const t of data.botTimeouts) clearTimeout(t);
  data.botTimeouts = [];
}

// ---------- Contestant helpers ----------

/** Contestant the player acts for (own / team / party). */
function contestantOf(data: MillionaireRoomData, state: GameState, playerId: string): Contestant | undefined {
  if (data.mode === 'ffa') return data.contestants[playerId];
  if (data.mode === 'teams') {
    const teamId = state.players[playerId]?.teamId;
    return teamId ? data.contestants[teamId] : undefined;
  }
  return data.contestants[COOP_ID];
}

/** Players belonging to a contestant (live from state, so disconnects are respected). */
function membersOf(data: MillionaireRoomData, state: GameState, c: Contestant): string[] {
  const players = Object.values(state.players);
  if (data.mode === 'ffa') return state.players[c.id] ? [c.id] : [];
  if (data.mode === 'teams') return players.filter((p) => p.teamId === c.id).map((p) => p.id);
  return players.map((p) => p.id);
}

function playing(data: MillionaireRoomData): Contestant[] {
  return Object.values(data.contestants).filter((c) => c.status === 'playing');
}

/** Sum guaranteed by the rules when a contestant fails after clearing `reachedLevel` levels. */
function safeSum(reachedLevel: number): number {
  if (reachedLevel >= 10) {
    const idx = Math.min(reachedLevel - 1, PRIZE_PYRAMID.length - 1);
    return idx >= 0 ? PRIZE_PYRAMID[idx] : 0;
  }
  if (reachedLevel >= 5) return 25_000;
  if (reachedLevel >= 1) return 1_000;
  return 0;
}

/** Current sum of a contestant: final one when finished, otherwise the prize of the last cleared level. */
function sumOf(data: MillionaireRoomData, c: Contestant): number {
  if (c.status !== 'playing') return c.finalSum;
  const cleared = data.level - 1;
  return cleared > 0 ? PRIZE_PYRAMID[Math.min(cleared, PRIZE_PYRAMID.length) - 1] : 0;
}

/** Majority of votes; ties broken by the option voted first. null when no votes. */
function majorityVote(votes: Record<string, { index: number; at: number }>): number | null {
  const entries = Object.values(votes);
  if (entries.length === 0) return null;
  const count = new Map<number, { n: number; first: number }>();
  for (const v of entries) {
    const cur = count.get(v.index);
    if (cur) {
      cur.n++;
      cur.first = Math.min(cur.first, v.at);
    } else {
      count.set(v.index, { n: 1, first: v.at });
    }
  }
  let best: number | null = null;
  let bestN = -1;
  let bestFirst = Infinity;
  for (const [idx, { n, first }] of count) {
    if (n > bestN || (n === bestN && first < bestFirst)) {
      best = idx;
      bestN = n;
      bestFirst = first;
    }
  }
  return best;
}

// ---------- Snapshot ----------

function viewOf(data: MillionaireRoomData, state: GameState, c: Contestant): ContestantView {
  const votes: Record<string, number> = {};
  for (const [pid, v] of Object.entries(c.votes)) votes[pid] = v.index;
  return {
    id: c.id,
    status: c.status,
    hintsUsed: { ...c.hints },
    fiftyEliminated: [...c.fiftyEliminated],
    audience: c.audience,
    friend: c.friend,
    answeredIds: Object.keys(c.votes),
    votes,
    answerIndex: state.phase === 'answering' ? null : c.answerIndex,
    lastWasCorrect: c.lastWasCorrect,
    sum: sumOf(data, c),
    finalLevel: c.finalLevel,
  };
}

function buildSnapshot(state: GameState, data: MillionaireRoomData): MillionaireSnapshot {
  const q = data.currentQuestion;
  const safe = q
    ? { id: q.id, text: q.text, options: [...q.options] as string[] }
    : null;
  const contestants: Record<string, ContestantView> = {};
  for (const c of Object.values(data.contestants)) contestants[c.id] = viewOf(data, state, c);

  const primary = data.mode === 'coop' ? data.contestants[COOP_ID] : null;
  const snap: MillionaireSnapshot = {
    teamMode: data.mode,
    level: data.level,
    hintsUsed: primary ? { ...primary.hints } : freshHints(),
    fiftyEliminated: primary ? [...primary.fiftyEliminated] : [],
    audience: primary?.audience ?? null,
    friend: primary?.friend ?? null,
    question: safe,
    correctIndex: -1, // never leak the real answer
    lastAnswerIndex: primary ? (state.phase === 'answering' ? null : primary.answerIndex) : null,
    lastWasCorrect: primary?.lastWasCorrect ?? null,
    revealCorrectIndex: state.phase !== 'answering' && q ? q.correctIndex : null,
    finalSum: primary ? sumOf(data, primary) : 0,
    finalLevel: primary?.finalLevel ?? 0,
    pyramid: [...PRIZE_PYRAMID],
    usedQuestionIds: [...data.used],
    contestants,
    playingCount: playing(data).length,
  };
  if (data.mode === 'ffa') {
    snap.scores = {};
    for (const c of Object.values(data.contestants)) snap.scores[c.id] = sumOf(data, c);
  } else if (data.mode === 'teams') {
    snap.teamScores = {};
    for (const c of Object.values(data.contestants)) snap.teamScores[c.id] = sumOf(data, c);
  }
  return snap;
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

function scheduleBots(io: Server, state: GameState, data: MillionaireRoomData): void {
  const question = data.currentQuestion;
  if (!question) return;
  let bots = Object.values(state.players).filter((p) => p.isBot);
  // coop: a single bot answering for the party is enough (first answer decides)
  if (data.mode === 'coop' && bots.length > 0) bots = [bots[Math.floor(Math.random() * bots.length)]];
  for (const bot of bots) {
    const delay = 4000 + Math.random() * 18000;
    const t = setTimeout(() => {
      if (rooms.get(state.roomCode) !== data) return;
      if (data.resolved || state.phase !== 'answering') return;
      if (data.currentQuestion?.id !== question.id) return;
      const c = contestantOf(data, state, bot.id);
      if (!c || c.status !== 'playing' || c.decided) return;
      const correct = question.correctIndex;
      const allowed = [0, 1, 2, 3].filter((i) => !c.fiftyEliminated.includes(i));
      const wrong = allowed.filter((i) => i !== correct);
      const ans = Math.random() < 0.7 || wrong.length === 0
        ? correct
        : wrong[Math.floor(Math.random() * wrong.length)];
      submitAnswer(io, state, bot.id, ans);
    }, delay);
    data.botTimeouts.push(t);
  }
}

function startQuestion(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  const difficulty = difficultyForLevel(data.level);
  const question = pickQuestion(data.pool, difficulty, data.used);
  if (!question) {
    // No questions left — everybody keeps what they have
    finishGame(io, state);
    return;
  }
  data.currentQuestion = question;
  data.resolved = false;
  for (const c of Object.values(data.contestants)) {
    c.fiftyEliminated = [];
    c.audience = null;
    c.friend = null;
    c.votes = {};
    c.answerIndex = null;
    c.decided = c.status !== 'playing';
    c.lastWasCorrect = null;
  }

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
      // Out of time — undecided contestants get whatever votes they have (teams) or nothing
      if (!data.resolved) resolveRound(io, state);
    }
  }, 1000);

  scheduleBots(io, state, data);
}

/** A player picks an option. Decides the contestant's answer according to the format. */
function submitAnswer(io: Server, state: GameState, playerId: string, answerIndex: number): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved || !data.currentQuestion) return;
  if (state.phase !== 'answering') return;
  const c = contestantOf(data, state, playerId);
  if (!c || c.status !== 'playing' || c.decided) return;
  if (c.fiftyEliminated.includes(answerIndex)) return;
  if (c.votes[playerId]) return; // already voted

  c.votes[playerId] = { index: answerIndex, at: Date.now() };
  const player = state.players[playerId];
  if (player) player.answerTime = Date.now();

  if (data.mode === 'teams') {
    const members = membersOf(data, state, c);
    const allVoted = members.every((id) => c.votes[id]);
    if (allVoted) {
      c.answerIndex = majorityVote(c.votes);
      c.decided = true;
    }
  } else {
    // ffa: own answer; coop: the first answer is the party's answer
    c.answerIndex = answerIndex;
    c.decided = true;
  }

  if (playing(data).every((x) => x.decided)) {
    resolveRound(io, state);
  } else {
    pushState(io, state, data);
  }
}

function resolveRound(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data || data.resolved) return;
  if (!data.currentQuestion) return;
  data.resolved = true;
  clearTimers(data);

  const q = data.currentQuestion;
  for (const c of playing(data)) {
    if (!c.decided) {
      // Timer ran out: teams take the majority of partial votes, others have nothing
      c.answerIndex = data.mode === 'teams' ? majorityVote(c.votes) : null;
      c.decided = true;
    }
    c.lastWasCorrect = c.answerIndex !== null && c.answerIndex === q.correctIndex;
    // Mark members' currentAnswer for UI (presenter "Ответил: …")
    for (const pid of membersOf(data, state, c)) {
      const p = state.players[pid];
      if (!p) continue;
      const v = c.votes[pid];
      p.currentAnswer = v ? v.index : (data.mode === 'coop' ? null : c.answerIndex);
    }
  }

  state.phase = 'results';
  pushState(io, state, data);

  // After ~3.5s show result, then advance
  data.resolveTimeout = setTimeout(() => {
    data.resolveTimeout = null;
    const isLast = data.level >= PRIZE_PYRAMID.length;
    let anyoneWon = false;
    for (const c of playing(data)) {
      if (!c.lastWasCorrect) {
        // Drop to the nearest safe haven below the reached level.
        const reachedLevel = data.level - 1; // last cleared level
        c.status = 'out';
        c.finalSum = safeSum(reachedLevel);
        c.finalLevel = reachedLevel;
      } else if (isLast) {
        c.status = 'won';
        c.finalSum = PRIZE_PYRAMID[PRIZE_PYRAMID.length - 1];
        c.finalLevel = PRIZE_PYRAMID.length;
        anyoneWon = true;
      }
    }

    if (anyoneWon || playing(data).length === 0) {
      finishGame(io, state);
      return;
    }

    // Otherwise, the survivors climb the pyramid
    data.level++;
    startQuestion(io, state);
  }, 3500);
}

function finishGame(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  clearTimers(data);

  // Contestants still playing (questions ran out) keep the prize of the last cleared level
  for (const c of playing(data)) {
    c.finalSum = sumOf(data, c);
    c.finalLevel = data.level - 1;
  }

  const stats: Record<string, unknown> = { teamMode: data.mode };
  let victory: boolean;
  if (data.mode === 'coop') {
    const c = data.contestants[COOP_ID];
    victory = c.status === 'won';
    stats.sum = c.finalSum;
    stats.level = c.finalLevel;
  } else {
    const scores: Record<string, number> = {};
    let winnerId: string | undefined;
    let best = -1;
    for (const c of Object.values(data.contestants)) {
      scores[c.id] = c.finalSum;
      if (c.finalSum > best) { best = c.finalSum; winnerId = c.id; }
    }
    victory = best > 0;
    if (data.mode === 'ffa') {
      stats.scores = scores;
      stats.winnerPlayerId = winnerId;
    } else {
      stats.teamScores = scores;
      stats.winnerTeamId = winnerId;
    }
    stats.sum = best;
    stats.level = winnerId ? data.contestants[winnerId].finalLevel : 0;
  }

  state.phase = victory ? 'victory' : 'defeat';
  pushState(io, state, data);
  io.to(state.roomCode).emit('game-over', victory, stats);

  // Cleanup
  rooms.delete(state.roomCode);
}

// ---------- Hint handlers ----------

/** Contestant the hint applies to, if it may still use hints this round. */
function hintTarget(state: GameState, playerId: string): { data: MillionaireRoomData; c: Contestant } | null {
  const data = rooms.get(state.roomCode);
  if (!data || !data.currentQuestion || data.resolved) return null;
  const c = contestantOf(data, state, playerId);
  if (!c || c.status !== 'playing' || c.decided) return null;
  return { data, c };
}

function applyFifty(io: Server, state: GameState, playerId: string): void {
  const t = hintTarget(state, playerId);
  if (!t) return;
  const { data, c } = t;
  // Atomic guard: claim the hint flag BEFORE any side-effects so two
  // concurrent socket events can't both pass the check.
  if (c.hints.fifty) return;
  c.hints.fifty = true;

  const correct = data.currentQuestion!.correctIndex;
  const wrongs = [0, 1, 2, 3].filter((i) => i !== correct);
  const shuffled = wrongs.sort(() => Math.random() - 0.5);
  c.fiftyEliminated = [shuffled[0], shuffled[1]];

  pushState(io, state, data);
}

function applyAudience(io: Server, state: GameState, playerId: string): void {
  const t = hintTarget(state, playerId);
  if (!t) return;
  const { data, c } = t;
  if (c.hints.audience) return;
  c.hints.audience = true;

  const correct = data.currentQuestion!.correctIndex;
  // 60-80% to correct, rest distributed among remaining (taking 50/50 elimination into account)
  const correctPct = 60 + Math.floor(Math.random() * 21); // 60..80
  const remaining = 100 - correctPct;
  const others = [0, 1, 2, 3].filter((i) => i !== correct && !c.fiftyEliminated.includes(i));
  const percents: [number, number, number, number] = [0, 0, 0, 0];
  percents[correct] = correctPct;
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
  c.audience = { percents };

  pushState(io, state, data);
}

function applyFriend(io: Server, state: GameState, playerId: string): void {
  const t = hintTarget(state, playerId);
  if (!t) return;
  const { data, c } = t;
  if (c.hints.friend) return;
  c.hints.friend = true;

  const correct = data.currentQuestion!.correctIndex;
  const allowed = [0, 1, 2, 3].filter((i) => !c.fiftyEliminated.includes(i));
  // 70% correct, 30% random (from allowed)
  let suggestion: number;
  if (Math.random() < 0.7) {
    suggestion = correct;
  } else {
    const wrong = allowed.filter((i) => i !== correct);
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
  c.friend = {
    suggestionIndex: suggestion as 0 | 1 | 2 | 3,
    text,
  };

  pushState(io, state, data);
}

/** Swap the question — coop only (in ffa/teams everybody shares one question). */
function applySwap(io: Server, state: GameState, playerId: string): void {
  const t = hintTarget(state, playerId);
  if (!t) return;
  const { data, c } = t;
  if (data.mode !== 'coop') return;
  if (c.hints.swap) return;
  c.hints.swap = true;

  const current = data.currentQuestion!;
  const difficulty = current.difficulty;
  // Make sure the previous question is marked used so we don't roll the same.
  data.used.add(current.id);
  const replacement = pickQuestion(data.pool, difficulty, data.used);
  if (!replacement) return; // no replacement available — keep current

  data.currentQuestion = replacement;
  // Reset hint visuals tied to the previous question so they don't leak info about the new one.
  c.fiftyEliminated = [];
  c.audience = null;
  c.friend = null;
  c.votes = {};
  c.answerIndex = null;
  c.decided = false;
  c.lastWasCorrect = null;
  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    p.answerTime = null;
  }

  // Reschedule bot answers for the new question.
  for (const bt of data.botTimeouts) clearTimeout(bt);
  data.botTimeouts = [];
  scheduleBots(io, state, data);

  pushState(io, state, data);
}

type HintName = 'fifty' | 'audience' | 'friend' | 'swap';

function applyHint(io: Server, state: GameState, playerId: string, hint: HintName): void {
  if (hint === 'fifty') applyFifty(io, state, playerId);
  else if (hint === 'audience') applyAudience(io, state, playerId);
  else if (hint === 'friend') applyFriend(io, state, playerId);
  else if (hint === 'swap') applySwap(io, state, playerId);
}

// ---------- ModeHandler ----------

const handler: ModeHandler = {
  start(io, state) {
    const old = rooms.get(state.roomCode);
    if (old) clearTimers(old);
    const data = initRoom(state);
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
      submitAnswer(io, state, socket.id, answerIndex);
    });

    socket.on('mode-millionaire-hint', (hint: HintName) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'millionaire') return;
      if (state.phase !== 'answering') return;
      applyHint(io, state, socket.id, hint);
    });

    // Dedicated event names — also serve as atomic-claim entry points.
    for (const hint of ['fifty', 'audience', 'friend', 'swap'] as HintName[]) {
      socket.on(`mode-millionaire-hint-${hint}`, () => {
        const state = getState();
        if (!state || state.gameMode !== 'millionaire' || state.phase !== 'answering') return;
        applyHint(io, state, socket.id, hint);
      });
    }
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
