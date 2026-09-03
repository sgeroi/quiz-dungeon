import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import type { Player, Team, TeamMode } from '../../types';
import TeamBadge from '../../components/TeamBadge';

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
interface HintsUsed { fifty: boolean; audience: boolean; friend: boolean; swap: boolean }
type ContestantStatus = 'playing' | 'out' | 'won';
interface ContestantView {
  id: string;
  status: ContestantStatus;
  hintsUsed: HintsUsed;
  fiftyEliminated: number[];
  audience: AudienceData | null;
  friend: FriendData | null;
  answeredIds: string[];
  votes: Record<string, number>;
  answerIndex: number | null;
  lastWasCorrect: boolean | null;
  sum: number;
  finalLevel: number;
}
interface MillionaireSnapshot {
  teamMode?: TeamMode;
  level: number;
  hintsUsed: HintsUsed;
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
  contestants?: Record<string, ContestantView>;
  scores?: Record<string, number>;
  teamScores?: Record<string, number>;
  playingCount?: number;
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

/** Contestant view from the snapshot; for old snapshots (no contestants) — synthesized from top-level fields. */
function myContestant(m: MillionaireSnapshot, mode: TeamMode, myId: string, myTeamId: string | undefined): ContestantView | null {
  const key = mode === 'ffa' ? myId : mode === 'teams' ? (myTeamId ?? '') : 'all';
  const c = m.contestants?.[key];
  if (c) return c;
  if (mode !== 'coop') return null;
  return {
    id: 'all',
    status: 'playing',
    hintsUsed: m.hintsUsed,
    fiftyEliminated: m.fiftyEliminated,
    audience: m.audience,
    friend: m.friend,
    answeredIds: [],
    votes: {},
    answerIndex: m.lastAnswerIndex,
    lastWasCorrect: m.lastWasCorrect,
    sum: m.finalSum,
    finalLevel: m.finalLevel,
  };
}

export default function MillionaireScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);
  const phase = gameState?.phase;
  const m = (gameState as any)?.millionaire as MillionaireSnapshot | undefined;

  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [showFriend, setShowFriend] = useState(false);

  const myId = playerId ?? '';
  const me: Player | undefined = gameState?.players[myId];
  const mode: TeamMode = m?.teamMode ?? gameState?.teamMode ?? 'coop';
  const mine = m ? myContestant(m, mode, myId, me?.teamId) : null;

  // Reset local UI on new question
  useEffect(() => {
    if (phase === 'answering') {
      setPickedIndex(null);
      setShowFriend(false);
    }
  }, [phase, m?.question?.id]);

  // Auto-show friend dialog when friend hint is used
  useEffect(() => {
    if (mine?.friend) setShowFriend(true);
  }, [mine?.friend?.text]);

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
        sum={mine?.sum ?? m?.finalSum ?? 0}
        level={mine?.finalLevel ?? m?.finalLevel ?? 0}
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
  const pyramid = m.pyramid?.length ? m.pyramid : PRIZE_PYRAMID;
  const showResult = phase === 'results';
  const correctIdx = m.revealCorrectIndex;
  const timer = gameState.timer;
  const maxTimer = gameState.maxTimer || 30;
  const timerPct = Math.max(0, Math.min(100, (timer / maxTimer) * 100));
  const timerLow = timer <= 5;

  const myTeam: Team | undefined = mode === 'teams' ? gameState.teams?.find((t) => t.id === me?.teamId) : undefined;
  const isOut = !!mine && mine.status !== 'playing';
  const spectator = !mine || isOut;
  const hints: HintsUsed = mine?.hintsUsed ?? m.hintsUsed;
  const eliminated = mine?.fiftyEliminated ?? [];
  const audience = mine?.audience ?? null;
  const friend = mine?.friend ?? null;
  const myVote = mine?.votes?.[myId];
  const lastIdx = showResult ? (mine?.answerIndex ?? null) : null;
  const alreadyVoted = pickedIndex !== null || myVote !== undefined;
  // In teams the round is "locked" for me once I voted; the contestant answer comes later.
  const locked = spectator || showResult || alreadyVoted;

  const onPick = (i: number) => {
    if (locked) return;
    if (eliminated.includes(i)) return;
    setPickedIndex(i);
    socket.emit('mode-millionaire-answer' as any, i);
  };

  const useHint = (hint: 'fifty' | 'audience' | 'friend' | 'swap') => {
    if (locked) return;
    socket.emit('mode-millionaire-hint' as any, hint);
  };

  // Teammates' votes (teams) — shown during answering so the team can coordinate.
  const teammates: Player[] = mode === 'teams' && myTeam
    ? Object.values(gameState.players).filter((p) => p.teamId === myTeam.id)
    : [];

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
          <div className="text-xs text-amber-200/60 mt-1 tracking-widest flex items-center justify-center gap-2">
            <span>ВОПРОС {level} ИЗ {pyramid.length}</span>
            {mode === 'ffa' && <span className="text-amber-200/40">· ЛИЧНЫЙ ЗАЧЁТ</span>}
            {myTeam && <TeamBadge team={myTeam} size="sm" />}
          </div>
        </div>

        {/* Out-of-game banner */}
        {isOut && mine && (
          <div className={`rounded-2xl px-4 py-3 text-center border ${mine.status === 'won' ? 'border-amber-300/50 bg-amber-300/10' : 'border-red-400/30 bg-red-500/10'}`}>
            <div className={`text-lg font-black ${mine.status === 'won' ? 'text-amber-200' : 'text-red-300'}`}>
              {mine.status === 'won' ? '🏆 Миллион взят!' : mode === 'teams' ? '✗ Команда выбыла' : '✗ Вы выбыли'}
            </div>
            <div className="text-sm text-white/70">
              {mode === 'teams' ? 'Ваш выигрыш' : 'Ваш выигрыш'}: <span className="font-mono font-bold text-amber-200">{formatRub(mine.sum)}</span> · дальше наблюдаете
            </div>
          </div>
        )}

        {/* Pyramid — own / team (contestant's own level: current room level while playing, final level when out) */}
        <Pyramid
          currentLevel={mine && mine.status !== 'playing' ? mine.finalLevel + 1 : level}
          stopped={isOut}
          pyramid={pyramid}
        />

        {/* Others (ffa / teams) */}
        {mode !== 'coop' && m.contestants && (
          <OthersStrip
            mode={mode}
            contestants={m.contestants}
            players={gameState.players}
            teams={gameState.teams ?? []}
            myKey={mine?.id ?? ''}
            showResult={showResult}
            correctIdx={correctIdx}
          />
        )}

        {/* Question */}
        <div className="glass-panel-gold rounded-2xl px-5 py-5 text-center border border-amber-300/20 shadow-[0_0_30px_rgba(245,197,24,0.08)]">
          <div className="text-base md:text-xl text-white font-semibold leading-snug">
            {m.question?.text ?? '...'}
          </div>
        </div>

        {/* Audience hint result */}
        {audience && (
          <div className="glass-panel rounded-2xl p-3 border border-blue-400/30">
            <div className="text-xs text-blue-200/80 text-center mb-2 font-bold tracking-wider uppercase">
              📊 Результаты голосования зала
            </div>
            <div className="flex items-end justify-around gap-3 h-24">
              {audience.percents.map((pct, i) => {
                const gone = eliminated.includes(i);
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div className="text-xs font-mono text-amber-200">
                      {gone ? '—' : `${pct}%`}
                    </div>
                    <div className="w-full bg-black/30 rounded-t h-full flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t transition-all duration-700 ${
                          gone
                            ? 'bg-gray-500/30'
                            : 'bg-gradient-to-t from-amber-400 to-amber-300'
                        }`}
                        style={{ height: gone ? '4%' : `${Math.max(4, pct)}%` }}
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
        {showFriend && friend && (
          <div className="glass-panel rounded-2xl p-3 border border-emerald-400/30 flex items-start gap-3">
            <div className="text-3xl">📞</div>
            <div className="flex-1">
              <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
                Звонок другу
              </div>
              <div className="text-sm text-white">{friend.text}</div>
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
            const gone = eliminated.includes(i);
            const isMyPick = pickedIndex === i || myVote === i;
            const isPicked = lastIdx === i || isMyPick;
            const isCorrect = showResult && correctIdx === i;
            const isWrong = showResult && lastIdx === i && correctIdx !== i;
            const friendHighlight = !showResult && friend?.suggestionIndex === i;
            const votersHere = teammates.filter((p) => mine?.votes?.[p.id] === i);

            let stateClasses = `bg-gradient-to-br ${LETTER_COLORS[i]} hover:brightness-125`;
            if (spectator && !showResult) stateClasses = `bg-gradient-to-br ${LETTER_COLORS[i]} opacity-60`;
            if (gone) stateClasses = 'bg-black/30 border-white/5 opacity-30';
            if (isCorrect) stateClasses = 'bg-gradient-to-br from-green-400 to-emerald-600 border-green-300 animate-pulse';
            if (isWrong) stateClasses = 'bg-gradient-to-br from-red-500 to-red-700 border-red-300 animate-[shake_0.4s]';
            if (!showResult && isPicked) stateClasses = 'bg-gradient-to-br from-amber-300 to-amber-500 border-amber-200 animate-pulse';

            return (
              <button
                key={i}
                disabled={gone || locked}
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
                    {gone ? '—' : opt}
                  </div>
                  {friendHighlight && <div className="text-xs">📞</div>}
                  {votersHere.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-end max-w-[45%]">
                      {votersHere.map((p) => (
                        <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/40 border border-white/15 text-white/80">
                          {p.id === myId ? 'вы' : p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Team vote status */}
        {mode === 'teams' && !showResult && !spectator && mine && (
          <div className="text-center text-xs text-white/60">
            {alreadyVoted
              ? `Голос принят · проголосовали ${mine.answeredIds.length} из ${teammates.length} — ответ команды по большинству`
              : `Голосуйте: проголосовали ${mine.answeredIds.length} из ${teammates.length}`}
          </div>
        )}

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

          {/* Hints (swap only in coop — everyone shares one question in ffa/teams) */}
          {!spectator && (
            <div className={`grid gap-2 ${mode === 'coop' ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <HintButton
                icon="50/50"
                label="50/50"
                used={hints.fifty}
                disabled={locked}
                onClick={() => useHint('fifty')}
              />
              <HintButton
                icon="🏛️"
                label="Зал"
                used={hints.audience}
                disabled={locked}
                onClick={() => useHint('audience')}
              />
              <HintButton
                icon="📞"
                label="Друг"
                used={hints.friend}
                disabled={locked}
                onClick={() => useHint('friend')}
              />
              {mode === 'coop' && (
                <HintButton
                  icon="🔄"
                  label="Замена"
                  used={!!hints.swap}
                  disabled={locked}
                  onClick={() => useHint('swap')}
                />
              )}
            </div>
          )}
        </div>

        {/* Result banner */}
        {showResult && mine && !(isOut && mine.lastWasCorrect === null) && (
          <div className="text-center py-2 animate-[fadeIn_0.4s_ease-out]">
            {mine.lastWasCorrect ? (
              <div className="text-2xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                ✓ ПРАВИЛЬНО! +{formatRub(pyramid[level - 1])}
              </div>
            ) : mine.lastWasCorrect === false ? (
              <div className="text-2xl font-black text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                {mine.answerIndex === null ? '⏱ ВРЕМЯ ВЫШЛО' : '✗ НЕВЕРНО'}{mode === 'coop' ? ' — игра окончена' : ' — вы выбыли'}
              </div>
            ) : null}
          </div>
        )}
        {showResult && spectator && mine?.lastWasCorrect === null && (
          <div className="text-center text-sm text-white/60">
            Правильный ответ: <span className="font-black text-green-400">{correctIdx !== null ? LETTERS[correctIdx] : '?'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Pyramid({ currentLevel, pyramid, stopped }: { currentLevel: number; pyramid: number[]; stopped?: boolean }) {
  // Show levels in descending order (highest at top)
  const levels = useMemo(() => {
    return [...pyramid].map((amt, idx) => ({ level: idx + 1, amount: amt })).reverse();
  }, [pyramid]);

  return (
    <div className={`glass-panel rounded-2xl p-2 border border-amber-300/15 ${stopped ? 'opacity-60' : ''}`}>
      <div className="flex flex-col gap-0.5">
        {levels.map(({ level, amount }) => {
          const isCurrent = level === currentLevel && !stopped;
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

/** Compact status of the other contestants (ffa: players, teams: teams). */
function OthersStrip({
  mode,
  contestants,
  players,
  teams,
  myKey,
  showResult,
  correctIdx,
}: {
  mode: TeamMode;
  contestants: Record<string, ContestantView>;
  players: Record<string, Player>;
  teams: Team[];
  myKey: string;
  showResult: boolean;
  correctIdx: number | null;
}) {
  const rows = Object.values(contestants)
    .filter((c) => c.id !== myKey)
    .map((c) => {
      const team = mode === 'teams' ? teams.find((t) => t.id === c.id) : undefined;
      const player = mode === 'ffa' ? players[c.id] : undefined;
      const name = team?.name ?? player?.name ?? c.id;
      return { c, team, player, name };
    })
    .sort((a, b) => b.c.sum - a.c.sum);
  if (rows.length === 0) return null;
  return (
    <div className="glass-panel rounded-2xl px-3 py-2 border border-white/10">
      <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">
        {mode === 'teams' ? 'Другие команды' : 'Соперники'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(({ c, team, player, name }) => {
          let status = '';
          if (c.status === 'won') status = '🏆';
          else if (c.status === 'out') status = '✗';
          else if (showResult) status = c.lastWasCorrect ? '✓' : c.answerIndex === null ? '⏱' : `✗ ${LETTERS[c.answerIndex]}`;
          else status = c.answeredIds.length > 0 ? '…✓' : '…';
          const wrong = showResult && c.status === 'playing' && c.lastWasCorrect === false && correctIdx !== null;
          return (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                c.status === 'out' ? 'opacity-50 border-white/10' : wrong ? 'border-red-400/40' : 'border-white/15'
              }`}
              style={team ? { borderColor: `${team.color}80`, color: team.color } : undefined}
            >
              {team ? <TeamBadge team={team} size="sm" iconOnly /> : <span className="text-white/90">{player?.isBot ? '🤖 ' : ''}{name}</span>}
              {team && <span>{name}</span>}
              <span className="font-mono text-amber-200/90">{formatRub(c.sum)}</span>
              <span className="opacity-80">{status}</span>
            </span>
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
