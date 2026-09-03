import { useState, useEffect, useCallback } from 'react';
import type { DungeonConfig, FloorConfig, RoundParams, WhoAnswers, QuestionScope } from '../types';
import { apiGet, apiPost, apiDelete } from './api';
import { ErrorBanner, SectionTitle, EmptyHint, AddButton, ConfirmModal } from './ui';
import { INPUT, INPUT_SM } from './ui';

const DEFAULT_PARAMS: RoundParams = {
  name: 'Новый раунд',
  emoji: '⚔️',
  description: '',
  answerFormat: 'four',
  questionScope: 'shared',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 20,
  speedScaling: false,
  bet: false,
  commsBlocked: false,
  damageMode: 'all',
};

const ROUND_TEMPLATES: { label: string; params: RoundParams }[] = [
  {
    label: '⚔️ Классический бой',
    params: { name: 'Классический бой', emoji: '⚔️', description: 'Вопрос видят все, отвечает каждый.', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'all' },
  },
  {
    label: '👑 Ставка капитана',
    params: { name: 'Ставка капитана', emoji: '👑', description: 'Отвечает только капитан. Можно сделать ставку.', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'captain', timed: true, timeLimit: 25, speedScaling: false, bet: true, commsBlocked: false, damageMode: 'all' },
  },
  {
    label: '🎯 Свой вопрос',
    params: { name: 'Свой вопрос', emoji: '🎯', description: 'Каждый получает свой вопрос.', answerFormat: 'four', questionScope: 'personal', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'wrong-only' },
  },
  {
    label: '⚡ На скорость',
    params: { name: 'На скорость', emoji: '⚡', description: 'Все отвечают. Чем быстрее — тем сильнее урон!', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 15, speedScaling: true, bet: false, commsBlocked: false, damageMode: 'wrong-only' },
  },
  {
    label: '🔇 Изоляция',
    params: { name: 'Изоляция', emoji: '🔇', description: 'Связь заблокирована — думай сам!', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: true, damageMode: 'all' },
  },
  {
    label: '💀 Жертва',
    params: { name: 'Жертва', emoji: '💀', description: 'Один случайный игрок отвечает. Ошибка = смерть!', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'sacrifice', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'all' },
  },
  {
    label: '🔗 Цепочка',
    params: { name: 'Цепочка', emoji: '🔗', description: 'Быстрые вопросы по очереди — 5 секунд каждому!', answerFormat: 'four', questionScope: 'personal', whoAnswers: 'chain', timed: true, timeLimit: 5, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'wrong-only' },
  },
  {
    label: '🔥 Супер-босс',
    params: { name: 'Супер-босс', emoji: '🔥', description: 'Финальный босс! Скорость и ставки!', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 15, speedScaling: true, bet: false, commsBlocked: false, damageMode: 'all' },
  },
];

// ─── Sub-components ──────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${checked ? 'bg-[var(--color-dungeon-accent)]' : 'bg-gray-600'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <span className={checked ? 'text-white' : 'text-gray-400'}>{label}</span>
    </label>
  );
}

function DifficultyPicker({ value, onChange }: { value: FloorConfig['difficulty']; onChange: (v: FloorConfig['difficulty']) => void }) {
  const opts: { val: FloorConfig['difficulty']; label: string; color: string }[] = [
    { val: 'easy', label: 'Easy', color: 'bg-green-600 border-green-400' },
    { val: 'medium', label: 'Medium', color: 'bg-yellow-600 border-yellow-400' },
    { val: 'hard', label: 'Hard', color: 'bg-red-600 border-red-400' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button
          key={o.val}
          onClick={() => onChange(o.val)}
          className={`px-3 py-1 rounded-lg text-sm font-bold border-2 transition-all ${
            value === o.val ? `${o.color} text-white` : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FloorCard({
  floor,
  index,
  total,
  onUpdate,
  onDelete,
  onMove,
}: {
  floor: FloorConfig;
  index: number;
  total: number;
  onUpdate: (f: FloorConfig) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const p = floor.params;
  const diffColor = floor.difficulty === 'easy' ? 'border-green-500/40' : floor.difficulty === 'medium' ? 'border-yellow-500/40' : 'border-red-500/40';

  const updateParams = (patch: Partial<RoundParams>) => {
    onUpdate({ ...floor, params: { ...floor.params, ...patch } });
  };

  return (
    <div className={`bg-[var(--color-dungeon-surface)] border-2 ${diffColor} rounded-2xl p-4 transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <button disabled={index === 0} onClick={() => onMove(-1)} className="text-gray-400 hover:text-white disabled:opacity-20 text-xs leading-none">▲</button>
          <button disabled={index === total - 1} onClick={() => onMove(1)} className="text-gray-400 hover:text-white disabled:opacity-20 text-xs leading-none">▼</button>
        </div>
        <span className="text-sm font-bold text-gray-400 w-8">#{floor.number}</span>
        <span className="text-2xl">{p.emoji}</span>
        <span className="font-bold text-white flex-1">{p.name}</span>
        <div className="flex gap-1.5 text-[10px] text-gray-500">
          {p.speedScaling && <span className="px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">⚡</span>}
          {p.commsBlocked && <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">🔇</span>}
          {p.bet && <span className="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400">🎲</span>}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-white transition-colors text-sm px-2">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors text-lg" title="Удалить">🗑️</button>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Template picker */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5 font-bold uppercase">Шаблон раунда</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ROUND_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => onUpdate({ ...floor, params: { ...t.params } })}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border transition-all ${
                    p.name === t.params.name
                      ? 'bg-[var(--color-dungeon-accent)]/30 border-[var(--color-dungeon-accent)] text-white'
                      : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name + emoji */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              placeholder="Название раунда"
              value={p.name}
              onChange={e => updateParams({ name: e.target.value })}
              className="py-1.5 px-3 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm"
            />
            <input
              type="text"
              placeholder="Emoji"
              value={p.emoji}
              onChange={e => updateParams({ emoji: e.target.value })}
              maxLength={4}
              className="w-16 py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm text-center"
            />
          </div>

          {/* Description */}
          <input
            type="text"
            placeholder="Описание правил"
            value={p.description}
            onChange={e => updateParams({ description: e.target.value })}
            className="py-1.5 px-3 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm"
          />

          {/* Core params */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Кто отвечает</div>
              <select
                value={p.whoAnswers}
                onChange={e => updateParams({ whoAnswers: e.target.value as WhoAnswers })}
                className="w-full py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm"
              >
                <option value="everyone">Все</option>
                <option value="captain">Капитан</option>
                <option value="sacrifice">Жертва</option>
                <option value="chain">Цепочка</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Вопрос</div>
              <select
                value={p.questionScope}
                onChange={e => updateParams({ questionScope: e.target.value as QuestionScope })}
                className="w-full py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm"
              >
                <option value="shared">Один на всех</option>
                <option value="personal">Каждому свой</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">⏱️ Время (сек)</div>
              <input
                type="number"
                min={3}
                max={120}
                value={p.timeLimit}
                onChange={e => updateParams({ timeLimit: Number(e.target.value) })}
                className="w-full py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-bg)] border border-gray-700 text-white text-sm text-center"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Toggle label="⚡ Скорость = урон" checked={p.speedScaling} onChange={v => updateParams({ speedScaling: v })} />
            <Toggle label="🔇 Изоляция" checked={p.commsBlocked} onChange={v => updateParams({ commsBlocked: v })} />
            <Toggle label="🎲 Ставка" checked={p.bet} onChange={v => updateParams({ bet: v })} />
          </div>

          {/* Difficulty */}
          <div className="flex flex-wrap items-center gap-4">
            <DifficultyPicker value={floor.difficulty} onChange={d => onUpdate({ ...floor, difficulty: d })} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={floor.isBoss ?? false}
                onChange={e => onUpdate({ ...floor, isBoss: e.target.checked })}
                className="w-4 h-4 accent-red-500"
              />
              <span className="text-red-400">💀 Босс</span>
            </label>
          </div>

          {/* Monster */}
          <div className="p-3 rounded-xl bg-[var(--color-dungeon-bg)]/60 border border-gray-700/50">
            <div className="text-xs text-gray-500 mb-2 font-bold uppercase tracking-wide">Монстр (опционально)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input type="text" placeholder="Имя" value={floor.monsterName ?? ''} onChange={e => onUpdate({ ...floor, monsterName: e.target.value || undefined })} className="py-1.5 px-3 rounded-lg bg-[var(--color-dungeon-surface)] border border-gray-700 text-white text-sm" />
              <input type="text" placeholder="Emoji" value={floor.monsterEmoji ?? ''} onChange={e => onUpdate({ ...floor, monsterEmoji: e.target.value || undefined })} maxLength={4} className="py-1.5 px-3 rounded-lg bg-[var(--color-dungeon-surface)] border border-gray-700 text-white text-sm text-center" />
              <label className="flex items-center gap-1 text-sm text-gray-400">❤️<input type="number" min={1} value={floor.monsterHp ?? ''} onChange={e => onUpdate({ ...floor, monsterHp: e.target.value ? Number(e.target.value) : undefined })} className="w-full py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-surface)] border border-gray-700 text-white text-sm text-center" /></label>
              <label className="flex items-center gap-1 text-sm text-gray-400">⚔️<input type="number" min={0} value={floor.monsterAttack ?? ''} onChange={e => onUpdate({ ...floor, monsterAttack: e.target.value ? Number(e.target.value) : undefined })} className="w-full py-1.5 px-2 rounded-lg bg-[var(--color-dungeon-surface)] border border-gray-700 text-white text-sm text-center" /></label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dungeons (этажи RPG-режима) ─────────────────────────────────

function blankDungeon(): DungeonConfig {
  return {
    id: '',
    name: '',
    description: '',
    floors: [],
    personalHp: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function DungeonsEditor() {
  const [dungeons, setDungeons] = useState<DungeonConfig[]>([]);
  const [editing, setEditing] = useState<DungeonConfig | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadDungeons = useCallback(async () => {
    const { data, error } = await apiGet<DungeonConfig[]>('/api/dungeons');
    if (error) setApiError(error);
    else { setDungeons(data ?? []); setApiError(null); }
  }, []);

  useEffect(() => { loadDungeons(); }, [loadDungeons]);

  const startNew = () => setEditing(blankDungeon());

  const selectDungeon = async (id: string) => {
    const { data, error } = await apiGet<DungeonConfig>(`/api/dungeons/${id}`);
    if (error) setApiError(error);
    else if (data) { setEditing(data); setApiError(null); }
  };

  const saveDungeon = async () => {
    if (!editing) return;
    setSaving(true);
    const { data, error } = await apiPost<DungeonConfig>('/api/dungeons', editing);
    setSaving(false);
    if (error) setApiError(error);
    else if (data) { setEditing(data); setApiError(null); await loadDungeons(); }
  };

  const deleteDungeon = async () => {
    if (!editing?.id) return;
    setConfirmDelete(false);
    const { error } = await apiDelete(`/api/dungeons/${editing.id}`);
    if (error) setApiError(error);
    else { setEditing(null); setApiError(null); await loadDungeons(); }
  };

  const updateField = <K extends keyof DungeonConfig>(key: K, val: DungeonConfig[K]) => {
    if (!editing) return;
    setEditing({ ...editing, [key]: val });
  };

  const renumberFloors = (floors: FloorConfig[]) => floors.map((f, i) => ({ ...f, number: i + 1 }));

  const updateFloor = (idx: number, floor: FloorConfig) => {
    if (!editing) return;
    const floors = [...editing.floors];
    floors[idx] = floor;
    setEditing({ ...editing, floors });
  };

  const deleteFloor = (idx: number) => {
    if (!editing) return;
    const floors = [...editing.floors];
    floors.splice(idx, 1);
    setEditing({ ...editing, floors: renumberFloors(floors) });
  };

  const moveFloor = (idx: number, dir: -1 | 1) => {
    if (!editing) return;
    const target = idx + dir;
    if (target < 0 || target >= editing.floors.length) return;
    const floors = [...editing.floors];
    [floors[idx], floors[target]] = [floors[target], floors[idx]];
    setEditing({ ...editing, floors: renumberFloors(floors) });
  };

  const addFloor = () => {
    if (!editing) return;
    const n = editing.floors.length + 1;
    setEditing({
      ...editing,
      floors: [...editing.floors, { number: n, params: { ...DEFAULT_PARAMS }, difficulty: 'easy' }],
    });
  };

  const applyDefaultPreset = () => {
    if (!editing) return;
    setEditing({
      ...editing,
      floors: ROUND_TEMPLATES.map((t, i) => ({
        number: i + 1,
        params: { ...t.params },
        difficulty: (i < 3 ? 'easy' : i < 7 ? 'medium' : 'hard') as 'easy' | 'medium' | 'hard',
        isBoss: i === 3 || i === 7,
        ...(i === 3 ? { monsterName: 'Минотавр', monsterEmoji: '🐂', monsterHp: 80, monsterAttack: 20 } : {}),
        ...(i === 7 ? { monsterName: 'Дракон Невежества', monsterEmoji: '🐉', monsterHp: 120, monsterAttack: 35 } : {}),
      })),
      personalHp: 100,
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {confirmDelete && (
        <ConfirmModal title="Удалить этот данжен?" text="Действие нельзя отменить." confirmLabel="Удалить" danger onConfirm={deleteDungeon} onCancel={() => setConfirmDelete(false)} />
      )}
      <aside className="lg:w-64 shrink-0">
        <button onClick={startNew} className="btn-primary w-full py-2.5 px-4 text-sm mb-3">+ Создать данжен</button>
        {apiError && <div className="mb-3"><ErrorBanner message={apiError} onClose={() => setApiError(null)} /></div>}
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:max-h-[65vh] lg:overflow-y-auto pb-1">
          {dungeons.length === 0 && !apiError && <div className="text-xs text-[var(--color-dungeon-muted)] font-medium">Данженов пока нет</div>}
          {dungeons.map(d => (
            <button
              key={d.id}
              onClick={() => selectDungeon(d.id)}
              className={`text-left p-3 rounded-2xl border transition-all shrink-0 min-w-[180px] lg:min-w-0 ${
                editing?.id === d.id
                  ? 'bg-[var(--color-dungeon-accent)]/20 border-[var(--color-dungeon-accent)]'
                  : 'bg-white/[0.04] border-white/10 hover:border-white/30'
              }`}
            >
              <div className="font-bold text-white text-sm truncate">{d.name || 'Без названия'}</div>
              <div className="text-xs text-[var(--color-dungeon-muted)] mt-0.5 font-medium">{d.floors.length} этажей</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {!editing ? (
          <EmptyHint>Выберите данжен или создайте новый</EmptyHint>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="glass-panel p-4">
              <SectionTitle>Основные настройки</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <input type="text" placeholder="Название данжена" value={editing.name} onChange={e => updateField('name', e.target.value)} className={INPUT} />
                </div>
                <div className="sm:col-span-2">
                  <input type="text" placeholder="Описание" value={editing.description} onChange={e => updateField('description', e.target.value)} className={INPUT} />
                </div>
                <label className="flex items-center gap-2 text-sm text-white/80 font-medium">
                  ❤️ HP игроков
                  <input type="number" min={1} value={editing.personalHp} onChange={e => updateField('personalHp', Number(e.target.value))} className={`${INPUT_SM} !w-24 text-center`} />
                </label>
              </div>
            </section>

            <section>
              <SectionTitle>Быстрый пресет</SectionTitle>
              <button onClick={applyDefaultPreset} className="btn-secondary py-2 px-4 text-sm">
                🏰 Стандартный (8 этажей)
              </button>
            </section>

            <section>
              <SectionTitle>Этажи ({editing.floors.length})</SectionTitle>
              <div className="flex flex-col gap-3">
                {editing.floors.map((floor, i) => (
                  <FloorCard
                    key={i}
                    floor={floor}
                    index={i}
                    total={editing.floors.length}
                    onUpdate={f => updateFloor(i, f)}
                    onDelete={() => deleteFloor(i)}
                    onMove={d => moveFloor(i, d)}
                  />
                ))}
              </div>
              <div className="mt-3"><AddButton onClick={addFloor}>➕ Добавить этаж</AddButton></div>
            </section>

            <div className="flex gap-3 pb-8">
              <button onClick={saveDungeon} disabled={saving} className="btn-primary flex-1 py-3 px-4">
                {saving ? 'Сохранение...' : '💾 Сохранить'}
              </button>
              {editing.id && (
                <button onClick={() => setConfirmDelete(true)} className="py-3 px-6 rounded-3xl bg-[#FF4848]/15 border border-[#FF4848]/40 text-[#FF9A9A] font-bold hover:bg-[#FF4848]/25 transition-all active:scale-[0.97]">
                  🗑️ Удалить
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
