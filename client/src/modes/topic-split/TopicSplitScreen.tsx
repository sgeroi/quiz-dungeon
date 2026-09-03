import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';

// ---------- Types mirroring the server snapshot ----------

// Topics come from the content pack, so any string is a valid topic name.
type TopicName = string;

interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
}

interface BossSnapshot {
  hp: number;
  max: number;
}

interface TopicSplitSnapshot {
  phase: 'pick' | 'question' | 'results' | 'finished';
  topics: TopicName[];
  assignments: Record<string, TopicName>;
  round: number;
  total: number;
  boss: BossSnapshot;
  scores: Record<string, number>;
  currentQuestions: Record<string, PublicQuestion>;
  currentVotes: Record<string, number>;
  lastChoice: Record<string, number>;
  lastCorrect: Record<string, number>;
  lastResult: Record<string, boolean>;
}

const KNOWN_TOPIC_EMOJI: Record<string, string> = {
  'История': '📚',
  'Наука': '🧪',
  'Кино': '🎬',
  'Спорт': '⚽',
  'География': '🌍',
  'Музыка': '🎵',
  'Литература': '📖',
  'Технологии': '💻',
  'Природа': '🌿',
  'Искусство': '🎨',
};
const DEFAULT_TOPIC_EMOJI = '📌';

const TOPIC_GRADIENTS = [
  'from-amber-500/30 to-orange-600/20 border-amber-400/40',
  'from-emerald-500/30 to-teal-600/20 border-emerald-400/40',
  'from-rose-500/30 to-fuchsia-600/20 border-rose-400/40',
  'from-sky-500/30 to-indigo-600/20 border-sky-400/40',
  'from-violet-500/30 to-purple-600/20 border-violet-400/40',
  'from-lime-500/30 to-green-600/20 border-lime-400/40',
];

/** Emoji for a topic: known names get a themed one, everything else the default pin. */
const TOPIC_EMOJI: Record<TopicName, string> = new Proxy(KNOWN_TOPIC_EMOJI, {
  get: (target, key) => (typeof key === 'string' && target[key]) || DEFAULT_TOPIC_EMOJI,
});

/** Gradient by topic position in the pack's topic list (stable per game). */
function topicGradient(topics: TopicName[], t: TopicName): string {
  const idx = Math.max(0, topics.indexOf(t));
  return TOPIC_GRADIENTS[idx % TOPIC_GRADIENTS.length];
}

const LETTERS = ['A', 'B', 'C', 'D'];

// ---------- Component ----------

export default function TopicSplitScreen() {
  const gameState = useStore((s) => s.gameState);
  const myId = useStore((s) => s.playerId);
  const phase = gameState?.phase;
  const ts = (gameState as any)?.topicSplit as TopicSplitSnapshot | undefined;

  // Per-question private question payload (server emits to each player privately).
  const [myQuestion, setMyQuestion] = useState<{
    topic: TopicName;
    question: PublicQuestion;
    round: number;
  } | null>(null);

  useEffect(() => {
    function onQ(payload: {
      topic: TopicName;
      question: PublicQuestion;
      round: number;
      total: number;
      timeLimit: number;
    }) {
      setMyQuestion({
        topic: payload.topic,
        question: payload.question,
        round: payload.round,
      });
    }
    socket.on('mode-topic-question' as any, onQ);
    return () => {
      socket.off('mode-topic-question' as any, onQ);
    };
  }, []);

  // Clear local question when round changes (so we re-render after results).
  useEffect(() => {
    if (ts?.phase === 'pick') setMyQuestion(null);
  }, [ts?.phase, ts?.round]);

  if (!gameState || !ts) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    );
  }

  if (ts.phase === 'finished' || phase === 'victory' || phase === 'defeat') {
    return <FinishedScreen ts={ts} />;
  }

  if (ts.phase === 'pick') {
    return <PickPhase ts={ts} myId={myId} />;
  }

  return (
    <GamePhase
      ts={ts}
      myId={myId}
      myQuestion={myQuestion}
    />
  );
}

// ---------- Pick phase ----------

function PickPhase({
  ts,
  myId,
}: {
  ts: TopicSplitSnapshot;
  myId: string | null;
}) {
  const gameState = useStore((s) => s.gameState);
  const timer = gameState?.timer ?? 0;
  const maxTimer = gameState?.maxTimer || 30;
  const timerPct = Math.max(0, Math.min(100, (timer / maxTimer) * 100));

  const myTopic = myId ? ts.assignments[myId] : undefined;

  function pick(topic: TopicName) {
    socket.emit('mode-topic-pick' as any, topic);
  }

  // Group players by topic for display.
  const byTopic: Record<string, { id: string; name: string }[]> = {};
  for (const t of ts.topics) byTopic[t] = [];
  for (const [pid, t] of Object.entries(ts.assignments)) {
    const player = gameState?.players[pid];
    if (!player) continue;
    if (!byTopic[t]) byTopic[t] = [];
    byTopic[t].push({ id: pid, name: player.name });
  }

  return (
    <div className="min-h-full p-6 flex flex-col">
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-black mb-2 bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
            Выбор темы
          </h1>
          <p className="text-gray-400 text-sm">
            Кооператив. Игроки делятся на темные группы. Внутри группы — общение, между — изоляция.
          </p>
        </div>

        {/* Timer */}
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex justify-between items-center mb-2 text-sm text-gray-300">
            <span>До конца выбора</span>
            <span className={`font-bold tabular-nums ${timer <= 5 ? 'text-red-400' : 'text-white'}`}>
              {timer}s
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${timer <= 5 ? 'bg-red-400' : 'bg-gradient-to-r from-purple-400 to-pink-400'}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>

        {/* Topic cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ts.topics.map((t) => {
            const isMine = myTopic === t;
            const members = byTopic[t] ?? [];
            return (
              <button
                key={t}
                onClick={() => pick(t)}
                className={`glass-panel rounded-2xl p-6 text-left transition-all border bg-gradient-to-br ${topicGradient(ts.topics, t)} ${
                  isMine ? 'ring-2 ring-white/60 scale-[1.01]' : 'hover:scale-[1.01] hover:ring-1 hover:ring-white/30'
                }`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-5xl drop-shadow-lg">{TOPIC_EMOJI[t]}</span>
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-white">{t}</div>
                    <div className="text-xs text-white/60 mt-1">
                      {members.length === 0
                        ? 'Никто не выбрал'
                        : `${members.length} игрок${members.length === 1 ? '' : members.length < 5 ? 'а' : 'ов'}`}
                    </div>
                  </div>
                  {isMine && (
                    <span className="text-xs bg-white/20 text-white rounded-full px-3 py-1 font-bold">
                      ВЫ ЗДЕСЬ
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {members.map((m) => (
                    <span
                      key={m.id}
                      className={`text-xs rounded-full px-2.5 py-1 font-medium ${
                        m.id === myId
                          ? 'bg-white/30 text-white'
                          : 'bg-black/30 text-white/80'
                      }`}
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-500">
          Кликните карточку, чтобы (пере)выбрать тему. Если не успеете — тему назначат случайно.
        </p>
      </div>
    </div>
  );
}

// ---------- Game phase ----------

function GamePhase({
  ts,
  myId,
  myQuestion,
}: {
  ts: TopicSplitSnapshot;
  myId: string | null;
  myQuestion: { topic: TopicName; question: PublicQuestion; round: number } | null;
}) {
  const gameState = useStore((s) => s.gameState);
  const timer = gameState?.timer ?? 0;
  const maxTimer = gameState?.maxTimer || 25;
  const timerPct = Math.max(0, Math.min(100, (timer / maxTimer) * 100));

  const myTopic: TopicName | undefined = myId ? ts.assignments[myId] : undefined;

  // Resolve question — prefer the privately-emitted one, fall back to snapshot.
  const fromSnapshot = myTopic ? ts.currentQuestions[myTopic] : undefined;
  const question: PublicQuestion | undefined = myQuestion?.question ?? fromSnapshot;
  const showResult = ts.phase === 'results';

  const myVote = myId ? ts.currentVotes[myId] : undefined;
  const hasVoted = typeof myVote === 'number';

  // Vote tally for my group (showing counts per option, not who voted what).
  const groupMembers = Object.entries(ts.assignments)
    .filter(([_pid, t]) => t === myTopic)
    .map(([pid]) => pid);
  const tally: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const pid of groupMembers) {
    const v = ts.currentVotes[pid];
    if (typeof v === 'number') tally[v] = (tally[v] ?? 0) + 1;
  }

  function vote(idx: number) {
    if (showResult || hasVoted) return;
    socket.emit('mode-topic-vote' as any, idx);
  }

  // Boss bar.
  const bossPct = ts.boss.max > 0 ? Math.max(0, (ts.boss.hp / ts.boss.max) * 100) : 0;

  // Active topics (those any player is assigned to) — only show those on scoreboard.
  const activeTopicsSet = new Set(Object.values(ts.assignments));
  const activeTopics = ts.topics.filter((t) => activeTopicsSet.has(t));

  return (
    <div className="min-h-full p-4 md:p-6 flex flex-col">
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-4">
        {/* Boss + scoreboard header */}
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-4xl">👹</span>
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-300 mb-1">
                <span className="font-bold">Босс</span>
                <span className="tabular-nums">{ts.boss.hp} / {ts.boss.max}</span>
              </div>
              <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-red-500/20">
                <div
                  className="h-full bg-gradient-to-r from-red-600 via-red-500 to-rose-400 transition-all duration-700"
                  style={{ width: `${bossPct}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-400 text-right">
              <div>Раунд</div>
              <div className="text-white font-bold text-lg">
                {Math.min(ts.round + 1, ts.total)}/{ts.total}
              </div>
            </div>
          </div>

          {/* Topic scoreboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {activeTopics.map((t) => (
              <div
                key={t}
                className={`rounded-lg border bg-gradient-to-br ${topicGradient(ts.topics, t)} px-3 py-2 ${
                  t === myTopic ? 'ring-2 ring-white/40' : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">
                    {TOPIC_EMOJI[t]} {t}
                  </span>
                  <span className="text-white/80 tabular-nums font-bold">
                    {ts.scores[t] ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timer */}
        <div className="glass-panel rounded-xl p-3">
          <div className="flex justify-between items-center mb-1.5 text-xs text-gray-300">
            <span>{showResult ? 'Результаты' : 'Время на ответ'}</span>
            <span className={`font-bold tabular-nums ${timer <= 5 ? 'text-red-400' : 'text-white'}`}>
              {timer}s
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                showResult
                  ? 'bg-amber-400'
                  : timer <= 5
                  ? 'bg-red-400'
                  : 'bg-gradient-to-r from-purple-400 to-sky-400'
              }`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        {myTopic && question ? (
          <div className={`glass-panel rounded-2xl p-5 md:p-6 border bg-gradient-to-br ${topicGradient(ts.topics, myTopic)}`}>
            <div className="flex items-center gap-2 mb-3 text-sm font-bold text-white/90">
              <span className="text-2xl">{TOPIC_EMOJI[myTopic]}</span>
              <span>Тема: {myTopic}</span>
            </div>
            <h2 className="text-lg md:text-2xl font-bold text-white mb-5 leading-snug">
              {question.text}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {question.options.map((opt, i) => {
                const isMine = myVote === i;
                const isMajority = showResult && ts.lastChoice[myTopic] === i;
                const isCorrect = showResult && ts.lastCorrect[myTopic] === i;
                let extra = '';
                if (showResult) {
                  if (isCorrect) extra = 'ring-2 ring-emerald-400 bg-emerald-500/20';
                  else if (isMajority) extra = 'ring-2 ring-rose-400 bg-rose-500/20';
                } else if (isMine) {
                  extra = 'ring-2 ring-white/70 bg-white/10';
                }
                return (
                  <button
                    key={i}
                    onClick={() => vote(i)}
                    disabled={showResult || hasVoted}
                    className={`relative text-left p-4 rounded-xl border border-white/10 bg-black/30 transition-all
                      ${extra}
                      ${(showResult || hasVoted) ? 'cursor-default' : 'hover:bg-white/10 hover:border-white/30'}
                      disabled:opacity-90`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white font-black">
                        {LETTERS[i]}
                      </span>
                      <span className="flex-1 text-white">{opt}</span>
                      <span className="text-xs text-white/70 tabular-nums">
                        {tally[i] ?? 0}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Group status */}
            <div className="mt-5">
              <div className="text-xs text-white/70 mb-2 font-bold">Ваша группа:</div>
              <div className="flex flex-wrap gap-2">
                {groupMembers.map((pid) => {
                  const p = gameState?.players[pid];
                  if (!p) return null;
                  const voted = typeof ts.currentVotes[pid] === 'number';
                  return (
                    <span
                      key={pid}
                      className={`text-xs rounded-full px-2.5 py-1 font-medium border ${
                        voted
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                          : 'bg-black/30 border-white/10 text-white/70'
                      }`}
                    >
                      {p.name} · {voted ? 'Готов' : 'Думает...'}
                    </span>
                  );
                })}
              </div>
            </div>

            {showResult && (
              <div className="mt-4 text-center text-sm font-bold">
                {ts.lastResult[myTopic] ? (
                  <span className="text-emerald-300">+1 очко! Урон боссу −50</span>
                ) : (
                  <span className="text-rose-300">Ошибка. Команда теряет 20 HP</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl p-6 text-center text-gray-400">
            Ожидаем вопрос...
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Finished ----------

function FinishedScreen({ ts }: { ts: TopicSplitSnapshot }) {
  const victory = ts.boss.hp <= 0;
  const activeTopicsSet = new Set(Object.values(ts.assignments));
  const activeTopics = ts.topics.filter((t) => activeTopicsSet.has(t));

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full glass-panel rounded-2xl p-6 text-center">
        <div className="text-7xl mb-4">{victory ? '🏆' : '💀'}</div>
        <h1 className={`text-3xl font-black mb-2 ${victory ? 'text-amber-300' : 'text-red-400'}`}>
          {victory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
        </h1>
        <p className="text-gray-400 text-sm mb-5">
          {victory ? 'Босс повержен!' : 'Босс выжил...'}
        </p>

        <div className="rounded-xl bg-black/30 border border-white/10 p-4 mb-4">
          <div className="text-xs text-gray-400 mb-2">HP босса</div>
          <div className="text-2xl font-bold text-white">
            {ts.boss.hp} / {ts.boss.max}
          </div>
        </div>

        <div className="space-y-2">
          {activeTopics.map((t) => (
            <div
              key={t}
              className={`rounded-lg border bg-gradient-to-br ${topicGradient(ts.topics, t)} px-3 py-2 flex items-center justify-between`}
            >
              <span className="font-bold text-white">
                {TOPIC_EMOJI[t]} {t}
              </span>
              <span className="text-white tabular-nums font-bold">
                {ts.scores[t] ?? 0} / {ts.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
