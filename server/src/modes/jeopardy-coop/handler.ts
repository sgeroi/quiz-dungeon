import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import {
  JCOOP_GRID,
  JCOOP_TOPICS,
  JCOOP_VALUES,
  type JCoopTopic,
  type JCoopValue,
} from './grid.ts';

// =====================================================================
// Mode-specific state
// =====================================================================

interface JCoopBoss {
  name: string;
  emoji: string;
  hp: number;
  max: number;
}

interface JCoopActiveQuestion {
  topic: JCoopTopic;
  value: JCoopValue;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  /** The single player who is on the hook to answer this question. */
  activeId: string;
  /** Helpers allowed to speak this round (used only on level 400). */
  helperIds: string[];
  /** Are non-active voices supposed to be heard distorted? (level 300) */
  distorted: boolean;
  startedAt: number;
}

interface JCoopAnimation {
  id: number;
  type: 'damage-boss' | 'damage-team' | 'death';
  amount?: number;
  playerId?: string;
}

/**
 * The communication mask sent to every client whenever a round starts or ends.
 * Clients use it to mute their microphone, distort incoming streams, etc.
 */
interface CommState {
  level: JCoopValue | null;
  activeId: string | null;
  /** Players allowed to speak. When null, everyone can talk (between questions). */
  allowedSpeakers: string[] | null;
  /** Whether voice / video should be distorted for non-active players. */
  distorted: boolean;
}

interface JCoopCellPublic {
  topic: JCoopTopic;
  value: JCoopValue;
  played: boolean;
  timeLimit: number;
}

interface JCoopSnapshot {
  boss: JCoopBoss;
  grid: JCoopCellPublic[];
  played: string[];
  /** Player whose turn it currently is (picks the cell or is answering). */
  activeId: string | null;
  /** Active question, if any. correctIndex is omitted. */
  current: {
    topic: JCoopTopic;
    value: JCoopValue;
    text: string;
    options: string[];
    timeLimit: number;
    activeId: string;
    helperIds: string[];
    distorted: boolean;
    level: JCoopValue;
  } | null;
  reveal: {
    topic: JCoopTopic;
    value: JCoopValue;
    correctIndex: number;
    activeId: string;
    submittedAnswer: number | null;
    isCorrect: boolean;
    damageToBoss: number;
    damageToActive: number;
    deaths: string[];
  } | null;
  totalCells: number;
  playedCount: number;
  animations: JCoopAnimation[];
  result: 'victory' | 'defeat' | null;
  comm: CommState;
}

interface JCoopRoomData {
  boss: JCoopBoss;
  grid: Map<string, { topic: JCoopTopic; value: JCoopValue; played: boolean }>;
  /** Stable rotation order of human players. */
  rotation: string[];
  /** Index into `rotation`. The active player is rotation[turnIndex % rotation.length]. */
  turnIndex: number;
  current: JCoopActiveQuestion | null;
  /** Active player's submitted answer. */
  submittedAnswer: number | null;
  reveal: JCoopSnapshot['reveal'];
  questionTimer: ReturnType<typeof setInterval> | null;
  resolveTimeout: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
  animations: JCoopAnimation[];
  animCounter: number;
  result: 'victory' | 'defeat' | null;
  comm: CommState;
}

const rooms = new Map<string, JCoopRoomData>();

const BOSS_NAME = 'Дракон Невежества';
const BOSS_EMOJI = '🐲';
const BOSS_MAX_HP = 2500;
const PLAYER_START_HP = 100;

const TIME_BY_VALUE: Record<JCoopValue, number> = {
  100: 30,
  200: 25,
  300: 25,
  400: 20,
  500: 15,
};

// Damage taken by the active player when they answer wrong.
const WRONG_DAMAGE_BY_VALUE: Record<JCoopValue, number> = {
  100: 20,
  200: 30,
  300: 40,
  400: 50,
  500: 70,
};

function cellKey(topic: JCoopTopic, value: JCoopValue): string {
  return `${topic}|${value}`;
}

// =====================================================================
// State helpers
// =====================================================================

function getAlive(state: GameState) {
  return Object.values(state.players).filter((p) => p.isAlive);
}

function getHumanRotation(state: GameState, prev: string[]): string[] {
  // Keep current humans in their existing slot order, append newcomers.
  const humans = Object.values(state.players)
    .filter((p) => !p.isBot)
    .map((p) => p.id);
  const next = prev.filter((id) => humans.includes(id));
  for (const id of humans) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function pickActiveId(state: GameState, data: JCoopRoomData): string | null {
  // Walk the rotation forward until we land on a player who is alive.
  if (data.rotation.length === 0) return null;
  for (let step = 0; step < data.rotation.length; step++) {
    const idx = (data.turnIndex + step) % data.rotation.length;
    const candidate = data.rotation[idx];
    const p = state.players[candidate];
    if (p?.isAlive) {
      data.turnIndex = idx;
      return candidate;
    }
  }
  return null;
}

function clearTimers(data: JCoopRoomData): void {
  if (data.questionTimer) {
    clearInterval(data.questionTimer);
    data.questionTimer = null;
  }
  if (data.resolveTimeout) {
    clearTimeout(data.resolveTimeout);
    data.resolveTimeout = null;
  }
}

function pushAnimation(data: JCoopRoomData, anim: Omit<JCoopAnimation, 'id'>): void {
  data.animCounter++;
  data.animations.push({ ...anim, id: data.animCounter });
  if (data.animations.length > 12) data.animations = data.animations.slice(-12);
}

function buildPublicGrid(data: JCoopRoomData): JCoopCellPublic[] {
  const out: JCoopCellPublic[] = [];
  for (const topic of JCOOP_TOPICS) {
    for (const value of JCOOP_VALUES) {
      const cell = data.grid.get(cellKey(topic, value));
      out.push({
        topic,
        value,
        played: !!cell?.played,
        timeLimit: TIME_BY_VALUE[value],
      });
    }
  }
  return out;
}

function buildSnapshot(data: JCoopRoomData): JCoopSnapshot {
  const playedKeys: string[] = [];
  data.grid.forEach((c, k) => { if (c.played) playedKeys.push(k); });

  const activeId = data.rotation.length > 0
    ? data.rotation[data.turnIndex % data.rotation.length]
    : null;

  return {
    boss: { ...data.boss },
    grid: buildPublicGrid(data),
    played: playedKeys,
    activeId,
    current: data.current
      ? {
          topic: data.current.topic,
          value: data.current.value,
          text: data.current.text,
          options: [...data.current.options],
          timeLimit: data.current.timeLimit,
          activeId: data.current.activeId,
          helperIds: [...data.current.helperIds],
          distorted: data.current.distorted,
          level: data.current.value,
        }
      : null,
    reveal: data.reveal,
    totalCells: 25,
    playedCount: playedKeys.length,
    animations: [...data.animations],
    result: data.result,
    comm: { ...data.comm, allowedSpeakers: data.comm.allowedSpeakers ? [...data.comm.allowedSpeakers] : null },
  };
}

function pushState(io: Server, state: GameState, data: JCoopRoomData): void {
  (state as any).jcoop = buildSnapshot(data);
  // Top-level mirrors used by App.tsx routing — repurpose `captainId` to mean
  // "active player on this turn" so existing UI bits keep working.
  state.captainId = data.rotation.length > 0
    ? data.rotation[data.turnIndex % data.rotation.length]
    : undefined;
  state.sacrificePlayerId = undefined;
  if (data.current) {
    state.currentQuestion = {
      id: cellKey(data.current.topic, data.current.value),
      text: data.current.text,
      options: [...data.current.options],
      category: data.current.topic,
      difficulty: data.current.value <= 200 ? 'easy' : data.current.value <= 400 ? 'medium' : 'hard',
    };
    state.timer = Math.max(0, Math.ceil((data.current.startedAt + data.current.timeLimit * 1000 - Date.now()) / 1000));
    state.maxTimer = data.current.timeLimit;
  } else {
    state.currentQuestion = null;
  }
  io.to(state.roomCode).emit('game-state', state);
  // Also push the comm mask as a dedicated event — clients use it to
  // toggle their microphone and apply audio/video distortion.
  io.to(state.roomCode).emit('mode-jcoop-comm', data.comm);
}

// =====================================================================
// Game flow
// =====================================================================

function initRoom(state: GameState): JCoopRoomData {
  rooms.delete(state.roomCode);
  const grid = new Map<string, { topic: JCoopTopic; value: JCoopValue; played: boolean }>();
  for (const topic of JCOOP_TOPICS) {
    for (const value of JCOOP_VALUES) {
      grid.set(cellKey(topic, value), { topic, value, played: false });
    }
  }

  // Build initial rotation: host first, then other humans in order. Bots are
  // intentionally excluded — they observe but never get a turn.
  const humans = Object.values(state.players).filter((p) => !p.isBot).map((p) => p.id);
  const rotation: string[] = [];
  if (state.hostId && humans.includes(state.hostId)) rotation.push(state.hostId);
  for (const id of humans) {
    if (!rotation.includes(id)) rotation.push(id);
  }

  const data: JCoopRoomData = {
    boss: { name: BOSS_NAME, emoji: BOSS_EMOJI, hp: BOSS_MAX_HP, max: BOSS_MAX_HP },
    grid,
    rotation,
    turnIndex: 0,
    current: null,
    submittedAnswer: null,
    reveal: null,
    questionTimer: null,
    resolveTimeout: null,
    resolved: false,
    animations: [],
    animCounter: 0,
    result: null,
    comm: {
      level: null,
      activeId: rotation[0] ?? null,
      allowedSpeakers: null, // null = everyone can talk between questions
      distorted: false,
    },
  };
  rooms.set(state.roomCode, data);
  return data;
}

function beginPickPhase(io: Server, state: GameState, data: JCoopRoomData): void {
  data.current = null;
  data.submittedAnswer = null;
  data.reveal = null;
  data.resolved = false;
  clearTimers(data);

  // Refresh rotation in case players left/joined.
  data.rotation = getHumanRotation(state, data.rotation);
  if (data.rotation.length === 0) {
    data.result = 'defeat';
    state.phase = 'defeat';
    pushState(io, state, data);
    io.to(state.roomCode).emit('game-over', false, {});
    return;
  }

  const activeId = pickActiveId(state, data);
  if (!activeId) {
    // No one alive to play — defeat.
    data.result = 'defeat';
    state.phase = 'defeat';
    pushState(io, state, data);
    io.to(state.roomCode).emit('game-over', false, { bossHp: data.boss.hp, bossMax: data.boss.max });
    return;
  }

  // Between questions: comm is open to everyone.
  data.comm = {
    level: null,
    activeId,
    allowedSpeakers: null,
    distorted: false,
  };

  state.phase = 'question';
  state.timer = 0;
  state.maxTimer = 0;
  state.currentQuestion = null;

  pushState(io, state, data);
}

function commForLevel(value: JCoopValue, activeId: string, alive: string[]): {
  helperIds: string[];
  allowedSpeakers: string[];
  distorted: boolean;
} {
  // Pool of potential helpers — every alive non-active player.
  const pool = alive.filter((id) => id !== activeId);
  switch (value) {
    case 100:
      // Full team helps the active player — everyone can talk.
      return { helperIds: pool, allowedSpeakers: alive, distorted: false };
    case 200:
      // Team is muted — only the active player speaks.
      return { helperIds: [], allowedSpeakers: [activeId], distorted: false };
    case 300:
      // Voices and video distorted; team can speak but it's almost useless.
      return { helperIds: pool, allowedSpeakers: alive, distorted: true };
    case 400: {
      // One random helper from the alive non-active players. Rest muted.
      if (pool.length === 0) {
        return { helperIds: [], allowedSpeakers: [activeId], distorted: false };
      }
      const helper = pool[Math.floor(Math.random() * pool.length)];
      return {
        helperIds: [helper],
        allowedSpeakers: [activeId, helper],
        distorted: false,
      };
    }
    case 500:
      // Active player is on their own.
      return { helperIds: [], allowedSpeakers: [activeId], distorted: false };
  }
}

function pickCell(io: Server, state: GameState, topic: JCoopTopic, value: JCoopValue): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  if (data.current) return;
  if (data.result) return;

  const cell = data.grid.get(cellKey(topic, value));
  if (!cell || cell.played) return;
  const q = JCOOP_GRID[topic]?.[value];
  if (!q) return;

  cell.played = true;

  const activeId = data.rotation[data.turnIndex % data.rotation.length];
  const aliveIds = getAlive(state).map((p) => p.id);
  const { helperIds, allowedSpeakers, distorted } = commForLevel(value, activeId, aliveIds);
  const timeLimit = TIME_BY_VALUE[value];

  data.current = {
    topic,
    value,
    text: q.text,
    options: [...q.options],
    correctIndex: q.correctIndex,
    timeLimit,
    activeId,
    helperIds,
    distorted,
    startedAt: Date.now(),
  };
  data.submittedAnswer = null;
  data.reveal = null;
  data.resolved = false;

  data.comm = {
    level: value,
    activeId,
    allowedSpeakers,
    distorted,
  };

  // Reset per-player answer tracking on the shared GameState.
  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    p.answerTime = null;
  }

  state.phase = 'answering';
  state.timer = timeLimit;
  state.maxTimer = timeLimit;

  pushState(io, state, data);

  // Tick timer.
  clearTimers(data);
  let remaining = timeLimit;
  data.questionTimer = setInterval(() => {
    if (data.current) {
      remaining = Math.max(0, Math.ceil((data.current.startedAt + data.current.timeLimit * 1000 - Date.now()) / 1000));
    } else {
      remaining--;
    }
    state.timer = remaining;
    io.to(state.roomCode).emit('timer-tick', remaining);
    if (remaining <= 0) {
      if (data.questionTimer) {
        clearInterval(data.questionTimer);
        data.questionTimer = null;
      }
      resolveQuestion(io, state);
    }
  }, 1000);

  // If active is a bot, schedule an auto-answer (probably wrong, since the
  // bot can't actually hear team chatter).
  const activePlayer = state.players[activeId];
  if (activePlayer?.isBot) {
    const delay = 1500 + Math.random() * Math.min(timeLimit * 1000 - 2500, 8000);
    setTimeout(() => {
      if (data.resolved) return;
      if (data.submittedAnswer !== null) return;
      const ok = Math.random() < 0.4;
      const ans = ok ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
      submitJCoopAnswer(io, state, activeId, ans);
    }, delay);
  }
}

function submitJCoopAnswer(io: Server, state: GameState, playerId: string, answerIndex: number): void {
  const data = rooms.get(state.roomCode);
  if (!data || !data.current || data.resolved) return;
  // Only the active player can submit.
  if (data.current.activeId !== playerId) return;
  if (answerIndex < 0 || answerIndex > 3) return;
  if (data.submittedAnswer !== null) return;

  data.submittedAnswer = answerIndex;
  if (state.players[playerId]) {
    state.players[playerId].currentAnswer = answerIndex;
    state.players[playerId].answerTime = Date.now() - data.current.startedAt;
  }
  pushState(io, state, data);

  if (data.questionTimer) {
    clearInterval(data.questionTimer);
    data.questionTimer = null;
  }
  resolveQuestion(io, state);
}

function resolveQuestion(io: Server, state: GameState): void {
  const data = rooms.get(state.roomCode);
  if (!data || !data.current || data.resolved) return;
  data.resolved = true;
  clearTimers(data);

  const cur = data.current;
  const submitted = data.submittedAnswer;
  const isCorrect = submitted !== null && submitted === cur.correctIndex;

  let damageToBoss = 0;
  let damageToActive = 0;
  const deaths: string[] = [];

  if (isCorrect) {
    damageToBoss = cur.value;
    data.boss.hp = Math.max(0, data.boss.hp - damageToBoss);
    pushAnimation(data, { type: 'damage-boss', amount: damageToBoss });
  } else {
    damageToActive = WRONG_DAMAGE_BY_VALUE[cur.value];
    const active = state.players[cur.activeId];
    if (active && active.isAlive) {
      active.personalHp -= damageToActive;
      if (active.personalHp <= 0) {
        active.personalHp = 0;
        active.isAlive = false;
        deaths.push(active.id);
        pushAnimation(data, { type: 'death', playerId: active.id });
      }
      pushAnimation(data, { type: 'damage-team', amount: damageToActive, playerId: active.id });
    }
  }

  data.reveal = {
    topic: cur.topic,
    value: cur.value,
    correctIndex: cur.correctIndex,
    activeId: cur.activeId,
    submittedAnswer: submitted,
    isCorrect,
    damageToBoss,
    damageToActive,
    deaths,
  };

  // Between rounds: comm opens up again.
  data.comm = {
    level: null,
    activeId: cur.activeId,
    allowedSpeakers: null,
    distorted: false,
  };

  state.phase = 'results';
  pushState(io, state, data);

  // Check end conditions.
  const aliveCount = getAlive(state).length;
  const playedCount = [...data.grid.values()].filter((c) => c.played).length;

  if (data.boss.hp <= 0) {
    data.resolveTimeout = setTimeout(() => finishGame(io, state, true), 3500);
    return;
  }
  if (aliveCount === 0) {
    data.resolveTimeout = setTimeout(() => finishGame(io, state, false), 3500);
    return;
  }
  if (playedCount >= 25) {
    data.resolveTimeout = setTimeout(() => finishGame(io, state, false), 3500);
    return;
  }

  // Advance turn and continue.
  data.resolveTimeout = setTimeout(() => {
    const fresh = rooms.get(state.roomCode);
    if (!fresh) return;
    fresh.turnIndex = (fresh.turnIndex + 1) % Math.max(1, fresh.rotation.length);
    beginPickPhase(io, state, fresh);
  }, 3500);
}

function finishGame(io: Server, state: GameState, victory: boolean): void {
  const data = rooms.get(state.roomCode);
  if (!data) return;
  clearTimers(data);
  data.result = victory ? 'victory' : 'defeat';
  state.phase = victory ? 'victory' : 'defeat';
  // Open mics on game-over so the team can chat freely.
  data.comm = { level: null, activeId: null, allowedSpeakers: null, distorted: false };
  pushState(io, state, data);

  io.to(state.roomCode).emit('game-over', victory, {
    bossHp: data.boss.hp,
    bossMax: data.boss.max,
    cellsPlayed: [...data.grid.values()].filter((c) => c.played).length,
    survivors: getAlive(state).map((p) => p.name),
  });
}

// =====================================================================
// Handler
// =====================================================================

const handler: ModeHandler = {
  start(io, state) {
    const data = initRoom(state);

    // Initial top-level mirrors.
    state.captainId = data.rotation[0] ?? undefined;
    state.sacrificePlayerId = undefined;
    state.totalFloors = 25;
    state.currentFloor = 0;

    // Make sure all players start with the standard HP value (engine default
    // may be different — we don't trust caller).
    for (const p of Object.values(state.players)) {
      if (p.maxPersonalHp <= 0) p.maxPersonalHp = PLAYER_START_HP;
      if (p.personalHp <= 0) p.personalHp = p.maxPersonalHp;
      p.isAlive = p.personalHp > 0;
    }

    beginPickPhase(io, state, data);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-jcoop-pick', (payload: { topic: JCoopTopic; value: JCoopValue }) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'jeopardy-coop') return;
      const data = rooms.get(state.roomCode);
      if (!data) return;
      if (data.current) return;
      if (data.result) return;
      // Only the active player picks.
      const activeId = data.rotation[data.turnIndex % data.rotation.length];
      if (socket.id !== activeId) return;
      if (!payload || typeof payload.topic !== 'string' || typeof payload.value !== 'number') return;
      if (!JCOOP_TOPICS.includes(payload.topic)) return;
      if (!JCOOP_VALUES.includes(payload.value)) return;
      pickCell(io, state, payload.topic, payload.value);
    });

    socket.on('mode-jcoop-answer', (answerIndex: number) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'jeopardy-coop') return;
      if (state.phase !== 'answering') return;
      if (typeof answerIndex !== 'number') return;
      submitJCoopAnswer(io, state, socket.id, answerIndex);
    });
  },

  stop(_io, state) {
    const data = rooms.get(state.roomCode);
    if (data) clearTimers(data);
    rooms.delete(state.roomCode);
  },
};

export default handler;

// Re-export grid for test/debug imports.
export { JCOOP_GRID, JCOOP_TOPICS, JCOOP_VALUES };
