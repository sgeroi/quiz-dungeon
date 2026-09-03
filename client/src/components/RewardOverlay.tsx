import { useStore } from '../store';
import { socket } from '../socket';
import type { PerkId } from '../types';

interface PerkDef {
  id: PerkId;
  name: string;
  emoji: string;
  description: string;
}

const PERKS: Record<PerkId, PerkDef> = {
  'sharp-blade': { id: 'sharp-blade', name: 'Острый клинок', emoji: '🗡️', description: '+10 к урону каждого правильного ответа.' },
  'life-elixir': { id: 'life-elixir', name: 'Эликсир жизни', emoji: '💚', description: 'Сразу восстанавливает HP до полного.' },
  'shield':      { id: 'shield',      name: 'Щит',           emoji: '🛡️', description: 'Поглощает один удар по тебе.' },
  'speed':       { id: 'speed',       name: 'Скорость',      emoji: '⚡', description: 'Быстрый правильный ответ — +30% урона.' },
  'luck':        { id: 'luck',        name: 'Удача',         emoji: '🍀', description: '+10% к урону команды на следующий раунд.' },
  'fury':        { id: 'fury',        name: 'Ярость',        emoji: '🔥', description: 'Активируй — следующий правильный ответ x2 урон.' },
  'revive':      { id: 'revive',      name: 'Возрождение',   emoji: '💀', description: 'Воскрешает павшего товарища (50% HP).' },
  'wisdom':      { id: 'wisdom',      name: 'Мудрость',      emoji: '📖', description: 'Перед ответом убирает один неверный вариант.' },
};

export default function RewardOverlay() {
  const gameState = useStore((s) => s.gameState);
  const playerId = useStore((s) => s.playerId);
  if (!gameState || !playerId) return null;
  const rp = gameState.rewardPhase;
  if (!rp) return null;

  const myTurn = rp.currentPickerId === playerId;
  const picker = rp.currentPickerId ? gameState.players[rp.currentPickerId] : null;
  const timer = gameState.timer ?? 0;
  const total = rp.rotation.length;
  const turn = rp.turnIndex + 1;

  const handlePick = (id: PerkId) => {
    if (!myTurn) return;
    socket.emit('select-reward', id);
  };

  return (
    <div
      className="fixed inset-y-0 left-0 right-0 md:right-72 z-40 flex items-center justify-center p-3"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(20,30,60,0.95) 0%, rgba(5,8,20,0.98) 80%)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div className="glass-panel rounded-3xl p-5 md:p-7 max-w-3xl w-full border border-amber-400/40 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-300/80 mb-1">Награда после этажа</div>
          <div className="text-2xl font-serif text-amber-100">
            🎁 Выбор перка <span className="text-amber-400">{turn}</span>
            <span className="text-gray-500"> из {total}</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            Сейчас выбирает: <span className={`font-bold ${myTurn ? 'text-amber-300' : 'text-white'}`}>
              {picker?.name ?? '...'}
            </span>
            {myTurn && <span className="text-amber-400 ml-1">(ты)</span>}
            <span className="text-gray-500 ml-2 font-mono">— {timer}с</span>
          </div>
        </div>

        {myTurn ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {rp.options.map((id) => {
              const def = PERKS[id];
              if (!def) return null;
              return (
                <button
                  key={id}
                  onClick={() => handlePick(id)}
                  className="rounded-2xl p-4 text-left border-2 border-amber-700/40 bg-gradient-to-br from-amber-950/60 to-black hover:border-amber-400/80 hover:scale-[1.03] active:scale-95 transition-all shadow-lg"
                >
                  <div className="text-4xl mb-2">{def.emoji}</div>
                  <div className="font-bold text-amber-200 text-base mb-1">{def.name}</div>
                  <div className="text-xs text-gray-300 leading-snug">{def.description}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="text-center text-gray-400 py-6 text-sm">
              ⏳ Ждём, пока выберет {picker?.name ?? 'другой игрок'}…
            </div>
            <div className="grid grid-cols-3 gap-2 opacity-60">
              {rp.options.map((id) => {
                const def = PERKS[id];
                if (!def) return null;
                return (
                  <div
                    key={id}
                    className="rounded-xl p-3 border border-amber-800/30 bg-amber-950/20 text-center"
                  >
                    <div className="text-3xl">{def.emoji}</div>
                    <div className="text-xs text-amber-200/80 mt-1 truncate">{def.name}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 text-[11px] text-gray-500 text-center">
          Порядок выбора в этом раунде:{' '}
          {rp.rotation.map((id, i) => {
            const p = gameState.players[id];
            const done = i < rp.turnIndex;
            const cur = i === rp.turnIndex;
            return (
              <span
                key={id}
                className={`mx-1 ${done ? 'line-through text-gray-600' : cur ? 'text-amber-300 font-bold' : 'text-gray-400'}`}
              >
                {p?.name ?? '?'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
