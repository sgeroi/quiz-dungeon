import { useMemo } from 'react';
import { useStore } from '../../store';
import { PresenterTimer } from '../DefaultPresenter';
import type { Player } from '../../types';

/** Bot names already carry the robot emoji; only prefix when they don't. */
const botMark = (p?: Pick<Player, 'isBot' | 'name'> | null) => (p?.isBot && !p.name.includes('🤖') ? '🤖 ' : '');

/**
 * TV presenter for the 'topic-split' mode ("Темы по группам").
 * Reads only the room-broadcast snapshot gameState.topicSplit. Correct answers
 * (lastCorrect) are only present in the snapshot during 'results'.
 */

interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
}

interface TopicSplitSnapshot {
  phase: 'pick' | 'question' | 'results' | 'finished';
  topics: string[];
  assignments: Record<string, string>;
  round: number;
  total: number;
  boss: { hp: number; max: number };
  scores: Record<string, number>;
  currentQuestions: Record<string, PublicQuestion>;
  currentVotes: Record<string, number>;
  lastChoice: Record<string, number>;
  lastCorrect: Record<string, number>;
  lastResult: Record<string, boolean>;
}

const KNOWN_TOPIC_EMOJI: Record<string, string> = {
  'История': '📚', 'Наука': '🧪', 'Кино': '🎬', 'Спорт': '⚽', 'География': '🌍',
  'Музыка': '🎵', 'Литература': '📖', 'Технологии': '💻', 'Природа': '🌿', 'Искусство': '🎨',
};
const topicEmoji = (t: string) => KNOWN_TOPIC_EMOJI[t] ?? '📌';

const TOPIC_COLORS = [
  { border: 'rgba(255,219,16,0.55)', bg: 'rgba(255,219,16,0.10)', text: '#FFDB10' },
  { border: 'rgba(141,255,133,0.55)', bg: 'rgba(141,255,133,0.10)', text: '#8DFF85' },
  { border: 'rgba(255,60,174,0.55)', bg: 'rgba(255,60,174,0.10)', text: '#FF8AD0' },
  { border: 'rgba(117,191,255,0.55)', bg: 'rgba(117,191,255,0.10)', text: '#75BFFF' },
  { border: 'rgba(205,142,255,0.55)', bg: 'rgba(205,142,255,0.10)', text: '#CD8EFF' },
  { border: 'rgba(255,170,80,0.55)', bg: 'rgba(255,170,80,0.10)', text: '#FFAA50' },
];
const topicColor = (topics: string[], t: string) => TOPIC_COLORS[Math.max(0, topics.indexOf(t)) % TOPIC_COLORS.length];

const LETTERS = ['A', 'B', 'C', 'D'];

function gridCols(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 2;
  return 3;
}

export default function TopicSplitPresenter() {
  const gameState = useStore((s) => s.gameState);
  const ts = (gameState as unknown as { topicSplit?: TopicSplitSnapshot } | null)?.topicSplit ?? null;

  const players = useMemo(() => (gameState ? Object.values(gameState.players) : []), [gameState]);
  const byTopic = useMemo(() => {
    const m: Record<string, Player[]> = {};
    if (!ts) return m;
    for (const t of ts.topics) m[t] = [];
    for (const p of players) {
      const t = ts.assignments[p.id];
      if (!t) continue;
      (m[t] ??= []).push(p);
    }
    return m;
  }, [ts, players]);

  if (!gameState || !ts) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
        <div className="text-[120px] leading-none">📚</div>
        <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">Темы по группам</div>
        <div className="text-[36px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">Готовимся…</div>
      </div>
    );
  }

  const isPick = ts.phase === 'pick';
  const isResults = ts.phase === 'results';
  const bossPct = ts.boss.max > 0 ? Math.max(0, Math.min(100, (ts.boss.hp / ts.boss.max) * 100)) : 0;
  const roundNo = Math.min(ts.round + 1, ts.total);

  return (
    <div className="h-full flex flex-col gap-5 px-10 pb-8 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
            {isPick ? 'Выбор тем' : isResults ? 'Результаты раунда' : 'Отвечаем!'}
          </div>
          <div className="text-[44px] font-black leading-tight">📚 Темы по группам</div>
          <div className="text-[26px] font-bold text-[var(--color-dungeon-gold)]">
            {isPick ? `${ts.total} раундов · внутри группы — общение, между — изоляция` : `Раунд ${roundNo} из ${ts.total}`}
          </div>
        </div>

        {!isPick && (
          <div className="flex items-center gap-5 glass-panel-gold px-8 py-4">
            <span className="text-[64px] leading-none">👹</span>
            <div>
              <div className="text-[28px] font-black">Босс</div>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-[420px] h-5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-[#FF4848] transition-[width] duration-700" style={{ width: `${bossPct}%` }} />
                </div>
                <span className="text-[24px] font-bold tabular-nums text-white/80">{ts.boss.hp}/{ts.boss.max}</span>
              </div>
            </div>
          </div>
        )}

        <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
      </div>

      {isPick ? (
        <PickView ts={ts} players={players} byTopic={byTopic} />
      ) : (
        <RoundView ts={ts} byTopic={byTopic} isResults={isResults} />
      )}
    </div>
  );
}

// ---------- Pick phase ----------

function PickView({ ts, players, byTopic }: { ts: TopicSplitSnapshot; players: Player[]; byTopic: Record<string, Player[]> }) {
  const undecided = players.filter((p) => !ts.assignments[p.id]);
  const cols = Math.min(3, Math.max(1, ts.topics.length));
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-5">
      <div className="text-center text-[34px] font-extrabold">
        Выберите тему на телефоне — {undecided.length === 0 ? 'все определились!' : `ещё думают: ${undecided.map((p) => p.name).join(', ')}`}
      </div>
      <div className="flex-1 min-h-0 grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {ts.topics.map((t) => {
          const c = topicColor(ts.topics, t);
          const members = byTopic[t] ?? [];
          return (
            <div key={t} className="rounded-3xl p-7 flex flex-col gap-4 border" style={{ borderColor: c.border, background: c.bg }}>
              <div className="flex items-center gap-4">
                <span className="text-[64px] leading-none">{topicEmoji(t)}</span>
                <div className="min-w-0">
                  <div className="text-[36px] font-black leading-tight truncate" style={{ color: c.text }}>{t}</div>
                  <div className="text-[22px] font-bold text-white/60">
                    {members.length === 0 ? 'пока никого' : `${members.length} в группе`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((p) => (
                  <span key={p.id} className="rounded-full bg-black/35 px-4 py-1.5 text-[24px] font-extrabold">
                    {botMark(p)}{p.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Question / results ----------

function RoundView({ ts, byTopic, isResults }: { ts: TopicSplitSnapshot; byTopic: Record<string, Player[]>; isResults: boolean }) {
  const active = ts.topics.filter((t) => (byTopic[t] ?? []).length > 0);
  const n = active.length;
  const cols = gridCols(n);
  const qSize = n <= 2 ? 34 : n <= 4 ? 27 : 22;
  const optSize = n <= 2 ? 27 : n <= 4 ? 22 : 19;
  const compact = n > 4;

  return (
    <div className="flex-1 min-h-0 grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {active.map((t) => {
        const c = topicColor(ts.topics, t);
        const members = byTopic[t] ?? [];
        const q = ts.currentQuestions[t];
        const voted = members.filter((p) => typeof ts.currentVotes[p.id] === 'number').length;
        const counts = [0, 0, 0, 0];
        for (const p of members) {
          const v = ts.currentVotes[p.id];
          if (typeof v === 'number' && v >= 0 && v < 4) counts[v]++;
        }
        const correct = isResults ? ts.lastCorrect[t] : undefined;
        const choice = isResults ? ts.lastChoice[t] : undefined;
        const ok = isResults ? ts.lastResult[t] : undefined;

        return (
          <div key={t} className="rounded-3xl border flex flex-col gap-3 min-h-0 overflow-hidden" style={{ borderColor: c.border, background: c.bg, padding: compact ? 18 : 24 }}>
            {/* Topic header */}
            <div className="flex items-center gap-3">
              <span className="leading-none" style={{ fontSize: compact ? 34 : 44 }}>{topicEmoji(t)}</span>
              <div className="flex-1 min-w-0 font-black leading-tight truncate" style={{ color: c.text, fontSize: compact ? 26 : 32 }}>{t}</div>
              <div className="rounded-full bg-black/35 px-4 py-1 font-black text-[var(--color-dungeon-gold)] tabular-nums" style={{ fontSize: compact ? 20 : 24 }}>
                {ts.scores[t] ?? 0} очк.
              </div>
            </div>

            {/* Members */}
            <div className="flex flex-wrap gap-1.5">
              {members.map((p) => {
                const v = ts.currentVotes[p.id];
                const has = typeof v === 'number';
                const right = isResults && has && v === correct;
                return (
                  <span
                    key={p.id}
                    className={`rounded-full px-3 py-0.5 font-extrabold ${
                      isResults
                        ? right ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/20 text-[#FF9A9A]'
                        : has ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-black/35 text-white/60'
                    }`}
                    style={{ fontSize: compact ? 16 : 19 }}
                  >
                    {botMark(p)}{p.name}{isResults ? (has ? ` ${LETTERS[v]}` : ' —') : has ? ' ✓' : ' …'}
                  </span>
                );
              })}
              {!isResults && (
                <span className="rounded-full px-3 py-0.5 font-bold text-white/50" style={{ fontSize: compact ? 16 : 19 }}>
                  {voted}/{members.length}
                </span>
              )}
            </div>

            {/* Question */}
            {q ? (
              <>
                <div className="font-extrabold leading-[1.2]" style={{ fontSize: qSize }}>{q.text}</div>
                <div className="flex flex-col gap-2 flex-1 min-h-0">
                  {q.options.map((opt, i) => {
                    const isCorrect = isResults && correct === i;
                    const isWrongPick = isResults && !isCorrect && choice === i;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-2 border ${
                          isCorrect
                            ? 'bg-[var(--color-dungeon-heal)]/20 border-[var(--color-dungeon-heal)]'
                            : isWrongPick
                              ? 'bg-[#FF4848]/15 border-[#FF4848]/70'
                              : isResults ? 'bg-black/20 border-white/5 opacity-50' : 'bg-black/25 border-white/10'
                        }`}
                      >
                        <span className={`shrink-0 rounded-xl flex items-center justify-center font-black ${isCorrect ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]' : 'bg-white/10 text-white'}`} style={{ width: optSize + 16, height: optSize + 16, fontSize: optSize - 4 }}>
                          {LETTERS[i]}
                        </span>
                        <span className="flex-1 font-bold leading-tight" style={{ fontSize: optSize }}>{opt}</span>
                        {counts[i] > 0 && (
                          <span className="rounded-full bg-black/40 px-3 font-black tabular-nums text-white/80" style={{ fontSize: optSize - 4 }}>
                            {counts[i]}
                          </span>
                        )}
                        {isCorrect && <span className="text-[var(--color-dungeon-heal)] font-black" style={{ fontSize: optSize + 6 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
                {isResults && (
                  <div className={`rounded-2xl px-4 py-2 text-center font-black ${ok ? 'bg-[var(--color-dungeon-heal)]/20 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/20 text-[#FF9A9A]'}`} style={{ fontSize: compact ? 20 : 24 }}>
                    {ok ? '+1 очко · урон боссу' : choice === undefined || choice < 0 ? 'Группа не ответила — урон команде' : 'Мимо — урон команде'}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-white/50 font-bold" style={{ fontSize: qSize }}>Ждём вопрос…</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
