import type { Server, Socket } from 'socket.io';
import type { GameOverStats, GameState, Player, TeamMode } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { groupByTeam, teamsWithPlayers } from '../../utils/teams.ts';
import { BUCKET_SETS, type BucketSet } from './sets.ts';
import { getBucketsData } from '../../data/contentStore.ts';

// Sets from the chosen content pack, per room.
const setsByRoom = new Map<string, BucketSet[]>();

function getSets(roomCode: string): BucketSet[] {
  const sets = setsByRoom.get(roomCode);
  return sets && sets.length > 0 ? sets : BUCKET_SETS;
}

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

/** Per-team round breakdown (teams-mode). */
interface TeamRoundResult {
  correct: number;   // sum of members' correct placements
  max: number;       // members * items
  members: number;
  points: number;    // what was added to teamScores
}

interface BucketsState {
  round: number;                 // 1..TOTAL_ROUNDS
  totalRounds: number;
  /** Mirrors state.teamMode at game start (coop: golem; ffa/teams: no golem, no damage). */
  teamMode: TeamMode;
  /** Only meaningful in coop; kept in every format so old screens don't break. */
  boss: { hp: number; maxHp: number; emoji: string; name: string };
  /** Cumulative personal points, playerId -> points (all formats; ffa uses it for the rating). */
  scores: Record<string, number>;
  /** teams: cumulative points per team. */
  teamScores?: Record<string, number>;
  /** teams: 'sum' when all teams are equal-sized, 'avg' (avg per player ×10, rounded) otherwise. */
  teamScoring?: 'sum' | 'avg';
  /** playerId -> Date.now() when the player pressed "done" (speed bonus). */
  submittedAt: Record<string, number>;
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
  /** ffa: points earned this round (correct + speed bonus). */
  lastRoundPoints?: Record<string, number>;
  /** ffa: speed bonus part of lastRoundPoints. */
  lastSpeedBonus?: Record<string, number>;
  /** teams: per-team breakdown for the round just scored. */
  lastTeamRound?: Record<string, TeamRoundResult>;
  // Reveal answers in results screen.
  answers?: number[]; // correct bucket per item
}

const SPEED_BONUS_MAX = 5;          // ffa: max bonus points per round
const SPEED_BONUS_MIN_ACCURACY = 0.75; // ffa: bonus only if at least this share is correct

interface RoomTimers {
  round?: ReturnType<typeof setTimeout>;
  results?: ReturnType<typeof setTimeout>;
  ticker?: ReturnType<typeof setInterval>;
}

const timers = new Map<string, RoomTimers>();

// Correct bucket per item for the current round, kept OUT of the broadcast
// state while players are sorting (state.buckets goes to every phone and TV
// screen). Copied into bs.answers only when the round is scored.
const answerKeys = new Map<string, number[]>();

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

function pickSetIndex(round: number, setCount: number): number {
  // Deterministic, but offset randomly per game start.
  const offset = Math.floor(Math.random() * setCount);
  return (round - 1 + offset) % setCount;
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
  const sets = getSets(state.roomCode);
  const setIndex = pickSetIndex(bs.round, sets.length);
  const original = sets[setIndex];

  // Build a shuffled item array, but we need the answer key indexed identically.
  const indexed = original.items.map((it, i) => ({ ...it, originalIdx: i }));
  const shuffled = shuffle(indexed);
  const publicItems = shuffled.map(it => ({ text: it.text }));
  const answers = shuffled.map(it => it.bucket);

  bs.setIndex = setIndex;
  bs.publicSet = buildPublicSet(original, publicItems);
  answerKeys.set(state.roomCode, answers);
  bs.answers = undefined; // revealed in endRound
  bs.submissions = {};
  bs.submitted = {};
  bs.submittedAt = {};
  for (const p of Object.values(state.players)) {
    bs.submissions[p.id] = {};
    bs.scores[p.id] ??= 0;
  }
  bs.lastRoundScores = undefined;
  bs.lastRoundCorrect = undefined;
  bs.lastTeamCorrect = undefined;
  bs.lastTeamMax = undefined;
  bs.lastDamageDealt = undefined;
  bs.lastDamageTaken = undefined;
  bs.lastBossPrevHp = undefined;
  bs.lastRoundPoints = undefined;
  bs.lastSpeedBonus = undefined;
  bs.lastTeamRound = undefined;

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
  const answers = answerKeys.get(state.roomCode) ?? [];
  bs.answers = answers; // reveal for the results screens
  const playerCorrect: Record<string, number> = {};
  for (const pid of Object.keys(state.players)) {
    const subs = bs.submissions[pid] ?? {};
    let n = 0;
    for (let i = 0; i < answers.length; i++) {
      if (subs[i] === answers[i]) n++;
    }
    playerCorrect[pid] = n;
  }
  bs.lastRoundCorrect = playerCorrect;
  bs.lastRoundScores = playerCorrect;

  if (bs.teamMode === 'ffa') scoreFfaRound(state, bs, playerCorrect, answers.length);
  else if (bs.teamMode === 'teams') scoreTeamsRound(state, bs, playerCorrect, answers.length);
  else scoreCoopRound(state, bs, playerCorrect, answers.length);

  state.phase = 'results';
  state.timer = RESULTS_TIME;
  state.maxTimer = RESULTS_TIME;
  io.to(state.roomCode).emit('game-state', state);

  if (bs.teamMode === 'coop') {
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
  }

  // Last round?
  if (bs.round >= bs.totalRounds) {
    setTimeout(() => finishGame(io, state, bs.teamMode === 'coop' ? bs.boss.hp <= 0 : true), RESULTS_TIME * 1000);
    return;
  }

  const next = setTimeout(() => startRound(io, state), RESULTS_TIME * 1000);
  setTimers(state.roomCode, { results: next });
}

// =============== Scoring per format ===============

/** coop: everyone's correct placements damage the golem; the golem strikes back. */
function scoreCoopRound(state: GameState, bs: BucketsState, playerCorrect: Record<string, number>, items: number): void {
  const aliveIds = getAlive(state).map(p => p.id);
  let teamCorrect = 0;
  for (const pid of aliveIds) teamCorrect += playerCorrect[pid] ?? 0;

  const teamMax = items * aliveIds.length;
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

  for (const pid of Object.keys(playerCorrect)) bs.scores[pid] = (bs.scores[pid] ?? 0) + playerCorrect[pid];
  bs.lastTeamCorrect = teamCorrect;
  bs.lastTeamMax = teamMax;
  bs.lastDamageDealt = damageDealt;
  bs.lastDamageTaken = damageTaken;
  bs.lastBossPrevHp = bossPrevHp;
}

/**
 * ffa: points = correct placements + speed bonus. The bonus (0..SPEED_BONUS_MAX)
 * scales with the time left when the player pressed "done" and is granted only
 * when every item was placed and at least 75% of them are correct.
 */
function scoreFfaRound(state: GameState, bs: BucketsState, playerCorrect: Record<string, number>, items: number): void {
  const points: Record<string, number> = {};
  const bonus: Record<string, number> = {};
  const roundMs = Math.max(1, bs.roundEndsAt - bs.roundStartedAt);
  for (const pid of Object.keys(state.players)) {
    const correct = playerCorrect[pid] ?? 0;
    const placed = Object.keys(bs.submissions[pid] ?? {}).length;
    const at = bs.submittedAt[pid];
    let b = 0;
    if (at && placed >= items && items > 0 && correct / items >= SPEED_BONUS_MIN_ACCURACY) {
      const left = Math.max(0, Math.min(roundMs, bs.roundEndsAt - at));
      b = Math.round((left / roundMs) * SPEED_BONUS_MAX);
    }
    bonus[pid] = b;
    points[pid] = correct + b;
    bs.scores[pid] = (bs.scores[pid] ?? 0) + points[pid];
  }
  bs.lastRoundPoints = points;
  bs.lastSpeedBonus = bonus;
}

/**
 * teams: team round score = sum of members' correct placements when all
 * non-empty teams are the same size; with unequal teams it is the average per
 * player ×10, rounded (so a bigger team cannot win just by head count).
 */
function scoreTeamsRound(state: GameState, bs: BucketsState, playerCorrect: Record<string, number>, items: number): void {
  const groups = groupByTeam(state);
  const active = teamsWithPlayers(state);
  const sizes = active.map(t => groups[t.id]?.length ?? 0);
  const equal = sizes.length > 0 && sizes.every(n => n === sizes[0]);
  bs.teamScoring = equal ? 'sum' : 'avg';
  bs.teamScores ??= {};
  const result: Record<string, TeamRoundResult> = {};
  for (const t of state.teams ?? []) {
    const members = groups[t.id] ?? [];
    let correct = 0;
    for (const p of members) correct += playerCorrect[p.id] ?? 0;
    const pts = members.length === 0
      ? 0
      : equal ? correct : Math.round((correct / members.length) * 10);
    result[t.id] = { correct, max: members.length * items, members: members.length, points: pts };
    bs.teamScores[t.id] = (bs.teamScores[t.id] ?? 0) + pts;
  }
  for (const pid of Object.keys(playerCorrect)) bs.scores[pid] = (bs.scores[pid] ?? 0) + playerCorrect[pid];
  bs.lastTeamRound = result;
}

function bestKey(scores: Record<string, number> | undefined, order: string[]): string | undefined {
  let best: string | undefined;
  let bestV = -Infinity;
  for (const k of order) {
    const v = scores?.[k] ?? 0;
    if (v > bestV) { best = k; bestV = v; }
  }
  return best;
}

function finishGame(io: Server, state: GameState, victoryOverride?: boolean): void {
  clearAllTimers(state.roomCode);
  const bs = getBucketsState(state);
  const teamMode: TeamMode = bs?.teamMode ?? state.teamMode ?? 'coop';
  const victory = teamMode !== 'coop'
    ? true
    : victoryOverride !== undefined
      ? victoryOverride
      : (bs ? bs.boss.hp <= 0 : false);

  state.phase = victory ? 'victory' : 'defeat';
  io.to(state.roomCode).emit('game-state', state);

  const stats: GameOverStats = {
    teamMode,
    rounds: bs?.round ?? 0,
    scores: bs?.scores ?? {},
  };
  if (teamMode === 'coop') {
    stats.bossHp = bs?.boss.hp ?? 0;
    stats.bossMaxHp = bs?.boss.maxHp ?? 0;
  } else if (teamMode === 'ffa') {
    stats.winnerPlayerId = bestKey(bs?.scores, Object.keys(state.players));
  } else {
    stats.teamScores = bs?.teamScores ?? {};
    stats.teamScoring = bs?.teamScoring;
    stats.winnerTeamId = bestKey(bs?.teamScores, (state.teams ?? []).map(t => t.id));
  }
  io.to(state.roomCode).emit('game-over', victory, stats);
}

// =============== Bots ===============

function scheduleBotAnswers(io: Server, state: GameState): void {
  const bs = getBucketsState(state);
  if (!bs) return;
  const bots = Object.values(state.players).filter(p => p.isBot && p.isAlive);
  if (bots.length === 0) return;
  const answers = answerKeys.get(state.roomCode) ?? [];

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
      cur.submittedAt[bot.id] = Date.now();
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
    setsByRoom.set(state.roomCode, getBucketsData(state.contentPacks?.buckets).sets);

    const playerCount = Object.keys(state.players).length;
    const aliveCount = Math.max(1, playerCount);
    // Boss HP tuned so that ~80% accuracy beats the boss, ~50% loses.
    // Max possible damage per game = ITEMS_PER_ROUND * TOTAL_ROUNDS * aliveCount * DAMAGE_PER_CORRECT
    //                              = 20 * 5 * aliveCount * 5 = 500 * aliveCount.
    // We set HP to ~80% of that ceiling so a near-perfect run wins comfortably,
    // a strong run barely wins, and a 50% run loses.
    const bossMaxHp = Math.max(300, 200 + aliveCount * 250);

    const teamMode: TeamMode = state.teamMode ?? 'coop';
    const scores: Record<string, number> = {};
    for (const id of Object.keys(state.players)) scores[id] = 0;
    const teamScores: Record<string, number> | undefined = teamMode === 'teams' ? {} : undefined;
    if (teamScores) for (const t of state.teams ?? []) teamScores[t.id] = 0;

    const bs: BucketsState = {
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      teamMode,
      boss: { hp: bossMaxHp, maxHp: bossMaxHp, emoji: '👹', name: 'Голем-Сортировщик' },
      scores,
      teamScores,
      setIndex: 0,
      publicSet: { title: '', buckets: [], items: [] },
      submissions: {},
      submitted: {},
      submittedAt: {},
      roundStartedAt: 0,
      roundEndsAt: 0,
      answers: undefined,
    };
    answerKeys.delete(state.roomCode);
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
      if (itemIdx < 0 || itemIdx >= Math.max(ITEMS_PER_ROUND, bs.publicSet.items.length)) return;
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
      bs.submittedAt[socket.id] ??= Date.now();

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

  // Screen (TV) joined mid-game: state.buckets already carries the public set.
  onScreenJoin(_io, socket, state) {
    socket.emit('game-state', state);
  },

  stop(_io, state) {
    clearAllTimers(state.roomCode);
    setsByRoom.delete(state.roomCode);
    answerKeys.delete(state.roomCode);
    delete (state as any).buckets;
  },
};

export default handler;
