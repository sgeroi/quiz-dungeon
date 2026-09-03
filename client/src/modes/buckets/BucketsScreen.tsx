import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';
import TeamBadge from '../../components/TeamBadge';
import type { GameState, Player, Team, TeamMode } from '../../types';

interface PublicBucket { name: string; emoji: string }
interface PublicItem { text: string }
interface PublicSet {
  title: string;
  buckets: PublicBucket[];
  items: PublicItem[];
}
interface BossInfo { hp: number; maxHp: number; emoji: string; name: string }
interface TeamRoundResult { correct: number; max: number; members: number; points: number }

/** Snapshot gameState.buckets (see server/src/modes/buckets/handler.ts). */
interface BucketsServerState {
  round: number;
  totalRounds: number;
  teamMode?: TeamMode;
  boss: BossInfo;
  scores?: Record<string, number>;
  teamScores?: Record<string, number>;
  teamScoring?: 'sum' | 'avg';
  publicSet: PublicSet;
  submissions: Record<string, Record<number, number>>;
  submitted: Record<string, boolean>;
  lastRoundScores?: Record<string, number>;
  lastTeamCorrect?: number;
  lastTeamMax?: number;
  lastDamageDealt?: number;
  lastDamageTaken?: number;
  lastBossPrevHp?: number;
  lastRoundPoints?: Record<string, number>;
  lastSpeedBonus?: Record<string, number>;
  lastTeamRound?: Record<string, TeamRoundResult>;
  // Correct bucket index (0..3) for each item in the current round's
  // shuffled order. Server populates this; revealed in RoundResults.
  answers?: number[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

function modeOf(gameState: GameState, buckets: BucketsServerState): TeamMode {
  return buckets.teamMode ?? gameState.teamMode ?? 'coop';
}

/** Players sorted by cumulative points (desc), stable by name. */
function ranking(players: Player[], scores: Record<string, number> | undefined): Player[] {
  return [...players].sort((a, b) => ((scores?.[b.id] ?? 0) - (scores?.[a.id] ?? 0)) || a.name.localeCompare(b.name));
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

  const mode = modeOf(gameState, buckets);

  // Floor-intro / loading between rounds.
  if (phase === 'floor-intro') {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-md w-full animate-[fadeIn_0.5s_ease-out]">
          <div className="text-6xl mb-3 animate-[float_3s_ease-in-out_infinite]">🪣</div>
          <div className="text-xl font-bold text-white mb-1">Сортировка</div>
          <div className="text-sm text-gray-400 mb-1">Раунд {buckets.round + 1} / {buckets.totalRounds}</div>
          <div className="text-xs text-gray-500 mb-4">
            {mode === 'ffa' ? '🥇 Каждый сам за себя' : mode === 'teams' ? '⚔️ Команда на команду' : '🤝 Все против голема'}
          </div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Готовимся…</div>
        </div>
      </div>
    );
  }

  if (isResultPhase) {
    return <RoundResults gameState={gameState} buckets={buckets} myId={playerId ?? ''} mode={mode} />;
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
      {/* Header: timer + boss (coop) / score (ffa, teams) */}
      <BucketsHeader gameState={gameState} buckets={buckets} myId={playerId ?? ''} mode={mode} />

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
      <LiveProgress gameState={gameState} buckets={buckets} myId={playerId ?? ''} mode={mode} />

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
            <span className="text-emerald-400">{mode === 'ffa' ? 'Всё разложено! Сдай быстрее — бонус за скорость' : 'Всё разложено!'}</span>
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

function TimerBlock({ gameState }: { gameState: GameState }) {
  const seconds = gameState.timer ?? 0;
  const isLow = seconds <= 10 && gameState.phase === 'answering';
  const isCritical = seconds <= 5 && gameState.phase === 'answering';
  return (
    <div className="flex flex-col items-center min-w-[60px]">
      <span className={`text-2xl font-black font-mono ${isCritical ? 'text-red-400 animate-pulse' : isLow ? 'text-red-400' : 'text-white'}`}>
        {seconds}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500">сек</span>
    </div>
  );
}

function TimerBar({ gameState }: { gameState: GameState }) {
  const seconds = gameState.timer ?? 0;
  const max = gameState.maxTimer || 60;
  const pct = max > 0 ? (seconds / max) * 100 : 0;
  const isCritical = seconds <= 5 && gameState.phase === 'answering';
  return (
    <div className="h-1 rounded-full bg-black/40 mt-1 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${isCritical ? 'bg-red-500' : 'bg-gradient-to-r from-[var(--color-dungeon-mana)] to-cyan-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BucketsHeader({
  gameState,
  buckets,
  myId,
  mode,
}: {
  gameState: GameState;
  buckets: BucketsServerState;
  myId: string;
  mode: TeamMode;
}) {
  const isCritical = (gameState.timer ?? 0) <= 5 && gameState.phase === 'answering';

  if (mode === 'ffa') {
    const players = Object.values(gameState.players);
    const ranked = ranking(players, buckets.scores);
    const myRank = ranked.findIndex((p) => p.id === myId) + 1;
    const myScore = buckets.scores?.[myId] ?? 0;
    return (
      <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3" data-testid="buckets-header-ffa">
        <TimerBlock gameState={gameState} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🥇</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white truncate">Каждый сам за себя</div>
              <div className="text-[10px] text-gray-400">Раунд {Math.max(1, buckets.round)} / {buckets.totalRounds}</div>
            </div>
            <div className="text-right whitespace-nowrap">
              <div className="text-sm font-black text-[var(--color-dungeon-gold)] tabular-nums">{myScore} <span className="text-[10px] text-gray-400 font-bold">очк.</span></div>
              <div className="text-[10px] text-gray-400">{myRank > 0 ? `${myRank}-е место из ${ranked.length}` : ''}</div>
            </div>
          </div>
          <TimerBar gameState={gameState} />
        </div>
      </div>
    );
  }

  if (mode === 'teams') {
    const teams = gameState.teams ?? [];
    const myTeamId = gameState.players[myId]?.teamId;
    return (
      <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3" data-testid="buckets-header-teams">
        <TimerBlock gameState={gameState} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 overflow-x-auto">
            <div className="min-w-0 mr-1">
              <div className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">⚔️ Команда на команду</div>
              <div className="text-[10px] text-gray-400">Раунд {Math.max(1, buckets.round)} / {buckets.totalRounds}</div>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {teams.map((t) => (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 ${t.id === myTeamId ? 'ring-1 ring-white/40' : ''}`}
                  style={{ backgroundColor: `${t.color}26` }}
                  title={t.name}
                >
                  <TeamBadge team={t} size="sm" iconOnly />
                  <span className="text-xs font-black tabular-nums" style={{ color: t.color }}>{buckets.teamScores?.[t.id] ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
          <TimerBar gameState={gameState} />
        </div>
      </div>
    );
  }

  // coop: golem
  const bossPct = buckets.boss.maxHp > 0 ? (buckets.boss.hp / buckets.boss.maxHp) * 100 : 0;
  return (
    <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3">
      <TimerBlock gameState={gameState} />
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
        <TimerBar gameState={gameState} />
      </div>
    </div>
  );
}

function PlayerChip({ p, buckets, myId, total }: { p: Player; buckets: BucketsServerState; myId: string; total: number }) {
  const placed = Object.keys(buckets.submissions[p.id] ?? {}).length;
  const done = !!buckets.submitted[p.id];
  const dead = !p.isAlive;
  const isMe = p.id === myId;
  const pct = Math.min(100, Math.round((placed / total) * 100));
  return (
    <div
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
}

function LiveProgress({
  gameState,
  buckets,
  myId,
  mode,
}: {
  gameState: GameState;
  buckets: BucketsServerState;
  myId: string;
  mode: TeamMode;
}) {
  const players = useMemo(() => Object.values(gameState.players), [gameState.players]);
  const total = buckets.publicSet.items.length || 20;

  if (mode === 'teams') {
    const teams = gameState.teams ?? [];
    return (
      <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-3 overflow-x-auto">
        {teams.map((t) => {
          const members = players.filter((p) => p.teamId === t.id);
          if (members.length === 0) return null;
          return (
            <div key={t.id} className="flex items-center gap-1.5 shrink-0 rounded-xl px-1.5 py-1" style={{ backgroundColor: `${t.color}14`, border: `1px solid ${t.color}40` }}>
              <TeamBadge team={t} size="sm" iconOnly />
              {members.map((p) => <PlayerChip key={p.id} p={p} buckets={buckets} myId={myId} total={total} />)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl px-3 py-2 flex items-center gap-2 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1 whitespace-nowrap">{mode === 'ffa' ? 'Игроки' : 'Команда'}</span>
      {players.map((p) => <PlayerChip key={p.id} p={p} buckets={buckets} myId={myId} total={total} />)}
    </div>
  );
}

/** Per-item review of MY sorting (green / red / grey). Shared by all formats. */
function MyReview({ buckets, myId }: { buckets: BucketsServerState; myId: string }) {
  const correctAnswers = buckets.answers ?? [];
  if (correctAnswers.length === 0) return null;
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
  const wrongCount = reviewItems.filter((it) => it.status !== 'correct').length;

  return (
    <div className="mt-5 text-left">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-2 text-center">
        Твоя сортировка{wrongCount > 0 ? ` · ошибок: ${wrongCount}` : ' · без ошибок!'}
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
            <span key={it.idx} title={tooltip} className={`text-xs px-2 py-1 rounded-lg border ${cls}`}>
              <span className="mr-1 font-bold">{icon}</span>
              {it.text}
              {it.status !== 'correct' && <span className="ml-1 text-[10px] opacity-70">→ {correctName}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RoundResults({
  gameState,
  buckets,
  myId,
  mode,
}: {
  gameState: GameState;
  buckets: BucketsServerState;
  myId: string;
  mode: TeamMode;
}) {
  const totalItems = buckets.publicSet.items.length || 20;
  const myCorrect = (buckets.lastRoundScores && buckets.lastRoundScores[myId]) ?? 0;
  const isLast = buckets.round >= buckets.totalRounds;
  const footer = (
    <div className="mt-4 text-xs text-gray-500">{isLast ? 'Подводим итоги…' : 'Следующий раунд через несколько секунд…'}</div>
  );

  if (mode === 'ffa') return <FfaRoundResults gameState={gameState} buckets={buckets} myId={myId} totalItems={totalItems} myCorrect={myCorrect} footer={footer} />;
  if (mode === 'teams') return <TeamsRoundResults gameState={gameState} buckets={buckets} myId={myId} totalItems={totalItems} myCorrect={myCorrect} footer={footer} />;

  // ---- coop ----
  const teamCorrect = buckets.lastTeamCorrect ?? 0;
  const teamMax = buckets.lastTeamMax ?? totalItems;
  const damageDealt = buckets.lastDamageDealt ?? 0;
  const damageTaken = buckets.lastDamageTaken ?? 0;
  const bossPrevHp = buckets.lastBossPrevHp ?? buckets.boss.maxHp;
  const myAlive = gameState.players[myId]?.isAlive;

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

        <MyReview buckets={buckets} myId={myId} />
        {footer}
      </div>
    </div>
  );
}

function FfaRoundResults({
  gameState, buckets, myId, totalItems, myCorrect, footer,
}: {
  gameState: GameState; buckets: BucketsServerState; myId: string; totalItems: number; myCorrect: number; footer: ReactNode;
}) {
  const players = Object.values(gameState.players);
  const ranked = ranking(players, buckets.scores);
  const myRank = ranked.findIndex((p) => p.id === myId) + 1;
  const myBonus = buckets.lastSpeedBonus?.[myId] ?? 0;
  const myPoints = buckets.lastRoundPoints?.[myId] ?? myCorrect;
  const myTotal = buckets.scores?.[myId] ?? 0;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="glass-panel rounded-3xl p-5 sm:p-6 max-w-2xl mx-auto text-center animate-[fadeIn_0.4s_ease-out]" data-testid="buckets-results-ffa">
        <div className="text-5xl mb-3 animate-[float_3s_ease-in-out_infinite]">{myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎯'}</div>
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Раунд {buckets.round} результаты</div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Верно</div>
            <div className="text-2xl font-black text-emerald-300">{myCorrect}<span className="text-gray-500 text-base">/{totalItems}</span></div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Скорость</div>
            <div className={`text-2xl font-black ${myBonus > 0 ? 'text-cyan-300' : 'text-gray-500'}`}>+{myBonus}</div>
          </div>
          <div className="bg-[var(--color-dungeon-gold)]/10 border border-[var(--color-dungeon-gold)]/30 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">За раунд</div>
            <div className="text-2xl font-black text-[var(--color-dungeon-gold)]">+{myPoints}</div>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-300">
          У тебя <span className="font-black text-[var(--color-dungeon-gold)] tabular-nums">{myTotal}</span> очк. · {myRank}-е место из {ranked.length}
        </div>

        {/* Rating */}
        <div className="mt-4 text-left">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2 text-center">Рейтинг</div>
          <div className="flex flex-col gap-1.5">
            {ranked.map((p, i) => {
              const isMe = p.id === myId;
              const pts = buckets.lastRoundPoints?.[p.id] ?? buckets.lastRoundScores?.[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm ${isMe ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)]/40' : 'bg-white/5 border-white/10'}`}
                >
                  <span className="w-6 text-center">{MEDALS[i] ?? `${i + 1}.`}</span>
                  <span className="flex-1 truncate text-white">{p.isBot && !p.name.includes('🤖') ? '🤖 ' : ''}{p.name}</span>
                  <span className="text-xs text-gray-400 tabular-nums">+{pts}</span>
                  <span className={`font-black tabular-nums ${isMe ? 'text-[var(--color-dungeon-gold)]' : 'text-white'}`}>{buckets.scores?.[p.id] ?? 0}</span>
                </div>
              );
            })}
          </div>
        </div>

        <MyReview buckets={buckets} myId={myId} />
        {footer}
      </div>
    </div>
  );
}

function TeamsRoundResults({
  gameState, buckets, myId, totalItems, myCorrect, footer,
}: {
  gameState: GameState; buckets: BucketsServerState; myId: string; totalItems: number; myCorrect: number; footer: ReactNode;
}) {
  const teams: Team[] = gameState.teams ?? [];
  const players = Object.values(gameState.players);
  const myTeamId = gameState.players[myId]?.teamId;
  const myTeam = teams.find((t) => t.id === myTeamId);
  const roundRes = buckets.lastTeamRound ?? {};
  const totals = buckets.teamScores ?? {};
  const sorted = [...teams].filter((t) => players.some((p) => p.teamId === t.id)).sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
  const myRoundPts = myTeamId ? roundRes[myTeamId]?.points ?? 0 : 0;
  const isAvg = buckets.teamScoring === 'avg';
  const leader = sorted[0];

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="glass-panel rounded-3xl p-5 sm:p-6 max-w-2xl mx-auto text-center animate-[fadeIn_0.4s_ease-out]" data-testid="buckets-results-teams">
        <div className="text-5xl mb-3 animate-[float_3s_ease-in-out_infinite]">{leader?.emoji ?? '⚔️'}</div>
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Раунд {buckets.round} результаты</div>
        {leader && <div className="text-sm font-bold" style={{ color: leader.color }}>Лидируют {leader.name}</div>}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Ты верно</div>
            <div className="text-2xl font-black text-emerald-300">{myCorrect}<span className="text-gray-500 text-base">/{totalItems}</span></div>
          </div>
          <div className="rounded-2xl p-3 border" style={{ backgroundColor: myTeam ? `${myTeam.color}1a` : undefined, borderColor: myTeam ? `${myTeam.color}66` : 'transparent' }}>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Твоя команда за раунд</div>
            <div className="text-2xl font-black" style={{ color: myTeam?.color }}>+{myRoundPts}</div>
          </div>
        </div>

        {/* Team table */}
        <div className="mt-4 text-left">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2 text-center">Табло команд</div>
          <div className="flex flex-col gap-1.5">
            {sorted.map((t, i) => {
              const r = roundRes[t.id];
              const members = players.filter((p) => p.teamId === t.id);
              return (
                <div
                  key={t.id}
                  className="rounded-xl px-3 py-2 border"
                  style={{ backgroundColor: `${t.color}14`, borderColor: t.id === myTeamId ? t.color : `${t.color}55` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-sm">{MEDALS[i] ?? `${i + 1}.`}</span>
                    <TeamBadge team={t} size="sm" />
                    <span className="ml-auto text-xs text-gray-400 tabular-nums">
                      {r ? `${r.correct}/${r.max} · +${r.points}` : ''}
                    </span>
                    <span className="font-black tabular-nums text-base" style={{ color: t.color }}>{totals[t.id] ?? 0}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 pl-8">
                    {members.map((p) => (
                      <span key={p.id} className={`text-[11px] px-1.5 py-0.5 rounded-md bg-black/30 ${p.id === myId ? 'text-[var(--color-dungeon-gold)]' : 'text-gray-300'}`}>
                        {p.name} <span className="text-gray-500 tabular-nums">{buckets.lastRoundScores?.[p.id] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-gray-500 text-center">
            {isAvg
              ? 'Команды неравные: очки = среднее верных на игрока × 10'
              : 'Очки команды = сумма верных ответов её игроков'}
          </div>
        </div>

        <MyReview buckets={buckets} myId={myId} />
        {footer}
      </div>
    </div>
  );
}
