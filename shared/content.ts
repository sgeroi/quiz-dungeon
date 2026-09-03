/**
 * Контент-паки — редактируемые наборы вопросов для всех режимов.
 * Хранятся на сервере в server/data/content.json, редактируются в конструкторе (#/admin).
 * Каждый режим читает выбранный пак (state.contentPacks[mode]) или дефолтный (builtin).
 */
import type { GameMode } from './types.ts';

/** Обычный вопрос с 4 вариантами. Используется в: classic, millionaire, speed, spy, topic-split, rpg-rewards. */
export interface SimpleQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  /** classic: категория; topic-split: тема (одна из pack.topics); speed: категория. */
  category?: string;
  /** classic + millionaire. */
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface SimpleQuestionsData {
  kind: 'simple';
  /** topic-split: список тем (4 шт.), вопросы группируются по category. Для остальных режимов не используется. */
  topics?: string[];
  questions: SimpleQuestion[];
}

/** Сетка «Своей игры»: темы × стоимости 100..500. Используется в: jeopardy (mode 'jeopardy'; старые jeopardy-comp/jeopardy-coop мигрируются в него). */
export interface JeopardyCellData {
  value: number; // 100, 200, 300, 400, 500
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

export interface JeopardyData {
  kind: 'jeopardy';
  topics: string[]; // ровно 5 тем
  /** cells[topic] — 5 ячеек, отсортированы по value. */
  cells: Record<string, JeopardyCellData[]>;
}

/** Наборы «Сортировки»: 4 корзины + предметы. */
export interface BucketSetData {
  title: string;
  buckets: { name: string; emoji: string }[]; // ровно 4
  items: { text: string; bucket: number }[]; // bucket 0..3
}

export interface BucketsData {
  kind: 'buckets';
  sets: BucketSetData[];
}

/** Фильмы «Санкт-Петербурга»: фильм + актёры с фото. */
export interface MovieData {
  id: string;
  title: string;
  aliases: string[];
  cast: { name: string; imageUrl: string }[];
}

export interface PetersburgData {
  kind: 'petersburg';
  movies: MovieData[];
}

export type ContentData = SimpleQuestionsData | JeopardyData | BucketsData | PetersburgData;

export interface ContentPack {
  id: string;
  mode: GameMode;
  name: string;
  /** builtin = встроенный дефолт, его нельзя удалить (но можно редактировать и сбросить). */
  builtin: boolean;
  data: ContentData;
  createdAt: string;
  updatedAt: string;
}

/** Какой kind контента у какого режима. */
export const CONTENT_KIND_BY_MODE: Record<GameMode, ContentData['kind']> = {
  'classic': 'simple',
  'millionaire': 'simple',
  'jeopardy': 'jeopardy',
  'topic-split': 'simple',
  'jeopardy-comp': 'jeopardy',
  'jeopardy-coop': 'jeopardy',
  'speed': 'simple',
  'lastman': 'simple',
  'petersburg': 'petersburg',
  'buckets': 'buckets',
  'rpg-rewards': 'simple',
  'spy': 'simple',
};

/** Лёгкая карточка пака для списков (без data). */
export interface ContentPackSummary {
  id: string;
  mode: GameMode;
  name: string;
  builtin: boolean;
  /** Кол-во вопросов / ячеек / наборов / фильмов — для отображения. */
  itemCount: number;
  updatedAt: string;
}

/*
 * REST API (server/src/index.ts):
 *   GET    /api/content?mode=<mode>      -> ContentPackSummary[] (все паки режима; без mode — всех режимов)
 *   GET    /api/content/:id              -> ContentPack
 *   POST   /api/content                  -> ContentPack   body: { id?, mode, name, data }  (id есть = обновить, нет = создать)
 *   POST   /api/content/:id/duplicate    -> ContentPack   (копия пака с именем «… (копия)»)
 *   POST   /api/content/:id/reset        -> ContentPack   (только builtin: вернуть заводской контент)
 *   DELETE /api/content/:id              -> { success }   (builtin удалить нельзя -> 400)
 *
 * Socket (лобби):
 *   'set-content-pack' (mode: GameMode, packId: string | null)  — только хост; null = дефолтный (builtin)
 *   GameState.contentPacks?: Partial<Record<GameMode, string>>   — выбранные паки комнаты
 *   'game-state' рассылается после изменения.
 */
