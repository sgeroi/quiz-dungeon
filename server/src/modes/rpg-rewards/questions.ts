// RPG: Rewards mode questions. 4 options each. Russian. Mixed topics.
import type { SimpleQuestion } from '../../../../shared/content.ts';

export interface RpgrQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export const RPGR_QUESTIONS: RpgrQuestion[] = [
  { id: 'r01', text: 'Какая планета самая большая в Солнечной системе?', options: ['Земля', 'Сатурн', 'Юпитер', 'Нептун'], correctIndex: 2 },
  { id: 'r02', text: 'Кто написал «Войну и мир»?', options: ['Достоевский', 'Толстой', 'Чехов', 'Тургенев'], correctIndex: 1 },
  { id: 'r03', text: 'Столица Японии?', options: ['Сеул', 'Пекин', 'Токио', 'Осака'], correctIndex: 2 },
  { id: 'r04', text: 'Сколько костей в теле взрослого человека?', options: ['186', '206', '226', '256'], correctIndex: 1 },
  { id: 'r05', text: 'Самое глубокое озеро в мире?', options: ['Виктория', 'Каспийское', 'Байкал', 'Танганьика'], correctIndex: 2 },
  { id: 'r06', text: 'Кто открыл закон всемирного тяготения?', options: ['Эйнштейн', 'Галилей', 'Кеплер', 'Ньютон'], correctIndex: 3 },
  { id: 'r07', text: 'В каком году началась Вторая мировая война?', options: ['1937', '1939', '1941', '1945'], correctIndex: 1 },
  { id: 'r08', text: 'Какой химический элемент обозначается Au?', options: ['Серебро', 'Алюминий', 'Золото', 'Аргон'], correctIndex: 2 },
  { id: 'r09', text: 'Сколько игроков в футбольной команде на поле?', options: ['9', '10', '11', '12'], correctIndex: 2 },
  { id: 'r10', text: 'Кто написал «Анну Каренину»?', options: ['Пушкин', 'Толстой', 'Гоголь', 'Лермонтов'], correctIndex: 1 },
  { id: 'r11', text: 'Самая длинная река в мире?', options: ['Амазонка', 'Нил', 'Янцзы', 'Миссисипи'], correctIndex: 1 },
  { id: 'r12', text: 'Какая столица Канады?', options: ['Торонто', 'Ванкувер', 'Оттава', 'Монреаль'], correctIndex: 2 },
  { id: 'r13', text: 'Кто изобрёл телефон?', options: ['Эдисон', 'Белл', 'Тесла', 'Маркони'], correctIndex: 1 },
  { id: 'r14', text: 'Сколько планет в Солнечной системе?', options: ['7', '8', '9', '10'], correctIndex: 1 },
  { id: 'r15', text: 'Какой газ мы выдыхаем?', options: ['Кислород', 'Азот', 'Углекислый газ', 'Водород'], correctIndex: 2 },
  { id: 'r16', text: 'Столица Италии?', options: ['Милан', 'Рим', 'Венеция', 'Неаполь'], correctIndex: 1 },
  { id: 'r17', text: 'Какой океан самый большой?', options: ['Атлантический', 'Индийский', 'Тихий', 'Северный Ледовитый'], correctIndex: 2 },
  { id: 'r18', text: 'Автор «Гамлета»?', options: ['Шекспир', 'Диккенс', 'Байрон', 'Мольер'], correctIndex: 0 },
  { id: 'r19', text: 'Какая страна подарила миру пиццу?', options: ['Франция', 'Италия', 'Греция', 'Испания'], correctIndex: 1 },
  { id: 'r20', text: 'Сколько секунд в часе?', options: ['360', '600', '3600', '6000'], correctIndex: 2 },
  { id: 'r21', text: 'Самая высокая гора в мире?', options: ['Эльбрус', 'К2', 'Эверест', 'Монблан'], correctIndex: 2 },
  { id: 'r22', text: 'Кто написал «Преступление и наказание»?', options: ['Тургенев', 'Достоевский', 'Гоголь', 'Пушкин'], correctIndex: 1 },
  { id: 'r23', text: 'Сколько цветов в радуге?', options: ['5', '6', '7', '8'], correctIndex: 2 },
  { id: 'r24', text: 'Какой язык программирования был создан Гвидо ван Россумом?', options: ['Java', 'Python', 'Ruby', 'Go'], correctIndex: 1 },
  { id: 'r25', text: 'Сколько хромосом у человека?', options: ['44', '46', '48', '50'], correctIndex: 1 },
  { id: 'r26', text: 'Какой металл жидкий при комнатной температуре?', options: ['Свинец', 'Ртуть', 'Олово', 'Цинк'], correctIndex: 1 },
  { id: 'r27', text: 'Год полёта Гагарина в космос?', options: ['1957', '1961', '1969', '1971'], correctIndex: 1 },
  { id: 'r28', text: 'Столица Бразилии?', options: ['Рио-де-Жанейро', 'Сан-Паулу', 'Бразилиа', 'Сальвадор'], correctIndex: 2 },
  { id: 'r29', text: 'Кто нарисовал «Мону Лизу»?', options: ['Микеланджело', 'Рафаэль', 'Да Винчи', 'Боттичелли'], correctIndex: 2 },
  { id: 'r30', text: 'Сколько струн на скрипке?', options: ['3', '4', '5', '6'], correctIndex: 1 },
  { id: 'r31', text: 'Какой материк самый маленький?', options: ['Европа', 'Австралия', 'Антарктида', 'Южная Америка'], correctIndex: 1 },
  { id: 'r32', text: 'Какое животное самое быстрое на суше?', options: ['Лев', 'Гепард', 'Антилопа', 'Лошадь'], correctIndex: 1 },
  { id: 'r33', text: 'Какая столица Австралии?', options: ['Сидней', 'Мельбурн', 'Канберра', 'Перт'], correctIndex: 2 },
  { id: 'r34', text: 'Кто написал «Маленького принца»?', options: ['Камю', 'Сент-Экзюпери', 'Сартр', 'Гюго'], correctIndex: 1 },
  { id: 'r35', text: 'Какой витамин вырабатывается под солнцем?', options: ['A', 'B', 'C', 'D'], correctIndex: 3 },
];

/** Convert content-pack questions into this mode's shape. */
export function toRpgrQuestions(pool: SimpleQuestion[]): RpgrQuestion[] {
  return pool.map(q => ({
    id: q.id,
    text: q.text,
    options: [...q.options] as [string, string, string, string],
    correctIndex: q.correctIndex,
  }));
}

// Pick N unique random questions from the given pool.
export function pickRpgrQuestions(source: RpgrQuestion[], n: number): RpgrQuestion[] {
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
