import { useMemo } from 'react';
import { useStore } from '../store';
import { GAME_MODES } from '../types';
import type { GameState, Player } from '../types';

/**
 * Generic TV presenter used for any mode without a dedicated presenter.
 * Reads only room-broadcast data from gameState: mode, floor/round, timer,
 * current question (never the correct answer before reveal) and the player board.
 * Designed for 1920x1080: big type, dark purple background, yellow accents.
 */

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface ModeSnapshotLike {
  scores?: Record<string, number>;
  revealCorrectIndex?: number | null;
  round?: number;
  total?: number;
}

/** Scores exposed by mode snapshots mirrored onto gameState (speed, jeopardy, ...). */
export function pickScores(gs: GameState): Record<string, number> | null {
  const any = gs as unknown as Record<string, ModeSnapshotLike | undefined>;
  for (const key of ['speed', 'jeopardy', 'jcoop', 'topicSplit', 'rpgr', 'spy']) {
    const s = any[key];
    if (s && s.scores && typeof s.scores === 'object') return s.scores;
  }
  return null;
}

function revealIndex(gs: GameState): number | null {
  if (gs.phase !== 'results' && gs.phase !== 'victory' && gs.phase !== 'defeat') return null;
  if (gs.lastResults && typeof gs.lastResults.correctIndex === 'number') return gs.lastResults.correctIndex;
  const any = gs as unknown as Record<string, ModeSnapshotLike | undefined>;
  for (const key of ['speed', 'millionaire']) {
    const s = any[key];
    if (s && typeof s.revealCorrectIndex === 'number') return s.revealCorrectIndex;
  }
  return null;
}

const PHASE_LABEL: Record<string, string> = {
  'floor-intro': 'Новый этаж',
  question: 'Вопрос',
  answering: 'Отвечаем!',
  results: 'Результаты',
  'chain-turn': 'Цепочка',
  reward: 'Выбор награды',
  'class-select': 'Выбор класса',
  lobby: 'Лобби',
  victory: 'Победа!',
  defeat: 'Поражение',
};

export function PresenterTimer({ timer, maxTimer }: { timer: number; maxTimer: number }) {
  if (!maxTimer || maxTimer <= 0) return null;
  const pct = Math.max(0, Math.min(1, timer / maxTimer));
  const urgent = timer <= 5;
  return (
    <div className="flex flex-col items-center gap-2 min-w-[160px]">
      <div
        className={`text-[96px] leading-none font-black tabular-nums ${urgent ? 'text-[#FF4848] animate-pulse' : 'text-[var(--color-dungeon-gold)]'}`}
      >
        {timer}
      </div>
      <div className="w-[160px] h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${urgent ? 'bg-[#FF4848]' : 'bg-[var(--color-dungeon-gold)]'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export function PresenterPlayerBoard({
  players,
  scores,
  showAnswered,
}: {
  players: Player[];
  scores: Record<string, number> | null;
  showAnswered: boolean;
}) {
  const sorted = useMemo(() => {
    const list = [...players];
    if (scores) list.sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
    return list;
  }, [players, scores]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, sorted.length))}, minmax(0, 1fr))` }}>
      {sorted.map((p) => {
        const answered = p.currentAnswer !== null && p.currentAnswer !== undefined;
        const hpPct = p.maxPersonalHp > 0 ? Math.max(0, Math.min(1, p.personalHp / p.maxPersonalHp)) : 0;
        return (
          <div
            key={p.id}
            className={`glass-panel px-6 py-4 flex flex-col gap-2 ${!p.isAlive ? 'opacity-40' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[30px] font-extrabold truncate leading-tight">
                {p.isBot ? '🤖 ' : ''}{p.name}
              </div>
              {scores ? (
                <div className="text-[36px] font-black text-[var(--color-dungeon-gold)] tabular-nums leading-none">
                  {scores[p.id] ?? 0}
                </div>
              ) : !p.isAlive ? (
                <span className="text-[28px]">💀</span>
              ) : showAnswered ? (
                <span className={`rounded-full px-4 py-1 text-[18px] font-extrabold ${answered ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/5 text-white/40'}`}>
                  {answered ? 'ответил' : 'думает…'}
                </span>
              ) : null}
            </div>
            {!scores && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-dungeon-heal)] transition-[width] duration-500"
                    style={{ width: `${hpPct * 100}%` }}
                  />
                </div>
                <span className="text-[18px] font-bold text-white/70 tabular-nums w-[90px] text-right">
                  {p.personalHp}/{p.maxPersonalHp}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DefaultPresenter() {
  const gameState = useStore((s) => s.gameState);
  if (!gameState) return null;

  const modeInfo = GAME_MODES.find((m) => m.id === (gameState.gameMode ?? 'classic')) ?? GAME_MODES[0];
  const players = Object.values(gameState.players);
  const question = gameState.currentQuestion;
  const scores = pickScores(gameState);
  const reveal = revealIndex(gameState);
  const floor = gameState.floors?.[gameState.currentFloor - 1];
  const monster = floor?.monster;
  const showRound = gameState.currentFloor > 0 && gameState.totalFloors > 0;

  return (
    <div className="h-full flex flex-col gap-6 p-10">
      {/* Top: mode + round + timer */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {PHASE_LABEL[gameState.phase] ?? gameState.phase}
          </div>
          <div className="text-[48px] font-black leading-tight truncate">
            {modeInfo.emoji} {modeInfo.name}
          </div>
          {showRound && (
            <div className="text-[28px] font-bold text-[var(--color-dungeon-gold)]">
              {floor ? `Этаж ${gameState.currentFloor} из ${gameState.totalFloors}` : `Раунд ${gameState.currentFloor} из ${gameState.totalFloors}`}
              {floor?.params?.name ? <span className="text-white/60"> · {floor.params.name}</span> : null}
            </div>
          )}
        </div>
        <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
      </div>

      {/* Middle: question or phase message */}
      <div className="flex-1 flex flex-col justify-center gap-6 min-h-0">
        {monster && (
          <div className="flex items-center gap-6 glass-panel-gold px-8 py-4 self-start">
            <span className="text-[64px] leading-none">{monster.emoji}</span>
            <div>
              <div className="text-[32px] font-black">{monster.name}{monster.isBoss ? ' · БОСС' : ''}</div>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-[360px] h-4 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#FF4848] transition-[width] duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, (monster.currentHp / Math.max(1, monster.maxHp)) * 100))}%` }}
                  />
                </div>
                <span className="text-[22px] font-bold tabular-nums text-white/80">{monster.currentHp}/{monster.maxHp}</span>
              </div>
            </div>
          </div>
        )}

        {question ? (
          <div className="flex flex-col gap-8">
            {question.category && (
              <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-purple)]">
                {question.category}
              </div>
            )}
            <div className="text-[52px] font-extrabold leading-[1.15] max-w-[1600px]">{question.text}</div>
            {question.options && question.options.length > 0 && (
              <div className="grid grid-cols-2 gap-5">
                {question.options.map((opt, i) => {
                  const isCorrect = reveal !== null && reveal === i;
                  const dim = reveal !== null && !isCorrect;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-5 rounded-3xl px-7 py-5 border transition-all ${
                        isCorrect
                          ? 'bg-[var(--color-dungeon-heal)]/20 border-[var(--color-dungeon-heal)] shadow-[0_0_40px_rgba(141,255,133,0.35)]'
                          : dim
                            ? 'bg-white/[0.03] border-white/5 opacity-50'
                            : 'bg-white/[0.06] border-white/10'
                      }`}
                    >
                      <span className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl text-[32px] font-black ${isCorrect ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]' : 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'}`}>
                        {OPTION_LETTERS[i] ?? i + 1}
                      </span>
                      <span className="text-[34px] font-bold leading-tight">{opt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">
              {PHASE_LABEL[gameState.phase] ?? '…'}
            </div>
            <div className="text-[28px] font-semibold text-[var(--color-dungeon-muted)] mt-2">
              Смотри на свой телефон — там всё самое важное
            </div>
          </div>
        )}
      </div>

      {/* Bottom: player board */}
      <PresenterPlayerBoard players={players} scores={scores} showAnswered={gameState.phase === 'answering' || gameState.phase === 'question'} />
    </div>
  );
}
