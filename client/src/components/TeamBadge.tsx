import type { Team } from '../types';

interface Props {
  team: Team;
  /** sm — в списках, md — плитки/таблицы, lg — ТВ-экран. */
  size?: 'sm' | 'md' | 'lg';
  /** Скрыть имя — только цветной кружок с эмодзи. */
  iconOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { dot: 'w-5 h-5 text-[11px]', text: 'text-[11px]', pad: 'pl-0.5 pr-2 py-0.5 gap-1.5' },
  md: { dot: 'w-7 h-7 text-sm', text: 'text-sm', pad: 'pl-1 pr-3 py-1 gap-2' },
  lg: { dot: 'w-12 h-12 text-[24px]', text: 'text-[26px]', pad: 'pl-1.5 pr-5 py-1.5 gap-3' },
};

/** Цветной кружок команды + имя. Переиспользуется в лобби, результатах и презентерах. */
export default function TeamBadge({ team, size = 'sm', iconOnly = false, className = '' }: Props) {
  const sz = SIZES[size];
  return (
    <span
      className={`inline-flex items-center rounded-full font-extrabold leading-none whitespace-nowrap ${iconOnly ? 'p-0.5' : sz.pad} ${className}`}
      style={{ backgroundColor: `${team.color}26`, border: `1px solid ${team.color}80`, color: team.color }}
      title={team.name}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full shrink-0 ${sz.dot}`}
        style={{ backgroundColor: team.color, color: '#1C0925' }}
      >
        {team.emoji}
      </span>
      {!iconOnly && <span className={sz.text}>{team.name}</span>}
    </span>
  );
}
