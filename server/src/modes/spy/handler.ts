import type { Server } from 'socket.io';
import type { GameState } from '../../../../shared/types.ts';
import type { ModeHandler } from '../types.ts';
import { startTimer, clearTimer } from '../../utils/TimerManager.ts';
import { pickSpyQuestions, toSpyQuestions, type SpyQuestion } from './questions.ts';
import { getSimpleData } from '../../data/contentStore.ts';

const TOTAL_ROUNDS = 8;
const QUESTION_TIME = 20;
const RESULT_TIME = 5;
// Per-round voting window (issue 3.1). Final decision vote also reuses this.
const VOTE_TIME = 15;

interface SpyState {
  spyId: string | undefined;
  teamScore: number;
  spyScore: number;
  round: number;
  totalRounds: number;
  phase: 'role-reveal' | 'question' | 'results' | 'voting' | 'finished';
  questions: SpyQuestion[];
  currentQuestion: SpyQuestion | null;
  answers: Record<string, number | null>;
  votes: Record<string, string | null>;
  // Track per-round outcome for stats: 'team' | 'spy' | 'tie'
  history: Array<{ qid: string; correctIndex: number; answers: Record<string, number | null>; winner: 'team' | 'spy' | 'tie' }>;
  // issue 3.1: players eliminated by post-round voting are skipped on subsequent
  // rounds and cannot vote.
  eliminated: Record<string, boolean>;
}

// Map roomCode -> SpyState
const SPY_STATES = new Map<string, SpyState>();

function getSpyState(state: GameState): SpyState | undefined {
  return SPY_STATES.get(state.roomCode);
}

function publicQuestion(q: SpyQuestion) {
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    category: 'spy',
    difficulty: 'medium' as const,
  };
}

function publicSpyState(s: SpyState) {
  return {
    teamScore: s.teamScore,
    spyScore: s.spyScore,
    round: s.round,
    totalRounds: s.totalRounds,
    phase: s.phase,
    answers: s.answers,
    votes: Object.fromEntries(Object.entries(s.votes).map(([k, v]) => [k, v ? true : false])),
    eliminated: { ...s.eliminated },
  };
}

function broadcastState(io: Server, state: GameState) {
  const s = getSpyState(state);
  if (!s) return;
  io.to(state.roomCode).emit('game-state', state);
  io.to(state.roomCode).emit('mode-spy-state' as any, publicSpyState(s));
}

function startQuestion(io: Server, state: GameState) {
  const s = getSpyState(state);
  if (!s) return;

  // issue 3.1: end conditions
  // - rounds exhausted -> spy wins (if still in)
  // - everyone except spy eliminated -> spy wins
  // - spy already eliminated (defensive) -> team wins
  if (s.round >= s.totalRounds) {
    finishGame(io, state, /* teamWon */ false, 'rounds-exhausted');
    return;
  }
  if (s.spyId && s.eliminated[s.spyId]) {
    finishGame(io, state, true, 'spy-eliminated');
    return;
  }
  const aliveNonSpy = Object.values(state.players).filter(
    p => p.id !== s.spyId && !s.eliminated[p.id],
  );
  if (aliveNonSpy.length === 0) {
    finishGame(io, state, false, 'team-eliminated');
    return;
  }

  const q = s.questions[s.round];
  s.currentQuestion = q;
  s.phase = 'question';
  s.answers = {};
  for (const p of Object.values(state.players)) {
    // Eliminated players don't answer.
    s.answers[p.id] = s.eliminated[p.id] ? -1 : null;
  }

  state.phase = 'answering';
  state.timer = QUESTION_TIME;
  state.maxTimer = QUESTION_TIME;
  state.currentQuestion = publicQuestion(q);

  // Send the question to everyone (no correctIndex).
  io.to(state.roomCode).emit('mode-spy-question' as any, {
    round: s.round + 1,
    totalRounds: s.totalRounds,
    question: publicQuestion(q),
    timeLimit: QUESTION_TIME,
  });

  // Leak the answer to the spy only.
  if (s.spyId) {
    io.to(s.spyId).emit('mode-spy-answer-leak' as any, {
      qid: q.id,
      correctIndex: q.correctIndex,
    });
  }

  broadcastState(io, state);

  // Schedule bot answers
  for (const p of Object.values(state.players)) {
    if (p.isBot && !s.eliminated[p.id]) {
      const isSpy = p.id === s.spyId;
      const delay = 1500 + Math.random() * (QUESTION_TIME * 1000 - 3000);
      setTimeout(() => {
        const cur = getSpyState(state);
        if (!cur || cur.phase !== 'question' || cur.currentQuestion?.id !== q.id) return;
        if (cur.eliminated[p.id]) return;
        if (cur.answers[p.id] != null) return;
        let answer: number;
        if (isSpy) {
          // Spy bot tries to pick a wrong answer
          const wrongOptions = [0, 1, 2, 3].filter(i => i !== q.correctIndex);
          answer = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
        } else {
          // Normal bots: 60% correct
          answer = Math.random() < 0.6
            ? q.correctIndex
            : ((q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4);
        }
        submitSpyAnswer(io, state, p.id, answer);
      }, delay);
    }
  }

  // Question timer
  startTimer(
    state.roomCode,
    QUESTION_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      finishQuestion(io, state);
    },
  );
}

export function submitSpyAnswer(io: Server, state: GameState, playerId: string, answer: number) {
  const s = getSpyState(state);
  if (!s || s.phase !== 'question') return;
  if (!(playerId in state.players)) return;
  if (s.eliminated[playerId]) return;
  if (s.answers[playerId] != null) return;
  if (answer < 0 || answer > 3) return;
  s.answers[playerId] = answer;
  broadcastState(io, state);

  // If everyone (still in the game) answered, end early.
  const allAnswered = Object.entries(s.answers)
    .filter(([id]) => !s.eliminated[id])
    .every(([, a]) => a != null);
  if (allAnswered) {
    clearTimer(state.roomCode);
    finishQuestion(io, state);
  }
}

function finishQuestion(io: Server, state: GameState) {
  const s = getSpyState(state);
  if (!s || !s.currentQuestion) return;
  const q = s.currentQuestion;

  // Tally: count team players (non-spy, not eliminated) who answered correctly.
  const playerIds = Object.keys(state.players);
  const teamIds = playerIds.filter(id => id !== s.spyId && !s.eliminated[id]);
  let correctTeam = 0;
  let totalTeam = teamIds.length;
  for (const id of teamIds) {
    if (s.answers[id] === q.correctIndex) correctTeam++;
  }

  let winner: 'team' | 'spy' | 'tie';
  if (correctTeam * 2 > totalTeam) {
    s.teamScore++;
    winner = 'team';
  } else if (correctTeam * 2 < totalTeam) {
    s.spyScore++;
    winner = 'spy';
  } else {
    winner = 'tie';
  }

  s.history.push({
    qid: q.id,
    correctIndex: q.correctIndex,
    answers: { ...s.answers },
    winner,
  });

  s.phase = 'results';
  state.phase = 'results';
  state.timer = RESULT_TIME;
  state.maxTimer = RESULT_TIME;

  io.to(state.roomCode).emit('mode-spy-results' as any, {
    round: s.round + 1,
    correctIndex: q.correctIndex,
    answers: s.answers,
    teamScore: s.teamScore,
    spyScore: s.spyScore,
    winner,
  });
  broadcastState(io, state);

  startTimer(
    state.roomCode,
    RESULT_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      // issue 3.1: instead of jumping straight to the next question, run a
      // 15s elimination vote after every round.
      s.round++;
      startVoting(io, state);
    },
  );
}

function startVoting(io: Server, state: GameState) {
  const s = getSpyState(state);
  if (!s) return;

  // Defensive end-conditions before opening a vote.
  if (s.spyId && s.eliminated[s.spyId]) {
    finishGame(io, state, true, 'spy-eliminated');
    return;
  }
  const aliveNonSpy = Object.values(state.players).filter(
    p => p.id !== s.spyId && !s.eliminated[p.id],
  );
  if (aliveNonSpy.length === 0) {
    finishGame(io, state, false, 'team-eliminated');
    return;
  }

  s.phase = 'voting';
  s.votes = {};
  for (const p of Object.values(state.players)) {
    s.votes[p.id] = null;
  }
  state.phase = 'answering';
  state.timer = VOTE_TIME;
  state.maxTimer = VOTE_TIME;

  // Only non-eliminated players appear as voting targets (you can't vote out
  // someone who's already gone).
  const eligible = Object.values(state.players)
    .filter(p => !s.eliminated[p.id])
    .map(p => ({ id: p.id, name: p.name }));

  io.to(state.roomCode).emit('mode-spy-voting' as any, {
    timeLimit: VOTE_TIME,
    players: eligible,
    round: s.round,
    totalRounds: s.totalRounds,
    eliminated: { ...s.eliminated },
  });
  broadcastState(io, state);

  // Bots vote randomly (avoiding self & eliminated).
  for (const p of Object.values(state.players)) {
    if (p.isBot && !s.eliminated[p.id]) {
      const delay = 2000 + Math.random() * (VOTE_TIME * 1000 - 4000);
      setTimeout(() => {
        const cur = getSpyState(state);
        if (!cur || cur.phase !== 'voting') return;
        if (cur.eliminated[p.id]) return;
        if (cur.votes[p.id]) return;
        const others = Object.keys(state.players).filter(
          id => id !== p.id && !cur.eliminated[id],
        );
        if (others.length === 0) return;
        const target = others[Math.floor(Math.random() * others.length)];
        submitSpyVote(io, state, p.id, target);
      }, delay);
    }
  }

  startTimer(
    state.roomCode,
    VOTE_TIME,
    (sec) => {
      state.timer = sec;
      io.to(state.roomCode).emit('timer-tick', sec);
    },
    () => {
      finishVoting(io, state);
    },
  );
}

export function submitSpyVote(io: Server, state: GameState, playerId: string, targetId: string) {
  const s = getSpyState(state);
  if (!s || s.phase !== 'voting') return;
  if (!(playerId in state.players)) return;
  if (!(targetId in state.players)) return;
  if (s.eliminated[playerId]) return;
  if (s.eliminated[targetId]) return;
  if (s.votes[playerId]) return;
  s.votes[playerId] = targetId;
  broadcastState(io, state);

  // Only non-eliminated players are expected to vote.
  const allVoted = Object.entries(s.votes)
    .filter(([id]) => !s.eliminated[id])
    .every(([, v]) => v != null);
  if (allVoted) {
    clearTimer(state.roomCode);
    finishVoting(io, state);
  }
}

function finishVoting(io: Server, state: GameState) {
  const s = getSpyState(state);
  if (!s) return;

  // Tally votes (eliminated players' votes were never recorded, but be safe).
  const tally: Record<string, number> = {};
  for (const [voter, target] of Object.entries(s.votes)) {
    if (s.eliminated[voter]) continue;
    if (!target) continue;
    tally[target] = (tally[target] || 0) + 1;
  }
  let topId: string | null = null;
  let topVotes = 0;
  for (const [id, count] of Object.entries(tally)) {
    if (count > topVotes) {
      topVotes = count;
      topId = id;
    }
  }

  // issue 3.1: per-round elimination flow.
  // - If at least one vote was cast and there's a clear top -> eliminate them.
  //   * If top == spy -> team wins immediately.
  // - If no votes cast / no top, no one is eliminated this round.
  // - After eliminating, if the spy is the only one left -> spy wins.
  if (topId && topVotes > 0) {
    if (topId === s.spyId) {
      finishGame(io, state, true, 'spy-voted-out', { tally, lastEliminated: topId });
      return;
    }
    // Wrong guess -> eliminate them and continue.
    s.eliminated[topId] = true;
    io.to(state.roomCode).emit('mode-spy-elimination' as any, {
      eliminatedId: topId,
      eliminatedName: state.players[topId]?.name ?? topId,
      wasSpy: false,
      tally,
      round: s.round,
    });
  } else {
    io.to(state.roomCode).emit('mode-spy-elimination' as any, {
      eliminatedId: null,
      eliminatedName: null,
      wasSpy: false,
      tally,
      round: s.round,
    });
  }

  // After elimination: if only spy remains (or spy alone) -> spy wins.
  const aliveNonSpy = Object.values(state.players).filter(
    p => p.id !== s.spyId && !s.eliminated[p.id],
  );
  if (aliveNonSpy.length === 0) {
    finishGame(io, state, false, 'team-eliminated', { tally });
    return;
  }

  // If we've used all rounds, spy survives and wins.
  if (s.round >= s.totalRounds) {
    finishGame(io, state, false, 'rounds-exhausted', { tally });
    return;
  }

  // Otherwise — continue to the next round.
  broadcastState(io, state);
  setTimeout(() => {
    const cur = getSpyState(state);
    if (!cur || cur.phase === 'finished') return;
    startQuestion(io, state);
  }, 2500);
}

function finishGame(
  io: Server,
  state: GameState,
  teamWon: boolean,
  reason: 'spy-voted-out' | 'spy-eliminated' | 'team-eliminated' | 'rounds-exhausted',
  extra?: { tally?: Record<string, number>; lastEliminated?: string },
) {
  const s = getSpyState(state);
  if (!s) return;
  clearTimer(state.roomCode);
  s.phase = 'finished';

  const spyName = s.spyId ? state.players[s.spyId]?.name : 'неизвестно';

  state.phase = teamWon ? 'victory' : 'defeat';
  io.to(state.roomCode).emit('mode-spy-game-over' as any, {
    teamWon,
    reason,
    spyId: s.spyId,
    spyName,
    teamScore: s.teamScore,
    spyScore: s.spyScore,
    votes: s.votes,
    tally: extra?.tally ?? {},
    history: s.history,
    eliminated: { ...s.eliminated },
  });
  io.to(state.roomCode).emit('game-over', teamWon, {
    mode: 'spy',
    teamWon,
    reason,
    spyId: s.spyId,
    spyName,
    teamScore: s.teamScore,
    spyScore: s.spyScore,
    votes: s.votes,
    tally: extra?.tally ?? {},
  });
  broadcastState(io, state);
}

const handler: ModeHandler = {
  start(io, state) {
    clearTimer(state.roomCode);

    // Pick spy from human players (fall back to all if no humans).
    const humans = Object.values(state.players).filter(p => !p.isBot);
    const candidates = humans.length > 0 ? humans : Object.values(state.players);
    const spy = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : undefined;
    const spyId = spy?.id;
    state.spyId = spyId;
    (state as any).spy = { teamScore: 0, spyScore: 0, spyId, votes: {} };

    const pool = toSpyQuestions(getSimpleData('spy', state.contentPacks?.spy).questions);
    const questions = pickSpyQuestions(pool, TOTAL_ROUNDS);
    const totalRounds = Math.max(1, Math.min(TOTAL_ROUNDS, questions.length));

    const spyState: SpyState = {
      spyId,
      teamScore: 0,
      spyScore: 0,
      round: 0,
      totalRounds,
      phase: 'role-reveal',
      questions,
      currentQuestion: null,
      answers: {},
      votes: {},
      history: [],
      eliminated: {},
    };
    SPY_STATES.set(state.roomCode, spyState);

    // Notify roles privately.
    for (const p of Object.values(state.players)) {
      if (p.isBot) continue;
      const role = p.id === spyId ? 'spy' : 'team';
      io.to(p.id).emit('mode-spy-role' as any, role);
    }

    state.phase = 'floor-intro';
    state.currentFloor = 0;
    state.totalFloors = totalRounds;
    state.lastResults = null;
    broadcastState(io, state);

    // Give the role-reveal popup ~3 seconds, then start round 1.
    setTimeout(() => {
      const cur = SPY_STATES.get(state.roomCode);
      if (!cur) return;
      startQuestion(io, state);
    }, 3000);
  },

  registerSocket(io, socket, getState) {
    socket.on('mode-spy-answer', (index: number) => {
      const state = getState();
      if (!state || state.gameMode !== 'spy') return;
      submitSpyAnswer(io, state, socket.id, Number(index));
    });

    socket.on('mode-spy-vote', (targetId: string) => {
      const state = getState();
      if (!state || state.gameMode !== 'spy') return;
      submitSpyVote(io, state, socket.id, String(targetId));
    });
  },

  // Screen (TV) joined mid-game: replay the room-broadcast snapshot events for
  // the current sub-phase. The spy's identity and the answer leak stay personal.
  onScreenJoin(_io, socket, state) {
    const s = getSpyState(state);
    socket.emit('game-state', state);
    if (!s) return;
    socket.emit('mode-spy-state' as any, publicSpyState(s));
    if (s.phase === 'question' && s.currentQuestion) {
      socket.emit('mode-spy-question' as any, {
        round: s.round + 1,
        totalRounds: s.totalRounds,
        question: publicQuestion(s.currentQuestion),
        timeLimit: QUESTION_TIME,
      });
    } else if (s.phase === 'voting') {
      const eligible = Object.values(state.players)
        .filter(p => !s.eliminated[p.id])
        .map(p => ({ id: p.id, name: p.name }));
      socket.emit('mode-spy-voting' as any, {
        timeLimit: VOTE_TIME,
        players: eligible,
        round: s.round,
        totalRounds: s.totalRounds,
        eliminated: { ...s.eliminated },
      });
    }
  },

  stop(_io, state) {
    clearTimer(state.roomCode);
    SPY_STATES.delete(state.roomCode);
  },
};

export default handler;
