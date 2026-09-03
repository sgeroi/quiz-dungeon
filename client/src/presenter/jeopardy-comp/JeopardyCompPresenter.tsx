// TV presenter for the 'jeopardy-comp' mode («Своя игра (PvP)»).
// Reads only room-broadcast data: gameState.jeopardy (publicJ snapshot from the
// server handler) and gameState.timer. Never shows action buttons; the correct
// answer is shown only once the server sends `reveal`.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { GAME_MODES } from '../../types';
import type { GameState, Player, Team } from '../../types';
import { PresenterTimer } from '../DefaultPresenter';
import TeamBadge from '../../components/TeamBadge';

interface PublicCell {
  value: number;
}

interface OpenCell {
  topicIdx: number;
  valueIdx: number;
  topic: string;
  value: number;
  text: string;
  options: string[];
}

interface Reveal {
  correctIndex: number;
  chosenIndex: number | null;
  correct: boolean;
}

interface JeopardyPublic {
  grid: { topics: string[]; cells: Record<string, PublicCell[]> };
  played: string[];
  captainId: string | null;
  captainTeamId?: string | null;
  scores: Record<string, number>;
  /** teams-format only: teamId -> total. */
  teamScores?: Record<string, number> | null;
  currentCell: OpenCell | null;
  buzzerOpen: boolean;
  currentAnswererId: string | null;
  blockedIds: string[];
  blockedTeamIds?: string[];
  reveal: Reveal | null;
  message: string | null;
  answerTimeSec: number;
  buzzWindowSec: number;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MODE = GAME_MODES.find((m) => m.id === 'jeopardy');
const MODE_NAME = MODE?.name ?? 'Своя игра (PvP)';
const MODE_EMOJI = MODE?.emoji ?? '🎲';

function getJeopardy(gs: GameState | null): JeopardyPublic | null {
  if (!gs) return null;
  const j = (gs as unknown as { jeopardy?: JeopardyPublic }).jeopardy;
  if (!j || !j.grid || !Array.isArray(j.grid.topics)) return null;
  return j;
}

export default function JeopardyCompPresenter() {
  const gameState = useStore((s) => s.gameState);
  const j = getJeopardy(gameState);

  // Re-mount the status line on every new message so the fade-in replays.
  const [messageKey, setMessageKey] = useState(0);
  useEffect(() => {
    if (j?.message) setMessageKey((k) => k + 1);
  }, [j?.message]);

  const board = useMemo(() => {
    if (!j || !gameState) return [];
    return Object.values(gameState.players)
      .map((p) => ({
        player: p,
        score: j.scores[p.id] ?? 0,
        isCaptain: p.id === j.captainId,
        isAnswerer: p.id === j.currentAnswererId,
        isBlocked: j.blockedIds.includes(p.id),
      }))
      .sort((a, b) => b.score - a.score);
  }, [j, gameState]);

  const isTeams = gameState?.teamMode === 'teams' && (gameState.teams?.length ?? 0) > 0;
  const teamBoard = useMemo(() => {
    if (!isTeams || !j || !gameState) return [];
    const ts = j.teamScores ?? {};
    return gameState.teams
      .map((team) => ({
        team,
        score: ts[team.id] ?? 0,
        isCaptain: team.id === j.captainTeamId,
        isBlocked: !!j.blockedTeamIds?.includes(team.id),
        hasAnswerer: !!j.currentAnswererId && gameState.players[j.currentAnswererId]?.teamId === team.id,
        members: Object.values(gameState.players).filter((p) => p.teamId === team.id),
      }))
      .filter((r) => r.members.length > 0)
      .sort((a, b) => b.score - a.score);
  }, [isTeams, j, gameState]);

  if (!gameState || !j) {
    return <Preparing />;
  }

  const players = gameState.players;
  const captainName = j.captainId ? players[j.captainId]?.name ?? '—' : '—';
  const answererName = j.currentAnswererId ? players[j.currentAnswererId]?.name ?? '—' : null;
  const cell = j.currentCell;
  const reveal = j.reveal;
  const playedCount = j.played.length;
  const totalCells = j.grid.topics.length * 5;
  // The server broadcasts the picked cell before it sets maxTimer (only
  // timer-tick follows), so fall back to the window lengths from the snapshot.
  const maxTimer = answererName
    ? gameState.maxTimer || j.answerTimeSec
    : j.buzzerOpen
      ? j.buzzWindowSec || gameState.maxTimer
      : gameState.maxTimer;
  const timerActive = !!cell && !reveal && maxTimer > 0;

  return (
    <div className="h-full flex gap-8 px-10 pb-8 pt-2 min-h-0">
      {/* Main column: status + grid / question */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 min-h-0">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
              {MODE_EMOJI} {MODE_NAME} · сыграно {playedCount} из {totalCells}
            </div>
            <StatusLine
              key={messageKey}
              cell={cell}
              reveal={reveal}
              buzzerOpen={j.buzzerOpen}
              answererName={answererName}
              captainName={captainName}
              message={j.message}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {cell ? (
            <QuestionPanel cell={cell} reveal={reveal} buzzerOpen={j.buzzerOpen} answererName={answererName} />
          ) : (
            <Grid j={j} />
          )}
        </div>
      </div>

      {/* Side column: timer + scoreboard */}
      <aside className="w-[460px] shrink-0 flex flex-col gap-5 min-h-0">
        <div className="glass-panel px-6 py-4 flex items-center justify-between min-h-[150px]">
          {timerActive ? (
            <>
              <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] leading-tight">
                {answererName ? <>Время<br />на ответ</> : <>Кто<br />первый?</>}
              </div>
              <PresenterTimer timer={Math.min(gameState.timer, maxTimer)} maxTimer={maxTimer} />
            </>
          ) : (
            <div className="w-full text-center">
              <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Капитан</div>
              <div className="text-[40px] font-black text-[var(--color-dungeon-gold)] truncate leading-tight">👑 {captainName}</div>
            </div>
          )}
        </div>

        <div className="glass-panel p-5 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {isTeams ? 'Табло команд' : 'Табло'}
          </div>
          <div className="flex flex-col gap-2.5 overflow-hidden">
            {isTeams
              ? teamBoard.map((r) => (
                  <TeamRow
                    key={r.team.id}
                    team={r.team}
                    score={r.score}
                    isCaptain={r.isCaptain}
                    hasAnswerer={r.hasAnswerer}
                    isBlocked={r.isBlocked}
                    members={r.members}
                    captainId={j.captainId}
                    answererId={j.currentAnswererId}
                    blockedIds={j.blockedIds}
                    compact={teamBoard.length > 2}
                  />
                ))
              : board.map(({ player, score, isCaptain, isAnswerer, isBlocked }) => (
              <ScoreRow
                key={player.id}
                player={player}
                score={score}
                isCaptain={isCaptain}
                isAnswerer={isAnswerer}
                isBlocked={isBlocked}
                compact={board.length > 6}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ==================== Pieces ====================

function Preparing() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
      <div className="text-[96px] leading-none">{MODE_EMOJI}</div>
      <div className="text-[64px] font-black leading-tight">{MODE_NAME}</div>
      <div className="text-[36px] font-bold text-[var(--color-dungeon-gold)] animate-pulse">Готовимся…</div>
    </div>
  );
}

function StatusLine({
  cell,
  reveal,
  buzzerOpen,
  answererName,
  captainName,
  message,
}: {
  cell: OpenCell | null;
  reveal: Reveal | null;
  buzzerOpen: boolean;
  answererName: string | null;
  captainName: string;
  message: string | null;
}) {
  let text: string;
  let cls = 'text-white';
  if (!cell) {
    text = `Выбирает: ${captainName}`;
    cls = 'text-[var(--color-dungeon-gold)]';
  } else if (reveal) {
    text = reveal.correct ? `✓ Правильно! ${message ?? ''}` : reveal.chosenIndex === null && !answererName ? (message ?? 'Никто не ответил') : `✗ Неверно. ${message ?? ''}`;
    cls = reveal.correct ? 'text-[var(--color-dungeon-heal)]' : 'text-[#FF6B6B]';
  } else if (answererName) {
    text = `Отвечает: ${answererName}`;
    cls = 'text-[var(--color-dungeon-gold)]';
  } else if (buzzerOpen) {
    text = 'Кто первый? Жми на баззер!';
    cls = 'text-[var(--color-dungeon-accent)] animate-pulse';
  } else {
    text = 'Секунду…';
    cls = 'text-[var(--color-dungeon-muted)]';
  }
  return (
    <div
      className={`text-[44px] font-black leading-tight truncate ${cls}`}
      style={{ animation: 'fadeIn 0.3s ease-out' }}
    >
      {text}
    </div>
  );
}

function Grid({ j }: { j: JeopardyPublic }) {
  const topics = j.grid.topics;
  return (
    <div
      className="h-full grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, topics.length)}, minmax(0, 1fr))`,
        gridTemplateRows: 'minmax(0, 0.9fr) repeat(5, minmax(0, 1fr))',
      }}
    >
      {topics.map((topic) => (
        <div
          key={`t-${topic}`}
          className="flex items-center justify-center text-center rounded-2xl px-3 bg-[var(--color-dungeon-surface-2)] border border-[var(--color-dungeon-purple)]/40"
        >
          <span className="text-[22px] font-extrabold uppercase tracking-wide leading-tight text-[var(--color-dungeon-purple)] line-clamp-3">
            {topic}
          </span>
        </div>
      ))}
      {[0, 1, 2, 3, 4].map((valueIdx) =>
        topics.map((topic, topicIdx) => {
          const c = j.grid.cells[topic]?.[valueIdx];
          const key = `${topicIdx},${valueIdx}`;
          const played = j.played.includes(key);
          return (
            <div
              key={`c-${key}`}
              className={`flex items-center justify-center rounded-2xl border transition-all ${
                played
                  ? 'bg-black/30 border-white/5'
                  : 'bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-gold)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(255,219,16,0.08)]'
              }`}
            >
              <span
                className={`text-[56px] font-black tabular-nums leading-none ${
                  played ? 'text-white/10' : 'text-[var(--color-dungeon-gold)]'
                }`}
              >
                {played ? '·' : c?.value ?? ''}
              </span>
            </div>
          );
        }),
      )}
    </div>
  );
}

function QuestionPanel({
  cell,
  reveal,
  buzzerOpen,
  answererName,
}: {
  cell: OpenCell;
  reveal: Reveal | null;
  buzzerOpen: boolean;
  answererName: string | null;
}) {
  const longText = cell.text.length > 140;
  return (
    <div className="h-full flex flex-col justify-center gap-6 min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header chips */}
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-[var(--color-dungeon-purple)]/20 border border-[var(--color-dungeon-purple)]/50 px-6 py-2 text-[24px] font-extrabold uppercase tracking-wider text-[var(--color-dungeon-purple)]">
          {cell.topic}
        </span>
        <span className="rounded-full bg-[var(--color-dungeon-gold)] px-6 py-2 text-[28px] font-black tabular-nums text-[var(--color-dungeon-gold-fg)]">
          {cell.value}
        </span>
        {!reveal && buzzerOpen && !answererName && (
          <span
            className="ml-auto flex items-center gap-3 rounded-full px-6 py-2 text-[24px] font-black uppercase tracking-wider text-white"
            style={{ background: 'radial-gradient(circle at 35% 30%, #ff5263 0%, #c0203a 60%, #7c0d22 100%)', animation: 'pulse 1.2s ease-in-out infinite' }}
          >
            ● Баззер открыт
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="glass-panel-gold px-10 py-8 flex items-center justify-center text-center">
        <div className={`${longText ? 'text-[40px]' : 'text-[50px]'} font-extrabold leading-[1.15]`}>{cell.text}</div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-5">
        {cell.options.map((opt, i) => {
          const isCorrect = !!reveal && reveal.correctIndex === i;
          const isWrongChosen = !!reveal && reveal.chosenIndex === i && !reveal.correct;
          const dim = !!reveal && !isCorrect && !isWrongChosen;
          return (
            <div
              key={i}
              className={`flex items-center gap-5 rounded-3xl px-7 py-5 min-h-[150px] border transition-all ${
                isCorrect
                  ? 'bg-[var(--color-dungeon-heal)]/20 border-[var(--color-dungeon-heal)] shadow-[0_0_40px_rgba(141,255,133,0.35)]'
                  : isWrongChosen
                    ? 'bg-[#FF4848]/20 border-[#FF4848] shadow-[0_0_30px_rgba(255,72,72,0.35)]'
                    : dim
                      ? 'bg-white/[0.03] border-white/5 opacity-40'
                      : 'bg-white/[0.06] border-white/10'
              }`}
              style={isWrongChosen ? { animation: 'shake 0.4s' } : undefined}
            >
              <span
                className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl text-[32px] font-black ${
                  isCorrect
                    ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]'
                    : isWrongChosen
                      ? 'bg-[#FF4848] text-white'
                      : 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'
                }`}
              >
                {LETTERS[i] ?? i + 1}
              </span>
              <span className="text-[32px] font-bold leading-tight">{opt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** teams-format board row: team badge + total, roster with status marks underneath. */
function TeamRow({
  team,
  score,
  isCaptain,
  hasAnswerer,
  isBlocked,
  members,
  captainId,
  answererId,
  blockedIds,
  compact,
}: {
  team: Team;
  score: number;
  isCaptain: boolean;
  hasAnswerer: boolean;
  isBlocked: boolean;
  members: Player[];
  captainId: string | null;
  answererId: string | null;
  blockedIds: string[];
  compact: boolean;
}) {
  const scoreCls = score > 0 ? 'text-[var(--color-dungeon-gold)]' : score < 0 ? 'text-[#FF6B6B]' : 'text-white/60';
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border px-4 ${compact ? 'py-2.5' : 'py-4'} transition-all ${
        hasAnswerer ? 'shadow-[0_0_24px_rgba(255,219,16,0.3)]' : ''
      } ${isBlocked ? 'opacity-45' : ''}`}
      style={{
        backgroundColor: hasAnswerer ? `${team.color}26` : `${team.color}12`,
        borderColor: hasAnswerer || isCaptain ? team.color : `${team.color}66`,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="w-[36px] text-center text-[26px] shrink-0">{hasAnswerer ? '🎤' : isCaptain ? '👑' : isBlocked ? '✗' : ''}</span>
        <TeamBadge team={team} size={compact ? 'md' : 'lg'} />
        <span className={`ml-auto shrink-0 font-black tabular-nums ${compact ? 'text-[34px]' : 'text-[44px]'} ${scoreCls}`}>{score}</span>
      </div>
      <div className={`flex flex-wrap gap-x-4 gap-y-1 pl-[48px] ${compact ? 'text-[20px]' : 'text-[24px]'} font-bold text-white/80`}>
        {members.map((m) => {
          const mark = m.id === answererId ? '🎤' : m.id === captainId ? '👑' : blockedIds.includes(m.id) ? '✗' : m.isBot ? '🤖' : '';
          const dim = blockedIds.includes(m.id) && m.id !== answererId;
          return (
            <span key={m.id} className={`truncate max-w-[200px] ${dim ? 'opacity-50 line-through' : ''}`}>
              {mark && <span className="mr-1">{mark}</span>}
              {m.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ScoreRow({
  player,
  score,
  isCaptain,
  isAnswerer,
  isBlocked,
  compact,
}: {
  player: Player;
  score: number;
  isCaptain: boolean;
  isAnswerer: boolean;
  isBlocked: boolean;
  compact: boolean;
}) {
  const scoreCls = score > 0 ? 'text-[var(--color-dungeon-gold)]' : score < 0 ? 'text-[#FF6B6B]' : 'text-white/60';
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 ${compact ? 'py-1.5' : 'py-3'} transition-all ${
        isAnswerer
          ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)] shadow-[0_0_24px_rgba(255,219,16,0.3)]'
          : 'bg-white/5 border-white/10'
      } ${isBlocked ? 'opacity-45' : ''}`}
    >
      <span className="w-[36px] text-center text-[26px] shrink-0">
        {isAnswerer ? '🎤' : isCaptain ? '👑' : isBlocked ? '✗' : player.isBot ? '🤖' : ''}
      </span>
      <span className={`flex-1 min-w-0 truncate font-extrabold ${compact ? 'text-[24px]' : 'text-[28px]'}`}>{player.name}</span>
      <span className={`shrink-0 font-black tabular-nums ${compact ? 'text-[30px]' : 'text-[36px]'} ${scoreCls}`}>{score}</span>
    </div>
  );
}
