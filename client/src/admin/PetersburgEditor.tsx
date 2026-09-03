import { useState } from 'react';
import type { PetersburgData, MovieData } from '../content';
import { INPUT, INPUT_SM, SectionTitle, IconButton, AddButton, EmptyHint, Badge } from './ui';
import { blankMovie } from './packUtils';
import { newLocalId } from './api';

interface Props {
  data: PetersburgData;
  onChange: (data: PetersburgData) => void;
}

function ActorPreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (!url.trim()) return <div className="w-14 h-14 rounded-xl bg-white/5 border border-dashed border-white/15 flex items-center justify-center text-white/30 text-xl shrink-0">🎭</div>;
  if (broken) return <div className="w-14 h-14 rounded-xl bg-[#FF4848]/15 border border-[#FF4848]/40 flex items-center justify-center text-[#FF9A9A] text-xs font-bold shrink-0" title="Не удалось загрузить">✕</div>;
  return <img src={url} alt="" onError={() => setBroken(true)} className="w-14 h-14 rounded-xl object-cover shrink-0 bg-black/30" />;
}

export default function PetersburgEditor({ data, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(data.movies.length === 1 ? data.movies[0].id : null);
  const [search, setSearch] = useState('');
  const movies = data.movies;

  const setMovies = (next: MovieData[]) => onChange({ ...data, movies: next });
  const updateMovie = (i: number, patch: Partial<MovieData>) => { const next = [...movies]; next[i] = { ...next[i], ...patch }; setMovies(next); };
  const addMovie = () => { const m = blankMovie(); setMovies([...movies, m]); setOpen(m.id); setSearch(''); };
  const deleteMovie = (i: number) => { const next = [...movies]; next.splice(i, 1); setMovies(next); };
  const duplicateMovie = (i: number) => {
    const m = movies[i];
    const copy: MovieData = { id: newLocalId('m'), title: `${m.title} (копия)`, aliases: [...m.aliases], cast: m.cast.map(c => ({ ...c })) };
    const next = [...movies];
    next.splice(i + 1, 0, copy);
    setMovies(next);
    setOpen(copy.id);
  };

  const q = search.trim().toLowerCase();
  const visible = movies
    .map((movie, index) => ({ movie, index }))
    .filter(({ movie }) => !q || movie.title.toLowerCase().includes(q) || movie.aliases.some(a => a.toLowerCase().includes(q)) || movie.cast.some(c => c.name.toLowerCase().includes(q)));

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle right={<button type="button" onClick={addMovie} className="btn-primary py-1.5 px-3.5 text-xs">+ Фильм</button>}>
        Фильмы · {movies.length}
      </SectionTitle>

      {movies.length > 3 && (
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию или актёру…" className={INPUT} />
      )}

      {movies.length === 0 && <EmptyHint>Пока нет фильмов. Добавьте фильм, варианты названия и актёров с фото.</EmptyHint>}

      {visible.map(({ movie: m, index: i }) => {
        const isOpen = open === m.id;
        return (
          <div key={m.id} className={`rounded-2xl border ${isOpen ? 'border-[var(--color-dungeon-gold)]/50 bg-[var(--color-dungeon-surface-2)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'}`}>
            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setOpen(isOpen ? null : m.id)}>
              <span className="text-xs font-bold text-[var(--color-dungeon-muted)] w-7 shrink-0">#{i + 1}</span>
              <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${m.title ? 'text-white' : 'text-white/40 italic'}`}>{m.title || 'Без названия'}</span>
              <div className="hidden sm:flex -space-x-2 shrink-0">
                {m.cast.slice(0, 5).map((c, k) => c.imageUrl ? <img key={k} src={c.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-[var(--color-dungeon-surface)] bg-black/30" /> : null)}
              </div>
              <Badge>{m.cast.length} акт.</Badge>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <IconButton title="Дублировать" onClick={() => duplicateMovie(i)}>⧉</IconButton>
                <IconButton title="Удалить" danger onClick={() => deleteMovie(i)}>✕</IconButton>
              </div>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 flex flex-col gap-3 animate-[fadeIn_0.15s_ease-out]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="text" value={m.title} placeholder="Название фильма" onChange={e => updateMovie(i, { title: e.target.value })} className={INPUT} autoFocus />
                  <input
                    type="text"
                    defaultValue={m.aliases.join(', ')}
                    key={`al-${m.id}`}
                    placeholder="Другие названия через запятую"
                    onChange={e => updateMovie(i, { aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    className={INPUT}
                    title="Принимаемые варианты ответа"
                  />
                </div>

                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-dungeon-muted)] mb-2">Актёры · {m.cast.length}</div>
                  <div className="flex flex-col gap-2">
                    {m.cast.map((c, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <ActorPreview url={c.imageUrl} />
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-1.5">
                          <input type="text" value={c.name} placeholder="Имя актёра" onChange={e => { const cast = m.cast.map(x => ({ ...x })); cast[k].name = e.target.value; updateMovie(i, { cast }); }} className={INPUT_SM} />
                          <input type="url" value={c.imageUrl} placeholder="https://… ссылка на фото" onChange={e => { const cast = m.cast.map(x => ({ ...x })); cast[k].imageUrl = e.target.value; updateMovie(i, { cast }); }} className={INPUT_SM} />
                        </div>
                        <IconButton title="Удалить" danger onClick={() => { const cast = [...m.cast]; cast.splice(k, 1); updateMovie(i, { cast }); }}>✕</IconButton>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <AddButton onClick={() => updateMovie(i, { cast: [...m.cast, { name: '', imageUrl: '' }] })}>➕ Актёр</AddButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {movies.length > 0 && <AddButton onClick={addMovie}>➕ Добавить фильм</AddButton>}
    </div>
  );
}
