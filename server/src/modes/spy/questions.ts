// Spy mode questions. 4 options each. Russian. Mixed topics.
import type { SimpleQuestion } from '../../../../shared/content.ts';

export interface SpyQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export const SPY_QUESTIONS: SpyQuestion[] = [
  {
    id: 'sp01',
    text: 'Какая планета известна как «Красная планета»?',
    options: ['Венера', 'Марс', 'Юпитер', 'Сатурн'],
    correctIndex: 1,
  },
  {
    id: 'sp02',
    text: 'Кто написал роман «Преступление и наказание»?',
    options: ['Толстой', 'Чехов', 'Достоевский', 'Гоголь'],
    correctIndex: 2,
  },
  {
    id: 'sp03',
    text: 'Сколько материков на Земле?',
    options: ['5', '6', '7', '8'],
    correctIndex: 1,
  },
  {
    id: 'sp04',
    text: 'В каком году был запущен первый искусственный спутник Земли?',
    options: ['1955', '1957', '1961', '1965'],
    correctIndex: 1,
  },
  {
    id: 'sp05',
    text: 'Какой металл самый лёгкий?',
    options: ['Алюминий', 'Литий', 'Натрий', 'Магний'],
    correctIndex: 1,
  },
  {
    id: 'sp06',
    text: 'Кто написал картину «Звёздная ночь»?',
    options: ['Моне', 'Ван Гог', 'Пикассо', 'Дали'],
    correctIndex: 1,
  },
  {
    id: 'sp07',
    text: 'Столица Австралии?',
    options: ['Сидней', 'Мельбурн', 'Канберра', 'Перт'],
    correctIndex: 2,
  },
  {
    id: 'sp08',
    text: 'Сколько струн у классической гитары?',
    options: ['4', '6', '7', '8'],
    correctIndex: 1,
  },
  {
    id: 'sp09',
    text: 'Какой химический элемент обозначается символом Au?',
    options: ['Серебро', 'Алюминий', 'Золото', 'Медь'],
    correctIndex: 2,
  },
  {
    id: 'sp10',
    text: 'Самая высокая гора в мире?',
    options: ['Килиманджаро', 'К2', 'Эверест', 'Эльбрус'],
    correctIndex: 2,
  },
  {
    id: 'sp11',
    text: 'Какой композитор написал «Лунную сонату»?',
    options: ['Моцарт', 'Бах', 'Бетховен', 'Шопен'],
    correctIndex: 2,
  },
  {
    id: 'sp12',
    text: 'Сколько игроков в баскетбольной команде на площадке?',
    options: ['4', '5', '6', '7'],
    correctIndex: 1,
  },
  {
    id: 'sp13',
    text: 'Какое море самое солёное?',
    options: ['Чёрное', 'Средиземное', 'Мёртвое', 'Красное'],
    correctIndex: 2,
  },
  {
    id: 'sp14',
    text: 'Кто открыл закон всемирного тяготения?',
    options: ['Эйнштейн', 'Ньютон', 'Галилей', 'Кеплер'],
    correctIndex: 1,
  },
  {
    id: 'sp15',
    text: 'Какая столица у Канады?',
    options: ['Торонто', 'Ванкувер', 'Монреаль', 'Оттава'],
    correctIndex: 3,
  },
  {
    id: 'sp16',
    text: 'Сколько лет длилась Столетняя война?',
    options: ['100', '108', '116', '120'],
    correctIndex: 2,
  },
  {
    id: 'sp17',
    text: 'Какой инструмент изобрёл Антонио Страдивари?',
    options: ['Пианино', 'Скрипки', 'Флейты', 'Барабаны'],
    correctIndex: 1,
  },
  {
    id: 'sp18',
    text: 'В какой стране изобрели бумагу?',
    options: ['Египет', 'Греция', 'Китай', 'Индия'],
    correctIndex: 2,
  },
  {
    id: 'sp19',
    text: 'Какой газ преобладает в атмосфере Земли?',
    options: ['Кислород', 'Азот', 'Углекислый газ', 'Водород'],
    correctIndex: 1,
  },
  {
    id: 'sp20',
    text: 'Кто режиссёр фильма «Сталкер»?',
    options: ['Михалков', 'Эйзенштейн', 'Тарковский', 'Бондарчук'],
    correctIndex: 2,
  },
];

/** Convert content-pack questions into this mode's shape. */
export function toSpyQuestions(pool: SimpleQuestion[]): SpyQuestion[] {
  return pool.map(q => ({
    id: q.id,
    text: q.text,
    options: [...q.options] as [string, string, string, string],
    correctIndex: q.correctIndex,
  }));
}

export function pickSpyQuestions(source: SpyQuestion[], count: number): SpyQuestion[] {
  const pool = [...source];
  const out: SpyQuestion[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
