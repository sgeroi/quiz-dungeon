import { GAME_MODES } from '../types';
import type { GameMode } from '../types';

/** Обложки карточек — яркие градиенты как у хоумов на сайте. */
const COVERS: Record<GameMode, string> = {
  'classic':       'linear-gradient(135deg,#6F2BD9 0%,#DB3397 100%)',
  'millionaire':   'linear-gradient(135deg,#FFB56B 0%,#FF6F6F 100%)',
  'topic-split':   'linear-gradient(135deg,#75BFFF 0%,#6937d2 100%)',
  'jeopardy-comp': 'linear-gradient(135deg,#FF3CAE 0%,#853CB5 100%)',
  'jeopardy-coop': 'linear-gradient(135deg,#8DFF85 0%,#05DF72 100%)',
  'speed':         'linear-gradient(135deg,#FFDB10 0%,#FF8A00 100%)',
  'petersburg':    'linear-gradient(135deg,#F5D4FF 0%,#CD8EFF 100%)',
  'buckets':       'linear-gradient(135deg,#58D8EF 0%,#2F6BFF 100%)',
  'rpg-rewards':   'linear-gradient(135deg,#FF6467 0%,#E417FC 100%)',
  'spy':           'linear-gradient(135deg,#412058 0%,#1C0925 100%)',
};

interface Props {
  selected: GameMode | null;
  /** Если не передан — сетка только для просмотра (не хост). */
  onSelect?: (mode: GameMode) => void;
  columns?: string;
  compact?: boolean;
}

export default function GameModeGrid({
  selected,
  onSelect,
  columns = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
  compact = false,
}: Props) {
  const readOnly = !onSelect;
  return (
    <div className={`grid ${columns} gap-3`}>
      {GAME_MODES.map((mode) => {
        const isSelected = selected === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelect?.(mode.id)}
            disabled={readOnly}
            title={mode.description}
            className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-150 ${
              isSelected
                ? 'ring-2 ring-[var(--color-dungeon-gold)] shadow-[0_0_24px_rgba(255,219,16,0.35)] scale-[1.02]'
                : readOnly
                  ? 'opacity-45'
                  : 'hover:scale-[1.03] hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] active:scale-[0.98]'
            }`}
          >
            <div
              className={`flex items-center justify-center ${compact ? 'h-14' : 'h-20 sm:h-24'}`}
              style={{ background: COVERS[mode.id] }}
            >
              <span className={`${compact ? 'text-3xl' : 'text-4xl sm:text-5xl'} drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]`}>
                {mode.emoji}
              </span>
              {isSelected && (
                <span className="absolute top-2 right-2 rounded-full bg-[var(--color-dungeon-gold)] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[var(--color-dungeon-gold-fg)]">
                  выбрано
                </span>
              )}
            </div>
            <div className="bg-[var(--color-dungeon-surface-2)] px-3 py-2.5">
              <div className={`${compact ? 'text-xs' : 'text-[13px]'} font-bold leading-tight text-white`}>{mode.name}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
