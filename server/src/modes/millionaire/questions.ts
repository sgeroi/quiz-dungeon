// Question pool for "Кто хочет стать миллионером" mode.
// 30+ questions in Russian, distributed by difficulty.
import type { SimpleQuestion } from '../../../../shared/content.ts';

export interface MillionaireQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const MILLIONAIRE_QUESTIONS: MillionaireQuestion[] = [
  // ---------- EASY (15) ----------
  {
    id: 'm-e-1',
    text: 'Какого цвета небо в ясный солнечный день?',
    options: ['Красное', 'Зелёное', 'Голубое', 'Жёлтое'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-2',
    text: 'Сколько дней в неделе?',
    options: ['5', '6', '7', '8'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-3',
    text: 'Столица России?',
    options: ['Санкт-Петербург', 'Москва', 'Казань', 'Новосибирск'],
    correctIndex: 1,
    difficulty: 'easy',
  },
  {
    id: 'm-e-4',
    text: 'Сколько ног у паука?',
    options: ['6', '8', '10', '4'],
    correctIndex: 1,
    difficulty: 'easy',
  },
  {
    id: 'm-e-5',
    text: 'Какой газ мы вдыхаем для жизни?',
    options: ['Водород', 'Углекислый газ', 'Кислород', 'Азот'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-6',
    text: 'Как зовут главного героя сказки «Колобок»?',
    options: ['Колосок', 'Колобок', 'Каравай', 'Пирожок'],
    correctIndex: 1,
    difficulty: 'easy',
  },
  {
    id: 'm-e-7',
    text: 'Какой самый большой океан Земли?',
    options: ['Атлантический', 'Индийский', 'Северный Ледовитый', 'Тихий'],
    correctIndex: 3,
    difficulty: 'easy',
  },
  {
    id: 'm-e-8',
    text: 'Сколько месяцев в году?',
    options: ['10', '11', '12', '13'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-9',
    text: 'Какого цвета хлорофилл?',
    options: ['Красный', 'Зелёный', 'Жёлтый', 'Синий'],
    correctIndex: 1,
    difficulty: 'easy',
  },
  {
    id: 'm-e-10',
    text: 'Кто написал «Сказку о рыбаке и рыбке»?',
    options: ['Лермонтов', 'Толстой', 'Пушкин', 'Чехов'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-11',
    text: 'Что обозначает красный сигнал светофора?',
    options: ['Иди', 'Внимание', 'Стой', 'Поверни'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-12',
    text: 'Какое животное называют «царём зверей»?',
    options: ['Тигр', 'Слон', 'Лев', 'Медведь'],
    correctIndex: 2,
    difficulty: 'easy',
  },
  {
    id: 'm-e-13',
    text: 'Сколько сторон у треугольника?',
    options: ['2', '3', '4', '5'],
    correctIndex: 1,
    difficulty: 'easy',
  },
  {
    id: 'm-e-14',
    text: 'Какая планета ближе всех к Солнцу?',
    options: ['Венера', 'Земля', 'Марс', 'Меркурий'],
    correctIndex: 3,
    difficulty: 'easy',
  },
  {
    id: 'm-e-15',
    text: 'Чем питаются травоядные?',
    options: ['Мясом', 'Растениями', 'Рыбой', 'Насекомыми'],
    correctIndex: 1,
    difficulty: 'easy',
  },

  // ---------- MEDIUM (10) ----------
  {
    id: 'm-m-1',
    text: 'В каком году человек впервые полетел в космос?',
    options: ['1957', '1961', '1969', '1965'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-2',
    text: 'Какая столица у Австралии?',
    options: ['Сидней', 'Мельбурн', 'Канберра', 'Брисбен'],
    correctIndex: 2,
    difficulty: 'medium',
  },
  {
    id: 'm-m-3',
    text: 'Кто написал роман «Война и мир»?',
    options: ['Достоевский', 'Толстой', 'Тургенев', 'Чехов'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-4',
    text: 'Самая длинная река в мире?',
    options: ['Амазонка', 'Нил', 'Янцзы', 'Миссисипи'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-5',
    text: 'Какой химический элемент обозначается символом Au?',
    options: ['Серебро', 'Алюминий', 'Золото', 'Аргон'],
    correctIndex: 2,
    difficulty: 'medium',
  },
  {
    id: 'm-m-6',
    text: 'Кто нарисовал «Мону Лизу»?',
    options: ['Микеланджело', 'Леонардо да Винчи', 'Рафаэль', 'Боттичелли'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-7',
    text: 'Сколько костей в скелете взрослого человека?',
    options: ['180', '206', '256', '320'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-8',
    text: 'В каком веке жил Пётр I?',
    options: ['XVI–XVII', 'XVII–XVIII', 'XVIII–XIX', 'XIX–XX'],
    correctIndex: 1,
    difficulty: 'medium',
  },
  {
    id: 'm-m-9',
    text: 'Какая страна подарила США статую Свободы?',
    options: ['Англия', 'Германия', 'Франция', 'Италия'],
    correctIndex: 2,
    difficulty: 'medium',
  },
  {
    id: 'm-m-10',
    text: 'Какой инструмент использовал Шерлок Холмс для игры?',
    options: ['Пианино', 'Скрипка', 'Флейта', 'Гитара'],
    correctIndex: 1,
    difficulty: 'medium',
  },

  // ---------- HARD (8) ----------
  {
    id: 'm-h-1',
    text: 'Кто открыл закон всемирного тяготения?',
    options: ['Эйнштейн', 'Галилей', 'Ньютон', 'Кеплер'],
    correctIndex: 2,
    difficulty: 'hard',
  },
  {
    id: 'm-h-2',
    text: 'Столица Буркина-Фасо?',
    options: ['Уагадугу', 'Бамако', 'Ниамей', 'Котону'],
    correctIndex: 0,
    difficulty: 'hard',
  },
  {
    id: 'm-h-3',
    text: 'В каком году была основана Москва (по летописи)?',
    options: ['1147', '1242', '1380', '1054'],
    correctIndex: 0,
    difficulty: 'hard',
  },
  {
    id: 'm-h-4',
    text: 'Какой композитор написал оперу «Травиата»?',
    options: ['Пуччини', 'Россини', 'Верди', 'Беллини'],
    correctIndex: 2,
    difficulty: 'hard',
  },
  {
    id: 'm-h-5',
    text: 'Сколько хромосом у обычной клетки человека?',
    options: ['23', '46', '48', '64'],
    correctIndex: 1,
    difficulty: 'hard',
  },
  {
    id: 'm-h-6',
    text: 'Самый глубокий океанический жёлоб?',
    options: ['Курильский', 'Марианский', 'Филиппинский', 'Тонга'],
    correctIndex: 1,
    difficulty: 'hard',
  },
  {
    id: 'm-h-7',
    text: 'Кто автор картины «Звёздная ночь»?',
    options: ['Моне', 'Ван Гог', 'Сезанн', 'Гоген'],
    correctIndex: 1,
    difficulty: 'hard',
  },
  {
    id: 'm-h-8',
    text: 'В каком году распался СССР?',
    options: ['1989', '1990', '1991', '1993'],
    correctIndex: 2,
    difficulty: 'hard',
  },
];

/** Convert content-pack questions into this mode's shape (difficulty defaults to medium). */
export function toMillionaireQuestions(pool: SimpleQuestion[]): MillionaireQuestion[] {
  return pool.map(q => ({
    id: q.id,
    text: q.text,
    options: [...q.options] as [string, string, string, string],
    correctIndex: q.correctIndex,
    difficulty: q.difficulty ?? 'medium',
  }));
}

export function pickQuestion(
  all: MillionaireQuestion[],
  difficulty: 'easy' | 'medium' | 'hard',
  used: Set<string>,
): MillionaireQuestion | null {
  let pool = all.filter(q => q.difficulty === difficulty && !used.has(q.id));
  if (pool.length === 0) {
    pool = all.filter(q => q.difficulty === difficulty);
  }
  // Pack may have no questions of this difficulty — fall back to any unused, then any.
  if (pool.length === 0) pool = all.filter(q => !used.has(q.id));
  if (pool.length === 0) pool = all;
  if (pool.length === 0) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  used.add(q.id);
  return q;
}

// 8-level pyramid: prize amount per level
export const PRIZE_PYRAMID: number[] = [
  100,
  500,
  1_000,
  5_000,
  25_000,    // safe haven
  100_000,
  500_000,
  1_000_000,
];

export const SAFE_LEVELS: number[] = [0, 5]; // index 0 (just-in-case zero) and index 4 (25k) — we treat level 5 as safe haven

// Difficulty per level (1-indexed)
export function difficultyForLevel(level: number): 'easy' | 'medium' | 'hard' {
  if (level <= 3) return 'easy';
  if (level <= 5) return 'medium';
  return 'hard';
}
