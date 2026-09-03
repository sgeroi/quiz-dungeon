// Question pool for "Темы по группам" mode.
// 10 questions per topic, all in Russian, 4 options each.
import type { SimpleQuestionsData } from '../../../../shared/content.ts';

export type TopicName = 'История' | 'Наука' | 'Кино' | 'Спорт';

export interface TopicQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

export const TOPICS: TopicName[] = ['История', 'Наука', 'Кино', 'Спорт'];

export const TOPIC_EMOJI: Record<TopicName, string> = {
  'История': '📚',
  'Наука': '🧪',
  'Кино': '🎬',
  'Спорт': '⚽',
};

export const TOPIC_QUESTIONS: Record<TopicName, TopicQuestion[]> = {
  'История': [
    {
      id: 'hist-1',
      text: 'В каком году началась Вторая мировая война?',
      options: ['1937', '1939', '1941', '1945'],
      correctIndex: 1,
    },
    {
      id: 'hist-2',
      text: 'Кто был первым президентом США?',
      options: ['Авраам Линкольн', 'Томас Джефферсон', 'Джордж Вашингтон', 'Джон Адамс'],
      correctIndex: 2,
    },
    {
      id: 'hist-3',
      text: 'В каком году пал Константинополь?',
      options: ['1453', '1492', '1517', '1389'],
      correctIndex: 0,
    },
    {
      id: 'hist-4',
      text: 'Кто возглавил Октябрьскую революцию 1917 года?',
      options: ['Сталин', 'Троцкий', 'Ленин', 'Керенский'],
      correctIndex: 2,
    },
    {
      id: 'hist-5',
      text: 'В каком году был построен Берлинский стена?',
      options: ['1945', '1949', '1961', '1971'],
      correctIndex: 2,
    },
    {
      id: 'hist-6',
      text: 'Кто такая Жанна д\'Арк?',
      options: ['Английская королева', 'Французская национальная героиня', 'Испанская принцесса', 'Итальянская художница'],
      correctIndex: 1,
    },
    {
      id: 'hist-7',
      text: 'В каком году Колумб открыл Америку?',
      options: ['1488', '1492', '1500', '1510'],
      correctIndex: 1,
    },
    {
      id: 'hist-8',
      text: 'Какая династия правила Россией с 1613 по 1917 год?',
      options: ['Рюриковичи', 'Романовы', 'Гедиминовичи', 'Шуйские'],
      correctIndex: 1,
    },
    {
      id: 'hist-9',
      text: 'Кто был императором Франции в начале XIX века?',
      options: ['Людовик XVI', 'Наполеон Бонапарт', 'Робеспьер', 'Карл X'],
      correctIndex: 1,
    },
    {
      id: 'hist-10',
      text: 'В каком году распался СССР?',
      options: ['1989', '1990', '1991', '1993'],
      correctIndex: 2,
    },
  ],
  'Наука': [
    {
      id: 'sci-1',
      text: 'Какой элемент имеет химический символ "Au"?',
      options: ['Серебро', 'Алюминий', 'Золото', 'Аргон'],
      correctIndex: 2,
    },
    {
      id: 'sci-2',
      text: 'Сколько планет в Солнечной системе?',
      options: ['7', '8', '9', '10'],
      correctIndex: 1,
    },
    {
      id: 'sci-3',
      text: 'Кто разработал теорию относительности?',
      options: ['Исаак Ньютон', 'Никола Тесла', 'Альберт Эйнштейн', 'Стивен Хокинг'],
      correctIndex: 2,
    },
    {
      id: 'sci-4',
      text: 'Какова скорость света в вакууме (приблизительно)?',
      options: ['150 000 км/с', '300 000 км/с', '500 000 км/с', '1 000 000 км/с'],
      correctIndex: 1,
    },
    {
      id: 'sci-5',
      text: 'Какая часть клетки отвечает за выработку энергии?',
      options: ['Ядро', 'Митохондрия', 'Рибосома', 'Лизосома'],
      correctIndex: 1,
    },
    {
      id: 'sci-6',
      text: 'Какой газ преобладает в атмосфере Земли?',
      options: ['Кислород', 'Углекислый газ', 'Азот', 'Водород'],
      correctIndex: 2,
    },
    {
      id: 'sci-7',
      text: 'Сколько хромосом у человека?',
      options: ['23', '46', '48', '64'],
      correctIndex: 1,
    },
    {
      id: 'sci-8',
      text: 'Какая планета известна как "Красная"?',
      options: ['Венера', 'Юпитер', 'Марс', 'Сатурн'],
      correctIndex: 2,
    },
    {
      id: 'sci-9',
      text: 'Кто открыл пенициллин?',
      options: ['Луи Пастер', 'Александр Флеминг', 'Роберт Кох', 'Чарльз Дарвин'],
      correctIndex: 1,
    },
    {
      id: 'sci-10',
      text: 'Какая формула воды?',
      options: ['H2O', 'CO2', 'O2', 'H2O2'],
      correctIndex: 0,
    },
  ],
  'Кино': [
    {
      id: 'cine-1',
      text: 'Кто снял фильм "Криминальное чтиво"?',
      options: ['Мартин Скорсезе', 'Квентин Тарантино', 'Стивен Спилберг', 'Дэвид Финчер'],
      correctIndex: 1,
    },
    {
      id: 'cine-2',
      text: 'Какой фильм получил Оскар за лучший фильм в 1998 году?',
      options: ['Титаник', 'Спасти рядового Райана', 'Влюблённый Шекспир', 'Гладиатор'],
      correctIndex: 0,
    },
    {
      id: 'cine-3',
      text: 'Кто играет Тони Старка в киновселенной Marvel?',
      options: ['Крис Эванс', 'Роберт Дауни-младший', 'Крис Хемсворт', 'Марк Руффало'],
      correctIndex: 1,
    },
    {
      id: 'cine-4',
      text: 'Какой режиссёр снял трилогию "Властелин колец"?',
      options: ['Питер Джексон', 'Джеймс Кэмерон', 'Гильермо дель Торо', 'Кристофер Нолан'],
      correctIndex: 0,
    },
    {
      id: 'cine-5',
      text: 'Из какого фильма фраза "Я твой отец"?',
      options: ['Терминатор', 'Звёздные войны', 'Матрица', 'Крёстный отец'],
      correctIndex: 1,
    },
    {
      id: 'cine-6',
      text: 'Кто режиссёр фильма "Сияние"?',
      options: ['Альфред Хичкок', 'Стэнли Кубрик', 'Дэвид Линч', 'Ридли Скотт'],
      correctIndex: 1,
    },
    {
      id: 'cine-7',
      text: 'Какой фильм Леонардо ДиКаприо принёс ему первый Оскар?',
      options: ['Авиатор', 'Волк с Уолл-стрит', 'Выживший', 'Однажды в Голливуде'],
      correctIndex: 2,
    },
    {
      id: 'cine-8',
      text: 'Какой советский фильм режиссёра Гайдая о бриллиантах?',
      options: ['Кавказская пленница', 'Бриллиантовая рука', 'Иван Васильевич меняет профессию', 'Операция Ы'],
      correctIndex: 1,
    },
    {
      id: 'cine-9',
      text: 'Кто играет Гарри Поттера в одноимённой серии фильмов?',
      options: ['Руперт Гринт', 'Дэниел Рэдклифф', 'Том Фелтон', 'Мэттью Льюис'],
      correctIndex: 1,
    },
    {
      id: 'cine-10',
      text: 'В каком году вышел фильм "Матрица"?',
      options: ['1997', '1999', '2001', '2003'],
      correctIndex: 1,
    },
  ],
  'Спорт': [
    {
      id: 'sport-1',
      text: 'Сколько игроков в команде по футболу на поле?',
      options: ['9', '10', '11', '12'],
      correctIndex: 2,
    },
    {
      id: 'sport-2',
      text: 'В каком виде спорта используют клюшку и шайбу?',
      options: ['Хоккей', 'Гольф', 'Крикет', 'Поло'],
      correctIndex: 0,
    },
    {
      id: 'sport-3',
      text: 'Сколько раз сборная Бразилии выигрывала чемпионат мира по футболу?',
      options: ['3', '4', '5', '6'],
      correctIndex: 2,
    },
    {
      id: 'sport-4',
      text: 'Какая страна принимала Олимпийские игры 2016 года?',
      options: ['Китай', 'Бразилия', 'Великобритания', 'Япония'],
      correctIndex: 1,
    },
    {
      id: 'sport-5',
      text: 'Сколько колец на олимпийском флаге?',
      options: ['4', '5', '6', '7'],
      correctIndex: 1,
    },
    {
      id: 'sport-6',
      text: 'Кто считается величайшим баскетболистом всех времён?',
      options: ['Леброн Джеймс', 'Майкл Джордан', 'Коби Брайант', 'Шакил О\'Нил'],
      correctIndex: 1,
    },
    {
      id: 'sport-7',
      text: 'В каком виде спорта борются Усэйн Болт и другие легендарные спринтеры?',
      options: ['Плавание', 'Бег', 'Велоспорт', 'Гребля'],
      correctIndex: 1,
    },
    {
      id: 'sport-8',
      text: 'Сколько таймов в матче по баскетболу (НБА)?',
      options: ['2', '3', '4', '5'],
      correctIndex: 2,
    },
    {
      id: 'sport-9',
      text: 'Какой теннисист выиграл больше всего турниров Большого шлема в одиночном разряде среди мужчин?',
      options: ['Роджер Федерер', 'Рафаэль Надаль', 'Новак Джокович', 'Пит Сампрас'],
      correctIndex: 2,
    },
    {
      id: 'sport-10',
      text: 'Сколько длится один период в хоккее?',
      options: ['15 минут', '20 минут', '25 минут', '30 минут'],
      correctIndex: 1,
    },
  ],
};

/**
 * Pick a question for a topic excluding the IDs in `usedIds`.
 * If all questions are used, returns a random one (shouldn't happen with 8 rounds vs 10 questions).
 */
export function pickTopicQuestion(
  pools: Record<string, TopicQuestion[]>,
  topic: string,
  usedIds: Set<string>,
): TopicQuestion | null {
  const pool = pools[topic] ?? [];
  if (pool.length === 0) return null;
  const available = pool.filter((q) => !usedIds.has(q.id));
  const list = available.length > 0 ? available : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/** Build per-topic pools from a content pack: topics = pack.topics, questions grouped by category. */
export function buildTopicPools(data: SimpleQuestionsData): { topics: string[]; pools: Record<string, TopicQuestion[]> } {
  const pools: Record<string, TopicQuestion[]> = {};
  const topics = (data.topics ?? []).filter((t) => typeof t === 'string' && t.trim());
  for (const t of topics) pools[t] = [];
  for (const q of data.questions) {
    const t = q.category ?? '';
    if (!pools[t]) continue;
    pools[t].push({
      id: q.id,
      text: q.text,
      options: [...q.options] as [string, string, string, string],
      correctIndex: q.correctIndex,
    });
  }
  // Only keep topics that actually have questions; fall back to builtin if fewer than 2 remain.
  const usable = topics.filter((t) => pools[t].length > 0);
  if (usable.length < 2) {
    const fallback: Record<string, TopicQuestion[]> = {};
    for (const t of TOPICS) fallback[t] = TOPIC_QUESTIONS[t];
    return { topics: [...TOPICS], pools: fallback };
  }
  const out: Record<string, TopicQuestion[]> = {};
  for (const t of usable) out[t] = pools[t];
  return { topics: usable, pools: out };
}
