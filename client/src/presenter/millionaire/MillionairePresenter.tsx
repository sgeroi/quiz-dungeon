// TV presenter for the 'millionaire' mode («Кто хочет стать миллионером»).
// Reads room-broadcast data only: gameState.millionaire (server snapshot; the
// correct answer arrives as `revealCorrectIndex` only in the 'results' phase),
// gameState.timer and players. No action buttons.
import { useMemo } from 'react';
import { useStore } from '../../store';
import { GAME_MODES } from '../../types';
import type { GameState, Player } from '../../types';
import { PresenterTimer } from '../DefaultPresenter';

interface MillionaireSnapshot {
  level: number;
  hintsUsed: { fifty: boolean; audience: boolean; friend: boolean; swap?: boolean };
  fiftyEliminated: number[];
  audience: { percents: [number, number, number, number] } | null;
  friend: { suggestionIndex: 0 | 1 | 2 | 3; text: string } | null;
  question: { id: string; text: string; options: string[] } | null;
  lastAnswerIndex: number | null;
  lastWasCorrect: boolean | null;
  revealCorrectIndex: number | null;
  finalSum: number;
  finalLevel: number;
  pyramid: number[];
}

const FALLBACK_PYRAMID = [100, 500, 1_000, 5_000, 25_000, 100_000, 500_000, 1_000_000];
const SAFE_LEVELS = [5];
const LETTERS = ['A', 'B', 'C', 'D'];
const MODE = GAME_MODES.find((m) => m.id === 'millionaire');
const MODE_NAME = MODE?.name ?? 'Кто хочет стать миллионером';
const MODE_EMOJI = MODE?.emoji ?? '💰';

const formatRub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

function getSnapshot(gs: GameState | null): MillionaireSnapshot | null {
  if (!gs) return null;
  const m = (gs as unknown as { millionaire?: MillionaireSnapshot }).millionaire;
  if (!m || typeof m.level !== 'number') return null;
  return m;
}

export default function MillionairePresenter() {
  const gameState = useStore((s) => s.gameState);
  const m = getSnapshot(gameState);

  const pyramid = useMemo(() => (m?.pyramid?.length ? m.pyramid : FALLBACK_PYRAMID), [m?.pyramid]);

  if (!gameState || !m) return <Preparing />;

  const showResult = gameState.phase === 'results';
  const correctIdx = showResult ? m.revealCorrectIndex : null;
  const pickedIdx = m.lastAnswerIndex;
  const players = Object.values(gameState.players);
  const answeredBy = players.find((p) => p.currentAnswer !== null && p.currentAnswer !== undefined) ?? null;
  const level = m.level;
  const currentPrize = pyramid[level - 1] ?? 0;
  const timerActive = !showResult && gameState.maxTimer > 0;
  const q = m.question;

  return (
    <div className="h-full flex gap-8 px-10 pb-8 pt-2 min-h-0">
      {/* Pyramid */}
      <aside className="w-[400px] shrink-0 flex flex-col gap-4 min-h-0">
        <Pyramid pyramid={pyramid} currentLevel={level} />
      </aside>

      {/* Studio */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 min-h-0">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
              {MODE_EMOJI} {MODE_NAME}
            </div>
            <div className="text-[40px] font-black leading-tight truncate">
              Вопрос {level} из {pyramid.length}
              <span className="text-[var(--color-dungeon-gold)]"> · {formatRub(currentPrize)}</span>
            </div>
          </div>
          <div className="shrink-0 min-h-[130px] flex items-center">
            {timerActive ? (
              <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
            ) : (
              <ResultBadge m={m} prize={currentPrize} answeredBy={answeredBy} show={showResult} />
            )}
          </div>
        </div>

        {/* Question pill */}
        <div className="relative">
          <div className="absolute left-0 right-0 top-1/2 h-[3px] bg-[var(--color-dungeon-gold)]/50" />
          <div className="relative mx-10 rounded-[48px] border-[3px] border-[var(--color-dungeon-gold)] bg-[var(--color-dungeon-surface)] px-14 py-8 text-center shadow-[0_0_40px_rgba(255,219,16,0.2)]">
            <div className={`${(q?.text.length ?? 0) > 140 ? 'text-[38px]' : 'text-[46px]'} font-extrabold leading-[1.15]`}>
              {q?.text ?? '…'}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {(q?.options ?? ['', '', '', '']).map((opt, i) => (
            <OptionPill
              key={i}
              letter={LETTERS[i]}
              text={opt}
              eliminated={m.fiftyEliminated.includes(i)}
              picked={pickedIdx === i}
              correct={correctIdx !== null && correctIdx === i}
              wrong={correctIdx !== null && pickedIdx === i && correctIdx !== i}
              friend={!showResult && m.friend?.suggestionIndex === i}
              audiencePct={m.audience ? m.audience.percents[i] : null}
            />
          ))}
        </div>

        {/* Hints + audience / friend */}
        <div className="flex gap-5 flex-1 min-h-0">
          <div className="glass-panel px-6 py-4 flex flex-col gap-3 w-[420px] shrink-0 self-start">
            <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Подсказки</div>
            <div className="grid grid-cols-4 gap-3">
              <HintChip icon="50:50" label="50:50" used={m.hintsUsed.fifty} />
              <HintChip icon="🏛️" label="Зал" used={m.hintsUsed.audience} />
              <HintChip icon="📞" label="Друг" used={m.hintsUsed.friend} />
              <HintChip icon="🔄" label="Замена" used={!!m.hintsUsed.swap} />
            </div>
          </div>

          {m.audience ? (
            <AudienceChart percents={m.audience.percents} eliminated={m.fiftyEliminated} />
          ) : m.friend ? (
            <div className="glass-panel px-8 py-5 flex items-center gap-6 flex-1 min-w-0 self-start border border-[var(--color-dungeon-heal)]/40">
              <span className="text-[64px] leading-none">📞</span>
              <div className="min-w-0">
                <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-heal)]">Звонок другу</div>
                <div className="text-[30px] font-extrabold leading-tight">«{m.friend.text}»</div>
              </div>
            </div>
          ) : (
            <PlayersStrip players={players} answeredBy={answeredBy} />
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Pieces ====================

function Preparing() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
      <div className="text-[96px] leading-none">{MODE_EMOJI}</div>
      <div className="text-[64px] font-black leading-tight">{MODE_NAME}</div>
      <div className="text-[36px] font-bold text-[var(--color-dungeon-gold)] animate-pulse">Готовим студию…</div>
    </div>
  );
}

function Pyramid({ pyramid, currentLevel }: { pyramid: number[]; currentLevel: number }) {
  const rows = [...pyramid].map((amount, idx) => ({ level: idx + 1, amount })).reverse();
  return (
    <div className="glass-panel p-4 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] px-2">Пирамида</div>
      <div className="flex-1 min-h-0 flex flex-col justify-around gap-1">
        {rows.map(({ level, amount }) => {
          const isCurrent = level === currentLevel;
          const isCleared = level < currentLevel;
          const isSafe = SAFE_LEVELS.includes(level);
          const isTop = level === pyramid.length;
          let cls = 'text-white/45 border-transparent';
          if (isSafe) cls = 'text-white border-[var(--color-dungeon-gold)]/40';
          if (isCleared) cls = 'text-[var(--color-dungeon-heal)]/80 border-transparent';
          if (isCurrent) cls = 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] border-[var(--color-dungeon-gold)] shadow-[0_0_28px_rgba(255,219,16,0.5)] scale-[1.04]';
          return (
            <div
              key={level}
              className={`flex items-center justify-between rounded-2xl border px-5 py-2 transition-all ${cls}`}
            >
              <span className="w-[40px] text-[22px] font-black tabular-nums opacity-70">{level}</span>
              <span className={`flex-1 text-right ${isTop ? 'text-[32px]' : 'text-[28px]'} font-black tabular-nums`}>{formatRub(amount)}</span>
              <span className="w-[40px] text-right text-[22px]">{isTop && !isCurrent ? '💎' : isSafe ? '🛡️' : isCleared ? '✓' : isCurrent ? '◆' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptionPill({
  letter,
  text,
  eliminated,
  picked,
  correct,
  wrong,
  friend,
  audiencePct,
}: {
  letter: string;
  text: string;
  eliminated: boolean;
  picked: boolean;
  correct: boolean;
  wrong: boolean;
  friend: boolean;
  audiencePct: number | null;
}) {
  let box = 'bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-gold)]/60';
  let letterCls = 'text-[var(--color-dungeon-gold)]';
  if (eliminated) {
    box = 'bg-black/30 border-white/10 opacity-30';
    letterCls = 'text-white/40';
  }
  if (picked && !correct && !wrong) {
    box = 'bg-[var(--color-dungeon-gold)] border-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] shadow-[0_0_36px_rgba(255,219,16,0.5)] animate-pulse';
    letterCls = 'text-[var(--color-dungeon-gold-fg)]';
  }
  if (correct) {
    box = 'bg-[var(--color-dungeon-heal)]/25 border-[var(--color-dungeon-heal)] shadow-[0_0_40px_rgba(141,255,133,0.4)]';
    letterCls = 'text-[var(--color-dungeon-heal)]';
  }
  if (wrong) {
    box = 'bg-[#FF4848]/25 border-[#FF4848] shadow-[0_0_36px_rgba(255,72,72,0.4)]';
    letterCls = 'text-[#FF8A8A]';
  }
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-1/2 h-[3px] bg-[var(--color-dungeon-gold)]/40" />
      <div
        className={`relative mx-6 flex items-center gap-5 rounded-full border-[3px] px-8 py-4 transition-all ${box}`}
        style={wrong ? { animation: 'shake 0.4s' } : undefined}
      >
        <span className={`text-[34px] font-black ${letterCls}`}>{letter}</span>
        <span className="flex-1 min-w-0 text-[32px] font-bold leading-tight truncate">{eliminated ? '—' : text}</span>
        {friend && !eliminated && <span className="text-[28px]">📞</span>}
        {audiencePct !== null && !eliminated && (
          <span className="text-[26px] font-black tabular-nums text-[var(--color-dungeon-mana)]">{audiencePct}%</span>
        )}
      </div>
    </div>
  );
}

function HintChip({ icon, label, used }: { icon: string; label: string; used: boolean }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 ${
        used ? 'bg-black/40 border-white/10 opacity-45' : 'bg-[var(--color-dungeon-gold)]/10 border-[var(--color-dungeon-gold)]/60'
      }`}
    >
      <div className="text-[24px] font-black text-[var(--color-dungeon-gold)] leading-none">{icon}</div>
      <div className="text-[14px] font-bold uppercase tracking-wider text-white/80">{label}</div>
      {used && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[48px] font-black text-[#FF4848]/80 leading-none">✕</span>
        </div>
      )}
    </div>
  );
}

function AudienceChart({ percents, eliminated }: { percents: number[]; eliminated: number[] }) {
  return (
    <div className="glass-panel px-8 py-4 flex-1 min-w-0 flex flex-col gap-2 border border-[var(--color-dungeon-mana)]/40">
      <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-mana)]">🏛️ Голосование зала</div>
      <div className="flex-1 min-h-0 flex items-end justify-around gap-6">
        {percents.map((pct, i) => {
          const gone = eliminated.includes(i);
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1 h-full">
              <div className="text-[24px] font-black tabular-nums text-[var(--color-dungeon-gold)]">{gone ? '—' : `${pct}%`}</div>
              <div className="w-full flex-1 min-h-0 rounded-t-xl bg-black/30 flex items-end overflow-hidden">
                <div
                  className={`w-full rounded-t-xl transition-[height] duration-700 ${gone ? 'bg-white/10' : 'bg-gradient-to-t from-[var(--color-dungeon-mana)] to-[#B9DCFF]'}`}
                  style={{ height: gone ? '4%' : `${Math.max(4, pct)}%` }}
                />
              </div>
              <div className="text-[22px] font-black text-white/70">{LETTERS[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultBadge({
  m,
  prize,
  answeredBy,
  show,
}: {
  m: MillionaireSnapshot;
  prize: number;
  answeredBy: Player | null;
  show: boolean;
}) {
  if (!show || m.lastWasCorrect === null) return null;
  const ok = m.lastWasCorrect;
  return (
    <div
      className={`rounded-3xl border-2 px-8 py-4 text-right ${
        ok
          ? 'bg-[var(--color-dungeon-heal)]/15 border-[var(--color-dungeon-heal)] text-[var(--color-dungeon-heal)]'
          : 'bg-[#FF4848]/15 border-[#FF4848] text-[#FF8A8A]'
      }`}
      style={{ animation: 'fadeIn 0.4s ease-out' }}
    >
      <div className="text-[40px] font-black leading-tight">{ok ? `✓ Правильно! ${formatRub(prize)}` : m.lastAnswerIndex === null ? '⏱ Время вышло' : '✗ Неверно'}</div>
      <div className="text-[22px] font-bold text-white/70">
        {answeredBy ? `Ответил: ${answeredBy.name}` : ok ? 'Идём дальше' : 'Игра окончена'}
      </div>
    </div>
  );
}

function PlayersStrip({ players, answeredBy }: { players: Player[]; answeredBy: Player | null }) {
  return (
    <div className="glass-panel px-6 py-4 flex-1 min-w-0 self-start flex flex-col gap-3">
      <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда</div>
      <div className="flex flex-wrap gap-3 overflow-hidden">
        {players.map((p) => (
          <span
            key={p.id}
            className={`rounded-full border px-5 py-2 text-[24px] font-extrabold ${
              answeredBy?.id === p.id
                ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold)]'
                : 'bg-white/5 border-white/10'
            }`}
          >
            {p.isBot ? '🤖 ' : ''}{p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
