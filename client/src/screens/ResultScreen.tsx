import { useStore } from '../store';

export default function ResultScreen() {
  const { gameState } = useStore();
  if (!gameState) return null;

  const isVictory = gameState.phase === 'victory';
  const players = Object.values(gameState.players);
  const alive = players.filter(p => p.isAlive).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto relative">
      {/* Background glow */}
      <div className={`absolute inset-0 ${isVictory ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,197,24,0.05),transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.05),transparent_70%)]'}`} />

      <div className="relative flex flex-col items-center w-full">
        {/* Icon */}
        <div className="relative mb-4">
          <div className={`absolute inset-0 blur-3xl rounded-full ${isVictory ? 'bg-[var(--color-dungeon-gold)]/20' : 'bg-red-500/20'}`} />
          <span className="relative text-8xl animate-[float_3s_ease-in-out_infinite] drop-shadow-lg">
            {isVictory ? '🏆' : '💀'}
          </span>
        </div>

        <h1 className={`text-4xl font-black mb-2 ${isVictory ? 'bg-gradient-to-r from-[var(--color-dungeon-gold)] via-amber-300 to-[var(--color-dungeon-gold)] bg-clip-text text-transparent' : 'text-red-400'}`}>
          {isVictory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          {isVictory ? 'Подземелье покорено!' : 'Тьма поглотила героев...'}
        </p>

        {/* Stats */}
        <div className="w-full glass-panel rounded-2xl p-4 mb-5">
          <div className="flex justify-between text-sm mb-3 pb-3 border-b border-white/5">
            <span className="text-gray-400">Этажей пройдено</span>
            <span className="text-white font-bold">{gameState.currentFloor}/{gameState.totalFloors}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Выживших</span>
            <span className={`font-bold ${alive > 0 ? 'text-green-400' : 'text-red-400'}`}>{alive}/{players.length}</span>
          </div>
        </div>

        {/* Players */}
        <div className="w-full flex flex-col gap-2 mb-6">
          {players.sort((a, b) => (b.personalHp - a.personalHp)).map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${p.isAlive ? 'glass-panel' : 'bg-white/3 opacity-50'}`}
            >
              <span className="text-xl">{p.isAlive ? '💪' : '👻'}</span>
              <span className="flex-1 text-white font-medium text-sm">{p.name}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.isAlive ? 'bg-green-500' : 'bg-red-500/50'}`} style={{ width: `${(p.personalHp / p.maxPersonalHp) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 font-mono w-8">{p.personalHp}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[var(--color-dungeon-accent)] to-rose-600 text-white font-bold text-lg transition-all hover:brightness-110 hover:shadow-[0_4px_20px_rgba(233,69,96,0.3)] active:scale-[0.97]"
        >
          🔄 Новая игра
        </button>
      </div>
    </div>
  );
}
