// TV presenter for the 'jeopardy-comp' mode. Placeholder: falls back to the generic
// DefaultPresenter. Replace this file with a mode-specific presenter that reads
// useStore().gameState and the mode's room-broadcast events (see docs/INTERACTIVE.md).
import DefaultPresenter from '../DefaultPresenter';

export default function JeopardyCompPresenter() {
  return <DefaultPresenter />;
}
