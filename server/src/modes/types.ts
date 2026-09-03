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

  /**
   * Optional: a screen (TV presenter, not a player) joined the room mid-game.
   * Send it the current mode snapshot addressed to `socket` only — the same
   * room-broadcast payloads the mode normally emits (never personal data or
   * un-revealed correct answers). If absent, index.ts just sends `game-state`.
   */
  onScreenJoin?: (io: Server, socket: Socket, state: GameState) => void;
}
