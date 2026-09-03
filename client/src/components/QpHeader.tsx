/** Шапка в стиле quizplease.ru/home-games: логотип + плашка ХОУМ. */
export default function QpHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/qp-logo.svg" alt="Квиз, плиз!" className="h-9 w-auto" />
      <div className="flex items-center rounded-full bg-black/40 border border-white/15 p-1">
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-[var(--color-dungeon-gold)]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-dungeon-gold)] text-[10px] text-[var(--color-dungeon-gold-fg)]">⌂</span>
          Хоум
        </span>
        {subtitle && <span className="px-3 py-1 text-[13px] font-bold text-white/85">{subtitle}</span>}
      </div>
    </div>
  );
}
