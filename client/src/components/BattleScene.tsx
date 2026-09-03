import { useEffect, useState } from 'react';
import type { Monster, Player, PlayerClass } from '../types';

const CLASS_SPRITES: Record<PlayerClass, string> = {
  warrior: '/sprites/warrior.png',
  mage: '/sprites/mage.png',
  healer: '/sprites/healer.png',
  scout: '/sprites/scout.png',
  bard: '/sprites/bard.png',
  blacksmith: '/sprites/blacksmith.png',
};

interface BattleSceneProps {
  players: Player[];
  monster: Monster | null;
  damageToMonster?: number;
  damageToPlayers?: number;
  monsterDefeated?: boolean;
  playersHit?: string[];
}

export default function BattleScene({ players, monster, damageToMonster, damageToPlayers, monsterDefeated, playersHit }: BattleSceneProps) {
  const [showDmgToMonster, setShowDmgToMonster] = useState(false);
  const [showDmgToPlayers, setShowDmgToPlayers] = useState(false);
  const [monsterShake, setMonsterShake] = useState(false);
  const [playersShake, setPlayersShake] = useState(false);

  useEffect(() => {
    if (damageToMonster && damageToMonster > 0) {
      setShowDmgToMonster(true);
      setMonsterShake(true);
      const t1 = setTimeout(() => setShowDmgToMonster(false), 2000);
      const t2 = setTimeout(() => setMonsterShake(false), 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [damageToMonster]);

  useEffect(() => {
    if (damageToPlayers && damageToPlayers > 0) {
      setShowDmgToPlayers(true);
      setPlayersShake(true);
      const t1 = setTimeout(() => setShowDmgToPlayers(false), 2000);
      const t2 = setTimeout(() => setPlayersShake(false), 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [damageToPlayers]);

  const monsterHpPct = monster ? Math.max(0, (monster.currentHp / monster.maxHp) * 100) : 0;
  const monsterSprite = monster ? `/sprites/monsters/${monster.name.toLowerCase().replace(/[\s-]/g, '_')}.png` : null;

  return (
    <div className="relative w-full h-48 rounded-2xl overflow-hidden mb-3 glass-panel">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-transparent to-emerald-950/20" />
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-emerald-950/40 to-transparent" />
      <div className="absolute bottom-13 left-0 right-0 h-px bg-emerald-700/20" />

      {/* Player party */}
      <div className={`absolute left-2 bottom-3 flex gap-1 transition-transform duration-300 ${playersShake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
        {players.slice(0, 6).map((p, i) => {
          const sprite = p.playerClass ? CLASS_SPRITES[p.playerClass] : null;
          const isHit = playersHit?.includes(p.id);
          const hpPct = p.maxPersonalHp > 0 ? Math.round((p.personalHp / p.maxPersonalHp) * 100) : 0;
          const hpColor = hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500';
          const isDead = !p.isAlive;
          return (
            <div key={p.id} className="flex flex-col items-center w-14" style={{ animationDelay: `${i * 0.1}s` }}>
              {isDead ? (
                <>
                  <span className="text-xs mb-0.5 opacity-50">💀</span>
                  <span className="text-3xl opacity-40 grayscale">💀</span>
                </>
              ) : (
                <>
                  <span className={`text-xs mb-0.5 transition-all duration-300 ${p.currentAnswer !== null ? 'animate-[fadeIn_0.3s_ease-out]' : 'animate-pulse'}`}>
                    {p.currentAnswer !== null ? '✅' : '⏳'}
                  </span>
                  {sprite ? (
                    <img
                      src={sprite}
                      alt={p.playerClass ?? 'hero'}
                      className="w-12 h-12 object-contain animate-[bobRun_0.6s_ease-in-out_infinite] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                      style={{
                        animationDelay: `${i * 0.15}s`,
                        filter: isHit ? 'brightness(0.4) sepia(1) hue-rotate(-50deg)' : 'none',
                      }}
                    />
                  ) : (
                    <span className="text-2xl" style={{ filter: isHit ? 'brightness(0.5)' : 'none' }}>🧑</span>
                  )}
                </>
              )}
              <span className={`text-[7px] truncate max-w-[3rem] mt-0.5 ${isDead ? 'text-red-400 line-through' : 'text-gray-400'}`}>{p.name}</span>
              <div className="w-10 h-1 bg-black/50 rounded-full overflow-hidden mt-0.5">
                <div className={`h-full rounded-full transition-all duration-500 ${isDead ? 'bg-red-800' : hpColor}`} style={{ width: `${isDead ? 0 : hpPct}%` }} />
              </div>
              <span className={`text-[7px] font-mono ${isDead ? 'text-red-500' : 'text-gray-500'}`}>{p.personalHp}</span>
            </div>
          );
        })}
      </div>

      {/* Floating damage to players */}
      {showDmgToPlayers && damageToPlayers && (
        <div className="absolute left-16 top-2 animate-[floatUp_2s_ease-out_forwards] text-red-400 font-black text-xl drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
          −{damageToPlayers} 💔
        </div>
      )}

      {/* VS spark */}
      {monster && !monsterDefeated && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="text-xs font-black text-white/20 animate-[sparkle_2s_ease-in-out_infinite]">⚡</span>
        </div>
      )}

      {/* Monster */}
      {monster && (
        <div className={`absolute right-4 bottom-4 flex flex-col items-center transition-transform duration-300 ${monsterShake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          {monsterSprite ? (
            <img
              src={monsterSprite}
              alt={monster.name}
              className={`w-20 h-20 object-contain drop-shadow-[0_0_12px_rgba(239,68,68,0.3)] -scale-x-100 ${monsterDefeated ? 'opacity-20 grayscale rotate-90 transition-all duration-1000' : 'animate-[monsterIdle_1.5s_ease-in-out_infinite]'}`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <span className={`text-5xl ${monsterSprite ? 'hidden' : ''} drop-shadow-[0_0_12px_rgba(239,68,68,0.3)] ${monsterDefeated ? 'opacity-20 grayscale rotate-90 transition-all duration-1000' : 'animate-[monsterIdle_1.5s_ease-in-out_infinite]'}`}>
            {monster.emoji}
          </span>
          <span className="text-xs text-white font-bold mt-1">{monster.name}</span>
          {/* Monster HP */}
          <div className="w-24 h-2 bg-black/50 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-700"
              style={{ width: `${monsterHpPct}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-400 mt-0.5">{monster.currentHp}/{monster.maxHp}</span>
        </div>
      )}

      {/* Floating damage to monster */}
      {showDmgToMonster && damageToMonster && (
        <div className="absolute right-10 top-1 animate-[floatUp_2s_ease-out_forwards] text-green-400 font-black text-xl drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">
          −{damageToMonster} ⚔️
        </div>
      )}

      {/* Monster defeated overlay */}
      {monsterDefeated && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="text-[var(--color-dungeon-gold)] font-black text-xl animate-bounce drop-shadow-[0_0_12px_rgba(245,197,24,0.5)]">
            💀 Повержен!
          </span>
        </div>
      )}
    </div>
  );
}
