// Question pool for "На скорость / Баззер" mode.
// 30+ questions in Russian, varied topics, 4 options each.

export interface SpeedQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  category: string;
}

export const SPEED_QUESTIONS: SpeedQuestion[] = [
  // География
  {
    id: 's-1',
    text: 'Какая страна самая большая по площади?',
    options: ['Канада', 'Китай', 'Россия', 'США'],
    correctIndex: 2,
    category: 'География',
  },
  {
    id: 's-2',
    text: 'Самая длинная река в мире?',
    options: ['Нил', 'Амазонка', 'Янцзы', 'Миссисипи'],
    correctIndex: 1,
    category: 'География',
  },
  {
    id: 's-3',
    text: 'На каком континенте находится Египет?',
    options: ['Азия', 'Африка', 'Европа', 'Австралия'],
    correctIndex: 1,
    category: 'География',
  },
  {
    id: 's-4',
    text: 'Столица Австралии?',
    options: ['Сидней', 'Мельбурн', 'Канберра', 'Перт'],
    correctIndex: 2,
    category: 'География',
  },
  {
    id: 's-5',
    text: 'Самое глубокое озеро в мире?',
    options: ['Каспийское', 'Виктория', 'Байкал', 'Танганьика'],
    correctIndex: 2,
    category: 'География',
  },

  // История
  {
    id: 's-6',
    text: 'В каком году началась Вторая мировая война?',
    options: ['1937', '1939', '1941', '1945'],
    correctIndex: 1,
    category: 'История',
  },
  {
    id: 's-7',
    text: 'Кто был первым человеком в космосе?',
    options: ['Армстронг', 'Гагарин', 'Леонов', 'Терешкова'],
    correctIndex: 1,
    category: 'История',
  },
  {
    id: 's-8',
    text: 'Кто написал «Войну и мир»?',
    options: ['Достоевский', 'Толстой', 'Чехов', 'Тургенев'],
    correctIndex: 1,
    category: 'Литература',
  },
  {
    id: 's-9',
    text: 'В каком веке жил Пётр I?',
    options: ['XVI', 'XVII', 'XVIII', 'XIX'],
    correctIndex: 2,
    category: 'История',
  },
  {
    id: 's-10',
    text: 'Какая империя пала в 476 году?',
    options: ['Византийская', 'Западная Римская', 'Османская', 'Персидская'],
    correctIndex: 1,
    category: 'История',
  },

  // Наука
  {
    id: 's-11',
    text: 'Сколько планет в Солнечной системе?',
    options: ['7', '8', '9', '10'],
    correctIndex: 1,
    category: 'Наука',
  },
  {
    id: 's-12',
    text: 'Химический символ золота?',
    options: ['Go', 'Gd', 'Au', 'Ag'],
    correctIndex: 2,
    category: 'Наука',
  },
  {
    id: 's-13',
    text: 'Какая планета ближе всего к Солнцу?',
    options: ['Венера', 'Меркурий', 'Марс', 'Земля'],
    correctIndex: 1,
    category: 'Наука',
  },
  {
    id: 's-14',
    text: 'Скорость света примерно равна?',
    options: ['300 км/с', '300 000 км/с', '3 000 км/с', '30 000 км/с'],
    correctIndex: 1,
    category: 'Наука',
  },
  {
    id: 's-15',
    text: 'Сколько хромосом у человека?',
    options: ['23', '46', '48', '64'],
    correctIndex: 1,
    category: 'Наука',
  },
  {
    id: 's-16',
    text: 'Кто открыл закон всемирного тяготения?',
    options: ['Эйнштейн', 'Галилей', 'Ньютон', 'Кеплер'],
    correctIndex: 2,
    category: 'Наука',
  },

  // Спорт
  {
    id: 's-17',
    text: 'Сколько игроков в футбольной команде на поле?',
    options: ['10', '11', '12', '9'],
    correctIndex: 1,
    category: 'Спорт',
  },
  {
    id: 's-18',
    text: 'Где проходили Олимпийские игры в 1980 году?',
    options: ['Мюнхен', 'Москва', 'Сеул', 'Токио'],
    correctIndex: 1,
    category: 'Спорт',
  },
  {
    id: 's-19',
    text: 'В каком виде спорта используют шайбу?',
    options: ['Бейсбол', 'Хоккей', 'Гольф', 'Крикет'],
    correctIndex: 1,
    category: 'Спорт',
  },

  // Кино и музыка
  {
    id: 's-20',
    text: 'Кто режиссёр фильма «Криминальное чтиво»?',
    options: ['Скорсезе', 'Тарантино', 'Нолан', 'Спилберг'],
    correctIndex: 1,
    category: 'Кино',
  },
  {
    id: 's-21',
    text: 'Какая группа исполнила «Bohemian Rhapsody»?',
    options: ['The Beatles', 'Queen', 'Led Zeppelin', 'Pink Floyd'],
    correctIndex: 1,
    category: 'Музыка',
  },
  {
    id: 's-22',
    text: 'Сколько струн у классической гитары?',
    options: ['4', '5', '6', '7'],
    correctIndex: 2,
    category: 'Музыка',
  },
  {
    id: 's-23',
    text: 'Кто сыграл Нео в «Матрице»?',
    options: ['Брэд Питт', 'Том Круз', 'Киану Ривз', 'Лоуренс Фишберн'],
    correctIndex: 2,
    category: 'Кино',
  },

  // Природа и животные
  {
    id: 's-24',
    text: 'Самое большое млекопитающее на Земле?',
    options: ['Слон', 'Синий кит', 'Жираф', 'Косатка'],
    correctIndex: 1,
    category: 'Природа',
  },
  {
    id: 's-25',
    text: 'Сколько ног у паука?',
    options: ['6', '8', '10', '12'],
    correctIndex: 1,
    category: 'Природа',
  },
  {
    id: 's-26',
    text: 'Какое животное называют «королём джунглей»?',
    options: ['Тигр', 'Лев', 'Леопард', 'Гепард'],
    correctIndex: 1,
    category: 'Природа',
  },

  // Математика
  {
    id: 's-27',
    text: 'Чему равно 12 × 12?',
    options: ['124', '144', '142', '154'],
    correctIndex: 1,
    category: 'Математика',
  },
  {
    id: 's-28',
    text: 'Сколько градусов в прямом угле?',
    options: ['45', '90', '180', '360'],
    correctIndex: 1,
    category: 'Математика',
  },
  {
    id: 's-29',
    text: 'Чему равно число π округлённо?',
    options: ['2.71', '3.14', '1.41', '6.28'],
    correctIndex: 1,
    category: 'Математика',
  },

  // Разное
  {
    id: 's-30',
    text: 'Сколько цветов в радуге?',
    options: ['5', '6', '7', '8'],
    correctIndex: 2,
    category: 'Разное',
  },
  {
    id: 's-31',
    text: 'Какой металл жидкий при комнатной температуре?',
    options: ['Свинец', 'Ртуть', 'Олово', 'Цинк'],
    correctIndex: 1,
    category: 'Наука',
  },
  {
    id: 's-32',
    text: 'Сколько минут в сутках?',
    options: ['1200', '1440', '1600', '2400'],
    correctIndex: 1,
    category: 'Математика',
  },
  {
    id: 's-33',
    text: 'Какой язык программирования назван в честь комика?',
    options: ['Java', 'Python', 'Ruby', 'Go'],
    correctIndex: 1,
    category: 'Технологии',
  },
  {
    id: 's-34',
    text: 'Какой цвет получится при смешении синего и жёлтого?',
    options: ['Зелёный', 'Фиолетовый', 'Оранжевый', 'Коричневый'],
    correctIndex: 0,
    category: 'Разное',
  },
  {
    id: 's-35',
    text: 'Кто написал картину «Мона Лиза»?',
    options: ['Микеланджело', 'Рафаэль', 'Леонардо да Винчи', 'Боттичелли'],
    correctIndex: 2,
    category: 'Искусство',
  },
];

/** Pick N unique random questions for a game. */
export function pickQuestions(count: number): SpeedQuestion[] {
  const pool = [...SPEED_QUESTIONS];
  const out: SpeedQuestion[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}
