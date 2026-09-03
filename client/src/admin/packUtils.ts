import type { GameMode } from '../types';
import type {
  ContentData, ContentPack, SimpleQuestion, SimpleQuestionsData, JeopardyData, JeopardyCellData,
  BucketsData, BucketSetData, PetersburgData, MovieData,
} from '../content';
import { CONTENT_KIND_BY_MODE } from '../content';
import { newLocalId } from './api';

export const JEOPARDY_VALUES = [100, 200, 300, 400, 500] as const;

/** Какие доп. поля вопроса нужны режиму. */
export interface SimpleFieldsConfig {
  category: 'none' | 'free' | 'topics';
  difficulty: boolean;
  topicsEditor: boolean;
}

export const SIMPLE_FIELDS_BY_MODE: Partial<Record<GameMode, SimpleFieldsConfig>> = {
  'classic':     { category: 'free',   difficulty: true,  topicsEditor: false },
  'millionaire': { category: 'none',   difficulty: true,  topicsEditor: false },
  'speed':       { category: 'free',   difficulty: false, topicsEditor: false },
  'topic-split': { category: 'topics', difficulty: false, topicsEditor: true },
  'spy':         { category: 'none',   difficulty: false, topicsEditor: false },
  'rpg-rewards': { category: 'none',   difficulty: false, topicsEditor: false },
};

export function simpleFieldsFor(mode: GameMode): SimpleFieldsConfig {
  return SIMPLE_FIELDS_BY_MODE[mode] ?? { category: 'none', difficulty: false, topicsEditor: false };
}

// ─── Blank builders ─────────────────────────────────────────────

export function blankQuestion(): SimpleQuestion {
  return { id: newLocalId('q'), text: '', options: ['', '', '', ''], correctIndex: 0 };
}

export function blankJeopardyCell(value: number): JeopardyCellData {
  return { value, text: '', options: ['', '', '', ''], correctIndex: 0 };
}

export function blankJeopardyData(): JeopardyData {
  const topics = ['Тема 1', 'Тема 2', 'Тема 3', 'Тема 4', 'Тема 5'];
  const cells: Record<string, JeopardyCellData[]> = {};
  for (const t of topics) cells[t] = JEOPARDY_VALUES.map(blankJeopardyCell);
  return { kind: 'jeopardy', topics, cells };
}

export function blankBucketSet(): BucketSetData {
  return {
    title: '',
    buckets: [
      { name: '', emoji: '🟥' },
      { name: '', emoji: '🟩' },
      { name: '', emoji: '🟦' },
      { name: '', emoji: '🟨' },
    ],
    items: [],
  };
}

export function blankMovie(): MovieData {
  return { id: newLocalId('m'), title: '', aliases: [], cast: [] };
}

export function blankDataFor(mode: GameMode): ContentData {
  const kind = CONTENT_KIND_BY_MODE[mode];
  switch (kind) {
    case 'simple': {
      const d: SimpleQuestionsData = { kind: 'simple', questions: [] };
      if (mode === 'topic-split') d.topics = ['Тема 1', 'Тема 2', 'Тема 3', 'Тема 4'];
      return d;
    }
    case 'jeopardy': return blankJeopardyData();
    case 'buckets': return { kind: 'buckets', sets: [] } satisfies BucketsData;
    case 'petersburg': return { kind: 'petersburg', movies: [] } satisfies PetersburgData;
  }
}

export function blankPack(mode: GameMode): ContentPack {
  const now = new Date().toISOString();
  return { id: '', mode, name: '', builtin: false, data: blankDataFor(mode), createdAt: now, updatedAt: now };
}

// ─── Validation (зеркало серверных правил из content.ts) ────────

function checkFourOptions(prefix: string, options: unknown, correctIndex: unknown, errors: string[]) {
  if (!Array.isArray(options) || options.length !== 4) {
    errors.push(`${prefix}: должно быть ровно 4 варианта`);
    return;
  }
  options.forEach((o, i) => {
    if (typeof o !== 'string' || !o.trim()) errors.push(`${prefix}: вариант ${i + 1} пустой`);
  });
  if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3 || !Number.isInteger(correctIndex)) {
    errors.push(`${prefix}: не выбран правильный ответ`);
  }
}

export function validatePack(pack: ContentPack): string[] {
  const errors: string[] = [];
  if (!pack.name.trim()) errors.push('Укажите название набора');
  const expectedKind = CONTENT_KIND_BY_MODE[pack.mode];
  if (pack.data.kind !== expectedKind) errors.push(`Тип контента ${pack.data.kind} не подходит режиму ${pack.mode}`);

  const d = pack.data;
  if (d.kind === 'simple') {
    const topics = d.topics;
    if (pack.mode === 'topic-split') {
      if (!topics || topics.length !== 4) errors.push('Для «Тем по группам» нужно ровно 4 темы');
      else topics.forEach((t, i) => { if (!t.trim()) errors.push(`Тема ${i + 1} пустая`); });
    }
    d.questions.forEach((q, i) => {
      const p = `Вопрос ${i + 1}`;
      if (!q.text.trim()) errors.push(`${p}: пустой текст`);
      checkFourOptions(p, q.options, q.correctIndex, errors);
      if (pack.mode === 'topic-split' && topics && (!q.category || !topics.includes(q.category))) {
        errors.push(`${p}: тема не выбрана`);
      }
    });
  } else if (d.kind === 'jeopardy') {
    if (d.topics.length !== 5) errors.push('Нужно ровно 5 тем');
    const seen = new Set<string>();
    d.topics.forEach((t, i) => {
      if (!t.trim()) errors.push(`Тема ${i + 1} пустая`);
      if (seen.has(t)) errors.push(`Тема «${t}» повторяется`);
      seen.add(t);
      const cells = d.cells[t];
      if (!cells || cells.length !== 5) { errors.push(`Тема «${t || i + 1}»: должно быть 5 ячеек`); return; }
      cells.forEach((c, j) => {
        const p = `«${t}» за ${c.value}`;
        if (c.value !== JEOPARDY_VALUES[j]) errors.push(`${p}: неверная стоимость (ожидается ${JEOPARDY_VALUES[j]})`);
        if (!c.text.trim()) errors.push(`${p}: пустой текст`);
        checkFourOptions(p, c.options, c.correctIndex, errors);
      });
    });
  } else if (d.kind === 'buckets') {
    d.sets.forEach((s, i) => {
      const p = `Набор ${i + 1}${s.title ? ` «${s.title}»` : ''}`;
      if (!s.title.trim()) errors.push(`${p}: пустое название`);
      if (s.buckets.length !== 4) errors.push(`${p}: должно быть ровно 4 корзины`);
      s.buckets.forEach((b, j) => { if (!b.name.trim()) errors.push(`${p}: корзина ${j + 1} без названия`); });
      if (s.items.length === 0) errors.push(`${p}: нет предметов`);
      s.items.forEach((it, j) => {
        if (!it.text.trim()) errors.push(`${p}: предмет ${j + 1} пустой`);
        if (it.bucket < 0 || it.bucket > 3) errors.push(`${p}: предмет ${j + 1} — корзина вне 0..3`);
      });
    });
  } else if (d.kind === 'petersburg') {
    d.movies.forEach((m, i) => {
      const p = `Фильм ${i + 1}${m.title ? ` «${m.title}»` : ''}`;
      if (!m.title.trim()) errors.push(`${p}: пустое название`);
      if (m.cast.length === 0) errors.push(`${p}: нет актёров`);
      m.cast.forEach((c, j) => {
        if (!c.name.trim()) errors.push(`${p}: актёр ${j + 1} без имени`);
        if (!c.imageUrl.trim()) errors.push(`${p}: актёр ${j + 1} без фото`);
      });
    });
  }
  return errors;
}

export function packItemCount(data: ContentData): number {
  switch (data.kind) {
    case 'simple': return data.questions.length;
    case 'jeopardy': return data.topics.reduce((n, t) => n + (data.cells[t]?.filter(c => c.text.trim()).length ?? 0), 0);
    case 'buckets': return data.sets.length;
    case 'petersburg': return data.movies.length;
  }
}

// ─── Import / export ─────────────────────────────────────────────

const DIFFS: SimpleQuestion['difficulty'][] = ['easy', 'medium', 'hard'];

/**
 * Построчный формат: Вопрос;в1;в2;в3;в4;номер_правильного(1-4)[;категория][;сложность]
 * Возвращает распознанные вопросы и список ошибок по строкам.
 */
export function parseQuestionsImport(text: string, fields: SimpleFieldsConfig): { questions: SimpleQuestion[]; errors: string[] } {
  const questions: SimpleQuestion[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(';').map(s => s.trim());
    if (parts.length < 6) { errors.push(`Строка ${idx + 1}: нужно минимум 6 полей, найдено ${parts.length}`); return; }
    const [text, o1, o2, o3, o4, correctRaw, ...rest] = parts;
    const correct = Number(correctRaw);
    if (!text) { errors.push(`Строка ${idx + 1}: пустой вопрос`); return; }
    if (![o1, o2, o3, o4].every(Boolean)) { errors.push(`Строка ${idx + 1}: пустой вариант ответа`); return; }
    if (!Number.isInteger(correct) || correct < 1 || correct > 4) { errors.push(`Строка ${idx + 1}: номер правильного должен быть 1-4`); return; }
    const q: SimpleQuestion = {
      id: newLocalId('q'),
      text,
      options: [o1, o2, o3, o4],
      correctIndex: (correct - 1) as 0 | 1 | 2 | 3,
    };
    // Остаток: категория и/или сложность в любом порядке.
    for (const extra of rest) {
      if (!extra) continue;
      const low = extra.toLowerCase();
      if (fields.difficulty && (DIFFS as string[]).includes(low)) q.difficulty = low as SimpleQuestion['difficulty'];
      else if (fields.category !== 'none' && !q.category) q.category = extra;
    }
    questions.push(q);
  });
  return { questions, errors };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return (name || 'pack').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
}
