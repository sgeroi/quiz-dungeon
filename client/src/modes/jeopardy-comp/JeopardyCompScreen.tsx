import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';

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
  scores: Record<string, number>;
  currentCell: OpenCell | null;
  buzzerOpen: boolean;
  currentAnswererId: string | null;
  blockedIds: string[];
  reveal: Reveal | null;
  message: string | null;
  answerTimeSec: number;
  buzzWindowSec: number;
}

const JEOPARDY_BLUE = '#0b1c5f';
const JEOPARDY_BLUE_LIGHT = '#163ea8';
const JEOPARDY_GOLD = '#f5c518';

function getJeopardy(gameState: unknown): JeopardyPublic | null {
  if (!gameState || typeof gameState !== 'object') return null;
  const j = (gameState as { jeopardy?: JeopardyPublic }).jeopardy;
  if (!j || !j.grid) return null;
  return j;
}

export default function JeopardyCompScreen() {
  const gameState = useStore((s) => s.gameState);
  const myId = useStore((s) => s.playerId);

  const j = getJeopardy(gameState);

  const [bannerKey, setBannerKey] = useState(0);
  useEffect(() => {
    if (j?.message) setBannerKey((k) => k + 1);
  }, [j?.message]);

  const sortedScores = useMemo(() => {
    if (!j || !gameState) return [];
    return Object.entries(j.scores)
      .map(([id, score]) => ({
        id,
        score,
        name: gameState.players[id]?.name ?? '???',
        isMe: id === myId,
        isCaptain: id === j.captainId,
      }))
      .sort((a, b) => b.score - a.score);
  }, [j, gameState, myId]);

  if (!gameState || !j) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 bg-[#08123a]">
        Загрузка режима «Своя игра»...
      </div>
    );
  }

  const captainName = j.captainId ? gameState.players[j.captainId]?.name ?? '???' : '—';
  const isCaptain = j.captainId === myId;
  const isAnswerer = j.currentAnswererId === myId;
  const amBlocked = !!myId && j.blockedIds.includes(myId);
  const canBuzz = !!j.currentCell && j.buzzerOpen && !amBlocked && !isAnswerer && !j.reveal;

  const handlePick = (topicIdx: number, valueIdx: number) => {
    if (!isCaptain || j.currentCell) return;
    const key = `${topicIdx},${valueIdx}`;
    if (j.played.includes(key)) return;
    socket.emit('mode-jeopardy-pick', { topicIdx, valueIdx });
  };

  const handleBuzz = () => {
    if (!canBuzz) return;
    socket.emit('mode-jeopardy-buzz');
  };

  const handleAnswer = (idx: number) => {
    if (!isAnswerer || j.reveal) return;
    socket.emit('mode-jeopardy-answer', idx);
  };

  return (
    <div
      className="min-h-full w-full flex flex-col"
      style={{
        background: `radial-gradient(ellipse at top, ${JEOPARDY_BLUE_LIGHT} 0%, ${JEOPARDY_BLUE} 50%, #050a26 100%)`,
        color: '#fff',
      }}
    >
      {/* Scoreboard */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex flex-wrap gap-2 justify-center">
          {sortedScores.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                p.isMe
                  ? 'border-yellow-300/70 bg-yellow-300/10'
                  : 'border-white/10 bg-white/5'
              }`}
              style={{ minWidth: 110 }}
            >
              {p.isCaptain && <span className="text-yellow-300 text-sm">👑</span>}
              <span className="text-sm font-medium truncate max-w-[110px]">{p.name}</span>
              <span
                className={`font-mono font-bold ml-auto ${
                  p.score > 0 ? 'text-yellow-300' : p.score < 0 ? 'text-red-400' : 'text-gray-300'
                }`}
              >
                {p.score}
              </span>
            </div>
          ))}
        </div>
        <div className="text-center mt-2 text-sm text-yellow-200/80">
          Капитан раунда: <span className="font-bold text-yellow-300">{captainName}</span>
          {isCaptain && !j.currentCell && (
            <span className="ml-2 text-yellow-300/90">— выбери клетку!</span>
          )}
        </div>
      </div>

      {/* Banner / message */}
      {j.message && !j.currentCell && (
        <div key={bannerKey} className="text-center py-1 text-yellow-200 text-sm animate-pulse">
          {j.message}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 px-3 sm:px-6 pb-4 overflow-y-auto">
        <div
          className="grid gap-1.5 sm:gap-2 mx-auto max-w-5xl"
          style={{
            gridTemplateColumns: `repeat(${j.grid.topics.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Topic headers */}
          {j.grid.topics.map((topic) => (
            <div
              key={`t-${topic}`}
              className="flex items-center justify-center text-center font-bold uppercase tracking-wider text-xs sm:text-base py-2 sm:py-3 rounded"
              style={{
                background: JEOPARDY_BLUE,
                color: JEOPARDY_GOLD,
                border: `2px solid ${JEOPARDY_GOLD}`,
                textShadow: '0 1px 0 rgba(0,0,0,0.5)',
              }}
            >
              {topic}
            </div>
          ))}

          {/* Value cells, 5 rows */}
          {[0, 1, 2, 3, 4].map((valueIdx) =>
            j.grid.topics.map((topic, topicIdx) => {
              const cell = j.grid.cells[topic][valueIdx];
              const key = `${topicIdx},${valueIdx}`;
              const isPlayed = j.played.includes(key);
              const isCurrent =
                j.currentCell?.topicIdx === topicIdx && j.currentCell?.valueIdx === valueIdx;
              const clickable = isCaptain && !j.currentCell && !isPlayed;
              return (
                <button
                  key={`c-${key}`}
                  onClick={() => handlePick(topicIdx, valueIdx)}
                  disabled={!clickable}
                  className={`aspect-[5/3] rounded flex items-center justify-center text-2xl sm:text-4xl font-black transition-all select-none ${
                    clickable ? 'hover:brightness-125 cursor-pointer active:scale-95' : 'cursor-default'
                  }`}
                  style={{
                    background: isPlayed
                      ? '#1a1a2e'
                      : isCurrent
                      ? JEOPARDY_GOLD
                      : `linear-gradient(180deg, ${JEOPARDY_BLUE_LIGHT} 0%, ${JEOPARDY_BLUE} 100%)`,
                    color: isPlayed ? '#3a3a5e' : isCurrent ? JEOPARDY_BLUE : JEOPARDY_GOLD,
                    border: isPlayed
                      ? '2px solid #2a2a4a'
                      : `2px solid ${isCurrent ? JEOPARDY_GOLD : 'rgba(245,197,24,0.3)'}`,
                    textShadow: isPlayed ? 'none' : '0 2px 4px rgba(0,0,0,0.6)',
                    boxShadow: clickable
                      ? '0 0 12px rgba(245,197,24,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
                  {isPlayed ? '' : cell.value}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Question Overlay */}
      {j.currentCell && (
        <QuestionOverlay
          cell={j.currentCell}
          jeopardy={j}
          isAnswerer={isAnswerer}
          canBuzz={canBuzz}
          amBlocked={amBlocked}
          onBuzz={handleBuzz}
          onAnswer={handleAnswer}
          timer={gameState.timer}
          maxTimer={gameState.maxTimer}
          players={gameState.players}
        />
      )}
    </div>
  );
}

// ==================== Overlay ====================

interface OverlayProps {
  cell: OpenCell;
  jeopardy: JeopardyPublic;
  isAnswerer: boolean;
  canBuzz: boolean;
  amBlocked: boolean;
  onBuzz: () => void;
  onAnswer: (idx: number) => void;
  timer: number;
  maxTimer: number;
  players: Record<string, { name: string }>;
}

function QuestionOverlay({
  cell,
  jeopardy,
  isAnswerer,
  canBuzz,
  amBlocked,
  onBuzz,
  onAnswer,
  timer,
  maxTimer,
  players,
}: OverlayProps) {
  const reveal = jeopardy.reveal;
  const answererName = jeopardy.currentAnswererId
    ? players[jeopardy.currentAnswererId]?.name ?? '???'
    : null;

  return (
    <div
      className="fixed inset-y-0 left-0 right-0 md:right-72 z-40 flex flex-col items-center justify-center p-4"
      style={{
        background: 'rgba(5, 10, 38, 0.97)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="w-full max-w-4xl flex flex-col items-center">
        {/* Header */}
        <div className="flex items-baseline gap-3 mb-3">
          <div
            className="px-3 py-1 rounded uppercase text-xs sm:text-sm font-bold tracking-wider"
            style={{ background: JEOPARDY_GOLD, color: JEOPARDY_BLUE }}
          >
            {cell.topic}
          </div>
          <div className="text-3xl sm:text-5xl font-black" style={{ color: JEOPARDY_GOLD }}>
            {cell.value}
          </div>
        </div>

        {/* Question */}
        <div
          className="w-full rounded-2xl p-6 sm:p-10 mb-6 text-center"
          style={{
            background: `linear-gradient(180deg, ${JEOPARDY_BLUE_LIGHT} 0%, ${JEOPARDY_BLUE} 100%)`,
            border: `2px solid ${JEOPARDY_GOLD}`,
            boxShadow: '0 0 40px rgba(245,197,24,0.25)',
          }}
        >
          <div
            className="text-xl sm:text-3xl font-bold leading-snug"
            style={{ color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
          >
            {cell.text}
          </div>
        </div>

        {/* Status line */}
        <div className="text-center mb-4 min-h-6">
          {reveal ? (
            <div
              className={`text-lg font-bold ${
                reveal.correct ? 'text-green-400' : 'text-red-400'
              } animate-pulse`}
            >
              {reveal.correct ? '✓ Правильно!' : '✗ Неверно'}
              {jeopardy.message && <span className="ml-2 text-yellow-200">{jeopardy.message}</span>}
            </div>
          ) : isAnswerer ? (
            <div className="text-yellow-300 font-bold animate-pulse">
              Твой ответ! {timer > 0 && <span className="ml-1">⏱ {timer}с</span>}
            </div>
          ) : answererName ? (
            <div className="text-yellow-200">
              Отвечает: <span className="font-bold text-yellow-300">{answererName}</span>
              {timer > 0 && <span className="ml-2 text-sm opacity-70">⏱ {timer}с</span>}
            </div>
          ) : jeopardy.buzzerOpen ? (
            <div className="text-yellow-200">
              Баззер открыт! {timer > 0 && <span>⏱ {timer}с</span>}
            </div>
          ) : (
            <div className="text-gray-400">Подождите...</div>
          )}
        </div>

        {/* Timer bar */}
        {maxTimer > 0 && timer > 0 && !reveal && (
          <div className="w-full max-w-md h-1.5 bg-black/40 rounded-full overflow-hidden mb-5">
            <div
              className="h-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(timer / maxTimer) * 100}%`,
                background: timer <= 3 ? '#ef4444' : JEOPARDY_GOLD,
              }}
            />
          </div>
        )}

        {/* Buzzer or options */}
        {!reveal && jeopardy.buzzerOpen && !jeopardy.currentAnswererId && (
          <div className="w-full flex flex-col items-center">
            {canBuzz ? (
              <button
                onClick={onBuzz}
                className="rounded-full font-black uppercase tracking-wider transition-all active:scale-95 hover:brightness-110"
                style={{
                  width: 'min(80vw, 280px)',
                  height: 'min(80vw, 280px)',
                  background: 'radial-gradient(circle at 35% 30%, #ff5263 0%, #c0203a 60%, #7c0d22 100%)',
                  color: '#fff',
                  fontSize: '1.6rem',
                  boxShadow:
                    '0 0 40px rgba(233,69,96,0.6), 0 12px 30px rgba(0,0,0,0.5), inset 0 4px 0 rgba(255,255,255,0.25), inset 0 -8px 0 rgba(0,0,0,0.3)',
                  border: '4px solid #fff',
                  textShadow: '0 2px 4px rgba(0,0,0,0.6)',
                  animation: 'jeopardy-pulse 1.2s ease-in-out infinite',
                }}
              >
                Я ОТВЕЧАЮ!
              </button>
            ) : amBlocked ? (
              <div className="text-red-400/80 text-sm">Ты уже ответил неверно — ждёшь</div>
            ) : (
              <div className="text-gray-400 text-sm">Баззер открыт для соперников...</div>
            )}
          </div>
        )}

        {/* Answer options (visible to answerer; revealed to everyone after) */}
        {(jeopardy.currentAnswererId || reveal) && (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cell.options.map((opt, idx) => {
              const isCorrectOpt = reveal && idx === reveal.correctIndex;
              const isChosen = reveal && reveal.chosenIndex === idx;
              const showAsCorrect = !!isCorrectOpt;
              const showAsWrong = !!(reveal && isChosen && !reveal.correct);
              const enabled = isAnswerer && !reveal;
              return (
                <button
                  key={idx}
                  onClick={() => enabled && onAnswer(idx)}
                  disabled={!enabled}
                  className={`p-4 rounded-xl text-left font-medium transition-all ${
                    enabled ? 'hover:brightness-110 cursor-pointer active:scale-[0.98]' : ''
                  }`}
                  style={{
                    background: showAsCorrect
                      ? 'rgba(74, 222, 128, 0.25)'
                      : showAsWrong
                      ? 'rgba(239, 68, 68, 0.25)'
                      : enabled
                      ? `linear-gradient(180deg, ${JEOPARDY_BLUE_LIGHT} 0%, ${JEOPARDY_BLUE} 100%)`
                      : 'rgba(20, 30, 80, 0.7)',
                    color: '#fff',
                    border: `2px solid ${
                      showAsCorrect
                        ? '#4ade80'
                        : showAsWrong
                        ? '#ef4444'
                        : enabled
                        ? JEOPARDY_GOLD
                        : 'rgba(245,197,24,0.25)'
                    }`,
                    opacity: !enabled && !reveal ? 0.6 : 1,
                  }}
                >
                  <span
                    className="inline-block w-7 h-7 mr-2 rounded-full text-center leading-7 font-bold"
                    style={{
                      background: JEOPARDY_GOLD,
                      color: JEOPARDY_BLUE,
                    }}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes jeopardy-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(233,69,96,0.6), 0 12px 30px rgba(0,0,0,0.5), inset 0 4px 0 rgba(255,255,255,0.25), inset 0 -8px 0 rgba(0,0,0,0.3); }
          50% { transform: scale(1.04); box-shadow: 0 0 60px rgba(233,69,96,0.9), 0 12px 30px rgba(0,0,0,0.5), inset 0 4px 0 rgba(255,255,255,0.25), inset 0 -8px 0 rgba(0,0,0,0.3); }
        }
      `}</style>
    </div>
  );
}
