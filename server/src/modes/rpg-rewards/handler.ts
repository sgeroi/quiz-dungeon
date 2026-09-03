import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { startTimer, clearTimer } from '../../utils/TimerManager.ts';
import { pickRpgrQuestions, toRpgrQuestions, type RpgrQuestion } from './questions.ts';
import { getSimpleData } from '../../data/contentStore.ts';
import { RPGR_MONSTERS } from './monsters.ts';
import { RPGR_CARDS, pickRandomCards, type RpgrCardId, type RpgrCardDef } from './cards.ts';

const QUESTION_TIME = 25;
const REWARD_TIME = 25;
const RESULT_TIME = 4;
const BASE_DAMAGE = 50;
const TEAM_DAMAGE = 20;
const PLAYER_HP = 100;

interface MonsterRuntime {
  index: number;
  name: string;
  emoji: string;
  hp: number;
  max: number;
}

interface PlayerEffects {
  // Permanent effects
  bladeBonus: number;       // +damage from sharp-blade (stacks)
  shieldCharges: number;    // count of unused shields
  speedBonus: boolean;      // permanent +30% on fast correct answers
  reviveAvailable: number;  // count of revive cards
  wisdomCharges: number;    // 50/50 hint charges
  // Round-scoped
  furyRoundsLeft: number;   // x2 damage rounds (per pick adds 1)
  // Cards owned (history for game-over loot)
  cards: RpgrCardId[];
}

interface RpgrState {
  round: number;
  total: number;
  phase: 'fight' | 'reward' | 'results' | 'victory' | 'defeat';
  monsters: MonsterRuntime[];
  currentMonster: MonsterRuntime | null;
  questions: RpgrQuestion[];      // full pool from the content pack (used to refill)
  questionPool: RpgrQuestion[];   // remaining
  currentQuestion: RpgrQuestion | null;
  currentAnswers: Record<string, number | null>;
  answerTimes: Record<string, number>;     // ms taken
  questionStartedAt: number;
  // Reward phase data
  rewardOptions: Record<string, RpgrCardId[]>; // playerId -> 3 card ids
  rewardPicks: Record<string, RpgrCardId | null>;
  // Per-player effects
  effects: Record<string, PlayerEffects>;
  // Per-player HP
  hp: Record<string, number>;
  alive: Record<string, boolean>;
  // Team luck — applied next fight round
  teamLuckPending: number; // 0 or 1 stack of +10%
  // History for loot screen
  monstersKilled: number;
  // Last round summary
  lastRoundSummary: {
    correctIndex: number;
    teamPick: number | null;
    correct: boolean;
    damageToMonster: number;
    damageToTeam: number;
    answers: Record<string, number | null>;
  } | null;
}

const RPGR_STATES = new Map<string, RpgrState>();

function getRState(state: GameState): RpgrState | undefined {
  return RPGR_STATES.get(state.roomCode);
}

function newPlayerEffects(): PlayerEffects {
  return {
    bladeBonus: 0,
    shieldCharges: 0,
    speedBonus: false,
    reviveAvailable: 0,
    wisdomCharges: 0,
    furyRoundsLeft: 0,
    cards: [],
  };
}

function publicQuestion(q: RpgrQuestion) {
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    category: 'rpgr',
    difficulty: 'medium' as const,
  };
}

function snapshot(state: GameState, s: RpgrState) {
  // Build per-player effect summary for clients
  const players: Record<string, {
    hp: number;
    maxHp: number;
    alive: boolean;
    cards: RpgrCardId[];
    bladeBonus: number;
    shieldCharges: number;
    speedBonus: boolean;
    reviveAvailable: number;
    wisdomCharges: number;
    furyRoundsLeft: number;
  }> = {};
  for (const id of Object.keys(state.players)) {
    const e = s.effects[id];
    players[id] = {
      hp: s.hp[id] ?? 0,
      maxHp: PLAYER_HP,
      alive: !!s.alive[id],
      cards: e?.cards ?? [],
      bladeBonus: e?.bladeBonus ?? 0,
      shieldCharges: e?.shieldCharges ?? 0,
      speedBonus: !!e?.speedBonus,
      reviveAvailable: e?.reviveAvailable ?? 0,
      wisdomCharges: e?.wisdomCharges ?? 0,
      furyRoundsLeft: e?.furyRoundsLeft ?? 0,
    };
  }
  return {
    round: s.round,
    total: s.total,
    phase: s.phase,
    currentMonster: s.currentMonster,
    monstersKilled: s.monstersKilled,
    currentQuestion: s.currentQuestion ? publicQuestion(s.currentQuestion) : null,
    currentAnswers: s.currentAnswers,
    rewardOptions: s.rewardOptions,
    rewardPicks: s.rewardPicks,
    teamLuckPending: s.teamLuckPending,
    players,
    lastRoundSummary: s.lastRoundSummary,
  };
}

function broadcast(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s) return;
  // Mirror selected fields onto state for callers/screens that read state.rpgr
  (state as any).rpgr = snapshot(state, s);
  io.to(state.roomCode).emit('game-state', state);
  io.to(state.roomCode).emit('mode-rpgr-state' as any, snapshot(state, s));
}

function aliveIds(state: GameState, s: RpgrState): string[] {
  return Object.keys(state.players).filter((id) => s.alive[id]);
}

function startNextMonster(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s) return;
  if (s.round >= s.total) {
    finishGame(io, state, true);
    return;
  }
  const def = s.monsters[s.round];
  s.currentMonster = { ...def };
  state.phase = 'floor-intro';
  state.currentFloor = s.round;
  state.totalFloors = s.total;
  io.to(state.roomCode).emit('mode-rpgr-monster-spawn' as any, s.currentMonster);
  broadcast(io, state);
  // brief intro then question
  setTimeout(() => {
    if (!getRState(state)) return;
    askQuestion(io, state);
  }, 1500);
}

function askQuestion(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s || !s.currentMonster) return;
  // Pick a fresh question
  if (s.questionPool.length === 0) {
    s.questionPool = pickRpgrQuestions(s.questions, 35);
  }
  const q = s.questionPool.shift()!;
  s.currentQuestion = q;
  s.phase = 'fight';
  s.currentAnswers = {};
  s.answerTimes = {};
  s.lastRoundSummary = null;
  for (const p of Object.values(state.players)) {
    s.currentAnswers[p.id] = null;
  }
  s.questionStartedAt = Date.now();

  state.phase = 'answering';
  state.timer = QUESTION_TIME;
  state.maxTimer = QUESTION_TIME;
  state.currentQuestion = publicQuestion(q);

  io.to(state.roomCode).emit('mode-rpgr-question' as any, {
    question: publicQuestion(q),
    timeLimit: QUESTION_TIME,
    monster: s.currentMonster,
    round: s.round + 1,
    total: s.total,
  });
  broadcast(io, state);

  // Schedule bot answers
  for (const p of Object.values(state.players)) {
    if (p.isBot && s.alive[p.id]) {
      const delay = 2000 + Math.random() * (QUESTION_TIME * 1000 - 4000);
      setTimeout(() => {
        const cur = getRState(state);
        if (!cur || cur.phase !== 'fight' || cur.currentQuestion?.id !== q.id) return;
        if (cur.currentAnswers[p.id] != null) return;
        // Bots: 65% correct
        const ans = Math.random() < 0.65
          ? q.correctIndex
          : ((q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4);
        submitAnswer(io, state, p.id, ans);
      }, delay);
    }
  }

  startTimer(state.roomCode, QUESTION_TIME, (sec) => {
    state.timer = sec;
    io.to(state.roomCode).emit('timer-tick', sec);
  }, () => {
    finishQuestion(io, state);
  });
}

export function submitAnswer(io: Server, state: GameState, playerId: string, answer: number) {
  const s = getRState(state);
  if (!s || s.phase !== 'fight') return;
  if (!(playerId in state.players)) return;
  if (!s.alive[playerId]) return;
  if (s.currentAnswers[playerId] != null) return;
  if (answer < 0 || answer > 3) return;
  s.currentAnswers[playerId] = answer;
  s.answerTimes[playerId] = Date.now() - s.questionStartedAt;
  broadcast(io, state);

  // If all alive answered, end early
  const allAnswered = aliveIds(state, s).every((id) => s.currentAnswers[id] != null);
  if (allAnswered) {
    clearTimer(state.roomCode);
    finishQuestion(io, state);
  }
}

function finishQuestion(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s || !s.currentQuestion || !s.currentMonster) return;
  const q = s.currentQuestion;

  // Tally majority among alive players
  const counts: Record<number, number> = {};
  for (const id of aliveIds(state, s)) {
    const a = s.currentAnswers[id];
    if (a == null) continue;
    counts[a] = (counts[a] || 0) + 1;
  }
  let teamPick: number | null = null;
  let topCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > topCount) {
      topCount = v;
      teamPick = Number(k);
    }
  }
  const correct = teamPick !== null && teamPick === q.correctIndex;

  let damageToMonster = 0;
  let damageToTeam = 0;

  if (correct) {
    // Sum damage from all alive players who answered correctly
    let total = 0;
    const fastThresholdMs = (QUESTION_TIME * 1000) * 0.5; // first half = "fast"
    for (const id of aliveIds(state, s)) {
      if (s.currentAnswers[id] !== q.correctIndex) continue;
      const e = s.effects[id];
      let dmg = BASE_DAMAGE + (e.bladeBonus || 0);
      if (e.speedBonus && (s.answerTimes[id] ?? Infinity) < fastThresholdMs) {
        dmg = Math.round(dmg * 1.3);
      }
      if (e.furyRoundsLeft > 0) {
        dmg *= 2;
      }
      total += dmg;
    }
    // If nobody answered correctly individually but team majority got it, fallback
    if (total === 0 && teamPick === q.correctIndex) {
      total = BASE_DAMAGE;
    }
    if (s.teamLuckPending > 0) {
      total = Math.round(total * 1.1);
    }
    damageToMonster = total;
    s.currentMonster.hp = Math.max(0, s.currentMonster.hp - damageToMonster);
  } else {
    // Team takes damage. Distribute TEAM_DAMAGE across alive players.
    const aliveList = aliveIds(state, s);
    if (aliveList.length > 0) {
      const per = Math.ceil(TEAM_DAMAGE / aliveList.length);
      for (const id of aliveList) {
        const e = s.effects[id];
        let dmg = per;
        if (e.shieldCharges > 0) {
          // Shield absorbs the entire incoming hit for this player
          e.shieldCharges -= 1;
          dmg = 0;
        }
        s.hp[id] = Math.max(0, (s.hp[id] ?? 0) - dmg);
        if (s.hp[id] <= 0) {
          s.alive[id] = false;
        }
        damageToTeam += dmg;
      }
    }
  }

  // Decrement fury rounds (consumed for everyone after the round resolves)
  for (const id of Object.keys(s.effects)) {
    if (s.effects[id].furyRoundsLeft > 0) s.effects[id].furyRoundsLeft -= 1;
  }
  // Team luck consumed
  if (s.teamLuckPending > 0) s.teamLuckPending -= 1;

  s.lastRoundSummary = {
    correctIndex: q.correctIndex,
    teamPick,
    correct,
    damageToMonster,
    damageToTeam,
    answers: { ...s.currentAnswers },
  };

  s.phase = 'results';
  state.phase = 'results';
  state.timer = RESULT_TIME;
  state.maxTimer = RESULT_TIME;

  io.to(state.roomCode).emit('mode-rpgr-round-result' as any, {
    correctIndex: q.correctIndex,
    teamPick,
    correct,
    damageToMonster,
    damageToTeam,
    answers: s.currentAnswers,
    monster: s.currentMonster,
  });
  broadcast(io, state);

  // Check defeat (everyone dead)
  if (aliveIds(state, s).length === 0) {
    setTimeout(() => {
      if (!getRState(state)) return;
      finishGame(io, state, false);
    }, RESULT_TIME * 1000);
    startTimer(state.roomCode, RESULT_TIME, (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    }, () => { /* handled */ });
    return;
  }

  // Check monster defeated
  if (s.currentMonster.hp <= 0) {
    s.monstersKilled += 1;
    s.round += 1;
    startTimer(state.roomCode, RESULT_TIME, (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    }, () => {
      const cur = getRState(state);
      if (!cur) return;
      if (cur.round >= cur.total) {
        finishGame(io, state, true);
      } else {
        startRewardPhase(io, state);
      }
    });
    return;
  }

  // Otherwise, next question on same monster
  startTimer(state.roomCode, RESULT_TIME, (sec) => {
    state.timer = sec;
    io.to(state.roomCode).emit('timer-tick', sec);
  }, () => {
    if (!getRState(state)) return;
    askQuestion(io, state);
  });
}

function startRewardPhase(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s) return;
  s.phase = 'reward';
  s.rewardOptions = {};
  s.rewardPicks = {};
  state.phase = 'reward';
  state.timer = REWARD_TIME;
  state.maxTimer = REWARD_TIME;

  for (const p of Object.values(state.players)) {
    const cards = pickRandomCards(3).map((c) => c.id);
    s.rewardOptions[p.id] = cards;
    s.rewardPicks[p.id] = null;
    if (!p.isBot) {
      io.to(p.id).emit('mode-rpgr-reward-options' as any, {
        options: cards.map((id) => RPGR_CARDS.find((c) => c.id === id)!),
        timeLimit: REWARD_TIME,
      });
    }
  }
  broadcast(io, state);

  // Bots pick after a short delay
  for (const p of Object.values(state.players)) {
    if (p.isBot) {
      const delay = 1000 + Math.random() * 4000;
      setTimeout(() => {
        const cur = getRState(state);
        if (!cur || cur.phase !== 'reward') return;
        if (cur.rewardPicks[p.id] != null) return;
        const opts = cur.rewardOptions[p.id];
        if (!opts || opts.length === 0) return;
        const pick = opts[Math.floor(Math.random() * opts.length)];
        applyRewardPick(io, state, p.id, pick);
      }, delay);
    }
  }

  startTimer(state.roomCode, REWARD_TIME, (sec) => {
    state.timer = sec;
    io.to(state.roomCode).emit('timer-tick', sec);
  }, () => {
    finishRewardPhase(io, state);
  });
}

export function applyRewardPick(io: Server, state: GameState, playerId: string, cardId: RpgrCardId | string) {
  const s = getRState(state);
  if (!s || s.phase !== 'reward') return;
  if (!(playerId in state.players)) return;
  if (s.rewardPicks[playerId] != null) return;
  const opts = s.rewardOptions[playerId] || [];
  const id = cardId as RpgrCardId;
  if (!opts.includes(id)) return;
  s.rewardPicks[playerId] = id;
  applyCardEffect(s, playerId, id);
  broadcast(io, state);

  // If all picked → finish early
  const allPicked = Object.keys(state.players).every((pid) => s.rewardPicks[pid] != null);
  if (allPicked) {
    clearTimer(state.roomCode);
    finishRewardPhase(io, state);
  }
}

function applyCardEffect(s: RpgrState, playerId: string, id: RpgrCardId) {
  const e = s.effects[playerId];
  if (!e) return;
  e.cards.push(id);
  switch (id) {
    case 'sharp-blade':
      e.bladeBonus += 20;
      break;
    case 'life-elixir':
      s.hp[playerId] = PLAYER_HP;
      s.alive[playerId] = true;
      break;
    case 'shield':
      e.shieldCharges += 1;
      break;
    case 'speed':
      e.speedBonus = true;
      break;
    case 'luck':
      s.teamLuckPending = Math.max(s.teamLuckPending, 1);
      break;
    case 'fury':
      e.furyRoundsLeft += 1;
      break;
    case 'revive':
      // Revive is now an activated ability: the player must explicitly
      // choose a target via 'mode-rpgr-use-revive'. We just stock a charge.
      e.reviveAvailable += 1;
      break;
    case 'wisdom':
      e.wisdomCharges += 1;
      break;
  }
}

function finishRewardPhase(io: Server, state: GameState) {
  const s = getRState(state);
  if (!s) return;
  // Auto-pick for any non-pickers (default to first option)
  for (const pid of Object.keys(state.players)) {
    if (s.rewardPicks[pid] == null) {
      const opts = s.rewardOptions[pid];
      if (opts && opts[0]) {
        s.rewardPicks[pid] = opts[0];
        applyCardEffect(s, pid, opts[0]);
      }
    }
  }
  broadcast(io, state);
  // Spawn next monster
  setTimeout(() => {
    const cur = getRState(state);
    if (!cur) return;
    startNextMonster(io, state);
  }, 800);
}

function finishGame(io: Server, state: GameState, victory: boolean) {
  const s = getRState(state);
  if (!s) return;
  s.phase = victory ? 'victory' : 'defeat';
  state.phase = victory ? 'victory' : 'defeat';
  clearTimer(state.roomCode);

  const loot: Record<string, RpgrCardId[]> = {};
  for (const id of Object.keys(state.players)) {
    loot[id] = s.effects[id]?.cards ?? [];
  }

  io.to(state.roomCode).emit('mode-rpgr-game-over' as any, {
    victory,
    monstersKilled: s.monstersKilled,
    total: s.total,
    loot,
  });
  io.to(state.roomCode).emit('game-over', victory, {
    mode: 'rpg-rewards',
    victory,
    monstersKilled: s.monstersKilled,
    total: s.total,
    loot,
  });
  broadcast(io, state);
}

const handler: ModeHandler = {
  start(io, state) {
    clearTimer(state.roomCode);

    const monsters: MonsterRuntime[] = RPGR_MONSTERS.map((m, i) => ({
      index: i,
      name: m.name,
      emoji: m.emoji,
      hp: m.hp,
      max: m.hp,
    }));

    const effects: Record<string, PlayerEffects> = {};
    const hp: Record<string, number> = {};
    const alive: Record<string, boolean> = {};
    for (const p of Object.values(state.players)) {
      effects[p.id] = newPlayerEffects();
      hp[p.id] = PLAYER_HP;
      alive[p.id] = true;
      // Mirror hp on canonical player struct so generic UIs still work
      p.personalHp = PLAYER_HP;
      p.maxPersonalHp = PLAYER_HP;
      p.isAlive = true;
    }

    const allQuestions = toRpgrQuestions(getSimpleData('rpg-rewards', state.contentPacks?.['rpg-rewards']).questions);

    const s: RpgrState = {
      round: 0,
      total: monsters.length,
      phase: 'fight',
      monsters,
      currentMonster: null,
      questions: allQuestions,
      questionPool: pickRpgrQuestions(allQuestions, 35),
      currentQuestion: null,
      currentAnswers: {},
      answerTimes: {},
      questionStartedAt: 0,
      rewardOptions: {},
      rewardPicks: {},
      effects,
      hp,
      alive,
      teamLuckPending: 0,
      monstersKilled: 0,
      lastRoundSummary: null,
    };
    RPGR_STATES.set(state.roomCode, s);

    state.phase = 'floor-intro';
    state.currentFloor = 0;
    state.totalFloors = s.total;
    state.lastResults = null;
    broadcast(io, state);

    setTimeout(() => {
      const cur = getRState(state);
      if (!cur) return;
      startNextMonster(io, state);
    }, 1000);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-rpgr-answer', (index: number) => {
      const state = getState();
      if (!state || state.gameMode !== 'rpg-rewards') return;
      submitAnswer(io, state, socket.id, Number(index));
    });

    socket.on('mode-rpgr-reward-pick', (cardId: string) => {
      const state = getState();
      if (!state || state.gameMode !== 'rpg-rewards') return;
      applyRewardPick(io, state, socket.id, String(cardId));
    });

    socket.on('mode-rpgr-use-wisdom', () => {
      const state = getState();
      if (!state || state.gameMode !== 'rpg-rewards') return;
      const s = getRState(state);
      if (!s || s.phase !== 'fight') return;
      const q = s.currentQuestion;
      if (!q) return;
      const e = s.effects[socket.id];
      if (!e || e.wisdomCharges <= 0) return;
      if (!s.alive[socket.id]) return;
      // Already answered? Don't waste the charge.
      if (s.currentAnswers[socket.id] != null) return;

      // Pick 2 random wrong indexes to eliminate.
      const wrongIndexes = [0, 1, 2, 3].filter((i) => i !== q.correctIndex);
      // Shuffle and take 2.
      for (let i = wrongIndexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrongIndexes[i], wrongIndexes[j]] = [wrongIndexes[j], wrongIndexes[i]];
      }
      const eliminated = wrongIndexes.slice(0, 2);

      e.wisdomCharges -= 1;
      // Send privately to the requesting player only.
      io.to(socket.id).emit('mode-rpgr-wisdom-result' as any, {
        questionId: q.id,
        eliminated,
      });
      broadcast(io, state);
    });

    socket.on('mode-rpgr-use-revive', (payload: { targetId?: string } | string) => {
      const state = getState();
      if (!state || state.gameMode !== 'rpg-rewards') return;
      const s = getRState(state);
      if (!s) return;
      const targetId = typeof payload === 'string' ? payload : payload?.targetId;
      if (!targetId || !(targetId in state.players)) return;
      const e = s.effects[socket.id];
      if (!e || e.reviveAvailable <= 0) return;
      // Caller must still be alive themselves (you can't cast from the grave).
      if (!s.alive[socket.id]) return;
      // Target must currently be dead.
      if (s.alive[targetId]) return;
      // Cannot revive yourself.
      if (targetId === socket.id) return;

      e.reviveAvailable -= 1;
      s.hp[targetId] = 50;
      s.alive[targetId] = true;
      const target = state.players[targetId];
      if (target) {
        target.personalHp = 50;
        target.isAlive = true;
      }
      broadcast(io, state);
    });
  },

  stop(_io, state) {
    clearTimer(state.roomCode);
    RPGR_STATES.delete(state.roomCode);
  },
};

export default handler;
