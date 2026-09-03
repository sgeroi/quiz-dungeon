import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import { PresenterTimer } from '../DefaultPresenter';
import type { Player } from '../../types';

/** Bot names already carry the robot emoji; only prefix when they don't. */
const botMark = (p?: Pick<Player, 'isBot' | 'name'> | null) => (p?.isBot && !p.name.includes('🤖') ? '🤖 ' : '');

/**
 * TV presenter for the 'spy' mode ("Квиз-мафия").
 * Subscribes to the same room-broadcast events as SpyScreen, minus the personal
 * ones (role, answer leak). The spy's identity is NEVER shown before the
 * 'mode-spy-game-over' event — gameState.spyId is deliberately ignored.
 */

interface SpyQuestionPayload {
  round: number;
  totalRounds: number;
  question: { id: string; text: string; options: string[] };
  timeLimit: number;
}

interface SpyResultsPayload {
  round: number;
  correctIndex: number;
  answers: Record<string, number | null>;
  teamScore: number;
  spyScore: number;
  winner: 'team' | 'spy' | 'tie';
}

interface SpyVotingPayload {
  timeLimit: number;
  players: Array<{ id: string; name: string }>;
  round?: number;
  totalRounds?: number;
  eliminated?: Record<string, boolean>;
}

interface SpyEliminationPayload {
  eliminatedId: string | null;
  eliminatedName: string | null;
  wasSpy: boolean;
  tally: Record<string, number>;
  votes?: Record<string, string | null>;
  round: number;
}

interface SpyGameOverPayload {
  teamWon: boolean;
  reason?: 'spy-voted-out' | 'spy-eliminated' | 'team-eliminated' | 'rounds-exhausted';
  spyId?: string;
  spyName?: string;
  teamScore: number;
  spyScore: number;
  votes: Record<string, string | null>;
  tally: Record<string, number>;
  eliminated?: Record<string, boolean>;
}

interface SpyStatePayload {
  teamScore: number;
  spyScore: number;
  round: number;
  totalRounds: number;
  phase: 'role-reveal' | 'question' | 'results' | 'voting' | 'finished';
  answers: Record<string, number | null>;
  votes: Record<string, boolean>;
  eliminated?: Record<string, boolean>;
}

type View = 'intro' | 'question' | 'results' | 'voting' | 'elimination' | 'finished';

const LETTERS = ['A', 'B', 'C', 'D'];

const REASON_TEXT: Record<NonNullable<SpyGameOverPayload['reason']>, string> = {
  'spy-voted-out': 'Команда вычислила шпиона голосованием',
  'spy-eliminated': 'Шпион выбыл',
  'team-eliminated': 'Команда выгнала всех, кроме шпиона',
  'rounds-exhausted': 'Раунды закончились — шпион остался нераскрытым',
};

function PlayerChip({ p, tone, suffix }: { p: Player; tone: 'ok' | 'bad' | 'muted' | 'plain'; suffix?: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-[var(--color-dungeon-heal)]/20 text-[var(--color-dungeon-heal)]'
      : tone === 'bad'
        ? 'bg-[#FF4848]/20 text-[#FF9A9A]'
        : tone === 'muted'
          ? 'bg-white/5 text-white/35 line-through'
          : 'bg-white/10 text-white';
  return (
    <span className={`rounded-full px-4 py-1 text-[22px] font-extrabold whitespace-nowrap ${cls}`}>
      {botMark(p)}{p.name}{suffix ?? ''}
    </span>
  );
}

export default function SpyPresenter() {
  const gameState = useStore((s) => s.gameState);

  const [spyState, setSpyState] = useState<SpyStatePayload | null>(null);
  const [question, setQuestion] = useState<SpyQuestionPayload | null>(null);
  const [results, setResults] = useState<SpyResultsPayload | null>(null);
  const [voting, setVoting] = useState<SpyVotingPayload | null>(null);
  const [elimination, setElimination] = useState<SpyEliminationPayload | null>(null);
  const [gameOver, setGameOver] = useState<SpyGameOverPayload | null>(null);
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    const onState = (d: SpyStatePayload) => setSpyState(d);
    const onQuestion = (d: SpyQuestionPayload) => {
      setQuestion(d);
      setResults(null);
      setView('question');
    };
    const onResults = (d: SpyResultsPayload) => {
      setResults(d);
      setView('results');
    };
    const onVoting = (d: SpyVotingPayload) => {
      setVoting(d);
      setView('voting');
    };
    const onElimination = (d: SpyEliminationPayload) => {
      setElimination(d);
      setView('elimination');
    };
    const onGameOver = (d: SpyGameOverPayload) => {
      setGameOver(d);
      setView('finished');
    };
    socket.on('mode-spy-state' as any, onState);
    socket.on('mode-spy-question' as any, onQuestion);
    socket.on('mode-spy-results' as any, onResults);
    socket.on('mode-spy-voting' as any, onVoting);
    socket.on('mode-spy-elimination' as any, onElimination);
    socket.on('mode-spy-game-over' as any, onGameOver);
    return () => {
      socket.off('mode-spy-state' as any, onState);
      socket.off('mode-spy-question' as any, onQuestion);
      socket.off('mode-spy-results' as any, onResults);
      socket.off('mode-spy-voting' as any, onVoting);
      socket.off('mode-spy-elimination' as any, onElimination);
      socket.off('mode-spy-game-over' as any, onGameOver);
    };
  }, []);

  const players = useMemo(() => (gameState ? Object.values(gameState.players) : []), [gameState]);

  if (!gameState) return null;

  // Screen joined mid-game: no event-driven view yet, derive it from the snapshot.
  const phase: View = view ?? (
    spyState?.phase === 'question' ? 'question'
      : spyState?.phase === 'results' ? 'results'
        : spyState?.phase === 'voting' ? 'voting'
          : spyState?.phase === 'finished' ? 'finished'
            : 'intro'
  );

  const eliminated = spyState?.eliminated ?? voting?.eliminated ?? {};
  const teamScore = spyState?.teamScore ?? results?.teamScore ?? 0;
  const spyScore = spyState?.spyScore ?? results?.spyScore ?? 0;
  const totalRounds = spyState?.totalRounds ?? question?.totalRounds ?? gameState.totalFloors ?? 8;
  const roundNo = question?.round ?? Math.max(1, (spyState?.round ?? 0) + (spyState?.phase === 'question' || spyState?.phase === 'results' ? 1 : 0));

  const roundLabel =
    phase === 'intro' ? 'Роли розданы'
      : phase === 'voting' || phase === 'elimination' ? `Голосование после раунда ${voting?.round ?? spyState?.round ?? roundNo} из ${totalRounds}`
        : phase === 'finished' ? 'Игра окончена'
          : `Раунд ${roundNo} из ${totalRounds}`;

  const phaseLabel =
    phase === 'question' ? 'Отвечаем!'
      : phase === 'results' ? 'Результаты'
        : phase === 'voting' ? 'Кто шпион?'
          : phase === 'elimination' ? 'Итог голосования'
            : phase === 'finished' ? 'Раскрытие'
              : 'Начало';

  return (
    <div className="h-full flex flex-col gap-5 px-10 pb-8 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">{phaseLabel}</div>
          <div className="text-[44px] font-black leading-tight">🕵️ Квиз-мафия</div>
          <div className="text-[26px] font-bold text-[var(--color-dungeon-gold)]">{roundLabel}</div>
        </div>

        {/* Score: team vs spy */}
        <div className="flex items-center gap-6">
          <div className="glass-panel px-8 py-3 flex items-center gap-4 border-[var(--color-dungeon-mana)]/40">
            <span className="text-[44px] leading-none">👥</span>
            <div>
              <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Команда</div>
              <div className="text-[52px] font-black leading-none text-[var(--color-dungeon-mana)] tabular-nums">{teamScore}</div>
            </div>
          </div>
          <div className="text-[40px] font-black text-white/40">:</div>
          <div className="glass-panel px-8 py-3 flex items-center gap-4 border-[var(--color-dungeon-purple)]/40">
            <div className="text-right">
              <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Шпион</div>
              <div className="text-[52px] font-black leading-none text-[var(--color-dungeon-purple)] tabular-nums">{spyScore}</div>
            </div>
            <span className="text-[44px] leading-none">🕵️</span>
          </div>
        </div>

        {phase === 'finished' ? (
          <div className="min-w-[160px] text-center text-[64px] leading-none">{gameOver?.teamWon ? '🏆' : '🕵️'}</div>
        ) : (
          <PresenterTimer timer={gameState.timer} maxTimer={gameState.maxTimer} />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col gap-5">
        {phase === 'intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
            <div className="text-[110px] leading-none">🕵️</div>
            <div className="text-[64px] font-black text-[var(--color-dungeon-gold)]">Один из вас — шпион</div>
            <div className="text-[30px] font-semibold text-[var(--color-dungeon-muted)] max-w-[1300px] leading-snug">
              Шпион видит правильный ответ заранее и хочет, чтобы команда ошибалась.
              После каждого раунда — голосование: угадаете шпиона — победа, ошибётесь — игрок выбывает.
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {players.map((p) => <PlayerChip key={p.id} p={p} tone="plain" />)}
            </div>
          </div>
        )}

        {(phase === 'question' || phase === 'results') && (
          <QuestionView
            players={players}
            question={question}
            results={phase === 'results' ? results : null}
            answered={spyState?.answers ?? {}}
            eliminated={eliminated}
          />
        )}

        {phase === 'voting' && (
          <VotingView players={players} voting={voting} votes={spyState?.votes ?? {}} eliminated={eliminated} lastElimination={elimination} />
        )}

        {phase === 'elimination' && elimination && (
          <EliminationView players={players} elimination={elimination} eliminated={eliminated} />
        )}

        {phase === 'finished' && (
          <GameOverView players={players} gameOver={gameOver} />
        )}
      </div>
    </div>
  );
}

// ---------- Question / results ----------

function QuestionView({
  players, question, results, answered, eliminated,
}: {
  players: Player[];
  question: SpyQuestionPayload | null;
  results: SpyResultsPayload | null;
  answered: Record<string, number | null>;
  eliminated: Record<string, boolean>;
}) {
  if (!question) {
    return (
      <div className="flex-1 flex items-center justify-center text-[40px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">
        Готовим вопрос…
      </div>
    );
  }
  const q = question.question;
  const reveal = !!results;
  const pickedBy: Record<number, Player[]> = {};
  if (results) {
    for (const p of players) {
      const a = results.answers[p.id];
      if (typeof a === 'number' && a >= 0) (pickedBy[a] ??= []).push(p);
    }
  }
  const activePlayers = players.filter((p) => !eliminated[p.id]);
  const answeredCount = activePlayers.filter((p) => answered[p.id] != null).length;

  return (
    <>
      <div className="glass-panel-gold px-10 py-7">
        <div className="text-[46px] font-extrabold leading-[1.15]">{q.text}</div>
      </div>

      <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
        {q.options.map((opt, i) => {
          const isCorrect = reveal && results!.correctIndex === i;
          const dim = reveal && !isCorrect;
          const picks = pickedBy[i] ?? [];
          return (
            <div
              key={i}
              className={`rounded-3xl px-7 py-5 border flex flex-col gap-3 transition-all ${
                isCorrect
                  ? 'bg-[var(--color-dungeon-heal)]/20 border-[var(--color-dungeon-heal)] shadow-[0_0_40px_rgba(141,255,133,0.35)]'
                  : dim
                    ? 'bg-white/[0.03] border-white/5 opacity-50'
                    : 'bg-white/[0.06] border-white/10'
              }`}
            >
              <div className="flex items-center gap-5">
                <span className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl text-[32px] font-black ${isCorrect ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]' : 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'}`}>
                  {LETTERS[i]}
                </span>
                <span className="flex-1 text-[34px] font-bold leading-tight">{opt}</span>
                {isCorrect && <span className="text-[48px] leading-none text-[var(--color-dungeon-heal)]">✓</span>}
              </div>
              {reveal && (
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {picks.map((p) => <PlayerChip key={p.id} p={p} tone={isCorrect ? 'ok' : 'bad'} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Round outcome banner */}
      {results && (
        <div className={`rounded-3xl px-8 py-4 text-center text-[34px] font-black ${
          results.winner === 'team'
            ? 'bg-[var(--color-dungeon-mana)]/20 text-[var(--color-dungeon-mana)]'
            : results.winner === 'spy'
              ? 'bg-[var(--color-dungeon-purple)]/20 text-[var(--color-dungeon-purple)]'
              : 'bg-white/10 text-white/80'
        }`}>
          {results.winner === 'team' && '👥 Большинство ответило верно — очко команде!'}
          {results.winner === 'spy' && '🕵️ Большинство ошиблось — очко шпиону'}
          {results.winner === 'tie' && '⚖️ Ничья в этом раунде'}
        </div>
      )}

      {/* Players */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">
          {reveal ? 'Ответы' : `Ответили ${answeredCount}/${activePlayers.length}`}
        </span>
        {players.map((p) => {
          if (eliminated[p.id]) return <PlayerChip key={p.id} p={p} tone="muted" suffix=" 💀" />;
          if (reveal) {
            const a = results!.answers[p.id];
            const ok = a === results!.correctIndex;
            return <PlayerChip key={p.id} p={p} tone={a == null || a < 0 ? 'muted' : ok ? 'ok' : 'bad'} suffix={a == null || a < 0 ? ' —' : ` ${LETTERS[a]} ${ok ? '✓' : '✗'}`} />;
          }
          const has = answered[p.id] != null;
          return <PlayerChip key={p.id} p={p} tone={has ? 'ok' : 'plain'} suffix={has ? ' ✓' : ' …'} />;
        })}
      </div>
    </>
  );
}

// ---------- Voting ----------

function VotingView({
  players, voting, votes, eliminated, lastElimination,
}: {
  players: Player[];
  voting: SpyVotingPayload | null;
  votes: Record<string, boolean>;
  eliminated: Record<string, boolean>;
  lastElimination: SpyEliminationPayload | null;
}) {
  const eligible = voting?.players ?? players.filter((p) => !eliminated[p.id]).map((p) => ({ id: p.id, name: p.name }));
  const votedCount = eligible.filter((p) => votes[p.id]).length;
  const out = players.filter((p) => eliminated[p.id]);
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6">
      <div className="text-center">
        <div className="text-[72px] font-black text-[var(--color-dungeon-gold)] leading-none">🗳️ Кто шпион?</div>
        <div className="text-[28px] font-semibold text-[var(--color-dungeon-muted)] mt-3">
          Угадаете — победа команды. Ошибётесь — игрок выбывает. Проголосовали {votedCount} из {eligible.length}.
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, eligible.length))}, minmax(0, 1fr))` }}>
        {eligible.map((e) => {
          const p = byId.get(e.id);
          const voted = !!votes[e.id];
          return (
            <div key={e.id} className={`glass-panel px-6 py-5 flex flex-col items-center gap-3 ${voted ? 'border-[var(--color-dungeon-heal)]/50' : ''}`}>
              <div className="text-[56px] leading-none">{p?.isBot ? '🤖' : '🧑'}</div>
              <div className="text-[30px] font-extrabold text-center leading-tight truncate w-full">{e.name}</div>
              <span className={`rounded-full px-4 py-1 text-[20px] font-extrabold ${voted ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/5 text-white/40'}`}>
                {voted ? 'проголосовал ✓' : 'думает…'}
              </span>
            </div>
          );
        })}
      </div>

      {(out.length > 0 || lastElimination?.eliminatedName) && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Выбыли</span>
          {out.map((p) => <PlayerChip key={p.id} p={p} tone="muted" suffix=" 💀" />)}
        </div>
      )}
    </div>
  );
}

// ---------- Elimination (vote closed) ----------

function EliminationView({
  players, elimination, eliminated,
}: {
  players: Player[];
  elimination: SpyEliminationPayload;
  eliminated: Record<string, boolean>;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const votersFor: Record<string, Player[]> = {};
  for (const [voter, target] of Object.entries(elimination.votes ?? {})) {
    if (!target) continue;
    const vp = byId.get(voter);
    if (vp) (votersFor[target] ??= []).push(vp);
  }
  const tally = Object.entries(elimination.tally).sort((a, b) => b[1] - a[1]);
  const out = players.filter((p) => eliminated[p.id]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6">
      <div className={`rounded-3xl px-8 py-6 text-center ${elimination.eliminatedId ? 'bg-[#FF4848]/15 border border-[#FF4848]/50' : 'bg-white/5 border border-white/10'}`}>
        {elimination.eliminatedId ? (
          <>
            <div className="text-[64px] font-black text-[#FF9A9A] leading-tight">Выбыл: {elimination.eliminatedName}</div>
            <div className="text-[30px] font-bold text-white/80 mt-2">{elimination.wasSpy ? 'Это был шпион!' : 'Это не шпион — игра продолжается'}</div>
          </>
        ) : (
          <>
            <div className="text-[64px] font-black text-white/90 leading-tight">Никто не выбыл</div>
            <div className="text-[30px] font-bold text-white/60 mt-2">Голоса не сошлись — следующий раунд</div>
          </>
        )}
      </div>

      <div className="glass-panel p-6 flex-1 min-h-0 overflow-hidden">
        <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-4">Кто за кого голосовал</div>
        {tally.length === 0 ? (
          <div className="text-[28px] font-semibold text-white/50">Никто не голосовал</div>
        ) : (
          <div className="flex flex-col gap-3">
            {tally.map(([id, count]) => {
              const p = byId.get(id);
              return (
                <div key={id} className="flex items-center gap-5 rounded-2xl bg-white/5 px-6 py-3">
                  <div className="text-[30px] font-extrabold w-[360px] truncate">{botMark(p)}{p?.name ?? id}</div>
                  <div className="text-[34px] font-black text-[var(--color-dungeon-gold)] tabular-nums w-[90px]">{count}</div>
                  <div className="flex flex-wrap gap-2">
                    {(votersFor[id] ?? []).map((v) => <PlayerChip key={v.id} p={v} tone="plain" />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {out.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Выбыли</span>
          {out.map((p) => <PlayerChip key={p.id} p={p} tone="muted" suffix=" 💀" />)}
        </div>
      )}
    </div>
  );
}

// ---------- Game over: reveal the spy ----------

function GameOverView({ players, gameOver }: { players: Player[]; gameOver: SpyGameOverPayload | null }) {
  if (!gameOver) {
    return (
      <div className="flex-1 flex items-center justify-center text-[40px] font-bold text-[var(--color-dungeon-muted)] animate-pulse">
        Подводим итоги…
      </div>
    );
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  const spy = gameOver.spyId ? byId.get(gameOver.spyId) : undefined;
  const tally = Object.entries(gameOver.tally).sort((a, b) => b[1] - a[1]);
  const out = players.filter((p) => gameOver.eliminated?.[p.id]);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_560px] gap-8">
      <div className="flex flex-col items-center justify-center gap-6 text-center">
        <div className={`text-[84px] font-black leading-none ${gameOver.teamWon ? 'text-[var(--color-dungeon-gold)]' : 'text-[var(--color-dungeon-purple)]'}`}>
          {gameOver.teamWon ? 'Команда победила!' : 'Шпион ускользнул!'}
        </div>
        <div className="text-[28px] font-semibold text-[var(--color-dungeon-muted)]">
          {gameOver.reason ? REASON_TEXT[gameOver.reason] : ''}
        </div>
        <div className="rounded-[40px] neon-pink bg-[var(--color-dungeon-surface)]/70 px-16 py-10 mt-4">
          <div className="text-[26px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Шпионом был</div>
          <div className="text-[96px] font-black leading-tight text-[var(--color-dungeon-accent)]">
            🕵️ {spy?.name ?? gameOver.spyName ?? '—'}
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
        <div>
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-3">Последнее голосование</div>
          {tally.length === 0 ? (
            <div className="text-[26px] font-semibold text-white/50">Никто не голосовал</div>
          ) : (
            <div className="flex flex-col gap-2">
              {tally.map(([id, count]) => {
                const p = byId.get(id);
                const isSpy = id === gameOver.spyId;
                return (
                  <div key={id} className={`flex items-center justify-between rounded-2xl px-5 py-2 ${isSpy ? 'bg-[var(--color-dungeon-accent)]/20' : 'bg-white/5'}`}>
                    <span className="text-[26px] font-extrabold truncate">{botMark(p)}{p?.name ?? id}{isSpy ? ' 🕵️' : ''}</span>
                    <span className="text-[28px] font-black text-[var(--color-dungeon-gold)] tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-3">Игроки</div>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <PlayerChip
                key={p.id}
                p={p}
                tone={p.id === gameOver.spyId ? 'bad' : out.includes(p) ? 'muted' : 'plain'}
                suffix={p.id === gameOver.spyId ? ' 🕵️' : out.includes(p) ? ' 💀' : ''}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
