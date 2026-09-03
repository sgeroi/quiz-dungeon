const letters = ['A', 'B', 'C', 'D'];
const letterColors = ['text-rose-400', 'text-blue-400', 'text-amber-400', 'text-emerald-400'];

interface AnswerButtonProps {
  index: number;
  text: string;
  onClick: () => void;
  disabled: boolean;
  selected: boolean;
  correct: boolean | null;
  showResult: boolean;
}

export default function AnswerButton({
  index,
  text,
  onClick,
  disabled,
  selected,
  correct,
  showResult,
}: AnswerButtonProps) {
  let bgClass = 'bg-white/5 hover:bg-white/10';
  let borderClass = 'border-white/10 hover:border-white/20';
  let extra = '';

  if (showResult) {
    if (correct === true) {
      bgClass = 'bg-green-500/20';
      borderClass = 'border-green-400/50';
      extra = 'glow-green animate-[pulse_0.5s_ease-in-out_2]';
    } else if (selected && correct === false) {
      bgClass = 'bg-red-500/20';
      borderClass = 'border-red-400/50';
      extra = 'glow-red animate-[shake_0.4s_ease-in-out]';
    } else {
      bgClass = 'bg-white/3';
      borderClass = 'border-white/5';
    }
  } else if (selected) {
    bgClass = 'bg-blue-500/20';
    borderClass = 'border-blue-400/50';
    extra = 'glow-blue scale-[1.01]';
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3.5 px-4 rounded-2xl border ${bgClass} ${borderClass} text-left transition-all duration-200 disabled:opacity-60 active:scale-[0.97] ${extra}`}
    >
      <div className="flex items-center gap-3">
        <span className={`font-black text-lg ${letterColors[index]} shrink-0`}>
          {letters[index]}
        </span>
        <span className="text-white flex-1 text-base leading-snug">{text}</span>
        {selected && !showResult && (
          <span className="text-blue-300 text-xs font-bold shrink-0 animate-[fadeIn_0.3s_ease-in] bg-blue-500/20 px-2 py-0.5 rounded-full">✓</span>
        )}
        {showResult && correct === true && <span className="shrink-0 text-lg">✅</span>}
        {showResult && selected && correct === false && <span className="shrink-0 text-lg">❌</span>}
      </div>
    </button>
  );
}
