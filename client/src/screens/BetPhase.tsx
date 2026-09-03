import { useStore } from '../store';

interface BetPhaseProps {
  iAmCaptain: boolean;
  captainName: string;
  /** teams: this captain already bet, the overlay waits for other teams' captains. */
  alreadyBet?: boolean;
}

export default function BetPhase({ iAmCaptain, captainName, alreadyBet = false }: BetPhaseProps) {
  const { submitBet } = useStore();

  if (iAmCaptain && alreadyBet) {
    return (
      <div className="glass-panel rounded-xl px-4 py-2 mb-3 text-center border border-amber-600/20 animate-pulse">
        <span className="text-amber-300 text-sm">🎲 Ставка принята — ждём капитанов других команд...</span>
      </div>
    );
  }

  if (iAmCaptain) {
    return (
      <div className="glass-panel-gold rounded-2xl px-4 py-3 mb-3 animate-[fadeIn_0.4s_ease-out]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <span className="text-amber-200 font-bold text-sm">Ставка:</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => submitBet(5)}
              className="px-4 py-2 rounded-xl bg-amber-700/80 hover:bg-amber-600 border border-amber-500/50 text-amber-100 font-bold text-sm transition-all active:scale-95"
            >
              +5 ⚔️
            </button>
            <button
              onClick={() => submitBet(10)}
              className="px-4 py-2 rounded-xl bg-red-700/80 hover:bg-red-600 border border-red-500/50 text-red-100 font-bold text-sm transition-all active:scale-95"
            >
              +10 ⚔️
            </button>
            <button
              onClick={() => submitBet(0)}
              className="px-3 py-2 rounded-xl bg-gray-700/80 hover:bg-gray-600 border border-gray-500/50 text-gray-300 text-sm transition-all active:scale-95"
            >
              Нет
            </button>
          </div>
        </div>
        <div className="text-amber-400/60 text-[10px] mt-1 text-center">Угадал = бонус урона • Ошибка = доп. урон команде</div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl px-4 py-2 mb-3 text-center border border-amber-600/20 animate-pulse">
      <span className="text-amber-300 text-sm">🎲 Капитан {captainName} делает ставку...</span>
    </div>
  );
}
