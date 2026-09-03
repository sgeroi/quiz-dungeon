/**
 * «Своя игра» (mode 'jeopardy') — dispatcher over the two existing implementations:
 *   teamMode 'coop'          -> jeopardy-coop (boss fight, whole party together)
 *   teamMode 'ffa' | 'teams' -> jeopardy-comp (competitive grid with buzzer)
 * Both nested handlers listen to different socket events and guard themselves
 * with isJeopardyCompActive / isJeopardyCoopActive, so registerSocket wires both.
 */
import type { Server, Socket } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import jeopardyComp from '../jeopardy-comp/handler.ts';
import jeopardyCoop from '../jeopardy-coop/handler.ts';

function pick(state: GameState): ModeHandler {
  return state.teamMode === 'coop' ? jeopardyCoop : jeopardyComp;
}

const handler: ModeHandler = {
  start(io: Server, state: GameState) {
    pick(state).start(io, state);
  },

  registerSocket(io: Server, socket: Socket, getState) {
    jeopardyComp.registerSocket?.(io, socket, getState);
    jeopardyCoop.registerSocket?.(io, socket, getState);
  },

  onScreenJoin(io: Server, socket: Socket, state: GameState) {
    const h = pick(state);
    if (h.onScreenJoin) h.onScreenJoin(io, socket, state);
    else socket.emit('game-state', state);
  },

  stop(io: Server, state: GameState) {
    // Both keep per-room maps keyed by roomCode; stopping both is harmless.
    jeopardyComp.stop?.(io, state);
    jeopardyCoop.stop?.(io, state);
  },
};

export default handler;
