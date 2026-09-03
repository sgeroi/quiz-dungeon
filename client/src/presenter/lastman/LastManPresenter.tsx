import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import TeamBadge from '../../components/TeamBadge';
import { LM_OPTION_STYLES, hearts, type LmSnapshot } from '../../modes/lastman/types';

function useNow() { const [n, setN] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setN(Date.now()), 100); return () => clearInterval(i); }, []); return n; }

export default function LastManPresenter() {
  const gs = useStore((s) => s.gameState);
  const snap = (gs as unknown as { lastman?: LmSnapshot } | null)?.lastman ?? null;
  const now = useNow();
  if (!gs || !snap) return <div className="h-full flex items-center justify-center text-5xl font-extrabold">🏆 Последний герой — готовимся…</div>;
  const players = gs.players; const teams = gs.teams ?? [];
  const isTeams = gs.teamMode === 'teams'; const isCoop = (gs.teamMode ?? 'coop') === 'coop';
  const results = gs.phase === 'results' || snap.finished;
  const left = Math.max(0, Math.ceil((snap.questionStartMs + snap.timeLimit * 1000 - now) / 1000));
  const order = Object.values(players).sort((a, b) => (snap.alive.includes(b.id) ? 1 : 0) - (snap.alive.includes(a.id) ? 1 : 0) || (snap.hearts[b.id] ?? 0) - (snap.hearts[a.id] ?? 0) || (snap.scores[b.id] ?? 0) - (snap.scores[a.id] ?? 0));

  if (gs.phase === 'floor-intro') return (
    <div className="h-full flex flex-col items-center justify-center text-center p-10">
      <div className="text-[120px] leading-none mb-4">🏆</div>
      <h1 className="text-7xl font-extrabold">Последний герой</h1>
      <p className="mt-6 text-3xl text-[var(--color-dungeon-muted)] font-medium max-w-4xl">Ошибся или не успел — минус сердце. Таймер всё короче. С 9-го вопроса — внезапная смерть.</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col p-8 gap-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)]">🏆 Последний герой · вопрос {snap.round}{isCoop ? ` из ${snap.coop?.target}` : ''}</div>
          {snap.suddenDeath ? <div className="text-4xl font-extrabold text-[#FF6F6F] animate-pulse mt-1">☠️ ВНЕЗАПНАЯ СМЕРТЬ</div>
            : results && snap.mercy ? <div className="text-4xl font-extrabold text-[var(--color-dungeon-gold)] mt-1">🙏 Все ошиблись — помилование!</div>
            : results && snap.lastEliminated.length > 0 ? <div className="text-4xl font-extrabold text-[#FF6F6F] mt-1">💀 Выбыли: {snap.lastEliminated.map((id) => players[id]?.name ?? '?').join(', ')}</div>
            : <div className="text-4xl font-extrabold mt-1">{results ? 'Разбор' : 'Отвечайте!'}</div>}
        </div>
        <div className="text-right">
          {isCoop ? <div className="text-4xl font-extrabold">{hearts(snap.coop?.hearts ?? 0, snap.coop?.maxHearts ?? 0)}</div>
            : <div className="text-3xl font-extrabold">живых {snap.alive.length} / {Object.keys(players).length}</div>}
          {!results && <div className={`text-7xl font-black leading-none mt-1 ${left <= 3 ? 'text-[#FF6F6F]' : 'text-[var(--color-dungeon-gold)]'}`}>{left}</div>}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-6 flex-1 min-h-0">
        <div className="flex flex-col gap-5">
          <div className="glass-panel neon-pink p-8 text-5xl font-extrabold leading-tight">{snap.question?.text}</div>
          <div className="grid grid-cols-2 gap-4">
            {snap.question?.options.map((o, i) => {
              const st = LM_OPTION_STYLES[i]; const isCorrect = results && snap.revealCorrectIndex === i;
              const n = results ? Object.values(snap.revealAnswers ?? {}).filter((a) => a.optionIdx === i).length : 0;
              return (
                <div key={i} className={`rounded-3xl p-6 text-3xl font-bold text-white ${results && !isCorrect ? 'opacity-35' : ''} ${isCorrect ? 'ring-8 ring-[#8DFF85]' : ''}`} style={{ background: st.bg }}>
                  <span className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-black/30 mr-3 text-2xl">{st.label}</span>{o}
                  {results && n > 0 && <span className="float-right text-2xl bg-black/30 rounded-full px-3">{n} 👤</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="glass-panel p-5 overflow-hidden flex flex-col">
          {isTeams && snap.teamAlive && (
            <div className="flex flex-col gap-2 mb-3">
              {teams.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2"><TeamBadge team={t} /><span className="text-2xl font-extrabold">{snap.teamAlive?.[t.id] ?? 0} 🧑</span></div>)}
            </div>
          )}
          <div className="text-lg font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Герои</div>
          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {order.map((p) => {
              const alive = snap.alive.includes(p.id); const ans = snap.revealAnswers?.[p.id];
              const t = isTeams && p.teamId ? teams.find((x) => x.id === p.teamId) : null;
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-2xl ${alive ? 'bg-white/5' : 'bg-black/30 opacity-45'}`}>
                  <span>{alive ? '🧑' : '💀'}</span>
                  <span className="font-bold truncate flex-1" style={t ? { color: t.color } : undefined}>{p.name}</span>
                  {!isCoop && alive && <span className="text-xl">{hearts(snap.hearts[p.id] ?? 0)}</span>}
                  {results ? (ans && <span>{ans.correct ? '✅' : ans.optionIdx === null ? '⏰' : '❌'}</span>) : alive && snap.answered.includes(p.id) && <span className="text-[#8DFF85]">●</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
