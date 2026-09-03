import type { Floor } from '../types';

interface FloorIndicatorProps {
  current: number;
  total: number;
  floors: Floor[];
}

export default function FloorIndicator({ current, total, floors }: FloorIndicatorProps) {
  const items = Array.from({ length: total }, (_, i) => {
    const floor = floors[i];
    const num = i + 1;
    const isCurrent = num === current;
    const isPast = num < current;
    const emoji = floor?.params?.emoji ?? '❓';
    return { num, isCurrent, isPast, emoji, completed: floor?.isCompleted, isBoss: floor?.isBoss };
  });

  return (
    <div className="relative px-2 py-2">
      <div className="flex items-center justify-center gap-0">
        {items.map((item, i) => (
          <div key={item.num} className="flex items-center">
            <div className={`relative flex flex-col items-center transition-all duration-500 ${item.isCurrent ? 'scale-125 z-10' : ''}`}>
              {item.isCurrent && (
                <div className="absolute -top-5 animate-bounce text-sm drop-shadow-[0_0_6px_rgba(245,197,24,0.5)]">🏃</div>
              )}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500
                  ${item.isCurrent
                    ? 'bg-gradient-to-br from-[var(--color-dungeon-gold)] to-amber-600 text-black shadow-[0_0_16px_rgba(245,197,24,0.4)] border-2 border-yellow-300/50'
                    : item.isPast
                      ? 'bg-green-900/60 border-2 border-green-500/40 text-green-300'
                      : 'bg-white/5 border-2 border-white/10 text-gray-500'
                  }`}
              >
                {item.isPast ? '✓' : item.emoji}
              </div>
              {item.isBoss && !item.isPast && (
                <div className="absolute -bottom-1 -right-1 text-[8px] animate-[flicker_2s_ease-in-out_infinite]">💀</div>
              )}
            </div>
            {i < items.length - 1 && (
              <div className={`w-3 h-0.5 mx-0.5 rounded-full transition-all duration-500 ${
                item.isPast ? 'bg-green-500/40' : item.isCurrent ? 'bg-[var(--color-dungeon-gold)]/30' : 'bg-white/5'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
