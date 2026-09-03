import type { ReactNode } from 'react';

/** Общие классы полей ввода в стиле QP Home. */
export const INPUT = 'qp-input w-full py-2 px-3.5 text-sm font-medium';
export const INPUT_SM = 'qp-input w-full py-1.5 px-3 text-sm font-medium';
export const TEXTAREA = 'qp-input w-full py-2.5 px-3.5 text-sm font-medium !rounded-2xl leading-snug resize-y';
export const SELECT = 'qp-input w-full py-2 px-3.5 text-sm font-medium appearance-none bg-[var(--color-dungeon-surface-2)]';

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)]">{children}</h2>
      {right}
    </div>
  );
}

export function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div
      onClick={onClose}
      className={`py-2.5 px-4 rounded-2xl bg-[#FF4848]/15 border border-[#FF4848]/40 text-[#FF9A9A] text-sm font-semibold ${onClose ? 'cursor-pointer' : ''}`}
    >
      {message}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="py-2.5 px-4 rounded-2xl bg-[#FF4848]/15 border border-[#FF4848]/40 text-[#FF9A9A] text-sm font-semibold">
      <div className="mb-1">Не сохранено — исправьте ошибки ({errors.length}):</div>
      <ul className="list-disc pl-5 text-xs font-medium space-y-0.5 max-h-40 overflow-y-auto">
        {errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
        {errors.length > 30 && <li>… и ещё {errors.length - 30}</li>}
      </ul>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' | 'pink' | 'green' }) {
  const cls = {
    muted: 'bg-white/10 text-white/70',
    gold: 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]',
    pink: 'bg-[var(--color-dungeon-accent)]/25 text-[#FFB3DF] border border-[var(--color-dungeon-accent)]/50',
    green: 'bg-[#8DFF85]/15 text-[#8DFF85]',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function IconButton({ title, onClick, children, danger, disabled }: { title: string; onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full bg-white/5 text-sm transition-colors disabled:opacity-30 ${
        danger ? 'hover:bg-[#FF4848]/25 hover:text-[#FF9A9A]' : 'hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}

/** Пунктирная кнопка «добавить». */
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-3 rounded-2xl border-2 border-dashed border-white/15 text-white/60 hover:border-[var(--color-dungeon-gold)] hover:text-[var(--color-dungeon-gold)] transition-all text-sm font-bold"
    >
      {children}
    </button>
  );
}

/** 4 варианта + радио «правильный». Используется в simple и jeopardy. */
export function OptionsEditor({
  options,
  correctIndex,
  onChange,
  name,
}: {
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  onChange: (options: [string, string, string, string], correctIndex: 0 | 1 | 2 | 3) => void;
  name: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt, i) => {
        const isCorrect = correctIndex === i;
        return (
          <label
            key={i}
            className={`flex items-center gap-2 rounded-full pl-2 pr-1 py-1 border transition-colors ${
              isCorrect ? 'border-[#8DFF85]/60 bg-[#8DFF85]/10' : 'border-white/10 bg-white/5'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={isCorrect}
              onChange={() => onChange(options, i as 0 | 1 | 2 | 3)}
              className="accent-[#8DFF85] w-4 h-4 shrink-0"
              title="Правильный ответ"
            />
            <input
              type="text"
              value={opt}
              placeholder={`Вариант ${i + 1}`}
              onChange={e => {
                const next = [...options] as [string, string, string, string];
                next[i] = e.target.value;
                onChange(next, correctIndex);
              }}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium py-1 outline-none placeholder:text-white/35"
            />
          </label>
        );
      })}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm font-medium text-[var(--color-dungeon-muted)]">{children}</div>;
}

export function ConfirmModal({ title, text, confirmLabel = 'Да', danger, onConfirm, onCancel }: {
  title: string; text?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="glass-panel p-5 sm:p-6 w-full max-w-sm animate-[fadeIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-extrabold mb-1">{title}</div>
        {text && <div className="text-sm text-[var(--color-dungeon-muted)] font-medium mb-4">{text}</div>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5 px-4 text-sm">Отмена</button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 px-4 text-sm rounded-3xl font-bold transition-all active:scale-[0.97] ${
              danger ? 'bg-[#FF4848]/80 hover:bg-[#FF4848] text-white' : 'btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
