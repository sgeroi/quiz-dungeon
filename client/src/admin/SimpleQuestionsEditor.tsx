import { useMemo, useState } from 'react';
import type { GameMode } from '../types';
import type { SimpleQuestion, SimpleQuestionsData } from '../content';
import { INPUT, INPUT_SM, SELECT, TEXTAREA, SectionTitle, IconButton, AddButton, OptionsEditor, EmptyHint, Badge } from './ui';
import { blankQuestion, parseQuestionsImport, simpleFieldsFor } from './packUtils';
import { newLocalId } from './api';

interface Props {
  mode: GameMode;
  data: SimpleQuestionsData;
  onChange: (data: SimpleQuestionsData) => void;
}

const DIFF_LABEL: Record<NonNullable<SimpleQuestion['difficulty']>, string> = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
const DIFF_TONE: Record<NonNullable<SimpleQuestion['difficulty']>, string> = {
  easy: 'bg-[#8DFF85]/15 text-[#8DFF85]',
  medium: 'bg-[var(--color-dungeon-gold)]/15 text-[var(--color-dungeon-gold)]',
  hard: 'bg-[#FF4848]/15 text-[#FF9A9A]',
};

export default function SimpleQuestionsEditor({ mode, data, onChange }: Props) {
  const fields = simpleFieldsFor(mode);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const questions = data.questions;
  const topics = data.topics ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return questions.map((question, index) => ({ question, index }));
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) =>
        question.text.toLowerCase().includes(q) ||
        question.options.some(o => o.toLowerCase().includes(q)) ||
        (question.category ?? '').toLowerCase().includes(q),
      );
  }, [questions, search]);

  const setQuestions = (next: SimpleQuestion[]) => onChange({ ...data, questions: next });

  const updateQ = (index: number, patch: Partial<SimpleQuestion>) => {
    const next = [...questions];
    next[index] = { ...next[index], ...patch };
    setQuestions(next);
  };

  const addQ = () => {
    const q = blankQuestion();
    if (fields.category === 'topics' && topics[0]) q.category = topics[0];
    if (fields.difficulty) q.difficulty = 'medium';
    setQuestions([...questions, q]);
    setExpanded(q.id);
    setSearch('');
  };

  const duplicateQ = (index: number) => {
    const copy: SimpleQuestion = { ...questions[index], id: newLocalId('q'), options: [...questions[index].options] as SimpleQuestion['options'] };
    const next = [...questions];
    next.splice(index + 1, 0, copy);
    setQuestions(next);
    setExpanded(copy.id);
  };

  const deleteQ = (index: number) => {
    const next = [...questions];
    next.splice(index, 1);
    setQuestions(next);
  };

  const importPreview = useMemo(() => parseQuestionsImport(importText, fields), [importText, fields]);

  const applyImport = () => {
    if (importPreview.questions.length === 0) return;
    const imported = importPreview.questions.map(q => {
      if (fields.category === 'topics' && (!q.category || !topics.includes(q.category))) q.category = topics[0];
      if (fields.difficulty && !q.difficulty) q.difficulty = 'medium';
      return q;
    });
    setQuestions([...questions, ...imported]);
    setImportText('');
    setShowImport(false);
  };

  // topics editor (topic-split)
  const updateTopic = (i: number, value: string) => {
    const prev = topics[i];
    const nextTopics = [...topics];
    nextTopics[i] = value;
    // переименовать категорию у вопросов
    const nextQuestions = questions.map(q => (q.category === prev ? { ...q, category: value } : q));
    onChange({ ...data, topics: nextTopics, questions: nextQuestions });
  };

  const formatHint = [
    'Вопрос;вариант1;вариант2;вариант3;вариант4;номер_правильного(1-4)',
    fields.category !== 'none' ? ';категория' : '',
    fields.difficulty ? ';сложность(easy|medium|hard)' : '',
  ].join('');

  return (
    <div className="flex flex-col gap-5">
      {fields.topicsEditor && (
        <section className="glass-panel p-4">
          <SectionTitle>Темы (ровно 4)</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-dungeon-muted)] w-5">{i + 1}.</span>
                <input type="text" value={topics[i] ?? ''} placeholder={`Тема ${i + 1}`} onChange={e => updateTopic(i, e.target.value)} className={INPUT_SM} />
                <span className="text-xs text-white/50 font-medium whitespace-nowrap">
                  {questions.filter(q => q.category === topics[i]).length} вопр.
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          right={
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowImport(v => !v)} className={`btn-secondary py-1.5 px-3.5 text-xs ${showImport ? 'ring-1 ring-[var(--color-dungeon-gold)]' : ''}`}>
                Вставить вопросы
              </button>
              <button type="button" onClick={addQ} className="btn-primary py-1.5 px-3.5 text-xs">+ Вопрос</button>
            </div>
          }
        >
          Вопросы · {questions.length}
        </SectionTitle>

        {showImport && (
          <div className="glass-panel p-4 mb-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="text-xs font-bold text-[var(--color-dungeon-muted)] mb-2">
              По одному вопросу на строку, поля через «;»:
              <code className="block mt-1 text-[11px] text-white/80 break-all">{formatHint}</code>
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={6}
              placeholder={'Столица Франции?;Париж;Лион;Марсель;Ницца;1' + (fields.category !== 'none' ? ';География' : '') + (fields.difficulty ? ';easy' : '')}
              className={TEXTAREA}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <div className="text-xs font-semibold">
                <span className="text-[#8DFF85]">Распознано: {importPreview.questions.length}</span>
                {importPreview.errors.length > 0 && <span className="text-[#FF9A9A] ml-3">Ошибок: {importPreview.errors.length}</span>}
              </div>
              <button type="button" disabled={importPreview.questions.length === 0} onClick={applyImport} className="btn-primary py-1.5 px-4 text-xs">
                Добавить {importPreview.questions.length || ''}
              </button>
            </div>
            {importPreview.errors.length > 0 && (
              <ul className="mt-2 text-[11px] text-[#FF9A9A] font-medium list-disc pl-4 max-h-24 overflow-y-auto">
                {importPreview.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по тексту вопроса или вариантам…"
          className={`${INPUT} mb-3`}
        />

        {questions.length === 0 ? (
          <EmptyHint>Пока нет вопросов. Добавьте вручную или вставьте списком.</EmptyHint>
        ) : filtered.length === 0 ? (
          <EmptyHint>Ничего не найдено по запросу «{search}»</EmptyHint>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(({ question: q, index }) => {
              const open = expanded === q.id;
              const incomplete = !q.text.trim() || q.options.some(o => !o.trim());
              return (
                <div key={q.id} className={`rounded-2xl border transition-colors ${open ? 'border-[var(--color-dungeon-gold)]/50 bg-[var(--color-dungeon-surface-2)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'}`}>
                  <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(open ? null : q.id)}>
                    <span className="text-xs font-bold text-[var(--color-dungeon-muted)] w-7 shrink-0">#{index + 1}</span>
                    <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${q.text ? 'text-white' : 'text-white/40 italic'}`}>
                      {q.text || 'Без текста'}
                    </span>
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                      {incomplete && <Badge tone="pink">не заполнен</Badge>}
                      {q.category && fields.category !== 'none' && <Badge>{q.category}</Badge>}
                      {q.difficulty && fields.difficulty && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${DIFF_TONE[q.difficulty]}`}>{DIFF_LABEL[q.difficulty]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <IconButton title="Дублировать" onClick={() => duplicateQ(index)}>⧉</IconButton>
                      <IconButton title="Удалить" danger onClick={() => deleteQ(index)}>✕</IconButton>
                    </div>
                  </div>
                  {open && (
                    <div className="px-3 pb-3 flex flex-col gap-3 animate-[fadeIn_0.15s_ease-out]">
                      <textarea
                        value={q.text}
                        onChange={e => updateQ(index, { text: e.target.value })}
                        rows={2}
                        placeholder="Текст вопроса"
                        autoFocus
                        className={TEXTAREA}
                      />
                      <OptionsEditor
                        name={`correct-${q.id}`}
                        options={q.options}
                        correctIndex={q.correctIndex}
                        onChange={(options, correctIndex) => updateQ(index, { options, correctIndex })}
                      />
                      {(fields.category !== 'none' || fields.difficulty) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {fields.category === 'free' && (
                            <input type="text" value={q.category ?? ''} placeholder="Категория" onChange={e => updateQ(index, { category: e.target.value || undefined })} className={INPUT_SM} />
                          )}
                          {fields.category === 'topics' && (
                            <select value={q.category ?? ''} onChange={e => updateQ(index, { category: e.target.value || undefined })} className={SELECT}>
                              <option value="">— выберите тему —</option>
                              {topics.map((t, i) => <option key={i} value={t}>{t || `Тема ${i + 1}`}</option>)}
                            </select>
                          )}
                          {fields.difficulty && (
                            <div className="flex gap-1.5">
                              {(['easy', 'medium', 'hard'] as const).map(d => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => updateQ(index, { difficulty: d })}
                                  className={`flex-1 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                    q.difficulty === d ? `${DIFF_TONE[d]} border-current` : 'border-white/10 text-white/50 hover:border-white/30'
                                  }`}
                                >
                                  {DIFF_LABEL[d]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {questions.length > 0 && <div className="mt-3"><AddButton onClick={addQ}>➕ Добавить вопрос</AddButton></div>}
      </section>
    </div>
  );
}
