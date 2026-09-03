import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import type { PlayerClass, DungeonConfig, GameMode, PerkId, TeamMode } from '../../shared/types.ts';
import { getAllConfigs, getConfig, saveConfig, deleteConfig } from './data/dungeonConfigs.ts';
import { listPacks, getPack, savePack, duplicatePack, resetPack, deletePack, ContentValidationError } from './data/contentStore.ts';
import {
  createRoom,
  joinRoom,
  rejoinRoom,
  getRoomByPlayer,
  removePlayer,
  leaveRoom,
  selectClass,
  setPlayerReady,
  setGameMode,
  setContentPack,
  allPlayersReady,
  getTeamSetupError,
  setTeamMode,
  setTeamCount,
  joinTeam,
  addBot,
  setInteractive,
  addScreen,
  removeScreen,
  getRoomByScreen,
} from './utils/RoomManager.ts';
import { startGame, submitAnswer, submitBet, cheatWinQuestion, cheatSkipFloor, submitRewardPick } from './game/GameLoop.ts';
import { useAbility } from './game/Abilities.ts';
import { usePerk } from './game/Perks.ts';
import { MODE_HANDLERS } from './modes/index.ts';

const VALID_MODES: GameMode[] = [
  'classic', 'millionaire', 'jeopardy', 'topic-split', 'jeopardy-comp', 'jeopardy-coop',
  'speed', 'petersburg', 'buckets', 'rpg-rewards', 'spy',
];
const VALID_TEAM_MODES: TeamMode[] = ['ffa', 'teams', 'coop'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Serve static client files
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// --- Dungeon Config REST API ---

app.get('/api/room-types', (_req, res) => {
  res.json([
    { id: 'captain', name: 'Капитан', emoji: '👑', description: 'Отвечает только капитан. Остальные наблюдают.', hasMonster: true },
    { id: 'speed', name: 'Скорость', emoji: '⚡', description: 'Все отвечают. Скорость и точность решают.', hasMonster: true },
    { id: 'personal', name: 'Свой вопрос', emoji: '🎯', description: 'Каждый получает свой вопрос. Ошибка = -20 HP.', hasMonster: true },
    { id: 'isolation', name: 'Изоляция', emoji: '🔇', description: 'Все отвечают, но связь заблокирована.', hasMonster: true },
  ]);
});

app.get('/api/dungeons', (_req, res) => {
  res.json(getAllConfigs());
});

app.get('/api/dungeons/:id', (req, res) => {
  const config = getConfig(req.params.id);
  if (!config) {
    res.status(404).json({ error: 'Dungeon config not found' });
    return;
  }
  res.json(config);
});

app.post('/api/dungeons', (req, res) => {
  try {
    const config = saveConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: 'Invalid dungeon config' });
  }
});

app.delete('/api/dungeons/:id', (req, res) => {
  const deleted = deleteConfig(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Config not found or cannot be deleted' });
    return;
  }
  res.json({ success: true });
});

// --- End Dungeon Config REST API ---

// --- Content Packs REST API (see shared/content.ts) ---

app.get('/api/content', (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
  if (mode && !VALID_MODES.includes(mode as GameMode)) {
    res.status(400).json({ error: 'Unknown mode' });
    return;
  }
  res.json(listPacks(mode as GameMode | undefined));
});

app.get('/api/content/:id', (req, res) => {
  const pack = getPack(req.params.id);
  if (!pack) {
    res.status(404).json({ error: 'Content pack not found' });
    return;
  }
  res.json(pack);
});

app.post('/api/content', (req, res) => {
  try {
    const pack = savePack(req.body);
    res.json(pack);
  } catch (err) {
    const message = err instanceof ContentValidationError ? err.message : 'Invalid content pack';
    if (!(err instanceof ContentValidationError)) console.error('[content] save failed:', err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/content/:id/duplicate', (req, res) => {
  const pack = duplicatePack(req.params.id);
  if (!pack) {
    res.status(404).json({ error: 'Content pack not found' });
    return;
  }
  res.json(pack);
});

app.post('/api/content/:id/reset', (req, res) => {
  const existing = getPack(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Content pack not found' });
    return;
  }
  if (!existing.builtin) {
    res.status(400).json({ error: 'Only builtin packs can be reset' });
    return;
  }
  const pack = resetPack(req.params.id);
  res.json(pack);
});

app.delete('/api/content/:id', (req, res) => {
  const result = deletePack(req.params.id);
  if (result === 'not-found') {
    res.status(404).json({ error: 'Content pack not found' });
    return;
  }
  if (result === 'builtin') {
    res.status(400).json({ error: 'Builtin pack cannot be deleted' });
    return;
  }
  res.json({ success: true });
});

// --- End Content Packs REST API ---

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Register all mode-specific socket handlers; each handler can guard internally
  // by checking state.gameMode to ignore events when its mode isn't active.
  for (const handler of Object.values(MODE_HANDLERS)) {
    handler?.registerSocket?.(io, socket, () => getRoomByPlayer(socket.id));
  }

  socket.on('create-room', (playerName: string, mode?: GameMode, opts?: { interactive?: boolean }) => {
    const safeMode: GameMode = mode && VALID_MODES.includes(mode) ? mode : 'classic';
    const interactive = !!(opts && typeof opts === 'object' && opts.interactive);
    const state = createRoom(socket.id, playerName, safeMode, { interactive });
    socket.join(state.roomCode);
    socket.emit('room-created', state.roomCode);
    io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('join-room', (roomCode: string, playerName: string) => {
    const state = joinRoom(roomCode, socket.id, playerName);
    if (!state) {
      socket.emit('error', 'Cannot join room. It may not exist, be full, or already in game.');
      return;
    }
    socket.join(state.roomCode);
    socket.emit('room-joined', state);
    io.to(state.roomCode).emit('game-state', state);
    io.to(state.roomCode).emit('player-joined', state.players[socket.id]);
  });

  socket.on('rejoin-room', (roomCode: string, playerName: string) => {
    const state = rejoinRoom(roomCode, socket.id, playerName);
    if (!state) {
      socket.emit('error', 'Room not found or session expired.');
      return;
    }
    socket.join(state.roomCode);
    socket.emit('room-joined', state);
    io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('select-class', (playerClass: PlayerClass) => {
    const state = selectClass(socket.id, playerClass);
    if (state) {
      io.to(state.roomCode).emit('game-state', state);
    }
  });

  socket.on('player-ready', () => {
    const state = setPlayerReady(socket.id);
    if (state) {
      io.to(state.roomCode).emit('game-state', state);
    }
  });

  socket.on('set-game-mode', (mode: GameMode) => {
    const state = setGameMode(socket.id, mode);
    if (state) {
      io.to(state.roomCode).emit('game-state', state);
    }
  });

  socket.on('set-content-pack', (mode: GameMode, packId: string | null) => {
    if (!VALID_MODES.includes(mode)) return;
    const state = setContentPack(socket.id, mode, typeof packId === 'string' && packId ? packId : null);
    if (state) {
      io.to(state.roomCode).emit('game-state', state);
    }
  });

  // --- Team modes (docs/TEAMS.md) ---
  socket.on('set-team-mode', (mode: TeamMode) => {
    if (!VALID_TEAM_MODES.includes(mode)) return;
    const state = setTeamMode(socket.id, mode);
    if (state) io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('set-team-count', (n: number) => {
    const state = setTeamCount(socket.id, Number(n));
    if (state) io.to(state.roomCode).emit('game-state', state);
  });

  socket.on('join-team', (teamId: string) => {
    if (typeof teamId !== 'string') return;
    const state = joinTeam(socket.id, teamId);
    if (state) io.to(state.roomCode).emit('game-state', state);
  });

  // Host-only, lobby-only: toggle interactive mode (QR join, no video/mic).
  socket.on('set-interactive', (on: boolean) => {
    const state = setInteractive(socket.id, !!on);
    if (state) {
      io.to(state.roomCode).emit('game-state', state);
    }
  });

  // --- Screen (TV presenter) role: not a player, just listens to room broadcasts ---
  socket.on('join-screen', (roomCode: string) => {
    if (typeof roomCode !== 'string' || !roomCode.trim()) {
      socket.emit('error', 'Room not found.');
      return;
    }
    const state = addScreen(roomCode.trim(), socket.id);
    if (!state) {
      socket.emit('error', 'Room not found.');
      return;
    }
    socket.join(state.roomCode);
    socket.emit('screen-joined', state);
    io.to(state.roomCode).emit('game-state', state);
    // Mid-game: let the mode push its current snapshot to this screen only.
    if (state.phase !== 'lobby') {
      const handler = MODE_HANDLERS[state.gameMode ?? 'classic'];
      if (handler?.onScreenJoin) {
        try {
          handler.onScreenJoin(io, socket, state);
        } catch (err) {
          console.error('[screen] onScreenJoin failed:', err);
        }
      }
    }
  });

  socket.on('add-bot', () => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    const updated = addBot(state.roomCode);
    if (updated) {
      io.to(updated.roomCode).emit('game-state', updated);
    }
  });

  socket.on('start-game', (dungeonId?: string) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;

    const teamError = getTeamSetupError(state);
    if (teamError) {
      socket.emit('error', teamError);
      return;
    }
    if (!allPlayersReady(state)) {
      socket.emit('error', 'All players must select a class and be ready.');
      return;
    }

    let config: DungeonConfig | undefined;
    if (dungeonId) {
      config = getConfig(dungeonId);
    }

    startGame(io, state.roomCode, state, config);
  });

  socket.on('submit-answer', (answerIndex: number) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    submitAnswer(io, socket.id, state, answerIndex);
  });

  socket.on('submit-bet', (amount: number) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    submitBet(io, socket.id, state, amount);
  });

  socket.on('use-ability', () => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    useAbility(io, socket.id, state);
  });

  socket.on('select-reward', (perkId: string) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    submitRewardPick(io, state, socket.id, perkId as PerkId);
  });

  socket.on('use-perk', (perkId: string) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    usePerk(io, state, socket.id, perkId as PerkId);
  });

  // --- Cheat menu (host only) ---
  socket.on('cheat-win', () => {
    const state = getRoomByPlayer(socket.id);
    if (!state || state.hostId !== socket.id) return;
    cheatWinQuestion(io, state);
  });

  socket.on('cheat-skip', () => {
    const state = getRoomByPlayer(socket.id);
    if (!state || state.hostId !== socket.id) return;
    cheatSkipFloor(io, state);
  });

  // --- WebRTC signaling ---
  socket.on('webrtc-offer', (targetId: string, offer: unknown) => {
    io.to(targetId).emit('webrtc-offer', socket.id, offer);
  });

  socket.on('webrtc-answer', (targetId: string, answer: unknown) => {
    io.to(targetId).emit('webrtc-answer', socket.id, answer);
  });

  socket.on('webrtc-ice-candidate', (targetId: string, candidate: unknown) => {
    io.to(targetId).emit('webrtc-ice-candidate', socket.id, candidate);
  });

  // --- Chat ---
  socket.on('chat-message', (text: string) => {
    const state = getRoomByPlayer(socket.id);
    if (!state) return;
    const player = state.players[socket.id];
    if (!player) return;
    io.to(state.roomCode).emit('chat-message', {
      from: socket.id,
      name: player.name,
      text: text.slice(0, 500),
      ts: Date.now(),
    });
  });

  socket.on('leave-room', () => {
    // Screens are not players — just detach.
    if (getRoomByScreen(socket.id)) {
      const room = removeScreen(socket.id);
      socket.emit('left-room');
      if (room) {
        socket.leave(room.roomCode);
        io.to(room.roomCode).emit('game-state', room);
      }
      return;
    }
    const { room, deleted, wasHost } = leaveRoom(socket.id);
    socket.emit('left-room');
    if (room) {
      const code = room.roomCode;
      socket.leave(code);
      if (wasHost && deleted) {
        // Notify everyone else that the host closed the room.
        io.to(code).emit('room-closed');
      } else {
        io.to(code).emit('player-left', socket.id);
        io.to(code).emit('game-state', room);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const screenRoom = removeScreen(socket.id);
    if (screenRoom) {
      io.to(screenRoom.roomCode).emit('game-state', screenRoom);
      return;
    }
    const { room, deleted, roomCode } = removePlayer(socket.id);
    if (room) {
      io.to(room.roomCode).emit('player-left', socket.id);
      io.to(room.roomCode).emit('game-state', room);
    } else if (deleted && roomCode) {
      // Last player gone — tell any attached screens the room is closed.
      io.to(roomCode).emit('room-closed');
    }
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3340;
httpServer.listen(PORT, () => {
  console.log(`Quiz Dungeon server running on port ${PORT}`);
});
