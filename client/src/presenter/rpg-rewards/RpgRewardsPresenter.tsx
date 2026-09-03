// TV presenter for the 'rpg-rewards' mode. The mode runs on the same GameLoop
// as classic (no dedicated ModeHandler), so it reuses the classic building
// blocks and adds the reward-pick phase (gameState.rewardPhase) plus the
// team's active perks (players[].perks).
import { useStore } from '../../store';
import type { GameState, Player } from '../../types';
import { PresenterTimer } from '../DefaultPresenter';
import {
  BattleLayout,
  ChainPanel,
  ClassIcon,
  FinalScreen,
  FloorIntro,
  PERK_LABELS,
  PersonalRoundPanel,
  PreparingScreen,
  QuestionPanel,
  TeamBoard,
  modeTitle,
  useChainLog,
  useLoopView,
  type LoopView,
} from '../classic/shared';

export default function RpgRewardsPresenter() {
  const gs = useStore((s) => s.gameState);
  if (!gs) return null;
  return <RewardsLoop gs={gs} />;
}

function RewardsLoop({ gs }: { gs: GameState }) {
  const v = useLoopView(gs);
  const chainLog = useChainLog();

  if (!v.floor || gs.currentFloor < 1) {
    return <PreparingScreen title={modeTitle(gs)} subtitle="Подземелье строится. Между этажами команда будет выбирать награды" />;
  }

  switch (gs.phase) {
    case 'floor-intro':
      return <FloorIntro v={v} />;
    case 'reward':
      return <RewardPhase v={v} />;
    case 'victory':
    case 'defeat':
      return <FinalScreen v={v} />;
    case 'chain-turn':
      return <BattleLayout v={v} showPerks centre={<ChainPanel v={v} log={chainLog} />} />;
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
      return <BattleLayout v={v} showPerks centre={centre} />;
    }
  }
}

/** Reward-pick phase between floors: who picks now, the three offered perks, pick order. */
function RewardPhase({ v }: { v: LoopView }) {
  const { gs } = v;
  const rp = gs.rewardPhase;
  const picker: Player | null = rp?.currentPickerId ? gs.players[rp.currentPickerId] ?? null : null;
  const total = rp?.rotation.length ?? 0;
  const turn = (rp?.turnIndex ?? 0) + 1;

  return (
    <div className="h-full flex flex-col gap-6 p-10 pt-4 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-start justify-between gap-10">
        <div>
          <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {modeTitle(gs)} · этаж {gs.currentFloor} из {gs.totalFloors} пройден
          </div>
          <div className="text-[64px] leading-none font-black text-[var(--color-dungeon-gold)] mt-2">🎁 Выбор награды</div>
          <div className="text-[28px] font-semibold text-white/70 mt-2">
            Награду выбирает каждый по очереди — {rp ? `выбор ${Math.min(turn, Math.max(1, total))} из ${total}` : 'ждём…'}
          </div>
        </div>
        {rp && <PresenterTimer timer={gs.timer} maxTimer={gs.maxTimer} />}
      </div>

      {rp ? (
        <div className="flex-1 min-h-0 flex flex-col gap-6">
          <div className="flex items-center gap-6">
            <div className="text-[26px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Сейчас выбирает</div>
            {picker ? (
              <div className="flex items-center gap-4 rounded-full bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] px-8 py-3 text-[40px] font-black">
                <ClassIcon player={picker} size={52} />
                {picker.name}
              </div>
            ) : (
              <div className="text-[36px] font-black text-white/50">все выбрали</div>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              {rp.rotation.map((pid, i) => {
                const p = gs.players[pid];
                const done = rp.picked.includes(pid) || i < rp.turnIndex;
                const active = i === rp.turnIndex;
                return (
                  <span
                    key={pid}
                    className={`rounded-full px-4 py-1.5 text-[22px] font-extrabold ${
                      active
                        ? 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'
                        : done
                          ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]'
                          : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {done && !active ? '✓ ' : ''}{p?.name ?? '?'}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8 flex-1 min-h-0">
            {rp.options.map((id, i) => {
              const l = PERK_LABELS[id];
              return (
                <div key={`${id}-${i}`} className="glass-panel-gold flex flex-col items-center justify-center gap-5 px-8 py-8 text-center">
                  <div className="text-[130px] leading-none drop-shadow-[0_0_30px_rgba(255,219,16,0.35)] animate-[float_3s_ease-in-out_infinite]">{l?.emoji ?? '🎁'}</div>
                  <div className="text-[44px] font-black leading-tight">{l?.name ?? id}</div>
                  <div className="text-[26px] font-semibold text-white/75 leading-snug">{l?.description ?? ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[48px] font-black text-white/60">Награды разобраны — спускаемся дальше…</div>
      )}

      <div>
        <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-3">Команда и её награды</div>
        <TeamBoard v={v} showPerks />
      </div>
    </div>
  );
}
