import type { Monster } from '../types';
import HealthBar from './HealthBar';

interface MonsterCardProps {
  monster: Monster;
}

export default function MonsterCard({ monster }: MonsterCardProps) {
  const isHurt = monster.currentHp < monster.maxHp;

  return (
    <div className="flex flex-col items-center gap-2 p-4">
      {monster.isBoss && (
        <span className="px-3 py-1 rounded-full bg-red-900/60 text-red-300 text-xs font-bold uppercase tracking-wider">
          БОСС
        </span>
      )}
      <span
        className={`text-6xl transition-transform ${isHurt ? 'animate-bounce' : ''}`}
      >
        {monster.emoji}
      </span>
      <h3 className="text-lg font-bold text-white">{monster.name}</h3>
      <div className="w-48">
        <HealthBar
          current={monster.currentHp}
          max={monster.maxHp}
          color="red"
          label="HP"
        />
      </div>
    </div>
  );
}
