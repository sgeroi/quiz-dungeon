import type { Server } from 'socket.io';
import type { GameState, Question, RoundResult, DungeonConfig, Floor, PerkId, Player, GameOverStats } from '../../../shared/types.ts';
import { generateFloors } from './FloorGenerator.ts';
import { MODE_HANDLERS } from '../modes/index.ts';
import { startTimer, clearTimer } from '../utils/TimerManager.ts';
import { playersOfTeam, teamsWithPlayers } from '../utils/teams.ts';
import { QUESTIONS } from '../data/questions.ts';
import { getSimpleData } from '../data/contentStore.ts';
import type { SimpleQuestionsData } from '../../../shared/content.ts';
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
// Per-room question pool taken from the chosen content pack at game start.
const roomPools = new Map<string, Question[]>();
// Per-room number of rounds played on the current floor (teams-mode round cap).
const floorRounds = new Map<string, number>();

/** teams: bonus for killing the team's monster (boss floors give more). */
const FLOOR_CLEAR_BONUS = 50;
const BOSS_CLEAR_BONUS = 100;
/** teams: a floor ends for everyone after this many rounds even if some monsters survived. */
const MAX_TEAM_ROUNDS = 4;

function getUsedSet(roomCode: string): Set<string> {
  if (!usedQuestions.has(roomCode)) usedQuestions.set(roomCode, new Set());
  return usedQuestions.get(roomCode)!;
}

/** Convert pack questions to the engine's Question shape (category/difficulty defaults). */
function packToQuestions(data: SimpleQuestionsData): Question[] {
  return data.questions.map(q => ({
    id: q.id,
    text: q.text,
    options: [...q.options],
    correctIndex: q.correctIndex,
    category: q.category ?? 'Общее',
    difficulty: q.difficulty ?? 'medium',
  }));
}

function pickQuestion(difficulty: 'easy' | 'medium' | 'hard', roomCode: string): Question | null {
  const used = getUsedSet(roomCode);
  const all = roomPools.get(roomCode) ?? QUESTIONS;
  let pool = all.filter(q => q.difficulty === difficulty && !used.has(q.id));
  if (pool.length === 0) pool = all.filter(q => q.difficulty === difficulty);
  // Pack may lack this difficulty entirely — fall back to any unused, then any.
  if (pool.length === 0) pool = all.filter(q => !used.has(q.id));
  if (pool.length === 0) pool = all;
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

// ==================== TEAM FORMATS ====================
//
// coop  — the whole party fights one monster (legacy behaviour, untouched).
// ffa   — same battle as coop, plus personal points (state.classicScores).
// teams — every team fights its own copy of the floor monster; HP, score and
//         roles (captain / sacrifice) live in state.teamBattle[teamId].
//
// Everything below is expressed through "battle groups": one group with
// teamId=null for coop/ffa, one group per non-empty team in teams-mode.

interface BattleGroup {
  teamId: string | null;
  /** Alive members of the group. */
  members: Player[];
}

function isTeams(state: GameState): boolean { return state.teamMode === 'teams'; }
function isFfa(state: GameState): boolean { return state.teamMode === 'ffa'; }

/** Groups that still have alive members (teams with everyone dead are out of the fight). */
function activeGroups(state: GameState): BattleGroup[] {
  if (isTeams(state)) {
    return teamsWithPlayers(state)
      .map(t => ({ teamId: t.id, members: playersOfTeam(state, t.id).filter(p => p.isAlive) }))
      .filter(g => g.members.length > 0);
  }
  return [{ teamId: null, members: getAlive(state) }];
}

function teamEntry(state: GameState, teamId: string | null | undefined) {
  if (!teamId || !state.teamBattle) return undefined;
  return state.teamBattle[teamId];
}

function isCaptain(state: GameState, playerId: string): boolean {
  if (isTeams(state)) return teamEntry(state, state.players[playerId]?.teamId)?.captainId === playerId;
  return state.captainId === playerId;
}

function isSacrifice(state: GameState, playerId: string): boolean {
  if (isTeams(state)) return teamEntry(state, state.players[playerId]?.teamId)?.sacrificeId === playerId;
  return state.sacrificePlayerId === playerId;
}

function captainOf(state: GameState, g: BattleGroup): Player | undefined {
  const id = g.teamId ? teamEntry(state, g.teamId)?.captainId : state.captainId;
  return id ? state.players[id] : undefined;
}

function sacrificeOf(state: GameState, g: BattleGroup): Player | undefined {
  const id = g.teamId ? teamEntry(state, g.teamId)?.sacrificeId : state.sacrificePlayerId;
  return id ? state.players[id] : undefined;
}

/** Host if alive and in the group, else first alive human, else first alive member. */
function pickCaptain(state: GameState, members: Player[]): string {
  const host = members.find(p => p.id === state.hostId);
  if (host) return host.id;
  const human = members.find(p => !p.isBot);
  return human?.id ?? members[0]?.id ?? Object.keys(state.players)[0];
}

function getCaptainId(state: GameState): string {
  return pickCaptain(state, getAlive(state));
}

/** Is the group's monster already dead (or floor already marked cleared for it)? */
function groupCleared(state: GameState, floor: Floor, g: BattleGroup): boolean {
  if (g.teamId) {
    const tb = teamEntry(state, g.teamId);
    return !tb || tb.floorCleared || tb.monsterHp <= 0;
  }
  return floor.isCompleted || !floor.monster || floor.monster.currentHp <= 0;
}

/**
 * Deal damage to the group's monster. Returns true when the monster is dead
 * afterwards. In teams-mode also awards the floor-clear bonus (once).
 */
function hitMonster(state: GameState, floor: Floor, g: BattleGroup, dmg: number): boolean {
  if (g.teamId) {
    const tb = teamEntry(state, g.teamId);
    if (!tb) return true;
    if (tb.monsterHp <= 0) return true;
    tb.monsterHp = Math.max(0, tb.monsterHp - Math.round(dmg));
    if (tb.monsterHp <= 0) {
      tb.floorCleared = true;
      tb.score += floor.isBoss || floor.monster?.isBoss ? BOSS_CLEAR_BONUS : FLOOR_CLEAR_BONUS;
      return true;
    }
    return false;
  }
  return applyMonsterDamage(floor, dmg);
}

function addTeamScore(state: GameState, teamId: string | null, pts: number): void {
  const tb = teamEntry(state, teamId);
  if (tb) tb.score += Math.round(pts);
}

function addPlayerScore(state: GameState, playerId: string, pts: number): void {
  if (!isFfa(state)) return;
  if (!state.classicScores) state.classicScores = {};
  state.classicScores[playerId] = (state.classicScores[playerId] ?? 0) + Math.round(pts);
}

/** In teams-mode the floor is done when every fighting team killed its monster. */
function syncTeamFloorCompletion(state: GameState, floor: Floor): void {
  if (!isTeams(state)) return;
  const groups = activeGroups(state);
  if (groups.length > 0 && groups.every(g => groupCleared(state, floor, g))) {
    floor.isCompleted = true;
    if (floor.monster) floor.monster.currentHp = 0;
  }
}

/** Per-team monster HP: rescale the party-scaled HP to the team size. */
function teamMonsterHp(floor: Floor, teamSize: number, partySize: number): number {
  if (!floor.monster) return 0;
  const k = floor.isBoss || floor.monster.isBoss ? 0.2 : 0.15;
  const scaled = floor.monster.maxHp * (1 + teamSize * k) / (1 + partySize * k);
  return Math.max(1, Math.round(scaled));
}

/** game-over payload per docs/TEAMS.md. */
function buildStats(state: GameState): GameOverStats {
  const stats: GameOverStats = { teamMode: state.teamMode ?? 'coop' };
  if (isFfa(state)) {
    const scores: Record<string, number> = {};
    for (const p of Object.values(state.players)) scores[p.id] = state.classicScores?.[p.id] ?? 0;
    stats.scores = scores;
    const best = Object.values(state.players)
      .slice()
      .sort((a, b) => (scores[b.id] - scores[a.id]) || (Number(b.isAlive) - Number(a.isAlive)) || (b.personalHp - a.personalHp))[0];
    if (best) stats.winnerPlayerId = best.id;
  }
  if (isTeams(state)) {
    const teamScores: Record<string, number> = {};
    for (const t of state.teams ?? []) teamScores[t.id] = state.teamBattle?.[t.id]?.score ?? 0;
    stats.teamScores = teamScores;
    const best = (state.teams ?? [])
      .slice()
      .sort((a, b) => {
        const d = teamScores[b.id] - teamScores[a.id];
        if (d !== 0) return d;
        const hp = (id: string) => playersOfTeam(state, id).reduce((s, p) => s + (p.isAlive ? p.personalHp : 0), 0);
        return hp(b.id) - hp(a.id);
      })[0];
    if (best) stats.winnerTeamId = best.id;
  }
  return stats;
}

function endGame(io: Server, state: GameState, victory: boolean): void {
  state.phase = victory ? 'victory' : 'defeat';
  io.to(state.roomCode).emit('game-state', state);
  io.to(state.roomCode).emit('game-over', victory, buildStats(state));
  cleanup(state.roomCode);
}

function applyDamageToPlayers(players: Player[], dmg: number, playersHit: string[]): void {
  for (const p of players) {
    if (!p.isAlive) continue;
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

  // Team-format bookkeeping.
  state.teamBattle = undefined;
  state.classicScores = undefined;
  if (isTeams(state)) {
    state.teamBattle = {};
    for (const t of state.teams ?? []) {
      state.teamBattle[t.id] = { monsterHp: 0, monsterMaxHp: 0, floorCleared: false, score: 0 };
    }
  } else if (isFfa(state)) {
    state.classicScores = {};
    for (const p of Object.values(state.players)) state.classicScores[p.id] = 0;
  }

  usedQuestions.set(roomCode, new Set());
  floorRounds.set(roomCode, 0);
  roomPools.set(roomCode, packToQuestions(getSimpleData(mode, state.contentPacks?.[mode])));
  io.to(roomCode).emit('game-state', state);
  nextFloor(io, state);
}

// ==================== NEXT FLOOR ====================

export function nextFloor(io: Server, state: GameState): void {
  state.currentFloor++;
  if (state.currentFloor > state.totalFloors) {
    endGame(io, state, true);
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
  floorRounds.set(state.roomCode, 0);

  const { params } = floor;

  if (isTeams(state)) {
    // Fresh monster copy + roles for every team.
    const partySize = Object.keys(state.players).length;
    if (!state.teamBattle) state.teamBattle = {};
    for (const t of state.teams ?? []) {
      const members = playersOfTeam(state, t.id);
      const alive = members.filter(p => p.isAlive);
      const prev = state.teamBattle[t.id];
      const hp = teamMonsterHp(floor, Math.max(1, members.length), partySize);
      state.teamBattle[t.id] = {
        monsterHp: hp,
        monsterMaxHp: hp,
        floorCleared: false,
        score: prev?.score ?? 0,
        captainId: params.whoAnswers === 'captain' && alive.length > 0 ? pickCaptain(state, alive) : undefined,
        sacrificeId: params.whoAnswers === 'sacrifice' && alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)].id : undefined,
      };
    }
  } else {
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

  // Auto-bet for bot captains (one per team in teams-mode).
  for (const g of activeGroups(state)) {
    const captain = captainOf(state, g);
    if (captain?.isBot) {
      const id = captain.id;
      setTimeout(() => {
        submitBet(io, id, state, Math.random() < 0.5 ? 5 : 10);
      }, 1500);
    }
  }
}

export function submitBet(io: Server, socketId: string, state: GameState, amount: number): void {
  if (!state.betPhase) return;
  const floor = state.floors[state.currentFloor - 1];
  if (floor.params.whoAnswers === 'captain' && !isCaptain(state, socketId)) return;

  const player = state.players[socketId];
  if (!player) return;
  player.betAmount = amount > 0 ? (amount === 5 ? 5 : 10) : 0;

  // teams: wait until every alive captain placed a bet (or answered).
  const pending = isTeams(state)
    ? activeGroups(state).some(g => {
        const c = captainOf(state, g);
        return !!c && c.isAlive && c.betAmount === undefined && c.currentAnswer === null;
      })
    : false;
  if (!pending) state.betPhase = false;
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
  floorRounds.set(state.roomCode, (floorRounds.get(state.roomCode) ?? 0) + 1);
  if (isTeams(state) && state.teamBattle) {
    for (const [teamId, tb] of Object.entries(state.teamBattle)) {
      tb.lastDamageDealt = undefined; tb.lastDamageTaken = undefined; tb.lastDefeated = undefined;
      // Re-pick a team captain if the previous one fell during this floor.
      if (params.whoAnswers === 'captain' && tb.captainId && !state.players[tb.captainId]?.isAlive) {
        const alive = playersOfTeam(state, teamId).filter(p => p.isAlive);
        tb.captainId = alive.length > 0 ? pickCaptain(state, alive) : undefined;
      }
    }
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
    if (params.whoAnswers === 'captain' && !isCaptain(state, bot.id)) continue;
    if (params.whoAnswers === 'sacrifice' && !isSacrifice(state, bot.id)) continue;
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
  if (isTeams(state)) {
    // Round-robin over teams so every team gets the same number of questions.
    const groups = activeGroups(state);
    for (let i = 0; i < totalQuestions; i++) {
      const g = groups[i % groups.length];
      if (!g) break;
      queue.push(g.members[Math.floor(Math.random() * g.members.length)].id);
    }
  } else {
    for (let i = 0; i < totalQuestions; i++) {
      queue.push(alive[Math.floor(Math.random() * alive.length)].id);
    }
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
  let totalTaken = 0;
  let anyDefeated = false;
  const playersHit: string[] = [];

  if (isTeams(state)) {
    for (const t of teamsWithPlayers(state)) {
      const members = playersOfTeam(state, t.id);
      const g: BattleGroup = { teamId: t.id, members: members.filter(p => p.isAlive) };
      const tb = teamEntry(state, t.id);
      let dmg = 0;
      for (const p of members) dmg += (p.streak ?? 0) * 5;
      const wasCleared = groupCleared(state, floor, g);
      const defeated = !wasCleared && g.members.length > 0 && hitMonster(state, floor, g, dmg);
      addTeamScore(state, t.id, dmg);
      let taken = 0;
      if (!wasCleared && !defeated && floor.monster && g.members.length > 0) {
        taken = floor.monster.attack;
        applyDamageToPlayers(g.members, taken, playersHit);
      }
      if (tb) {
        tb.lastDamageDealt = dmg; tb.lastDamageTaken = taken; tb.lastDefeated = defeated;
        tb.floorCleared = true; // chain always ends the floor
      }
      totalDamage += dmg;
      totalTaken = Math.max(totalTaken, taken);
      anyDefeated = anyDefeated || defeated;
    }
    floor.isCompleted = true;
    if (floor.monster && Object.values(state.teamBattle ?? {}).every(tb => tb.monsterHp <= 0)) floor.monster.currentHp = 0;
  } else {
    for (const p of Object.values(state.players)) {
      const d = (p.streak ?? 0) * 5;
      totalDamage += d;
      addPlayerScore(state, p.id, d);
    }

    anyDefeated = applyMonsterDamage(floor, totalDamage);

    if (!anyDefeated && floor.monster) {
      totalTaken = floor.monster.attack;
      applyDamageToPlayers(getAlive(state), totalTaken, playersHit);
    }
  }

  floor.isCompleted = true;
  state.phase = 'results';

  const results: RoundResult = {
    correctIndex: 0,
    playerAnswers: {},
    damageDealt: totalDamage,
    damageTaken: totalTaken,
    monsterDefeated: anyDefeated,
    playersHit: isTeams(state) ? playersHit : (anyDefeated ? [] : getAlive(state).map(p => p.id)),
  };
  state.lastResults = results;

  io.to(state.roomCode).emit('round-results', results);
  io.to(state.roomCode).emit('game-state', state);

  if (getAlive(state).length === 0) {
    endGame(io, state, false);
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

  // Captain: only captain(s) can answer
  if (params.whoAnswers === 'captain' && !isCaptain(state, socketId)) return;
  // Sacrifice: only chosen player(s)
  if (params.whoAnswers === 'sacrifice' && !isSacrifice(state, socketId)) return;

  player.currentAnswer = answerIndex;
  player.answerTime = state.maxTimer - state.timer;
  io.to(state.roomCode).emit('game-state', state);

  // Captain/sacrifice: resolve when every answerer has answered
  // (coop/ffa — there is exactly one; teams — one per fighting team).
  if (params.whoAnswers === 'captain' || params.whoAnswers === 'sacrifice') {
    const allIn = activeGroups(state).every(g => {
      const a = params.whoAnswers === 'captain' ? captainOf(state, g) : sacrificeOf(state, g);
      return !a || !a.isAlive || a.currentAnswer !== null;
    });
    if (allIn) {
      clearTimer(state.roomCode);
      resolveRound(io, state);
    }
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
  state.betPhase = false;

  const floor = state.floors[state.currentFloor - 1];
  if (!floor) return;
  const { params } = floor;

  const playerAnswers: Record<string, number | null> = {};
  for (const p of Object.values(state.players)) playerAnswers[p.id] = p.currentAnswer;

  let damageDealt = 0;
  let damageTaken = 0;
  let monsterDefeated = false;
  const playersHit: string[] = [];
  const playerDamage: Record<string, number> = {};

  const groups = activeGroups(state);
  const q = floor.question;

  for (const g of groups) {
    const alive = g.members;
    const tb = teamEntry(state, g.teamId);
    const wasCleared = groupCleared(state, floor, g);
    let gDealt = 0;
    let gTaken = 0;
    let gDefeated = false;

    // ---- PERSONAL questions ----
    if (params.questionScope === 'personal') {
      for (const p of alive) {
        const pQ = (p as any)._personalQ as Question | undefined;
        if (!pQ) continue;
        if (p.currentAnswer === pQ.correctIndex) {
          const dmg = applyOutgoingDamageBonuses(p, 15, { wasFast: false });
          playerDamage[p.id] = dmg;
          gDealt += dmg;
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

      gDefeated = !wasCleared && hitMonster(state, floor, g, gDealt);
      if (!wasCleared && !gDefeated && floor.monster) {
        gTaken = floor.monster.attack;
        applyDamageToPlayers(alive, gTaken, playersHit);
      }

    // ---- CAPTAIN ----
    } else if (params.whoAnswers === 'captain') {
      const captain = captainOf(state, g);
      const correct = !!q && captain?.currentAnswer === q.correctIndex;
      const bet = captain?.betAmount ?? 0;

      if (correct && captain) {
        gDealt = applyOutgoingDamageBonuses(captain, 20 + bet * 2, { wasFast: false });
        playerDamage[captain.id] = gDealt;
        consumePerksAfterCorrect(captain);
      } else {
        if (captain) playerDamage[captain.id] = 0;
        gTaken = (floor.monster?.attack ?? 10) + bet;
        if (!wasCleared) applyDamageToPlayers(alive, gTaken, playersHit);
        else gTaken = 0;
      }

      gDefeated = !wasCleared && hitMonster(state, floor, g, gDealt);
      if (captain) captain.betAmount = undefined;

    // ---- SACRIFICE ----
    } else if (params.whoAnswers === 'sacrifice') {
      const victim = sacrificeOf(state, g);
      const correct = !!q && victim?.currentAnswer === q.correctIndex;

      if (correct && victim) {
        gDealt = applyOutgoingDamageBonuses(victim, 30, { wasFast: false });
        playerDamage[victim.id] = gDealt;
        consumePerksAfterCorrect(victim);
      } else if (victim) {
        playerDamage[victim.id] = 0;
        victim.personalHp = 0;
        victim.isAlive = false;
        playersHit.push(victim.id);
        gTaken = 0;
      }
      // Sacrifice always ends the floor for the group, whatever the outcome.
      if (tb) tb.floorCleared = true; else floor.isCompleted = true;

      gDefeated = !wasCleared && hitMonster(state, floor, g, gDealt);

    // ---- EVERYONE (speed / normal / isolation) ----
    } else if (q) {
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
          gDealt += dmg;
          p.streak++;
          consumePerksAfterCorrect(p);
        } else {
          playerDamage[p.id] = 0;
          p.streak = 0;
        }
        p.bonusDamage = 0;
      }

      gDealt = Math.round(gDealt);
      gDefeated = !wasCleared && hitMonster(state, floor, g, gDealt);

      if (!wasCleared && !gDefeated && floor.monster) {
        gTaken = floor.monster.attack;

        if (params.damageMode === 'wrong-only') {
          // Damage only players who answered wrong
          const wrongPlayers = alive.filter(p => p.currentAnswer !== q.correctIndex);
          if (wrongPlayers.length > 0) {
            const dmgPer = Math.round(gTaken * alive.length / wrongPlayers.length);
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
          applyDamageToPlayers(alive, gTaken, playersHit);
        }
      }
    }

    // Apply team-luck multiplier (rpg-rewards, coop only) and consume the stack.
    if (!g.teamId) {
      const luckMul = teamLuckMultiplier(state);
      if (luckMul > 1 && gDealt > 0) {
        const before = gDealt;
        gDealt = Math.round(gDealt * luckMul);
        if (floor.monster && !gDefeated) {
          // Re-apply the extra slice of damage to the monster.
          const extra = gDealt - before;
          gDefeated = applyMonsterDamage(floor, extra);
        }
      }
      consumeTeamLuck(state);
    }

    // Scoring.
    if (tb) {
      tb.score += Math.round(gDealt);
      tb.lastDamageDealt = Math.round(gDealt);
      tb.lastDamageTaken = gTaken;
      tb.lastDefeated = gDefeated;
    }

    damageDealt += gDealt;
    damageTaken = Math.max(damageTaken, gTaken);
    monsterDefeated = monsterDefeated || gDefeated;
  }

  // ffa: personal points = damage contributed this round.
  if (isFfa(state)) {
    for (const [pid, dmg] of Object.entries(playerDamage)) addPlayerScore(state, pid, dmg);
  }

  // teams: floor ends when every fighting team is done, or after the round cap.
  if (isTeams(state)) {
    syncTeamFloorCompletion(state, floor);
    monsterDefeated = floor.isCompleted && monsterDefeated;
    if (!floor.isCompleted && (floorRounds.get(state.roomCode) ?? 0) >= MAX_TEAM_ROUNDS) {
      floor.isCompleted = true;
    }
  }

  // Check defeat
  if (getAlive(state).length === 0) {
    endGame(io, state, false);
    return;
  }

  const results: RoundResult = {
    correctIndex: floor.question?.correctIndex ?? 0,
    playerAnswers,
    playerDamage: (params.speedScaling || params.questionScope === 'personal' || isFfa(state) || isTeams(state)) ? playerDamage : undefined,
    damageDealt: Math.round(damageDealt),
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
  roomPools.delete(roomCode);
  floorRounds.delete(roomCode);
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
  if (state.teamBattle) {
    for (const tb of Object.values(state.teamBattle)) { tb.monsterHp = 0; tb.floorCleared = true; }
  }
  // In rpg-rewards, route through the reward phase between floors.
  if (state.gameMode === 'rpg-rewards' && state.currentFloor < state.totalFloors) {
    startRewardPhase(io, state);
  } else {
    nextFloor(io, state);
  }
}
