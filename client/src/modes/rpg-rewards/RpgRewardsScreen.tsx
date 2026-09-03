import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { socket } from '../../socket';
import { RPGR_CARDS, getCardById, type RpgrCardDef, type RpgrCardId } from './cards';

interface MonsterRuntime {
  index: number;
  name: string;
  emoji: string;
  hp: number;
  max: number;
}

interface PlayerSlot {
  hp: number;
  maxHp: number;
  alive: boolean;
  cards: RpgrCardId[];
  bladeBonus: number;
  shieldCharges: number;
  speedBonus: boolean;
  reviveAvailable: number;
  wisdomCharges: number;
  furyRoundsLeft: number;
}

interface RpgrSnapshot {
  round: number;
  total: number;
  phase: 'fight' | 'reward' | 'results' | 'victory' | 'defeat';
  currentMonster: MonsterRuntime | null;
  monstersKilled: number;
  currentQuestion: { id: string; text: string; options: string[] } | null;
  currentAnswers: Record<string, number | null>;
  rewardOptions: Record<string, RpgrCardId[]>;
  rewardPicks: Record<string, RpgrCardId | null>;
  teamLuckPending: number;
  players: Record<string, PlayerSlot>;
  lastRoundSummary: {
    correctIndex: number;
    teamPick: number | null;
    correct: boolean;
    damageToMonster: number;
    damageToTeam: number;
    answers: Record<string, number | null>;
  } | null;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export default function RpgRewardsScreen() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);
  const phase = gameState?.phase;
  const r = (gameState as any)?.rpgr as RpgrSnapshot | undefined;

  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [pickedReward, setPickedReward] = useState<RpgrCardId | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [usedWisdom, setUsedWisdom] = useState(false);
  const [showReviveModal, setShowReviveModal] = useState(false);

  // Reset answer UI when a new question arrives.
  useEffect(() => {
    setPickedIndex(null);
    setEliminatedOptions([]);
    setUsedWisdom(false);
  }, [r?.currentQuestion?.id]);

  // Listen for server's wisdom-result and apply elimination.
  useEffect(() => {
    const handler = (payload: { questionId: string; eliminated: number[] }) => {
      if (!r?.currentQuestion) return;
      if (payload.questionId !== r.currentQuestion.id) return;
      setEliminatedOptions(Array.isArray(payload.eliminated) ? payload.eliminated : []);
    };
    socket.on('mode-rpgr-wisdom-result' as any, handler);
    return () => {
      socket.off('mode-rpgr-wisdom-result' as any, handler);
    };
  }, [r?.currentQuestion?.id]);

  // Reset reward UI when reward phase starts.
  useEffect(() => {
    if (r?.phase === 'reward') {
      setPickedReward(null);
    }
  }, [r?.phase, r?.round]);

  if (!gameState) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Загрузка...
      </div>
    );
  }

  if (phase === 'victory' || phase === 'defeat') {
    return <GameOver victory={phase === 'victory'} r={r} players={gameState.players as any} />;
  }

  if (!r) {
    return (
      <div className="h-full flex items-center justify-center text-amber-300">
        Готовим подземелье...
      </div>
    );
  }

  if (r.phase === 'reward') {
    const myOptions = (playerId && r.rewardOptions[playerId]) || [];
    const cards: RpgrCardDef[] = myOptions.map((id) => getCardById(id)!).filter(Boolean);
    const totalPlayers = Object.keys(gameState.players).length;
    const pickedCount = Object.values(r.rewardPicks || {}).filter((p) => p != null).length;

    return (
      <div className="h-full p-6 flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-amber-300 text-3xl font-bold mb-1">Фаза награды</div>
          <div className="text-gray-400 text-sm">Выбери одну из трёх карт. Эффект — до конца игры.</div>
          <div className="text-gray-500 text-xs mt-2">{pickedCount} из {totalPlayers} выбрали</div>
          <div className="text-amber-400 text-sm mt-1">⏱ {gameState.timer}s</div>
        </div>
        <div className="flex flex-wrap justify-center gap-6 max-w-5xl">
          {cards.map((c) => {
            const picked = pickedReward === c.id;
            return (
              <button
                key={c.id}
                disabled={pickedReward != null}
                onClick={() => {
                  if (pickedReward != null) return;
                  setPickedReward(c.id);
                  socket.emit('mode-rpgr-reward-pick' as any, c.id);
                }}
                className={`glass-panel-gold rounded-xl p-6 w-64 h-80 flex flex-col items-center justify-between transition transform
                  ${picked ? 'ring-4 ring-amber-400 scale-105 glow-gold' : 'hover:scale-105 hover:glow-gold'}
                  ${pickedReward != null && !picked ? 'opacity-40' : ''}`}
              >
                <div className="text-7xl">{c.emoji}</div>
                <div className="text-amber-200 text-xl font-bold">{c.name}</div>
                <div className="text-gray-300 text-sm text-center">{c.description}</div>
              </button>
            );
          })}
        </div>
        {pickedReward && (
          <div className="text-emerald-400 text-sm">Ждём остальных...</div>
        )}
      </div>
    );
  }

  // Fight / Results phase
  const monster = r.currentMonster;
  const myEffects = (playerId && r.players[playerId]) || null;

  return (
    <div className="h-full p-4 flex flex-col gap-4">
      {/* Top: monster */}
      <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
        <div className="text-7xl">{monster?.emoji}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-rose-300">{monster?.name}</div>
            <div className="text-gray-400 text-sm">
              Раунд {Math.min(r.round + 1, r.total)} / {r.total} · убито: {r.monstersKilled}
            </div>
          </div>
          <div className="hp-bar mt-2 h-5 bg-black/40 rounded-full overflow-hidden border border-rose-500/30">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-700 transition-all"
              style={{ width: `${monster ? (monster.hp / monster.max) * 100 : 0}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            HP: {monster?.hp ?? 0} / {monster?.max ?? 0}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: team */}
        <div className="w-56 flex flex-col gap-2 overflow-y-auto">
          <div className="text-amber-300 text-sm font-bold">Команда</div>
          {Object.values(gameState.players).map((p) => {
            const slot = r.players[p.id];
            if (!slot) return null;
            const hpPct = (slot.hp / slot.maxHp) * 100;
            return (
              <div
                key={p.id}
                className={`glass-panel rounded-lg p-2 ${slot.alive ? '' : 'opacity-50'} ${p.id === playerId ? 'ring-1 ring-amber-400/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold truncate">{p.name}</div>
                  {!slot.alive && <span className="text-xs text-rose-400">💀</span>}
                </div>
                <div className="hp-bar h-2 bg-black/40 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all ${slot.alive ? 'bg-gradient-to-r from-emerald-500 to-emerald-700' : 'bg-rose-700'}`}
                    style={{ width: `${Math.max(0, hpPct)}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{slot.hp} / {slot.maxHp}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {slot.bladeBonus > 0 && (
                    <span title={`+${slot.bladeBonus} урон`} className="text-xs">🗡️</span>
                  )}
                  {slot.shieldCharges > 0 && (
                    <span title={`Щитов: ${slot.shieldCharges}`} className="text-xs">🛡️</span>
                  )}
                  {slot.speedBonus && <span title="Бонус скорости" className="text-xs">⚡</span>}
                  {slot.furyRoundsLeft > 0 && <span title={`Ярость x2: ${slot.furyRoundsLeft}`} className="text-xs">🔥</span>}
                  {slot.wisdomCharges > 0 && <span title={`Мудрость: ${slot.wisdomCharges}`} className="text-xs">📖</span>}
                  {slot.reviveAvailable > 0 && <span title="Возрождение" className="text-xs">💀</span>}
                </div>
              </div>
            );
          })}
          {(r.teamLuckPending ?? 0) > 0 && (
            <div className="glass-panel-gold rounded-lg p-2 text-xs text-amber-200">
              🍀 Удача команды активна
            </div>
          )}
        </div>

        {/* Center: question */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {r.currentQuestion && (
            <>
              <div className="glass-panel rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wider text-gray-400">Вопрос</div>
                  <div className="text-amber-400 text-sm">⏱ {gameState.timer}s</div>
                </div>
                <div className="text-xl font-medium">{r.currentQuestion.text}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                {r.currentQuestion.options.map((opt, idx) => {
                  const isEliminated = eliminatedOptions.includes(idx);
                  const isPicked = pickedIndex === idx;
                  const inResults = r.phase === 'results' && r.lastRoundSummary;
                  const isCorrect = inResults && r.lastRoundSummary!.correctIndex === idx;
                  const isWrongPick = inResults && r.lastRoundSummary!.teamPick === idx && !r.lastRoundSummary!.correct;
                  const myAnswer = playerId && r.currentAnswers ? r.currentAnswers[playerId] : null;
                  const wasMine = myAnswer === idx;

                  let cls = 'glass-panel hover:bg-white/5';
                  if (isEliminated) cls = 'glass-panel opacity-30 line-through';
                  if (isPicked) cls = 'glass-panel-gold ring-2 ring-amber-400 glow-gold';
                  if (inResults) {
                    if (isCorrect) cls = 'glass-panel ring-2 ring-emerald-400 glow-green';
                    else if (isWrongPick) cls = 'glass-panel ring-2 ring-rose-500 glow-red';
                    else cls = 'glass-panel opacity-50';
                  }

                  return (
                    <button
                      key={idx}
                      disabled={pickedIndex != null || r.phase !== 'fight' || isEliminated || !myEffects?.alive}
                      onClick={() => {
                        if (r.phase !== 'fight') return;
                        if (pickedIndex != null) return;
                        if (!myEffects?.alive) return;
                        if (isEliminated) return;
                        setPickedIndex(idx);
                        socket.emit('mode-rpgr-answer' as any, idx);
                      }}
                      className={`rounded-xl p-3 text-left transition ${cls}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-300 font-bold">
                          {LETTERS[idx]}
                        </div>
                        <div className="flex-1">{opt}</div>
                        {wasMine && r.phase === 'results' && <div className="text-xs text-amber-300">твой</div>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Revive ability button — visible while alive with charges */}
              {myEffects && myEffects.reviveAvailable > 0 && myEffects.alive && (() => {
                const deadTeammates = Object.values(gameState.players).filter((p) => {
                  if (p.id === playerId) return false;
                  const slot = r.players[p.id];
                  return slot && !slot.alive;
                });
                if (deadTeammates.length === 0) return null;
                return (
                  <button
                    onClick={() => setShowReviveModal(true)}
                    className="self-start rounded-lg px-4 py-2 text-sm font-bold bg-gradient-to-r from-emerald-500/40 to-teal-500/30 border border-emerald-300/40 text-emerald-100 hover:brightness-110 active:scale-95 transition shadow-[0_0_18px_rgba(16,185,129,0.35)]"
                  >
                    💀 Возрождение ({myEffects.reviveAvailable}) — выбрать цель
                  </button>
                );
              })()}

              {/* Wisdom hint button — server-driven 50/50 */}
              {myEffects && myEffects.wisdomCharges > 0 && !usedWisdom && eliminatedOptions.length === 0 && r.phase === 'fight' && pickedIndex == null && myEffects.alive && (
                <button
                  onClick={() => {
                    if (!r.currentQuestion) return;
                    setUsedWisdom(true);
                    socket.emit('mode-rpgr-use-wisdom' as any);
                  }}
                  className="self-start rounded-lg px-4 py-2 text-sm font-bold bg-gradient-to-r from-purple-500/40 to-fuchsia-500/30 border border-purple-300/40 text-purple-100 hover:brightness-110 active:scale-95 transition shadow-[0_0_18px_rgba(168,85,247,0.35)]"
                >
                  🧠 50/50 — убрать 2 неверных ({myEffects.wisdomCharges})
                </button>
              )}
            </>
          )}

          {/* Results banner */}
          {r.phase === 'results' && r.lastRoundSummary && (
            <div className={`glass-panel rounded-xl p-3 text-center ${r.lastRoundSummary.correct ? 'glow-green' : 'glow-red'}`}>
              {r.lastRoundSummary.correct ? (
                <div className="text-emerald-400 font-bold">
                  ⚔️ Правильно! Урон по монстру: {r.lastRoundSummary.damageToMonster}
                </div>
              ) : (
                <div className="text-rose-400 font-bold">
                  💥 Неправильно. Урон по команде: {r.lastRoundSummary.damageToTeam}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: my cards */}
      {myEffects && myEffects.cards.length > 0 && (
        <div className="glass-panel rounded-xl p-3">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Мои карты</div>
          <div className="flex gap-2 flex-wrap">
            {myEffects.cards.map((id, i) => {
              const c = getCardById(id);
              if (!c) return null;
              return (
                <div
                  key={`${id}-${i}`}
                  className="glass-panel-gold rounded-lg px-3 py-2 flex items-center gap-2 text-sm"
                  title={c.description}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-amber-200">{c.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revive target picker modal */}
      {showReviveModal && myEffects && myEffects.reviveAvailable > 0 && (() => {
        const deadTeammates = Object.values(gameState.players).filter((p) => {
          if (p.id === playerId) return false;
          const slot = r.players[p.id];
          return slot && !slot.alive;
        });
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setShowReviveModal(false)}
          >
            <div
              className="glass-panel-gold rounded-2xl p-5 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-amber-300 text-lg font-bold mb-2 text-center">💀 Кого воскресить?</div>
              <div className="text-xs text-gray-400 text-center mb-4">
                Цель восстановит 50 HP и сможет снова отвечать.
              </div>
              {deadTeammates.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">
                  Нет павших товарищей.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {deadTeammates.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        socket.emit('mode-rpgr-use-revive' as any, { targetId: p.id });
                        setShowReviveModal(false);
                      }}
                      className="rounded-lg px-4 py-3 bg-gradient-to-r from-emerald-600/40 to-teal-500/30 border border-emerald-400/40 hover:brightness-110 active:scale-[0.98] transition text-left"
                    >
                      <div className="font-bold text-emerald-100">{p.name}</div>
                      <div className="text-xs text-emerald-200/70">Воскресить с 50 HP</div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowReviveModal(false)}
                className="mt-4 w-full rounded-lg px-4 py-2 bg-white/5 hover:bg-white/10 text-sm text-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function GameOver({
  victory,
  r,
  players,
}: {
  victory: boolean;
  r: RpgrSnapshot | undefined;
  players: Record<string, { id: string; name: string }>;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-6">
      <div className={`text-6xl font-extrabold ${victory ? 'text-amber-300 glow-gold' : 'text-rose-400 glow-red'}`}>
        {victory ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ'}
      </div>
      <div className="text-gray-300 text-lg">
        Убито монстров: <span className="text-amber-300 font-bold">{r?.monstersKilled ?? 0}</span> / {r?.total ?? 5}
      </div>

      <div className="glass-panel-gold rounded-xl p-6 max-w-3xl w-full">
        <div className="text-amber-300 text-xl font-bold mb-3 text-center">🎁 Полученный лут</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.values(players).map((p) => {
            const slot = r?.players[p.id];
            const cards = slot?.cards ?? [];
            return (
              <div key={p.id} className="glass-panel rounded-lg p-3">
                <div className="font-bold text-amber-200 mb-2">{p.name}</div>
                <div className="flex gap-2 flex-wrap">
                  {cards.length === 0 && <span className="text-gray-500 text-sm">(нет карт)</span>}
                  {cards.map((id, i) => {
                    const c = getCardById(id);
                    if (!c) return null;
                    return (
                      <div
                        key={`${id}-${i}`}
                        title={c.description}
                        className="text-2xl"
                      >
                        {c.emoji}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-gray-500">Карт всего в колоде: {RPGR_CARDS.length}</div>
    </div>
  );
}
