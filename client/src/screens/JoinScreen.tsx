import { useEffect, useRef, useState } from 'react';
import { useStore, getSavedPlayerName } from '../store';
import QpHeader from '../components/QpHeader';

/**
 * #/join/CODE — landing page for the QR link. If we already know the player's
 * name, join immediately; otherwise ask for it first.
 */
export default function JoinScreen({ code }: { code: string }) {
  const roomCode = code.toUpperCase();
  const { playerName, setPlayerName, joinRoom, error, clearError, connected } = useStore();
  const [name, setName] = useState(() => playerName || getSavedPlayerName());
  const autoTried = useRef(false);

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    setPlayerName(clean);
    joinRoom(roomCode);
  };

  useEffect(() => {
    if (autoTried.current || !connected) return;
    // A saved session for this very room is restored by the store's rejoin logic.
    if (localStorage.getItem('qd_room')?.toUpperCase() === roomCode) return;
    if (name.trim()) {
      autoTried.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div className="min-h-screen flex flex-col p-5 sm:p-6 max-w-md mx-auto">
      <div className="mb-8">
        <QpHeader subtitle="Башня Знаний" />
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-1">Тебя зовут в пати</div>
        <div className="font-mono text-6xl font-black tracking-[0.3em] text-[var(--color-dungeon-gold)] mb-6 pl-[0.3em]">{roomCode}</div>

        <div className="glass-panel p-5 sm:p-6 animate-[fadeIn_0.4s_ease-out]">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Имя героя</div>
          <input
            type="text"
            placeholder="Как тебя звать?"
            autoFocus={!name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            maxLength={16}
            className="qp-input w-full py-3.5 px-5 text-lg font-semibold mb-4"
          />
          {error && (
            <div
              className="w-full py-2.5 px-4 rounded-2xl bg-[#FF4848]/15 border border-[#FF4848]/40 text-[#FF9A9A] text-sm font-semibold text-center mb-4 cursor-pointer"
              onClick={clearError}
            >
              {error}
            </div>
          )}
          <button onClick={submit} disabled={!name.trim() || !connected} className="btn-primary w-full py-4 px-5 text-lg">
            Войти в пати {roomCode}
          </button>
          <div className="text-center text-xs text-[var(--color-dungeon-muted)] mt-3 font-medium">
            Без камеры и микрофона — отвечаешь прямо с телефона.
          </div>
        </div>
        <a href="#/" className="mt-6 text-center text-sm font-bold text-white/60 hover:text-white transition-colors">На главную</a>
      </div>
    </div>
  );
}
