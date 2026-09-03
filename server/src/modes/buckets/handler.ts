import type { Server, Socket } from 'socket.io';
import type { GameState, Player } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { BUCKET_SETS, type BucketSet } from './sets.ts';

const TOTAL_ROUNDS = 5;
const ROUND_TIME = 60; // seconds
const RESULTS_TIME = 5; // seconds between rounds
const ITEMS_PER_ROUND = 20;
const DAMAGE_PER_CORRECT = 5;

// Public-facing payload for clients (no answer keys leaked).
interface PublicSet {
  title: string;
  buckets: { name: string; emoji: string }[];
  items: { text: string }[];
}

interface BucketsState {
  round: number;                 // 1..TOTAL_ROUNDS
  totalRounds: number;
  boss: { hp: number; maxHp: number; emoji: string; name: string };
  setIndex: number;              // index into BUCKET_SETS
  publicSet: PublicSet;          // sanitized
  // playerId -> itemIdx -> bucketIdx (-1 = not placed)
  submissions: Record<string, Record<number, number>>;
  // playerId -> bool (clicked "done" early)
  submitted: Record<string, boolean>;
  roundStartedAt: number;
  roundEndsAt: number;
  // After scoring (during 'results'), the per-player counts.
  lastRoundScores?: Record<string, number>;
  lastRoundCorrect?: Record<string, number>; // correct map per player
  lastTeamCorrect?: number;
  lastTeamMax?: number;
  lastDamageDealt?: number;
  lastDamageTaken?: number;
  lastBossPrevHp?: number;
  // Reveal answers in results screen.
  answers?: number[]; // correct bucket per item
}

interface RoomTimers {
  round?: ReturnType<typeof setTimeout>;
  results?: ReturnType<typeof setTimeout>;
  ticker?: ReturnType<typeof setInterval>;
}

const timers = new Map<string, RoomTimers>();

function clearAllTimers(roomCode: string): void {
  const t = timers.get(roomCode);
  if (!t) return;
  if (t.round) clearTimeout(t.round);
  if (t.results) clearTimeout(t.results);
  if (t.ticker) clearInterval(t.ticker);
  timers.delete(roomCode);
}

function setTimers(roomCode: string, partial: Partial<RoomTimers>): void {
  const existing = timers.get(roomCode) ?? {};
  timers.set(roomCode, { ...existing, ...partial });
}

function getBucketsState(state: GameState): BucketsState | undefined {
  return (state as any).buckets as BucketsState | undefined;
}

function setBucketsState(state: GameState, bs: BucketsState): void {
  (state as any).buckets = bs;
}

function getAlive(state: GameState): Player[] {
  return Object.values(state.players).filter(p => p.isAlive);
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPublicSet(set: BucketSet, shuffledItems: { text: string }[]): PublicSet {
  return {
    title: set.title,
    buckets: set.buckets,
    items: shuffledItems,
  };
}

function pickSetIndex(round: number): number {
  // Deterministic, but offset randomly per game start.
  const offset = Math.floor(Math.random() * BUCKET_SETS.length);
  return (round - 1 + offset) % BUCKET_SETS.length;
}

// =============== Round lifecycle ===============

function startRound(io: Server, state: GameState): void {
  const bs = getBucketsState(state);
  if (!bs) return;

  bs.round += 1;
  if (bs.round > bs.totalRounds) {
    finishGame(io, state);
    return;
  }

  // Choose a set; shuffle items so order differs per round.
  const setIndex = pickSetIndex(bs.round);
  const original = BUCKET_SETS[setIndex];

  // Build a shuffled item array, but we need the answer key indexed identically.
  const indexed = original.items.map((it, i) => ({ ...it, originalIdx: i }));
  const shuffled = shuffle(indexed);
  const publicItems = shuffled.map(it => ({ text: it.text }));
  const answers = shuffled.map(it => it.bucket);

  bs.setIndex = setIndex;
  bs.publicSet = buildPublicSet(original, publicItems);
  bs.answers = answers;
  bs.submissions = {};
  bs.submitted = {};
  for (const p of Object.values(state.players)) {
    bs.submissions[p.id] = {};
  }
  bs.lastRoundScores = undefined;
  bs.lastRoundCorrect = undefined;
  bs.lastTeamCorrect = undefined;
  bs.lastTeamMax = undefined;
  bs.lastDamageDealt = undefined;
  bs.lastDamageTaken = undefined;
  bs.lastBossPrevHp = undefined;

  bs.roundStartedAt = Date.now();
  bs.roundEndsAt = bs.roundStartedAt + ROUND_TIME * 1000;

  state.phase = 'answering';
  state.timer = ROUND_TIME;
  state.maxTimer = ROUND_TIME;
  state.currentFloor = bs.round;
  state.totalFloors = bs.totalRounds;

  io.to(state.roomCode).emit('game-state', state);

  // Schedule bots to "answer" gradually
  scheduleBotAnswers(io, state);

  // Per-second ticker
  const ticker = setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    io.to(state.roomCode).emit('timer-tick', state.timer);
    if (state.timer <= 0) {
      const t = timers.get(state.roomCode);
      if (t?.ticker) {
        clearInterval(t.ticker);
        setTimers(state.roomCode, { ticker: undefined });
      }
    }
  }, 1000);

  const round = setTimeout(() => {
    endRound(io, state);
  }, ROUND_TIME * 1000);

  setTimers(state.roomCode, { round, ticker });
}

function endRound(io: Server, state: GameState): void {
  const bs = getBucketsState(state);
  if (!bs) return;

  const t = timers.get(state.roomCode);
  if (t?.round) clearTimeout(t.round);
  if (t?.ticker) clearInterval(t.ticker);
  setTimers(state.roomCode, { round: undefined, ticker: undefined });

  // Score
  const answers = bs.answers ?? [];
  const playerCorrect: Record<string, number> = {};
  let teamCorrect = 0;
  const aliveIds = getAlive(state).map(p => p.id);
  for (const pid of Object.keys(state.players)) {
    const subs = bs.submissions[pid] ?? {};
    let n = 0;
    for (let i = 0; i < answers.length; i++) {
      if (subs[i] === answers[i]) n++;
    }
    playerCorrect[pid] = n;
    // Only alive players contribute to team damage.
    if (aliveIds.includes(pid)) teamCorrect += n;
  }

  const teamMax = answers.length * aliveIds.length;
  const damageDealt = teamCorrect * DAMAGE_PER_CORRECT;
  const bossPrevHp = bs.boss.hp;
  bs.boss.hp = Math.max(0, bs.boss.hp - damageDealt);

  // Boss strikes back, distributed
  let damageTaken = 0;
  if (bs.boss.hp > 0) {
    const aliveNow = getAlive(state);
    const totalAttack = 30; // per round, distributed
    if (aliveNow.length > 0) {
      const per = Math.ceil(totalAttack / aliveNow.length);
      damageTaken = per;
      for (const p of aliveNow) {
        p.personalHp -= per;
        if (p.personalHp <= 0) {
          p.personalHp = 0;
          p.isAlive = false;
        }
      }
    }
  }

  bs.lastRoundCorrect = playerCorrect;
  bs.lastRoundScores = playerCorrect;
  bs.lastTeamCorrect = teamCorrect;
  bs.lastTeamMax = teamMax;
  bs.lastDamageDealt = damageDealt;
  bs.lastDamageTaken = damageTaken;
  bs.lastBossPrevHp = bossPrevHp;

  state.phase = 'results';
  state.timer = RESULTS_TIME;
  state.maxTimer = RESULTS_TIME;
  io.to(state.roomCode).emit('game-state', state);

  // Boss dead?
  if (bs.boss.hp <= 0) {
    setTimeout(() => finishGame(io, state, true), 2500);
    return;
  }

  // Everyone dead?
  if (getAlive(state).length === 0) {
    setTimeout(() => finishGame(io, state, false), 2500);
    return;
  }

  // Last round?
  if (bs.round >= bs.totalRounds) {
    setTimeout(() => finishGame(io, state, bs.boss.hp <= 0), RESULTS_TIME * 1000);
    return;
  }

  const next = setTimeout(() => startRound(io, state), RESULTS_TIME * 1000);
  setTimers(state.roomCode, { results: next });
}

function finishGame(io: Server, state: GameState, victoryOverride?: boolean): void {
  clearAllTimers(state.roomCode);
  const bs = getBucketsState(state);
  const victory = victoryOverride !== undefined
    ? victoryOverride
    : (bs ? bs.boss.hp <= 0 : false);

  state.phase = victory ? 'victory' : 'defeat';
  io.to(state.roomCode).emit('game-state', state);

  const stats: Record<string, unknown> = {
    rounds: bs?.round ?? 0,
    bossHp: bs?.boss.hp ?? 0,
    bossMaxHp: bs?.boss.maxHp ?? 0,
  };
  io.to(state.roomCode).emit('game-over', victory, stats);
}

// =============== Bots ===============

function scheduleBotAnswers(io: Server, state: GameState): void {
  const bs = getBucketsState(state);
  if (!bs) return;
  const bots = Object.values(state.players).filter(p => p.isBot && p.isAlive);
  if (bots.length === 0) return;
  const answers = bs.answers ?? [];

  for (const bot of bots) {
    // Bot accuracy ~70%; place all items quickly (1-5 seconds total)
    // so the round can end early when humans click "ready" without
    // a race condition where bots haven't submitted yet.
    const accuracy = 0.55 + Math.random() * 0.3;
    // Per-item delays distributed in [800, 4500] ms.
    const itemDelays: number[] = [];
    for (let i = 0; i < answers.length; i++) {
      itemDelays.push(800 + Math.random() * 3700);
    }
    // Final "submit" delay slightly after last placement.
    const finalDelay = Math.max(...itemDelays, 0) + 200 + Math.random() * 500;

    for (let i = 0; i < answers.length; i++) {
      const correct = answers[i];
      const choice = Math.random() < accuracy
        ? correct
        : (correct + 1 + Math.floor(Math.random() * 3)) % 4;
      setTimeout(() => {
        if (state.phase !== 'answering') return;
        const cur = getBucketsState(state);
        if (!cur || cur.round !== bs.round) return;
        cur.submissions[bot.id] = cur.submissions[bot.id] ?? {};
        cur.submissions[bot.id][i] = choice;
        // Light updates: emit progress every few placements.
        if (i % 5 === 0 || i === answers.length - 1) {
          io.to(state.roomCode).emit('game-state', state);
        }
      }, itemDelays[i]);
    }

    // Mark the bot as "submitted" once it has finished placing.
    setTimeout(() => {
      if (state.phase !== 'answering') return;
      const cur = getBucketsState(state);
      if (!cur || cur.round !== bs.round) return;
      cur.submitted[bot.id] = true;
      io.to(state.roomCode).emit('game-state', state);

      // If everyone (humans + bots) is now ready, end the round early.
      const alive = getAlive(state);
      const allDone = alive.every(p => cur.submitted[p.id]);
      if (allDone) {
        endRound(io, state);
      }
    }, finalDelay);
  }
}

// =============== Public API ===============

const handler: ModeHandler = {
  start(io, state) {
    clearAllTimers(state.roomCode);

    const playerCount = Object.keys(state.players).length;
    const aliveCount = Math.max(1, playerCount);
    // Boss HP tuned so that ~80% accuracy beats the boss, ~50% loses.
    // Max possible damage per game = ITEMS_PER_ROUND * TOTAL_ROUNDS * aliveCount * DAMAGE_PER_CORRECT
    //                              = 20 * 5 * aliveCount * 5 = 500 * aliveCount.
    // We set HP to ~80% of that ceiling so a near-perfect run wins comfortably,
    // a strong run barely wins, and a 50% run loses.
    const bossMaxHp = Math.max(300, 200 + aliveCount * 250);

    const bs: BucketsState = {
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      boss: { hp: bossMaxHp, maxHp: bossMaxHp, emoji: '👹', name: 'Голем-Сортировщик' },
      setIndex: 0,
      publicSet: { title: '', buckets: [], items: [] },
      submissions: {},
      submitted: {},
      roundStartedAt: 0,
      roundEndsAt: 0,
      answers: [],
    };
    setBucketsState(state, bs);

    state.totalFloors = TOTAL_ROUNDS;
    state.currentFloor = 0;
    state.phase = 'floor-intro';
    state.timer = 0;
    state.maxTimer = ROUND_TIME;
    state.lastResults = null;
    io.to(state.roomCode).emit('game-state', state);

    // Brief intro before round 1.
    setTimeout(() => startRound(io, state), 1500);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-buckets-place', (payload: { itemIdx: number; bucketIdx: number }) => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'buckets') return;
      if (state.phase !== 'answering') return;
      const bs = getBucketsState(state);
      if (!bs) return;
      const player = state.players[socket.id];
      if (!player || !player.isAlive) return;

      const { itemIdx, bucketIdx } = payload ?? ({} as any);
      if (typeof itemIdx !== 'number' || typeof bucketIdx !== 'number') return;
      if (itemIdx < 0 || itemIdx >= ITEMS_PER_ROUND) return;
      if (bucketIdx < -1 || bucketIdx > 3) return;

      bs.submissions[socket.id] = bs.submissions[socket.id] ?? {};
      if (bucketIdx === -1) {
        delete bs.submissions[socket.id][itemIdx];
      } else {
        bs.submissions[socket.id][itemIdx] = bucketIdx;
      }

      // Emit lightweight state. We keep submissions visible to all so live progress works.
      io.to(state.roomCode).emit('game-state', state);
    });

    socket.on('mode-buckets-submit', () => {
      const state = getState();
      if (!state) return;
      if (state.gameMode !== 'buckets') return;
      if (state.phase !== 'answering') return;
      const bs = getBucketsState(state);
      if (!bs) return;
      const player = state.players[socket.id];
      if (!player || !player.isAlive) return;

      bs.submitted[socket.id] = true;

      // End round early only if EVERY alive player (humans AND bots) has
      // marked themselves as submitted. Bots are scheduled to submit
      // within ~5s after round start (see scheduleBotAnswers), so this
      // closes the previous race where bots' answers were dropped because
      // humans clicked "ready" first.
      const alive = getAlive(state);
      const allDone = alive.every(p => bs.submitted[p.id]);
      io.to(state.roomCode).emit('game-state', state);
      if (allDone) {
        endRound(io, state);
      }
    });
  },

  stop(_io, state) {
    clearAllTimers(state.roomCode);
    delete (state as any).buckets;
  },
};

export default handler;
