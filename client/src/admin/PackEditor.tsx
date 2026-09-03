import { useEffect, useMemo, useState } from 'react';
import type { GameMode } from '../types';
import type { ContentPack, ContentData } from '../content';
import { apiPost } from './api';
import { INPUT, ErrorBanner, ErrorList, Badge, ConfirmModal } from './ui';
import { validatePack, downloadJson, safeFilename, packItemCount } from './packUtils';
import SimpleQuestionsEditor from './SimpleQuestionsEditor';
import JeopardyEditor from './JeopardyEditor';
import BucketsEditor from './BucketsEditor';
import PetersburgEditor from './PetersburgEditor';

interface Props {
  mode: GameMode;
  pack: ContentPack;
  onSaved: (pack: ContentPack) => void;
  onCancel: () => void;
}

export default function PackEditor({ mode, pack, onSaved, onCancel }: Props) {
  const [original, setOriginal] = useState<ContentPack>(pack);
  const [draft, setDraft] = useState<ContentPack>(pack);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const [askLeave, setAskLeave] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => { setOriginal(pack); setDraft(pack); setValidation([]); setApiError(null); }, [pack]);

  const dirty = useMemo(
    () => draft.name !== original.name || JSON.stringify(draft.data) !== JSON.stringify(original.data),
    [draft, original],
  );

  // Предупреждение при закрытии вкладки с несохранёнными правками
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const setData = (data: ContentData) => setDraft(d => ({ ...d, data }));

  const save = async () => {
    const errors = validatePack(draft);
    setValidation(errors);
    if (errors.length > 0) return;
    setSaving(true);
    setApiError(null);
    const body: { id?: string; mode: GameMode; name: string; data: ContentData } = { mode: draft.mode, name: draft.name.trim(), data: draft.data };
    if (draft.id) body.id = draft.id;
    const { data, error } = await apiPost<ContentPack>('/api/content', body);
    setSaving(false);
    if (error || !data) { setApiError(`Не удалось сохранить: ${error ?? 'пустой ответ'}`); return; }
    setOriginal(data);
    setDraft(data);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    onSaved(data);
  };

  const cancel = () => { if (dirty) setAskLeave(true); else onCancel(); };

  const exportJson = () => downloadJson(`${safeFilename(draft.name)}.${mode}.json`, draft);

  const editor = (() => {
    const d = draft.data;
    switch (d.kind) {
      case 'simple': return <SimpleQuestionsEditor mode={mode} data={d} onChange={setData} />;
      case 'jeopardy': return <JeopardyEditor data={d} onChange={setData} />;
      case 'buckets': return <BucketsEditor data={d} onChange={setData} />;
      case 'petersburg': return <PetersburgEditor data={d} onChange={setData} />;
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      {askLeave && (
        <ConfirmModal title="Есть несохранённые изменения" text="Выйти без сохранения?" confirmLabel="Выйти" danger onConfirm={onCancel} onCancel={() => setAskLeave(false)} />
      )}

      {/* Sticky toolbar */}
      <div className="sticky top-[57px] z-20 -mx-1 px-1 py-2 bg-[var(--color-dungeon-bg)]/90 backdrop-blur">
        <div className="glass-panel px-3 py-2.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={cancel} className="btn-secondary py-2 px-3.5 text-sm">← Наборы</button>
          <input
            type="text"
            value={draft.name}
            placeholder="Название набора"
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className={`${INPUT} flex-1 min-w-[160px] font-bold`}
          />
          <div className="flex items-center gap-1.5">
            {draft.builtin && <Badge tone="gold">встроенный</Badge>}
            {!draft.id && <Badge tone="pink">новый</Badge>}
            {dirty ? <Badge tone="pink">● не сохранено</Badge> : savedFlash ? <Badge tone="green">✓ сохранено</Badge> : draft.id ? <Badge tone="green">сохранено</Badge> : null}
          </div>
          <div className="flex gap-1.5 ml-auto">
            <button type="button" onClick={exportJson} className="btn-secondary py-2 px-3.5 text-sm" title="Скачать JSON пака">⤓ JSON</button>
            <button type="button" onClick={cancel} className="btn-secondary py-2 px-3.5 text-sm">Отмена</button>
            <button type="button" onClick={save} disabled={saving || (!dirty && !!draft.id)} className="btn-primary py-2 px-5 text-sm">
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onClose={() => setApiError(null)} />}
      <ErrorList errors={validation} />

      <div className="text-xs font-medium text-[var(--color-dungeon-muted)]">
        {packItemCount(draft.data)} элем. · {draft.id ? `id: ${draft.id}` : 'ещё не сохранён'}
      </div>

      {editor}
      <div className="h-8" />
    </div>
  );
}
