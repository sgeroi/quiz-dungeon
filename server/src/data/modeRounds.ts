import type { RoundParams, GameMode } from '../../../shared/types.ts';
import { DEFAULT_ROUNDS } from './defaultRounds.ts';

// Helper: 8 копий одного и того же шаблона (с возможной модификацией по индексу)
function eight(make: (i: number) => RoundParams): RoundParams[] {
  return Array.from({ length: 8 }, (_, i) => make(i));
}

// «Кто хочет стать миллионером» — нарастающая сложность, 30с, общий вопрос, без способностей
const MILLIONAIRE: RoundParams[] = eight((i) => ({
  name: `Уровень ${i + 1} · ${[100, 500, 1000, 5000, 25000, 100000, 500000, 1000000][i]} ₽`,
  emoji: '💰',
  description: `Командой отвечаем на вопрос. ${i < 3 ? 'Лёгкий' : i < 6 ? 'Средний' : 'Сложный'}. Подсказки доступны.`,
  answerFormat: 'four',
  questionScope: 'shared',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 30,
  speedScaling: false,
  bet: false,
  commsBlocked: false,
  damageMode: 'all',
}));

// Темы по группам — все вопросы личные, изоляции нет (общение в группах вне игры)
const TOPIC_SPLIT: RoundParams[] = eight((i) => ({
  name: `Тур ${i + 1}`,
  emoji: '📚',
  description: 'Каждый получает вопрос из своей темы. Ответили все правильно — урон боссу.',
  answerFormat: 'four',
  questionScope: 'personal',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 25,
  speedScaling: false,
  bet: false,
  commsBlocked: false,
  damageMode: 'wrong-only',
}));

// Своя игра (PvP) — короткий таймер, скорость
const JEOPARDY_COMP: RoundParams[] = eight((i) => ({
  name: `Раунд ${i + 1} · ${(i + 1) * 100}`,
  emoji: '🎲',
  description: 'Кто первый ответит правильно — забирает очки. Ошибся — теряешь.',
  answerFormat: 'four',
  questionScope: 'shared',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 10,
  speedScaling: true,
  bet: false,
  commsBlocked: false,
  damageMode: 'wrong-only',
}));

// Своя игра (Кооп) — escalation: чем дальше, тем больше ограничений
const JEOPARDY_COOP: RoundParams[] = [
  { name: '100 — Разминка',       emoji: '🐺', description: 'Простой вопрос боссу. Все отвечают.', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 25, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'all' },
  { name: '200 — Темп',           emoji: '⏱️', description: 'Чуть быстрее. Все отвечают.',         answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: false, damageMode: 'all' },
  { name: '300 — Тишина',         emoji: '🔇', description: 'Связь начинает глушиться.',           answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: true,  damageMode: 'all' },
  { name: '400 — Скорость',       emoji: '⚡', description: 'Тишина + бонус за скорость.',         answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 15, speedScaling: true,  bet: false, commsBlocked: true,  damageMode: 'all' },
  { name: '500 — Капитан',        emoji: '👑', description: 'Только капитан может ответить.',      answerFormat: 'four', questionScope: 'shared', whoAnswers: 'captain',  timed: true, timeLimit: 20, speedScaling: false, bet: true,  commsBlocked: true,  damageMode: 'all' },
  { name: '600 — Каждый сам',     emoji: '🎯', description: 'Личный вопрос. Ошибся — теряешь HP.', answerFormat: 'four', questionScope: 'personal', whoAnswers: 'everyone', timed: true, timeLimit: 18, speedScaling: false, bet: false, commsBlocked: true,  damageMode: 'wrong-only' },
  { name: '800 — Жертва',         emoji: '💀', description: 'Один герой отвечает за всех.',        answerFormat: 'four', questionScope: 'shared', whoAnswers: 'sacrifice', timed: true, timeLimit: 18, speedScaling: false, bet: false, commsBlocked: true,  damageMode: 'all' },
  { name: '1000 — БОСС',          emoji: '🐲', description: 'Финал. Микс всего. Удержись.',        answerFormat: 'four', questionScope: 'shared', whoAnswers: 'everyone', timed: true, timeLimit: 15, speedScaling: true,  bet: false, commsBlocked: true,  damageMode: 'all' },
];

// На скорость — все 8 раундов с бонусом за скорость
const SPEED: RoundParams[] = eight((i) => ({
  name: `Спринт ${i + 1}`,
  emoji: '⚡',
  description: 'Кто быстрее ответил правильно — больше урона. Опоздал — урон тебе.',
  answerFormat: 'four',
  questionScope: 'shared',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: i < 4 ? 12 : 8,
  speedScaling: true,
  bet: false,
  commsBlocked: false,
  damageMode: 'wrong-only',
}));

// Санкт-Петербург — каждый получает фрагмент (personal), капитан собирает (captain)
// MVP: чередуем personal-фрагменты и captain-сборку
const PETERSBURG: RoundParams[] = eight((i) => {
  const isAssembly = i % 2 === 1; // нечётные — капитан собирает
  return isAssembly
    ? { name: `Сборка #${Math.ceil((i + 1) / 2)}`, emoji: '🎬', description: 'Капитан называет фильм по подсказкам команды.', answerFormat: 'four', questionScope: 'shared', whoAnswers: 'captain', timed: true, timeLimit: 25, speedScaling: false, bet: true, commsBlocked: false, damageMode: 'all' }
    : { name: `Фрагменты #${Math.ceil((i + 1) / 2)}`, emoji: '🧩', description: 'Каждому — свой кусочек подсказки.', answerFormat: 'four', questionScope: 'personal', whoAnswers: 'everyone', timed: true, timeLimit: 20, speedScaling: false, bet: false, commsBlocked: true, damageMode: 'wrong-only' };
});

// Сортировка по корзинам — все personal, wrong-only damage
const BUCKETS: RoundParams[] = eight((i) => ({
  name: `Сортировка ${i + 1}`,
  emoji: '🪣',
  description: 'У каждого личная корзина. Чем больше правильно отсортировал — тем больше урон боссу.',
  answerFormat: 'four',
  questionScope: 'personal',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 25,
  speedScaling: false,
  bet: false,
  commsBlocked: true,
  damageMode: 'wrong-only',
}));

// RPG: Награды — те же раунды что classic (награды между раундами обрабатываются отдельно)
const RPG_REWARDS: RoundParams[] = DEFAULT_ROUNDS.map((r) => ({
  ...r,
  description: r.description + ' [+ выбор награды после раунда]',
}));

// Квиз-мафия — все раунды команда отвечает, шпион видит ответ заранее
const SPY: RoundParams[] = eight((i) => ({
  name: `Раунд ${i + 1}`,
  emoji: '🕵️',
  description: 'Команда отвечает. Один из вас — шпион, ему выгодно, чтобы все ошиблись.',
  answerFormat: 'four',
  questionScope: 'shared',
  whoAnswers: 'everyone',
  timed: true,
  timeLimit: 20,
  speedScaling: false,
  bet: false,
  commsBlocked: false,
  damageMode: 'all',
}));

export function getRoundsForMode(mode: GameMode): RoundParams[] {
  switch (mode) {
    case 'classic':       return DEFAULT_ROUNDS;
    case 'millionaire':   return MILLIONAIRE;
    case 'topic-split':   return TOPIC_SPLIT;
    case 'jeopardy':      return JEOPARDY_COMP;
    case 'jeopardy-comp': return JEOPARDY_COMP;
    case 'jeopardy-coop': return JEOPARDY_COOP;
    case 'speed':         return SPEED;
    case 'petersburg':    return PETERSBURG;
    case 'buckets':       return BUCKETS;
    case 'rpg-rewards':   return RPG_REWARDS;
    case 'spy':           return SPY;
    default:              return DEFAULT_ROUNDS;
  }
}
