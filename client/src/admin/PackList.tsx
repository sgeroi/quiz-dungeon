import { useCallback, useEffect, useState } from 'react';
import type { GameMode } from '../types';
import type { ContentPack, ContentPackSummary } from '../content';
import { CONTENT_KIND_BY_MODE } from '../content';
import { apiGet, apiPost, apiDelete } from './api';
import { Badge, ErrorBanner, EmptyHint, ConfirmModal } from './ui';
import { blankPack } from './packUtils';

interface Props {
  mode: GameMode;
  onEdit: (pack: ContentPack) => void;
}

const KIND_UNIT: Record<ContentPack['data']['kind'], (n: number) => string> = {
  simple: n => plural(n, 'вопрос', 'вопроса', 'вопросов'),
  jeopardy: n => `${plural(n, 'ячейка', 'ячейки', 'ячеек')} из 25`,
  buckets: n => plural(n, 'набор', 'набора', 'наборов'),
  petersburg: n => plural(n, 'фильм', 'фильма', 'фильмов'),
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
  return `${n} ${word}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

type Confirm = { kind: 'delete' | 'reset'; pack: ContentPackSummary } | null;

export default function PackList({ mode, onEdit }: Props) {
  const [packs, setPacks] = useState<ContentPackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const kind = CONTENT_KIND_BY_MODE[mode];

  const load = useCallback(async () => {
    const { data, error } = await apiGet<ContentPackSummary[]>(`/api/content?mode=${encodeURIComponent(mode)}`);
    if (error) { setError(`Не удалось загрузить наборы: ${error}`); setPacks([]); }
    else { setPacks((data ?? []).filter(p => p.mode === mode)); setError(null); }
  }, [mode]);

  useEffect(() => { setPacks(null); load(); }, [load]);

  const openPack = async (id: string) => {
    setBusy(id);
    const { data, error } = await apiGet<ContentPack>(`/api/content/${encodeURIComponent(id)}`);
    setBusy(null);
    if (error || !data) { setError(`Не удалось открыть набор: ${error ?? 'пустой ответ'}`); return; }
    onEdit(data);
  };

  const duplicate = async (id: string) => {
    setBusy(id);
    const { error } = await apiPost<ContentPack>(`/api/content/${encodeURIComponent(id)}/duplicate`);
    setBusy(null);
    if (error) setError(`Не удалось дублировать: ${error}`);
    else await load();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { kind: action, pack } = confirm;
    setConfirm(null);
    setBusy(pack.id);
    const res = action === 'delete'
      ? await apiDelete(`/api/content/${encodeURIComponent(pack.id)}`)
      : await apiPost<ContentPack>(`/api/content/${encodeURIComponent(pack.id)}/reset`);
    setBusy(null);
    if (res.error) setError(`${action === 'delete' ? 'Не удалось удалить' : 'Не удалось сбросить'}: ${res.error}`);
    else await load();
  };

  return (
    <div className="flex flex-col gap-4">
      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'delete' ? `Удалить «${confirm.pack.name}»?` : `Сбросить «${confirm.pack.name}» к заводскому?`}
          text={confirm.kind === 'delete' ? 'Набор будет удалён без возможности восстановления.' : 'Все ваши правки во встроенном наборе будут потеряны, вернётся исходный контент.'}
          confirmLabel={confirm.kind === 'delete' ? 'Удалить' : 'Сбросить'}
          danger
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)]">
          Наборы{packs ? ` · ${packs.length}` : ''}
        </div>
        <button type="button" onClick={() => onEdit(blankPack(mode))} className="btn-primary py-2 px-4 text-sm">+ Новый набор</button>
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {packs === null && !error && <EmptyHint>Загрузка…</EmptyHint>}
      {packs !== null && packs.length === 0 && !error && <EmptyHint>Наборов для этого режима пока нет. Создайте первый.</EmptyHint>}
      {packs !== null && packs.length === 0 && error && (
        <EmptyHint>Список пуст. <button type="button" onClick={load} className="underline text-white/80">Повторить</button></EmptyHint>
      )}

      {packs && packs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {packs.map(p => {
            const isBusy = busy === p.id;
            return (
              <div key={p.id} className={`glass-panel p-4 flex flex-col gap-3 ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-base leading-tight truncate">{p.name || 'Без названия'}</div>
                    <div className="text-xs font-medium text-[var(--color-dungeon-muted)] mt-1">
                      {KIND_UNIT[kind](p.itemCount)}{p.updatedAt ? ` · ${fmtDate(p.updatedAt)}` : ''}
                    </div>
                  </div>
                  {p.builtin && <Badge tone="gold">встроенный</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => openPack(p.id)} className="btn-primary py-1.5 px-3.5 text-xs">Редактировать</button>
                  <button type="button" onClick={() => duplicate(p.id)} className="btn-secondary py-1.5 px-3.5 text-xs">Дублировать</button>
                  {p.builtin ? (
                    <button type="button" onClick={() => setConfirm({ kind: 'reset', pack: p })} className="btn-secondary py-1.5 px-3.5 text-xs text-[var(--color-dungeon-gold)]">Сбросить к заводскому</button>
                  ) : (
                    <button type="button" onClick={() => setConfirm({ kind: 'delete', pack: p })} className="py-1.5 px-3.5 text-xs rounded-3xl font-bold bg-[#FF4848]/15 text-[#FF9A9A] hover:bg-[#FF4848]/25 transition-colors">Удалить</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
