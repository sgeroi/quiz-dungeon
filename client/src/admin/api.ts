/** Тонкие обёртки над fetch для конструктора. Ошибки возвращаются значением, не исключением. */

export interface ApiResult<T> {
  data?: T;
  error?: string;
}

function isJson(r: Response): boolean {
  return (r.headers.get('content-type') ?? '').includes('application/json');
}

const NOT_JSON = 'API не отвечает JSON — похоже, сервер ещё не обновлён';

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    if (j && typeof j.error === 'string') return j.error;
    if (j && typeof j.message === 'string') return j.message;
  } catch { /* not json */ }
  return `HTTP ${r.status}`;
}

export async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { error: await readError(r) };
    if (!isJson(r)) return { error: NOT_JSON };
    return { data: await r.json() };
  } catch {
    return { error: 'Сервер не отвечает' };
  }
}

export async function apiPost<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) return { error: await readError(r) };
    if (!isJson(r)) return { error: NOT_JSON };
    return { data: await r.json() };
  } catch {
    return { error: 'Сервер не отвечает' };
  }
}

export async function apiDelete(url: string): Promise<ApiResult<void>> {
  try {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) return { error: await readError(r) };
    if (!isJson(r)) return { error: NOT_JSON };
    return {};
  } catch {
    return { error: 'Сервер не отвечает' };
  }
}

let idCounter = 0;
/** Локальный id для новых вопросов/фильмов (сервер может переназначить). */
export function newLocalId(prefix = 'q'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
