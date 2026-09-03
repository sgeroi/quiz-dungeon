import { useEffect, useMemo, useState } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';
import type { Player, Team, TeamMode } from '../../types';
import TeamBadge from '../../components/TeamBadge';

// «Угадай фильм» — player screen for all three formats:
//  coop  — my private actor, the captain types the answer for the whole party;
//  teams — my private actor(s), my team's captain types the answer for the team;
//  ffa   — actors are revealed publicly one by one, everyone answers on their own.

// ---------- Types ----------

interface RevealCastMember {
  playerId: string;
  playerName: string;
  teamId?: string;
  actorName: string;
  imageUrl: string;
}

interface CastCard {
  actorName: string;
  imageUrl: string;
}

interface FfaAnswer {
  correct: boolean;
  gaveUp: boolean;
  points: number;
  answer: string | null;
  openedAt: number;
}

interface TeamRound {
  captainId: string;
  answered: boolean;
  answer: string | null;
  correct: boolean | null;
  timedOut: boolean;
}

export interface PetersburgSnapshot {
  mode: TeamMode;
  round: number;
  total: number;
  score: number;
  captainId: string;
  dealt: string[];
  showingResult: boolean;
  lastAnswer: string | null;
  lastWasCorrect: boolean | null;
  lastMovieTitle: string | null;
  lastReveal: RevealCastMember[] | null;
  lastCast: CastCard[] | null;
  revealed: { imageUrl: string }[];
  revealTotal: number;
  nextPoints: number;
  scores: Record<string, number>;
  answers: Record<string, FfaAnswer>;
  teamScores: Record<string, number>;
  teamRounds: Record<string, TeamRound>;
}

interface PrivateActor {
  imageUrl: string;
  imageUrls?: string[];
  round: number;
  total: number;
  isCaptain: boolean;
}

interface GameStateWithPetersburg {
  petersburg?: PetersburgSnapshot;
}

const TITLE = '🎬 Угадай фильм';

export default function PetersburgScreen() {
  const gameState = useStore(s => s.gameState);
  const playerId = useStore(s => s.playerId);

  const [myActor, setMyActor] = useState<PrivateActor | null>(null);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const snap = (gameState as (typeof gameState & GameStateWithPetersburg) | null)?.petersburg ?? null;
  const mode: TeamMode = snap?.mode ?? gameState?.teamMode ?? 'coop';
  const round = snap?.round ?? 0;
  const total = snap?.total ?? 10;
  const timer = gameState?.timer ?? 0;
  const phase = gameState?.phase ?? null;
  const showingResult = !!snap?.showingResult || phase === 'results';

  const me = playerId ? gameState?.players[playerId] : undefined;
  const teams: Team[] = gameState?.teams ?? [];
  const myTeam = me?.teamId ? teams.find(t => t.id === me.teamId) : undefined;
  const myTeamRound = myTeam ? snap?.teamRounds?.[myTeam.id] : undefined;

  // Who types the answer for me right now.
  const captainId = mode === 'teams' ? (myTeamRound?.captainId ?? '') : (snap?.captainId ?? '');
  const isCaptain = !!playerId && captainId === playerId;
  const captainPlayer = captainId ? gameState?.players[captainId] : undefined;

  // ffa: my personal state for this round.
  const myFfa = playerId ? snap?.answers?.[playerId] : undefined;

  useEffect(() => {
    function onActor(payload: PrivateActor) {
      setMyActor(payload);
    }
    socket.on('mode-petersburg-actor' as any, onActor);
    return () => {
      socket.off('mode-petersburg-actor' as any, onActor);
    };
  }, []);

  // Reset round-local UI when a new round begins.
  useEffect(() => {
    if (phase === 'answering') {
      setDraftAnswer('');
      setSubmitted(false);
    }
  }, [phase, round]);

  // When results are shown, drop the private actor — it's revealed publicly now.
  useEffect(() => {
    if (showingResult) setMyActor(null);
  }, [showingResult, round]);

  const canAnswer = !showingResult && phase === 'answering' && (
    mode === 'ffa' ? !myFfa
      : mode === 'teams' ? isCaptain && !myTeamRound?.answered
        : isCaptain
  );

  function submit() {
    const trimmed = draftAnswer.trim();
    if (!trimmed) return;
    if (submitted || !canAnswer) return;
    setSubmitted(true);
    socket.emit('mode-petersburg-answer' as any, trimmed);
  }

  function giveUp() {
    if (submitted || !canAnswer || mode !== 'ffa') return;
    setSubmitted(true);
    socket.emit('mode-petersburg-giveup' as any);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit();
  }

  const players = useMemo(
    () => (gameState ? Object.values(gameState.players) : []),
    [gameState],
  );

  // Header score box.
  const scoreLabel = mode === 'ffa' ? 'Мои очки' : mode === 'teams' ? (myTeam ? myTeam.name : 'Счёт') : 'Счёт';
  const scoreValue = mode === 'ffa'
    ? (playerId ? snap?.scores?.[playerId] ?? 0 : 0)
    : mode === 'teams'
      ? (myTeam ? snap?.teamScores?.[myTeam.id] ?? 0 : 0)
      : (snap?.score ?? 0);

  const myActorUrls = myActor ? (myActor.imageUrls && myActor.imageUrls.length > 0 ? myActor.imageUrls : [myActor.imageUrl]) : [];

  return (
    <div className="h-full overflow-y-auto text-white"
      style={{
        background: 'radial-gradient(ellipse at top, rgba(120, 20, 30, 0.35), transparent 60%), linear-gradient(180deg, #0b0608 0%, #120708 100%)',
      }}
    >
      <div className="max-w-4xl mx-auto p-3 sm:p-6">
        {/* ---------- Header ---------- */}
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="min-w-0 flex-1">
            <div className="hidden sm:block text-xs uppercase tracking-[0.3em] text-amber-400/80 truncate">
              {TITLE}
            </div>
            <div className="text-lg sm:text-2xl font-serif sm:mt-1 whitespace-nowrap">
              Раунд <span className="text-amber-300">{Math.max(1, round)}</span>
              <span className="text-gray-500"> из {total}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded border border-amber-700/50 bg-black/40" data-testid="pb-score">
              <div className="text-[10px] uppercase tracking-wider text-amber-400/70 truncate max-w-[10ch]">{scoreLabel}</div>
              <div className="text-xl font-bold text-amber-200 leading-none">
                {scoreValue}{mode === 'coop' && <span className="text-gray-500 text-sm">/{total}</span>}
              </div>
            </div>
            <div className={`px-3 py-2 rounded border min-w-[5ch] text-right
              ${timer <= 10 ? 'border-rose-700 bg-rose-950/40 text-rose-200' : 'border-amber-700/50 bg-black/40 text-amber-200'}`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Таймер</div>
              <div className="text-xl font-mono leading-none">{Math.max(0, timer)}с</div>
            </div>
          </div>
        </div>

        {/* ---------- Captain banner (coop / teams) ---------- */}
        {mode !== 'ffa' && captainPlayer && !showingResult && (
          <div className="mb-5 flex items-center gap-2 text-sm text-amber-200/80 flex-wrap">
            {myTeam && <TeamBadge team={myTeam} size="sm" />}
            <span>👑</span>
            <span>Капитан{mode === 'teams' ? ' команды' : ' раунда'}:</span>
            <span className="font-semibold text-amber-200">{captainPlayer.name}</span>
            {captainPlayer.id === playerId && <span className="text-xs text-amber-400">(это ты)</span>}
          </div>
        )}

        {/* ---------- Question prompt ---------- */}
        {!showingResult && (
          <div className="mb-5 text-center">
            <div className="text-xl sm:text-2xl text-amber-100 font-serif">
              В каком фильме снимались эти актёры?
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {mode === 'ffa'
                ? 'Актёры открываются по одному. Чем раньше ответишь, тем больше очков — но попытка одна.'
                : mode === 'teams'
                  ? 'У каждого в команде свой актёр — обсудите и угадайте фильм. Ответ вводит капитан команды.'
                  : 'У каждого свой актёр — обсудите голосом и угадайте фильм вместе. Ответ вводит капитан.'}
            </div>
          </div>
        )}

        {/* ---------- Result banner ---------- */}
        {showingResult && snap && snap.lastMovieTitle && (
          <ResultBanner snap={snap} mode={mode} playerId={playerId} myTeam={myTeam} teams={teams} players={gameState?.players ?? {}} />
        )}

        {/* ---------- ffa: revealed actors ---------- */}
        {!showingResult && mode === 'ffa' && snap && (
          <div className="mb-6" data-testid="pb-ffa-revealed">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-amber-400/80 mb-3">
              <span>Открыто {snap.revealed.length} из {snap.revealTotal}</span>
              <span className="text-amber-200 normal-case tracking-normal font-semibold">
                Сейчас за верный ответ: {snap.nextPoints} {pluralPoints(snap.nextPoints)}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
              {Array.from({ length: Math.max(snap.revealTotal, snap.revealed.length) }, (_, i) => {
                const a = snap.revealed[i];
                return (
                  <div key={i}
                    className={`rounded-xl overflow-hidden border-2 aspect-[3/4] bg-black/40 flex items-center justify-center
                      ${a ? 'border-amber-700/60' : 'border-slate-800 border-dashed'}`}
                  >
                    {a ? (
                      <img src={a.imageUrl} alt="Актёр" className="block w-full h-full object-cover object-top" draggable={false} />
                    ) : (
                      <span className="text-3xl opacity-40">🎭</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- My actor (coop / teams, during round) ---------- */}
        {!showingResult && mode !== 'ffa' && myActorUrls.length > 0 && (
          <div className="mb-6 flex flex-col items-center">
            <div className="text-xs uppercase tracking-[0.25em] text-amber-400/80 mb-3">
              {myActorUrls.length > 1 ? 'Твои актёры' : 'Твой актёр'}
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              {myActorUrls.map((url, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border-4 border-amber-700/60 bg-black/40
                  shadow-[0_0_40px_rgba(217,119,6,0.25)]">
                  <img
                    src={url}
                    alt="Актёр"
                    className={`block object-cover ${myActorUrls.length > 1 ? 'w-[160px] h-[210px] sm:w-[240px] sm:h-[300px]' : 'w-[280px] h-[360px] sm:w-[340px] sm:h-[420px]'}`}
                    draggable={false}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-center text-gray-400 max-w-md">
              {myActorUrls.length > 1
                ? '💬 Ты один в команде — держи двух актёров из одного фильма.'
                : mode === 'teams'
                  ? '💬 Опиши его своей команде — у сокомандников свои актёры из того же фильма.'
                  : '💬 Опиши его голосом — кого видишь? У других игроков свои актёры из того же фильма.'}
            </p>
          </div>
        )}

        {/* ---------- Answer input ---------- */}
        {canAnswer && (
          <div className="bg-black/50 border-2 border-amber-700/60 rounded-xl p-5 shadow-2xl mb-6">
            <div className="text-center text-sm text-gray-300 mb-3">
              {mode === 'ffa' ? '🎯 Твой ответ' : mode === 'teams' ? `👑 Ты вводишь ответ за команду «${myTeam?.name ?? ''}»` : '👑 Ты вводишь ответ от команды'}
            </div>
            <input
              type="text"
              value={draftAnswer}
              onChange={e => setDraftAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Введи название фильма"
              autoFocus
              disabled={submitted}
              className="w-full px-4 py-4 text-lg rounded-lg bg-slate-950/80 border-2 border-amber-700/40
                focus:border-amber-500 focus:outline-none text-amber-100 placeholder:text-gray-600
                disabled:opacity-60"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={submit}
                disabled={submitted || !draftAnswer.trim()}
                className="flex-1 py-3 rounded-lg font-bold text-lg
                  bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700
                  border-2 border-amber-500/60 text-black
                  disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 disabled:border-gray-700
                  transition"
              >
                {submitted ? 'Отправлено…' : 'Ответить'}
              </button>
              {mode === 'ffa' && (
                <button
                  onClick={giveUp}
                  disabled={submitted}
                  className="px-4 py-3 rounded-lg font-bold border-2 border-slate-700 bg-slate-900/70 text-gray-300
                    hover:border-slate-500 disabled:opacity-50 transition"
                >
                  🏳 Сдаюсь
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------- ffa: my locked status ---------- */}
        {!showingResult && mode === 'ffa' && myFfa && (
          <div className={`mb-6 rounded-xl border-2 p-4 text-center
            ${myFfa.correct ? 'border-emerald-600/70 bg-emerald-950/40' : 'border-slate-700 bg-black/40'}`} data-testid="pb-ffa-locked">
            <div className="text-2xl">
              {myFfa.correct ? `✅ Верно! +${myFfa.points}` : myFfa.gaveUp ? '🏳 Ты сдался' : '❌ Мимо'}
            </div>
            <div className="text-sm text-gray-400 mt-1">Ждём остальных…</div>
          </div>
        )}

        {/* ---------- teams: my team already answered ---------- */}
        {!showingResult && mode === 'teams' && myTeamRound?.answered && (
          <div className={`mb-6 rounded-xl border-2 p-4 text-center
            ${myTeamRound.correct ? 'border-emerald-600/70 bg-emerald-950/40' : 'border-rose-700/70 bg-rose-950/40'}`}>
            <div className="text-2xl">{myTeamRound.correct ? '✅ Команда угадала!' : '❌ Команда ошиблась'}</div>
            <div className="text-sm text-gray-400 mt-1">Ждём другие команды…</div>
          </div>
        )}

        {/* ---------- Reveal: cast lineup ---------- */}
        {showingResult && mode === 'ffa' && snap?.lastCast && snap.lastCast.length > 0 && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3 text-center">Актёры фильма</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
              {snap.lastCast.map((item, i) => (
                <div key={i} className="rounded-xl overflow-hidden border-2 bg-black/50 border-slate-700">
                  <img src={item.imageUrl} alt={item.actorName} className="block w-full aspect-[3/4] object-cover object-top" draggable={false} />
                  <div className="px-2 py-2 text-xs sm:text-sm text-amber-100 font-semibold leading-tight truncate">{item.actorName}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {showingResult && mode !== 'ffa' && snap?.lastReveal && snap.lastReveal.length > 0 && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3 text-center">
              Каст этого раунда
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {snap.lastReveal.map((item, i) => {
                const t = item.teamId ? teams.find(x => x.id === item.teamId) : undefined;
                return (
                  <div key={`${item.playerId}-${i}`}
                    className={`rounded-xl overflow-hidden border-2 bg-black/50
                      ${item.playerId === playerId ? 'border-amber-500' : 'border-slate-700'}`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.actorName}
                      className="block w-full h-44 object-cover object-top"
                      draggable={false}
                    />
                    <div className="px-2 py-2">
                      <div className="text-sm text-amber-100 font-semibold leading-tight truncate">
                        {item.actorName}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate flex items-center gap-1">
                        {t && <TeamBadge team={t} size="sm" iconOnly />}
                        <span>у {item.playerName}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- Players / teams panel ---------- */}
        {mode === 'teams' ? (
          <TeamsPanel teams={teams} players={players} snap={snap} playerId={playerId} showingResult={showingResult} />
        ) : (
          <PlayersPanel mode={mode} players={players} snap={snap} playerId={playerId} showingResult={showingResult} />
        )}
      </div>
    </div>
  );
}

function pluralPoints(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'очко';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'очка';
  return 'очков';
}

function ResultBanner({ snap, mode, playerId, myTeam, teams, players }: {
  snap: PetersburgSnapshot; mode: TeamMode; playerId: string | null; myTeam?: Team; teams: Team[]; players: Record<string, Player>;
}) {
  if (mode === 'ffa') {
    const mine = playerId ? snap.answers?.[playerId] : undefined;
    const ok = !!mine?.correct;
    const winners = Object.entries(snap.answers ?? {}).filter(([, a]) => a.correct)
      .sort((a, b) => b[1].points - a[1].points);
    return (
      <div className={`mb-6 rounded-lg border-2 p-5 text-center ${ok ? 'border-emerald-600/70 bg-emerald-950/40' : 'border-slate-700 bg-black/40'}`}>
        <div className="text-3xl mb-1">{ok ? `✅ +${mine?.points}` : mine?.gaveUp ? '🏳 Сдался' : mine ? '❌ Мимо' : '⏰ Не ответил'}</div>
        <div className="text-sm text-gray-400 mb-2">Загаданный фильм</div>
        <div className="text-2xl font-serif text-amber-200 mb-2">«{snap.lastMovieTitle}»</div>
        {winners.length > 0 ? (
          <div className="text-sm text-gray-300">
            Угадали: {winners.map(([pid, a]) => `${players[pid]?.name ?? '???'} (+${a.points})`).join(', ')}
          </div>
        ) : (
          <div className="text-sm text-gray-400">Никто не угадал</div>
        )}
      </div>
    );
  }
  if (mode === 'teams') {
    const mineRound = myTeam ? snap.teamRounds?.[myTeam.id] : undefined;
    const ok = !!mineRound?.correct;
    return (
      <div className={`mb-6 rounded-lg border-2 p-5 text-center ${ok ? 'border-emerald-600/70 bg-emerald-950/40' : 'border-rose-700/70 bg-rose-950/40'}`}>
        <div className="text-3xl mb-1">{ok ? '✅ В точку!' : mineRound?.timedOut ? '⏰ Время вышло' : '❌ Мимо'}</div>
        <div className="text-sm text-gray-400 mb-2">Загаданный фильм</div>
        <div className="text-2xl font-serif text-amber-200 mb-3">«{snap.lastMovieTitle}»</div>
        <div className="flex flex-col gap-1 items-center">
          {teams.filter(t => snap.teamRounds?.[t.id]).map(t => {
            const r = snap.teamRounds[t.id];
            return (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <TeamBadge team={t} size="sm" />
                <span className={r.correct ? 'text-emerald-300' : 'text-rose-300'}>
                  {r.correct ? '✅' : r.timedOut ? '⏰' : '❌'} {r.answer ? `«${r.answer}»` : 'без ответа'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className={`mb-6 rounded-lg border-2 p-5 text-center
      ${snap.lastWasCorrect ? 'border-emerald-600/70 bg-emerald-950/40' : 'border-rose-700/70 bg-rose-950/40'}`}>
      <div className="text-3xl mb-1">{snap.lastWasCorrect ? '✅ В точку!' : '❌ Мимо'}</div>
      <div className="text-sm text-gray-400 mb-2">Загаданный фильм</div>
      <div className="text-2xl font-serif text-amber-200 mb-1">«{snap.lastMovieTitle}»</div>
      {snap.lastAnswer && (
        <div className="text-sm text-gray-400">
          Ответ капитана: <span className="text-gray-200">«{snap.lastAnswer}»</span>
        </div>
      )}
      <div className="mt-3 text-sm text-gray-300">{snap.lastWasCorrect ? '+1 очко команде' : '0 очков'}</div>
    </div>
  );
}

function PlayersPanel({ mode, players, snap, playerId, showingResult }: {
  mode: TeamMode; players: Player[]; snap: PetersburgSnapshot | null; playerId: string | null; showingResult: boolean;
}) {
  const rows = mode === 'ffa'
    ? players.slice().sort((a, b) => (snap?.scores?.[b.id] ?? 0) - (snap?.scores?.[a.id] ?? 0))
    : players;
  return (
    <div className="mt-2">
      <h3 className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
        {mode === 'ffa' ? 'Игроки' : 'Команда'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map(p => {
          const isMe = p.id === playerId;
          const isCap = mode === 'coop' && snap?.captainId === p.id;
          const dealtToMe = snap?.dealt?.includes(p.id);
          const a = snap?.answers?.[p.id];
          let status = '';
          if (p.isBot) status = 'Бот — наблюдает';
          else if (mode === 'ffa') {
            status = showingResult
              ? (a ? (a.correct ? `✅ +${a.points}` : a.gaveUp ? '🏳 сдался' : '❌ мимо') : '⏰ не ответил')
              : (a ? (a.correct ? '✅ ответил' : a.gaveUp ? '🏳 сдался' : '❌ ответил') : '🤔 думает');
          } else {
            status = showingResult ? '—' : dealtToMe ? '🎭 Получил актёра' : 'Ждёт раунда';
          }
          return (
            <div
              key={p.id}
              className={`rounded-lg border px-3 py-2 flex items-center gap-2
                ${isMe ? 'border-amber-600 bg-amber-950/30' : 'border-slate-800 bg-black/40'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isCap && <span title="Капитан">👑</span>}
                  <span className="font-semibold truncate">
                    {p.name}{p.isBot && ' 🤖'}
                  </span>
                  {isMe && <span className="text-[10px] text-amber-400">(ты)</span>}
                </div>
                <div className={`text-[11px] truncate ${p.isBot ? 'text-gray-600' : 'text-gray-500'}`}>{status}</div>
              </div>
              {mode === 'ffa' && !p.isBot && (
                <div className="text-lg font-bold text-amber-200 tabular-nums">{snap?.scores?.[p.id] ?? 0}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamsPanel({ teams, players, snap, playerId, showingResult }: {
  teams: Team[]; players: Player[]; snap: PetersburgSnapshot | null; playerId: string | null; showingResult: boolean;
}) {
  const me = players.find(p => p.id === playerId);
  const rows = teams.filter(t => players.some(p => p.teamId === t.id));
  return (
    <div className="mt-2">
      <h3 className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">Команды</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map(t => {
          const members = players.filter(p => p.teamId === t.id);
          const r = snap?.teamRounds?.[t.id];
          const isMine = me?.teamId === t.id;
          const status = !r ? 'наблюдают'
            : showingResult ? (r.correct ? '✅ угадали' : r.timedOut ? '⏰ не успели' : '❌ мимо')
              : r.answered ? '✅ ответили' : '🤔 думают';
          return (
            <div key={t.id} className={`rounded-lg border px-3 py-2 ${isMine ? 'bg-black/50' : 'bg-black/30 border-slate-800'}`}
              style={isMine ? { borderColor: t.color } : undefined}>
              <div className="flex items-center gap-2">
                <TeamBadge team={t} size="sm" />
                <span className="text-[11px] text-gray-500">{status}</span>
                <span className="ml-auto text-lg font-bold tabular-nums" style={{ color: t.color }}>{snap?.teamScores?.[t.id] ?? 0}</span>
              </div>
              <div className="mt-1 text-[12px] text-gray-400 truncate">
                {members.map(p => `${r?.captainId === p.id ? '👑 ' : ''}${p.name}${p.isBot ? ' 🤖' : ''}${p.id === playerId ? ' (ты)' : ''}`).join(' · ')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
