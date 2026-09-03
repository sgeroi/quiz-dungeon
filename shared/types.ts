export type PlayerClass = 'warrior' | 'mage' | 'healer' | 'scout' | 'bard' | 'blacksmith';
export type GamePhase = 'lobby' | 'class-select' | 'floor-intro' | 'question' | 'answering' | 'results' | 'chain-turn' | 'reward' | 'victory' | 'defeat';

export type AnswerFormat = 'four' | 'two' | 'open';
export type QuestionScope = 'shared' | 'personal';
export type WhoAnswers = 'everyone' | 'captain' | 'sacrifice' | 'chain';

export type GameMode =
  | 'classic'
  | 'millionaire'
  | 'jeopardy'
  | 'topic-split'
  | 'jeopardy-comp'
  | 'jeopardy-coop'
  | 'speed'
  | 'lastman'
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

/** Видимый список игр. Скрытые режимы (topic-split, speed, rpg-rewards, jeopardy-comp, jeopardy-coop) остаются в GameMode, но в UI не показываются. */
export const GAME_MODES: GameModeInfo[] = [
  { id: 'classic',     name: 'RPG Квиз-данжен',              emoji: '⚔️', description: 'Этажи, монстры и способности классов. Отвечай верно — бей сильнее.' },
  { id: 'millionaire', name: 'Кто хочет стать миллионером', emoji: '💰', description: '15 вопросов по нарастающей, 3 подсказки, 30 секунд на ответ.' },
  { id: 'jeopardy',    name: 'Своя игра',                    emoji: '🎲', description: 'Сетка тем и стоимостей. Выбирай ячейку, жми кнопку, забирай очки.' },
  { id: 'buckets',     name: 'Сортировка',                   emoji: '🪣', description: 'Раскидывай предметы по корзинам быстрее всех.' },
  { id: 'spy',         name: 'Квиз-мафия',                   emoji: '🕵️', description: 'Один из вас — шпион и играет против всех. Вычислите его.' },
  { id: 'petersburg',  name: 'Угадай фильм',                 emoji: '🎬', description: 'Каждый видит своего актёра. Соберите название фильма вместе.' },
  { id: 'lastman',     name: 'Последний герой',              emoji: '🏆', description: 'Ошибся — потерял сердце. Таймер всё короче. Кто останется последним?' },
];

// ==================== TEAM MODES ====================

export type TeamMode = 'ffa' | 'teams' | 'coop';

export interface Team {
  /** 'A' | 'B' | 'C' | 'D' */
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export const DEFAULT_TEAMS: Team[] = [
  { id: 'A', name: 'Красные', emoji: '🔴', color: '#FF4848' },
  { id: 'B', name: 'Синие',   emoji: '🔵', color: '#75BFFF' },
  { id: 'C', name: 'Зелёные', emoji: '🟢', color: '#8DFF85' },
  { id: 'D', name: 'Жёлтые',  emoji: '🟡', color: '#FFDB10' },
];

export const TEAM_MODE_INFO: Record<TeamMode, { name: string; emoji: string; description: string }> = {
  ffa:   { name: 'Каждый сам за себя', emoji: '🥇', description: 'Личный зачёт, побеждает лучший' },
  teams: { name: 'Команда на команду', emoji: '⚔️', description: '2–4 команды, игроки сами выбирают свою' },
  coop:  { name: 'Все в одной команде', emoji: '🤝', description: 'Вся пати против игры' },
};

/** Какие форматы доступны в каждой игре (порядок = порядок плиток в лобби). */
export const TEAM_MODES_BY_GAME: Record<GameMode, TeamMode[]> = {
  'classic':       ['ffa', 'teams', 'coop'],
  'millionaire':   ['ffa', 'teams', 'coop'],
  'jeopardy':      ['ffa', 'teams', 'coop'],
  'buckets':       ['ffa', 'teams', 'coop'],
  'spy':           ['ffa', 'coop'],
  'petersburg':    ['ffa', 'teams', 'coop'],
  // Скрытые режимы
  'topic-split':   ['coop'],
  'speed':         ['ffa', 'coop'],
  'lastman':       ['ffa', 'teams', 'coop'],
  'rpg-rewards':   ['coop'],
  'jeopardy-comp': ['ffa', 'teams'],
  'jeopardy-coop': ['coop'],
};

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;

/** Payload of `game-over(victory, stats)`. Handlers fill the fields relevant to state.teamMode. */
export interface GameOverStats {
  teamMode?: TeamMode;
  /** ffa (и coop, если есть личные очки): playerId -> очки */
  scores?: Record<string, number>;
  /** teams: teamId -> очки */
  teamScores?: Record<string, number>;
  /** ffa */
  winnerPlayerId?: string;
  /** teams */
  winnerTeamId?: string;
  [extra: string]: unknown;
}

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
  /** Remaining uses (for charge-based perks like wisdom, revive, life-elixir, fury). */
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
  /** Команда игрока — только в teamMode 'teams'. */
  teamId?: string;
  /** Perks acquired in rpg-rewards mode. Stays empty in classic mode. */
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
  /** Формат игры: личный зачёт / команды / все вместе. По умолчанию 'coop'. */
  teamMode: TeamMode;
  /** В teams-режиме 2..4 команды; иначе []. */
  teams: Team[];
  /** Classic, teams: бой каждой команды со своим монстром (teamId -> HP, счёт, роли, итог раунда). */
  teamBattle?: Record<string, { monsterHp: number; monsterMaxHp: number; floorCleared: boolean; score: number; captainId?: string; sacrificeId?: string; lastDamageDealt?: number; lastDamageTaken?: number; lastDefeated?: boolean }>;
  /** Classic, ffa: личные очки (playerId -> очки). */
  classicScores?: Record<string, number>;
  spyId?: string;
  /** Выбранные контент-паки комнаты (лобби). Нет ключа = builtin-пак режима. */
  contentPacks?: Partial<Record<GameMode, string>>;
  /** Интерактивная пати: без видео/микрофона, вход игроков по QR, есть роль «экран». */
  interactive?: boolean;
  /** socket.id подключённых экранов (ТВ). Экран — не игрок. */
  screenIds?: string[];
  /** Reward phase state (rpg-rewards mode only). */
  rewardPhase?: {
    rotation: string[];
    turnIndex: number;
    currentPickerId: string | null;
    options: PerkId[];
    /** Players who have already picked this round. */
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
  'create-room': (playerName: string, mode?: GameMode, opts?: { interactive?: boolean }) => void;
  'join-screen': (roomCode: string) => void;
  'set-interactive': (on: boolean) => void;
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
  'set-game-mode': (mode: GameMode) => void;
  'set-content-pack': (mode: GameMode, packId: string | null) => void;
  'set-team-mode': (mode: TeamMode) => void;
  'set-team-count': (n: 2 | 3 | 4) => void;
  'join-team': (teamId: string) => void;
}

export interface ServerEvents {
  'room-created': (roomCode: string) => void;
  'room-joined': (state: GameState) => void;
  'screen-joined': (state: GameState) => void;
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
}
