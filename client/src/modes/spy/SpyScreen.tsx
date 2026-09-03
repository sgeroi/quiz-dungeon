import { useEffect, useState } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';

type Role = 'spy' | 'team' | null;

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
  teamMode?: 'ffa' | 'coop';
  /** Public personal scores (spy shown with the cover score until the reveal). */
  scores?: Record<string, number>;
  correctCount?: number;
  teamCount?: number;
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
  round: number;
}

interface SpyGameOverPayload {
  teamMode?: 'ffa' | 'coop';
  teamWon: boolean;
  reason?: 'spy-voted-out' | 'spy-eliminated' | 'team-eliminated' | 'rounds-exhausted';
  spyId?: string;
  spyName?: string;
  teamScore: number;
  spyScore: number;
  /** Real personal scores (revealed). */
  scores?: Record<string, number>;
  ranking?: string[];
  winnerPlayerId?: string;
  catchers?: string[];
  catchBonus?: number;
  votes: Record<string, string | null>;
  tally: Record<string, number>;
  history: Array<{ qid: string; correctIndex: number; answers: Record<string, number | null>; winner: 'team' | 'spy' | 'tie' }>;
  eliminated?: Record<string, boolean>;
}

interface SpyStatePayload {
  teamMode?: 'ffa' | 'coop';
  teamScore: number;
  spyScore: number;
  scores?: Record<string, number>;
  round: number;
  totalRounds: number;
  phase: 'role-reveal' | 'question' | 'results' | 'voting' | 'finished';
  answers: Record<string, number | null>;
  votes: Record<string, boolean>;
  eliminated?: Record<string, boolean>;
}

/** Spy-only: the real score the room can't see. */
interface SpyPrivatePayload {
  score: number;
  cover: number;
  gained: number;
}

type Phase = 'role-reveal' | 'question' | 'results' | 'voting' | 'finished';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SpyScreen() {
  const gameState = useStore(s => s.gameState);
  const playerId = useStore(s => s.playerId);

  const [role, setRole] = useState<Role>(null);
  const [showRolePopup, setShowRolePopup] = useState(false);
  const [phase, setPhase] = useState<Phase>('role-reveal');
  const [roundData, setRoundData] = useState<SpyQuestionPayload | null>(null);
  const [leakedAnswer, setLeakedAnswer] = useState<{ qid: string; correctIndex: number } | null>(null);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [results, setResults] = useState<SpyResultsPayload | null>(null);
  const [voting, setVoting] = useState<SpyVotingPayload | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState<SpyGameOverPayload | null>(null);
  const [spyStatus, setSpyStatus] = useState<SpyStatePayload | null>(null);
  const [lastElimination, setLastElimination] = useState<SpyEliminationPayload | null>(null);
  const [showSpyTip, setShowSpyTip] = useState(false);
  const [spyPrivate, setSpyPrivate] = useState<SpyPrivatePayload | null>(null);

  useEffect(() => {
    function onRole(r: Role) {
      setRole(r);
      setShowRolePopup(true);
      setTimeout(() => setShowRolePopup(false), 3000);
    }
    function onQuestion(data: SpyQuestionPayload) {
      setRoundData(data);
      setMyAnswer(null);
      setResults(null);
      setPhase('question');
      // issue 3.2: every round, briefly remind the spy of their motivation —
      // they see the right answer in advance, but should sometimes pick wrong
      // on purpose so the team can't tell who's leaking.
      setShowSpyTip(true);
      setTimeout(() => setShowSpyTip(false), 3500);
    }
    function onAnswerLeak(payload: { qid: string; correctIndex: number }) {
      setLeakedAnswer(payload);
    }
    function onResults(data: SpyResultsPayload) {
      setResults(data);
      setPhase('results');
    }
    function onVoting(data: SpyVotingPayload) {
      setVoting(data);
      setMyVote(null);
      setResults(null);
      setPhase('voting');
    }
    function onGameOver(data: SpyGameOverPayload) {
      setGameOver(data);
      setPhase('finished');
    }
    function onSpyState(data: SpyStatePayload) {
      setSpyStatus(data);
    }
    function onElimination(data: SpyEliminationPayload) {
      setLastElimination(data);
    }
    function onPrivate(data: SpyPrivatePayload) {
      setSpyPrivate(data);
    }

    socket.on('mode-spy-role' as any, onRole);
    socket.on('mode-spy-question' as any, onQuestion);
    socket.on('mode-spy-answer-leak' as any, onAnswerLeak);
    socket.on('mode-spy-results' as any, onResults);
    socket.on('mode-spy-voting' as any, onVoting);
    socket.on('mode-spy-game-over' as any, onGameOver);
    socket.on('mode-spy-state' as any, onSpyState);
    socket.on('mode-spy-elimination' as any, onElimination);
    socket.on('mode-spy-private' as any, onPrivate);

    return () => {
      socket.off('mode-spy-role' as any, onRole);
      socket.off('mode-spy-question' as any, onQuestion);
      socket.off('mode-spy-answer-leak' as any, onAnswerLeak);
      socket.off('mode-spy-results' as any, onResults);
      socket.off('mode-spy-voting' as any, onVoting);
      socket.off('mode-spy-game-over' as any, onGameOver);
      socket.off('mode-spy-state' as any, onSpyState);
      socket.off('mode-spy-elimination' as any, onElimination);
      socket.off('mode-spy-private' as any, onPrivate);
    };
  }, []);

  function submitAnswer(idx: number) {
    if (myAnswer !== null) return;
    setMyAnswer(idx);
    socket.emit('mode-spy-answer' as any, idx);
  }

  function submitVote(targetId: string) {
    if (myVote) return;
    setMyVote(targetId);
    socket.emit('mode-spy-vote' as any, targetId);
  }

  const players = gameState ? Object.values(gameState.players) : [];
  const isSpy = role === 'spy';
  const timer = gameState?.timer ?? 0;
  const isFfa = (spyStatus?.teamMode ?? gameState?.teamMode) === 'ffa';

  // Public personal scores (spy is masked by the server until the reveal).
  const scores: Record<string, number> = spyStatus?.scores ?? results?.scores ?? {};
  const eliminatedNow = spyStatus?.eliminated ?? {};
  const rankingIds = players
    .map(p => p.id)
    .sort((a, b) => {
      const d = (scores[b] ?? 0) - (scores[a] ?? 0);
      if (d !== 0) return d;
      return (eliminatedNow[a] ? 1 : 0) - (eliminatedNow[b] ? 1 : 0);
    });
  const myScore = playerId ? (scores[playerId] ?? 0) : 0;
  const myRank = playerId ? rankingIds.indexOf(playerId) + 1 : 0;

  // -- Role reveal popup --
  const rolePopup = showRolePopup && (
    <div className="fixed inset-y-0 left-0 right-0 md:right-72 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className={`px-10 py-8 max-w-md rounded-2xl border-4 text-center shadow-2xl animate-pulse
        ${isSpy ? 'bg-purple-950 border-purple-500' : 'bg-slate-900 border-slate-600'}`}>
        <div className="text-7xl mb-4">{isSpy ? '🕵️' : '👥'}</div>
        <div className="text-3xl font-bold text-white mb-3">
          {isSpy ? 'Ты — шпион' : 'Ты — в команде'}
        </div>
        <div className="text-sm text-gray-300 leading-relaxed">
          {isSpy
            ? 'Ты видишь правильный ответ заранее. Отвечай так, чтобы тебя не вычислили — иногда специально неправильно. После каждого раунда команда голосует, кого выгнать.'
            : 'Один из игроков — шпион. После каждого раунда вы будете голосовать, кого выгнать. Найди шпиона до того, как закончатся раунды!'}
          {isFfa && (
            <div className="mt-2 text-amber-200/90">
              {isSpy
                ? 'Личный зачёт: ты получаешь очко за каждого ошибившегося игрока. На табло твой счёт замаскирован до финала.'
                : 'Личный зачёт: очко за каждый верный ответ, бонус — если проголосуешь за настоящего шпиона.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // -- Game over screen --
  if (phase === 'finished' && gameOver) {
    const finalFfa = (gameOver.teamMode ?? (isFfa ? 'ffa' : 'coop')) === 'ffa';
    const finalScores = gameOver.scores ?? {};
    const finalOrder = gameOver.ranking ?? players.map(p => p.id).sort((a, b) => (finalScores[b] ?? 0) - (finalScores[a] ?? 0));
    const winner = gameOver.winnerPlayerId ? gameState?.players[gameOver.winnerPlayerId] : undefined;
    const iAmWinner = !!playerId && gameOver.winnerPlayerId === playerId;
    const catchers = new Set(gameOver.catchers ?? []);
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-purple-950/30 to-slate-950 text-white p-6">
        <div className="max-w-2xl mx-auto">
          {finalFfa ? (
            <>
              <h1 className="text-4xl font-bold text-center mb-1">
                {iAmWinner ? '🏆 Ты победил!' : winner ? `🥇 Победил ${winner.name}` : 'Игра окончена'}
              </h1>
              <p className="text-center text-sm text-gray-400 mb-2">
                {gameOver.teamWon ? 'Команда вычислила шпиона' : 'Шпион остался нераскрытым'}
              </p>
            </>
          ) : (
            <h1 className="text-4xl font-bold text-center mb-2">
              {gameOver.teamWon ? '🎉 Команда победила!' : '🕵️ Шпион ускользнул!'}
            </h1>
          )}
          <p className="text-center text-xl text-gray-300 mb-6">
            Шпион: <span className="text-purple-400 font-semibold">{gameOver.spyName}</span>
            {gameOver.spyId === playerId && <span className="text-purple-300"> (это ты)</span>}
          </p>

          {finalFfa ? (
            <div className="bg-slate-800/60 rounded-lg p-4 mb-6" data-testid="spy-final-ranking">
              <h3 className="text-lg font-semibold mb-3">Личный зачёт</h3>
              <div className="space-y-1">
                {finalOrder.map((id, i) => {
                  const p = gameState?.players[id];
                  const isSpyRow = id === gameOver.spyId;
                  const isWin = id === gameOver.winnerPlayerId;
                  const me = id === playerId;
                  return (
                    <div key={id}
                      className={`flex justify-between items-center px-3 py-2 rounded
                        ${isWin ? 'bg-amber-900/30 border border-amber-500' : me ? 'bg-slate-900/70 border border-purple-700' : 'bg-slate-900/40'}`}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-7 text-center">{MEDALS[i] ?? `${i + 1}.`}</span>
                        <span className={`truncate ${isSpyRow ? 'text-purple-300 font-semibold' : ''}`}>
                          {p?.name ?? id}{p?.isBot && ' 🤖'}{isSpyRow && ' 🕵️'}
                        </span>
                        {gameOver.eliminated?.[id] && <span className="text-xs text-gray-500">💀</span>}
                        {catchers.has(id) && (
                          <span className="text-[10px] uppercase tracking-wide text-green-300 bg-green-900/40 px-1.5 py-0.5 rounded">
                            +{gameOver.catchBonus ?? 2} за шпиона
                          </span>
                        )}
                      </span>
                      <span className={`text-lg font-bold tabular-nums ${isWin ? 'text-amber-300' : 'text-white'}`}>{finalScores[id] ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700">
                <div className="text-sm text-gray-400">Команда</div>
                <div className="text-3xl font-bold text-blue-400">{gameOver.teamScore}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-purple-700">
                <div className="text-sm text-gray-400">Шпион</div>
                <div className="text-3xl font-bold text-purple-400">{gameOver.spyScore}</div>
              </div>
            </div>
          )}

          <div className="bg-slate-800/60 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-3">Голоса</h3>
            <div className="space-y-1">
              {Object.entries(gameOver.tally).length === 0 && (
                <div className="text-gray-500">Никто не голосовал</div>
              )}
              {Object.entries(gameOver.tally).sort((a, b) => b[1] - a[1]).map(([id, count]) => {
                const p = gameState?.players[id];
                const isSpyTarget = id === gameOver.spyId;
                return (
                  <div key={id} className="flex justify-between items-center px-3 py-2 rounded bg-slate-900/40">
                    <span className={isSpyTarget ? 'text-purple-300 font-semibold' : ''}>
                      {p?.name ?? id} {isSpyTarget && '🕵️'}
                    </span>
                    <span className="text-gray-400">{count} голос(а)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -- Voting phase --
  if (phase === 'voting' && voting) {
    const eliminatedMap = voting.eliminated ?? spyStatus?.eliminated ?? {};
    const amIEliminated = !!(playerId && eliminatedMap[playerId]);
    const roundLabel = voting.round != null && voting.totalRounds != null
      ? `Голосование после раунда ${voting.round} из ${voting.totalRounds}`
      : 'Голосование';
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-purple-950/30 to-slate-950 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold">🗳️ Кто шпион?</h2>
            <div className="text-2xl font-mono text-amber-400">{timer}с</div>
          </div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">{roundLabel}</p>
          {isFfa && (
            <div className="mb-3 flex items-center justify-between text-sm px-3 py-2 rounded bg-slate-800/70 border border-slate-700">
              <span className="text-gray-300">Мой счёт</span>
              <span className="font-bold text-amber-300">{myScore} · место {myRank || '—'} из {players.length}</span>
            </div>
          )}
          {lastElimination && lastElimination.eliminatedName && (
            <div className="mb-4 px-3 py-2 rounded bg-rose-900/30 border border-rose-700 text-sm">
              В прошлом раунде выбыл: <span className="font-semibold text-rose-300">{lastElimination.eliminatedName}</span>
              {lastElimination.wasSpy ? ' — это был шпион!' : ' (не шпион)'}
            </div>
          )}
          <p className="text-gray-400 mb-4">
            {amIEliminated
              ? 'Ты выбыл и не можешь голосовать в этом раунде.'
              : isSpy
                ? 'Замети следы — голосуй против другого игрока.'
                : isFfa
                  ? 'Выбери того, кого считаешь шпионом. Угадаете — игра окончена, а проголосовавшие за шпиона получат бонус; ошибётесь — этот игрок выбывает.'
                  : 'Выбери того, кого считаешь шпионом. Угадаете — победа команды; ошибётесь — этот игрок выбывает.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {voting.players.map(p => {
              const isSelf = p.id === playerId;
              const selected = myVote === p.id;
              return (
                <button
                  key={p.id}
                  disabled={isSelf || myVote !== null || amIEliminated}
                  onClick={() => submitVote(p.id)}
                  className={`px-4 py-3 rounded-lg border-2 text-left transition
                    ${selected ? 'bg-purple-700 border-purple-400' : 'bg-slate-800 border-slate-700 hover:border-purple-500'}
                    ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}
                    ${(amIEliminated || (myVote !== null && !selected)) ? 'opacity-50' : ''}`}
                >
                  <span className="text-lg">{p.name}</span>
                  {isSelf && <span className="text-xs text-gray-500 ml-2">(вы)</span>}
                  {isFfa && <span className="text-xs text-amber-300/80 ml-2 tabular-nums">{scores[p.id] ?? 0} очк.</span>}
                </button>
              );
            })}
          </div>
          {myVote && (
            <p className="mt-4 text-center text-green-400">Голос отправлен. Ждём остальных…</p>
          )}
        </div>
        {rolePopup}
      </div>
    );
  }

  // -- Question / Results phase --
  const q = roundData?.question;
  const round = roundData?.round ?? 0;
  const total = roundData?.totalRounds ?? 8;
  const showCorrect = phase === 'results' && results;
  const correctIdx = results?.correctIndex ?? (
    leakedAnswer && roundData && leakedAnswer.qid === roundData.question.id
      ? leakedAnswer.correctIndex
      : null
  );
  const myAnsweredCorrect = showCorrect && results && playerId ? results.answers[playerId] === results.correctIndex : false;
  const amIEliminated = !!(playerId && eliminatedNow[playerId]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-purple-950/20 to-slate-950 text-white p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-semibold">
            Раунд {round || 1} из {total}
          </div>
          <div className="flex items-center gap-3">
            {isFfa ? (
              <div className="bg-amber-900/40 px-3 py-1 rounded border border-amber-700 text-sm" data-testid="spy-my-score">
                🥇 <span className="font-bold tabular-nums">{myScore}</span>
                <span className="text-gray-400"> · {myRank || '—'}/{players.length}</span>
              </div>
            ) : (
              <>
                <div className="bg-blue-900/50 px-3 py-1 rounded border border-blue-700">
                  👥 {spyStatus?.teamScore ?? results?.teamScore ?? 0}
                </div>
                <div className="bg-purple-900/50 px-3 py-1 rounded border border-purple-700">
                  🕵️ {spyStatus?.spyScore ?? results?.spyScore ?? 0}
                </div>
              </>
            )}
            <div className="text-2xl font-mono text-amber-400 min-w-[3ch] text-right">
              {timer}с
            </div>
          </div>
        </div>

        {/* Spy badge — persistent reminder of role + leaked answer hint. */}
        {isSpy && (
          <div className="mb-3 px-3 py-2 bg-purple-900/50 border border-purple-600 rounded text-sm text-purple-200">
            🕵️ Ты шпион. Правильный ответ помечен золотом — выбери неправильный, чтобы запутать команду.
            {isFfa && (
              <span className="block mt-1 text-purple-300/90">
                Настоящий счёт: <span className="font-bold text-amber-300 tabular-nums">{spyPrivate?.score ?? 0}</span>
                <span className="text-gray-400"> (на табло — {myScore})</span>
              </span>
            )}
          </div>
        )}

        {/* issue 3.2: punchy per-round popup so the spy is reminded each round
            why they should sometimes deliberately answer wrong. */}
        {isSpy && showSpyTip && phase === 'question' && (
          <div className="mb-3 px-4 py-3 bg-gradient-to-r from-purple-900/70 to-purple-800/60 border-2 border-purple-400 rounded-lg text-sm text-purple-100 animate-pulse shadow-lg">
            <div className="font-bold text-purple-200 mb-1">🕵️ Ты — шпион</div>
            <div>
              Ты видишь правильный ответ заранее. Отвечай так, чтобы тебя не вычислили — иногда специально неправильно.
              После каждого раунда команда голосует, кого выгнать.
            </div>
          </div>
        )}

        {/* Last-round elimination feedback (visible to everyone). */}
        {lastElimination && lastElimination.eliminatedName && phase === 'question' && (
          <div className="mb-3 px-3 py-2 bg-rose-950/40 border border-rose-700/60 rounded text-xs text-rose-200">
            В прошлом раунде выбыл <span className="font-semibold">{lastElimination.eliminatedName}</span>
            {lastElimination.wasSpy ? ' — это был шпион.' : ' (не шпион).'}
          </div>
        )}

        {amIEliminated && phase === 'question' && (
          <div className="mb-3 px-3 py-2 bg-slate-800/70 border border-slate-600 rounded text-xs text-gray-300">
            Ты выбыл — смотришь со стороны, очки больше не начисляются.
          </div>
        )}

        {/* Question */}
        {q ? (
          <div className="mb-6">
            <div className="bg-slate-800/80 rounded-xl p-6 border border-slate-700 mb-4">
              <p className="text-2xl text-center font-medium">{q.text}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {q.options.map((opt, idx) => {
                const isLeaked = isSpy && correctIdx === idx && phase === 'question';
                const isCorrectShown = showCorrect && results!.correctIndex === idx;
                const isWrongShown = showCorrect && results!.correctIndex !== idx;
                const isMine = myAnswer === idx;
                const disabled = phase !== 'question' || myAnswer !== null || amIEliminated;
                return (
                  <button
                    key={idx}
                    disabled={disabled}
                    onClick={() => submitAnswer(idx)}
                    className={`relative px-4 py-4 rounded-lg border-2 text-left transition text-base
                      ${isLeaked ? 'bg-amber-900/40 border-amber-400 ring-2 ring-amber-500/50' : ''}
                      ${!isLeaked && isCorrectShown ? 'bg-green-900/50 border-green-500' : ''}
                      ${!isLeaked && isWrongShown ? 'bg-slate-800 border-slate-700 opacity-70' : ''}
                      ${!showCorrect && !isLeaked ? 'bg-slate-800 border-slate-700 hover:border-purple-500' : ''}
                      ${isMine && !showCorrect ? 'ring-2 ring-purple-400' : ''}
                      ${disabled && !showCorrect && !isMine ? 'opacity-60' : ''}
                    `}
                  >
                    <span className="text-xs text-gray-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
                    <span>{opt}</span>
                    {isLeaked && (
                      <span className="absolute top-1 right-2 text-xs text-amber-300 font-semibold">
                        правильный
                      </span>
                    )}
                    {isCorrectShown && (
                      <span className="absolute top-1 right-2 text-xs text-green-300 font-semibold">
                        ✓ верно
                      </span>
                    )}
                    {isMine && phase === 'question' && (
                      <span className="absolute bottom-1 right-2 text-xs text-purple-300">ваш</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-12">Готовимся к первому раунду…</div>
        )}

        {/* Results banner */}
        {showCorrect && results && (
          isFfa ? (
            <div className="mb-4 space-y-2">
              {!amIEliminated && (
                <div className={`px-4 py-3 rounded-lg text-center font-semibold
                  ${isSpy
                    ? 'bg-purple-900/50 border border-purple-600'
                    : myAnsweredCorrect ? 'bg-green-900/50 border border-green-600' : 'bg-rose-900/40 border border-rose-700'}`}>
                  {isSpy
                    ? `🕵️ Ошиблись ${spyPrivate?.gained ?? Math.max(0, (results.teamCount ?? 0) - (results.correctCount ?? 0))} — тебе +${spyPrivate?.gained ?? Math.max(0, (results.teamCount ?? 0) - (results.correctCount ?? 0))}`
                    : myAnsweredCorrect ? '✓ Верно! +1 очко' : '✗ Неверно — без очков'}
                </div>
              )}
              <div className="px-4 py-2 rounded-lg text-center text-sm bg-slate-800 border border-slate-600 text-gray-300">
                Верно ответили {results.correctCount ?? 0} из {results.teamCount ?? 0}
              </div>
            </div>
          ) : (
            <div className={`mb-4 px-4 py-3 rounded-lg text-center font-semibold
              ${results.winner === 'team' ? 'bg-blue-900/50 border border-blue-600' : ''}
              ${results.winner === 'spy' ? 'bg-purple-900/50 border border-purple-600' : ''}
              ${results.winner === 'tie' ? 'bg-slate-800 border border-slate-600' : ''}`}>
              {results.winner === 'team' && '👥 Команда верно ответила! +1'}
              {results.winner === 'spy' && '🕵️ Большинство ошиблось — очко шпиону'}
              {results.winner === 'tie' && '⚖️ Ничья в этом раунде'}
            </div>
          )
        )}

        {/* Players list (ffa: live ranking) */}
        <div className="mt-6">
          <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-2">{isFfa ? 'Рейтинг' : 'Игроки'}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid={isFfa ? 'spy-ranking' : undefined}>
            {(isFfa ? rankingIds.map(id => gameState!.players[id]).filter(Boolean) : players).map((p, i) => {
              const answered = phase === 'question'
                ? spyStatus?.answers?.[p.id] != null
                : phase === 'results'
                  ? results?.answers?.[p.id] != null
                  : false;
              const playerAnswer = showCorrect ? results?.answers?.[p.id] : null;
              const isCorrect = showCorrect && playerAnswer === results?.correctIndex;
              const out = !!eliminatedNow[p.id];
              return (
                <div key={p.id}
                  className={`px-3 py-2 rounded border flex justify-between items-center gap-2
                    ${p.id === playerId ? 'border-purple-500 bg-slate-800' : 'border-slate-700 bg-slate-900/40'}
                    ${out ? 'opacity-50' : ''}`}>
                  <span className="truncate">
                    {isFfa && <span className="text-gray-500 mr-1">{MEDALS[i] ?? `${i + 1}.`}</span>}
                    {p.name}{p.isBot && ' 🤖'}{out && ' 💀'}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {isFfa && <span className="text-sm font-bold tabular-nums text-amber-300">{scores[p.id] ?? 0}</span>}
                    {phase === 'question' && !out && (
                      <span className={`text-xs ${answered ? 'text-green-400' : 'text-gray-500'}`}>
                        {answered ? '✓' : '…'}
                      </span>
                    )}
                    {showCorrect && !out && (
                      <span className={`text-xs ${isCorrect ? 'text-green-400' : 'text-rose-400'}`}>
                        {playerAnswer != null && playerAnswer >= 0 ? String.fromCharCode(65 + playerAnswer) : '—'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {rolePopup}
    </div>
  );
}
