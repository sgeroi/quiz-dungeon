import { useState, useEffect } from 'react';
import { useStore } from './store';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import ResultScreen from './screens/ResultScreen';
import AdminScreen from './screens/AdminScreen';
import VideoChat from './components/VideoChat';
import { MODE_SCREENS } from './modes';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return hash;
}

function App() {
  const hash = useHash();
  const gameState = useStore((s) => s.gameState);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const phase = gameState?.phase ?? null;
  const [showVideo, setShowVideo] = useState(true);

  if (hash === '#/admin') return <AdminScreen />;

  const handleLeave = () => {
    const inLobby = phase === 'lobby' || phase === 'class-select';
    const msg = inLobby
      ? 'Выйти из комнаты?'
      : 'Выйти в меню? Игра будет прервана.';
    if (confirm(msg)) leaveRoom();
  };

  const inGame = !!phase;
  const isAnswering = phase === 'answering';
  const floor = gameState?.floors?.[gameState.currentFloor - 1];
  const isolationMode = floor?.params?.commsBlocked && isAnswering;

  const gameMode = gameState?.gameMode ?? 'classic';
  const ModeScreen = MODE_SCREENS[gameMode];

  let screen: React.ReactNode;
  if (!phase) screen = <HomeScreen />;
  else if (phase === 'lobby' || phase === 'class-select') screen = <LobbyScreen />;
  else if (phase === 'victory' || phase === 'defeat') screen = <ResultScreen />;
  else if (ModeScreen) screen = <ModeScreen />;
  else screen = <GameScreen />;

  if (!inGame) return <>{screen}</>;

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Global leave button — visible in lobby and during all gameplay */}
      <button
        onClick={handleLeave}
        title="Выйти в меню"
        className="fixed top-3 left-3 z-50 glass-panel rounded-full h-10 px-3 flex items-center gap-1.5 text-sm border border-gray-600/50 hover:border-red-400/60 hover:text-red-300 transition-all shadow-lg"
      >
        <span className="text-base leading-none">↩</span>
        <span className="hidden sm:inline font-medium">В меню</span>
      </button>
      {/* Left: game content */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {screen}
      </div>
      {/* Right: video panel — hidden on mobile, toggle button */}
      {showVideo ? (
        <VideoChat
          players={gameState!.players}
          myId={useStore.getState().playerId ?? ''}
          isolationMode={!!isolationMode}
          onCollapse={() => setShowVideo(false)}
        />
      ) : (
        <button
          onClick={() => setShowVideo(true)}
          className="fixed top-3 right-3 z-50 glass-panel rounded-full w-12 h-12 flex items-center justify-center text-lg border border-gray-600/50 hover:border-gray-400/50 transition-all shadow-lg"
        >
          📹
        </button>
      )}
    </div>
  );
}

export default App;
