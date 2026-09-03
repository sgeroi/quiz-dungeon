import { useState } from 'react';
import { useStore } from '../store';
import { GAME_MODES } from '../types';
import type { GameMode } from '../types';
import GameModeGrid from '../components/GameModeGrid';
import QpHeader from '../components/QpHeader';

export default function HomeScreen() {
  const { playerName, setPlayerName, createRoom, joinRoom, error, clearError } = useStore();
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState('');
  const [interactive, setInteractive] = useState(false);

  const selectedInfo = selectedMode ? GAME_MODES.find((m) => m.id === selectedMode) : null;

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <QpHeader subtitle="Башня Знаний" />
        <a href="#/admin" className="text-sm font-bold text-white/70 hover:text-white transition-colors">
          Конструктор
        </a>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] gap-6 md:gap-10 items-center mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-[44px] font-extrabold leading-[1.1] tracking-tight">
            Платформа интерактивных интеллектуально-развлекательных игр для компании
          </h1>
          <p className="mt-4 text-lg sm:text-2xl font-bold text-[var(--color-dungeon-gold)] max-w-xl leading-snug">
            Играйте в одной комнате или с друзьями по сети
          </p>
        </div>

        {/* Name + actions card */}
        <div className="glass-panel p-5 sm:p-6 animate-[fadeIn_0.5s_ease-out]">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Имя героя</div>
          <input
            type="text"
            placeholder="Как тебя звать?"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={16}
            className="qp-input w-full py-3.5 px-5 text-lg font-semibold mb-4"
          />

          {error && (
            <div
              className="w-full py-2.5 px-4 rounded-2xl bg-[#FF4848]/15 border border-[#FF4848]/40 text-[#FF9A9A] text-sm font-semibold text-center mb-4 cursor-pointer"
              onClick={clearError}
            >
              {error}
            </div>
          )}

          <button
            onClick={() => createRoom(selectedMode ?? undefined, { interactive })}
            className="btn-primary w-full py-4 px-5 text-lg"
          >
            {selectedInfo ? `Создать пати · ${selectedInfo.name}` : 'Создать пати'}
          </button>
          <div className="text-center text-xs text-[var(--color-dungeon-muted)] mt-2 mb-3 font-medium">
            {selectedInfo ? selectedInfo.description : 'Игру можно выбрать ниже или уже в пати.'}
          </div>

          <label className={`flex items-start gap-3 rounded-2xl px-4 py-3 mb-3 cursor-pointer transition-colors border ${
            interactive ? 'bg-[var(--color-dungeon-gold)]/10 border-[var(--color-dungeon-gold)]/50' : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
          }`}>
            <input
              type="checkbox"
              checked={interactive}
              onChange={(e) => setInteractive(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-dungeon-gold)] cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Интерактив: вход по QR</span>
              <span className="block text-xs text-[var(--color-dungeon-muted)] font-medium leading-snug">
                Без камеры и микрофона. Игроки заходят с телефонов по QR, вопросы можно вывести на ТВ.
              </span>
            </span>
          </label>

          <button
            onClick={() => setShowJoin((v) => !v)}
            className={`btn-secondary w-full py-3.5 px-5 text-base ${showJoin ? 'ring-1 ring-[var(--color-dungeon-gold)]' : ''}`}
          >
            Войти по коду
          </button>

          {showJoin && (
            <div className="flex gap-2 mt-3 animate-[fadeIn_0.3s_ease-out]">
              <input
                type="text"
                placeholder="ABCD"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(code); }}
                maxLength={4}
                className="qp-input flex-1 min-w-0 py-3 px-4 text-center text-2xl font-extrabold tracking-[0.4em] uppercase"
              />
              <button onClick={() => joinRoom(code)} className="btn-primary py-3 px-6 whitespace-nowrap">
                Войти
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Catalog */}
      <div className="rounded-3xl neon-pink bg-[var(--color-dungeon-surface)]/60 p-4 sm:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Выбери игру</h2>
          <span className="text-sm font-semibold text-[var(--color-dungeon-gold)]">{GAME_MODES.length} режимов</span>
        </div>
        <GameModeGrid
          selected={selectedMode}
          onSelect={(m) => setSelectedMode(m === selectedMode ? null : m)}
          showDescription
        />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-[var(--color-dungeon-muted)] font-medium">
        <a href="#/screen" className="text-sm font-bold text-white/70 hover:text-white transition-colors">
          📺 Открыть экран для ТВ
        </a>
        <span>Квиз, плиз! Хоум · игра для компании на своих экранах</span>
      </div>
    </div>
  );
}
