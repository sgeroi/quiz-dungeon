export type PlayerClass = 'warrior' | 'mage' | 'healer' | 'scout' | 'bard' | 'blacksmith';
export type GamePhase = 'lobby' | 'class-select' | 'floor-intro' | 'question' | 'answering' | 'results' | 'chain-turn' | 'reward' | 'victory' | 'defeat';

export type AnswerFormat = 'four' | 'two' | 'open';
export type QuestionScope = 'shared' | 'personal';
export type WhoAnswers = 'everyone' | 'captain' | 'sacrifice' | 'chain';

export type GameMode =
  | 'classic'
  | 'millionaire'
  | 'topic-split'
  | 'jeopardy-comp'
  | 'jeopardy-coop'
  | 'speed'
  | 'petersburg'
  | 'buckets'
  | 'rpg-rewards'
  | 'spy';

export interface GameModeInfo {
  id: GameMode;
  name: string;
  emoji: string;
  description: string;
}

export const GAME_MODES: GameModeInfo[] = [
  { id: 'classic',       name: 'RPG-подземелье',    emoji: '⚔️', description: 'Классика. 8 этажей, разные механики, способности классов.' },
  { id: 'millionaire',   name: 'Кто хочет стать миллионером', emoji: '💰', description: 'Команда идёт по уровням сложности. 30 сек на вопрос, 3 подсказки.' },
  { id: 'topic-split',   name: 'Темы по группам',   emoji: '📚', description: 'Игроки выбирают темы. Внутри группы — общение, между — изоляция.' },
  { id: 'jeopardy-comp', name: 'Своя игра (PvP)',   emoji: '🎲', description: 'Сетка тем и стоимостей. Кто первый — тот и забирает очки.' },
  { id: 'jeopardy-coop', name: 'Своя игра (Босс)',  emoji: '🐲', description: 'Кооп против босса. Чем дороже вопрос — тем жёстче ограничения.' },
  { id: 'speed',         name: 'На скорость',       emoji: '⚡', description: 'Кто быстрее ответил — тот сильнее ударил. Очки + урон за скорость.' },
  { id: 'petersburg',    name: 'Санкт-Петербург',   emoji: '🎬', description: 'Каждый видит свой фрагмент. Капитан собирает ответ.' },
  { id: 'buckets',       name: 'Сортировка',        emoji: '🪣', description: 'У каждого своя корзина. Раскидывай предметы по признакам.' },
  { id: 'rpg-rewards',   name: 'RPG: Награды',      emoji: '🎁', description: 'Без способностей. Между раундами выбираешь награды для команды.' },
  { id: 'spy',           name: 'Квиз-мафия',        emoji: '🕵️', description: 'Один из вас — шпион. Видит ответ и набирает очки за неправильный.' },
];

export interface RoundParams {
  name: string;
  emoji: string;
  description: string;
  answerFormat: AnswerFormat;
  questionScope: QuestionScope;
  whoAnswers: WhoAnswers;
  timed: boolean;
  timeLimit: number;
  speedScaling: boolean;
  bet: boolean;
  commsBlocked: boolean;
  damageMode: 'all' | 'wrong-only';
}

export type PerkId =
  | 'sharp-blade'
  | 'life-elixir'
  | 'shield'
  | 'speed'
  | 'luck'
  | 'fury'
  | 'revive'
  | 'wisdom';

export interface PerkInstance {
  id: PerkId;
  charges: number;
}

export interface Player {
  id: string;
  name: string;
  playerClass: PlayerClass | null;
  personalHp: number;
  maxPersonalHp: number;
  abilityCooldown: number;
  bonusDamage: number;
  isAlive: boolean;
  isReady: boolean;
  currentAnswer: number | null;
  answerTime: number | null;
  streak: number;
  isBot?: boolean;
  betAmount?: number;
  perks?: PerkInstance[];
}

export interface Monster {
  name: string;
  emoji: string;
  maxHp: number;
  currentHp: number;
  attack: number;
  isBoss: boolean;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Floor {
  number: number;
  params: RoundParams;
  monster: Monster | null;
  question: Question | null;
  isCompleted: boolean;
  isBoss?: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Record<string, Player>;
  hostId: string;
  currentFloor: number;
  totalFloors: number;
  floors: Floor[];
  timer: number;
  maxTimer: number;
  currentQuestion: Omit<Question, 'correctIndex'> | null;
  lastResults: RoundResult | null;
  chainCurrentPlayer?: string;
  chainQueue?: string[];
  sacrificePlayerId?: string;
  captainId?: string;
  betPhase?: boolean;
  gameMode?: GameMode;
  spyId?: string;
  /** Выбранные контент-паки комнаты (лобби). Нет ключа = builtin-пак режима. */
  contentPacks?: Partial<Record<GameMode, string>>;
  rewardPhase?: {
    rotation: string[];
    turnIndex: number;
    currentPickerId: string | null;
    options: PerkId[];
    picked: string[];
  };
}

export interface RoundResult {
  correctIndex: number;
  playerAnswers: Record<string, number | null>;
  playerDamage?: Record<string, number>;
  damageDealt: number;
  damageTaken: number;
  monsterDefeated: boolean;
  playersHit: string[];
}

export interface ClassDefinition {
  id: PlayerClass;
  name: string;
  nameRu: string;
  emoji: string;
  sprite?: string;
  description: string;
  abilityName: string;
  abilityCooldown: number;
}

export interface FloorConfig {
  number: number;
  params: RoundParams;
  difficulty: 'easy' | 'medium' | 'hard';
  monsterName?: string;
  monsterEmoji?: string;
  monsterHp?: number;
  monsterAttack?: number;
  isBoss?: boolean;
}

export interface DungeonConfig {
  id: string;
  name: string;
  description: string;
  floors: FloorConfig[];
  personalHp: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientEvents {
  'create-room': (playerName: string, mode?: GameMode) => void;
  'join-room': (roomCode: string, playerName: string) => void;
  'rejoin-room': (roomCode: string, playerName: string) => void;
  'select-class': (playerClass: PlayerClass) => void;
  'player-ready': () => void;
  'submit-answer': (answerIndex: number) => void;
  'submit-bet': (amount: number) => void;
  'use-ability': () => void;
  'start-game': (dungeonId?: string) => void;
  'add-bot': () => void;
  'select-reward': (rewardId: string) => void;
  'use-perk': (perkId: PerkId) => void;
  'set-game-mode': (mode: GameMode) => void;
  'set-content-pack': (mode: GameMode, packId: string | null) => void;
  'webrtc-offer': (targetId: string, offer: RTCSessionDescriptionInit) => void;
  'webrtc-answer': (targetId: string, answer: RTCSessionDescriptionInit) => void;
  'webrtc-ice-candidate': (targetId: string, candidate: RTCIceCandidateInit) => void;
  'chat-message': (text: string) => void;
  'cheat-win': () => void;
  'cheat-skip': () => void;
  'leave-room': () => void;
  'mode-jeopardy-pick': (payload: { topicIdx: number; valueIdx: number }) => void;
  'mode-jeopardy-buzz': () => void;
  'mode-jeopardy-answer': (answerIndex: number) => void;
}

export interface ServerEvents {
  'room-created': (roomCode: string) => void;
  'room-joined': (state: GameState) => void;
  'game-state': (state: GameState) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'floor-start': (floor: Floor) => void;
  'question': (question: Omit<Question, 'correctIndex'>, timeLimit: number) => void;
  'timer-tick': (seconds: number) => void;
  'round-results': (results: RoundResult) => void;
  'ability-used': (playerId: string, ability: string, effect: string) => void;
  'game-over': (victory: boolean, stats: Record<string, unknown>) => void;
  'error': (message: string) => void;
  'personal-question': (question: Omit<Question, 'correctIndex'>, timeLimit: number) => void;
  'personal-result': (correct: boolean, hpLost: number) => void;
  'chain-turn': (playerId: string, question: Omit<Question, 'correctIndex'>, timeLimit: number) => void;
  'chain-result': (playerId: string, correct: boolean) => void;
  'sacrifice-chosen': (playerId: string) => void;
  'captain-assigned': (captainId: string) => void;
  'bet-phase': () => void;
  'webrtc-offer': (fromId: string, offer: RTCSessionDescriptionInit) => void;
  'webrtc-answer': (fromId: string, answer: RTCSessionDescriptionInit) => void;
  'webrtc-ice-candidate': (fromId: string, candidate: RTCIceCandidateInit) => void;
  'chat-message': (msg: { from: string; name: string; text: string; ts: number }) => void;
  'left-room': () => void;
  'room-closed': () => void;
  'mode-jcoop-comm': (comm: {
    level: 100 | 200 | 300 | 400 | 500 | null;
    activeId: string | null;
    allowedSpeakers: string[] | null;
    distorted: boolean;
  }) => void;
  'mode-petersburg-actor': (payload: {
    imageUrl: string;
    round: number;
    total: number;
    isCaptain: boolean;
  }) => void;
}
