// «Своя игра» — dispatcher by format: coop -> boss version, ffa/teams -> competitive grid.
import { useStore } from '../../store';
import JeopardyCompScreen from '../jeopardy-comp/JeopardyCompScreen';
import JeopardyCoopScreen from '../jeopardy-coop/JeopardyCoopScreen';

export default function JeopardyScreen() {
  const teamMode = useStore((s) => s.gameState?.teamMode ?? 'coop');
  return teamMode === 'coop' ? <JeopardyCoopScreen /> : <JeopardyCompScreen />;
}
