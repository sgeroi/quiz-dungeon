import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import { CLASS_LIST } from '../classData';
import { GAME_MODES } from '../types';
import type { PlayerClass, GameMode } from '../types';
import type { ContentPackSummary } from '../content';
import GameModeGrid from '../components/GameModeGrid';
import QpHeader from '../components/QpHeader';

function packUnit(mode: GameMode): string {
  if (mode === 'jeopardy-comp' || mode === 'jeopardy-coop') return 'ячеек';
  if (mode === 'buckets') return 'наборов';
  if (mode === 'petersburg') return 'фильмов';
  return 'вопросов';
}

export default function LobbyScreen() {
  const { gameState, playerId, selectClass, setReady, startGame, addBot, setGameMode, setContentPack, setInteractive } = useStore();
  const currentMode: GameMode = gameState?.gameMode ?? 'classic';

  // Content packs available for the selected mode (GET /api/content?mode=).
  const [packs, setPacks] = useState<ContentPackSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    setPacks([]);
    fetch(`/api/content?mode=${encodeURIComponent(currentMode)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ContentPackSummary[]) => { if (!cancelled) setPacks(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setPacks([]); });
    return () => { cancelled = true; };
  }, [currentMode]);

  if (!gameState || !playerId) return null;

  const players = Object.values(gameState.players);
  const me = gameState.players[playerId];
  const allReady = players.length >= 2 && players.every((p) => p.isReady);
  const isHost = gameState.hostId === playerId;
  const builtinPackId = `builtin-${currentMode}`;
  const selectedPackId = gameState.contentPacks?.[currentMode] ?? builtinPackId;
  const currentModeInfo = GAME_MODES.find((m) => m.id === currentMode) ?? GAME_MODES[0];
  const needsClass = currentMode === 'classic';
  const canReady = needsClass ? !!me?.playerClass : true;
  const readyCount = players.filter((p) => p.isReady).length;
  const interactive = !!gameState.interactive;
  const joinUrl = `${window.location.origin}/#/join/${gameState.roomCode}`;
  const screenUrl = `#/screen/${gameState.roomCode}`;

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 overflow-y-auto">
      {/* Header: logo + room code */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 max-w-6xl mx-auto w-full pl-14 sm:pl-24">
        <QpHeader subtitle="Башня Знаний" />
        <div className="flex items-center gap-3 rounded-full bg-black/40 border border-white/15 pl-4 pr-1.5 py-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)]">Код пати</span>
          <span className="rounded-full bg-[var(--color-dungeon-gold)] px-4 py-1.5 font-mono text-xl font-black tracking-[0.3em] text-[var(--color-dungeon-gold-fg)]">
            {gameState.roomCode}
          </span>
        </div>
      </div>

      {/* Two columns: party | game */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 max-w-6xl mx-auto w-full mb-5">
        {/* Party */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-extrabold">Пати</h2>
            <span className="text-sm font-semibold text-[var(--color-dungeon-muted)]">
              {players.length}/8 · готовы {readyCount}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {players.map((p) => {
              const isMe = p.id === playerId;
              const classDef = p.playerClass ? CLASS_LIST.find((c) => c.id === p.playerClass) : null;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl transition-all ${
                    isMe ? 'bg-[var(--color-dungeon-gold)]/10 border border-[var(--color-dungeon-gold)]/40' : 'bg-white/5'
                  }`}
                >
                  {needsClass && classDef?.sprite ? (
                    <img src={classDef.sprite} alt={classDef.nameRu} className="w-10 h-10 object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
                      {(needsClass && classDef?.emoji) || (p.isBot ? '🤖' : '🧑')}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                      {p.id === gameState.hostId && (
                        <span className="text-[10px] uppercase bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] px-1.5 py-0.5 rounded-full font-extrabold">хост</span>
                      )}
                      {p.isBot && <span className="text-[10px] uppercase text-white/70 bg-white/10 px-1.5 py-0.5 rounded-full font-extrabold">бот</span>}
                      <span className="truncate">{p.name}</span>
                      {isMe && <span className="text-xs text-[var(--color-dungeon-gold)]">(ты)</span>}
                    </div>
                    {needsClass && classDef && <div className="text-xs text-[var(--color-dungeon-muted)] font-medium">{classDef.nameRu}</div>}
                  </div>
                  {p.isReady ? (
                    <span className="rounded-full bg-[var(--color-dungeon-heal)]/20 text-[var(--color-dungeon-heal)] text-xs font-extrabold px-2.5 py-1">готов</span>
                  ) : (
                    <span className="rounded-full bg-white/5 text-white/40 text-xs font-bold px-2.5 py-1">ждём</span>
                  )}
                </div>
              );
            })}
          </div>
          {isHost && players.length < 8 && (
            <button
              onClick={addBot}
              className="btn-secondary w-full mt-3 py-2.5 px-4 text-sm border border-dashed border-white/20"
            >
              + Добавить бота
            </button>
          )}

          {/* Interactive: QR join */}
          {interactive && isHost && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-4">
              <div className="rounded-3xl bg-white p-3 shadow-[0_0_40px_rgba(255,219,16,0.2)]">
                <QRCodeSVG value={joinUrl} size={220} level="M" bgColor="#ffffff" fgColor="#1C0925" />
              </div>
              <div className="text-base font-extrabold text-center">Наведи камеру — и ты в пати</div>
              <a
                href={screenUrl}
                target="_blank"
                rel="noopener"
                className="btn-secondary w-full py-2.5 px-4 text-sm text-center"
              >
                📺 Открыть экран для ТВ
              </a>
            </div>
          )}
          {interactive && !isHost && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
              <div className="rounded-2xl bg-white p-1.5 shrink-0">
                <QRCodeSVG value={joinUrl} size={96} level="M" bgColor="#ffffff" fgColor="#1C0925" />
              </div>
              <div className="text-sm font-bold leading-snug">
                Позвать друга
                <div className="text-xs text-[var(--color-dungeon-muted)] font-medium mt-0.5">Пусть наведёт камеру на QR — сразу попадёт в пати.</div>
              </div>
            </div>
          )}

          {/* Interactive toggle (host) / badge (others) */}
          {isHost ? (
            <label className={`mt-3 flex items-start gap-3 rounded-2xl px-3.5 py-3 cursor-pointer transition-colors border ${
              interactive ? 'bg-[var(--color-dungeon-gold)]/10 border-[var(--color-dungeon-gold)]/50' : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
            }`}>
              <input
                type="checkbox"
                checked={interactive}
                onChange={(e) => setInteractive(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-dungeon-gold)] cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">Интерактив: вход по QR</span>
                <span className="block text-xs text-[var(--color-dungeon-muted)] font-medium leading-snug">Без камеры и микрофона, вопросы можно вывести на ТВ.</span>
              </span>
            </label>
          ) : interactive ? (
            <div className="mt-3 text-center text-xs font-bold text-[var(--color-dungeon-gold)]">Интерактив · без камеры и микрофона</div>
          ) : null}

          <div className="mt-3 text-xs text-[var(--color-dungeon-muted)] font-medium text-center">
            {interactive ? 'Друзья заходят по QR или по коду с телефона.' : 'Поделись кодом — друзья заходят с телефона, планшета или ноутбука.'}
          </div>
        </div>

        {/* Game */}
        <div className="rounded-3xl neon-pink bg-[var(--color-dungeon-surface)]/60 p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-extrabold">Игра</h2>
            <span className="text-sm font-semibold text-[var(--color-dungeon-muted)]">
              {isHost ? 'выбираешь ты' : 'выбирает хост'}
            </span>
          </div>
          <GameModeGrid
            selected={currentMode}
            onSelect={isHost ? (m: GameMode) => setGameMode(m) : undefined}
            columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            compact
          />
          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3">
            <div className="font-extrabold text-white">
              {currentModeInfo.emoji} {currentModeInfo.name}
            </div>
            <div className="text-sm text-[var(--color-dungeon-muted)] font-medium mt-0.5 leading-snug">{currentModeInfo.description}</div>
          </div>

          {/* Content pack picker — tiles */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)]">Набор вопросов</div>
              <div className="text-xs font-semibold text-[var(--color-dungeon-muted)]">{isHost ? 'выбираешь ты' : 'выбирает хост'}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(packs.length === 0
                ? [{ id: builtinPackId, name: 'Стандартный набор', builtin: true, itemCount: 0, mode: currentMode, updatedAt: '' } as ContentPackSummary]
                : packs
              ).map((pk) => {
                const isSel = pk.id === selectedPackId;
                return (
                  <button
                    key={pk.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => setContentPack(currentMode, pk.id === builtinPackId ? null : pk.id)}
                    className={`relative text-left rounded-2xl px-3 py-2.5 transition-all ${
                      isSel
                        ? 'bg-[var(--color-dungeon-gold)]/12 ring-2 ring-[var(--color-dungeon-gold)] shadow-[0_0_18px_rgba(255,219,16,0.25)]'
                        : isHost
                          ? 'bg-white/5 hover:bg-white/10 active:scale-[0.98]'
                          : 'bg-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{pk.builtin ? '📦' : '✨'}</span>
                      <span className="font-bold text-white text-sm leading-tight truncate">{pk.name}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--color-dungeon-muted)] mt-1">
                      {pk.itemCount > 0 ? `${pk.itemCount} ${packUnit(currentMode)}` : 'встроенный'}
                      {pk.builtin && pk.itemCount > 0 ? ' · встроенный' : ''}
                    </div>
                    {isSel && (
                      <span className="absolute top-2 right-2 rounded-full bg-[var(--color-dungeon-gold)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-[var(--color-dungeon-gold-fg)]">
                        выбран
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Class selection — only in RPG (classic) mode */}
      {needsClass && (
        <div className="glass-panel p-4 sm:p-5 mb-5 max-w-6xl mx-auto w-full">
          <h2 className="text-xl font-extrabold mb-3">Выбери класс</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {CLASS_LIST.map((cls) => {
              const isSelected = me?.playerClass === cls.id;
              const isTaken = players.some((p) => p.id !== playerId && p.playerClass === cls.id);
              return (
                <button
                  key={cls.id}
                  onClick={() => selectClass(cls.id as PlayerClass)}
                  disabled={isTaken}
                  className={`p-3 rounded-2xl text-center transition-all active:scale-[0.97] ${
                    isSelected
                      ? 'bg-[var(--color-dungeon-gold)]/10 ring-2 ring-[var(--color-dungeon-gold)]'
                      : isTaken
                        ? 'bg-white/5 opacity-30'
                        : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {cls.sprite ? (
                    <img src={cls.sprite} alt={cls.nameRu} className="w-14 h-14 object-contain mb-1 mx-auto" />
                  ) : (
                    <div className="text-3xl mb-1">{cls.emoji}</div>
                  )}
                  <div className="text-sm font-bold text-white">{cls.nameRu}</div>
                  <div className="text-[11px] text-[var(--color-dungeon-muted)] mt-1 line-clamp-2 leading-snug font-medium">{cls.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto flex flex-col gap-3 pt-2 max-w-md mx-auto w-full">
        {players.length < 2 && (
          <div className="text-center text-[var(--color-dungeon-muted)] text-sm font-semibold">Нужно минимум 2 игрока, чтобы начать.</div>
        )}
        {canReady && !me.isReady && (
          <button onClick={setReady} className="btn-success w-full py-4 px-6 text-lg active:scale-[0.97] transition-transform">
            Готов!
          </button>
        )}
        {!canReady && !me.isReady && (
          <div className="text-center text-[var(--color-dungeon-muted)] text-sm font-semibold">Выбери класс, чтобы отметиться готовым.</div>
        )}
        {me.isReady && !allReady && (
          <div className="text-center text-[var(--color-dungeon-muted)] text-sm font-semibold">Ждём остальных…</div>
        )}
        {isHost && allReady && (
          <button onClick={() => startGame()} className="btn-primary w-full py-4 px-6 text-lg animate-pulse">
            Начать игру
          </button>
        )}
        {!isHost && allReady && (
          <div className="text-center text-[var(--color-dungeon-muted)] text-sm font-semibold">Хост запускает игру…</div>
        )}
      </div>
    </div>
  );
}
