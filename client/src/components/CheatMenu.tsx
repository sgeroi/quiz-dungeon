import { useState } from 'react';
import { useStore } from '../store';

export default function CheatMenu() {
  const [open, setOpen] = useState(false);
  const { cheatWin, cheatSkip } = useStore();

  return (
    <div className="fixed bottom-3 left-3 z-50">
      {open ? (
        <div className="glass-panel rounded-2xl p-3 border border-yellow-500/20 flex flex-col gap-2 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-yellow-400 font-bold text-xs">🛠 Чит-меню</span>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-xs px-1">✕</button>
          </div>
          <button
            onClick={() => { cheatWin(); setOpen(false); }}
            className="px-4 py-2 rounded-xl bg-green-700/60 hover:bg-green-600/80 border border-green-500/30 text-green-200 text-sm font-bold transition-all active:scale-95"
          >
            ✅ Выиграть вопрос
          </button>
          <button
            onClick={() => { cheatSkip(); setOpen(false); }}
            className="px-4 py-2 rounded-xl bg-blue-700/60 hover:bg-blue-600/80 border border-blue-500/30 text-blue-200 text-sm font-bold transition-all active:scale-95"
          >
            ⏭ Пропустить раунд
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="glass-panel rounded-full w-10 h-10 flex items-center justify-center text-sm border border-yellow-500/20 hover:border-yellow-500/40 transition-all opacity-40 hover:opacity-100"
        >
          🛠
        </button>
      )}
    </div>
  );
}
