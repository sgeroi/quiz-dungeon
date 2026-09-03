// Bucket sorting puzzle sets. Each set has 4 buckets (categories) and 20 items.
// Each item has a `bucket` index (0..3) indicating the correct category.

export interface BucketItem {
  text: string;
  bucket: number; // 0..3
}

export interface BucketSet {
  title: string;
  buckets: { name: string; emoji: string }[];
  items: BucketItem[];
}

export const BUCKET_SETS: BucketSet[] = [
  // 1. Animals by class
  {
    title: 'Звери, птицы, рыбы, насекомые',
    buckets: [
      { name: 'Млекопитающие', emoji: '🦁' },
      { name: 'Птицы',         emoji: '🦅' },
      { name: 'Рыбы',          emoji: '🐟' },
      { name: 'Насекомые',     emoji: '🦋' },
    ],
    items: [
      { text: 'Волк',       bucket: 0 },
      { text: 'Орёл',       bucket: 1 },
      { text: 'Акула',      bucket: 2 },
      { text: 'Бабочка',    bucket: 3 },
      { text: 'Кит',        bucket: 0 },
      { text: 'Ворон',      bucket: 1 },
      { text: 'Окунь',      bucket: 2 },
      { text: 'Муравей',    bucket: 3 },
      { text: 'Лиса',       bucket: 0 },
      { text: 'Голубь',     bucket: 1 },
      { text: 'Щука',       bucket: 2 },
      { text: 'Пчела',      bucket: 3 },
      { text: 'Ёж',         bucket: 0 },
      { text: 'Утка',       bucket: 1 },
      { text: 'Карп',       bucket: 2 },
      { text: 'Муха',       bucket: 3 },
      { text: 'Медведь',    bucket: 0 },
      { text: 'Сокол',      bucket: 1 },
      { text: 'Лосось',     bucket: 2 },
      { text: 'Кузнечик',   bucket: 3 },
    ],
  },

  // 2. Cities/things by country
  {
    title: 'Столицы и символы стран',
    buckets: [
      { name: 'Россия',   emoji: '🇷🇺' },
      { name: 'Германия', emoji: '🇩🇪' },
      { name: 'Франция',  emoji: '🇫🇷' },
      { name: 'Япония',   emoji: '🇯🇵' },
    ],
    items: [
      { text: 'Москва',       bucket: 0 },
      { text: 'Берлин',       bucket: 1 },
      { text: 'Париж',        bucket: 2 },
      { text: 'Токио',        bucket: 3 },
      { text: 'Пушкин',       bucket: 0 },
      { text: 'Гёте',         bucket: 1 },
      { text: 'Вольтер',      bucket: 2 },
      { text: 'Мураками',     bucket: 3 },
      { text: 'Балалайка',    bucket: 0 },
      { text: 'Октоберфест',  bucket: 1 },
      { text: 'Багет',        bucket: 2 },
      { text: 'Сакура',       bucket: 3 },
      { text: 'Эрмитаж',      bucket: 0 },
      { text: 'Бранденбургские ворота', bucket: 1 },
      { text: 'Эйфелева башня', bucket: 2 },
      { text: 'Фудзияма',     bucket: 3 },
      { text: 'Чайковский',   bucket: 0 },
      { text: 'Бах',          bucket: 1 },
      { text: 'Дебюсси',      bucket: 2 },
      { text: 'Хокусай',      bucket: 3 },
    ],
  },

  // 3. Food categories
  {
    title: 'Овощи, фрукты, ягоды, грибы',
    buckets: [
      { name: 'Овощи',   emoji: '🥕' },
      { name: 'Фрукты',  emoji: '🍎' },
      { name: 'Ягоды',   emoji: '🍓' },
      { name: 'Грибы',   emoji: '🍄' },
    ],
    items: [
      { text: 'Морковь',   bucket: 0 },
      { text: 'Яблоко',    bucket: 1 },
      { text: 'Клубника',  bucket: 2 },
      { text: 'Боровик',   bucket: 3 },
      { text: 'Картофель', bucket: 0 },
      { text: 'Банан',     bucket: 1 },
      { text: 'Малина',    bucket: 2 },
      { text: 'Лисичка',   bucket: 3 },
      { text: 'Капуста',   bucket: 0 },
      { text: 'Груша',     bucket: 1 },
      { text: 'Черника',   bucket: 2 },
      { text: 'Опёнок',    bucket: 3 },
      { text: 'Огурец',    bucket: 0 },
      { text: 'Апельсин',  bucket: 1 },
      { text: 'Брусника',  bucket: 2 },
      { text: 'Подосиновик', bucket: 3 },
      { text: 'Свёкла',    bucket: 0 },
      { text: 'Манго',     bucket: 1 },
      { text: 'Смородина', bucket: 2 },
      { text: 'Шампиньон', bucket: 3 },
    ],
  },

  // 4. Historical eras
  {
    title: 'Эпохи истории',
    buckets: [
      { name: 'Древний Рим',  emoji: '🏛️' },
      { name: 'Средние века', emoji: '🏰' },
      { name: 'Новое время',  emoji: '⚓' },
      { name: 'XX век',       emoji: '🚀' },
    ],
    items: [
      { text: 'Юлий Цезарь',     bucket: 0 },
      { text: 'Карл Великий',    bucket: 1 },
      { text: 'Пётр I',          bucket: 2 },
      { text: 'Гагарин',         bucket: 3 },
      { text: 'Колизей',         bucket: 0 },
      { text: 'Крестовые походы', bucket: 1 },
      { text: 'Французская революция', bucket: 2 },
      { text: 'Полёт на Луну',   bucket: 3 },
      { text: 'Цицерон',         bucket: 0 },
      { text: 'Жанна д’Арк',     bucket: 1 },
      { text: 'Наполеон',        bucket: 2 },
      { text: 'Эйнштейн',        bucket: 3 },
      { text: 'Сенат',           bucket: 0 },
      { text: 'Чёрная смерть',   bucket: 1 },
      { text: 'Открытие Америки', bucket: 2 },
      { text: 'Холодная война',  bucket: 3 },
      { text: 'Калигула',        bucket: 0 },
      { text: 'Рыцарские турниры', bucket: 1 },
      { text: 'Промышленная революция', bucket: 2 },
      { text: 'Распад СССР',     bucket: 3 },
    ],
  },

  // 5. Chemistry
  {
    title: 'Химические вещества',
    buckets: [
      { name: 'Кислоты',  emoji: '🧪' },
      { name: 'Щёлочи',   emoji: '🧫' },
      { name: 'Соли',     emoji: '🧂' },
      { name: 'Газы',     emoji: '💨' },
    ],
    items: [
      { text: 'H₂SO₄ (серная кислота)', bucket: 0 },
      { text: 'NaOH (едкий натр)',      bucket: 1 },
      { text: 'NaCl (поварен. соль)',   bucket: 2 },
      { text: 'O₂ (кислород)',          bucket: 3 },
      { text: 'HCl (соляная)',          bucket: 0 },
      { text: 'KOH (едкое кали)',       bucket: 1 },
      { text: 'KNO₃ (селитра)',         bucket: 2 },
      { text: 'CO₂ (углекислый газ)',   bucket: 3 },
      { text: 'HNO₃ (азотная)',         bucket: 0 },
      { text: 'Ca(OH)₂ (известь)',      bucket: 1 },
      { text: 'CuSO₄ (медн. купорос)',  bucket: 2 },
      { text: 'N₂ (азот)',              bucket: 3 },
      { text: 'CH₃COOH (уксусная)',     bucket: 0 },
      { text: 'NH₄OH (нашатырн. спирт)', bucket: 1 },
      { text: 'CaCO₃ (мел)',            bucket: 2 },
      { text: 'H₂ (водород)',           bucket: 3 },
      { text: 'H₃PO₄ (фосфорная)',      bucket: 0 },
      { text: 'LiOH (гидроксид лития)', bucket: 1 },
      { text: 'KCl (хлорид калия)',     bucket: 2 },
      { text: 'NH₃ (аммиак)',           bucket: 3 },
    ],
  },
];
