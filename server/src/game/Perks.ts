import type { Server } from 'socket.io';
import type { GameState, PerkId, PerkInstance, Player } from '../../../shared/types.ts';

export interface PerkDef {
  id: PerkId;
  name: string;
  emoji: string;
  description: string;
  /** Active perks have a button; passive ones apply automatically. */
  active: boolean;
}

export const PERKS: PerkDef[] = [
  { id: 'sharp-blade', name: 'Острый клинок', emoji: '🗡️', description: '+10 к урону каждого правильного ответа.', active: false },
  { id: 'life-elixir', name: 'Эликсир жизни', emoji: '💚', description: 'Восстановить HP до полного. Используется кнопкой.', active: true },
  { id: 'shield',      name: 'Щит',           emoji: '🛡️', description: 'Поглощает один удар по тебе.', active: false },
  { id: 'speed',       name: 'Скорость',      emoji: '⚡', description: 'Быстрый правильный ответ — +30% урона.', active: false },
  { id: 'luck',        name: 'Удача',         emoji: '🍀', description: '+10% к урону команды на следующий раунд (стак).', active: false },
  { id: 'fury',        name: 'Ярость',        emoji: '🔥', description: 'Активируй — следующий правильный ответ x2 урон.', active: true },
  { id: 'revive',      name: 'Возрождение',   emoji: '💀', description: 'Воскрешает павшего товарища (50% HP). Используется кнопкой.', active: true },
  { id: 'wisdom',      name: 'Мудрость',      emoji: '📖', description: 'Перед ответом убирает один неверный вариант (50/50 lite).', active: true },
];

export const PERK_BY_ID: Record<PerkId, PerkDef> =
  Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<PerkId, PerkDef>;

// =====================================================================
// Acquiring a perk
// =====================================================================

/**
 * Add a perk to a player's inventory. Stacking works for everything except
 * one-shot status flags — those are still represented as a charge of 1.
 */
export function acquirePerk(player: Player, id: PerkId): void {
  if (!player.perks) player.perks = [];
  const existing = player.perks.find((p) => p.id === id);
  if (existing) {
    existing.charges += 1;
  } else {
    player.perks.push({ id, charges: 1 });
  }

  // Some perks have an immediate side-effect on pickup (passive bonuses
  // that just bump player stats and don't really need to live in the
  // inventory afterwards).
  switch (id) {
    case 'life-elixir':
      // Heal immediately on pickup AND keep the charge so it can be used
      // again later if you stack two elixirs (they got +1 charge above).
      player.personalHp = player.maxPersonalHp;
      player.isAlive = true;
      break;
    default:
      break;
  }
}

// =====================================================================
// Damage / hit hooks
// =====================================================================

/**
 * Compute the damage multiplier and bonus for a player who answered correctly.
 * Returns the final damage based on the base damage + perks.
 */
export function applyOutgoingDamageBonuses(
  player: Player,
  baseDamage: number,
  opts: { wasFast: boolean },
): number {
  let dmg = baseDamage;
  const perks = player.perks ?? [];

  // Sharp blade: +10 per stack on every correct answer (stacks across pickups).
  const blade = perks.find((p) => p.id === 'sharp-blade');
  if (blade) dmg += 10 * blade.charges;

  // Speed: +30% if the answer was fast.
  if (opts.wasFast) {
    const speed = perks.find((p) => p.id === 'speed');
    if (speed) dmg = Math.round(dmg * 1.3);
  }

  // Fury: x2 next correct answer (charge consumed).
  const fury = perks.find((p) => p.id === 'fury');
  if (fury && fury.charges > 0) {
    dmg = Math.round(dmg * 2);
  }

  return dmg;
}

/**
 * Called *after* a correct-answer round is resolved. Consumes one-shot
 * charges (fury) and trims spent entries.
 */
export function consumePerksAfterCorrect(player: Player): PerkId[] {
  const consumed: PerkId[] = [];
  if (!player.perks) return consumed;
  const fury = player.perks.find((p) => p.id === 'fury');
  if (fury && fury.charges > 0) {
    fury.charges -= 1;
    consumed.push('fury');
  }
  player.perks = player.perks.filter((p) => p.charges > 0);
  return consumed;
}

/**
 * Try to absorb an incoming hit on a player. If they have a shield charge,
 * it is consumed and 0 damage is returned. Otherwise returns the original.
 */
export function absorbHit(player: Player, dmg: number): { dmg: number; absorbed: boolean } {
  if (!player.perks || dmg <= 0) return { dmg, absorbed: false };
  const shield = player.perks.find((p) => p.id === 'shield');
  if (shield && shield.charges > 0) {
    shield.charges -= 1;
    if (shield.charges === 0) {
      player.perks = player.perks.filter((p) => p.charges > 0);
    }
    return { dmg: 0, absorbed: true };
  }
  return { dmg, absorbed: false };
}

/** Compute team-wide damage multiplier from all players' luck stacks. */
export function teamLuckMultiplier(state: GameState): number {
  let stacks = 0;
  for (const p of Object.values(state.players)) {
    const luck = p.perks?.find((x) => x.id === 'luck');
    if (luck) stacks += luck.charges;
  }
  // 10% per stack, capped at +50%.
  return 1 + Math.min(0.5, stacks * 0.1);
}

/** Consume all luck charges (called after one round of damage). */
export function consumeTeamLuck(state: GameState): number {
  let total = 0;
  for (const p of Object.values(state.players)) {
    if (!p.perks) continue;
    const luck = p.perks.find((x) => x.id === 'luck');
    if (luck && luck.charges > 0) {
      total += luck.charges;
      luck.charges = 0;
    }
    p.perks = p.perks.filter((x) => x.charges > 0);
  }
  return total;
}

// =====================================================================
// Active perk usage
// =====================================================================

/**
 * Activate a perk at the player's request. Returns true on success.
 *
 * Each active perk has a different effect:
 *   - life-elixir: full heal
 *   - revive: bring back a fallen ally to 50% HP
 *   - fury: queue +200% damage on next correct answer (already in inventory;
 *     this is a no-op pickup-time activation)
 *   - wisdom: client-side hint, server just consumes a charge
 */
export function usePerk(io: Server, state: GameState, playerId: string, perkId: PerkId): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (!player.isAlive) return false;
  if (!player.perks || player.perks.length === 0) return false;

  const inst = player.perks.find((p) => p.id === perkId);
  if (!inst || inst.charges <= 0) return false;

  const def = PERK_BY_ID[perkId];
  if (!def?.active) return false;

  switch (perkId) {
    case 'life-elixir': {
      player.personalHp = player.maxPersonalHp;
      player.isAlive = true;
      io.to(state.roomCode).emit('ability-used', playerId, def.name, 'heal-self');
      break;
    }
    case 'revive': {
      const dead = Object.values(state.players).find((p) => !p.isAlive && !p.isBot);
      if (!dead) return false;
      dead.isAlive = true;
      dead.personalHp = Math.round(dead.maxPersonalHp * 0.5);
      io.to(state.roomCode).emit('ability-used', playerId, def.name, `resurrect:${dead.name}`);
      break;
    }
    case 'fury': {
      // Fury is consumed at the moment of the next correct answer, not now.
      // But for UX clarity we still emit an event so the player sees a flash.
      io.to(state.roomCode).emit('ability-used', playerId, def.name, 'fury-armed');
      // Don't drop the charge here; consumePerksAfterCorrect handles it.
      return true;
    }
    case 'wisdom': {
      io.to(playerId).emit('ability-used', playerId, def.name, 'wisdom-hint');
      break;
    }
    default:
      return false;
  }

  inst.charges -= 1;
  player.perks = player.perks.filter((p) => p.charges > 0);
  io.to(state.roomCode).emit('game-state', state);
  return true;
}

// =====================================================================
// Picking 3 random perks for the reward phase
// =====================================================================

export function pickPerkOptions(count: number): PerkId[] {
  const shuffled = PERKS.map((p) => p.id);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/** Build a stable random rotation of human players for a reward phase. */
export function buildRewardRotation(state: GameState): string[] {
  const humans = Object.values(state.players).filter((p) => !p.isBot && p.isAlive).map((p) => p.id);
  for (let i = humans.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [humans[i], humans[j]] = [humans[j], humans[i]];
  }
  return humans;
}

export function consumePerkInstance(player: Player, id: PerkId): void {
  if (!player.perks) return;
  const inst = player.perks.find((p) => p.id === id);
  if (!inst) return;
  inst.charges -= 1;
  player.perks = player.perks.filter((p) => p.charges > 0);
}
