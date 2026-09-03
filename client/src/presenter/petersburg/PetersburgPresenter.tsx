// TV presenter for the 'petersburg' mode ("Санкт-Петербург": everyone gets a
// different actor from one movie, the captain names the movie).
// Built only on the room-broadcast snapshot gameState.petersburg. The
// per-player actor event (mode-petersburg-actor) is private and never reaches
// the screen, so during a round the board shows only WHO received a fragment;
// faces and names appear from lastReveal after the round is resolved.
import { useMemo } from 'react';
import { useStore } from '../../store';
import type { GameState, Player } from '../../types';
import { PresenterTimer } from '../DefaultPresenter';
import { PreparingScreen } from '../classic/shared';

interface RevealCastMember {
  playerId: string;
  playerName: string;
  actorName: string;
  imageUrl: string;
}

interface PetersburgSnapshot {
  round: number;
  total: number;
  score: number;
  captainId: string;
  dealt: string[];
  showingResult: boolean;
  lastAnswer: string | null;
  lastWasCorrect: boolean | null;
  lastMovieTitle: string | null;
  lastReveal: RevealCastMember[] | null;
}

const WIN_THRESHOLD = 6;
const TITLE = '🎬 Санкт-Петербург';

export default function PetersburgPresenter() {
  const gs = useStore((s) => s.gameState);
  if (!gs) return null;
  const snap = (gs as GameState & { petersburg?: PetersburgSnapshot }).petersburg ?? null;
  if (!snap || snap.round < 1) {
    return <PreparingScreen title={TITLE} subtitle="Раздаём актёров. У каждого будет свой фрагмент одного фильма" />;
  }
  return <PetersburgBoard gs={gs} snap={snap} />;
}

function PetersburgBoard({ gs, snap }: { gs: GameState; snap: PetersburgSnapshot }) {
  const players = useMemo(() => Object.values(gs.players), [gs.players]);
  const humans = players.filter((p) => !p.isBot);
  const captain: Player | undefined = gs.players[snap.captainId];
  const showingResult = snap.showingResult || gs.phase === 'results';
  const dealtPlayers = snap.dealt.map((id) => gs.players[id]).filter((p): p is Player => !!p);
  const isFinal = gs.phase === 'victory' || gs.phase === 'defeat';

  return (
    <div className="h-full flex flex-col gap-6 p-10 pt-4">
      {/* Header: round, score, timer */}
      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">{TITLE}</div>
          <div className="flex items-baseline gap-6 mt-1">
            <div className="text-[54px] leading-none font-black text-[var(--color-dungeon-gold)] whitespace-nowrap">
              Раунд {snap.round}<span className="text-white/40 text-[36px]"> / {snap.total}</span>
            </div>
            <div className="text-[32px] font-bold text-white/80 whitespace-nowrap">
              Счёт <span className="text-[44px] font-black text-white tabular-nums">{snap.score}</span>
              <span className="text-white/40"> / {snap.total}</span>
              <span className="text-[22px] font-semibold text-[var(--color-dungeon-muted)]"> · для победы {WIN_THRESHOLD}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <ScoreDots snap={snap} />
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
        {showingResult && snap.lastMovieTitle ? (
          <ResultView snap={snap} />
        ) : (
          <RoundView dealt={dealtPlayers} captainId={snap.captainId} humans={humans} />
        )}
      </div>

      {/* Team strip */}
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
    </div>
  );
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

/** Active round: the task and face-down "fragment" cards for everyone who got an actor. */
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

/** Result of a round: verdict, movie title, captain's answer, revealed cast with photos. */
function ResultView({ snap }: { snap: PetersburgSnapshot }) {
  const ok = !!snap.lastWasCorrect;
  const reveal = snap.lastReveal ?? [];
  const cardW = cardWidth(reveal.length, 290);
  return (
    <div className="h-full flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
      <div className={`glass-panel flex items-center gap-10 px-10 py-5 ${ok ? 'border-[var(--color-dungeon-heal)]/60' : 'border-[#FF4848]/60'}`}>
        <div className={`text-[64px] leading-none font-black whitespace-nowrap ${ok ? 'text-[var(--color-dungeon-heal)]' : 'text-[#FF9A9A]'}`}>
          {ok ? '✅ В точку!' : snap.lastAnswer ? '❌ Мимо' : '⏰ Время вышло'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Загаданный фильм</div>
          <div className="text-[52px] font-black leading-tight text-[var(--color-dungeon-gold)] truncate">«{snap.lastMovieTitle}»</div>
          {snap.lastAnswer ? (
            <div className="text-[24px] font-semibold text-white/70 mt-1 truncate">Ответ капитана: «{snap.lastAnswer}»</div>
          ) : (
            <div className="text-[24px] font-semibold text-white/70 mt-1">Капитан не успел ответить</div>
          )}
        </div>
        <div className={`rounded-full px-7 py-3 text-[30px] font-black whitespace-nowrap ${ok ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/10 text-white/60'}`}>
          {ok ? '+1 очко' : '0 очков'}
        </div>
      </div>
      {reveal.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] text-center">Кто кого получил</div>
          <div className="flex flex-wrap justify-center gap-6 flex-1 min-h-0 content-start">
            {reveal.map((item, i) => (
              <div
                key={item.playerId}
                className="glass-panel flex flex-col items-center gap-2 p-4"
                style={{ width: cardW, animation: `fadeIn 0.4s ease-out ${i * 0.1}s both` }}
              >
                <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                  <img src={item.imageUrl} alt={item.actorName} draggable={false} className="w-full h-full object-cover object-top" />
                </div>
                <div className="text-[30px] font-black leading-tight text-center truncate max-w-full">{item.actorName}</div>
                <div className="text-[20px] font-bold text-[var(--color-dungeon-muted)] truncate max-w-full">у {item.playerName}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
