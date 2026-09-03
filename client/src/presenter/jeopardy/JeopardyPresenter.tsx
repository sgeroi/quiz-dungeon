// TV presenter for «Своя игра» — dispatches by format the same way JeopardyScreen does.
import { useStore } from '../../store';
import JeopardyCompPresenter from '../jeopardy-comp/JeopardyCompPresenter';
import JeopardyCoopPresenter from '../jeopardy-coop/JeopardyCoopPresenter';

export default function JeopardyPresenter() {
  const teamMode = useStore((s) => s.gameState?.teamMode ?? 'coop');
  return teamMode === 'coop' ? <JeopardyCoopPresenter /> : <JeopardyCompPresenter />;
}
