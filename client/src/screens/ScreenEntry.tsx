import { useState } from 'react';
import QpHeader from '../components/QpHeader';

/** #/screen — enter a room code to open the TV view (#/screen/CODE). */
export default function ScreenEntry() {
  const [code, setCode] = useState('');
  const go = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return;
    window.location.hash = `#/screen/${clean}`;
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <QpHeader subtitle="Экран для ТВ" />
        <a href="#/" className="text-sm font-bold text-white/70 hover:text-white transition-colors">На главную</a>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-3">
          Экран для ТВ
        </h1>
        <p className="text-lg text-[var(--color-dungeon-muted)] font-medium mb-8 max-w-xl">
          Открой эту страницу на телевизоре или проекторе: здесь будет QR для входа, вопросы и табло.
          Игроки отвечают со своих телефонов.
        </p>
        <div className="glass-panel p-6 flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)]">Код пати</div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="ABCD"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
              maxLength={4}
              className="qp-input flex-1 min-w-0 py-4 px-5 text-center text-4xl font-extrabold tracking-[0.4em] uppercase"
            />
            <button onClick={go} disabled={code.trim().length < 4} className="btn-primary py-4 px-8 text-lg whitespace-nowrap">
              Открыть экран
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
