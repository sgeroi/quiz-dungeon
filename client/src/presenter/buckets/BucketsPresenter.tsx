import { useMemo } from 'react';
import { useStore } from '../../store';
import { PresenterTimer } from '../DefaultPresenter';
import type { Player } from '../../types';

/** Bot names already carry the robot emoji; only prefix when they don't. */
const botMark = (p?: Pick<Player, 'isBot' | 'name'> | null) => (p?.isBot && !p.name.includes('🤖') ? '🤖 ' : '');

/**
 * TV presenter for the 'buckets' mode ("Сортировка").
 * Reads only the room-broadcast snapshot gameState.buckets. The answer key
 * (`answers`) is only present in the snapshot during 'results'.
 */

interface PublicSet {
  title: string;
  buckets: { name: string; emoji: string }[];
  items: { text: string }[];
}

interface BucketsSnapshot {
  round: number;
  totalRounds: number;
  boss: { hp: number; maxHp: number; emoji: string; name: string };
  publicSet: PublicSet;
  submissions: Record<string, Record<number, number>>;
  submitted: Record<string, boolean>;
  roundEndsAt: number;
  lastRoundScores?: Record<string, number>;
  lastTeamCorrect?: number;
  lastTeamMax?: number;
  lastDamageDealt?: number;
  lastDamageTaken?: number;
  lastBossPrevHp?: number;
  answers?: number[];
}

export default function BucketsPresenter() {
  const gameState = useStore((s) => s.gameState);
  const bs = (gameState as unknown as { buckets?: BucketsSnapshot } | null)?.buckets ?? null;
  const players = useMemo(() => (gameState ? Object.values(gameState.players) : []), [gameState]);

  if (!gameState || !bs || gameState.phase === 'floor-intro' || bs.publicSet.items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
        <div className="text-[120px] leading-none">🪣</div>
        <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">Сортировка</div>
        <div className="text-[36px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">
          {bs ? `Раунд ${Math.min(bs.round + 1, bs.totalRounds)} из ${bs.totalRounds} · готовимся…` : 'Готовимся…'}
        </div>
      </div>
    );
  }

  const isResults = gameState.phase === 'results';
  const set = bs.publicSet;
  const bossPct = bs.boss.maxHp > 0 ? Math.max(0, Math.min(100, (bs.boss.hp / bs.boss.maxHp) * 100)) : 0;

  return (
    <div className="h-full flex flex-col gap-4 px-10 pb-8 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {isResults ? 'Разбор раунда' : 'Раскладываем!'}
          </div>
          <div className="text-[44px] font-black leading-tight">🪣 Сортировка</div>
          <div className="text-[26px] font-bold text-[var(--color-dungeon-gold)]">Раунд {Math.max(1, bs.round)} из {bs.totalRounds}</div>
        </div>

        <div className="flex items-center gap-5 glass-panel-gold px-8 py-4">
          <span className="text-[64px] leading-none">{bs.boss.emoji}</span>
          <div>
            <div className="text-[28px] font-black">{bs.boss.name}</div>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-[420px] h-5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-[#FF4848] transition-[width] duration-700" style={{ width: `${bossPct}%` }} />
              </div>
              <span className="text-[24px] font-bold tabular-nums text-white/80">{bs.boss.hp}/{bs.boss.maxHp}</span>
            </div>
          </div>
        </div>

        {isResults ? (
          <div className="min-w-[160px] text-center text-[64px] leading-none">{(bs.lastDamageDealt ?? 0) > 0 ? '⚔️' : '🛡️'}</div>
        ) : (
          <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
        )}
      </div>

      {/* Set title */}
      <div className="glass-panel-gold px-8 py-4 flex items-center justify-between gap-6">
        <div className="text-[36px] font-extrabold leading-tight truncate">🧩 {set.title}</div>
        <div className="text-[24px] font-bold text-[var(--color-dungeon-muted)] whitespace-nowrap">
          {set.items.length} предметов · {set.buckets.length} корзины
        </div>
      </div>

      {isResults ? <ResultsView bs={bs} players={players} /> : <SortingView bs={bs} players={players} />}
    </div>
  );
}

// ---------- Sorting (answering) ----------

function SortingView({ bs, players }: { bs: BucketsSnapshot; players: Player[] }) {
  const set = bs.publicSet;
  const total = set.items.length;
  const doneCount = players.filter((p) => bs.submitted[p.id]).length;

  return (
    <>
      {/* Buckets */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, set.buckets.length)}, minmax(0, 1fr))` }}>
        {set.buckets.map((b, i) => (
          <div key={i} className="glass-panel px-6 py-4 flex items-center gap-4">
            <span className="text-[56px] leading-none">{b.emoji}</span>
            <div className="text-[30px] font-black leading-tight">{b.name}</div>
          </div>
        ))}
      </div>

      {/* Items */}
      <div className="glass-panel p-6 flex-1 min-h-0 overflow-hidden">
        <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-3">Предметы</div>
        <div className="flex flex-wrap gap-3">
          {set.items.map((it, i) => (
            <span key={i} className="rounded-2xl bg-white/[0.07] border border-white/10 px-6 py-2.5 text-[30px] font-bold">
              {it.text}
            </span>
          ))}
        </div>
      </div>

      {/* Team progress */}
      <div className="glass-panel px-6 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда</div>
          <div className="text-[22px] font-bold text-[var(--color-dungeon-muted)]">сдали {doneCount} из {players.length}</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, players.length))}, minmax(0, 1fr))` }}>
          {players.map((p) => {
            const placed = Object.keys(bs.submissions[p.id] ?? {}).length;
            const done = !!bs.submitted[p.id];
            const pct = total > 0 ? Math.min(100, (placed / total) * 100) : 0;
            return (
              <div key={p.id} className={`rounded-2xl px-5 py-3 border ${done ? 'bg-[var(--color-dungeon-heal)]/10 border-[var(--color-dungeon-heal)]/50' : 'bg-white/5 border-white/10'} ${!p.isAlive ? 'opacity-40' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[26px] font-extrabold truncate leading-tight">{!p.isAlive ? '👻 ' : botMark(p)}{p.name}</div>
                  <span className={`rounded-full px-3 py-0.5 text-[18px] font-extrabold whitespace-nowrap ${done ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/5 text-white/50'}`}>
                    {done ? 'сдал ✓' : `${placed}/${total}`}
                  </span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-[var(--color-dungeon-heal)]' : 'bg-[var(--color-dungeon-gold)]'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------- Results ----------

function ResultsView({ bs, players }: { bs: BucketsSnapshot; players: Player[] }) {
  const set = bs.publicSet;
  const answers = bs.answers ?? [];
  const total = set.items.length;
  const alive = players.filter((p) => p.isAlive);

  // Per item: how many players put it in the WRONG bucket (unplaced items are not counted as errors).
  const itemsByBucket: Record<number, Array<{ idx: number; text: string; wrong: number }>> = {};
  answers.forEach((correct, idx) => {
    let wrong = 0;
    for (const p of players) {
      const placed = bs.submissions[p.id]?.[idx];
      if (placed !== undefined && placed >= 0 && placed !== correct) wrong++;
    }
    (itemsByBucket[correct] ??= []).push({ idx, text: set.items[idx]?.text ?? '?', wrong });
  });

  const teamCorrect = bs.lastTeamCorrect ?? 0;
  const teamMax = bs.lastTeamMax ?? total * Math.max(1, alive.length);
  const prevHp = bs.lastBossPrevHp ?? bs.boss.maxHp;

  return (
    <>
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-panel px-6 py-3">
          <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда верно</div>
          <div className="text-[40px] font-black leading-none text-[var(--color-dungeon-heal)] tabular-nums">{teamCorrect}<span className="text-[24px] text-white/40"> / {teamMax}</span></div>
        </div>
        <div className="glass-panel px-6 py-3">
          <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Урон боссу</div>
          <div className="text-[40px] font-black leading-none text-[#FF9A9A] tabular-nums">−{bs.lastDamageDealt ?? 0}</div>
        </div>
        <div className="glass-panel px-6 py-3">
          <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">HP босса</div>
          <div className="text-[40px] font-black leading-none tabular-nums"><span className="text-white/50">{prevHp}</span> → <span className="text-[#FF9A9A]">{bs.boss.hp}</span></div>
        </div>
        <div className="glass-panel px-6 py-3">
          <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Ответный удар</div>
          <div className="text-[40px] font-black leading-none text-[var(--color-dungeon-gold)] tabular-nums">
            {(bs.lastDamageTaken ?? 0) > 0 ? `−${bs.lastDamageTaken} HP каждому` : 'нет'}
          </div>
        </div>
      </div>

      {/* Buckets with correct contents */}
      <div className="grid gap-4 flex-1 min-h-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, set.buckets.length)}, minmax(0, 1fr))` }}>
        {set.buckets.map((b, i) => (
          <div key={i} className="glass-panel p-5 flex flex-col gap-3 min-h-0 overflow-hidden">
            <div className="flex items-center gap-3">
              <span className="text-[48px] leading-none">{b.emoji}</span>
              <div className="text-[28px] font-black leading-tight">{b.name}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(itemsByBucket[i] ?? []).map((it) => (
                <span
                  key={it.idx}
                  className={`rounded-xl px-3 py-1.5 text-[21px] font-bold border ${
                    it.wrong === 0
                      ? 'bg-[var(--color-dungeon-heal)]/15 border-[var(--color-dungeon-heal)]/40'
                      : 'bg-[#FF4848]/10 border-[#FF4848]/40'
                  }`}
                >
                  {it.text}
                  {it.wrong > 0 && <span className="ml-2 text-[#FF9A9A] font-black">✗{it.wrong}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Per-player scores */}
      <div className="glass-panel px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Кто сколько разложил верно</span>
          {[...players]
            .sort((a, b) => (bs.lastRoundScores?.[b.id] ?? 0) - (bs.lastRoundScores?.[a.id] ?? 0))
            .map((p) => {
              const n = bs.lastRoundScores?.[p.id] ?? 0;
              return (
                <span key={p.id} className={`rounded-full px-4 py-1 text-[22px] font-extrabold bg-white/10 ${!p.isAlive ? 'opacity-40' : ''}`}>
                  {!p.isAlive ? '👻 ' : botMark(p)}{p.name} <span className="text-[var(--color-dungeon-gold)] tabular-nums">{n}/{total}</span>
                </span>
              );
            })}
        </div>
      </div>
    </>
  );
}
