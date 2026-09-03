// Fetches actor portraits from Wikipedia (RU first, EN fallback) and writes
// a movies.ts file ready to be dropped into server/src/modes/petersburg/.
//
// Run:  node scripts/fetch-cast.mjs > server/src/modes/petersburg/movies.ts
// (or)  node scripts/fetch-cast.mjs --json   for raw JSON to stdout

import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const MOVIES = [
  {
    id: 'inception',
    title: 'Начало',
    aliases: ['Inception', 'Начало (Inception)'],
    cast: [
      { name: 'Леонардо ДиКаприо', wiki: 'Леонардо Ди Каприо', wikiEn: 'Leonardo DiCaprio' },
      { name: 'Джозеф Гордон-Левитт', wiki: 'Гордон-Левитт, Джозеф', wikiEn: 'Joseph Gordon-Levitt' },
      { name: 'Эллиот Пейдж', wiki: 'Пейдж, Эллиот', wikiEn: 'Elliot Page' },
      { name: 'Том Харди', wiki: 'Харди, Том', wikiEn: 'Tom Hardy' },
      { name: 'Марион Котийяр', wiki: 'Котийяр, Марион', wikiEn: 'Marion Cotillard' },
      { name: 'Кен Ватанабэ', wiki: 'Ватанабэ, Кэн', wikiEn: 'Ken Watanabe' },
    ],
  },
  {
    id: 'matrix',
    title: 'Матрица',
    aliases: ['The Matrix'],
    cast: [
      { name: 'Киану Ривз', wiki: 'Ривз, Киану', wikiEn: 'Keanu Reeves' },
      { name: 'Лоуренс Фишбёрн', wiki: 'Фишбёрн, Лоренс', wikiEn: 'Laurence Fishburne' },
      { name: 'Кэрри-Энн Мосс', wiki: 'Мосс, Кэрри-Энн', wikiEn: 'Carrie-Anne Moss' },
      { name: 'Хьюго Уивинг', wiki: 'Уивинг, Хьюго', wikiEn: 'Hugo Weaving' },
      { name: 'Джо Пантолиано', wiki: 'Пантолиано, Джо', wikiEn: 'Joe Pantoliano' },
    ],
  },
  {
    id: 'lotr-fellowship',
    title: 'Властелин колец: Братство кольца',
    aliases: ['Властелин колец', 'Братство кольца', 'The Lord of the Rings', 'The Fellowship of the Ring', 'Властелин колец 1'],
    cast: [
      { name: 'Элайджа Вуд', wiki: 'Вуд, Элайджа', wikiEn: 'Elijah Wood' },
      { name: 'Иэн Маккеллен', wiki: 'Маккеллен, Иэн', wikiEn: 'Ian McKellen' },
      { name: 'Вигго Мортенсен', wiki: 'Мортенсен, Вигго', wikiEn: 'Viggo Mortensen' },
      { name: 'Орландо Блум', wiki: 'Блум, Орландо', wikiEn: 'Orlando Bloom' },
      { name: 'Шон Бин', wiki: 'Бин, Шон', wikiEn: 'Sean Bean' },
      { name: 'Кейт Бланшетт', wiki: 'Бланшетт, Кейт', wikiEn: 'Cate Blanchett' },
    ],
  },
  {
    id: 'pulp-fiction',
    title: 'Криминальное чтиво',
    aliases: ['Pulp Fiction'],
    cast: [
      { name: 'Джон Траволта', wiki: 'Траволта, Джон', wikiEn: 'John Travolta' },
      { name: 'Сэмюэл Л. Джексон', wiki: 'Джексон, Сэмюэл Лерой', wikiEn: 'Samuel L. Jackson' },
      { name: 'Ума Турман', wiki: 'Турман, Ума', wikiEn: 'Uma Thurman' },
      { name: 'Брюс Уиллис', wiki: 'Уиллис, Брюс', wikiEn: 'Bruce Willis' },
      { name: 'Тим Рот', wiki: 'Рот, Тим', wikiEn: 'Tim Roth' },
      { name: 'Винг Реймс', wiki: 'Реймс, Винг', wikiEn: 'Ving Rhames' },
    ],
  },
  {
    id: 'forrest-gump',
    title: 'Форрест Гамп',
    aliases: ['Forrest Gump'],
    cast: [
      { name: 'Том Хэнкс', wiki: 'Хэнкс, Том', wikiEn: 'Tom Hanks' },
      { name: 'Робин Райт', wiki: 'Райт, Робин', wikiEn: 'Robin Wright' },
      { name: 'Гэри Синиз', wiki: 'Синиз, Гари', wikiEn: 'Gary Sinise' },
      { name: 'Майкелти Уильямсон', wiki: 'Уильямсон, Микельти', wikiEn: 'Mykelti Williamson' },
      { name: 'Салли Филд', wiki: 'Филд, Салли', wikiEn: 'Sally Field' },
    ],
  },
  {
    id: 'titanic',
    title: 'Титаник',
    aliases: ['Titanic'],
    cast: [
      { name: 'Леонардо ДиКаприо', wiki: 'Леонардо Ди Каприо', wikiEn: 'Leonardo DiCaprio' },
      { name: 'Кейт Уинслет', wiki: 'Уинслет, Кейт', wikiEn: 'Kate Winslet' },
      { name: 'Билли Зейн', wiki: 'Зейн, Билли', wikiEn: 'Billy Zane' },
      { name: 'Кэти Бейтс', wiki: 'Бейтс, Кэти', wikiEn: 'Kathy Bates' },
      { name: 'Билл Пэкстон', wiki: 'Пэкстон, Билл', wikiEn: 'Bill Paxton' },
    ],
  },
  {
    id: 'back-to-the-future',
    title: 'Назад в будущее',
    aliases: ['Back to the Future', 'Назад в будущее 1'],
    cast: [
      { name: 'Майкл Дж. Фокс', wiki: 'Фокс, Майкл Джей', wikiEn: 'Michael J. Fox' },
      { name: 'Кристофер Ллойд', wiki: 'Ллойд, Кристофер', wikiEn: 'Christopher Lloyd' },
      { name: 'Лиа Томпсон', wiki: 'Томпсон, Леа', wikiEn: 'Lea Thompson' },
      { name: 'Криспин Гловер', wiki: 'Гловер, Криспин', wikiEn: 'Crispin Glover' },
      { name: 'Томас Уилсон', wiki: 'Уилсон, Томас Фрэнсис', wikiEn: 'Thomas F. Wilson' },
    ],
  },
  {
    id: 'avengers-endgame',
    title: 'Мстители: Финал',
    aliases: ['Avengers: Endgame', 'Мстители Финал'],
    cast: [
      { name: 'Роберт Дауни мл.', wiki: 'Дауни, Роберт (младший)', wikiEn: 'Robert Downey Jr.' },
      { name: 'Крис Эванс', wiki: 'Эванс, Крис', wikiEn: 'Chris Evans (actor)' },
      { name: 'Скарлетт Йоханссон', wiki: 'Йоханссон, Скарлетт', wikiEn: 'Scarlett Johansson' },
      { name: 'Крис Хемсворт', wiki: 'Хемсворт, Крис', wikiEn: 'Chris Hemsworth' },
      { name: 'Марк Руффало', wiki: 'Руффало, Марк', wikiEn: 'Mark Ruffalo' },
      { name: 'Джереми Реннер', wiki: 'Реннер, Джереми', wikiEn: 'Jeremy Renner' },
    ],
  },
  {
    id: 'gladiator',
    title: 'Гладиатор',
    aliases: ['Gladiator'],
    cast: [
      { name: 'Расселл Кроу', wiki: 'Кроу, Расселл', wikiEn: 'Russell Crowe' },
      { name: 'Хоакин Феникс', wiki: 'Феникс, Хоакин', wikiEn: 'Joaquin Phoenix' },
      { name: 'Конни Нильсен', wiki: 'Нильсен, Конни', wikiEn: 'Connie Nielsen' },
      { name: 'Джимон Хонсу', wiki: 'Хонсу, Джимон', wikiEn: 'Djimon Hounsou' },
      { name: 'Ричард Харрис', wiki: 'Харрис, Ричард', wikiEn: 'Richard Harris' },
    ],
  },
  {
    id: 'fight-club',
    title: 'Бойцовский клуб',
    aliases: ['Fight Club'],
    cast: [
      { name: 'Брэд Питт', wiki: 'Питт, Брэд', wikiEn: 'Brad Pitt' },
      { name: 'Эдвард Нортон', wiki: 'Нортон, Эдвард', wikiEn: 'Edward Norton' },
      { name: 'Хелена Бонэм Картер', wiki: 'Бонэм Картер, Хелена', wikiEn: 'Helena Bonham Carter' },
      { name: 'Джаред Лето', wiki: 'Лето, Джаред', wikiEn: 'Jared Leto' },
    ],
  },
  {
    id: 'dark-knight',
    title: 'Тёмный рыцарь',
    aliases: ['The Dark Knight', 'Темный рыцарь'],
    cast: [
      { name: 'Кристиан Бейл', wiki: 'Бейл, Кристиан', wikiEn: 'Christian Bale' },
      { name: 'Хит Леджер', wiki: 'Леджер, Хит', wikiEn: 'Heath Ledger' },
      { name: 'Аарон Экхарт', wiki: 'Экхарт, Аарон', wikiEn: 'Aaron Eckhart' },
      { name: 'Майкл Кейн', wiki: 'Кейн, Майкл', wikiEn: 'Michael Caine' },
      { name: 'Морган Фриман', wiki: 'Фримен, Морган', wikiEn: 'Morgan Freeman' },
      { name: 'Мэгги Джилленхол', wiki: 'Джилленхол, Мэгги', wikiEn: 'Maggie Gyllenhaal' },
    ],
  },
  {
    id: 'ivan-vasilievich',
    title: 'Иван Васильевич меняет профессию',
    aliases: ['Иван Васильевич', 'Ivan Vasilievich Changes Profession'],
    cast: [
      { name: 'Юрий Яковлев', wiki: 'Яковлев, Юрий Васильевич', wikiEn: 'Yuri Yakovlev' },
      { name: 'Леонид Куравлёв', wiki: 'Куравлёв, Леонид Вячеславович', wikiEn: 'Leonid Kuravlyov' },
      { name: 'Александр Демьяненко', wiki: 'Демьяненко, Александр Сергеевич', wikiEn: 'Aleksandr Demyanenko' },
      { name: 'Савелий Крамаров', wiki: 'Крамаров, Савелий Викторович', wikiEn: 'Savely Kramarov' },
      { name: 'Наталья Селезнёва', wiki: 'Селезнёва, Наталья Игоревна', wikiEn: 'Natalya Selezneva' },
    ],
  },
  {
    id: 'brat',
    title: 'Брат',
    aliases: ['Brat'],
    cast: [
      { name: 'Сергей Бодров мл.', wiki: 'Бодров, Сергей Сергеевич', wikiEn: 'Sergei Bodrov Jr.' },
      { name: 'Виктор Сухоруков', wiki: 'Сухоруков, Виктор Иванович', wikiEn: 'Viktor Sukhorukov' },
      { name: 'Светлана Письмиченко', wiki: 'Письмиченко, Светлана Сергеевна', wikiEn: 'Svetlana Pismichenko' },
      { name: 'Юрий Кузнецов', wiki: 'Кузнецов, Юрий Александрович', wikiEn: 'Yuri Kuznetsov (actor)' },
    ],
  },
  {
    id: 'leon',
    title: 'Леон',
    aliases: ['Léon: The Professional', 'Leon', 'Леон: Киллер'],
    cast: [
      { name: 'Жан Рено', wiki: 'Рено, Жан', wikiEn: 'Jean Reno' },
      { name: 'Натали Портман', wiki: 'Портман, Натали', wikiEn: 'Natalie Portman' },
      { name: 'Гэри Олдмен', wiki: 'Олдмен, Гэри', wikiEn: 'Gary Oldman' },
      { name: 'Дэнни Айелло', wiki: 'Айелло, Дэнни', wikiEn: 'Danny Aiello' },
    ],
  },
  {
    id: 'shrek',
    title: 'Шрек',
    aliases: ['Shrek'],
    cast: [
      { name: 'Майк Майерс', wiki: 'Майерс, Майк', wikiEn: 'Mike Myers' },
      { name: 'Эдди Мёрфи', wiki: 'Мёрфи, Эдди', wikiEn: 'Eddie Murphy' },
      { name: 'Камерон Диас', wiki: 'Диас, Камерон', wikiEn: 'Cameron Diaz' },
      { name: 'Джон Литгоу', wiki: 'Литгоу, Джон', wikiEn: 'John Lithgow' },
    ],
  },
];

const UA = 'QuizDungeonCastFetcher/1.0 (https://178-105-27-2.nip.io)';

async function fetchThumb(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=500&redirects=1&titles=${encodeURIComponent(title)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j?.query?.pages;
    if (!pages) return null;
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p?.thumbnail?.source) return p.thumbnail.source;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function resolveImage(actor) {
  // Try RU first, then EN. Cycle through known title forms.
  const tries = [
    { lang: 'ru', title: actor.wiki },
    { lang: 'en', title: actor.wikiEn },
  ];
  for (const t of tries) {
    if (!t.title) continue;
    const u = await fetchThumb(t.lang, t.title);
    if (u) return u;
  }
  return null;
}

(async () => {
  const out = [];
  for (const movie of MOVIES) {
    const cast = [];
    for (const a of movie.cast) {
      const img = await resolveImage(a);
      if (img) {
        cast.push({ name: a.name, imageUrl: img });
        console.error(`✓ ${movie.title} / ${a.name}: ${img}`);
      } else {
        console.error(`✗ ${movie.title} / ${a.name}: NOT FOUND`);
      }
      await sleep(80); // gentle on Wikipedia
    }
    if (cast.length >= 3) {
      out.push({ id: movie.id, title: movie.title, aliases: movie.aliases, cast });
    } else {
      console.error(`!! Skipped ${movie.title}: only ${cast.length} actors with images`);
    }
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(out, null, 2));
    return;
  }

  // Emit a TypeScript module.
  const lines = [];
  lines.push('// AUTO-GENERATED by scripts/fetch-cast.mjs. Do not edit by hand;');
  lines.push('// re-run the script and overwrite this file if you need new movies.');
  lines.push('//');
  lines.push('// Each movie has a `cast` array of actors with portrait URLs from Wikipedia.');
  lines.push('// In the Petersburg mode, each player is shown a single random actor from the');
  lines.push('// movie\'s cast (no name) and the team must guess the title together.');
  lines.push('');
  lines.push('export interface CastMember {');
  lines.push('  name: string;');
  lines.push('  imageUrl: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface Movie {');
  lines.push('  id: string;');
  lines.push('  title: string;');
  lines.push('  aliases: string[];');
  lines.push('  cast: CastMember[];');
  lines.push('}');
  lines.push('');
  lines.push('export const MOVIES: Movie[] = ' + JSON.stringify(out, null, 2).replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1:') + ';');
  lines.push('');
  lines.push('// Normalize a string for fuzzy comparison: lowercase, strip whitespace and');
  lines.push('// punctuation, replace ё→е, and remove anything that\'s not a letter or digit.');
  lines.push('export function normalizeAnswer(text: string): string {');
  lines.push('  return text');
  lines.push('    .toLowerCase()');
  lines.push('    .replace(/ё/g, \'е\')');
  lines.push('    .replace(/[^a-zа-я0-9]/gi, \'\');');
  lines.push('}');
  lines.push('');
  lines.push('export function answerMatches(text: string, movie: Movie): boolean {');
  lines.push('  const normalized = normalizeAnswer(text);');
  lines.push('  if (!normalized) return false;');
  lines.push('  const candidates = [movie.title, ...movie.aliases];');
  lines.push('  for (const c of candidates) {');
  lines.push('    const n = normalizeAnswer(c);');
  lines.push('    if (!n) continue;');
  lines.push('    if (n === normalized) return true;');
  lines.push('    if (n.length >= 4 && normalized.includes(n)) return true;');
  lines.push('    if (normalized.length >= 4 && n.includes(normalized)) return true;');
  lines.push('  }');
  lines.push('  return false;');
  lines.push('}');
  lines.push('');
  lines.push('export function pickMovies(count: number, exclude: Set<string>): Movie[] {');
  lines.push('  const pool = MOVIES.filter(m => !exclude.has(m.id));');
  lines.push('  const list = pool.length >= count ? pool : MOVIES.slice();');
  lines.push('  for (let i = list.length - 1; i > 0; i--) {');
  lines.push('    const j = Math.floor(Math.random() * (i + 1));');
  lines.push('    [list[i], list[j]] = [list[j], list[i]];');
  lines.push('  }');
  lines.push('  return list.slice(0, count);');
  lines.push('}');
  lines.push('');

  process.stdout.write(lines.join('\n'));
})();
