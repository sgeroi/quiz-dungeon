import { useStore } from '../store';
import { socket } from '../socket';
import type { PerkId, PerkInstance } from '../types';

interface PerkInfo {
  name: string;
  emoji: string;
  active: boolean;
  description: string;
}

const PERK_INFO: Record<PerkId, PerkInfo> = {
  'sharp-blade': { name: 'Острый клинок', emoji: '🗡️', active: false, description: '+10 урона' },
  'life-elixir': { name: 'Эликсир жизни', emoji: '💚', active: true,  description: 'Полный хил' },
  'shield':      { name: 'Щит',           emoji: '🛡️', active: false, description: 'Поглощает удар' },
  'speed':       { name: 'Скорость',      emoji: '⚡', active: false, description: '+30% если быстро' },
  'luck':        { name: 'Удача',         emoji: '🍀', active: false, description: '+10% урона команды' },
  'fury':        { name: 'Ярость',        emoji: '🔥', active: true,  description: 'x2 урон в след. ответе' },
  'revive':      { name: 'Возрождение',   emoji: '💀', active: true,  description: 'Поднять павшего' },
  'wisdom':      { name: 'Мудрость',      emoji: '📖', active: true,  description: 'Убрать вариант' },
};

interface PerkButtonsProps {
  perks: PerkInstance[];
}

export default function PerkButtons({ perks }: PerkButtonsProps) {
  const playerId = useStore((s) => s.playerId);
  const gameState = useStore((s) => s.gameState);
  if (!playerId || !gameState) return null;
  if (!perks || perks.length === 0) return null;

  const me = gameState.players[playerId];
  if (!me?.isAlive) return null;
  const phase = gameState.phase;
  // Active perks usable only during answering phase, except revive (any time)
  // and life-elixir (any time).

  const handleUse = (id: PerkId) => {
    socket.emit('use-perk', id);
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {perks.map((p) => {
        const info = PERK_INFO[p.id];
        if (!info) return null;
        if (p.charges <= 0) return null;
        const usable = info.active && (
          p.id === 'life-elixir' || p.id === 'revive' ? phase !== 'lobby' && phase !== 'class-select'
          : phase === 'answering' || phase === 'question'
        );
        return (
          <button
            key={p.id}
            disabled={!usable}
            onClick={() => handleUse(p.id)}
            title={`${info.name} — ${info.description}${p.charges > 1 ? ` (×${p.charges})` : ''}`}
            className={`relative rounded-xl px-3 py-2 border text-sm font-bold transition-all ${
              info.active
                ? usable
                  ? 'bg-gradient-to-b from-amber-700 to-amber-900 border-amber-500/60 text-amber-100 hover:from-amber-600 hover:to-amber-800 active:scale-95'
                  : 'bg-amber-950/50 border-amber-800/40 text-amber-300/40 cursor-not-allowed'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-default'
            }`}
          >
            <span className="mr-1">{info.emoji}</span>
            <span>{info.name}</span>
            {p.charges > 1 && (
              <span className="ml-1 text-[10px] opacity-80">×{p.charges}</span>
            )}
            {!info.active && (
              <span className="ml-1 text-[9px] uppercase tracking-wider opacity-60">пасс</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
