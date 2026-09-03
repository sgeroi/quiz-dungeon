interface TimerProps {
  seconds: number;
  maxSeconds: number;
}

export default function Timer({ seconds, maxSeconds }: TimerProps) {
  const pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0;
  const isLow = seconds <= 5;
  const isCritical = seconds <= 3;

  return (
    <div className="flex flex-col items-center gap-2 mb-3">
      <div className="relative">
        {isCritical && (
          <div className="absolute inset-0 rounded-full bg-red-500/20 animate-[pulse-ring_1s_ease-out_infinite]" style={{ width: '60px', height: '60px', margin: 'auto', left: 0, right: 0, top: '-6px' }} />
        )}
        <span
          className={`text-5xl font-black font-mono transition-all ${
            isCritical ? 'text-red-400 scale-110 animate-pulse' : isLow ? 'text-red-400' : 'text-white'
          }`}
        >
          {seconds}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isCritical ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            : isLow ? 'bg-red-400'
            : 'bg-gradient-to-r from-[var(--color-dungeon-mana)] to-cyan-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
