import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { PresenterTimer } from '../DefaultPresenter';
import type { Player } from '../../types';

/** Bot names already carry the robot emoji; only prefix when they don't. */
const botMark = (p?: Pick<Player, 'isBot' | 'name'> | null) => (p?.isBot && !p.name.includes('🤖') ? '🤖 ' : '');

/**
 * TV presenter for the 'speed' mode ("На скорость").
 * Reads only the room-broadcast snapshot gameState.speed: round, question,
 * who has answered, reveal data (correct index + per-player answers) during
 * 'results', and the live leaderboard. Never shows the correct answer or other
 * players' picks before the reveal.
 */

interface PlayerAnswerInfo {
  optionIdx: number;
  elapsedMs: number;
  correct: boolean;
  delta: number;
  wasFirst: boolean;
}

interface SpeedSnapshot {
  round: number;
  total: number;
  scores: Record<string, number>;
  question: { id: string; text: string; options: string[] } | null;
  answered: string[];
  questionStartMs: number;
  revealCorrectIndex: number | null;
  revealAnswers: Record<string, PlayerAnswerInfo> | null;
  winnerOnFirst: string | null;
  winner: string | null;
  finished: boolean;
}

const QUESTION_TIME_MS = 10_000;

// Same shapes/colours as the phone screen so players can match their buttons.
const OPTION_THEMES = [
  { bg: 'linear-gradient(135deg,#f43f5e,#db2777)', glow: 'rgba(244,63,94,0.45)', shape: '▲', label: 'A' },
  { bg: 'linear-gradient(135deg,#0ea5e9,#2563eb)', glow: 'rgba(56,189,248,0.45)', shape: '◆', label: 'B' },
  { bg: 'linear-gradient(135deg,#fbbf24,#f97316)', glow: 'rgba(251,191,36,0.45)', shape: '●', label: 'C' },
  { bg: 'linear-gradient(135deg,#10b981,#16a34a)', glow: 'rgba(16,185,129,0.45)', shape: '■', label: 'D' },
];

function useNowMs(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function fmtDelta(d: number): string {
  return d > 0 ? `+${d}` : `${d}`;
}

export default function SpeedPresenter() {
  const gameState = useStore((s) => s.gameState);
  const snap = (gameState as unknown as { speed?: SpeedSnapshot } | null)?.speed ?? null;
  const isAnswering = gameState?.phase === 'answering';
  const now = useNowMs(isAnswering);

  const players = useMemo(() => (gameState ? Object.values(gameState.players) : []), [gameState]);
  const leaderboard = useMemo(() => {
    if (!snap) return [] as Player[];
    return [...players].sort((a, b) => (snap.scores[b.id] ?? 0) - (snap.scores[a.id] ?? 0));
  }, [players, snap]);

  if (!gameState || !snap || !snap.question) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
        <div className="text-[120px] leading-none">⚡</div>
        <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">На скорость</div>
        <div className="text-[36px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">Готовимся…</div>
      </div>
    );
  }

  const q = snap.question;
  const reveal = gameState.phase === 'results' && snap.revealCorrectIndex !== null;
  const answers = reveal ? snap.revealAnswers ?? {} : {};
  const remainingMs = Math.max(0, Math.min(QUESTION_TIME_MS, QUESTION_TIME_MS - (now - snap.questionStartMs)));
  const remainingSec = Math.ceil(remainingMs / 1000);
  const answeredSet = new Set(snap.answered);
  const first = snap.winnerOnFirst ? gameState.players[snap.winnerOnFirst] : null;
  const firstInfo = snap.winnerOnFirst ? snap.revealAnswers?.[snap.winnerOnFirst] : null;

  // Who picked which option — only after reveal.
  const pickedBy: Record<number, Array<{ p: Player; info: PlayerAnswerInfo }>> = {};
  if (reveal) {
    for (const p of players) {
      const info = answers[p.id];
      if (!info) continue;
      (pickedBy[info.optionIdx] ??= []).push({ p, info });
    }
  }

  let statusText: string;
  let statusTone = 'text-white/70';
  if (reveal) {
    if (first && firstInfo) {
      statusText = firstInfo.correct
        ? `⚡ ${first.name} — первый и верно! ${fmtDelta(firstInfo.delta)}`
        : `${first.name} нажал первым и промахнулся (${fmtDelta(firstInfo.delta)})`;
      statusTone = firstInfo.correct ? 'text-[var(--color-dungeon-heal)]' : 'text-[#FF9A9A]';
    } else {
      statusText = 'Никто не успел ответить';
    }
  } else if (first) {
    statusText = `${first.name} нажал первым и ошибся — остальные ещё могут ответить`;
    statusTone = 'text-[#FFC0C0]';
  } else {
    statusText = 'Кто первый ответит верно — заберёт бонус за скорость';
  }

  return (
    <div className="h-full flex flex-col gap-5 px-10 pb-8 pt-2">
      {/* Top: mode + round + status + timer */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {reveal ? 'Результаты' : 'Отвечаем!'}
          </div>
          <div className="text-[44px] font-black leading-tight">⚡ На скорость</div>
          <div className="text-[28px] font-bold text-[var(--color-dungeon-gold)]">
            Раунд {snap.round} из {snap.total}
          </div>
        </div>
        <div className={`flex-1 text-center text-[28px] font-extrabold leading-snug ${statusTone}`}>{statusText}</div>
        {reveal ? (
          <div className="flex flex-col items-center min-w-[160px]">
            <div className="text-[64px] leading-none">{firstInfo?.correct ? '🏁' : '🔎'}</div>
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mt-2">разбор</div>
          </div>
        ) : (
          <PresenterTimer timer={remainingSec} maxTimer={QUESTION_TIME_MS / 1000} />
        )}
      </div>

      {/* Main: question + options | leaderboard */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_540px] gap-8">
        <div className="flex flex-col gap-6 min-h-0">
          <div className="glass-panel-gold px-10 py-7">
            <div className="text-[46px] font-extrabold leading-[1.15]">{q.text}</div>
          </div>

          <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
            {q.options.map((opt, i) => {
              const theme = OPTION_THEMES[i] ?? OPTION_THEMES[0];
              const isCorrect = reveal && snap.revealCorrectIndex === i;
              const dim = reveal && !isCorrect;
              const picks = pickedBy[i] ?? [];
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-3xl px-7 py-5 flex flex-col gap-3 transition-all duration-300 ${dim ? 'opacity-45 grayscale-[35%]' : ''}`}
                  style={{
                    background: theme.bg,
                    boxShadow: isCorrect
                      ? '0 0 0 6px #8DFF85, 0 0 60px rgba(141,255,133,0.6)'
                      : `0 0 30px ${theme.glow}`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/25 pointer-events-none" />
                  <div className="relative flex items-center gap-5">
                    <div className="shrink-0 w-[72px] h-[72px] rounded-2xl bg-black/30 flex items-center justify-center text-[40px] font-black">
                      {theme.shape}
                    </div>
                    <div className="flex-1 text-[34px] font-extrabold leading-tight drop-shadow-md">{opt}</div>
                    {isCorrect && <div className="text-[56px] leading-none">✓</div>}
                  </div>
                  {reveal && (
                    <div className="relative flex flex-wrap gap-2 min-h-[40px]">
                      {picks.map(({ p, info }) => (
                        <span
                          key={p.id}
                          className={`rounded-full px-4 py-1 text-[20px] font-extrabold ${
                            info.correct ? 'bg-[#06301a]/70 text-[var(--color-dungeon-heal)]' : 'bg-black/50 text-[#FFB4B4]'
                          }`}
                        >
                          {info.wasFirst ? '⚡ ' : ''}{botMark(p)}{p.name} {fmtDelta(info.delta)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="glass-panel p-6 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-[30px] font-black">Табло</div>
            <div className="text-[20px] font-bold text-[var(--color-dungeon-muted)]">
              {reveal ? `ответили ${snap.answered.length}/${players.length}` : `${snap.answered.length}/${players.length} ответили`}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
            {leaderboard.map((p, i) => {
              const answered = answeredSet.has(p.id);
              const info = answers[p.id];
              const score = snap.scores[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 rounded-2xl px-5 py-3 border ${
                    i === 0 ? 'bg-[var(--color-dungeon-gold)]/10 border-[var(--color-dungeon-gold)]/50' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="w-[40px] shrink-0 text-[26px] font-black text-[var(--color-dungeon-muted)] tabular-nums">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </div>
                  <div className="flex-1 min-w-0 text-[26px] font-extrabold truncate leading-tight">
                    {botMark(p)}{p.name}
                  </div>
                  {reveal ? (
                    info ? (
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[18px] font-black tabular-nums ${info.correct ? 'bg-[var(--color-dungeon-heal)]/20 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/20 text-[#FF9A9A]'}`}>
                        {info.wasFirst ? '⚡' : ''}{fmtDelta(info.delta)}
                      </span>
                    ) : (
                      <span className="shrink-0 w-[44px] text-center text-[20px] font-bold text-white/30">—</span>
                    )
                  ) : (
                    <span className={`shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center text-[24px] font-black ${answered ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]' : 'bg-white/10 text-white/40'}`}>
                      {answered ? '✓' : '…'}
                    </span>
                  )}
                  <div className={`shrink-0 w-[90px] text-right text-[32px] font-black tabular-nums leading-none ${score < 0 ? 'text-[#FF9A9A]' : 'text-[var(--color-dungeon-gold)]'}`}>
                    {score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
