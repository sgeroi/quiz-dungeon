import { useMemo } from 'react';
import { useStore } from '../../store';
import { PresenterTimer } from '../DefaultPresenter';
import TeamBadge from '../../components/TeamBadge';
import type { GameState, Player, Team, TeamMode } from '../../types';

/** Bot names already carry the robot emoji; only prefix when they don't. */
const botMark = (p?: Pick<Player, 'isBot' | 'name'> | null) => (p?.isBot && !p.name.includes('🤖') ? '🤖 ' : '');

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * TV presenter for the 'buckets' mode ("Сортировка").
 * Reads only the room-broadcast snapshot gameState.buckets. The answer key
 * (`answers`) is only present in the snapshot during 'results', so correct
 * buckets are never shown before the round ends.
 *
 * Formats: coop — golem HP + team progress; ffa — player rating + progress;
 * teams — team board (colours, totals) + per-member progress.
 */

interface PublicSet {
  title: string;
  buckets: { name: string; emoji: string }[];
  items: { text: string }[];
}

interface TeamRoundResult { correct: number; max: number; members: number; points: number }

interface BucketsSnapshot {
  round: number;
  totalRounds: number;
  teamMode?: TeamMode;
  boss: { hp: number; maxHp: number; emoji: string; name: string };
  scores?: Record<string, number>;
  teamScores?: Record<string, number>;
  teamScoring?: 'sum' | 'avg';
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
  lastRoundPoints?: Record<string, number>;
  lastSpeedBonus?: Record<string, number>;
  lastTeamRound?: Record<string, TeamRoundResult>;
  answers?: number[];
}

function ranking(players: Player[], scores: Record<string, number> | undefined): Player[] {
  return [...players].sort((a, b) => ((scores?.[b.id] ?? 0) - (scores?.[a.id] ?? 0)) || a.name.localeCompare(b.name));
}

export default function BucketsPresenter() {
  const gameState = useStore((s) => s.gameState);
  const bs = (gameState as unknown as { buckets?: BucketsSnapshot } | null)?.buckets ?? null;
  const players = useMemo(() => (gameState ? Object.values(gameState.players) : []), [gameState]);
  const mode: TeamMode = bs?.teamMode ?? gameState?.teamMode ?? 'coop';
  const modeLabel = mode === 'ffa' ? '🥇 Каждый сам за себя' : mode === 'teams' ? '⚔️ Команда на команду' : '🤝 Все против голема';

  if (!gameState || !bs || gameState.phase === 'floor-intro' || bs.publicSet.items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
        <div className="text-[120px] leading-none">🪣</div>
        <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">Сортировка</div>
        <div className="text-[32px] font-bold text-white/70">{modeLabel}</div>
        <div className="text-[36px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">
          {bs ? `Раунд ${Math.min(bs.round + 1, bs.totalRounds)} из ${bs.totalRounds} · готовимся…` : 'Готовимся…'}
        </div>
      </div>
    );
  }

  const isResults = gameState.phase === 'results';
  const set = bs.publicSet;

  return (
    <div className="h-full flex flex-col gap-4 px-10 pb-8 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {isResults ? 'Разбор раунда' : 'Раскладываем!'} · {modeLabel}
          </div>
          <div className="text-[44px] font-black leading-tight">🪣 Сортировка</div>
          <div className="text-[26px] font-bold text-[var(--color-dungeon-gold)]">Раунд {Math.max(1, bs.round)} из {bs.totalRounds}</div>
        </div>

        {mode === 'coop' ? <BossPanel bs={bs} /> : mode === 'teams' ? <TeamTotals gs={gameState} bs={bs} /> : <LeaderStrip players={players} bs={bs} />}

        {isResults ? (
          <div className="min-w-[160px] text-center text-[64px] leading-none">
            {mode === 'coop' ? ((bs.lastDamageDealt ?? 0) > 0 ? '⚔️' : '🛡️') : '📊'}
          </div>
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

      {isResults
        ? <ResultsView gs={gameState} bs={bs} players={players} mode={mode} />
        : <SortingView gs={gameState} bs={bs} players={players} mode={mode} />}
    </div>
  );
}

// ---------- Header widgets ----------

function BossPanel({ bs }: { bs: BucketsSnapshot }) {
  const bossPct = bs.boss.maxHp > 0 ? Math.max(0, Math.min(100, (bs.boss.hp / bs.boss.maxHp) * 100)) : 0;
  return (
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
  );
}

/** teams: compact totals in the header. */
function TeamTotals({ gs, bs }: { gs: GameState; bs: BucketsSnapshot }) {
  const teams = (gs.teams ?? []).filter((t) => Object.values(gs.players).some((p) => p.teamId === t.id));
  const totals = bs.teamScores ?? {};
  const sorted = [...teams].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
  return (
    <div className="flex items-center gap-4 glass-panel-gold px-8 py-4">
      {sorted.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-2xl px-4 py-2" style={{ backgroundColor: `${t.color}1f`, border: `1px solid ${t.color}66` }}>
          <TeamBadge team={t} size="lg" />
          <span className="text-[44px] font-black tabular-nums leading-none" style={{ color: t.color }}>{totals[t.id] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

/** ffa: top-3 in the header. */
function LeaderStrip({ players, bs }: { players: Player[]; bs: BucketsSnapshot }) {
  const top = ranking(players, bs.scores).slice(0, 3);
  return (
    <div className="flex items-center gap-4 glass-panel-gold px-8 py-4">
      {top.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2">
          <span className="text-[36px] leading-none">{MEDALS[i]}</span>
          <span className="text-[26px] font-extrabold max-w-[260px] truncate">{botMark(p)}{p.name}</span>
          <span className="text-[34px] font-black tabular-nums text-[var(--color-dungeon-gold)]">{bs.scores?.[p.id] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Sorting (answering) ----------

function ProgressCard({ p, bs, total, accent }: { p: Player; bs: BucketsSnapshot; total: number; accent?: string }) {
  const placed = Object.keys(bs.submissions[p.id] ?? {}).length;
  const done = !!bs.submitted[p.id];
  const pct = total > 0 ? Math.min(100, (placed / total) * 100) : 0;
  return (
    <div
      className={`rounded-2xl px-5 py-3 border ${done ? 'bg-[var(--color-dungeon-heal)]/10 border-[var(--color-dungeon-heal)]/50' : 'bg-white/5 border-white/10'} ${!p.isAlive ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[26px] font-extrabold truncate leading-tight">{!p.isAlive ? '👻 ' : botMark(p)}{p.name}</div>
        <span className={`rounded-full px-3 py-0.5 text-[18px] font-extrabold whitespace-nowrap ${done ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/5 text-white/50'}`}>
          {done ? 'сдал ✓' : `разложил ${placed}/${total}`}
        </span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-[var(--color-dungeon-heal)]' : accent ? '' : 'bg-[var(--color-dungeon-gold)]'}`}
          style={{ width: `${pct}%`, backgroundColor: !done && accent ? accent : undefined }}
        />
      </div>
    </div>
  );
}

function SortingView({ gs, bs, players, mode }: { gs: GameState; bs: BucketsSnapshot; players: Player[]; mode: TeamMode }) {
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

      {mode === 'teams' ? (
        <TeamProgressBoard gs={gs} bs={bs} players={players} total={total} doneCount={doneCount} />
      ) : mode === 'ffa' ? (
        <div className="glass-panel px-6 py-4" data-testid="presenter-buckets-ffa">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Рейтинг · прогресс</div>
            <div className="text-[22px] font-bold text-[var(--color-dungeon-muted)]">сдали {doneCount} из {players.length}</div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, players.length))}, minmax(0, 1fr))` }}>
            {ranking(players, bs.scores).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-[64px] text-center text-[30px] font-black text-white/60 shrink-0">{MEDALS[i] ?? `${i + 1}.`}</div>
                <div className="flex-1 min-w-0"><ProgressCard p={p} bs={bs} total={total} /></div>
                <div className="w-[80px] text-right text-[34px] font-black tabular-nums text-[var(--color-dungeon-gold)] shrink-0">{bs.scores?.[p.id] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-panel px-6 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда</div>
            <div className="text-[22px] font-bold text-[var(--color-dungeon-muted)]">сдали {doneCount} из {players.length}</div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, players.length))}, minmax(0, 1fr))` }}>
            {players.map((p) => <ProgressCard key={p.id} p={p} bs={bs} total={total} />)}
          </div>
        </div>
      )}
    </>
  );
}

/** teams: one column per team with colour, total and each member's progress. */
function TeamProgressBoard({ gs, bs, players, total, doneCount }: { gs: GameState; bs: BucketsSnapshot; players: Player[]; total: number; doneCount: number }) {
  const teams: Team[] = (gs.teams ?? []).filter((t) => players.some((p) => p.teamId === t.id));
  const totals = bs.teamScores ?? {};
  return (
    <div className="glass-panel px-6 py-4" data-testid="presenter-buckets-teams">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команды · прогресс</div>
        <div className="text-[22px] font-bold text-[var(--color-dungeon-muted)]">сдали {doneCount} из {players.length}</div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, teams.length))}, minmax(0, 1fr))` }}>
        {teams.map((t) => {
          const members = players.filter((p) => p.teamId === t.id);
          const placedSum = members.reduce((n, p) => n + Object.keys(bs.submissions[p.id] ?? {}).length, 0);
          return (
            <div key={t.id} className="rounded-3xl p-4 flex flex-col gap-2 border" style={{ backgroundColor: `${t.color}1a`, borderColor: `${t.color}66` }}>
              <div className="flex items-center justify-between gap-3">
                <TeamBadge team={t} size="lg" />
                <div className="text-right">
                  <div className="text-[40px] font-black tabular-nums leading-none" style={{ color: t.color }}>{totals[t.id] ?? 0}</div>
                  <div className="text-[16px] font-bold text-white/50">разложили {placedSum}/{members.length * total}</div>
                </div>
              </div>
              {members.map((p) => <ProgressCard key={p.id} p={p} bs={bs} total={total} accent={t.color} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Results ----------

function ResultsView({ gs, bs, players, mode }: { gs: GameState; bs: BucketsSnapshot; players: Player[]; mode: TeamMode }) {
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
      {mode === 'coop' && (
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
      )}

      {mode === 'teams' && <TeamRoundStrip gs={gs} bs={bs} players={players} />}

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
      {mode === 'ffa' ? (
        <div className="glass-panel px-6 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Рейтинг</span>
            {ranking(players, bs.scores).map((p, i) => {
              const n = bs.lastRoundScores?.[p.id] ?? 0;
              const pts = bs.lastRoundPoints?.[p.id] ?? n;
              const bonus = bs.lastSpeedBonus?.[p.id] ?? 0;
              return (
                <span key={p.id} className={`rounded-full px-4 py-1 text-[22px] font-extrabold ${i === 0 ? 'bg-[var(--color-dungeon-gold)]/20 border border-[var(--color-dungeon-gold)]/50' : 'bg-white/10'}`}>
                  {MEDALS[i] ?? `${i + 1}.`} {botMark(p)}{p.name}
                  <span className="text-white/50 tabular-nums"> {n}/{total}{bonus > 0 ? ` +${bonus}⚡` : ''} · +{pts}</span>
                  <span className="text-[var(--color-dungeon-gold)] tabular-nums"> {bs.scores?.[p.id] ?? 0}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-panel px-6 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Кто сколько разложил верно</span>
            {[...players]
              .sort((a, b) => (bs.lastRoundScores?.[b.id] ?? 0) - (bs.lastRoundScores?.[a.id] ?? 0))
              .map((p) => {
                const n = bs.lastRoundScores?.[p.id] ?? 0;
                const team = mode === 'teams' ? gs.teams?.find((t) => t.id === p.teamId) : undefined;
                return (
                  <span
                    key={p.id}
                    className={`rounded-full px-4 py-1 text-[22px] font-extrabold bg-white/10 ${!p.isAlive ? 'opacity-40' : ''}`}
                    style={team ? { border: `1px solid ${team.color}80` } : undefined}
                  >
                    {team && <TeamBadge team={team} size="sm" iconOnly className="mr-2 align-middle" />}
                    {!p.isAlive ? '👻 ' : botMark(p)}{p.name} <span className="text-[var(--color-dungeon-gold)] tabular-nums">{n}/{total}</span>
                  </span>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
}

/** teams: per-team result of the round + running total. */
function TeamRoundStrip({ gs, bs, players }: { gs: GameState; bs: BucketsSnapshot; players: Player[] }) {
  const teams: Team[] = (gs.teams ?? []).filter((t) => players.some((p) => p.teamId === t.id));
  const totals = bs.teamScores ?? {};
  const round = bs.lastTeamRound ?? {};
  const sorted = [...teams].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
  return (
    <div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, sorted.length)}, minmax(0, 1fr))` }}>
        {sorted.map((t, i) => {
          const r = round[t.id];
          return (
            <div key={t.id} className="rounded-3xl px-6 py-3 flex items-center justify-between gap-4 border" style={{ backgroundColor: `${t.color}1f`, borderColor: i === 0 ? t.color : `${t.color}55`, boxShadow: i === 0 ? `0 0 30px ${t.color}44` : undefined }}>
              <div className="flex items-center gap-3">
                <span className="text-[34px]">{MEDALS[i] ?? `${i + 1}.`}</span>
                <TeamBadge team={t} size="lg" />
              </div>
              <div className="text-right">
                <div className="text-[18px] font-bold text-white/60 tabular-nums">{r ? `верно ${r.correct}/${r.max} · +${r.points}` : ''}</div>
                <div className="text-[44px] font-black tabular-nums leading-none" style={{ color: t.color }}>{totals[t.id] ?? 0}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[18px] font-semibold text-white/40 text-center">
        {bs.teamScoring === 'avg' ? 'Команды неравные: очки = среднее верных на игрока × 10' : 'Очки команды = сумма верных ответов её игроков'}
      </div>
    </div>
  );
}
