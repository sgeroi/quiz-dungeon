import { useEffect, useMemo, useState } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';

// ---------- Types ----------

interface RevealCastMember {
  playerId: string;
  playerName: string;
  actorName: string;
  imageUrl: string;
}

interface PetersburgSnapshot {
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
}

interface PrivateActor {
  imageUrl: string;
  round: number;
  total: number;
  isCaptain: boolean;
}

interface GameStateWithPetersburg {
  petersburg?: PetersburgSnapshot;
}

export default function PetersburgScreen() {
  const gameState = useStore(s => s.gameState);
  const playerId = useStore(s => s.playerId);

  const [myActor, setMyActor] = useState<PrivateActor | null>(null);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const snap = (gameState as (typeof gameState & GameStateWithPetersburg) | null)?.petersburg ?? null;
  const isCaptain = !!snap && snap.captainId === playerId;
  const round = snap?.round ?? 0;
  const total = snap?.total ?? 10;
  const score = snap?.score ?? 0;
  const timer = gameState?.timer ?? 0;
  const phase = gameState?.phase ?? null;
  const showingResult = !!snap?.showingResult || phase === 'results';

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

  function submit() {
    const trimmed = draftAnswer.trim();
    if (!trimmed) return;
    if (submitted) return;
    if (!isCaptain) return;
    setSubmitted(true);
    socket.emit('mode-petersburg-answer' as any, trimmed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit();
  }

  const players = useMemo(
    () => (gameState ? Object.values(gameState.players) : []),
    [gameState],
  );

  const captainPlayer = snap ? gameState?.players[snap.captainId] : null;

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
              🎬 Санкт-Петербург
            </div>
            <div className="text-lg sm:text-2xl font-serif sm:mt-1 whitespace-nowrap">
              Раунд <span className="text-amber-300">{Math.max(1, round)}</span>
              <span className="text-gray-500"> из {total}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded border border-amber-700/50 bg-black/40">
              <div className="text-[10px] uppercase tracking-wider text-amber-400/70">Счёт</div>
              <div className="text-xl font-bold text-amber-200 leading-none">
                {score}<span className="text-gray-500 text-sm">/{total}</span>
              </div>
            </div>
            <div className={`px-3 py-2 rounded border min-w-[5ch] text-right
              ${timer <= 10 ? 'border-rose-700 bg-rose-950/40 text-rose-200' : 'border-amber-700/50 bg-black/40 text-amber-200'}`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Таймер</div>
              <div className="text-xl font-mono leading-none">{Math.max(0, timer)}с</div>
            </div>
          </div>
        </div>

        {/* ---------- Captain banner (everyone sees who's captain) ---------- */}
        {captainPlayer && !showingResult && (
          <div className="mb-5 flex items-center gap-2 text-sm text-amber-200/80">
            <span>👑</span>
            <span>Капитан раунда:</span>
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
              У каждого свой актёр — обсудите голосом и угадайте фильм вместе.
              Ответ вводит капитан.
            </div>
          </div>
        )}

        {/* ---------- Result banner ---------- */}
        {showingResult && snap && snap.lastMovieTitle && (
          <div className={`mb-6 rounded-lg border-2 p-5 text-center
            ${snap.lastWasCorrect
              ? 'border-emerald-600/70 bg-emerald-950/40'
              : 'border-rose-700/70 bg-rose-950/40'}`}>
            <div className="text-3xl mb-1">
              {snap.lastWasCorrect ? '✅ В точку!' : '❌ Мимо'}
            </div>
            <div className="text-sm text-gray-400 mb-2">Загаданный фильм</div>
            <div className="text-2xl font-serif text-amber-200 mb-1">
              «{snap.lastMovieTitle}»
            </div>
            {snap.lastAnswer && (
              <div className="text-sm text-gray-400">
                Ответ капитана: <span className="text-gray-200">«{snap.lastAnswer}»</span>
              </div>
            )}
            <div className="mt-3 text-sm text-gray-300">
              {snap.lastWasCorrect ? '+1 очко команде' : '0 очков'}
            </div>
          </div>
        )}

        {/* ---------- My actor (during round) ---------- */}
        {!showingResult && myActor && (
          <div className="mb-6 flex flex-col items-center">
            <div className="text-xs uppercase tracking-[0.25em] text-amber-400/80 mb-3">
              Твой актёр
            </div>
            <div className="rounded-2xl overflow-hidden border-4 border-amber-700/60 bg-black/40
              shadow-[0_0_40px_rgba(217,119,6,0.25)]">
              <img
                src={myActor.imageUrl}
                alt="Актёр"
                className="block w-[280px] h-[360px] sm:w-[340px] sm:h-[420px] object-cover"
                draggable={false}
              />
            </div>
            <p className="mt-3 text-sm text-center text-gray-400 max-w-md">
              💬 Опиши его голосом — кого видишь? У других игроков свои актёры из того же фильма.
            </p>
          </div>
        )}

        {/* ---------- Captain answer input ---------- */}
        {!showingResult && isCaptain && (
          <div className="bg-black/50 border-2 border-amber-700/60 rounded-xl p-5 shadow-2xl mb-6">
            <div className="text-center text-sm text-gray-300 mb-3">
              👑 Ты вводишь ответ от команды
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
            <button
              onClick={submit}
              disabled={submitted || !draftAnswer.trim()}
              className="mt-3 w-full py-3 rounded-lg font-bold text-lg
                bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700
                border-2 border-amber-500/60 text-black
                disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 disabled:border-gray-700
                transition"
            >
              {submitted ? 'Отправлено…' : 'Ответить'}
            </button>
          </div>
        )}

        {/* ---------- Reveal: full cast lineup ---------- */}
        {showingResult && snap?.lastReveal && snap.lastReveal.length > 0 && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3 text-center">
              Каст этого раунда
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {snap.lastReveal.map(item => (
                <div key={item.playerId}
                  className={`rounded-xl overflow-hidden border-2 bg-black/50
                    ${item.playerId === playerId ? 'border-amber-500' : 'border-slate-700'}`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.actorName}
                    className="block w-full h-44 object-cover"
                    draggable={false}
                  />
                  <div className="px-2 py-2">
                    <div className="text-sm text-amber-100 font-semibold leading-tight truncate">
                      {item.actorName}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                      у {item.playerName}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Players panel ---------- */}
        <div className="mt-2">
          <h3 className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
            Команда
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {players.map(p => {
              const isMe = p.id === playerId;
              const isCap = snap?.captainId === p.id;
              const dealtToMe = snap?.dealt?.includes(p.id);
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
                    {!p.isBot && (
                      <div className="text-[11px] text-gray-500 truncate">
                        {showingResult
                          ? '—'
                          : dealtToMe
                            ? '🎭 Получил актёра'
                            : 'Ждёт раунда'}
                      </div>
                    )}
                    {p.isBot && (
                      <div className="text-[11px] text-gray-600">Бот — наблюдает</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
