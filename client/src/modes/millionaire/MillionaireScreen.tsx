import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';

// ---------- Pyramid ----------
const PRIZE_PYRAMID: number[] = [
  100,
  500,
  1_000,
  5_000,
  25_000,
  100_000,
  500_000,
  1_000_000,
];
const SAFE_LEVEL = 5; // 25 000 ₽ — несгораемая

interface AudienceData {
  percents: [number, number, number, number];
}
interface FriendData {
  suggestionIndex: 0 | 1 | 2 | 3;
  text: string;
}
interface MillionaireSnapshot {
  level: number;
  hintsUsed: { fifty: boolean; audience: boolean; friend: boolean; swap: boolean };
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  question: {
    id: string;
    text: string;
    options: string[];
  } | null;
  lastAnswerIndex: number | null;
  lastWasCorrect: boolean | null;
  revealCorrectIndex: number | null;
  finalSum: number;
  finalLevel: number;
  pyramid: number[];
}

const formatRub = (n: number) =>
  `${n.toLocaleString('ru-RU')} ₽`.replace(',', ' ');

const LETTERS = ['A', 'B', 'C', 'D'];
const LETTER_COLORS = [
  'from-rose-500/30 to-rose-600/20 border-rose-400/40',
  'from-amber-500/30 to-amber-600/20 border-amber-400/40',
  'from-emerald-500/30 to-emerald-600/20 border-emerald-400/40',
  'from-sky-500/30 to-sky-600/20 border-sky-400/40',
];

export default function MillionaireScreen() {
  const gameState = useStore((s) => s.gameState);
  const phase = gameState?.phase;
  const m = (gameState as any)?.millionaire as MillionaireSnapshot | undefined;

  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [showFriend, setShowFriend] = useState(false);

  // Reset local UI on new question
  useEffect(() => {
    if (phase === 'answering') {
      setPickedIndex(null);
      setShowFriend(false);
    }
  }, [phase, m?.question?.id]);

  // Auto-show friend dialog when friend hint is used
  useEffect(() => {
    if (m?.friend) setShowFriend(true);
  }, [m?.friend?.text]);

  if (!gameState) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    );
  }

  // Victory / defeat handled by ResultScreen, but show our own summary panel briefly
  if (phase === 'victory' || phase === 'defeat') {
    return (
      <MillionaireFinish
        victory={phase === 'victory'}
        sum={m?.finalSum ?? 0}
        level={m?.finalLevel ?? 0}
      />
    );
  }

  if (!m) {
    return (
      <div className="h-full flex items-center justify-center text-amber-300">
        Готовим студию...
      </div>
    );
  }

  const level = m.level;
  const showResult = phase === 'results';
  const correctIdx = m.revealCorrectIndex;
  const lastIdx = m.lastAnswerIndex;
  const timer = gameState.timer;
  const maxTimer = gameState.maxTimer || 30;
  const timerPct = Math.max(0, Math.min(100, (timer / maxTimer) * 100));
  const timerLow = timer <= 5;

  const onPick = (i: number) => {
    if (showResult) return;
    if (m.fiftyEliminated.includes(i)) return;
    if (pickedIndex !== null) return;
    setPickedIndex(i);
    socket.emit('mode-millionaire-answer' as any, i);
  };

  const useHint = (hint: 'fifty' | 'audience' | 'friend' | 'swap') => {
    if (showResult) return;
    socket.emit('mode-millionaire-hint' as any, hint);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06122c] via-[#091a3a] to-[#0c1e4a] relative overflow-hidden">
      {/* Decorative spotlight */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-300/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-blue-400/5 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4 min-h-screen">
        {/* Header / title */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(245,197,24,0.3)]">
            КТО ХОЧЕТ СТАТЬ МИЛЛИОНЕРОМ
          </h1>
          <div className="text-xs text-amber-200/60 mt-1 tracking-widest">
            ВОПРОС {level} ИЗ {PRIZE_PYRAMID.length}
          </div>
        </div>

        {/* Pyramid */}
        <Pyramid currentLevel={level} pyramid={m.pyramid?.length ? m.pyramid : PRIZE_PYRAMID} />

        {/* Question */}
        <div className="glass-panel-gold rounded-2xl px-5 py-5 text-center border border-amber-300/20 shadow-[0_0_30px_rgba(245,197,24,0.08)]">
          <div className="text-base md:text-xl text-white font-semibold leading-snug">
            {m.question?.text ?? '...'}
          </div>
        </div>

        {/* Audience hint result */}
        {m.audience && (
          <div className="glass-panel rounded-2xl p-3 border border-blue-400/30">
            <div className="text-xs text-blue-200/80 text-center mb-2 font-bold tracking-wider uppercase">
              📊 Результаты голосования зала
            </div>
            <div className="flex items-end justify-around gap-3 h-24">
              {m.audience.percents.map((pct, i) => {
                const eliminated = m.fiftyEliminated.includes(i);
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div className="text-xs font-mono text-amber-200">
                      {eliminated ? '—' : `${pct}%`}
                    </div>
                    <div className="w-full bg-black/30 rounded-t h-full flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t transition-all duration-700 ${
                          eliminated
                            ? 'bg-gray-500/30'
                            : 'bg-gradient-to-t from-amber-400 to-amber-300'
                        }`}
                        style={{ height: eliminated ? '4%' : `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400">{LETTERS[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Friend hint dialog */}
        {showFriend && m.friend && (
          <div className="glass-panel rounded-2xl p-3 border border-emerald-400/30 flex items-start gap-3">
            <div className="text-3xl">📞</div>
            <div className="flex-1">
              <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
                Звонок другу
              </div>
              <div className="text-sm text-white">{m.friend.text}</div>
            </div>
            <button
              onClick={() => setShowFriend(false)}
              className="text-emerald-300/50 hover:text-emerald-200 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Answer options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(m.question?.options ?? ['', '', '', '']).map((opt, i) => {
            const eliminated = m.fiftyEliminated.includes(i);
            const isPicked = lastIdx === i || pickedIndex === i;
            const isCorrect = showResult && correctIdx === i;
            const isWrong = showResult && isPicked && correctIdx !== i;
            const friendHighlight =
              !showResult && m.friend?.suggestionIndex === i;

            let stateClasses = `bg-gradient-to-br ${LETTER_COLORS[i]} hover:brightness-125`;
            if (eliminated) stateClasses = 'bg-black/30 border-white/5 opacity-30';
            if (isCorrect) stateClasses = 'bg-gradient-to-br from-green-400 to-emerald-600 border-green-300 animate-pulse';
            if (isWrong) stateClasses = 'bg-gradient-to-br from-red-500 to-red-700 border-red-300 animate-[shake_0.4s]';
            if (!showResult && isPicked) stateClasses = 'bg-gradient-to-br from-amber-300 to-amber-500 border-amber-200 animate-pulse';

            return (
              <button
                key={i}
                disabled={eliminated || showResult || pickedIndex !== null}
                onClick={() => onPick(i)}
                className={`relative text-left rounded-2xl border-2 px-4 py-3 transition-all ${stateClasses} ${
                  friendHighlight ? 'ring-2 ring-emerald-300/60' : ''
                } disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-black/30 border border-white/10 flex items-center justify-center text-amber-200 font-black">
                    {LETTERS[i]}
                  </div>
                  <div className="flex-1 text-white font-medium text-sm md:text-base">
                    {eliminated ? '—' : opt}
                  </div>
                  {friendHighlight && <div className="text-xs">📞</div>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Timer + Hints bar */}
        <div className="glass-panel rounded-2xl p-3 mt-auto flex flex-col gap-3 border border-amber-300/10">
          {/* Timer */}
          {!showResult && (
            <div className="flex items-center gap-3">
              <div
                className={`text-3xl font-black font-mono ${
                  timerLow ? 'text-red-400 animate-pulse' : 'text-amber-200'
                }`}
              >
                {timer}
              </div>
              <div className="flex-1 h-2 rounded-full bg-black/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    timerLow
                      ? 'bg-red-500'
                      : 'bg-gradient-to-r from-amber-400 to-amber-300'
                  }`}
                  style={{ width: `${timerPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Hints */}
          <div className="grid grid-cols-4 gap-2">
            <HintButton
              icon="50/50"
              label="50/50"
              used={m.hintsUsed.fifty}
              disabled={showResult}
              onClick={() => useHint('fifty')}
            />
            <HintButton
              icon="🏛️"
              label="Зал"
              used={m.hintsUsed.audience}
              disabled={showResult}
              onClick={() => useHint('audience')}
            />
            <HintButton
              icon="📞"
              label="Друг"
              used={m.hintsUsed.friend}
              disabled={showResult}
              onClick={() => useHint('friend')}
            />
            <HintButton
              icon="🔄"
              label="Замена"
              used={!!m.hintsUsed.swap}
              disabled={showResult}
              onClick={() => useHint('swap')}
            />
          </div>
        </div>

        {/* Result banner */}
        {showResult && (
          <div className="text-center py-2 animate-[fadeIn_0.4s_ease-out]">
            {m.lastWasCorrect ? (
              <div className="text-2xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                ✓ ПРАВИЛЬНО! +{formatRub(PRIZE_PYRAMID[level - 1])}
              </div>
            ) : (
              <div className="text-2xl font-black text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                ✗ НЕВЕРНО — игра окончена
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Pyramid({ currentLevel, pyramid }: { currentLevel: number; pyramid: number[] }) {
  // Show levels in descending order (highest at top)
  const levels = useMemo(() => {
    return [...pyramid].map((amt, idx) => ({ level: idx + 1, amount: amt })).reverse();
  }, [pyramid]);

  return (
    <div className="glass-panel rounded-2xl p-2 border border-amber-300/15">
      <div className="flex flex-col gap-0.5">
        {levels.map(({ level, amount }) => {
          const isCurrent = level === currentLevel;
          const isCleared = level < currentLevel;
          const isSafe = level === SAFE_LEVEL;
          let cls = 'text-gray-500';
          if (isSafe) cls = 'text-amber-200 font-bold';
          if (isCleared) cls = 'text-emerald-400/70';
          if (isCurrent) cls =
            'text-[#0a1330] bg-gradient-to-r from-amber-300 to-amber-400 font-black shadow-[0_0_12px_rgba(245,197,24,0.5)]';
          return (
            <div
              key={level}
              className={`flex items-center justify-between px-3 py-1 rounded-md text-xs md:text-sm transition-all ${cls} ${
                isSafe && !isCurrent ? 'border border-amber-300/30' : ''
              }`}
            >
              <span className="font-mono opacity-70">{level}</span>
              <span>{formatRub(amount)}</span>
              <span className="text-[10px] opacity-60">
                {isSafe ? '🛡️' : isCleared ? '✓' : isCurrent ? '◆' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HintButton({
  icon,
  label,
  used,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  used: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isDead = used || disabled;
  return (
    <button
      onClick={onClick}
      disabled={isDead}
      className={`relative rounded-xl px-3 py-2 border-2 transition-all flex flex-col items-center justify-center gap-0.5 ${
        used
          ? 'bg-black/40 border-red-500/30 opacity-50'
          : 'bg-gradient-to-br from-amber-500/20 to-amber-700/10 border-amber-400/40 hover:brightness-125 active:scale-95'
      } ${isDead ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="text-base font-black text-amber-200">{icon}</div>
      <div className="text-[10px] uppercase tracking-wider text-amber-100/80">
        {label}
      </div>
      {used && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-2xl text-red-500/80">✕</div>
        </div>
      )}
    </button>
  );
}

function MillionaireFinish({
  victory,
  sum,
  level,
}: {
  victory: boolean;
  sum: number;
  level: number;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06122c] via-[#091a3a] to-[#0c1e4a] flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full glass-panel-gold rounded-3xl p-8 border border-amber-300/30">
        <div className="text-7xl mb-3">{victory ? '🏆' : '🎬'}</div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent mb-3">
          {victory ? 'МИЛЛИОН ВАШ!' : 'ИГРА ОКОНЧЕНА'}
        </h1>
        <div className="text-amber-100/80 text-sm mb-5">
          Достигнут {level || 0} уровень
        </div>
        <div className="text-5xl font-black text-amber-200 drop-shadow-[0_0_15px_rgba(245,197,24,0.4)] font-mono">
          {formatRub(sum)}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-7 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a1330] font-bold hover:brightness-110 active:scale-95 transition-all"
        >
          🔄 Новая игра
        </button>
      </div>
    </div>
  );
}
