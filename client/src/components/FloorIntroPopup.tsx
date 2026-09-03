import { useEffect, useState } from 'react';
import type { Floor, Player } from '../types';

const INTRO_DURATION = 6000;

interface FloorIntroPopupProps {
  floor: Floor;
  playerId: string;
  captainPlayer?: Player | null;
  sacrificePlayer?: Player | null;
  isCaptainMode: boolean;
  isSacrifice: boolean;
}

export default function FloorIntroPopup({ floor, playerId, captainPlayer, sacrificePlayer, isCaptainMode, isSacrifice }: FloorIntroPopupProps) {
  const [progress, setProgress] = useState(100);
  const { params } = floor;

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / INTRO_DURATION) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floor.number]);

  return (
    <div className="fixed inset-y-0 left-0 right-0 md:right-72 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]">
      <div className="glass-panel rounded-3xl w-full max-w-lg mx-4 overflow-hidden border border-white/10 shadow-2xl">
        {/* Progress bar */}
        <div className="h-1.5 bg-black/30 w-full">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-dungeon-gold)] to-amber-400 transition-none rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8 flex flex-col items-center gap-5">
          {/* Emoji + floor number */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[var(--color-dungeon-gold)]/15 blur-2xl rounded-full animate-pulse" />
              <span className="relative text-7xl animate-[float_2s_ease-in-out_infinite] drop-shadow-[0_0_20px_rgba(245,197,24,0.4)]">{params.emoji}</span>
            </div>
            <div>
              <div className="text-gray-400 text-sm font-bold uppercase tracking-wider">Этаж {floor.number}</div>
              <h2 className="text-3xl font-black text-white">{params.name}</h2>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white/5 rounded-2xl px-6 py-4 w-full">
            <p className="text-base text-gray-200 leading-relaxed text-center">{params.description}</p>
          </div>

          {/* Monster */}
          {floor.monster && (
            <div className="flex items-center gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl px-6 py-4 w-full animate-[slideInRight_0.5s_ease-out]">
              <span className="text-5xl animate-[monsterIdle_1.5s_ease-in-out_infinite]">{floor.monster.emoji}</span>
              <div className="flex-1">
                <div className="text-white font-bold text-xl">{floor.monster.name}</div>
                <div className="text-sm text-red-300/80 mt-0.5">❤️ {floor.monster.maxHp} HP &nbsp;&nbsp; ⚔️ {floor.monster.attack} ATK</div>
              </div>
              {floor.isBoss && (
                <span className="px-3 py-1 rounded-full bg-red-900/50 border border-red-500/30 text-red-400 text-xs font-bold">💀 БОСС</span>
              )}
            </div>
          )}

          {/* Special roles */}
          {isCaptainMode && captainPlayer && (
            <div className="glass-panel-gold rounded-2xl px-6 py-3 w-full text-center">
              <div className="text-amber-300 font-bold text-lg">
                👑 Капитан: {captainPlayer.id === playerId ? 'ВЫ!' : captainPlayer.name}
              </div>
            </div>
          )}

          {isSacrifice && sacrificePlayer && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-3 w-full text-center glow-red">
              <div className="text-red-300 font-bold text-lg">
                💀 Жертва: {sacrificePlayer.id === playerId ? 'ВЫ!' : sacrificePlayer.name}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
