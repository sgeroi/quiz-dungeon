import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import TeamBadge from '../../components/TeamBadge';
import { LM_OPTION_STYLES, hearts, type LmSnapshot } from './types';

function useNow() { const [n, setN] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setN(Date.now()), 100); return () => clearInterval(i); }, []); return n; }

export default function LastManScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId) ?? '';
  const snap = (gameState as unknown as { lastman?: LmSnapshot } | null)?.lastman ?? null;
  const now = useNow();
  if (!gameState || !snap) return <div className="h-full flex items-center justify-center text-2xl font-extrabold">🏆 Последний герой — готовимся…</div>;

  const players = gameState.players;
  const teams = gameState.teams ?? [];
  const isTeams = gameState.teamMode === 'teams';
  const isCoop = (gameState.teamMode ?? 'coop') === 'coop';
  const me = players[playerId];
  const myTeam = isTeams && me?.teamId ? teams.find((t) => t.id === me.teamId) : null;
  const meAlive = snap.alive.includes(playerId);
  const answered = snap.answered.includes(playerId);
  const results = gameState.phase === 'results' || snap.finished;
  const intro = gameState.phase === 'floor-intro';
  const left = Math.max(0, Math.ceil((snap.questionStartMs + snap.timeLimit * 1000 - now) / 1000));
  const myAns = snap.revealAnswers?.[playerId];

  const answer = (i: number) => { if (!meAlive || answered || results) return; socket.emit('mode-lastman-answer' as any, i); };

  const order = Object.values(players).sort((a, b) => (snap.alive.includes(b.id) ? 1 : 0) - (snap.alive.includes(a.id) ? 1 : 0) || (snap.hearts[b.id] ?? 0) - (snap.hearts[a.id] ?? 0) || (snap.scores[b.id] ?? 0) - (snap.scores[a.id] ?? 0));

  if (intro) return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-3">🏆</div>
      <h1 className="text-3xl font-extrabold">Последний герой</h1>
      <p className="mt-3 text-[var(--color-dungeon-muted)] font-medium max-w-md">Ошибся или не успел — минус сердце. Таймер с каждым вопросом короче. С 9-го — внезапная смерть: любая ошибка выбивает.</p>
      <p className="mt-2 text-sm font-bold text-[var(--color-dungeon-gold)]">{isCoop ? `Общий запас сердец: ${snap.coop?.hearts}. Переживите ${snap.coop?.target} вопросов!` : isTeams ? 'Команда жива, пока жив хоть один её игрок.' : 'Кто останется последним — победил.'}</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col p-3 sm:p-5 max-w-3xl mx-auto w-full overflow-y-auto">
      {/* header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)]">🏆 Последний герой · вопрос {snap.round}</div>
          {snap.suddenDeath && <div className="text-sm font-extrabold text-[#FF6F6F] animate-pulse">☠️ Внезапная смерть — ошибка выбивает</div>}
        </div>
        <div className="text-right">
          {isCoop ? (
            <div className="text-sm font-bold">{hearts(snap.coop?.hearts ?? 0, snap.coop?.maxHearts ?? 0)}<div className="text-[11px] text-[var(--color-dungeon-muted)]">{snap.round}/{snap.coop?.target}</div></div>
          ) : (
            <div className="text-lg font-extrabold">{meAlive ? hearts(snap.hearts[playerId] ?? 0) : '💀 выбыл'}</div>
          )}
          {myTeam && <TeamBadge team={myTeam} size="sm" />}
        </div>
      </div>

      {/* timer */}
      {!results && (
        <div className="mb-3">
          <div className="flex justify-between text-xs font-bold mb-1"><span className="text-[var(--color-dungeon-muted)]">Осталось</span><span className={left <= 3 ? 'text-[#FF6F6F]' : 'text-white'}>{left} с</span></div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-[var(--color-dungeon-gold)] transition-all" style={{ width: `${Math.min(100, (left / snap.timeLimit) * 100)}%` }} /></div>
        </div>
      )}

      {/* question */}
      <div className="glass-panel p-4 mb-3"><div className="text-lg sm:text-2xl font-extrabold leading-snug">{snap.question?.text}</div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {snap.question?.options.map((o, i) => {
          const st = LM_OPTION_STYLES[i];
          const isCorrect = results && snap.revealCorrectIndex === i;
          const mine = (results ? myAns?.optionIdx : null) === i || (!results && answered && me?.currentAnswer === i);
          const dim = results && !isCorrect && !mine;
          return (
            <button key={i} onClick={() => answer(i)} disabled={!meAlive || answered || results}
              className={`text-left rounded-2xl p-3 sm:p-4 font-bold text-white transition-all ${dim ? 'opacity-35' : ''} ${isCorrect ? 'ring-4 ring-[#8DFF85]' : mine ? 'ring-4 ring-white' : ''} ${!meAlive || answered || results ? '' : 'active:scale-[0.98] hover:brightness-110'}`}
              style={{ background: st.bg }}>
              <span className="inline-flex w-7 h-7 items-center justify-center rounded-lg bg-black/30 mr-2 text-sm">{st.label}</span>{o}
              {isCorrect && <span className="ml-2">✓</span>}
            </button>
          );
        })}
      </div>

      {/* status line */}
      <div className="text-center text-sm font-bold mb-3 min-h-[1.5em]">
        {results ? (
          snap.mercy ? <span className="text-[var(--color-dungeon-gold)]">🙏 Все ошиблись — помилование, никто не пострадал</span>
          : myAns ? (myAns.correct ? <span className="text-[#8DFF85]">✓ Верно!</span> : <span className="text-[#FF6F6F]">{myAns.optionIdx === null ? '⏰ Не успел' : '✗ Мимо'} {snap.lastEliminated.includes(playerId) ? '— ты выбыл' : isCoop ? '— минус общее сердце' : '— минус сердце'}</span>)
          : null
        ) : !meAlive ? <span className="text-[var(--color-dungeon-muted)]">Ты наблюдаешь. Ответили: {snap.answered.length}/{snap.alive.length}</span>
          : answered ? <span className="text-[var(--color-dungeon-muted)]">Ответ принят. Ждём остальных: {snap.answered.length}/{snap.alive.length}</span>
          : <span className="text-white">Выбирай ответ!</span>}
      </div>

      {/* players */}
      {isTeams && snap.teamAlive && (
        <div className="flex flex-wrap gap-2 justify-center mb-2">
          {teams.map((t) => <div key={t.id} className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1"><TeamBadge team={t} size="sm" /><span className="text-xs font-bold">живых {snap.teamAlive?.[t.id] ?? 0}</span></div>)}
        </div>
      )}
      <div className="glass-panel p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Герои · живых {snap.alive.length}/{Object.keys(players).length}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {order.map((p) => {
            const alive = snap.alive.includes(p.id);
            const ans = snap.revealAnswers?.[p.id];
            const t = isTeams && p.teamId ? teams.find((x) => x.id === p.teamId) : null;
            return (
              <div key={p.id} className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs ${alive ? 'bg-white/5' : 'bg-black/30 opacity-50'} ${p.id === playerId ? 'ring-1 ring-[var(--color-dungeon-gold)]' : ''}`}>
                <span>{alive ? '🧑' : '💀'}</span>
                <span className="font-bold truncate flex-1" style={t ? { color: t.color } : undefined}>{p.name}</span>
                {!isCoop && alive && <span>{hearts(snap.hearts[p.id] ?? 0)}</span>}
                {results && ans && <span>{ans.correct ? '✓' : ans.optionIdx === null ? '⏰' : '✗'}</span>}
                {!results && alive && snap.answered.includes(p.id) && <span className="text-[#8DFF85]">●</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
