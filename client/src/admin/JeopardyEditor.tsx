import { useState } from 'react';
import type { JeopardyData, JeopardyCellData } from '../content';
import { INPUT_SM, TEXTAREA, SectionTitle, OptionsEditor } from './ui';
import { JEOPARDY_VALUES, blankJeopardyCell } from './packUtils';

interface Props {
  data: JeopardyData;
  onChange: (data: JeopardyData) => void;
}

function cellComplete(c: JeopardyCellData | undefined): 'empty' | 'partial' | 'full' {
  if (!c) return 'empty';
  const filled = [c.text, ...c.options].filter(s => s.trim()).length;
  if (filled === 0) return 'empty';
  return filled === 5 ? 'full' : 'partial';
}

export default function JeopardyEditor({ data, onChange }: Props) {
  const [sel, setSel] = useState<{ t: number; v: number } | null>(null);

  // гарантируем 5 тем и 5 ячеек на тему
  const topics = [...data.topics];
  while (topics.length < 5) topics.push(`Тема ${topics.length + 1}`);
  const getCells = (topic: string): JeopardyCellData[] => {
    const existing = data.cells[topic] ?? [];
    return JEOPARDY_VALUES.map(v => existing.find(c => c.value === v) ?? blankJeopardyCell(v));
  };

  const renameTopic = (i: number, name: string) => {
    const old = topics[i];
    const nextTopics = [...topics];
    nextTopics[i] = name;
    const cells: Record<string, JeopardyCellData[]> = {};
    nextTopics.forEach((t, j) => { cells[t] = j === i ? getCells(old) : getCells(t); });
    onChange({ ...data, topics: nextTopics.slice(0, 5), cells });
  };

  const updateCell = (t: number, v: number, patch: Partial<JeopardyCellData>) => {
    const topic = topics[t];
    const cellsForTopic = getCells(topic);
    cellsForTopic[v] = { ...cellsForTopic[v], ...patch, value: JEOPARDY_VALUES[v] };
    const cells: Record<string, JeopardyCellData[]> = {};
    topics.forEach(tp => { cells[tp] = tp === topic ? cellsForTopic : getCells(tp); });
    onChange({ ...data, topics: topics.slice(0, 5), cells });
  };

  const total = topics.reduce((n, t) => n + getCells(t).filter(c => cellComplete(c) === 'full').length, 0);
  const selected = sel ? getCells(topics[sel.t])[sel.v] : null;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle right={<span className="text-xs font-bold text-[var(--color-dungeon-gold)]">{total} / 25 заполнено</span>}>
          Сетка 5 тем × 5 стоимостей
        </SectionTitle>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="grid gap-1.5 min-w-[560px]" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {topics.slice(0, 5).map((t, i) => (
              <input
                key={i}
                type="text"
                value={t}
                onChange={e => renameTopic(i, e.target.value)}
                placeholder={`Тема ${i + 1}`}
                className={`${INPUT_SM} text-center font-bold !rounded-2xl`}
                title="Название темы"
              />
            ))}
            {JEOPARDY_VALUES.map((value, v) =>
              topics.slice(0, 5).map((t, ti) => {
                const state = cellComplete(getCells(t)[v]);
                const active = sel?.t === ti && sel?.v === v;
                const tone = state === 'full'
                  ? 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'
                  : state === 'partial'
                    ? 'bg-[var(--color-dungeon-accent)]/30 text-[#FFB3DF] border border-[var(--color-dungeon-accent)]/60'
                    : 'bg-white/5 text-white/45 border border-white/10 hover:bg-white/10';
                return (
                  <button
                    key={`${ti}-${v}`}
                    type="button"
                    onClick={() => setSel(active ? null : { t: ti, v })}
                    className={`h-12 rounded-2xl font-extrabold text-base transition-all ${tone} ${active ? 'ring-2 ring-white scale-[1.03]' : ''}`}
                    title={state === 'full' ? 'Заполнено' : state === 'partial' ? 'Заполнено частично' : 'Пусто'}
                  >
                    {value}
                  </button>
                );
              }),
            )}
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-[11px] font-semibold text-[var(--color-dungeon-muted)]">
          <span><span className="inline-block w-3 h-3 rounded-sm bg-[var(--color-dungeon-gold)] align-middle mr-1" />заполнено</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-[var(--color-dungeon-accent)]/50 align-middle mr-1" />частично</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-white/10 align-middle mr-1" />пусто</span>
        </div>
      </section>

      {sel && selected && (
        <section className="glass-panel-gold p-4 animate-[fadeIn_0.2s_ease-out]">
          <SectionTitle right={<button type="button" onClick={() => setSel(null)} className="btn-secondary py-1 px-3 text-xs">Закрыть</button>}>
            {topics[sel.t] || `Тема ${sel.t + 1}`} · {selected.value}
          </SectionTitle>
          <div className="flex flex-col gap-3">
            <textarea
              value={selected.text}
              onChange={e => updateCell(sel.t, sel.v, { text: e.target.value })}
              rows={2}
              placeholder="Текст вопроса"
              autoFocus
              className={TEXTAREA}
            />
            <OptionsEditor
              name={`jc-${sel.t}-${sel.v}`}
              options={selected.options}
              correctIndex={selected.correctIndex}
              onChange={(options, correctIndex) => updateCell(sel.t, sel.v, { options, correctIndex })}
            />
            <div className="flex justify-between gap-2">
              <button
                type="button"
                disabled={sel.v === 0}
                onClick={() => setSel({ t: sel.t, v: sel.v - 1 })}
                className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30"
              >← {JEOPARDY_VALUES[sel.v - 1] ?? ''}</button>
              <button
                type="button"
                disabled={sel.v === 4}
                onClick={() => setSel({ t: sel.t, v: sel.v + 1 })}
                className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30"
              >{JEOPARDY_VALUES[sel.v + 1] ?? ''} →</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
