import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import type { Player } from '../../types';

// ---- Types mirroring the server snapshot ----

// Topics come from the content pack chosen in the lobby — any string.
type JCoopTopic = string;

type JCoopValue = 100 | 200 | 300 | 400 | 500;

interface JCoopCell {
  topic: JCoopTopic;
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

interface JCoopSnapshot {
  boss: { name: string; emoji: string; hp: number; max: number };
  grid: JCoopCell[];
  played: string[];
  activeId: string | null;
  current: {
    topic: JCoopTopic;
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
    topic: JCoopTopic;
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
  comm: {
    level: JCoopValue | null;
    activeId: string | null;
    allowedSpeakers: string[] | null;
    distorted: boolean;
  };
}

const VALUES: JCoopValue[] = [100, 200, 300, 400, 500];

interface LevelInfo {
  icon: string;
  short: string;
  description: string;
  color: string;
}

const LEVEL_INFO: Record<JCoopValue, LevelInfo> = {
  100: {
    icon: '🤝',
    short: 'Команда помогает',
    description: 'Все говорят свободно — команда подсказывает активному игроку.',
    color: 'emerald',
  },
  200: {
    icon: '🔇',
    short: 'Команда молчит',
    description: 'Все на мьюте. Активный игрок думает сам — но хотя бы видит команду.',
    color: 'sky',
  },
  300: {
    icon: '🌀',
    short: 'Голос и видео искажены',
    description: 'Команда может говорить, но голоса и лица сильно искажены.',
    color: 'fuchsia',
  },
  400: {
    icon: '🎯',
    short: '1 помощник',
    description: 'Помогает только один случайный игрок — остальные на мьюте.',
    color: 'amber',
  },
  500: {
    icon: '🐲',
    short: 'Один на один',
    description: 'Активный игрок отвечает один. Никто не помогает.',
    color: 'rose',
  },
};

// ---- Component ----

export default function JeopardyCoopScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);
  const jcoop = (gameState as any)?.jcoop as JCoopSnapshot | undefined;
  const phase = gameState?.phase;

  const [seenAnimIds, setSeenAnimIds] = useState<Set<number>>(new Set());
  const [floatingDamages, setFloatingDamages] = useState<
    { key: string; type: 'boss' | 'player'; amount: number; playerId?: string }[]
  >([]);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (!jcoop) return;
    const fresh = jcoop.animations.filter((a) => !seenAnimIds.has(a.id));
    if (fresh.length === 0) return;
    const newSeen = new Set(seenAnimIds);
    const additions: typeof floatingDamages = [];
    for (const a of fresh) {
      newSeen.add(a.id);
      if (a.type === 'damage-boss' && a.amount) {
        additions.push({ key: `b-${a.id}`, type: 'boss', amount: a.amount });
      } else if (a.type === 'damage-team' && a.amount) {
        additions.push({ key: `p-${a.id}`, type: 'player', amount: a.amount, playerId: a.playerId });
      }
    }
    setSeenAnimIds(newSeen);
    if (additions.length > 0) {
      setFloatingDamages((prev) => [...prev, ...additions]);
      setTimeout(() => {
        setFloatingDamages((prev) => prev.filter((d) => !additions.some((a) => a.key === d.key)));
      }, 1100);
    }
    lastTickRef.current = Date.now();
  }, [jcoop?.animations, jcoop, seenAnimIds]);

  if (!gameState || !playerId) {
    return <div className="h-full flex items-center justify-center text-gray-400">Загрузка...</div>;
  }

  if (!jcoop) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Ожидание боссфайта...
      </div>
    );
  }

  const players = Object.values(gameState.players);
  const me = gameState.players[playerId];
  const activeId = jcoop.activeId;
  const iAmActive = activeId === playerId;
  const isMyTurnToPick = phase === 'question' && iAmActive && !jcoop.current && !jcoop.result;
  const activeName =
    activeId && gameState.players[activeId] ? gameState.players[activeId].name : '—';

  const handlePick = (topic: JCoopTopic, value: JCoopValue) => {
    if (!isMyTurnToPick) return;
    socket.emit('mode-jcoop-pick' as any, { topic, value });
  };

  const handleAnswer = (index: number) => {
    if (!jcoop.current) return;
    socket.emit('mode-jcoop-answer' as any, index);
  };

  const cellByKey = new Map<string, JCoopCell>();
  for (const c of jcoop.grid) cellByKey.set(`${c.topic}|${c.value}`, c);

  return (
    <div
      className="h-full w-full overflow-y-auto p-3 md:p-6"
      style={{
        background:
          'linear-gradient(135deg, rgba(45,15,40,0.95) 0%, rgba(15,14,23,1) 50%, rgba(60,12,18,0.9) 100%)',
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BossBar boss={jcoop.boss} floats={floatingDamages.filter((d) => d.type === 'boss')} />
          <TeamBar
            players={players}
            activeId={activeId}
            helperIds={jcoop.current?.helperIds ?? []}
            myId={playerId}
            floats={floatingDamages.filter((d) => d.type === 'player')}
          />
        </div>

        {!jcoop.current && !jcoop.result && (
          <div
            className={`glass-panel rounded-2xl px-4 py-3 text-center ${
              iAmActive ? 'border border-amber-400/40 glow-gold' : 'border border-purple-500/30'
            }`}
          >
            {iAmActive ? (
              <div className="text-amber-200 font-bold">
                🎯 Твой ход! Выбери клетку — ты будешь отвечать.
              </div>
            ) : (
              <div className="text-purple-200 font-semibold">
                🎯 Ход игрока: <span className="text-white">{activeName}</span>
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Сыграно {jcoop.playedCount} / {jcoop.totalCells} клеток
            </div>
          </div>
        )}

        <JeopardyGrid
          cells={cellByKey}
          canPick={isMyTurnToPick}
          onPick={handlePick}
          revealKey={jcoop.reveal ? `${jcoop.reveal.topic}|${jcoop.reveal.value}` : null}
        />

        {jcoop.reveal && !jcoop.current && (
          <RevealBanner reveal={jcoop.reveal} players={players} myId={playerId} />
        )}

        {jcoop.result && (
          <div
            className={`glass-panel rounded-2xl p-6 text-center text-2xl font-bold ${
              jcoop.result === 'victory' ? 'glow-gold text-amber-300' : 'glow-red text-red-300'
            }`}
          >
            {jcoop.result === 'victory'
              ? '🏆 Дракон Невежества повержен!'
              : '💀 Дракон Невежества торжествует...'}
          </div>
        )}
      </div>

      {jcoop.current && phase === 'answering' && (
        <QuestionOverlay
          current={jcoop.current}
          gameStateTimer={gameState.timer}
          maxTimer={gameState.maxTimer}
          activeName={activeName}
          players={gameState.players}
          myId={playerId}
          me={me}
          onAnswer={handleAnswer}
        />
      )}
    </div>
  );
}

// ===================================================================
// Subcomponents
// ===================================================================

function BossBar({
  boss,
  floats,
}: {
  boss: JCoopSnapshot['boss'];
  floats: { key: string; amount: number }[];
}) {
  const pct = boss.max > 0 ? Math.max(0, Math.min(100, (boss.hp / boss.max) * 100)) : 0;
  const hit = floats.length > 0;

  return (
    <div
      className={`glass-panel rounded-2xl p-4 border border-red-500/30 relative overflow-hidden ${
        hit ? 'glow-red' : ''
      }`}
      style={{
        background: 'linear-gradient(135deg, rgba(80,10,20,0.9), rgba(40,5,15,0.9))',
        animation: hit ? 'shake 0.4s' : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-5xl md:text-6xl" style={{ animation: 'monsterIdle 2.4s ease-in-out infinite' }}>
          {boss.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-red-200 text-lg truncate">{boss.name}</div>
          <div className="hp-bar bg-black/40 rounded-full h-4 mt-1 overflow-hidden border border-red-700/50">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #b91c1c, #ef4444, #f97316)',
                boxShadow: '0 0 10px rgba(239,68,68,0.6)',
              }}
            />
          </div>
          <div className="text-xs text-red-200/80 mt-1 font-mono">
            HP: {boss.hp} / {boss.max}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
        {floats.map((f) => (
          <div
            key={f.key}
            className="absolute top-2 text-3xl font-black text-yellow-300"
            style={{ animation: 'floatUp 1s forwards', textShadow: '0 0 8px rgba(0,0,0,0.7)' }}
          >
            -{f.amount}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamBar({
  players,
  activeId,
  helperIds,
  myId,
  floats,
}: {
  players: Player[];
  activeId: string | null;
  helperIds: string[];
  myId: string;
  floats: { key: string; amount: number; playerId?: string }[];
}) {
  return (
    <div className="glass-panel rounded-2xl p-3 border border-purple-500/30">
      <div className="text-xs uppercase tracking-wide text-purple-300/80 font-bold mb-2">
        Команда
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map((p) => {
          const pct = p.maxPersonalHp > 0 ? (p.personalHp / p.maxPersonalHp) * 100 : 0;
          const isMe = p.id === myId;
          const isActive = p.id === activeId;
          const isHelper = helperIds.includes(p.id);
          const myFloats = floats.filter((f) => f.playerId === p.id);
          return (
            <div
              key={p.id}
              className={`relative rounded-xl p-2 border ${
                p.isAlive
                  ? isActive
                    ? 'border-amber-400/60 bg-amber-500/10'
                    : isHelper
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-white/10 bg-black/20'
                  : 'border-gray-700 bg-black/40 opacity-50'
              } ${isMe ? 'ring-2 ring-blue-400/40' : ''}`}
              style={{ animation: myFloats.length > 0 ? 'shake 0.4s' : undefined }}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="font-semibold text-sm truncate">
                  {isActive && '🎯 '}
                  {isHelper && '🤝 '}
                  {p.name}
                  {p.isBot && <span className="text-xs text-gray-400"> (бот)</span>}
                </div>
                {!p.isAlive && <span className="text-xs text-gray-500">мёртв</span>}
              </div>
              <div className="hp-bar bg-black/50 rounded-full h-2 mt-1 overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, pct)}%`,
                    background: pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444',
                  }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                {p.personalHp} / {p.maxPersonalHp}
              </div>
              {myFloats.map((f) => (
                <div
                  key={f.key}
                  className="absolute -top-2 right-2 text-xl font-black text-red-400 pointer-events-none"
                  style={{ animation: 'floatUp 1s forwards', textShadow: '0 0 6px rgba(0,0,0,0.7)' }}
                >
                  -{f.amount}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JeopardyGrid({
  cells,
  canPick,
  onPick,
  revealKey,
}: {
  cells: Map<string, JCoopCell>;
  canPick: boolean;
  onPick: (topic: JCoopTopic, value: JCoopValue) => void;
  revealKey: string | null;
}) {
  // Topic order = server grid order (topic-major), so first-seen order is stable.
  const TOPICS: JCoopTopic[] = [];
  for (const c of cells.values()) {
    if (!TOPICS.includes(c.topic)) TOPICS.push(c.topic);
  }
  return (
    <div className="glass-panel rounded-2xl p-3 md:p-4 border border-purple-500/20">
      <div className="grid gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(TOPICS.length, 1)}, minmax(0, 1fr))` }}>
        {TOPICS.map((t) => (
          <div
            key={t}
            className="text-center text-[10px] md:text-sm font-bold py-2 px-1 uppercase tracking-wide truncate"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(60,20,80,0.4))',
              borderRadius: '0.5rem',
              color: '#e9d5ff',
              textShadow: '0 0 8px rgba(168,85,247,0.4)',
            }}
            title={t}
          >
            {t}
          </div>
        ))}
        {VALUES.map((v) =>
          TOPICS.map((t) => {
            const key = `${t}|${v}`;
            const cell = cells.get(key);
            const played = !!cell?.played;
            const isReveal = revealKey === key;
            const info = LEVEL_INFO[v];
            return (
              <button
                key={key}
                disabled={played || !canPick}
                onClick={() => onPick(t, v)}
                className={`relative aspect-[4/3] rounded-xl flex flex-col items-center justify-center transition-all overflow-hidden ${
                  played
                    ? 'bg-black/40 border border-gray-700 text-gray-600 cursor-not-allowed'
                    : canPick
                    ? 'cursor-pointer hover:scale-[1.04] active:scale-95 shadow-lg'
                    : 'cursor-default'
                } ${isReveal ? 'ring-2 ring-yellow-400 glow-gold' : ''}`}
                style={
                  played
                    ? undefined
                    : {
                        background:
                          'linear-gradient(135deg, rgba(40,15,80,0.9), rgba(20,8,40,0.9))',
                        border: '1px solid rgba(168,85,247,0.4)',
                        boxShadow: canPick
                          ? '0 0 16px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                      }
                }
                title={info.short}
              >
                <div
                  className={`text-lg md:text-2xl font-black ${
                    played ? 'text-gray-700 line-through' : 'text-amber-300'
                  }`}
                  style={!played ? { textShadow: '0 0 10px rgba(245,197,24,0.6)' } : undefined}
                >
                  {v}
                </div>
                {!played && (
                  <div className="absolute top-1 right-1 text-xs md:text-sm" title={info.description}>
                    {info.icon}
                  </div>
                )}
              </button>
            );
          }),
        )}
      </div>
      {canPick && (
        <div className="text-[11px] text-gray-400 mt-3 text-center">
          🤝 100 — вся команда помогает &nbsp;·&nbsp; 🔇 200 — все молчат &nbsp;·&nbsp;
          🌀 300 — голос/видео искажены &nbsp;·&nbsp; 🎯 400 — 1 помощник &nbsp;·&nbsp; 🐲 500 — один в поле
        </div>
      )}
    </div>
  );
}

function QuestionOverlay({
  current,
  gameStateTimer,
  maxTimer,
  activeName,
  players,
  myId,
  me,
  onAnswer,
}: {
  current: NonNullable<JCoopSnapshot['current']>;
  gameStateTimer: number;
  maxTimer: number;
  activeName: string;
  players: Record<string, Player>;
  myId: string;
  me: Player | undefined;
  onAnswer: (i: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [current.text]);

  const iAmActive = current.activeId === myId;
  const iAmHelper = current.helperIds.includes(myId);
  const canAnswer = iAmActive && me?.isAlive;

  const info = LEVEL_INFO[current.level];
  const helperNames = current.helperIds
    .map((id) => players[id]?.name)
    .filter(Boolean) as string[];

  const timerPct = maxTimer > 0 ? (gameStateTimer / maxTimer) * 100 : 0;

  return (
    <div
      className="fixed inset-y-0 left-0 right-0 md:right-72 z-40 flex items-center justify-center p-3"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(40,5,30,0.95) 0%, rgba(10,5,15,0.98) 80%)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div className="glass-panel rounded-3xl p-5 md:p-7 max-w-3xl w-full border border-purple-500/40 shadow-2xl relative">
        <div className="flex flex-wrap gap-2 mb-3 justify-center">
          <span
            className="px-3 py-1 rounded-full text-sm font-bold"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(60,20,80,0.4))',
              border: '1px solid rgba(168,85,247,0.4)',
              color: '#e9d5ff',
            }}
          >
            {current.topic} • {current.value}
          </span>
          <span
            className="px-3 py-1 rounded-full text-sm font-bold border"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(244,114,182,0.4)',
              color: '#fbcfe8',
            }}
          >
            {info.icon} {info.short}
          </span>
        </div>

        {/* Active / helpers banner */}
        <div className="rounded-xl px-4 py-3 text-center mb-3 border bg-amber-500/10 border-amber-400/40">
          {iAmActive ? (
            <div className="text-amber-200 font-bold">
              🎯 Твой ход! Отвечаешь только ты.
            </div>
          ) : (
            <div className="text-amber-200/90 font-semibold text-sm">
              🎯 Отвечает: <span className="text-white">{activeName}</span>
            </div>
          )}
          <div className="text-xs text-amber-100/70 mt-1">{info.description}</div>
          {current.helperIds.length > 0 && (
            <div className="text-xs text-emerald-200/90 mt-1">
              🤝 {iAmHelper ? 'Ты можешь помогать голосом!' : `Помогает: ${helperNames.join(', ')}`}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
            <span>Время</span>
            <span className={gameStateTimer <= 5 ? 'text-red-400 font-bold' : ''}>
              {gameStateTimer}с
            </span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.max(0, timerPct)}%`,
                background:
                  timerPct > 50
                    ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                    : timerPct > 25
                    ? 'linear-gradient(90deg, #facc15, #fb923c)'
                    : 'linear-gradient(90deg, #ef4444, #b91c1c)',
              }}
            />
          </div>
        </div>

        <div
          className="text-lg md:text-2xl font-bold text-white text-center mb-5 leading-relaxed"
          style={{ textShadow: '0 2px 16px rgba(168,85,247,0.5)' }}
        >
          {current.text}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {current.options.map((opt, i) => {
            const disabled = !canAnswer || picked !== null;
            const selected = picked === i;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setPicked(i);
                  onAnswer(i);
                }}
                className={`p-4 rounded-xl text-left font-semibold transition-all ${
                  disabled
                    ? selected
                      ? 'bg-purple-500/30 border-2 border-purple-300/60 text-white'
                      : 'bg-black/30 border border-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-black/40 border border-purple-400/30 text-white hover:bg-purple-500/20 hover:border-purple-300/60 hover:scale-[1.02] active:scale-95'
                }`}
              >
                <span className="font-mono text-purple-300 mr-2">
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {!canAnswer && (
          <div className="text-center text-sm text-gray-400 mt-4">
            {!me?.isAlive
              ? 'Ты пал в бою. Наблюдай за командой.'
              : `Отвечает только активный игрок: ${activeName}`}
          </div>
        )}
        {canAnswer && picked !== null && (
          <div className="text-center text-sm text-purple-300 mt-4">
            Ответ зафиксирован: {String.fromCharCode(65 + picked)}
          </div>
        )}
      </div>
    </div>
  );
}

function RevealBanner({
  reveal,
  players,
  myId,
}: {
  reveal: NonNullable<JCoopSnapshot['reveal']>;
  players: Player[];
  myId: string;
}) {
  const ok = reveal.isCorrect;
  const activeName = players.find((p) => p.id === reveal.activeId)?.name ?? '?';
  return (
    <div
      className={`glass-panel rounded-2xl p-4 border ${
        ok ? 'border-amber-400/40 glow-gold' : 'border-red-500/40 glow-red'
      }`}
      style={{ animation: 'fadeIn 0.3s ease-out' }}
    >
      <div className="text-center">
        <div className="text-sm text-gray-400 mb-1">
          {reveal.topic} • {reveal.value}
        </div>
        <div className={`text-lg font-bold ${ok ? 'text-amber-300' : 'text-red-300'}`}>
          {ok
            ? `🗡️ ${activeName} попал! Урон по боссу: ${reveal.damageToBoss}`
            : `❌ ${activeName} ошибся.`}
        </div>
        {reveal.damageToActive > 0 && (
          <div className="text-sm text-red-300/80 mt-1">
            🔥 Урон по {reveal.activeId === myId ? 'тебе' : activeName}: {reveal.damageToActive}
          </div>
        )}
        {reveal.deaths.length > 0 && (
          <div className="text-sm text-gray-400 mt-1">
            💀 Погибли:{' '}
            {reveal.deaths
              .map((id) => players.find((p) => p.id === id)?.name ?? '?')
              .join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
