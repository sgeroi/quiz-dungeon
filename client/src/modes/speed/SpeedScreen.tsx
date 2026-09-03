import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';

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

const OPTION_THEMES = [
  // Quizizz-like vivid palette
  { bg: 'from-rose-500 to-pink-600', glow: 'rgba(244,63,94,0.55)', shape: '▲', label: 'A' },
  { bg: 'from-sky-500 to-blue-600', glow: 'rgba(56,189,248,0.55)', shape: '◆', label: 'B' },
  { bg: 'from-amber-400 to-orange-500', glow: 'rgba(251,191,36,0.55)', shape: '●', label: 'C' },
  { bg: 'from-emerald-500 to-green-600', glow: 'rgba(16,185,129,0.55)', shape: '■', label: 'D' },
];

function useSpeedSnapshot(): SpeedSnapshot | null {
  const gameState = useStore((s) => s.gameState);
  const speed = (gameState as unknown as { speed?: SpeedSnapshot } | null)?.speed ?? null;
  return speed;
}

function useNowMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Scoreboard({ snap, players, myId }: {
  snap: SpeedSnapshot;
  players: Record<string, { id: string; name: string; isBot?: boolean }>;
  myId: string;
}) {
  const sorted = useMemo(() => {
    return Object.values(players)
      .map((p) => ({ ...p, score: snap.scores[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [players, snap.scores]);

  return (
    <div className="w-full overflow-x-auto py-2">
      <div className="flex gap-2 min-w-max justify-center">
        {sorted.map((p, i) => {
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[80px] transition-all ${
                isMe
                  ? 'bg-gradient-to-br from-amber-400/30 to-orange-500/20 border border-amber-300/50 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                  : 'glass-panel border border-white/10'
              }`}
            >
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70">
                <span>#{i + 1}</span>
                {p.isBot && <span>🤖</span>}
                {isMe && <span className="text-amber-300">★</span>}
              </div>
              <div className={`text-xs font-semibold truncate max-w-[80px] ${isMe ? 'text-amber-200' : 'text-white'}`}>
                {p.name}
              </div>
              <div className={`text-lg font-black tabular-nums ${
                p.score > 0 ? 'text-emerald-300' : p.score < 0 ? 'text-rose-300' : 'text-gray-300'
              }`}>
                {p.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountdownBar({ startMs, durationMs, paused }: { startMs: number; durationMs: number; paused: boolean }) {
  const now = useNowMs();
  const elapsed = paused ? 0 : Math.max(0, now - startMs);
  const remaining = Math.max(0, durationMs - elapsed);
  const pct = Math.max(0, Math.min(100, (remaining / durationMs) * 100));
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1 opacity-70">
        <span>Время</span>
        <span className="font-mono tabular-nums">{paused ? '—' : `${seconds}с`}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${pct}%`,
            background: pct > 50
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : pct > 25
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(90deg, #ef4444, #f87171)',
            boxShadow: '0 0 12px rgba(255,255,255,0.2)',
          }}
        />
      </div>
    </div>
  );
}

function VictoryView({ snap, players, myId }: {
  snap: SpeedSnapshot;
  players: Record<string, { id: string; name: string; isBot?: boolean }>;
  myId: string;
}) {
  const sorted = useMemo(() => {
    return Object.values(players)
      .map((p) => ({ ...p, score: snap.scores[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [players, snap.scores]);

  const winner = snap.winner ? players[snap.winner] : null;
  const iWon = snap.winner === myId;

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 max-w-lg mx-auto relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,197,24,0.1),transparent_70%)]" />
      <div className="relative flex flex-col items-center w-full">
        <div className="relative mb-4">
          <div className="absolute inset-0 blur-3xl rounded-full bg-amber-400/30" />
          <span className="relative text-8xl drop-shadow-lg" style={{ animation: 'float 3s ease-in-out infinite' }}>
            🏆
          </span>
        </div>
        <h1 className="text-4xl font-black mb-1 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
          {iWon ? 'ПОБЕДА!' : 'ИГРА ОКОНЧЕНА'}
        </h1>
        {winner && (
          <p className="text-amber-200 text-lg font-bold mb-1">
            {iWon ? 'Ты лучший!' : `Победил: ${winner.name}`}
          </p>
        )}
        <p className="text-gray-400 text-sm mb-6">15 раундов пройдено</p>

        <div className="w-full glass-panel rounded-2xl p-4 mb-5">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 py-2 ${i < sorted.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <span className="text-xl w-7 text-center">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <span className={`flex-1 font-medium ${p.id === myId ? 'text-amber-200' : 'text-white'}`}>
                {p.name} {p.isBot ? '🤖' : ''}
              </span>
              <span className={`font-black tabular-nums ${
                p.score > 0 ? 'text-emerald-300' : p.score < 0 ? 'text-rose-300' : 'text-gray-300'
              }`}>
                {p.score}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black text-lg transition-all hover:brightness-110 active:scale-[0.97] shadow-[0_4px_20px_rgba(251,191,36,0.4)]"
        >
          Новая игра
        </button>
      </div>
    </div>
  );
}

export default function SpeedScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);
  const snap = useSpeedSnapshot();
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);

  const players = gameState?.players ?? {};
  const myId = playerId ?? '';

  // Reset visual press when round advances
  useEffect(() => {
    setPressedIdx(null);
  }, [snap?.round, gameState?.phase]);

  if (!gameState || !snap) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Загрузка режима...
      </div>
    );
  }

  if (snap.finished || gameState.phase === 'victory') {
    return <VictoryView snap={snap} players={players} myId={myId} />;
  }

  const phase = gameState.phase;
  const isAnswering = phase === 'answering';
  const isResults = phase === 'results';
  const reveal = isResults && snap.revealCorrectIndex !== null;
  const myAnswer = snap.revealAnswers?.[myId] ?? null;
  const iAlreadyAnswered = snap.answered.includes(myId);

  const handleClick = (idx: number) => {
    if (!isAnswering) return;
    if (iAlreadyAnswered) return;
    if (pressedIdx !== null) return;
    setPressedIdx(idx);
    socket.emit('mode-speed-answer' as any, { optionIdx: idx });
  };

  const firstAnswerer = snap.winnerOnFirst ? players[snap.winnerOnFirst] : null;
  const firstInfo = snap.winnerOnFirst ? snap.revealAnswers?.[snap.winnerOnFirst] : null;

  return (
    <div className="min-h-full flex flex-col p-3 sm:p-5 max-w-3xl mx-auto w-full gap-3">
      {/* Top scoreboard */}
      <Scoreboard snap={snap} players={players} myId={myId} />

      {/* Round + timer */}
      <div className="glass-panel rounded-xl p-3 flex items-center gap-3">
        <div className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500/30 to-purple-600/30 border border-fuchsia-300/30">
          <div className="text-[10px] uppercase tracking-wider opacity-70">Раунд</div>
          <div className="text-base font-black text-fuchsia-200">{snap.round} / {snap.total}</div>
        </div>
        <div className="flex-1">
          <CountdownBar
            startMs={snap.questionStartMs}
            durationMs={10_000}
            paused={isResults}
          />
        </div>
      </div>

      {/* Question */}
      {snap.question && (
        <div
          key={snap.question.id}
          className="glass-panel-gold rounded-2xl p-5 sm:p-6 text-center relative"
          style={{ animation: 'fadeIn 0.4s ease-out' }}
        >
          <div className="text-xs uppercase tracking-wider text-amber-300/70 mb-2">Вопрос</div>
          <div className="text-xl sm:text-2xl font-bold text-white leading-snug">
            {snap.question.text}
          </div>
        </div>
      )}

      {/* Options */}
      {snap.question && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {snap.question.options.map((opt, idx) => {
            const theme = OPTION_THEMES[idx];
            const isCorrect = reveal && snap.revealCorrectIndex === idx;
            const isWrongPicked = reveal && myAnswer?.optionIdx === idx && !myAnswer.correct;
            const isMyPick = pressedIdx === idx || myAnswer?.optionIdx === idx;
            const flash = isMyPick && !reveal;

            const baseGlow = `0 0 24px ${theme.glow}`;

            return (
              <button
                key={idx}
                disabled={!isAnswering || iAlreadyAnswered || pressedIdx !== null}
                onClick={() => handleClick(idx)}
                className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left text-white font-bold text-base sm:text-lg transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed ${
                  reveal && !isCorrect && !isWrongPicked ? 'opacity-40' : ''
                }`}
                style={{
                  background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                  boxShadow: flash
                    ? `${baseGlow}, 0 0 50px ${theme.glow}, inset 0 0 20px rgba(255,255,255,0.3)`
                    : isCorrect
                    ? `0 0 30px rgba(16,185,129,0.7), 0 0 60px rgba(16,185,129,0.4)`
                    : isWrongPicked
                    ? `0 0 30px rgba(244,63,94,0.7)`
                    : baseGlow,
                  transform: flash ? 'scale(1.03)' : undefined,
                }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${theme.bg} ${flash ? 'brightness-125' : ''}`} />
                {/* Sheen */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/20 pointer-events-none" />
                {/* Content */}
                <div className="relative flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-black/30 flex items-center justify-center text-lg sm:text-xl font-black backdrop-blur-sm">
                    <span>{theme.shape}</span>
                  </div>
                  <span className="flex-1 drop-shadow-md">{opt}</span>
                  {reveal && isCorrect && <span className="text-2xl">✓</span>}
                  {reveal && isWrongPicked && <span className="text-2xl">✗</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Status row */}
      <div className="min-h-[60px] flex items-center justify-center">
        {isAnswering && iAlreadyAnswered && snap.winnerOnFirst === myId && !reveal && (
          <div
            className="w-full px-5 py-4 rounded-2xl border-2 border-orange-400/70 bg-gradient-to-br from-rose-600/40 via-orange-500/30 to-amber-500/20 shadow-[0_0_28px_rgba(251,146,60,0.45)] text-center"
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          >
            <div className="text-2xl sm:text-3xl font-black text-orange-200 mb-1 drop-shadow-md">
              ❌ Промахнулся!
            </div>
            <div className="text-base sm:text-lg font-bold text-amber-100">
              Ты ещё можешь ответить, но без бонуса за скорость.
            </div>
          </div>
        )}
        {isAnswering && iAlreadyAnswered && snap.winnerOnFirst !== myId && !reveal && (
          <div className="text-sm text-gray-400 italic">
            Ты ответил. Ждём остальных...
          </div>
        )}
        {isAnswering && !iAlreadyAnswered && snap.winnerOnFirst && snap.winnerOnFirst !== myId && (
          <div className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200 text-sm">
            <span className="font-bold">{firstAnswerer?.name}</span> промахнулся! Ты ещё можешь ответить (без бонуса).
          </div>
        )}
        {reveal && (
          <div className="w-full text-center" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {firstAnswerer ? (
              <div className="inline-block px-4 py-2 rounded-xl glass-panel">
                <span className="text-xs uppercase tracking-wider opacity-70 mr-2">Первый:</span>
                <span className="font-bold text-amber-200">{firstAnswerer.name}</span>
                <span className={`ml-2 font-black ${firstInfo?.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {firstInfo?.correct ? `+${firstInfo.delta}` : `${firstInfo?.delta ?? 0}`}
                </span>
                <span className="ml-1 text-sm">{firstInfo?.correct ? '✓' : '✗'}</span>
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">Никто не успел ответить</div>
            )}
            {myAnswer && snap.winnerOnFirst !== myId && (
              <div className="mt-2 text-sm">
                Твой ответ:{' '}
                <span className={`font-black ${myAnswer.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {myAnswer.delta > 0 ? `+${myAnswer.delta}` : myAnswer.delta}
                </span>{' '}
                {myAnswer.correct ? '✓' : '✗'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
