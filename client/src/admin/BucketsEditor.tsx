import { useState } from 'react';
import type { BucketsData, BucketSetData } from '../content';
import { INPUT, INPUT_SM, SELECT, SectionTitle, IconButton, AddButton, EmptyHint, Badge } from './ui';
import { blankBucketSet } from './packUtils';

interface Props {
  data: BucketsData;
  onChange: (data: BucketsData) => void;
}

export default function BucketsEditor({ data, onChange }: Props) {
  const [open, setOpen] = useState<number | null>(data.sets.length === 1 ? 0 : null);
  const sets = data.sets;

  const setSets = (next: BucketSetData[]) => onChange({ ...data, sets: next });
  const updateSet = (i: number, patch: Partial<BucketSetData>) => {
    const next = [...sets];
    next[i] = { ...next[i], ...patch };
    setSets(next);
  };
  const addSet = () => { setSets([...sets, blankBucketSet()]); setOpen(sets.length); };
  const deleteSet = (i: number) => { const next = [...sets]; next.splice(i, 1); setSets(next); setOpen(null); };
  const duplicateSet = (i: number) => {
    const s = sets[i];
    const copy: BucketSetData = { title: `${s.title} (копия)`, buckets: s.buckets.map(b => ({ ...b })), items: s.items.map(it => ({ ...it })) };
    const next = [...sets];
    next.splice(i + 1, 0, copy);
    setSets(next);
    setOpen(i + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle right={<button type="button" onClick={addSet} className="btn-primary py-1.5 px-3.5 text-xs">+ Набор</button>}>
        Наборы · {sets.length}
      </SectionTitle>

      {sets.length === 0 && <EmptyHint>Пока нет наборов. Каждый набор — 4 корзины и список предметов.</EmptyHint>}

      {sets.map((s, i) => {
        const isOpen = open === i;
        const buckets = [0, 1, 2, 3].map(j => s.buckets[j] ?? { name: '', emoji: '' });
        return (
          <div key={i} className={`rounded-2xl border ${isOpen ? 'border-[var(--color-dungeon-gold)]/50 bg-[var(--color-dungeon-surface-2)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'}`}>
            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setOpen(isOpen ? null : i)}>
              <span className="text-xs font-bold text-[var(--color-dungeon-muted)] w-7 shrink-0">#{i + 1}</span>
              <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${s.title ? 'text-white' : 'text-white/40 italic'}`}>{s.title || 'Без названия'}</span>
              <span className="hidden sm:inline text-lg tracking-tight">{buckets.map(b => b.emoji).join('')}</span>
              <Badge>{s.items.length} предм.</Badge>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <IconButton title="Дублировать" onClick={() => duplicateSet(i)}>⧉</IconButton>
                <IconButton title="Удалить" danger onClick={() => deleteSet(i)}>✕</IconButton>
              </div>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
                <input type="text" value={s.title} placeholder="Название набора (например, «Съедобное — несъедобное»)" onChange={e => updateSet(i, { title: e.target.value })} className={INPUT} />

                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Корзины (4)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {buckets.map((b, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={b.emoji}
                          maxLength={4}
                          placeholder="🪣"
                          onChange={e => { const nb = buckets.map(x => ({ ...x })); nb[j].emoji = e.target.value; updateSet(i, { buckets: nb }); }}
                          className={`${INPUT_SM} !w-14 text-center text-lg px-1`}
                        />
                        <input
                          type="text"
                          value={b.name}
                          placeholder={`Корзина ${j + 1}`}
                          onChange={e => { const nb = buckets.map(x => ({ ...x })); nb[j].name = e.target.value; updateSet(i, { buckets: nb }); }}
                          className={INPUT_SM}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Предметы · {s.items.length}</div>
                  <div className="flex flex-col gap-1.5">
                    {s.items.map((it, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={it.text}
                          placeholder="Предмет"
                          onChange={e => { const items = s.items.map(x => ({ ...x })); items[k].text = e.target.value; updateSet(i, { items }); }}
                          className={INPUT_SM}
                        />
                        <select
                          value={it.bucket}
                          onChange={e => { const items = s.items.map(x => ({ ...x })); items[k].bucket = Number(e.target.value); updateSet(i, { items }); }}
                          className={`${SELECT} !w-40 sm:!w-52 shrink-0`}
                        >
                          {buckets.map((b, j) => <option key={j} value={j}>{b.emoji} {b.name || `Корзина ${j + 1}`}</option>)}
                        </select>
                        <IconButton title="Удалить" danger onClick={() => { const items = [...s.items]; items.splice(k, 1); updateSet(i, { items }); }}>✕</IconButton>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <AddButton onClick={() => updateSet(i, { items: [...s.items, { text: '', bucket: 0 }] })}>➕ Предмет</AddButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {sets.length > 0 && <AddButton onClick={addSet}>➕ Добавить набор</AddButton>}
    </div>
  );
}
