import { useEffect, useMemo, useState } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';

interface PublicBucket { name: string; emoji: string }
interface PublicItem { text: string }
interface PublicSet {
  title: string;
  buckets: PublicBucket[];
  items: PublicItem[];
}
interface BossInfo { hp: number; maxHp: number; emoji: string; name: string }

interface BucketsServerState {
  round: number;
  totalRounds: number;
  boss: BossInfo;
  publicSet: PublicSet;
  submissions: Record<string, Record<number, number>>;
  submitted: Record<string, boolean>;
  lastRoundScores?: Record<string, number>;
  lastTeamCorrect?: number;
  lastTeamMax?: number;
  lastDamageDealt?: number;
  lastDamageTaken?: number;
  lastBossPrevHp?: number;
  // Correct bucket index (0..3) for each item in the current round's
  // shuffled order. Server populates this; revealed in RoundResults.
  answers?: number[];
}

export default function BucketsScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);

  const buckets = (gameState as any)?.buckets as BucketsServerState | undefined;

  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [draggingItem, setDraggingItem] = useState<number | null>(null);
  const [hoverBucket, setHoverBucket] = useState<number | null>(null);
  const [highlightBucket, setHighlightBucket] = useState<number | null>(null);

  const phase = gameState?.phase;
  const me = playerId ? gameState?.players?.[playerId] : undefined;
  const myAlive = me?.isAlive ?? true;
  const isResultPhase = phase === 'results';

  // Reset selection between rounds
  useEffect(() => {
    setSelectedItem(null);
    setDraggingItem(null);
    setHoverBucket(null);
  }, [buckets?.round, phase]);

  // Brief flash on bucket when dropping
  useEffect(() => {
    if (highlightBucket === null) return;
    const t = setTimeout(() => setHighlightBucket(null), 350);
    return () => clearTimeout(t);
  }, [highlightBucket]);

  if (!gameState || !buckets) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-pulse">🪣</div>
          <div>Загружаем сортировку…</div>
        </div>
      </div>
    );
  }

  // Floor-intro / loading between rounds.
  if (phase === 'floor-intro') {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-md w-full animate-[fadeIn_0.5s_ease-out]">
          <div className="text-6xl mb-3 animate-[float_3s_ease-in-out_infinite]">🪣</div>
          <div className="text-xl font-bold text-white mb-1">Сортировка</div>
          <div className="text-sm text-gray-400 mb-4">Раунд {buckets.round + 1} / {buckets.totalRounds}</div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Готовимся…</div>
        </div>
      </div>
    );
  }

  if (isResultPhase) {
    return <RoundResults gameState={gameState} buckets={buckets} myId={playerId ?? ''} />;
  }

  // ===== answering phase =====

  const set = buckets.publicSet;
  const mySubs: Record<number, number> = (playerId && buckets.submissions[playerId]) || {};
  const placedCount = Object.keys(mySubs).length;
  const totalItems = set.items.length;
  const allPlaced = placedCount >= totalItems;
  const submittedAlready = playerId ? !!buckets.submitted[playerId] : false;

  const place = (itemIdx: number, bucketIdx: number) => {
    if (!myAlive || submittedAlready) return;
    socket.emit('mode-buckets-place' as any, { itemIdx, bucketIdx });
    setHighlightBucket(bucketIdx);
    setSelectedItem(null);
  };

  const removeFromBucket = (itemIdx: number) => {
    if (!myAlive || submittedAlready) return;
    socket.emit('mode-buckets-place' as any, { itemIdx, bucketIdx: -1 });
  };

  const handleItemClick = (itemIdx: number) => {
    if (!myAlive || submittedAlready) return;
    setSelectedItem((cur) => (cur === itemIdx ? null : itemIdx));
  };

  const handleBucketClick = (bucketIdx: number) => {
    if (selectedItem === null) return;
    place(selectedItem, bucketIdx);
  };

  const handleSubmit = () => {
    if (!myAlive || submittedAlready) return;
    socket.emit('mode-buckets-submit' as any);
  };

  const remainingItems = set.items
    .map((it, idx) => ({ ...it, idx }))
    .filter((it) => mySubs[it.idx] === undefined);

  const itemsByBucket: Record<number, { text: string; idx: number }[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const [k, v] of Object.entries(mySubs)) {
    const idx = Number(k);
    if (v >= 0 && v <= 3) {
      itemsByBucket[v].push({ text: set.items[idx].text, idx });
    }
  }

  return (
    <div className="h-full flex flex-col p-3 sm:p-4 gap-3 overflow-hidden">
      {/* Header: timer + boss */}
      <BucketsHeader gameState={gameState} buckets={buckets} />

      {/* Title strip */}
      <div className="glass-panel rounded-2xl px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🧩</span>
          <span className="text-sm font-bold text-white truncate">{set.title}</span>
        </div>
        <div className="text-xs text-gray-400 font-mono whitespace-nowrap">
          {placedCount}/{totalItems}
        </div>
      </div>

      {/* Live progress map */}
      <TeamProgress gameState={gameState} buckets={buckets} myId={playerId ?? ''} />

      {/* Main panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
        {/* Left: remaining items */}
        <div className="glass-panel rounded-2xl p-3 flex flex-col min-h-0">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2 flex justify-between">
            <span>Предметы</span>
            <span>{remainingItems.length} осталось</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2 content-start">
              {remainingItems.length === 0 && (
                <div className="text-sm text-gray-500 italic w-full text-center py-6">
                  Все предметы разложены 🎉
                </div>
              )}
              {remainingItems.map((it) => (
                <button
                  key={it.idx}
                  draggable={myAlive && !submittedAlready}
                  onDragStart={(e) => {
                    setDraggingItem(it.idx);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingItem(null)}
                  onClick={() => handleItemClick(it.idx)}
                  disabled={!myAlive || submittedAlready}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border select-none
                    ${selectedItem === it.idx
                      ? 'bg-gradient-to-br from-[var(--color-dungeon-gold)]/30 to-amber-500/20 border-[var(--color-dungeon-gold)]/70 text-[var(--color-dungeon-gold)] scale-105 shadow-[0_0_16px_rgba(245,197,24,0.3)]'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20'}
                    ${draggingItem === it.idx ? 'opacity-50' : ''}
                    ${(!myAlive || submittedAlready) ? 'opacity-40 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
                  `}
                >
                  {it.text}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: 4 buckets */}
        <div className="grid grid-cols-2 gap-3 min-h-0">
          {set.buckets.map((b, bi) => {
            const items = itemsByBucket[bi] ?? [];
            const isSelectable = selectedItem !== null && myAlive && !submittedAlready;
            const isHover = hoverBucket === bi;
            const flash = highlightBucket === bi;
            return (
              <div
                key={bi}
                onDragOver={(e) => {
                  if (!myAlive || submittedAlready) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setHoverBucket(bi);
                }}
                onDragLeave={() => setHoverBucket((h) => (h === bi ? null : h))}
                onDrop={(e) => {
                  e.preventDefault();
                  setHoverBucket(null);
                  if (!myAlive || submittedAlready) return;
                  if (draggingItem !== null) {
                    place(draggingItem, bi);
                    setDraggingItem(null);
                  }
                }}
                onClick={() => handleBucketClick(bi)}
                className={`relative rounded-2xl p-3 flex flex-col min-h-0 transition-all border
                  ${isHover ? 'border-[var(--color-dungeon-gold)]/70 bg-amber-500/10 scale-[1.01]' : 'border-white/10 bg-white/5'}
                  ${isSelectable ? 'cursor-pointer hover:border-[var(--color-dungeon-gold)]/50 hover:bg-amber-500/5' : ''}
                  ${flash ? 'ring-2 ring-[var(--color-dungeon-gold)]/60' : ''}
                  glass-panel
                `}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{b.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{b.name}</div>
                    <div className="text-xs text-gray-500">{items.length} шт.</div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-1.5 content-start">
                    {items.map((it) => (
                      <button
                        key={it.idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromBucket(it.idx);
                        }}
                        disabled={!myAlive || submittedAlready}
                        className="text-xs px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-gray-200 hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-200 transition-all"
                        title="Кликни, чтобы убрать"
                      >
                        {it.text}
                      </button>
                    ))}
                    {items.length === 0 && (
                      <div className="text-xs text-gray-600 italic px-1 py-2">Перетащи или кликни предмет</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: submit */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400">
          {submittedAlready ? (
            <span className="text-emerald-400">Готово, ждём остальных…</span>
          ) : !myAlive ? (
            <span className="text-red-400">Ты пал — наблюдаешь</span>
          ) : selectedItem !== null ? (
            <span>Выбран предмет: <span className="text-[var(--color-dungeon-gold)]">{set.items[selectedItem].text}</span> → кликни корзину</span>
          ) : allPlaced ? (
            <span className="text-emerald-400">Всё разложено!</span>
          ) : (
            <span>Разложи {totalItems - placedCount} предмет(ов)</span>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!myAlive || submittedAlready}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all
            ${submittedAlready
              ? 'bg-emerald-700/40 text-emerald-200 cursor-default'
              : !myAlive
                ? 'bg-gray-700/40 text-gray-500 cursor-not-allowed'
                : allPlaced
                  ? 'bg-gradient-to-r from-[var(--color-dungeon-gold)] to-amber-500 text-black hover:brightness-110 active:scale-95 glow-gold'
                  : 'bg-gradient-to-r from-amber-700 to-amber-800 text-amber-100 hover:brightness-110 active:scale-95'}
          `}
        >
          {submittedAlready ? '✓ Отправлено' : allPlaced ? '✅ Готово!' : `Готово (${placedCount}/${totalItems})`}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function BucketsHeader({
  gameState,
  buckets,
}: {
  gameState: NonNullable<ReturnType<typeof useStore.getState>['gameState']>;
  buckets: BucketsServerState;
}) {
  const seconds = gameState.timer ?? 0;
  const max = gameState.maxTimer || 60;
  const pct = max > 0 ? (seconds / max) * 100 : 0;
  const isLow = seconds <= 10 && gameState.phase === 'answering';
  const isCritical = seconds <= 5 && gameState.phase === 'answering';

  const bossPct = buckets.boss.maxHp > 0 ? (buckets.boss.hp / buckets.boss.maxHp) * 100 : 0;

  return (
    <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3">
      {/* Timer */}
      <div className="flex flex-col items-center min-w-[60px]">
        <span className={`text-2xl font-black font-mono ${isCritical ? 'text-red-400 animate-pulse' : isLow ? 'text-red-400' : 'text-white'}`}>
          {seconds}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500">сек</span>
      </div>

      {/* Boss */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-2xl ${isCritical ? 'animate-[shake_0.6s_ease-in-out_infinite]' : ''}`}>{buckets.boss.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white truncate">{buckets.boss.name}</div>
            <div className="text-[10px] text-gray-400">
              Раунд {Math.max(1, buckets.round)} / {buckets.totalRounds}
            </div>
          </div>
          <div className="text-xs font-mono text-red-300 whitespace-nowrap">
            {buckets.boss.hp} / {buckets.boss.maxHp}
          </div>
        </div>
        <div className="h-2 rounded-full bg-black/40 overflow-hidden hp-bar">
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-red-500 to-rose-700"
            style={{ width: `${bossPct}%` }}
          />
        </div>
        <div className="h-1 rounded-full bg-black/40 mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isCritical ? 'bg-red-500' : 'bg-gradient-to-r from-[var(--color-dungeon-mana)] to-cyan-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TeamProgress({
  gameState,
  buckets,
  myId,
}: {
  gameState: NonNullable<ReturnType<typeof useStore.getState>['gameState']>;
  buckets: BucketsServerState;
  myId: string;
}) {
  const players = useMemo(() => Object.values(gameState.players), [gameState.players]);
  const total = buckets.publicSet.items.length || 20;

  return (
    <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-2 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1 whitespace-nowrap">Команда</span>
      {players.map((p) => {
        const placed = Object.keys(buckets.submissions[p.id] ?? {}).length;
        const done = !!buckets.submitted[p.id];
        const dead = !p.isAlive;
        const isMe = p.id === myId;
        const pct = Math.min(100, Math.round((placed / total) * 100));
        return (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs whitespace-nowrap
              ${isMe ? 'bg-[var(--color-dungeon-gold)]/15 border border-[var(--color-dungeon-gold)]/30' : 'bg-white/5 border border-white/10'}
              ${dead ? 'opacity-40' : ''}
            `}
            title={`${p.name}: ${placed}/${total}`}
          >
            <span>{dead ? '👻' : done ? '✅' : p.isBot ? '🤖' : '🧑'}</span>
            <span className="text-white max-w-[80px] truncate">{p.name}</span>
            <div className="w-10 h-1 rounded-full bg-black/40 overflow-hidden">
              <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-gray-400">{placed}</span>
          </div>
        );
      })}
    </div>
  );
}

function RoundResults({
  gameState,
  buckets,
  myId,
}: {
  gameState: NonNullable<ReturnType<typeof useStore.getState>['gameState']>;
  buckets: BucketsServerState;
  myId: string;
}) {
  const totalItems = buckets.publicSet.items.length || 20;
  const myCorrect = (buckets.lastRoundScores && buckets.lastRoundScores[myId]) ?? 0;
  const teamCorrect = buckets.lastTeamCorrect ?? 0;
  const teamMax = buckets.lastTeamMax ?? totalItems;
  const damageDealt = buckets.lastDamageDealt ?? 0;
  const damageTaken = buckets.lastDamageTaken ?? 0;
  const bossPrevHp = buckets.lastBossPrevHp ?? buckets.boss.maxHp;

  const myAlive = gameState.players[myId]?.isAlive;

  // Build per-item review (only for current player) — green if correctly
  // sorted, red if wrongly sorted, gray if not placed.
  const correctAnswers = buckets.answers ?? [];
  const mySubs: Record<number, number> = (buckets.submissions?.[myId]) ?? {};
  const reviewItems = buckets.publicSet.items.map((it, idx) => {
    const placed = mySubs[idx];
    const correctBucket = correctAnswers[idx];
    let status: 'correct' | 'wrong' | 'missed' = 'missed';
    if (placed !== undefined && placed >= 0) {
      status = placed === correctBucket ? 'correct' : 'wrong';
    }
    return { idx, text: it.text, placed, correctBucket, status };
  });

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="glass-panel rounded-3xl p-5 sm:p-6 max-w-2xl mx-auto text-center animate-[fadeIn_0.4s_ease-out]">
        <div className="text-5xl mb-3 animate-[float_3s_ease-in-out_infinite]">
          {damageDealt > 0 ? '⚔️' : '🛡️'}
        </div>
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Раунд {buckets.round} результаты</div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Ты правильно</div>
            <div className="text-2xl font-black text-emerald-300">{myCorrect}<span className="text-gray-500 text-base">/{totalItems}</span></div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Команда</div>
            <div className="text-2xl font-black text-cyan-300">{teamCorrect}<span className="text-gray-500 text-base">/{teamMax}</span></div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-gradient-to-br from-red-500/15 to-rose-700/10 border border-red-500/20 p-3">
          <div className="text-xs text-red-200 mb-1">Урон боссу</div>
          <div className="text-3xl font-black text-red-300">{damageDealt}</div>
          <div className="mt-2 text-xs text-gray-400">
            HP босса: <span className="font-mono text-red-300">{bossPrevHp}</span> → <span className="font-mono text-red-200">{buckets.boss.hp}</span>
          </div>
        </div>

        {damageTaken > 0 && (
          <div className="mt-3 text-xs text-amber-200">
            👹 Босс ударил в ответ: <span className="font-bold">−{damageTaken} HP</span> каждому живому
          </div>
        )}
        {!myAlive && (
          <div className="mt-2 text-xs text-red-300">Ты пал. Будешь наблюдать.</div>
        )}

        {/* Per-item review with correct / incorrect highlights */}
        {correctAnswers.length > 0 && (
          <div className="mt-5 text-left">
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-2 text-center">
              Твоя сортировка
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {reviewItems.map((it) => {
                const correctName = buckets.publicSet.buckets[it.correctBucket]?.name ?? '?';
                const placedName = it.placed !== undefined && it.placed >= 0
                  ? buckets.publicSet.buckets[it.placed]?.name ?? '?'
                  : '—';
                const cls = it.status === 'correct'
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                  : it.status === 'wrong'
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                    : 'bg-white/5 border-white/15 text-gray-300';
                const icon = it.status === 'correct' ? '✓' : it.status === 'wrong' ? '✗' : '·';
                const tooltip = it.status === 'correct'
                  ? `Верно: ${correctName}`
                  : it.status === 'wrong'
                    ? `Положил в «${placedName}», нужно «${correctName}»`
                    : `Не положил. Нужно «${correctName}»`;
                return (
                  <span
                    key={it.idx}
                    title={tooltip}
                    className={`text-xs px-2 py-1 rounded-lg border ${cls}`}
                  >
                    <span className="mr-1 font-bold">{icon}</span>
                    {it.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500">Следующий раунд через несколько секунд…</div>
      </div>
    </div>
  );
}
