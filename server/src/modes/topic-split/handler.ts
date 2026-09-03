import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { startTimer, clearTimer } from '../../utils/TimerManager.ts';
import {
  pickTopicQuestion,
  buildTopicPools,
  type TopicQuestion,
} from './questions.ts';
import { getSimpleData } from '../../data/contentStore.ts';

// ---------- Tunables ----------

const PICK_TIME = 30;
const ROUND_TIME = 25;
const RESULT_TIME = 4;
const TOTAL_ROUNDS = 8;
const DAMAGE_TO_BOSS = 50;
const DAMAGE_TO_TEAM = 20;
const BOSS_HP_PER_ROUND_PER_PLAYER = 30;

// ---------- Public snapshot shape (mirrored into state.topicSplit) ----------

interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
}

interface BossSnapshot {
  hp: number;
  max: number;
}

interface PublicSnapshot {
  phase: 'pick' | 'question' | 'results' | 'finished';
  topics: string[];
  /** playerId -> topic chosen */
  assignments: Record<string, string>;
  round: number;
  total: number;
  boss: BossSnapshot;
  /** topic -> score (correct answers count) */
  scores: Record<string, number>;
  /** Per-topic active question (no correctIndex). Empty during pick / between rounds. */
  currentQuestions: Record<string, PublicQuestion>;
  /** playerId -> chosen optionIndex for the current round (so group sees vote tallies). */
  currentVotes: Record<string, number>;
  /** topic -> majority chosen index (only filled during 'results'). */
  lastChoice: Record<string, number>;
  /** topic -> correct index (only filled during 'results'). */
  lastCorrect: Record<string, number>;
  /** topic -> whether they got it right last round (only during 'results'). */
  lastResult: Record<string, boolean>;
}

// ---------- Internal per-room state ----------

interface RoomData {
  phase: 'pick' | 'question' | 'results' | 'finished';
  /** Topics from the content pack (>= 2). */
  topics: string[];
  /** Per-topic question pools from the content pack. */
  pools: Record<string, TopicQuestion[]>;
  assignments: Map<string, string>;          // playerId -> topic
  round: number;                                 // 0-based; UI shows round+1
  scores: Map<string, number>;
  bossHp: number;
  bossMax: number;
  /** Active per-topic question (server-side, includes correctIndex). */
  activeQuestions: Map<string, TopicQuestion>;
  usedQuestionIds: Map<string, Set<string>>;
  /** playerId -> optionIdx for current round. */
  votes: Map<string, number>;
  /** topic -> majority chosen index for last round (for results display). */
  lastChoice: Map<string, number>;
  lastCorrect: Map<string, number>;
  lastResult: Map<string, boolean>;
}

const ROOMS = new Map<string, RoomData>();

function freshRoom(topics: string[], pools: Record<string, TopicQuestion[]>): RoomData {
  return {
    phase: 'pick',
    topics,
    pools,
    assignments: new Map(),
    round: 0,
    scores: new Map(),
    bossHp: 0,
    bossMax: 0,
    activeQuestions: new Map(),
    usedQuestionIds: new Map(),
    votes: new Map(),
    lastChoice: new Map(),
    lastCorrect: new Map(),
    lastResult: new Map(),
  };
}

function activeTopics(data: RoomData): string[] {
  const set = new Set<string>();
  for (const t of data.assignments.values()) set.add(t);
  return data.topics.filter((t) => set.has(t));
}

function playersInTopic(data: RoomData, topic: string): string[] {
  const ids: string[] = [];
  for (const [pid, t] of data.assignments) {
    if (t === topic) ids.push(pid);
  }
  return ids;
}

function publicQuestion(q: TopicQuestion): PublicQuestion {
  return { id: q.id, text: q.text, options: [...q.options] };
}

function buildSnapshot(data: RoomData): PublicSnapshot {
  const assignments: Record<string, string> = {};
  for (const [pid, t] of data.assignments) assignments[pid] = t;

  const scores: Record<string, number> = {};
  for (const t of data.topics) scores[t] = data.scores.get(t) ?? 0;

  const currentQuestions: Record<string, PublicQuestion> = {};
  if (data.phase === 'question' || data.phase === 'results') {
    for (const [t, q] of data.activeQuestions) {
      currentQuestions[t] = publicQuestion(q);
    }
  }

  const currentVotes: Record<string, number> = {};
  for (const [pid, idx] of data.votes) currentVotes[pid] = idx;

  const lastChoice: Record<string, number> = {};
  for (const [t, idx] of data.lastChoice) lastChoice[t] = idx;
  const lastCorrect: Record<string, number> = {};
  for (const [t, idx] of data.lastCorrect) lastCorrect[t] = idx;
  const lastResult: Record<string, boolean> = {};
  for (const [t, ok] of data.lastResult) lastResult[t] = ok;

  return {
    phase: data.phase,
    topics: [...data.topics],
    assignments,
    round: data.round,
    total: TOTAL_ROUNDS,
    boss: { hp: data.bossHp, max: data.bossMax },
    scores,
    currentQuestions,
    currentVotes,
    lastChoice,
    lastCorrect,
    lastResult,
  };
}

function pushState(io: Server, state: GameState, data: RoomData): void {
  (state as any).topicSplit = buildSnapshot(data);
  io.to(state.roomCode).emit('game-state', state);
}

// ---------- Phase: pick ----------

function startPickPhase(io: Server, state: GameState): void {
  const data = ROOMS.get(state.roomCode);
  if (!data) return;
  data.phase = 'pick';
  state.phase = 'topic-pick' as any;
  state.timer = PICK_TIME;
  state.maxTimer = PICK_TIME;
  state.currentFloor = 0;
  state.totalFloors = TOTAL_ROUNDS;

  // Auto-pick for bots so they participate.
  const bots = Object.values(state.players).filter((p) => p.isBot);
  for (const b of bots) {
    if (!data.assignments.has(b.id)) {
      const topic = data.topics[Math.floor(Math.random() * data.topics.length)];
      data.assignments.set(b.id, topic);
    }
  }

  pushState(io, state, data);

  startTimer(
    state.roomCode,
    PICK_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      finalizePicks(io, state);
    },
  );
}

function finalizePicks(io: Server, state: GameState): void {
  const data = ROOMS.get(state.roomCode);
  if (!data) return;
  // Anyone who didn't pick — assign them randomly.
  for (const p of Object.values(state.players)) {
    if (!data.assignments.has(p.id)) {
      const topic = data.topics[Math.floor(Math.random() * data.topics.length)];
      data.assignments.set(p.id, topic);
    }
  }
  // Compute boss HP based on player count.
  const playerCount = Object.keys(state.players).length;
  const max = TOTAL_ROUNDS * Math.max(playerCount, 1) * BOSS_HP_PER_ROUND_PER_PLAYER;
  data.bossHp = max;
  data.bossMax = max;
  for (const t of data.topics) data.scores.set(t, 0);

  data.round = 0;
  startRound(io, state);
}

// ---------- Phase: round ----------

function startRound(io: Server, state: GameState): void {
  const data = ROOMS.get(state.roomCode);
  if (!data) return;

  if (data.round >= TOTAL_ROUNDS || data.bossHp <= 0) {
    finishGame(io, state);
    return;
  }

  data.phase = 'question';
  data.activeQuestions.clear();
  data.votes.clear();
  data.lastChoice.clear();
  data.lastCorrect.clear();
  data.lastResult.clear();

  const topics = activeTopics(data);
  for (const t of topics) {
    if (!data.usedQuestionIds.has(t)) data.usedQuestionIds.set(t, new Set());
    const used = data.usedQuestionIds.get(t)!;
    const q = pickTopicQuestion(data.pools, t, used);
    if (!q) continue;
    used.add(q.id);
    data.activeQuestions.set(t, q);
  }

  state.phase = 'topic-question' as any;
  state.timer = ROUND_TIME;
  state.maxTimer = ROUND_TIME;
  state.currentFloor = data.round + 1;
  state.totalFloors = TOTAL_ROUNDS;

  // Per-player private question emits (each player only sees their own group's question).
  for (const [pid, topic] of data.assignments) {
    const q = data.activeQuestions.get(topic);
    if (!q) continue;
    io.to(pid).emit('mode-topic-question' as any, {
      topic,
      question: publicQuestion(q),
      round: data.round + 1,
      total: TOTAL_ROUNDS,
      timeLimit: ROUND_TIME,
    });
  }

  pushState(io, state, data);

  // Schedule bot votes.
  for (const p of Object.values(state.players)) {
    if (!p.isBot) continue;
    const topic = data.assignments.get(p.id);
    if (!topic) continue;
    const q = data.activeQuestions.get(topic);
    if (!q) continue;
    const delay = 2000 + Math.random() * (ROUND_TIME * 1000 - 4000);
    setTimeout(() => {
      const cur = ROOMS.get(state.roomCode);
      if (!cur || cur.phase !== 'question' || cur.round !== data.round) return;
      if (cur.votes.has(p.id)) return;
      // 65% chance correct
      const correct = q.correctIndex;
      const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
      const ans = Math.random() < 0.65
        ? correct
        : wrong[Math.floor(Math.random() * wrong.length)];
      submitVote(io, state, p.id, ans);
    }, delay);
  }

  startTimer(
    state.roomCode,
    ROUND_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      resolveRound(io, state);
    },
  );
}

export function submitVote(
  io: Server,
  state: GameState,
  playerId: string,
  optionIdx: number,
): void {
  const data = ROOMS.get(state.roomCode);
  if (!data || data.phase !== 'question') return;
  if (!(playerId in state.players)) return;
  if (data.votes.has(playerId)) return;
  if (typeof optionIdx !== 'number' || optionIdx < 0 || optionIdx > 3) return;
  if (!data.assignments.has(playerId)) return;

  data.votes.set(playerId, optionIdx);
  pushState(io, state, data);

  // If everyone with an assignment has voted, end early.
  const need = data.assignments.size;
  if (data.votes.size >= need) {
    clearTimer(state.roomCode);
    resolveRound(io, state);
  }
}

function majorityChoice(
  data: RoomData,
  topic: string,
): number | null {
  const counts: Record<number, number> = {};
  for (const pid of playersInTopic(data, topic)) {
    const v = data.votes.get(pid);
    if (typeof v !== 'number') continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  let best: number | null = null;
  let bestCount = 0;
  // Tie-breaker: pick the first index by natural order among the tied top.
  for (const idxStr of Object.keys(counts).sort((a, b) => Number(a) - Number(b))) {
    const idx = Number(idxStr);
    const c = counts[idx];
    if (c > bestCount) {
      best = idx;
      bestCount = c;
    }
  }
  return best;
}

function resolveRound(io: Server, state: GameState): void {
  const data = ROOMS.get(state.roomCode);
  if (!data || data.phase !== 'question') return;
  data.phase = 'results';

  const topics = activeTopics(data);
  for (const t of topics) {
    const q = data.activeQuestions.get(t);
    if (!q) continue;
    const choice = majorityChoice(data, t);
    const correct = choice !== null && choice === q.correctIndex;
    data.lastChoice.set(t, choice ?? -1);
    data.lastCorrect.set(t, q.correctIndex);
    data.lastResult.set(t, correct);

    // Per-topic per-player tally: count individual right vs wrong answers
    // inside this topic's group. Boss damage scales with correct count;
    // personal HP loss only hits the players who actually got it wrong
    // (or didn't answer) within this topic — NOT the whole team. (issue 2.1)
    const groupIds = playersInTopic(data, t);
    let correctInGroup = 0;
    const wrongInGroup: string[] = [];
    for (const pid of groupIds) {
      const v = data.votes.get(pid);
      if (v === q.correctIndex) {
        correctInGroup++;
      } else {
        wrongInGroup.push(pid);
      }
    }

    if (correct) {
      data.scores.set(t, (data.scores.get(t) ?? 0) + 1);
    }
    // Boss takes damage proportional to how many players in this topic
    // answered correctly (so even a "wrong majority" topic with some right
    // answers still chips the boss a little).
    if (correctInGroup > 0) {
      data.bossHp = Math.max(0, data.bossHp - DAMAGE_TO_BOSS * correctInGroup);
    }
    // Only the players in *this* topic who answered wrong (or skipped) take
    // personal HP damage. Other topics are unaffected.
    for (const pid of wrongInGroup) {
      const p = state.players[pid];
      if (!p) continue;
      p.personalHp = Math.max(0, (p.personalHp ?? 0) - DAMAGE_TO_TEAM);
    }
  }

  state.phase = 'topic-results' as any;
  state.timer = RESULT_TIME;
  state.maxTimer = RESULT_TIME;
  pushState(io, state, data);

  startTimer(
    state.roomCode,
    RESULT_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      data.round++;
      if (data.bossHp <= 0 || data.round >= TOTAL_ROUNDS) {
        finishGame(io, state);
      } else {
        startRound(io, state);
      }
    },
  );
}

function finishGame(io: Server, state: GameState): void {
  const data = ROOMS.get(state.roomCode);
  if (!data) return;
  clearTimer(state.roomCode);
  data.phase = 'finished';

  const victory = data.bossHp <= 0;
  state.phase = victory ? 'victory' : 'defeat';
  pushState(io, state, data);

  const scores: Record<string, number> = {};
  for (const t of data.topics) scores[t] = data.scores.get(t) ?? 0;

  io.to(state.roomCode).emit('game-over', victory, {
    mode: 'topic-split',
    bossHp: data.bossHp,
    bossMax: data.bossMax,
    scores,
  });
}

// ---------- Pick handler ----------

function handlePick(io: Server, state: GameState, playerId: string, topic: string): void {
  const data = ROOMS.get(state.roomCode);
  if (!data || data.phase !== 'pick') return;
  if (!(playerId in state.players)) return;
  if (typeof topic !== 'string' || !data.topics.includes(topic)) return;
  data.assignments.set(playerId, topic);
  pushState(io, state, data);
}

// ---------- ModeHandler export ----------

const handler: ModeHandler = {
  start(io, state) {
    clearTimer(state.roomCode);
    ROOMS.delete(state.roomCode);
    const { topics, pools } = buildTopicPools(getSimpleData('topic-split', state.contentPacks?.['topic-split']));
    const data = freshRoom(topics, pools);
    ROOMS.set(state.roomCode, data);

    // Reset per-player fields used by the team-damage effect.
    for (const p of Object.values(state.players)) {
      p.currentAnswer = null;
      p.answerTime = null;
      // Personal HP becomes the shared "team" pool for this mode (visualised on client).
      if (!p.maxPersonalHp || p.maxPersonalHp <= 0) {
        p.maxPersonalHp = 100;
      }
      p.personalHp = p.maxPersonalHp;
      p.isAlive = true;
    }

    startPickPhase(io, state);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-topic-pick', (topic: string) => {
      const state = getState();
      if (!state || state.gameMode !== 'topic-split') return;
      handlePick(io, state, socket.id, topic);
    });

    socket.on('mode-topic-vote', (optionIdx: number) => {
      const state = getState();
      if (!state || state.gameMode !== 'topic-split') return;
      submitVote(io, state, socket.id, Number(optionIdx));
    });
  },

  stop(_io, state) {
    clearTimer(state.roomCode);
    ROOMS.delete(state.roomCode);
  },
};

export default handler;
