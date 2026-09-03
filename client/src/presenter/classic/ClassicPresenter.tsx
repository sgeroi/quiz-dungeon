// TV presenter for the 'classic' mode (RPG dungeon, legacy GameLoop).
// Reads only room-broadcast data (useStore().gameState + chain-result events);
// never shows the correct answer before the server's reveal (lastResults).
import { useStore } from '../../store';
import type { GameState } from '../../types';
import {
  BattleLayout,
  ChainPanel,
  FinalScreen,
  FloorIntro,
  PersonalRoundPanel,
  PreparingScreen,
  QuestionPanel,
  modeTitle,
  useChainLog,
  useLoopView,
} from './shared';

export default function ClassicPresenter() {
  const gs = useStore((s) => s.gameState);
  if (!gs) return null;
  return <ClassicLoop gs={gs} />;
}

function ClassicLoop({ gs }: { gs: GameState }) {
  const v = useLoopView(gs);
  const chainLog = useChainLog();

  if (!v.floor || gs.currentFloor < 1) {
    return <PreparingScreen title={modeTitle(gs)} subtitle="Подземелье строится, герои готовятся к спуску" />;
  }

  switch (gs.phase) {
    case 'floor-intro':
      return <FloorIntro v={v} />;
    case 'victory':
    case 'defeat':
      return <FinalScreen v={v} />;
    case 'chain-turn':
      return <BattleLayout v={v} centre={<ChainPanel v={v} log={chainLog} />} />;
    default: {
      let centre: React.ReactNode;
      if (v.isChain) centre = <ChainPanel v={v} log={chainLog} />;
      else if (v.isPersonal) centre = <PersonalRoundPanel v={v} />;
      else if (gs.currentQuestion) centre = <QuestionPanel v={v} />;
      else centre = (
        <div className="h-full flex items-center justify-center text-[56px] font-black text-[var(--color-dungeon-gold)] animate-pulse">
          Готовим вопрос…
        </div>
      );
      return <BattleLayout v={v} centre={centre} />;
    }
  }
}
