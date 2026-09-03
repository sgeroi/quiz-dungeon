import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import { socket } from '../socket';
import { GAME_MODES } from '../types';
import QpHeader from '../components/QpHeader';
import { PRESENTER_SCREENS } from '../presenter';
import DefaultPresenter, { PresenterPlayerBoard, pickScores } from '../presenter/DefaultPresenter';

/**
 * TV / projector view (#/screen/CODE). Joins the room as a "screen" — not a player —
 * and renders a presenter for the current phase. Never shows action buttons.
 */
export default function ScreenView({ code }: { code: string }) {
  const roomCode = code.toUpperCase();
  const gameState = useStore((s) => s.gameState);
  const error = useStore((s) => s.error);
  const joinScreen = useStore((s) => s.joinScreen);

  useEffect(() => {
    // Initial connect is handled by the store's `connect` listener (it reads the
    // hash); this covers navigation to a code while already connected.
    if (socket.connected) joinScreen(roomCode);
    return () => {
      if (socket.connected) socket.emit('leave-room');
      useStore.setState({ gameState: null, roomCode: null, isScreen: false, error: null });
    };
  }, [roomCode, joinScreen]);

  const joinUrl = `${window.location.origin}/#/join/${roomCode}`;

  if (!gameState) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          {error ? (
            <>
              <div className="text-[64px] font-black text-[#FF9A9A]">Пати не найдена</div>
              <div className="text-[28px] font-semibold text-[var(--color-dungeon-muted)]">
                Код <span className="font-mono font-black text-white">{roomCode}</span> не подходит или комната закрыта.
              </div>
              <a href="#/screen" className="btn-secondary px-10 py-4 text-[24px] mt-4">Ввести другой код</a>
            </>
          ) : (
            <>
              <div className="text-[48px] font-black text-[var(--color-dungeon-gold)] animate-pulse">Подключаемся к пати…</div>
              <div className="font-mono text-[96px] font-black tracking-[0.3em]">{roomCode}</div>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const phase = gameState.phase;
  const players = Object.values(gameState.players);
  const modeInfo = GAME_MODES.find((m) => m.id === (gameState.gameMode ?? 'classic')) ?? GAME_MODES[0];

  if (phase === 'lobby' || phase === 'class-select') {
    const readyCount = players.filter((p) => p.isReady).length;
    return (
      <Shell code={gameState.roomCode}>
        <div className="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 items-center px-16 pb-12">
          {/* QR + code */}
          <div className="flex flex-col items-center gap-8">
            <div className="rounded-[40px] bg-white p-8 shadow-[0_0_80px_rgba(255,219,16,0.25)]">
              <QRCodeSVG value={joinUrl} size={480} level="M" bgColor="#ffffff" fgColor="#1C0925" />
            </div>
            <div className="text-center">
              <div className="text-[26px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Код пати</div>
              <div className="font-mono text-[128px] leading-none font-black tracking-[0.25em] text-[var(--color-dungeon-gold)] pl-[0.25em]">
                {gameState.roomCode}
              </div>
            </div>
            <div className="text-[32px] font-extrabold text-center max-w-[720px]">
              Наведи камеру телефона на QR — и ты в пати
            </div>
            <div className="text-[22px] font-semibold text-[var(--color-dungeon-muted)] text-center">
              или открой <span className="text-white">{window.location.host}</span> и введи код
            </div>
          </div>

          {/* Players + game */}
          <div className="flex flex-col gap-8 self-stretch justify-center">
            <div className="glass-panel p-8">
              <div className="flex items-baseline justify-between mb-5">
                <h2 className="text-[40px] font-black">Пати</h2>
                <span className="text-[24px] font-bold text-[var(--color-dungeon-muted)]">
                  {players.length}/8 · готовы {readyCount}
                </span>
              </div>
              {players.length === 0 ? (
                <div className="text-[26px] text-[var(--color-dungeon-muted)] font-semibold">Пока никого — ждём игроков…</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 rounded-2xl bg-white/5 px-5 py-3">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-[28px]">
                        {p.isBot ? '🤖' : '🧑'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[28px] font-extrabold truncate leading-tight">{p.name}</div>
                        {p.id === gameState.hostId && (
                          <div className="text-[16px] uppercase font-extrabold text-[var(--color-dungeon-gold)]">хост</div>
                        )}
                      </div>
                      {p.isReady ? (
                        <span className="rounded-full bg-[var(--color-dungeon-heal)]/20 text-[var(--color-dungeon-heal)] text-[20px] font-extrabold px-4 py-1.5">готов</span>
                      ) : (
                        <span className="rounded-full bg-white/5 text-white/40 text-[20px] font-bold px-4 py-1.5">ждём</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl neon-pink bg-[var(--color-dungeon-surface)]/60 p-8">
              <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mb-2">Игра</div>
              <div className="text-[44px] font-black leading-tight">{modeInfo.emoji} {modeInfo.name}</div>
              <div className="text-[24px] font-semibold text-[var(--color-dungeon-muted)] mt-2 leading-snug">{modeInfo.description}</div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'victory' || phase === 'defeat') {
    const isVictory = phase === 'victory';
    const scores = pickScores(gameState);
    return (
      <Shell code={gameState.roomCode}>
        <div className="flex-1 flex flex-col gap-10 px-16 pb-12">
          <div className="flex items-end justify-between gap-10">
            <div>
              <div className="text-[28px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">
                {modeInfo.emoji} {modeInfo.name}
              </div>
              <div className={`text-[120px] leading-none font-black ${isVictory ? 'text-[var(--color-dungeon-gold)]' : 'text-[#FF4848]'}`}>
                {isVictory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
              </div>
              <div className="text-[30px] font-semibold text-[var(--color-dungeon-muted)] mt-2">
                {isVictory ? 'Отлично сыграли!' : 'В следующий раз повезёт больше.'} Пройдено {gameState.currentFloor}/{gameState.totalFloors}.
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="rounded-3xl bg-white p-4">
                <QRCodeSVG value={joinUrl} size={200} level="M" bgColor="#ffffff" fgColor="#1C0925" />
              </div>
              <div className="text-[28px] font-extrabold max-w-[260px] leading-tight">
                Сыграть ещё —<br />наведи камеру
                <div className="font-mono text-[40px] font-black tracking-[0.25em] text-[var(--color-dungeon-gold)] mt-2">{gameState.roomCode}</div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-[40px] font-black mb-5">Итоговое табло</h2>
            <PresenterPlayerBoard players={players} scores={scores} showAnswered={false} />
          </div>
        </div>
      </Shell>
    );
  }

  const Presenter = PRESENTER_SCREENS[gameState.gameMode ?? 'classic'] ?? DefaultPresenter;
  return (
    <Shell code={gameState.roomCode} compact>
      <div className="flex-1 min-h-0">
        <Presenter />
      </div>
    </Shell>
  );
}

function Shell({ children, code, compact }: { children: React.ReactNode; code?: string; compact?: boolean }) {
  return (
    <div className="screen-view h-screen w-screen overflow-hidden flex flex-col bg-[var(--color-dungeon-bg)] text-white">
      <div className={`flex items-center justify-between ${compact ? 'px-10 pt-6' : 'px-16 pt-10 pb-6'}`}>
        <div className="scale-[1.6] origin-left">
          <QpHeader subtitle="Башня Знаний" />
        </div>
        {code && (
          <div className="flex items-center gap-4 rounded-full bg-black/40 border border-white/15 pl-7 pr-2 py-2">
            <span className="text-[20px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Код пати</span>
            <span className="rounded-full bg-[var(--color-dungeon-gold)] px-6 py-2 font-mono text-[32px] font-black tracking-[0.3em] text-[var(--color-dungeon-gold-fg)]">
              {code}
            </span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
