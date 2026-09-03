// Hardcoded 5x5 grid of questions for Jeopardy PvP mode.
// Topics on the X axis, values (100..500) on the Y axis. Higher value = harder.

export interface JeopardyCell {
  value: number;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface JeopardyGrid {
  topics: string[];
  // cells[topic] = ordered array of 5 cells: [100, 200, 300, 400, 500]
  cells: Record<string, JeopardyCell[]>;
}

export const JEOPARDY_GRID: JeopardyGrid = {
  topics: ['История', 'География', 'Кино', 'Наука', 'Музыка'],
  cells: {
    'История': [
      {
        value: 100,
        text: 'В каком году началась Вторая мировая война?',
        options: ['1939', '1941', '1945', '1937'],
        correctIndex: 0,
      },
      {
        value: 200,
        text: 'Кто был первым президентом США?',
        options: ['Авраам Линкольн', 'Джордж Вашингтон', 'Томас Джефферсон', 'Джон Адамс'],
        correctIndex: 1,
      },
      {
        value: 300,
        text: 'В каком году произошла Куликовская битва?',
        options: ['1240', '1380', '1480', '1242'],
        correctIndex: 1,
      },
      {
        value: 400,
        text: 'Кто был последним российским императором?',
        options: ['Александр III', 'Николай II', 'Павел I', 'Михаил II'],
        correctIndex: 1,
      },
      {
        value: 500,
        text: 'В каком году был подписан Вестфальский мир?',
        options: ['1618', '1648', '1715', '1789'],
        correctIndex: 1,
      },
    ],
    'География': [
      {
        value: 100,
        text: 'Какая самая длинная река в мире?',
        options: ['Амазонка', 'Нил', 'Янцзы', 'Миссисипи'],
        correctIndex: 1,
      },
      {
        value: 200,
        text: 'Столица Австралии?',
        options: ['Сидней', 'Мельбурн', 'Канберра', 'Перт'],
        correctIndex: 2,
      },
      {
        value: 300,
        text: 'Какое озеро самое глубокое в мире?',
        options: ['Каспийское', 'Виктория', 'Танганьика', 'Байкал'],
        correctIndex: 3,
      },
      {
        value: 400,
        text: 'В какой стране находится пустыня Атакама?',
        options: ['Перу', 'Чили', 'Аргентина', 'Боливия'],
        correctIndex: 1,
      },
      {
        value: 500,
        text: 'Какая страна имеет самую длинную сухопутную границу?',
        options: ['Россия', 'Китай', 'Индия', 'США'],
        correctIndex: 1,
      },
    ],
    'Кино': [
      {
        value: 100,
        text: 'Кто режиссёр фильма «Титаник» (1997)?',
        options: ['Стивен Спилберг', 'Джеймс Кэмерон', 'Кристофер Нолан', 'Мартин Скорсезе'],
        correctIndex: 1,
      },
      {
        value: 200,
        text: 'В каком фильме звучит фраза «Я ваш отец»?',
        options: ['Терминатор', 'Звёздные войны', 'Властелин колец', 'Матрица'],
        correctIndex: 1,
      },
      {
        value: 300,
        text: 'Кто сыграл Джокера в фильме «Тёмный рыцарь» (2008)?',
        options: ['Хоакин Феникс', 'Хит Леджер', 'Джаред Лето', 'Джек Николсон'],
        correctIndex: 1,
      },
      {
        value: 400,
        text: 'Какой фильм получил «Оскар» за лучший фильм в 2020 году?',
        options: ['1917', 'Однажды в Голливуде', 'Паразиты', 'Джокер'],
        correctIndex: 2,
      },
      {
        value: 500,
        text: 'Кто режиссёр фильма «Сталкер» (1979)?',
        options: ['Никита Михалков', 'Андрей Тарковский', 'Сергей Эйзенштейн', 'Эльдар Рязанов'],
        correctIndex: 1,
      },
    ],
    'Наука': [
      {
        value: 100,
        text: 'Сколько планет в Солнечной системе?',
        options: ['7', '8', '9', '10'],
        correctIndex: 1,
      },
      {
        value: 200,
        text: 'Какой химический символ у золота?',
        options: ['Go', 'Gd', 'Au', 'Ag'],
        correctIndex: 2,
      },
      {
        value: 300,
        text: 'Кто сформулировал теорию относительности?',
        options: ['Исаак Ньютон', 'Никола Тесла', 'Альберт Эйнштейн', 'Стивен Хокинг'],
        correctIndex: 2,
      },
      {
        value: 400,
        text: 'Какая частица имеет отрицательный заряд?',
        options: ['Протон', 'Нейтрон', 'Электрон', 'Позитрон'],
        correctIndex: 2,
      },
      {
        value: 500,
        text: 'Что такое число Авогадро (примерное значение)?',
        options: ['6.02 × 10²³', '3.14 × 10⁸', '9.81', '1.6 × 10⁻¹⁹'],
        correctIndex: 0,
      },
    ],
    'Музыка': [
      {
        value: 100,
        text: 'Какая группа исполнила песню «Yesterday»?',
        options: ['Rolling Stones', 'The Beatles', 'Queen', 'Pink Floyd'],
        correctIndex: 1,
      },
      {
        value: 200,
        text: 'Сколько струн на классической гитаре?',
        options: ['4', '5', '6', '7'],
        correctIndex: 2,
      },
      {
        value: 300,
        text: 'Кто написал оперу «Евгений Онегин»?',
        options: ['Мусоргский', 'Чайковский', 'Бородин', 'Римский-Корсаков'],
        correctIndex: 1,
      },
      {
        value: 400,
        text: 'Какой инструмент имеет 88 клавиш?',
        options: ['Орган', 'Фортепиано', 'Аккордеон', 'Клавесин'],
        correctIndex: 1,
      },
      {
        value: 500,
        text: 'В каком году умер Моцарт?',
        options: ['1750', '1791', '1827', '1809'],
        correctIndex: 1,
      },
    ],
  },
};
