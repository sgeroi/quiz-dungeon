// TV presenter for the 'jeopardy-coop' mode («Своя игра (Босс)»).
// Reads room-broadcast data only: gameState.jcoop (server snapshot, no correct
// answer until `reveal`), gameState.timer/players and the 'mode-jcoop-comm'
// room event. No action buttons.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import { GAME_MODES } from '../../types';
import type { GameState, Player } from '../../types';
import { PresenterTimer } from '../DefaultPresenter';

type JCoopValue = 100 | 200 | 300 | 400 | 500;

interface JCoopCell {
  topic: string;
  value: JCoopValue;
  played: boolean;
  timeLimit: number;
}

interface JCoopAnimation {
  id: number;
  type: 'damage-boss' | 'damage-team' | 'death';
  amount?: number;
  playerId?: string;
}

interface CommState {
  level: JCoopValue | null;
  activeId: string | null;
  allowedSpeakers: string[] | null;
  distorted: boolean;
}

interface JCoopSnapshot {
  boss: { name: string; emoji: string; hp: number; max: number };
  grid: JCoopCell[];
  played: string[];
  activeId: string | null;
  current: {
    topic: string;
    value: JCoopValue;
    text: string;
    options: string[];
    timeLimit: number;
    activeId: string;
    helperIds: string[];
    distorted: boolean;
    level: JCoopValue;
  } | null;
  reveal: {
    topic: string;
    value: JCoopValue;
    correctIndex: number;
    activeId: string;
    submittedAnswer: number | null;
    isCorrect: boolean;
    damageToBoss: number;
    damageToActive: number;
    deaths: string[];
  } | null;
  totalCells: number;
  playedCount: number;
  animations: JCoopAnimation[];
  result: 'victory' | 'defeat' | null;
  comm: CommState;
}

const VALUES: JCoopValue[] = [100, 200, 300, 400, 500];
const LETTERS = ['A', 'B', 'C', 'D'];
const MODE = GAME_MODES.find((m) => m.id === 'jeopardy-coop');
const MODE_NAME = MODE?.name ?? 'Своя игра (Босс)';
const MODE_EMOJI = MODE?.emoji ?? '🐲';

const LEVEL_INFO: Record<JCoopValue, { icon: string; short: string }> = {
  100: { icon: '🤝', short: 'Команда помогает' },
  200: { icon: '🔇', short: 'Команда молчит' },
  300: { icon: '🌀', short: 'Голос искажён' },
  400: { icon: '🎯', short: 'Один помощник' },
  500: { icon: '🐲', short: 'Один на один' },
};

interface Float {
  key: string;
  target: 'boss' | string; // 'boss' or playerId
  amount: number;
}

function getSnapshot(gs: GameState | null): JCoopSnapshot | null {
  if (!gs) return null;
  const s = (gs as unknown as { jcoop?: JCoopSnapshot }).jcoop;
  if (!s || !s.boss || !Array.isArray(s.grid)) return null;
  return s;
}

export default function JeopardyCoopPresenter() {
  const gameState = useStore((s) => s.gameState);
  const jc = getSnapshot(gameState);

  // Live comm mask (also mirrored in the snapshot; the event arrives on every
  // round transition and on screen join).
  const [comm, setComm] = useState<CommState | null>(null);
  useEffect(() => {
    const onComm = (c: CommState) => setComm(c);
    socket.on('mode-jcoop-comm', onComm);
    return () => {
      socket.off('mode-jcoop-comm', onComm);
    };
  }, []);

  // Floating damage numbers driven by snapshot.animations (dedup by id).
  const seenRef = useRef<Set<number>>(new Set());
  const [floats, setFloats] = useState<Float[]>([]);
  useEffect(() => {
    if (!jc) return;
    const fresh = jc.animations.filter((a) => !seenRef.current.has(a.id));
    if (fresh.length === 0) return;
    const additions: Float[] = [];
    for (const a of fresh) {
      seenRef.current.add(a.id);
      if (a.type === 'damage-boss' && a.amount) additions.push({ key: `b-${a.id}`, target: 'boss', amount: a.amount });
      else if (a.type === 'damage-team' && a.amount && a.playerId) additions.push({ key: `p-${a.id}`, target: a.playerId, amount: a.amount });
    }
    if (additions.length === 0) return;
    setFloats((prev) => [...prev, ...additions]);
    const t = setTimeout(() => {
      setFloats((prev) => prev.filter((f) => !additions.some((a) => a.key === f.key)));
    }, 1400);
    return () => clearTimeout(t);
  }, [jc?.animations, jc]);

  if (!gameState || !jc) return <Preparing />;

  const players = Object.values(gameState.players);
  const activeId = jc.current?.activeId ?? jc.activeId;
  const activeName = activeId ? gameState.players[activeId]?.name ?? '—' : '—';
  const current = jc.current;
  const reveal = jc.reveal;
  const showQuestion = !!current && (gameState.phase === 'answering' || (gameState.phase === 'results' && !!reveal));
  const effComm = comm ?? jc.comm;
  const timerActive = gameState.phase === 'answering' && gameState.maxTimer > 0;

  return (
    <div className="h-full flex gap-8 px-10 pb-8 pt-2 min-h-0">
      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 min-h-0">
        <BossBar boss={jc.boss} floats={floats.filter((f) => f.target === 'boss')} />

        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0 truncate" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {jc.result ? (
              <span className={`text-[40px] font-black ${jc.result === 'victory' ? 'text-[var(--color-dungeon-gold)]' : 'text-[#FF6B6B]'}`}>
                {jc.result === 'victory' ? `🏆 ${jc.boss.name} повержен!` : `💀 ${jc.boss.name} торжествует…`}
              </span>
            ) : reveal && gameState.phase === 'results' ? (
              <span className={`text-[40px] font-black ${reveal.isCorrect ? 'text-[var(--color-dungeon-heal)]' : 'text-[#FF6B6B]'}`}>
                {reveal.isCorrect
                  ? `🗡️ ${gameState.players[reveal.activeId]?.name ?? 'Игрок'} бьёт босса на ${reveal.damageToBoss}!`
                  : `❌ ${gameState.players[reveal.activeId]?.name ?? 'Игрок'} ошибся — урон ${reveal.damageToActive}`}
                {reveal.deaths.length > 0 && (
                  <span className="text-white/60"> · 💀 {reveal.deaths.map((id) => gameState.players[id]?.name ?? '?').join(', ')}</span>
                )}
              </span>
            ) : current ? (
              <span className="text-[40px] font-black text-[var(--color-dungeon-gold)]">🎯 Отвечает: {activeName}</span>
            ) : (
              <span className="text-[40px] font-black text-[var(--color-dungeon-gold)]">🎯 Ход: {activeName} — выбирает клетку</span>
            )}
          </div>
          <div className="shrink-0 text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {jc.playedCount} / {jc.totalCells} клеток
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {showQuestion && current ? (
            <QuestionPanel current={current} reveal={gameState.phase === 'results' ? reveal : null} players={gameState.players} />
          ) : (
            <Grid grid={jc.grid} revealKey={reveal ? `${reveal.topic}|${reveal.value}` : null} />
          )}
        </div>
      </div>

      {/* Side column */}
      <aside className="w-[460px] shrink-0 flex flex-col gap-5 min-h-0">
        <div className="glass-panel px-6 py-4 flex items-center justify-between min-h-[150px]">
          {timerActive ? (
            <>
              <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] leading-tight">
                Время<br />на ответ
              </div>
              <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
            </>
          ) : (
            <div className="w-full text-center">
              <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">{MODE_EMOJI} {MODE_NAME}</div>
              <div className="text-[30px] font-extrabold text-white/80 leading-tight mt-1">
                {current ? 'Смотрим ответ…' : 'Выбор клетки'}
              </div>
            </div>
          )}
        </div>

        <CommBadge comm={effComm} players={gameState.players} />

        <TeamPanel
          players={players}
          activeId={activeId}
          helperIds={current?.helperIds ?? []}
          floats={floats.filter((f) => f.target !== 'boss')}
        />
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

function BossBar({ boss, floats }: { boss: JCoopSnapshot['boss']; floats: Float[] }) {
  const pct = boss.max > 0 ? Math.max(0, Math.min(100, (boss.hp / boss.max) * 100)) : 0;
  const hit = floats.length > 0;
  return (
    <div
      className="relative glass-panel px-8 py-5 flex items-center gap-7 overflow-hidden border border-[#FF4848]/40"
      style={{
        background: 'linear-gradient(90deg, rgba(120,20,40,0.55), rgba(37,11,49,0.9))',
        animation: hit ? 'shake 0.4s' : undefined,
      }}
    >
      <div className="text-[96px] leading-none" style={{ animation: 'monsterIdle 2.4s ease-in-out infinite' }}>
        {boss.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-[40px] font-black truncate">{boss.name}</div>
          <div className="text-[44px] font-black tabular-nums text-[#FF8A8A] shrink-0">
            {boss.hp}
            <span className="text-[26px] font-bold text-white/50"> / {boss.max}</span>
          </div>
        </div>
        <div className="hp-bar mt-2 h-8 rounded-full bg-black/40 overflow-hidden border border-[#FF4848]/40">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #b91c1c, #ef4444, #f97316)',
              boxShadow: '0 0 16px rgba(239,68,68,0.6)',
            }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {floats.map((f) => (
          <div
            key={f.key}
            className="absolute text-[80px] font-black text-[var(--color-dungeon-gold)]"
            style={{ animation: 'floatUp 1.3s forwards', textShadow: '0 0 16px rgba(0,0,0,0.8)' }}
          >
            −{f.amount}
          </div>
        ))}
      </div>
    </div>
  );
}

function Grid({ grid, revealKey }: { grid: JCoopCell[]; revealKey: string | null }) {
  const topics: string[] = [];
  const byKey = new Map<string, JCoopCell>();
  for (const c of grid) {
    if (!topics.includes(c.topic)) topics.push(c.topic);
    byKey.set(`${c.topic}|${c.value}`, c);
  }
  return (
    <div
      className="h-full grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, topics.length)}, minmax(0, 1fr))`,
        gridTemplateRows: 'minmax(0, 0.9fr) repeat(5, minmax(0, 1fr))',
      }}
    >
      {topics.map((t) => (
        <div
          key={t}
          className="flex items-center justify-center text-center rounded-2xl px-3 bg-[var(--color-dungeon-surface-2)] border border-[var(--color-dungeon-purple)]/40"
        >
          <span className="text-[22px] font-extrabold uppercase tracking-wide leading-tight text-[var(--color-dungeon-purple)] line-clamp-3">{t}</span>
        </div>
      ))}
      {VALUES.map((v) =>
        topics.map((t) => {
          const key = `${t}|${v}`;
          const played = !!byKey.get(key)?.played;
          const isReveal = revealKey === key;
          const info = LEVEL_INFO[v];
          return (
            <div
              key={key}
              className={`relative flex items-center justify-center rounded-2xl border transition-all ${
                played && !isReveal
                  ? 'bg-black/30 border-white/5'
                  : isReveal
                    ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)] glow-gold'
                    : 'bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-gold)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(255,219,16,0.08)]'
              }`}
            >
              <span className={`text-[56px] font-black tabular-nums leading-none ${played && !isReveal ? 'text-white/10' : 'text-[var(--color-dungeon-gold)]'}`}>
                {played && !isReveal ? '·' : v}
              </span>
              {!played && (
                <span className="absolute top-2 right-3 text-[24px] opacity-80" title={info.short}>
                  {info.icon}
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

function QuestionPanel({
  current,
  reveal,
  players,
}: {
  current: NonNullable<JCoopSnapshot['current']>;
  reveal: JCoopSnapshot['reveal'];
  players: Record<string, Player>;
}) {
  const info = LEVEL_INFO[current.level];
  const helperNames = current.helperIds.map((id) => players[id]?.name).filter(Boolean) as string[];
  const longText = current.text.length > 140;
  return (
    <div className="h-full flex flex-col gap-5 min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div className="flex items-center gap-4 flex-wrap">
        <span className="rounded-full bg-[var(--color-dungeon-purple)]/20 border border-[var(--color-dungeon-purple)]/50 px-6 py-2 text-[24px] font-extrabold uppercase tracking-wider text-[var(--color-dungeon-purple)]">
          {current.topic}
        </span>
        <span className="rounded-full bg-[var(--color-dungeon-gold)] px-6 py-2 text-[28px] font-black tabular-nums text-[var(--color-dungeon-gold-fg)]">
          {current.value}
        </span>
        <span className="rounded-full bg-black/40 border border-[var(--color-dungeon-accent)]/50 px-6 py-2 text-[24px] font-extrabold text-[#FFB8E0]">
          {info.icon} {info.short}
        </span>
        {helperNames.length > 0 && (
          <span className="rounded-full bg-[var(--color-dungeon-heal)]/15 border border-[var(--color-dungeon-heal)]/50 px-6 py-2 text-[24px] font-extrabold text-[var(--color-dungeon-heal)] truncate max-w-[600px]">
            🤝 {helperNames.join(', ')}
          </span>
        )}
      </div>

      <div className="glass-panel-gold px-10 py-8 flex items-center justify-center text-center">
        <div className={`${longText ? 'text-[40px]' : 'text-[50px]'} font-extrabold leading-[1.15]`}>{current.text}</div>
      </div>

      <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
        {current.options.map((opt, i) => {
          const isCorrect = !!reveal && reveal.correctIndex === i;
          const isWrongChosen = !!reveal && reveal.submittedAnswer === i && !reveal.isCorrect;
          const dim = !!reveal && !isCorrect && !isWrongChosen;
          return (
            <div
              key={i}
              className={`flex items-center gap-5 rounded-3xl px-7 py-4 border transition-all ${
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

function CommBadge({ comm, players }: { comm: CommState; players: Record<string, Player> }) {
  let icon = '🔊';
  let text = 'Все могут говорить';
  if (comm.level !== null) {
    const info = LEVEL_INFO[comm.level];
    icon = info.icon;
    if (comm.distorted) text = 'Голоса искажены';
    else if (!comm.allowedSpeakers) text = 'Все могут говорить';
    else if (comm.allowedSpeakers.length <= 1) text = 'Говорит только активный';
    else text = `Говорят: ${comm.allowedSpeakers.map((id) => players[id]?.name ?? '?').join(', ')}`;
  }
  return (
    <div className="rounded-3xl bg-black/30 border border-white/10 px-6 py-3 flex items-center gap-4">
      <span className="text-[34px] leading-none">{icon}</span>
      <div className="min-w-0">
        <div className="text-[16px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Связь</div>
        <div className="text-[22px] font-extrabold truncate">{text}</div>
      </div>
    </div>
  );
}

function TeamPanel({
  players,
  activeId,
  helperIds,
  floats,
}: {
  players: Player[];
  activeId: string | null;
  helperIds: string[];
  floats: Float[];
}) {
  const compact = players.length > 5;
  return (
    <div className="glass-panel p-5 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      <div className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда</div>
      <div className="flex flex-col gap-2.5 overflow-hidden">
        {players.map((p) => {
          const pct = p.maxPersonalHp > 0 ? Math.max(0, Math.min(100, (p.personalHp / p.maxPersonalHp) * 100)) : 0;
          const isActive = p.id === activeId;
          const isHelper = helperIds.includes(p.id);
          const myFloats = floats.filter((f) => f.target === p.id);
          return (
            <div
              key={p.id}
              className={`relative rounded-2xl border px-4 ${compact ? 'py-1.5' : 'py-3'} transition-all ${
                !p.isAlive
                  ? 'bg-black/30 border-white/5 opacity-45'
                  : isActive
                    ? 'bg-[var(--color-dungeon-gold)]/15 border-[var(--color-dungeon-gold)] shadow-[0_0_24px_rgba(255,219,16,0.3)]'
                    : isHelper
                      ? 'bg-[var(--color-dungeon-heal)]/10 border-[var(--color-dungeon-heal)]/60'
                      : 'bg-white/5 border-white/10'
              }`}
              style={myFloats.length > 0 ? { animation: 'shake 0.4s' } : undefined}
            >
              <div className="flex items-center gap-3">
                <span className="w-[36px] text-center text-[26px] shrink-0">
                  {!p.isAlive ? '💀' : isActive ? '🎯' : isHelper ? '🤝' : p.isBot ? '🤖' : ''}
                </span>
                <span className={`flex-1 min-w-0 truncate font-extrabold ${compact ? 'text-[24px]' : 'text-[28px]'}`}>{p.name}</span>
                <span className="shrink-0 text-[22px] font-bold tabular-nums text-white/70">
                  {p.personalHp}/{p.maxPersonalHp}
                </span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-black/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: pct > 50 ? '#8DFF85' : pct > 25 ? '#FFDB10' : '#FF4848' }}
                />
              </div>
              {myFloats.map((f) => (
                <div
                  key={f.key}
                  className="pointer-events-none absolute right-6 top-0 text-[44px] font-black text-[#FF6B6B]"
                  style={{ animation: 'floatUp 1.3s forwards', textShadow: '0 0 10px rgba(0,0,0,0.8)' }}
                >
                  −{f.amount}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
