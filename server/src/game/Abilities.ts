import type { Server } from 'socket.io';
import type { GameState } from '../../../shared/types.ts';
import { CLASS_DEFINITIONS } from '../data/classes.ts';

export function useAbility(io: Server, socketId: string, state: GameState): boolean {
  const player = state.players[socketId];
  if (!player) return false;
  if (!player.isAlive) return false;
  if (!player.playerClass) return false;
  if (state.phase !== 'answering') return false;

  const classDef = CLASS_DEFINITIONS.find((c) => c.id === player.playerClass);
  if (!classDef) return false;

  const roomCode = state.roomCode;

  switch (player.playerClass) {
    case 'warrior':
      // Client removes one wrong option
      io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, 'eliminate-option');
      break;

    case 'mage':
      state.timer += 10;
      state.maxTimer += 10;
      io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, 'time-freeze');
      io.to(roomCode).emit('timer-tick', state.timer);
      break;

    case 'healer': {
      const dead = Object.values(state.players).find(p => !p.isAlive && !p.isBot);
      if (dead) {
        dead.isAlive = true;
        dead.personalHp = Math.round(dead.maxPersonalHp * 0.5);
        io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, `resurrect:${dead.name}`);
      } else {
        for (const p of Object.values(state.players)) {
          if (p.isAlive && p.personalHp < p.maxPersonalHp) {
            p.personalHp = Math.min(p.personalHp + 15, p.maxPersonalHp);
          }
        }
        io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, 'heal');
      }
      break;
    }

    case 'scout': {
      // Reveal next floor's question category
      const nextFloorIdx = state.currentFloor; // currentFloor is 1-indexed, array is 0-indexed
      const nextFloor = state.floors[nextFloorIdx];
      const hint = nextFloor ? `Next floor category hint` : 'No more floors';
      io.to(socketId).emit('ability-used', socketId, classDef.abilityName, `scout-hint:${hint}`);
      break;
    }

    case 'bard':
      // All players get bonus damage
      for (const p of Object.values(state.players)) {
        if (p.isAlive) {
          p.bonusDamage += 8;
        }
      }
      io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, 'battle-hymn');
      break;

    case 'blacksmith':
      // Client handles half-damage on fail
      io.to(roomCode).emit('ability-used', socketId, classDef.abilityName, 'reforge');
      break;
  }

  player.abilityCooldown = classDef.abilityCooldown;
  io.to(roomCode).emit('game-state', state);
  return true;
}
