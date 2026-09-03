import { useEffect, useState } from 'react';
import { GAME_MODES } from '../types';
import type { GameMode } from '../types';
import type { ContentPack } from '../content';
import QpHeader from '../components/QpHeader';
import PackList from '../admin/PackList';
import PackEditor from '../admin/PackEditor';
import DungeonsEditor from '../admin/DungeonsEditor';

type ClassicTab = 'questions' | 'floors';

const MODE_IDS = new Set<string>(GAME_MODES.map(m => m.id));
const LS_MODE = 'qd-admin-mode';

function readInitialMode(): GameMode {
  try {
    const saved = localStorage.getItem(LS_MODE);
    if (saved && MODE_IDS.has(saved)) return saved as GameMode;
  } catch { /* ignore */ }
  return 'classic';
}

export default function AdminScreen() {
  const [mode, setMode] = useState<GameMode>(readInitialMode);
  const [classicTab, setClassicTab] = useState<ClassicTab>('questions');
  const [editing, setEditing] = useState<ContentPack | null>(null);
  const [listKey, setListKey] = useState(0);

  useEffect(() => { try { localStorage.setItem(LS_MODE, mode); } catch { /* ignore */ } }, [mode]);

  const info = GAME_MODES.find(m => m.id === mode)!;

  const switchMode = (m: GameMode) => {
    if (m === mode) return;
    setEditing(null);
    setMode(m);
  };

  const closeEditor = () => { setEditing(null); setListKey(k => k + 1); };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--color-dungeon-bg)]/85 backdrop-blur border-b border-white/10 px-4 py-2.5 flex items-center gap-3 sm:gap-4">
        <QpHeader subtitle="Конструктор" />
        <a href="#/" className="ml-auto text-sm font-bold text-white/70 hover:text-white transition-colors whitespace-nowrap">← В игру</a>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto">
        {/* Mode tabs: horizontal strip on mobile, vertical list on desktop */}
        <nav className="lg:w-64 xl:w-72 shrink-0 lg:border-r border-white/10 p-3 lg:p-4">
          <div className="hidden lg:block text-xs font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-3">Режимы</div>
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-3 px-3 lg:mx-0 lg:px-0">
            {GAME_MODES.map(m => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchMode(m.id)}
                  title={m.description}
                  className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shrink-0 transition-all ${
                    active
                      ? 'bg-[var(--color-dungeon-surface-2)] ring-2 ring-[var(--color-dungeon-gold)] shadow-[0_0_18px_rgba(255,219,16,0.25)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.09]'
                  }`}
                >
                  <span className="text-2xl leading-none">{m.emoji}</span>
                  <span className={`text-sm font-bold leading-tight whitespace-nowrap lg:whitespace-normal ${active ? 'text-white' : 'text-white/80'}`}>{m.name}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-4xl leading-none">{info.emoji}</span>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">{info.name}</h1>
              <p className="text-sm text-[var(--color-dungeon-muted)] font-medium">{info.description}</p>
            </div>
          </div>

          {mode === 'classic' && !editing && (
            <div className="flex gap-2 mb-4">
              {([['questions', '❓ Вопросы'], ['floors', '🏰 Этажи']] as [ClassicTab, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setClassicTab(id)}
                  className={`py-2 px-4 rounded-3xl text-sm font-bold transition-all ${
                    classicTab === id ? 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]' : 'bg-white/[0.07] text-white hover:bg-white/[0.12]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === 'classic' && classicTab === 'floors' && !editing ? (
            <DungeonsEditor />
          ) : editing ? (
            <PackEditor key={editing.id || 'new'} mode={mode} pack={editing} onSaved={p => setEditing(p)} onCancel={closeEditor} />
          ) : (
            <PackList key={`${mode}-${listKey}`} mode={mode} onEdit={setEditing} />
          )}
        </main>
      </div>
    </div>
  );
}
