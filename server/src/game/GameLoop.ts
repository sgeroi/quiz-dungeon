import type { Server } from 'socket.io';
import type { GameState, Question, RoundResult, DungeonConfig, Floor, PerkId } from '../../../shared/types.ts';
import { generateFloors } from './FloorGenerator.ts';
import { MODE_HANDLERS } from '../modes/index.ts';
import { startTimer, clearTimer } from '../utils/TimerManager.ts';
import { QUESTIONS } from '../data/questions.ts';
import {
  PERKS,
  PERK_BY_ID,
  acquirePerk,
  applyOutgoingDamageBonuses,
  consumePerksAfterCorrect,
  absorbHit,
  teamLuckMultiplier,
  consumeTeamLuck,
  pickPerkOptions,
  buildRewardRotation,
} from './Perks.ts';

const usedQuestions = new Map<string, Set<string>>();

function getUsedSet(roomCode: string): Set<string> {
  if (!usedQuestions.has(roomCode)) usedQuestions.set(roomCode, new Set());
  return usedQuestions.get(roomCode)!;
}

function pickQuestion(difficulty: 'easy' | 'medium' | 'hard', roomCode: string): Question | null {
  const used = getUsedSet(roomCode);
  let pool = QUESTIONS.filter(q => q.difficulty === difficulty && !used.has(q.id));
  if (pool.length === 0) pool = QUESTIONS.filter(q => q.difficulty === difficulty);
  if (pool.length === 0) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  used.add(q.id);
  return q;
}

function sanitize(q: Question): Omit<Question, 'correctIndex'> {
  const { correctIndex: _, ...rest } = q;
  return rest;
}

function getAlive(state: GameState) {
  return Object.values(state.players).filter(p => p.isAlive);
}

function getCaptainId(state: GameState): string {
  const alive = getAlive(state);
  const host = alive.find(p => p.id === state.hostId);
  if (host) return host.id;
  const human = alive.find(p => !p.isBot);
  return human?.id ?? alive[0]?.id ?? Object.keys(state.players)[0];
}

function applyDamageToAll(state: GameState, dmg: number, playersHit: string[]): void {
  for (const p of getAlive(state)) {
    // Shield perks (rpg-rewards) absorb the entire incoming hit once. In
    // classic mode players never have perks so this is a no-op there.
    const { dmg: actual } = absorbHit(p, dmg);
    p.personalHp -= actual;
    if (actual > 0) playersHit.push(p.id);
    if (p.personalHp <= 0) { p.personalHp = 0; p.isAlive = false; }
  }
}

function applyMonsterDamage(floor: Floor, damageDealt: number): boolean {
  if (!floor.monster) return true;
  floor.monster.currentHp -= damageDealt;
  if (floor.monster.currentHp <= 0) {
    floor.monster.currentHp = 0;
    floor.isCompleted = true;
    return true;
  }
  return false;
}

function scheduleBotAnswer(io: Server, state: GameState, bot: any, correctIndex: number, timeLimit: number): void {
  const delay = 1000 + Math.random() * (timeLimit * 1000 - 2000);
  setTimeout(() => {
    if (state.phase !== 'answering' || bot.currentAnswer !== null) return;
    const isCorrect = Math.random() < 0.7;
    const answer = isCorrect ? correctIndex : ((correctIndex + 1 + Math.floor(Math.random() * 3)) % 4);
    submitAnswer(io, bot.id, state, answer);
  }, Math.max(500, delay));
}

// ==================== START GAME ====================

export function startGame(io: Server, roomCode: string, state: GameState, config?: DungeonConfig): void {
  const playerCount = Object.keys(state.players).length;
  const mode = state.gameMode ?? 'classic';

  // Delegate to mode handler if non-classic mode is chosen.
  const modeHandler = MODE_HANDLERS[mode];
  if (modeHandler) {
    // Reset players for the new game (HP, ready, etc.)
    const hp = config?.personalHp ?? 100;
    for (const p of Object.values(state.players)) {
      p.personalHp = hp; p.maxPersonalHp = hp;
      p.abilityCooldown = 0; p.bonusDamage = 0;
      p.isAlive = true; p.isReady = false;
      p.currentAnswer = null; p.streak = 0;
      p.betAmount = undefined;
    }
    state.currentFloor = 0;
    state.lastResults = null;
    modeHandler.start(io, state);
    return;
  }

  state.floors = generateFloors(playerCount, config, mode);
  state.totalFloors = state.floors.length;
  state.currentFloor = 0;
  state.lastResults = null;

  if (mode === 'spy') {
    const humans = Object.values(state.players).filter(p => !p.isBot);
    state.spyId = humans.length > 0 ? humans[Math.floor(Math.random() * humans.length)].id : undefined;
  } else {
    state.spyId = undefined;
  }

  const hp = config?.personalHp ?? 100;
  for (const p of Object.values(state.players)) {
    p.personalHp = hp; p.maxPersonalHp = hp;
    p.abilityCooldown = 0; p.bonusDamage = 0;
    p.isAlive = true; p.isReady = false;
    p.currentAnswer = null; p.streak = 0;
    p.betAmount = undefined;
  }

  usedQuestions.set(roomCode, new Set());
  io.to(roomCode).emit('game-state', state);
  nextFloor(io, state);
}

// ==================== NEXT FLOOR ====================

export function nextFloor(io: Server, state: GameState): void {
  state.currentFloor++;
  if (state.currentFloor > state.totalFloors) {
    state.phase = 'victory';
    io.to(state.roomCode).emit('game-state', state);
    io.to(state.roomCode).emit('game-over', true, {});
    cleanup(state.roomCode);
    return;
  }

  const floor = state.floors[state.currentFloor - 1];
  state.phase = 'floor-intro';
  state.currentQuestion = null;
  state.lastResults = null;
  state.chainCurrentPlayer = undefined;
  state.chainQueue = undefined;
  state.sacrificePlayerId = undefined;
  state.captainId = undefined;
  state.betPhase = undefined;

  const { params } = floor;

  if (params.whoAnswers === 'captain') {
    state.captainId = getCaptainId(state);
    io.to(state.roomCode).emit('captain-assigned', state.captainId);
  }

  if (params.whoAnswers === 'sacrifice') {
    const alive = getAlive(state);
    const chosen = alive[Math.floor(Math.random() * alive.length)];
    state.sacrificePlayerId = chosen.id;
    io.to(state.roomCode).emit('sacrifice-chosen', chosen.id);
  }

  io.to(state.roomCode).emit('floor-start', floor);
  io.to(state.roomCode).emit('game-state', state);

  setTimeout(() => {
    startFloorQuestion(io, state);
  }, 6000);
}

// ==================== BET PHASE ====================

function startBetPhase(io: Server, state: GameState): void {
  state.betPhase = true;
  io.to(state.roomCode).emit('bet-phase');
  io.to(state.roomCode).emit('game-state', state);

  // Auto-bet for bot captain
  if (state.captainId) {
    const captain = state.players[state.captainId];
    if (captain?.isBot) {
      setTimeout(() => {
        submitBet(io, state.captainId!, state, Math.random() < 0.5 ? 5 : 10);
      }, 1500);
    }
  }
}

export function submitBet(io: Server, socketId: string, state: GameState, amount: number): void {
  if (!state.betPhase) return;
  const floor = state.floors[state.currentFloor - 1];
  if (floor.params.whoAnswers === 'captain' && socketId !== state.captainId) return;

  const player = state.players[socketId];
  if (!player) return;
  player.betAmount = amount > 0 ? (amount === 5 ? 5 : 10) : 0;

  state.betPhase = false;
  io.to(state.roomCode).emit('game-state', state);
}

// ==================== START QUESTION ====================

export function startFloorQuestion(io: Server, state: GameState): void {
  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;
  const { params } = floor;
  const timeLimit = params.timeLimit;

  for (const p of Object.values(state.players)) {
    p.currentAnswer = null;
    if (p.abilityCooldown > 0) p.abilityCooldown--;
  }

  // CHAIN mode — sequential questions
  if (params.whoAnswers === 'chain') {
    startChainMode(io, state, floor);
    return;
  }

  // PERSONAL questions — each player gets their own
  if (params.questionScope === 'personal') {
    state.phase = 'answering';
    state.timer = timeLimit;
    state.maxTimer = timeLimit;

    for (const p of getAlive(state)) {
      const q = pickQuestion(floor.difficulty, state.roomCode);
      if (q) {
        (p as any)._personalQ = q;
        io.to(p.id).emit('personal-question', sanitize(q), timeLimit);
        if (p.isBot) scheduleBotAnswer(io, state, p, q.correctIndex, timeLimit);
      }
    }

    io.to(state.roomCode).emit('game-state', state);
    startTimer(state.roomCode, timeLimit,
      r => { state.timer = r; io.to(state.roomCode).emit('timer-tick', r); },
      () => resolveRound(io, state));
    return;
  }

  // SHARED question — captain / sacrifice / everyone
  const q = pickQuestion(floor.difficulty, state.roomCode);
  if (!q) { floor.isCompleted = true; nextFloor(io, state); return; }

  floor.question = q;
  state.currentQuestion = sanitize(q);
  state.phase = 'answering';
  state.timer = timeLimit;
  state.maxTimer = timeLimit;

  io.to(state.roomCode).emit('question', sanitize(q), timeLimit);
  io.to(state.roomCode).emit('game-state', state);

  // Bet phase: captain sees question, then bet overlay appears
  if (params.bet && params.whoAnswers === 'captain') {
    startBetPhase(io, state);
  }

  // Schedule bot answers
  const bots = getAlive(state).filter(p => p.isBot);
  for (const bot of bots) {
    if (params.whoAnswers === 'captain' && bot.id !== state.captainId) continue;
    if (params.whoAnswers === 'sacrifice' && bot.id !== state.sacrificePlayerId) continue;
    scheduleBotAnswer(io, state, bot, q.correctIndex, timeLimit);
  }

  startTimer(state.roomCode, timeLimit,
    r => { state.timer = r; io.to(state.roomCode).emit('timer-tick', r); },
    () => resolveRound(io, state));
}

// ==================== CHAIN MODE ====================

function startChainMode(io: Server, state: GameState, floor: Floor): void {
  const alive = getAlive(state);
  const totalQuestions = Math.max(alive.length * 2, 6);
  const queue: string[] = [];
  for (let i = 0; i < totalQuestions; i++) {
    queue.push(alive[Math.floor(Math.random() * alive.length)].id);
  }

  state.chainQueue = queue;
  state.phase = 'chain-turn';
  io.to(state.roomCode).emit('game-state', state);

  nextChainTurn(io, state, floor);
}

function nextChainTurn(io: Server, state: GameState, floor: Floor): void {
  if (!state.chainQueue || state.chainQueue.length === 0) {
    resolveChain(io, state);
    return;
  }

  const nextId = state.chainQueue.shift()!;
  const player = state.players[nextId];
  if (!player || !player.isAlive) {
    nextChainTurn(io, state, floor);
    return;
  }

  state.chainCurrentPlayer = nextId;
  player.currentAnswer = null;
  state.phase = 'chain-turn';
  state.timer = floor.params.timeLimit;
  state.maxTimer = floor.params.timeLimit;

  const q = pickQuestion(floor.difficulty, state.roomCode);
  if (!q) { resolveChain(io, state); return; }

  (player as any)._chainQ = q;
  floor.question = q;
  state.currentQuestion = sanitize(q);

  io.to(state.roomCode).emit('chain-turn', nextId, sanitize(q), floor.params.timeLimit);
  io.to(state.roomCode).emit('game-state', state);

  if (player.isBot) {
    scheduleBotAnswer(io, state, player, q.correctIndex, floor.params.timeLimit);
  }

  startTimer(state.roomCode, floor.params.timeLimit,
    r => { state.timer = r; io.to(state.roomCode).emit('timer-tick', r); },
    () => {
      // Time's up for this player — count as wrong
      const chainQ = (player as any)._chainQ;
      const correct = player.currentAnswer === chainQ?.correctIndex;
      io.to(state.roomCode).emit('chain-result', nextId, correct);

      if (!correct) {
        player.personalHp -= 15;
        if (player.personalHp <= 0) { player.personalHp = 0; player.isAlive = false; }
      }

      delete (player as any)._chainQ;
      io.to(state.roomCode).emit('game-state', state);

      setTimeout(() => nextChainTurn(io, state, floor), 1500);
    });
}

function resolveChain(io: Server, state: GameState): void {
  clearTimer(state.roomCode);
  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;

  let totalDamage = 0;
  for (const p of Object.values(state.players)) {
    totalDamage += (p.streak ?? 0) * 5;
  }

  const monsterDefeated = applyMonsterDamage(floor, totalDamage);

  if (!monsterDefeated && floor.monster) {
    const playersHit: string[] = [];
    applyDamageToAll(state, floor.monster.attack, playersHit);
  }

  floor.isCompleted = true;
  state.phase = 'results';

  const results: RoundResult = {
    correctIndex: 0,
    playerAnswers: {},
    damageDealt: totalDamage,
    damageTaken: monsterDefeated ? 0 : (floor.monster?.attack ?? 0),
    monsterDefeated,
    playersHit: monsterDefeated ? [] : getAlive(state).map(p => p.id),
  };
  state.lastResults = results;

  io.to(state.roomCode).emit('round-results', results);
  io.to(state.roomCode).emit('game-state', state);

  if (getAlive(state).length === 0) {
    state.phase = 'defeat';
    io.to(state.roomCode).emit('game-state', state);
    io.to(state.roomCode).emit('game-over', false, {});
    cleanup(state.roomCode);
    return;
  }

  setTimeout(() => nextFloor(io, state), 8000);
}

// ==================== SUBMIT ANSWER ====================

export function submitAnswer(io: Server, socketId: string, state: GameState, answerIndex: number): void {
  const player = state.players[socketId];
  if (!player || !player.isAlive) return;
  if (player.currentAnswer !== null) return;

  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;
  const { params } = floor;

  // Chain mode — handle individually
  if (state.phase === 'chain-turn') {
    if (socketId !== state.chainCurrentPlayer) return;
    player.currentAnswer = answerIndex;
    player.answerTime = state.maxTimer - state.timer;

    clearTimer(state.roomCode);
    const chainQ = (player as any)._chainQ as Question | undefined;
    const correct = chainQ ? answerIndex === chainQ.correctIndex : false;

    if (correct) {
      player.streak = (player.streak ?? 0) + 1;
    } else {
      player.personalHp -= 15;
      player.streak = 0;
      if (player.personalHp <= 0) { player.personalHp = 0; player.isAlive = false; }
    }

    delete (player as any)._chainQ;
    io.to(state.roomCode).emit('chain-result', socketId, correct);
    io.to(state.roomCode).emit('game-state', state);

    setTimeout(() => nextChainTurn(io, state, floor), 1500);
    return;
  }

  if (state.phase !== 'answering') return;

  // Captain: only captain can answer
  if (params.whoAnswers === 'captain' && socketId !== state.captainId) return;
  // Sacrifice: only chosen player
  if (params.whoAnswers === 'sacrifice' && socketId !== state.sacrificePlayerId) return;

  player.currentAnswer = answerIndex;
  player.answerTime = state.maxTimer - state.timer;
  io.to(state.roomCode).emit('game-state', state);

  // Captain/sacrifice: resolve immediately
  if (params.whoAnswers === 'captain' || params.whoAnswers === 'sacrifice') {
    clearTimer(state.roomCode);
    resolveRound(io, state);
    return;
  }

  // Everyone: check if all alive answered
  if (getAlive(state).every(p => p.currentAnswer !== null)) {
    clearTimer(state.roomCode);
    resolveRound(io, state);
  }
}

// ==================== RESOLVE ROUND ====================

export function resolveRound(io: Server, state: GameState): void {
  clearTimer(state.roomCode);
  state.phase = 'results';

  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;
  const { params } = floor;

  const alive = getAlive(state);
  const playerAnswers: Record<string, number | null> = {};
  for (const p of Object.values(state.players)) playerAnswers[p.id] = p.currentAnswer;

  let damageDealt = 0;
  let damageTaken = 0;
  let monsterDefeated = false;
  const playersHit: string[] = [];
  const playerDamage: Record<string, number> = {};

  // ---- PERSONAL questions ----
  if (params.questionScope === 'personal') {
    for (const p of alive) {
      const pQ = (p as any)._personalQ as Question | undefined;
      if (!pQ) continue;
      if (p.currentAnswer === pQ.correctIndex) {
        const dmg = applyOutgoingDamageBonuses(p, 15, { wasFast: false });
        playerDamage[p.id] = dmg;
        damageDealt += dmg;
        p.streak++;
        consumePerksAfterCorrect(p);
        io.to(p.id).emit('personal-result', true, 0);
      } else {
        playerDamage[p.id] = 0;
        const hit = absorbHit(p, 20);
        p.personalHp -= hit.dmg;
        if (hit.dmg > 0) playersHit.push(p.id);
        p.streak = 0;
        io.to(p.id).emit('personal-result', false, hit.dmg);
        if (p.personalHp <= 0) { p.personalHp = 0; p.isAlive = false; }
      }
      delete (p as any)._personalQ;
    }

    monsterDefeated = applyMonsterDamage(floor, damageDealt);
    if (!monsterDefeated && floor.monster) {
      damageTaken = floor.monster.attack;
      applyDamageToAll(state, damageTaken, playersHit);
    }

  // ---- CAPTAIN ----
  } else if (params.whoAnswers === 'captain') {
    const q = floor.question!;
    const captain = state.players[state.captainId!];
    const correct = captain?.currentAnswer === q.correctIndex;
    const bet = captain?.betAmount ?? 0;

    if (correct && captain) {
      damageDealt = applyOutgoingDamageBonuses(captain, 20 + bet * 2, { wasFast: false });
      playerDamage[state.captainId!] = damageDealt;
      consumePerksAfterCorrect(captain);
    } else {
      damageTaken = (floor.monster?.attack ?? 10) + bet;
      applyDamageToAll(state, damageTaken, playersHit);
    }

    monsterDefeated = applyMonsterDamage(floor, damageDealt);
    captain && (captain.betAmount = undefined);

  // ---- SACRIFICE ----
  } else if (params.whoAnswers === 'sacrifice') {
    const q = floor.question!;
    const victim = state.players[state.sacrificePlayerId!];
    const correct = victim?.currentAnswer === q.correctIndex;

    if (correct && victim) {
      damageDealt = applyOutgoingDamageBonuses(victim, 30, { wasFast: false });
      consumePerksAfterCorrect(victim);
      floor.isCompleted = true;
    } else if (victim) {
      victim.personalHp = 0;
      victim.isAlive = false;
      playersHit.push(victim.id);
      damageTaken = 0;
      floor.isCompleted = true;
    }

    monsterDefeated = applyMonsterDamage(floor, damageDealt);

  // ---- EVERYONE (speed / normal / isolation) ----
  } else {
    const q = floor.question!;
    const fastThreshold = state.maxTimer * 0.5;
    for (const p of alive) {
      if (p.currentAnswer === q.correctIndex) {
        let baseDmg: number;
        let wasFast = (p.answerTime ?? Infinity) < fastThreshold;
        if (params.speedScaling) {
          const t = p.answerTime ?? state.maxTimer;
          const speedBonus = Math.max(0, (state.maxTimer - t) / state.maxTimer);
          baseDmg = 8 + Math.round(speedBonus * 22) + p.bonusDamage;
        } else {
          baseDmg = 15 + p.bonusDamage;
        }
        const dmg = applyOutgoingDamageBonuses(p, baseDmg, { wasFast });
        playerDamage[p.id] = Math.round(dmg);
        damageDealt += dmg;
        p.streak++;
        consumePerksAfterCorrect(p);
      } else {
        playerDamage[p.id] = 0;
        p.streak = 0;
      }
      p.bonusDamage = 0;
    }

    damageDealt = Math.round(damageDealt);
    monsterDefeated = applyMonsterDamage(floor, damageDealt);

    if (!monsterDefeated && floor.monster) {
      damageTaken = floor.monster.attack;

      if (params.damageMode === 'wrong-only') {
        // Damage only players who answered wrong
        const wrongPlayers = alive.filter(p => p.currentAnswer !== q.correctIndex);
        if (wrongPlayers.length > 0) {
          const dmgPer = Math.round(damageTaken * alive.length / wrongPlayers.length);
          for (const p of wrongPlayers) {
            p.personalHp -= dmgPer;
            playersHit.push(p.id);
            if (p.personalHp <= 0) { p.personalHp = 0; p.isAlive = false; }
          }
        }
      } else {
        // Default: damage everyone equally
        if (params.speedScaling) {
          for (const p of alive) {
            if (p.currentAnswer !== q.correctIndex) {
              p.personalHp -= 15;
              playersHit.push(p.id);
              if (p.personalHp <= 0) { p.personalHp = 0; p.isAlive = false; }
            }
          }
        }
        applyDamageToAll(state, damageTaken, playersHit);
      }
    }
  }

  // Apply team-luck multiplier (rpg-rewards) and consume the stack.
  const luckMul = teamLuckMultiplier(state);
  if (luckMul > 1 && damageDealt > 0) {
    const before = damageDealt;
    damageDealt = Math.round(damageDealt * luckMul);
    if (floor.monster && !monsterDefeated) {
      // Re-apply the extra slice of damage to the monster.
      const extra = damageDealt - before;
      monsterDefeated = applyMonsterDamage(floor, extra);
    }
  }
  consumeTeamLuck(state);

  // Check defeat
  if (getAlive(state).length === 0) {
    state.phase = 'defeat';
    io.to(state.roomCode).emit('game-state', state);
    io.to(state.roomCode).emit('game-over', false, {});
    cleanup(state.roomCode);
    return;
  }

  const results: RoundResult = {
    correctIndex: floor.question?.correctIndex ?? 0,
    playerAnswers,
    playerDamage: (params.speedScaling || params.questionScope === 'personal') ? playerDamage : undefined,
    damageDealt,
    damageTaken,
    monsterDefeated,
    playersHit,
  };
  state.lastResults = results;

  io.to(state.roomCode).emit('round-results', results);
  io.to(state.roomCode).emit('game-state', state);

  if (floor.isCompleted) {
    // In rpg-rewards, insert a perk-pick phase between floors. The phase is
    // skipped on the final floor (we go straight to victory via nextFloor).
    if (state.gameMode === 'rpg-rewards' && state.currentFloor < state.totalFloors) {
      setTimeout(() => startRewardPhase(io, state), 8000);
    } else {
      setTimeout(() => nextFloor(io, state), 8000);
    }
  } else {
    setTimeout(() => startFloorQuestion(io, state), 8000);
  }
}

// ==================== REWARD PHASE (rpg-rewards) ====================

const REWARD_PICK_TIME = 25;

export function startRewardPhase(io: Server, state: GameState): void {
  if (state.gameMode !== 'rpg-rewards') return;

  const rotation = buildRewardRotation(state);
  if (rotation.length === 0) {
    nextFloor(io, state);
    return;
  }

  state.phase = 'reward';
  state.rewardPhase = {
    rotation,
    turnIndex: 0,
    currentPickerId: rotation[0],
    options: pickPerkOptions(3),
    picked: [],
  };
  state.timer = REWARD_PICK_TIME;
  state.maxTimer = REWARD_PICK_TIME;
  state.currentQuestion = null;

  io.to(state.roomCode).emit('game-state', state);

  // Schedule a per-pick timer; if the active picker times out, auto-pick.
  startTimer(state.roomCode, REWARD_PICK_TIME,
    (r) => { state.timer = r; io.to(state.roomCode).emit('timer-tick', r); },
    () => {
      const rp = state.rewardPhase;
      if (!rp || !rp.currentPickerId) return;
      const opts = rp.options;
      const auto = opts[Math.floor(Math.random() * opts.length)];
      submitRewardPick(io, state, rp.currentPickerId, auto);
    });

  // If the first picker is a bot, auto-pick after a short delay.
  scheduleBotRewardPick(io, state);
}

function scheduleBotRewardPick(io: Server, state: GameState): void {
  const rp = state.rewardPhase;
  if (!rp || !rp.currentPickerId) return;
  const player = state.players[rp.currentPickerId];
  if (!player?.isBot) return;
  const opts = [...rp.options];
  const pickerId = rp.currentPickerId;
  setTimeout(() => {
    if (state.rewardPhase?.currentPickerId !== pickerId) return;
    const choice = opts[Math.floor(Math.random() * opts.length)];
    submitRewardPick(io, state, pickerId, choice);
  }, 1200 + Math.random() * 1500);
}

export function submitRewardPick(io: Server, state: GameState, playerId: string, perkId: PerkId | string): void {
  const rp = state.rewardPhase;
  if (!rp) return;
  if (rp.currentPickerId !== playerId) return;
  const id = perkId as PerkId;
  if (!rp.options.includes(id)) return;
  if (!PERK_BY_ID[id]) return;

  const player = state.players[playerId];
  if (!player) return;

  acquirePerk(player, id);
  rp.picked.push(playerId);
  clearTimer(state.roomCode);

  // Advance to the next picker, or finish if everyone has picked.
  rp.turnIndex += 1;
  if (rp.turnIndex >= rp.rotation.length) {
    state.rewardPhase = undefined;
    io.to(state.roomCode).emit('game-state', state);
    setTimeout(() => nextFloor(io, state), 1500);
    return;
  }

  rp.currentPickerId = rp.rotation[rp.turnIndex];
  rp.options = pickPerkOptions(3);
  state.timer = REWARD_PICK_TIME;
  state.maxTimer = REWARD_PICK_TIME;

  io.to(state.roomCode).emit('game-state', state);

  // Re-arm timeout for the new picker.
  startTimer(state.roomCode, REWARD_PICK_TIME,
    (r) => { state.timer = r; io.to(state.roomCode).emit('timer-tick', r); },
    () => {
      const cur = state.rewardPhase;
      if (!cur || !cur.currentPickerId) return;
      const auto = cur.options[Math.floor(Math.random() * cur.options.length)];
      submitRewardPick(io, state, cur.currentPickerId, auto);
    });

  scheduleBotRewardPick(io, state);
}

function cleanup(roomCode: string) {
  usedQuestions.delete(roomCode);
  clearTimer(roomCode);
}

// ==================== CHEAT ====================

export function cheatWinQuestion(io: Server, state: GameState): void {
  if (state.phase !== 'answering') return;
  const floor = state.floors[state.currentFloor - 1];
  if (!floor?.question) return;

  for (const p of getAlive(state)) {
    p.currentAnswer = floor.question.correctIndex;
    p.answerTime = 1;
  }

  clearTimer(state.roomCode);
  resolveRound(io, state);
}

export function cheatSkipFloor(io: Server, state: GameState): void {
  if (!['answering', 'floor-intro', 'chain-turn', 'results'].includes(state.phase)) return;
  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;

  clearTimer(state.roomCode);
  floor.isCompleted = true;
  if (floor.monster) {
    floor.monster.currentHp = 0;
  }
  // In rpg-rewards, route through the reward phase between floors.
  if (state.gameMode === 'rpg-rewards' && state.currentFloor < state.totalFloors) {
    startRewardPhase(io, state);
  } else {
    nextFloor(io, state);
  }
}
