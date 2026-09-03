import { create } from 'zustand';
import { socket } from './socket';
import type { GameState, PlayerClass, Question, GameMode } from './types';

interface ChainTurnData {
  playerId: string;
  question: Omit<Question, 'correctIndex'>;
  timeLimit: number;
}

interface ChainResultData {
  playerId: string;
  correct: boolean;
}

interface StoreState {
  connected: boolean;
  playerId: string | null;
  playerName: string;
  roomCode: string | null;
  gameState: GameState | null;
  error: string | null;
  captainId: string | null;
  sacrificePlayerId: string | null;
  betPhase: boolean;
  personalQuestion: Omit<Question, 'correctIndex'> | null;
  personalResult: { correct: boolean; hpLost: number } | null;
  chainTurn: ChainTurnData | null;
  chainResult: ChainResultData | null;

  setPlayerName: (name: string) => void;
  createRoom: (mode?: GameMode) => void;
  joinRoom: (code: string) => void;
  selectClass: (playerClass: PlayerClass) => void;
  setReady: () => void;
  submitAnswer: (index: number) => void;
  submitBet: (amount: number) => void;
  useAbility: () => void;
  startGame: (dungeonId?: string) => void;
  addBot: () => void;
  clearError: () => void;
  cheatWin: () => void;
  cheatSkip: () => void;
  setGameMode: (mode: GameMode) => void;
  leaveRoom: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  connected: false,
  playerId: null,
  playerName: '',
  roomCode: null,
  gameState: null,
  error: null,
  captainId: null,
  sacrificePlayerId: null,
  betPhase: false,
  personalQuestion: null,
  personalResult: null,
  chainTurn: null,
  chainResult: null,

  setPlayerName: (name: string) => set({ playerName: name }),

  createRoom: (mode?: GameMode) => {
    const { playerName } = get();
    if (!playerName.trim()) {
      set({ error: 'Введите имя!' });
      return;
    }
    socket.emit('create-room', playerName.trim(), mode ?? 'classic');
  },

  joinRoom: (code: string) => {
    const { playerName } = get();
    if (!playerName.trim()) {
      set({ error: 'Введите имя!' });
      return;
    }
    if (!code.trim()) {
      set({ error: 'Введите код комнаты!' });
      return;
    }
    socket.emit('join-room', code.trim().toUpperCase(), playerName.trim());
  },

  selectClass: (playerClass: PlayerClass) => {
    socket.emit('select-class', playerClass);
  },

  setReady: () => {
    socket.emit('player-ready');
  },

  submitAnswer: (index: number) => {
    socket.emit('submit-answer', index);
  },

  submitBet: (amount: number) => {
    socket.emit('submit-bet', amount);
  },

  useAbility: () => {
    socket.emit('use-ability');
  },

  startGame: (dungeonId?: string) => {
    socket.emit('start-game', dungeonId);
  },

  addBot: () => {
    socket.emit('add-bot');
  },

  clearError: () => set({ error: null }),

  cheatWin: () => { socket.emit('cheat-win'); },
  cheatSkip: () => { socket.emit('cheat-skip'); },
  setGameMode: (mode: GameMode) => { socket.emit('set-game-mode', mode); },

  leaveRoom: () => {
    socket.emit('leave-room');
    clearSession();
    set({
      gameState: null,
      roomCode: null,
      error: null,
      captainId: null,
      sacrificePlayerId: null,
      betPhase: false,
      personalQuestion: null,
      personalResult: null,
      chainTurn: null,
      chainResult: null,
    });
  },
}));

// Session persistence
function saveSession(roomCode: string, playerName: string) {
  localStorage.setItem('qd_room', roomCode);
  localStorage.setItem('qd_name', playerName);
}

function clearSession() {
  localStorage.removeItem('qd_room');
  localStorage.removeItem('qd_name');
}

function getSavedSession(): { roomCode: string; playerName: string } | null {
  const roomCode = localStorage.getItem('qd_room');
  const playerName = localStorage.getItem('qd_name');
  if (roomCode && playerName) return { roomCode, playerName };
  return null;
}

// Socket listeners
socket.on('connect', () => {
  useStore.setState({
    connected: true,
    playerId: socket.id ?? null,
  });

  // Attempt rejoin on reconnect
  const saved = getSavedSession();
  if (saved && !useStore.getState().gameState) {
    socket.emit('rejoin-room', saved.roomCode, saved.playerName);
  }
});

socket.on('disconnect', () => {
  useStore.setState({ connected: false });
});

socket.on('room-created', (roomCode: string) => {
  useStore.setState({ roomCode });
  const name = useStore.getState().playerName;
  if (name) saveSession(roomCode, name);
});

socket.on('room-joined', (state: GameState) => {
  useStore.setState({ gameState: state, roomCode: state.roomCode, error: null });
  const me = socket.id ? state.players[socket.id] : null;
  if (me) saveSession(state.roomCode, me.name);
});

socket.on('game-state', (state: GameState) => {
  const prev = useStore.getState();
  const updates: Partial<StoreState> = {
    gameState: state,
    betPhase: state.betPhase ?? false,
    captainId: state.captainId ?? prev.captainId,
    sacrificePlayerId: state.sacrificePlayerId ?? prev.sacrificePlayerId,
  };
  if (prev.gameState?.phase === 'results' && state.phase === 'answering') {
    updates.personalResult = null;
    updates.personalQuestion = null;
  }
  useStore.setState(updates);
});

socket.on('error', (message: string) => {
  useStore.setState({ error: message });
  // If rejoin failed, clear saved session
  if (message.includes('expired') || message.includes('not found')) {
    clearSession();
  }
});

socket.on('timer-tick', (seconds: number) => {
  const state = useStore.getState().gameState;
  if (state) {
    useStore.setState({ gameState: { ...state, timer: seconds } });
  }
});

socket.on('game-over', () => {
  clearSession();
});

socket.on('left-room', () => {
  // Acknowledge: state already cleared client-side.
});

socket.on('room-closed', () => {
  // Host left mid-game — kick everyone back to the home screen.
  clearSession();
  useStore.setState({
    gameState: null,
    roomCode: null,
    error: 'Хост закрыл комнату',
    captainId: null,
    sacrificePlayerId: null,
    betPhase: false,
    personalQuestion: null,
    personalResult: null,
    chainTurn: null,
    chainResult: null,
  });
});

socket.on('floor-start', () => {
  useStore.setState({
    captainId: null,
    sacrificePlayerId: null,
    betPhase: false,
    personalQuestion: null,
    personalResult: null,
    chainTurn: null,
    chainResult: null,
  });
});

socket.on('captain-assigned', (captainId: string) => {
  useStore.setState({ captainId });
});

socket.on('sacrifice-chosen', (playerId: string) => {
  useStore.setState({ sacrificePlayerId: playerId });
});

socket.on('bet-phase', () => {
  useStore.setState({ betPhase: true });
});

socket.on('personal-question', (question: Omit<import('./types').Question, 'correctIndex'>, _timeLimit: number) => {
  useStore.setState({ personalQuestion: question, personalResult: null, chainTurn: null, chainResult: null });
});

socket.on('personal-result', (correct: boolean, hpLost: number) => {
  useStore.setState({ personalResult: { correct, hpLost } });
});

socket.on('chain-turn', (playerId: string, question: Omit<import('./types').Question, 'correctIndex'>, timeLimit: number) => {
  useStore.setState({ chainTurn: { playerId, question, timeLimit }, chainResult: null });
});

socket.on('chain-result', (playerId: string, correct: boolean) => {
  useStore.setState({ chainResult: { playerId, correct } });
});

// Connect on load
socket.connect();
