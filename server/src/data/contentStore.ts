/**
 * Content pack store — editable question sets for every game mode.
 * Persisted in server/data/content.json (see shared/content.ts for the contract).
 * On first run, a builtin pack is seeded for every mode from the static TS data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import type { GameMode } from '../../../shared/types.ts';
import {
  CONTENT_KIND_BY_MODE,
  type ContentPack,
  type ContentData,
  type ContentPackSummary,
  type SimpleQuestion,
  type SimpleQuestionsData,
  type JeopardyData,
  type JeopardyCellData,
  type BucketsData,
  type PetersburgData,
} from '../../../shared/content.ts';

import { QUESTIONS } from './questions.ts';
import { MILLIONAIRE_QUESTIONS } from '../modes/millionaire/questions.ts';
import { SPEED_QUESTIONS } from '../modes/speed/questions.ts';
import { SPY_QUESTIONS } from '../modes/spy/questions.ts';
import { RPGR_QUESTIONS } from '../modes/rpg-rewards/questions.ts';
import { TOPICS, TOPIC_QUESTIONS } from '../modes/topic-split/questions.ts';
import { JEOPARDY_GRID } from '../modes/jeopardy-comp/grid.ts';
import { JCOOP_GRID, JCOOP_TOPICS, JCOOP_VALUES } from '../modes/jeopardy-coop/grid.ts';
import { BUCKET_SETS } from '../modes/buckets/sets.ts';
import { MOVIES } from '../modes/petersburg/movies.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');

export const ALL_MODES = Object.keys(CONTENT_KIND_BY_MODE) as GameMode[];
export const BUILTIN_NAME = 'Стандартный набор';

export function builtinId(mode: GameMode): string {
  return `builtin-${mode}`;
}

// ---------------------------------------------------------------------------
// Builtin seeding from static TS sources
// ---------------------------------------------------------------------------

function opts4(options: string[]): [string, string, string, string] {
  const o = [...options];
  while (o.length < 4) o.push('');
  return [o[0], o[1], o[2], o[3]];
}

function ci(idx: number): 0 | 1 | 2 | 3 {
  return (Math.max(0, Math.min(3, Math.floor(idx))) as 0 | 1 | 2 | 3);
}

export function buildBuiltinData(mode: GameMode): ContentData {
  switch (mode) {
    case 'classic': {
      const data: SimpleQuestionsData = {
        kind: 'simple',
        questions: QUESTIONS.map((q) => ({
          id: q.id,
          text: q.text,
          options: opts4(q.options),
          correctIndex: ci(q.correctIndex),
          category: q.category,
          difficulty: q.difficulty,
        })),
      };
      return data;
    }
    case 'millionaire': {
      const data: SimpleQuestionsData = {
        kind: 'simple',
        questions: MILLIONAIRE_QUESTIONS.map((q) => ({
          id: q.id,
          text: q.text,
          options: opts4(q.options),
          correctIndex: ci(q.correctIndex),
          difficulty: q.difficulty,
        })),
      };
      return data;
    }
    case 'speed': {
      const data: SimpleQuestionsData = {
        kind: 'simple',
        questions: SPEED_QUESTIONS.map((q) => ({
          id: q.id,
          text: q.text,
          options: opts4(q.options),
          correctIndex: ci(q.correctIndex),
          category: q.category,
        })),
      };
      return data;
    }
    case 'spy': {
      const data: SimpleQuestionsData = {
        kind: 'simple',
        questions: SPY_QUESTIONS.map((q) => ({
          id: q.id,
          text: q.text,
          options: opts4(q.options),
          correctIndex: ci(q.correctIndex),
        })),
      };
      return data;
    }
    case 'rpg-rewards': {
      const data: SimpleQuestionsData = {
        kind: 'simple',
        questions: RPGR_QUESTIONS.map((q) => ({
          id: q.id,
          text: q.text,
          options: opts4(q.options),
          correctIndex: ci(q.correctIndex),
        })),
      };
      return data;
    }
    case 'topic-split': {
      const questions: SimpleQuestion[] = [];
      for (const topic of TOPICS) {
        for (const q of TOPIC_QUESTIONS[topic]) {
          questions.push({
            id: q.id,
            text: q.text,
            options: opts4(q.options),
            correctIndex: ci(q.correctIndex),
            category: topic,
          });
        }
      }
      const data: SimpleQuestionsData = { kind: 'simple', topics: [...TOPICS], questions };
      return data;
    }
    case 'jeopardy-comp': {
      const cells: Record<string, JeopardyCellData[]> = {};
      for (const topic of JEOPARDY_GRID.topics) {
        cells[topic] = JEOPARDY_GRID.cells[topic].map((c) => ({
          value: c.value,
          text: c.text,
          options: opts4(c.options),
          correctIndex: ci(c.correctIndex),
        }));
      }
      const data: JeopardyData = { kind: 'jeopardy', topics: [...JEOPARDY_GRID.topics], cells };
      return data;
    }
    case 'jeopardy-coop': {
      const cells: Record<string, JeopardyCellData[]> = {};
      for (const topic of JCOOP_TOPICS) {
        cells[topic] = JCOOP_VALUES.map((value) => {
          const q = JCOOP_GRID[topic][value];
          return {
            value,
            text: q.text,
            options: opts4(q.options),
            correctIndex: ci(q.correctIndex),
          };
        });
      }
      const data: JeopardyData = { kind: 'jeopardy', topics: [...JCOOP_TOPICS], cells };
      return data;
    }
    case 'buckets': {
      const data: BucketsData = {
        kind: 'buckets',
        sets: BUCKET_SETS.map((s) => ({
          title: s.title,
          buckets: s.buckets.map((b) => ({ name: b.name, emoji: b.emoji })),
          items: s.items.map((it) => ({ text: it.text, bucket: it.bucket })),
        })),
      };
      return data;
    }
    case 'petersburg': {
      const data: PetersburgData = {
        kind: 'petersburg',
        movies: MOVIES.map((m) => ({
          id: m.id,
          title: m.title,
          aliases: [...m.aliases],
          cast: m.cast.map((c) => ({ name: c.name, imageUrl: c.imageUrl })),
        })),
      };
      return data;
    }
  }
}

function buildBuiltinPack(mode: GameMode): ContentPack {
  const now = new Date().toISOString();
  return {
    id: builtinId(mode),
    mode,
    name: BUILTIN_NAME,
    builtin: true,
    data: buildBuiltinData(mode),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writePacks(packs: ContentPack[]): void {
  ensureDataDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(packs, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

function readPacks(): ContentPack[] {
  ensureDataDir();
  let packs: ContentPack[] = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) packs = parsed as ContentPack[];
    } catch (err) {
      console.error('[contentStore] Failed to read content.json, reseeding builtins:', err);
      packs = [];
    }
  }
  // Make sure every mode has its builtin pack (first run, or a mode added later).
  let changed = false;
  for (const mode of ALL_MODES) {
    if (!packs.some((p) => p.id === builtinId(mode))) {
      packs.push(buildBuiltinPack(mode));
      changed = true;
    }
  }
  if (changed) writePacks(packs);
  return packs;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class ContentValidationError extends Error {}

function fail(msg: string): never {
  throw new ContentValidationError(msg);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateOptions(options: unknown, where: string): [string, string, string, string] {
  if (!Array.isArray(options) || options.length !== 4) fail(`${where}: нужно ровно 4 варианта ответа`);
  for (const o of options) {
    if (typeof o !== 'string') fail(`${where}: варианты ответа должны быть строками`);
  }
  return [options[0], options[1], options[2], options[3]];
}

function validateCorrectIndex(idx: unknown, where: string): 0 | 1 | 2 | 3 {
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx > 3) {
    fail(`${where}: correctIndex должен быть 0..3`);
  }
  return idx as 0 | 1 | 2 | 3;
}

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function normalizeSimple(mode: GameMode, raw: any): SimpleQuestionsData {
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) fail('Нужен хотя бы один вопрос');
  const questions: SimpleQuestion[] = raw.questions.map((q: any, i: number) => {
    const where = `Вопрос ${i + 1}`;
    if (!q || typeof q !== 'object') fail(`${where}: неверный формат`);
    if (!isNonEmptyString(q.text)) fail(`${where}: пустой текст`);
    const out: SimpleQuestion = {
      id: isNonEmptyString(q.id) ? q.id : nanoid(8),
      text: q.text,
      options: validateOptions(q.options, where),
      correctIndex: validateCorrectIndex(q.correctIndex, where),
    };
    if (q.category !== undefined && q.category !== null && q.category !== '') {
      if (typeof q.category !== 'string') fail(`${where}: категория должна быть строкой`);
      out.category = q.category;
    }
    if (q.difficulty !== undefined && q.difficulty !== null && q.difficulty !== '') {
      if (!DIFFICULTIES.has(q.difficulty)) fail(`${where}: сложность должна быть easy/medium/hard`);
      out.difficulty = q.difficulty;
    }
    return out;
  });

  const data: SimpleQuestionsData = { kind: 'simple', questions };

  if (raw.topics !== undefined && raw.topics !== null) {
    if (!Array.isArray(raw.topics)) fail('topics должен быть массивом строк');
    const topics = raw.topics.map((t: unknown) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean) as string[];
    if (new Set(topics).size !== topics.length) fail('Темы не должны повторяться');
    data.topics = topics;
  }

  if (mode === 'topic-split') {
    if (!data.topics || data.topics.length < 2) fail('Для режима «Темы по группам» нужно минимум 2 темы');
    for (const t of data.topics) {
      if (!questions.some((q) => q.category === t)) fail(`Тема «${t}» без вопросов`);
    }
  }

  // Ensure ids are unique within the pack.
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) q.id = nanoid(8);
    seen.add(q.id);
  }
  return data;
}

function normalizeJeopardy(raw: any): JeopardyData {
  if (!Array.isArray(raw.topics) || raw.topics.length !== 5) fail('Нужно ровно 5 тем');
  const topics: string[] = raw.topics.map((t: unknown) => (typeof t === 'string' ? t.trim() : ''));
  if (topics.some((t) => !t)) fail('Название темы не может быть пустым');
  if (new Set(topics).size !== 5) fail('Темы не должны повторяться');
  if (!raw.cells || typeof raw.cells !== 'object') fail('Отсутствует сетка вопросов (cells)');
  const cells: Record<string, JeopardyCellData[]> = {};
  for (const topic of topics) {
    const arr = raw.cells[topic];
    if (!Array.isArray(arr) || arr.length !== 5) fail(`Тема «${topic}»: нужно ровно 5 вопросов`);
    cells[topic] = arr.map((c: any, i: number) => {
      const where = `«${topic}», вопрос ${i + 1}`;
      if (!c || typeof c !== 'object') fail(`${where}: неверный формат`);
      const value = typeof c.value === 'number' && Number.isFinite(c.value) ? c.value : (i + 1) * 100;
      if (!isNonEmptyString(c.text)) fail(`${where}: пустой текст`);
      return {
        value,
        text: c.text,
        options: validateOptions(c.options, where),
        correctIndex: validateCorrectIndex(c.correctIndex, where),
      };
    });
    cells[topic].sort((a, b) => a.value - b.value);
  }
  return { kind: 'jeopardy', topics, cells };
}

function normalizeBuckets(raw: any): BucketsData {
  if (!Array.isArray(raw.sets) || raw.sets.length === 0) fail('Нужен хотя бы один набор');
  const sets = raw.sets.map((s: any, i: number) => {
    const where = `Набор ${i + 1}`;
    if (!s || typeof s !== 'object') fail(`${where}: неверный формат`);
    if (!isNonEmptyString(s.title)) fail(`${where}: пустое название`);
    if (!Array.isArray(s.buckets) || s.buckets.length !== 4) fail(`${where}: нужно ровно 4 корзины`);
    const buckets = s.buckets.map((b: any, bi: number) => {
      if (!b || !isNonEmptyString(b.name)) fail(`${where}: корзина ${bi + 1} без названия`);
      return { name: b.name, emoji: typeof b.emoji === 'string' ? b.emoji : '' };
    });
    if (!Array.isArray(s.items) || s.items.length === 0) fail(`${where}: нужен хотя бы один предмет`);
    const items = s.items.map((it: any, ii: number) => {
      if (!it || !isNonEmptyString(it.text)) fail(`${where}: предмет ${ii + 1} без текста`);
      if (typeof it.bucket !== 'number' || !Number.isInteger(it.bucket) || it.bucket < 0 || it.bucket > 3) {
        fail(`${where}: предмет «${it.text}» — корзина должна быть 0..3`);
      }
      return { text: it.text, bucket: it.bucket };
    });
    return { title: s.title, buckets, items };
  });
  return { kind: 'buckets', sets };
}

function normalizePetersburg(raw: any): PetersburgData {
  if (!Array.isArray(raw.movies) || raw.movies.length === 0) fail('Нужен хотя бы один фильм');
  const seen = new Set<string>();
  const movies = raw.movies.map((m: any, i: number) => {
    const where = `Фильм ${i + 1}`;
    if (!m || typeof m !== 'object') fail(`${where}: неверный формат`);
    if (!isNonEmptyString(m.title)) fail(`${where}: пустое название`);
    if (!Array.isArray(m.cast) || m.cast.length === 0) fail(`${where} («${m.title}»): нужен хотя бы один актёр`);
    const cast = m.cast.map((c: any, ci2: number) => {
      if (!c || !isNonEmptyString(c.name)) fail(`«${m.title}»: актёр ${ci2 + 1} без имени`);
      return { name: c.name, imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : '' };
    });
    const aliases = Array.isArray(m.aliases) ? m.aliases.filter((a: unknown) => typeof a === 'string') : [];
    let id = isNonEmptyString(m.id) ? m.id : nanoid(8);
    if (seen.has(id)) id = nanoid(8);
    seen.add(id);
    return { id, title: m.title, aliases, cast };
  });
  return { kind: 'petersburg', movies };
}

/** Validate + normalize incoming pack data for the given mode. Throws ContentValidationError. */
export function validateContentData(mode: GameMode, data: unknown): ContentData {
  const expected = CONTENT_KIND_BY_MODE[mode];
  if (!expected) fail(`Неизвестный режим: ${mode}`);
  if (!data || typeof data !== 'object') fail('Отсутствует data');
  const raw = data as any;
  if (raw.kind !== expected) fail(`Для режима ${mode} ожидается kind="${expected}", получен "${raw.kind}"`);
  switch (expected) {
    case 'simple': return normalizeSimple(mode, raw);
    case 'jeopardy': return normalizeJeopardy(raw);
    case 'buckets': return normalizeBuckets(raw);
    case 'petersburg': return normalizePetersburg(raw);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function itemCount(data: ContentData): number {
  switch (data.kind) {
    case 'simple': return data.questions.length;
    case 'jeopardy': return Object.values(data.cells).reduce((n, arr) => n + arr.length, 0);
    case 'buckets': return data.sets.length;
    case 'petersburg': return data.movies.length;
  }
}

export function toSummary(pack: ContentPack): ContentPackSummary {
  return {
    id: pack.id,
    mode: pack.mode,
    name: pack.name,
    builtin: pack.builtin,
    itemCount: itemCount(pack.data),
    updatedAt: pack.updatedAt,
  };
}

export function listPacks(mode?: GameMode): ContentPackSummary[] {
  const packs = readPacks().filter((p) => !mode || p.mode === mode);
  // Builtin first, then by name.
  packs.sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
  return packs.map(toSummary);
}

export function getPack(id: string): ContentPack | undefined {
  return readPacks().find((p) => p.id === id);
}

export function savePack(input: { id?: string; mode: GameMode; name?: string; data: unknown }): ContentPack {
  if (!input || typeof input !== 'object') fail('Пустое тело запроса');
  if (!ALL_MODES.includes(input.mode)) fail(`Неизвестный режим: ${String(input.mode)}`);
  const data = validateContentData(input.mode, input.data);
  const name = isNonEmptyString(input.name) ? input.name.trim().slice(0, 120) : '';
  const packs = readPacks();
  const now = new Date().toISOString();

  if (input.id) {
    const idx = packs.findIndex((p) => p.id === input.id);
    if (idx >= 0) {
      const existing = packs[idx];
      if (existing.mode !== input.mode) fail('Нельзя сменить режим у существующего пака');
      const updated: ContentPack = {
        ...existing,
        name: name || existing.name,
        data,
        updatedAt: now,
      };
      packs[idx] = updated;
      writePacks(packs);
      return updated;
    }
  }

  const created: ContentPack = {
    id: input.id && !input.id.startsWith('builtin-') ? input.id : nanoid(10),
    mode: input.mode,
    name: name || 'Новый набор',
    builtin: false,
    data,
    createdAt: now,
    updatedAt: now,
  };
  packs.push(created);
  writePacks(packs);
  return created;
}

export function duplicatePack(id: string): ContentPack | undefined {
  const packs = readPacks();
  const src = packs.find((p) => p.id === id);
  if (!src) return undefined;
  const now = new Date().toISOString();
  const copy: ContentPack = {
    id: nanoid(10),
    mode: src.mode,
    name: `${src.name} (копия)`,
    builtin: false,
    data: JSON.parse(JSON.stringify(src.data)) as ContentData,
    createdAt: now,
    updatedAt: now,
  };
  packs.push(copy);
  writePacks(packs);
  return copy;
}

/** Rebuild a builtin pack from the static TS sources. Returns undefined if not found / not builtin. */
export function resetPack(id: string): ContentPack | undefined {
  const packs = readPacks();
  const idx = packs.findIndex((p) => p.id === id);
  if (idx < 0) return undefined;
  const existing = packs[idx];
  if (!existing.builtin) return undefined;
  const fresh: ContentPack = {
    ...existing,
    name: BUILTIN_NAME,
    data: buildBuiltinData(existing.mode),
    updatedAt: new Date().toISOString(),
  };
  packs[idx] = fresh;
  writePacks(packs);
  return fresh;
}

export type DeleteResult = 'deleted' | 'not-found' | 'builtin';

export function deletePack(id: string): DeleteResult {
  const packs = readPacks();
  const existing = packs.find((p) => p.id === id);
  if (!existing) return 'not-found';
  if (existing.builtin) return 'builtin';
  writePacks(packs.filter((p) => p.id !== id));
  return 'deleted';
}

/**
 * Resolve the pack a room should play with: the chosen one (if it exists and
 * matches the mode), otherwise the builtin pack for the mode.
 */
export function getPackForMode(mode: GameMode, packId?: string | null): ContentPack {
  const packs = readPacks();
  if (packId) {
    const chosen = packs.find((p) => p.id === packId && p.mode === mode);
    if (chosen) return chosen;
  }
  const builtin = packs.find((p) => p.id === builtinId(mode));
  if (builtin) return builtin;
  // Should never happen (readPacks seeds builtins), but stay safe.
  return buildBuiltinPack(mode);
}

/** Typed helpers so handlers don't have to narrow the union themselves. */
export function getSimpleData(mode: GameMode, packId?: string | null): SimpleQuestionsData {
  const pack = getPackForMode(mode, packId);
  if (pack.data.kind === 'simple') return pack.data;
  return buildBuiltinData(mode) as SimpleQuestionsData;
}

export function getJeopardyData(mode: GameMode, packId?: string | null): JeopardyData {
  const pack = getPackForMode(mode, packId);
  if (pack.data.kind === 'jeopardy') return pack.data;
  return buildBuiltinData(mode) as JeopardyData;
}

export function getBucketsData(packId?: string | null): BucketsData {
  const pack = getPackForMode('buckets', packId);
  if (pack.data.kind === 'buckets') return pack.data;
  return buildBuiltinData('buckets') as BucketsData;
}

export function getPetersburgData(packId?: string | null): PetersburgData {
  const pack = getPackForMode('petersburg', packId);
  if (pack.data.kind === 'petersburg') return pack.data;
  return buildBuiltinData('petersburg') as PetersburgData;
}
