import type { Player } from '../types';
import { CLASS_DEFS } from '../classData';

interface PlayerCardProps {
  player: Player;
  isMe: boolean;
}

export default function PlayerCard({ player, isMe }: PlayerCardProps) {
  const classDef = player.playerClass ? CLASS_DEFS[player.playerClass] : null;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
        isMe
          ? 'border-[var(--color-dungeon-gold)] bg-[var(--color-dungeon-surface)]'
          : 'border-gray-700 bg-[var(--color-dungeon-surface)]'
      }`}
    >
      {classDef?.sprite ? (
        <img src={classDef.sprite} alt={classDef.nameRu} className="w-12 h-12 object-contain" />
      ) : (
        <span className="text-2xl">{classDef?.emoji ?? '❓'}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-white truncate">
          {player.isBot && <span className="text-gray-500 text-xs mr-1">BOT</span>}
          {player.name}
        </div>
        {classDef && (
          <div className="text-xs text-gray-400">{classDef.nameRu}</div>
        )}
      </div>
      {player.isReady && <span className="text-green-400 text-xl">✓</span>}
    </div>
  );
}
