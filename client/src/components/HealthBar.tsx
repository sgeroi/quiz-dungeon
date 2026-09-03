interface HealthBarProps {
  current: number;
  max: number;
  color?: 'red' | 'green' | 'blue' | 'gold';
  label?: string;
}

const colorMap = {
  red: 'bg-red-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  gold: 'bg-[var(--color-dungeon-gold)]',
};

export default function HealthBar({ current, max, color = 'red', label }: HealthBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs mb-1">
          <span className="opacity-70">{label}</span>
          <span className="font-mono">{current}/{max}</span>
        </div>
      )}
      <div className="w-full h-3 rounded-full bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
