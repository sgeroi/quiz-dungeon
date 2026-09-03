// TV presenter for the 'petersburg' mode («Угадай фильм»).
// Built only on the room-broadcast snapshot gameState.petersburg. Formats:
//  coop  — everyone got a private actor of one movie, the captain names it.
//          The per-player actor event is private and never reaches the screen,
//          so during a round the board shows only WHO received a fragment;
//          faces and names appear from lastReveal after the round.
//  teams — one column per team: captain, status, score; reveal grouped by team.
//  ffa   — actors are public and revealed one by one; the board shows them big
//          plus who has already answered (never the answers themselves).
import { useMemo } from 'react';
import { useStore } from '../../store';
import type { GameState, Player, Team, TeamMode } from '../../types';
import TeamBadge from '../../components/TeamBadge';
import { PresenterTimer } from '../DefaultPresenter';
import { PreparingScreen } from '../classic/shared';
import type { PetersburgSnapshot } from '../../modes/petersburg/PetersburgScreen';

const WIN_THRESHOLD = 6;
const TITLE = '🎬 Угадай фильм';

export default function PetersburgPresenter() {
  const gs = useStore((s) => s.gameState);
  if (!gs) return null;
  const snap = (gs as GameState & { petersburg?: PetersburgSnapshot }).petersburg ?? null;
  if (!snap || snap.round < 1) {
    return <PreparingScreen title={TITLE} subtitle="Раздаём актёров. Угадайте фильм по его касту" />;
  }
  return <PetersburgBoard gs={gs} snap={snap} />;
}

function PetersburgBoard({ gs, snap }: { gs: GameState; snap: PetersburgSnapshot }) {
  const players = useMemo(() => Object.values(gs.players), [gs.players]);
  const humans = players.filter((p) => !p.isBot);
  const mode: TeamMode = snap.mode ?? gs.teamMode ?? 'coop';
  const teams: Team[] = gs.teams ?? [];
  const captain: Player | undefined = mode === 'coop' ? gs.players[snap.captainId] : undefined;
  const showingResult = snap.showingResult || gs.phase === 'results';
  const dealtPlayers = snap.dealt.map((id) => gs.players[id]).filter((p): p is Player => !!p);
  const isFinal = gs.phase === 'victory' || gs.phase === 'defeat';

  return (
    <div className="h-full flex flex-col gap-6 p-10 pt-4">
      {/* Header: round, score, timer */}
      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {TITLE}{mode === 'ffa' ? ' · Каждый сам за себя' : mode === 'teams' ? ' · Команда на команду' : ''}
          </div>
          <div className="flex items-baseline gap-6 mt-1">
            <div className="text-[54px] leading-none font-black text-[var(--color-dungeon-gold)] whitespace-nowrap">
              Раунд {snap.round}<span className="text-white/40 text-[36px]"> / {snap.total}</span>
            </div>
            {mode === 'coop' && (
              <div className="text-[32px] font-bold text-white/80 whitespace-nowrap">
                Счёт <span className="text-[44px] font-black text-white tabular-nums">{snap.score}</span>
                <span className="text-white/40"> / {snap.total}</span>
                <span className="text-[22px] font-semibold text-[var(--color-dungeon-muted)]"> · для победы {WIN_THRESHOLD}</span>
              </div>
            )}
            {mode === 'ffa' && !showingResult && (
              <div className="text-[30px] font-bold text-white/80 whitespace-nowrap">
                Открыто <span className="text-[40px] font-black text-white tabular-nums">{snap.revealed.length}</span>
                <span className="text-white/40"> / {snap.revealTotal}</span>
                <span className="text-[22px] font-semibold text-[var(--color-dungeon-gold)]"> · сейчас {snap.nextPoints} {pluralPoints(snap.nextPoints)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3">
            {mode === 'coop' && <ScoreDots snap={snap} />}
            {captain && (
              <span className="inline-flex items-center gap-3 rounded-full bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] px-6 py-2 text-[26px] font-extrabold">
                👑 Капитан раунда — {captain.name}
              </span>
            )}
          </div>
        </div>
        {!showingResult && !isFinal && <PresenterTimer timer={gs.timer} maxTimer={gs.maxTimer} />}
      </div>

      {/* Centre */}
      <div className="flex-1 min-h-0 flex flex-col gap-6">
        {mode === 'ffa' ? (
          showingResult && snap.lastMovieTitle
            ? <FfaResultView snap={snap} gs={gs} />
            : <FfaRoundView snap={snap} humans={humans} />
        ) : mode === 'teams' ? (
          <TeamsView snap={snap} gs={gs} teams={teams} showingResult={showingResult} />
        ) : showingResult && snap.lastMovieTitle ? (
          <ResultView snap={snap} />
        ) : (
          <RoundView dealt={dealtPlayers} captainId={snap.captainId} humans={humans} />
        )}
      </div>

      {/* Bottom strip */}
      {mode === 'ffa' ? (
        <div className="flex flex-wrap gap-3">
          {humans.slice().sort((a, b) => (snap.scores[b.id] ?? 0) - (snap.scores[a.id] ?? 0)).map((p) => {
            const a = snap.answers[p.id];
            const status = showingResult
              ? (a ? (a.correct ? `✅ +${a.points}` : a.gaveUp ? '🏳 сдался' : '❌ мимо') : '⏰ не ответил')
              : (a ? (a.gaveUp ? '🏳 сдался' : '✋ ответил') : '🤔 думает');
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-full px-5 py-2 border ${a && !showingResult ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)]' : 'bg-white/5 border-white/10'}`}>
                <span className="text-[26px] font-extrabold">{p.name}</span>
                <span className="text-[18px] font-bold text-[var(--color-dungeon-muted)]">{status}</span>
                <span className="text-[26px] font-black text-[var(--color-dungeon-gold)] tabular-nums">{snap.scores[p.id] ?? 0}</span>
              </div>
            );
          })}
        </div>
      ) : mode === 'coop' ? (
        <div className="flex flex-wrap gap-3">
          {players.map((p) => {
            const isCap = p.id === snap.captainId;
            const dealt = snap.dealt.includes(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-full px-5 py-2 border ${isCap ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)]' : 'bg-white/5 border-white/10'}`}
              >
                {!p.isBot && <span className="text-[26px]">{isCap ? '👑' : dealt ? '🎭' : '🧑'}</span>}
                <span className="text-[26px] font-extrabold">{p.name}</span>
                <span className="text-[18px] font-bold text-[var(--color-dungeon-muted)]">
                  {p.isBot ? 'наблюдает' : isCap ? 'вводит ответ' : dealt && !showingResult ? 'получил фрагмент' : ''}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function pluralPoints(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'очко';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'очка';
  return 'очков';
}

function ScoreDots({ snap }: { snap: PetersburgSnapshot }) {
  // Progress summary: `score` wins, then losses, then the current round, then the rest.
  // Per-round outcomes are not part of the snapshot, so wins are grouped first.
  const resolved = snap.showingResult && snap.lastWasCorrect !== null;
  const played = snap.round - 1 + (resolved ? 1 : 0);
  const wins = Math.min(snap.score, played);
  const losses = Math.max(0, played - wins);
  return (
    <div className="flex items-center gap-2" title={`Побед ${wins}, поражений ${losses}`}>
      {Array.from({ length: snap.total }, (_, i) => {
        const n = i + 1;
        let cls = 'bg-white/15';
        if (n <= wins) cls = 'bg-[var(--color-dungeon-heal)]';
        else if (n <= played) cls = 'bg-[#FF4848]/70';
        else if (n === played + 1 && !resolved) cls = 'bg-[var(--color-dungeon-gold)] shadow-[0_0_14px_rgba(255,219,16,0.8)]';
        return <span key={n} className={`w-5 h-5 rounded-full ${n === WIN_THRESHOLD ? 'ring-2 ring-white/50' : ''} ${cls}`} />;
      })}
    </div>
  );
}

/** Card width so that N portrait cards fit in one row (max 340px, min 200px). */
function cardWidth(n: number, max = 340): number {
  const count = Math.max(1, n);
  return Math.max(200, Math.min(max, Math.floor((1760 - 24 * (count - 1)) / count)));
}

/** coop, active round: the task and face-down "fragment" cards for everyone who got an actor. */
function RoundView({ dealt, captainId, humans }: { dealt: Player[]; captainId: string; humans: Player[] }) {
  const cards = dealt.length > 0 ? dealt : humans;
  const cardW = cardWidth(cards.length);
  return (
    <div className="h-full flex flex-col gap-8">
      <div className="text-center">
        <div className="text-[56px] font-black leading-tight">В каком фильме снимались эти актёры?</div>
        <div className="text-[28px] font-semibold text-white/70 mt-2">
          У каждого на телефоне — свой актёр из одного фильма. Опишите друг другу, кого видите, и назовите фильм. Ответ вводит капитан.
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-wrap justify-center gap-6 w-full max-w-[1760px]">
          {cards.map((p, i) => (
            <div
              key={p.id}
              className="glass-panel flex flex-col items-center gap-3 px-4 py-6 border-glow"
              style={{ width: cardW, animation: `fadeIn 0.4s ease-out ${i * 0.08}s both` }}
            >
              <div className="w-full aspect-[3/4] rounded-2xl bg-gradient-to-b from-[var(--color-dungeon-surface-2)] to-[var(--color-dungeon-bg)] border border-white/10 flex items-center justify-center">
                <span className="text-[110px] leading-none drop-shadow-[0_0_24px_rgba(205,142,255,0.5)]">🎭</span>
              </div>
              <div className="text-[28px] font-extrabold truncate max-w-full">{p.id === captainId ? '👑 ' : ''}{p.name}</div>
              <div className="text-[18px] font-bold text-[var(--color-dungeon-muted)]">получил фрагмент</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Verdict panel shared by result views. */
function VerdictPanel({ ok, headline, title, sub, badge }: { ok: boolean; headline: string; title: string; sub: string; badge: string }) {
  return (
    <div className={`glass-panel flex items-center gap-10 px-10 py-5 ${ok ? 'border-[var(--color-dungeon-heal)]/60' : 'border-[#FF4848]/60'}`}>
      <div className={`text-[64px] leading-none font-black whitespace-nowrap ${ok ? 'text-[var(--color-dungeon-heal)]' : 'text-[#FF9A9A]'}`}>{headline}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Загаданный фильм</div>
        <div className="text-[52px] font-black leading-tight text-[var(--color-dungeon-gold)] truncate">«{title}»</div>
        <div className="text-[24px] font-semibold text-white/70 mt-1 truncate">{sub}</div>
      </div>
      <div className={`rounded-full px-7 py-3 text-[30px] font-black whitespace-nowrap ${ok ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/10 text-white/60'}`}>
        {badge}
      </div>
    </div>
  );
}

function CastCardsRow({ cards, max = 290 }: { cards: Array<{ key: string; imageUrl: string; actorName: string; caption?: string }>; max?: number }) {
  const cardW = cardWidth(cards.length, max);
  return (
    <div className="flex flex-wrap justify-center gap-6 flex-1 min-h-0 content-start">
      {cards.map((item, i) => (
        <div
          key={item.key}
          className="glass-panel flex flex-col items-center gap-2 p-4"
          style={{ width: cardW, animation: `fadeIn 0.4s ease-out ${i * 0.1}s both` }}
        >
          <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden bg-black/40 border border-white/10">
            <img src={item.imageUrl} alt={item.actorName} draggable={false} className="w-full h-full object-cover object-top" />
          </div>
          <div className="text-[30px] font-black leading-tight text-center truncate max-w-full">{item.actorName}</div>
          {item.caption && <div className="text-[20px] font-bold text-[var(--color-dungeon-muted)] truncate max-w-full">{item.caption}</div>}
        </div>
      ))}
    </div>
  );
}

/** coop result: verdict, movie title, captain's answer, revealed cast with photos. */
function ResultView({ snap }: { snap: PetersburgSnapshot }) {
  const ok = !!snap.lastWasCorrect;
  const reveal = snap.lastReveal ?? [];
  return (
    <div className="h-full flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
      <VerdictPanel
        ok={ok}
        headline={ok ? '✅ В точку!' : snap.lastAnswer ? '❌ Мимо' : '⏰ Время вышло'}
        title={snap.lastMovieTitle ?? ''}
        sub={snap.lastAnswer ? `Ответ капитана: «${snap.lastAnswer}»` : 'Капитан не успел ответить'}
        badge={ok ? '+1 очко' : '0 очков'}
      />
      {reveal.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] text-center">Кто кого получил</div>
          <CastCardsRow cards={reveal.map((r, i) => ({ key: `${r.playerId}-${i}`, imageUrl: r.imageUrl, actorName: r.actorName, caption: `у ${r.playerName}` }))} />
        </div>
      )}
    </div>
  );
}

/** ffa, active round: revealed actors big, empty slots for the rest. */
function FfaRoundView({ snap, humans }: { snap: PetersburgSnapshot; humans: Player[] }) {
  const slots = Math.max(snap.revealTotal, snap.revealed.length, 1);
  const cardW = cardWidth(slots, 360);
  const answered = humans.filter((p) => snap.answers[p.id]).length;
  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <div className="text-[56px] font-black leading-tight">В каком фильме снимались эти актёры?</div>
        <div className="text-[28px] font-semibold text-white/70 mt-2">
          Каждые несколько секунд открывается новый актёр. Чем раньше ответ — тем больше очков. Ответили {answered} из {humans.length}.
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-wrap justify-center gap-6 w-full max-w-[1760px]">
          {Array.from({ length: slots }, (_, i) => {
            const a = snap.revealed[i];
            return (
              <div
                key={i}
                className={`glass-panel flex flex-col items-center gap-3 p-4 ${a ? 'border-glow' : 'opacity-50'}`}
                style={{ width: cardW, animation: a ? 'fadeIn 0.4s ease-out both' : undefined }}
              >
                <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b from-[var(--color-dungeon-surface-2)] to-[var(--color-dungeon-bg)] border border-white/10 flex items-center justify-center">
                  {a ? (
                    <img src={a.imageUrl} alt="Актёр" draggable={false} className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-[110px] leading-none opacity-50">🎭</span>
                  )}
                </div>
                <div className="text-[24px] font-extrabold text-[var(--color-dungeon-muted)]">
                  {a ? `Актёр ${i + 1}` : `${Math.max(1, 5 - i)} ${pluralPoints(Math.max(1, 5 - i))}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ffa result: the movie, who guessed it, full cast with names. */
function FfaResultView({ snap, gs }: { snap: PetersburgSnapshot; gs: GameState }) {
  const winners = Object.entries(snap.answers).filter(([, a]) => a.correct).sort((a, b) => b[1].points - a[1].points);
  const ok = winners.length > 0;
  const cast = snap.lastCast ?? [];
  return (
    <div className="h-full flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
      <VerdictPanel
        ok={ok}
        headline={ok ? '✅ Угадали!' : '❌ Никто не угадал'}
        title={snap.lastMovieTitle ?? ''}
        sub={ok ? `Угадали: ${winners.map(([pid, a]) => `${gs.players[pid]?.name ?? '???'} (+${a.points})`).join(', ')}` : 'Никто не назвал фильм'}
        badge={ok ? `${winners.length} ${winners.length === 1 ? 'игрок' : winners.length < 5 ? 'игрока' : 'игроков'}` : '0 очков'}
      />
      {cast.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] text-center">Актёры фильма</div>
          <CastCardsRow cards={cast.map((c, i) => ({ key: `${i}`, imageUrl: c.imageUrl, actorName: c.actorName }))} max={320} />
        </div>
      )}
    </div>
  );
}

/** teams: one column per team — captain, status, score; after the round the answer and cast of the team. */
function TeamsView({ snap, gs, teams, showingResult }: { snap: PetersburgSnapshot; gs: GameState; teams: Team[]; showingResult: boolean }) {
  const active = teams.filter((t) => snap.teamRounds[t.id]);
  const cols = Math.max(1, active.length);
  const reveal = snap.lastReveal ?? [];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="text-center">
        {showingResult && snap.lastMovieTitle ? (
          <>
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Загаданный фильм</div>
            <div className="text-[60px] font-black leading-tight text-[var(--color-dungeon-gold)]">«{snap.lastMovieTitle}»</div>
          </>
        ) : (
          <>
            <div className="text-[50px] font-black leading-tight">В каком фильме снимались эти актёры?</div>
            <div className="text-[26px] font-semibold text-white/70 mt-1">
              В каждой команде актёры одного фильма разделены между игроками. Ответ вводит капитан команды.
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 grid gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {active.map((t) => {
          const r = snap.teamRounds[t.id];
          const members = Object.values(gs.players).filter((p) => p.teamId === t.id);
          const captain = gs.players[r.captainId];
          const teamReveal = reveal.filter((x) => x.teamId === t.id);
          const status = showingResult
            ? (r.correct ? '✅ Угадали' : r.timedOut ? '⏰ Не успели' : '❌ Мимо')
            : r.answered ? '✅ Ответили' : '🤔 Думают';
          const cardW = Math.max(120, Math.min(220, Math.floor((1760 / cols - 48 - 16 * (teamReveal.length - 1)) / Math.max(1, teamReveal.length))));
          return (
            <div
              key={t.id}
              className="glass-panel flex flex-col gap-3 p-6 min-h-0"
              style={{ borderColor: `${t.color}99`, boxShadow: r.answered && !showingResult ? `0 0 30px ${t.color}55` : undefined }}
            >
              <div className="flex items-center justify-between gap-3">
                <TeamBadge team={t} size="lg" />
                <span className="text-[56px] font-black tabular-nums leading-none" style={{ color: t.color }}>{snap.teamScores[t.id] ?? 0}</span>
              </div>
              <div className="text-[26px] font-extrabold">👑 {captain?.name ?? '—'}</div>
              <div className={`text-[30px] font-black ${r.correct ? 'text-[var(--color-dungeon-heal)]' : showingResult ? 'text-[#FF9A9A]' : 'text-white/80'}`}>{status}</div>
              {showingResult && (
                <div className="text-[22px] font-semibold text-white/70 truncate">
                  {r.answer ? `Ответ: «${r.answer}»` : 'Без ответа'}
                </div>
              )}
              <div className="text-[18px] font-bold text-[var(--color-dungeon-muted)] truncate">
                {members.map((p) => p.name + (p.isBot ? ' 🤖' : '')).join(' · ')}
              </div>
              <div className="flex-1 min-h-0 flex flex-wrap gap-4 content-start justify-center mt-2">
                {showingResult
                  ? teamReveal.map((item, i) => (
                    <div key={`${item.playerId}-${i}`} className="flex flex-col items-center gap-1" style={{ width: cardW }}>
                      <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-black/40 border border-white/10">
                        <img src={item.imageUrl} alt={item.actorName} draggable={false} className="w-full h-full object-cover object-top" />
                      </div>
                      <div className="text-[18px] font-black leading-tight text-center truncate max-w-full">{item.actorName}</div>
                      <div className="text-[15px] font-bold text-[var(--color-dungeon-muted)] truncate max-w-full">у {item.playerName}</div>
                    </div>
                  ))
                  : members.filter((p) => !p.isBot).map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-1" style={{ width: cardW }}>
                      <div className="w-full aspect-[3/4] rounded-xl bg-gradient-to-b from-[var(--color-dungeon-surface-2)] to-[var(--color-dungeon-bg)] border border-white/10 flex items-center justify-center">
                        <span className="text-[64px] leading-none">🎭</span>
                      </div>
                      <div className="text-[18px] font-extrabold truncate max-w-full">{p.id === r.captainId ? '👑 ' : ''}{p.name}</div>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
