import { useEffect, useState, useRef } from 'react';
import type { Player } from '../types';
import { CLASS_DEFS } from '../classData';
import { useStore } from '../store';

const COOLDOWN_MS = 60000;

interface AbilityButtonProps {
  player: Player;
}

export default function AbilityButton({ player }: AbilityButtonProps) {
  const useAbility = useStore((s) => s.useAbility);
  const classDef = player.playerClass ? CLASS_DEFS[player.playerClass] : null;
  const [cooldownEnd, setCooldownEnd] = useState<number>(() => Date.now() + COOLDOWN_MS);
  const [remaining, setRemaining] = useState(COOLDOWN_MS);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, cooldownEnd - Date.now());
      setRemaining(left);
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cooldownEnd]);

  if (!classDef) return null;

  const ready = remaining === 0;
  const progress = 1 - remaining / COOLDOWN_MS;
  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference * (1 - progress);
  const secondsLeft = Math.ceil(remaining / 1000);

  const handleClick = () => {
    if (!ready) return;
    useAbility();
    setCooldownEnd(Date.now() + COOLDOWN_MS);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!ready}
      className={`w-full py-3 px-5 rounded-2xl text-lg font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${
        ready
          ? 'bg-purple-700 text-white border-2 border-purple-400 hover:bg-purple-600 animate-[pulse_2s_ease-in-out_infinite]'
          : 'bg-gray-800 text-gray-500 border-2 border-gray-700'
      }`}
    >
      {/* Circular timer */}
      <div className="relative w-10 h-10 shrink-0">
        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke={ready ? '#a855f7' : '#6b7280'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {ready ? (
            <span className="text-purple-300 text-sm">⚡</span>
          ) : (
            <span className="text-gray-500 text-xs font-mono">{secondsLeft}</span>
          )}
        </div>
      </div>

      <span>{classDef.abilityName}</span>

      {ready && (
        <span className="text-purple-300 text-sm ml-1">ГОТОВО!</span>
      )}
    </button>
  );
}
