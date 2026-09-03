import type { Server, Socket } from 'socket.io';
import type { GameState } from '../../../shared/types.ts';

// Each mode implements this interface. The mode owns the gameplay loop —
// it can manage state.phase, emit its own events, listen via registerSocket().
export interface ModeHandler {
  /** Called when host clicks "start game" with this mode chosen. */
  start: (io: Server, state: GameState) => void;

  /** Optional: register per-socket handlers for mode-specific events. */
  registerSocket?: (io: Server, socket: Socket, getState: () => GameState | undefined) => void;

  /** Optional: cleanup on game end / room close. */
  stop?: (io: Server, state: GameState) => void;
}
