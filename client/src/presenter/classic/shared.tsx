// Shared building blocks for GameLoop-based TV presenters (classic, rpg-rewards).
// Everything here reads only room-broadcast data. The correct answer is taken
// exclusively from gameState.lastResults (set by the server after reveal);
// floors[].question is deliberately never read.
import { useEffect, useMemo, useState } from 'react';
import { socket } from '../../socket';
import { useStore } from '../../store';
import { GAME_MODES } from '../../types';
import type { Floor, GameState, Monster, PerkId, Player, RoundResult } from '../../types';
import { CLASS_DEFS } from '../../classData';
import { PresenterTimer } from '../DefaultPresenter';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const PERK_LABELS: Record<PerkId, { name: string; emoji: string; description: string }> = {
  'sharp-blade': { name: 'Острый клинок', emoji: '🗡️', description: '+10 к урону каждого правильного ответа' },
  'life-elixir': { name: 'Эликсир жизни', emoji: '💚', description: 'Восстанавливает HP до полного' },
  'shield':      { name: 'Щит',           emoji: '🛡️', description: 'Поглощает один удар' },
  'speed':       { name: 'Скорость',      emoji: '⚡', description: 'Быстрый правильный ответ — +30% урона' },
  'luck':        { name: 'Удача',         emoji: '🍀', description: '+10% к урону команды на следующий раунд' },
  'fury':        { name: 'Ярость',        emoji: '🔥', description: 'Следующий правильный ответ — x2 урон' },
  'revive':      { name: 'Возрождение',   emoji: '💀', description: 'Воскрешает павшего товарища (50% HP)' },
  'wisdom':      { name: 'Мудрость',      emoji: '📖', description: 'Убирает один неверный вариант' },
};

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

export interface ChainLogEntry {
  playerId: string;
  correct: boolean;
}

/** Room-broadcast chain results for the current floor (reset on floor-start). */
export function useChainLog(): ChainLogEntry[] {
  const [log, setLog] = useState<ChainLogEntry[]>([]);
  useEffect(() => {
    const onResult = (playerId: string, correct: boolean) => setLog((l) => [...l, { playerId, correct }]);
    const onFloor = () => setLog([]);
    socket.on('chain-result', onResult);
    socket.on('floor-start', onFloor);
    return () => {
      socket.off('chain-result', onResult);
      socket.off('floor-start', onFloor);
    };
  }, []);
  return log;
}

export interface LoopView {
  gs: GameState;
  floor: Floor | undefined;
  monster: Monster | null | undefined;
  players: Player[];
  alive: Player[];
  results: RoundResult | null;
  captainId: string | null;
  sacrificeId: string | null;
  chainPlayerId: string | null;
  isChain: boolean;
  isPersonal: boolean;
  /** Correct option index — only available after reveal, never for chain/personal floors. */
  reveal: number | null;
  isResults: boolean;
  isAnswering: boolean;
}

export function useLoopView(gs: GameState): LoopView {
  const storeCaptain = useStore((s) => s.captainId);
  const storeSacrifice = useStore((s) => s.sacrificePlayerId);
  const chainTurn = useStore((s) => s.chainTurn);

  return useMemo(() => {
    const floor = gs.floors?.[gs.currentFloor - 1];
    const params = floor?.params;
    const players = Object.values(gs.players);
    const isChain = params?.whoAnswers === 'chain';
    const isPersonal = params?.questionScope === 'personal';
    const isResults = gs.phase === 'results';
    const isAnswering = gs.phase === 'answering' || gs.phase === 'question';
    const results = gs.lastResults ?? null;
    const reveal =
      isResults && results && !isChain && !isPersonal && gs.currentQuestion && typeof results.correctIndex === 'number'
        ? results.correctIndex
        : null;
    return {
      gs,
      floor,
      monster: floor?.monster,
      players,
      alive: players.filter((p) => p.isAlive),
      results,
      captainId: gs.captainId ?? storeCaptain ?? null,
      sacrificeId: gs.sacrificePlayerId ?? storeSacrifice ?? null,
      chainPlayerId: gs.chainCurrentPlayer ?? chainTurn?.playerId ?? null,
      isChain,
      isPersonal,
      reveal,
      isResults,
      isAnswering,
    };
  }, [gs, storeCaptain, storeSacrifice, chainTurn]);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function monsterSpriteUrl(m: Monster): string {
  return `/sprites/monsters/${m.name.toLowerCase().replace(/[\s-]/g, '_')}.png`;
}

export function modeTitle(gs: GameState): string {
  const info = GAME_MODES.find((m) => m.id === (gs.gameMode ?? 'classic')) ?? GAME_MODES[0];
  return `${info.emoji} ${info.name}`;
}

/** Human-readable "who answers" label for a floor. */
export function whoAnswersLabel(v: LoopView): { icon: string; text: string } {
  const p = v.floor?.params;
  if (!p) return { icon: '❔', text: '' };
  if (v.isPersonal) return { icon: '🎯', text: 'У каждого свой вопрос' };
  switch (p.whoAnswers) {
    case 'captain': {
      const c = v.captainId ? v.gs.players[v.captainId] : null;
      return { icon: '👑', text: c ? `Отвечает капитан — ${c.name}` : 'Отвечает капитан' };
    }
    case 'sacrifice': {
      const s = v.sacrificeId ? v.gs.players[v.sacrificeId] : null;
      return { icon: '💀', text: s ? `Жертва — ${s.name}. Один за всех` : 'Один герой отвечает за всех' };
    }
    case 'chain': {
      const c = v.chainPlayerId ? v.gs.players[v.chainPlayerId] : null;
      return { icon: '🔗', text: c ? `Цепочка — ход ${c.name}` : 'Цепочка — по очереди' };
    }
    default:
      return { icon: '👥', text: 'Отвечают все' };
  }
}

function SpriteImg({ src, fallback, className }: { src: string; fallback: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return <span className={className}>{fallback}</span>;
  return <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className={className} />;
}

// ---------------------------------------------------------------------------
// Screens / panels
// ---------------------------------------------------------------------------

export function PreparingScreen({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center px-16">
      <div className="text-[36px] font-bold uppercase tracking-[0.3em] text-[var(--color-dungeon-muted)]">{title}</div>
      <div className="text-[96px] leading-none font-black text-[var(--color-dungeon-gold)] animate-pulse">Готовимся…</div>
      {subtitle && <div className="text-[30px] font-semibold text-white/70 max-w-[1200px]">{subtitle}</div>}
    </div>
  );
}

/** Top strip: floor counter, round mechanic, who answers, timer. */
export function LoopHeader({ v, showTimer }: { v: LoopView; showTimer: boolean }) {
  const { gs, floor } = v;
  const params = floor?.params;
  const who = whoAnswersLabel(v);
  return (
    <div className="flex items-start justify-between gap-10">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-5">
          <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">{modeTitle(gs)}</div>
          <FloorDots current={gs.currentFloor} total={gs.totalFloors} floors={gs.floors} />
        </div>
        <div className="flex items-baseline gap-6 mt-1">
          <div className="text-[54px] leading-none font-black text-[var(--color-dungeon-gold)] whitespace-nowrap">
            Этаж {gs.currentFloor}<span className="text-white/40 text-[36px]"> / {gs.totalFloors}</span>
          </div>
          {params && (
            <div className="min-w-0">
              <div className="text-[40px] leading-none font-black truncate">{params.emoji} {params.name}</div>
              <div className="text-[24px] font-semibold text-white/70 leading-tight mt-1 truncate">{params.description}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mt-3">
          <span className="inline-flex items-center gap-3 rounded-full bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] px-6 py-2 text-[26px] font-extrabold">
            <span>{who.icon}</span>{who.text}
          </span>
          {params?.commsBlocked && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-[22px] font-bold text-white/80">🔇 Связь глушится</span>
          )}
          {params?.speedScaling && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-[22px] font-bold text-white/80">⚡ Бонус за скорость</span>
          )}
          {params?.bet && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-[22px] font-bold text-white/80">🎲 Ставка капитана</span>
          )}
        </div>
      </div>
      {showTimer && <PresenterTimer timer={gs.timer} maxTimer={gs.maxTimer} />}
    </div>
  );
}

function FloorDots({ current, total, floors }: { current: number; total: number; floors: Floor[] }) {
  if (!total) return null;
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = floors?.[i]?.isCompleted && n < current;
        const isBoss = floors?.[i]?.isBoss || floors?.[i]?.monster?.isBoss;
        const cls =
          n === current
            ? 'bg-[var(--color-dungeon-gold)] shadow-[0_0_14px_rgba(255,219,16,0.8)]'
            : done || n < current
              ? 'bg-[var(--color-dungeon-heal)]/70'
              : 'bg-white/15';
        return <span key={n} className={`rounded-full ${isBoss ? 'w-5 h-5' : 'w-4 h-4'} ${cls}`} />;
      })}
    </div>
  );
}

/** Big monster card with HP bar; shows damage numbers in the results phase. */
export function MonsterPanel({ v }: { v: LoopView }) {
  const m = v.monster;
  if (!m) return null;
  const hpPct = Math.max(0, Math.min(1, m.currentHp / Math.max(1, m.maxHp)));
  const r = v.isResults ? v.results : null;
  const defeated = m.currentHp <= 0;
  return (
    <div className={`glass-panel-gold relative flex flex-col items-center gap-3 px-8 py-5 h-full min-h-0 overflow-hidden ${m.isBoss ? 'neon-pink' : ''}`}>
      {m.isBoss && (
        <span className="absolute top-5 left-6 rounded-full bg-[var(--color-dungeon-accent)] px-5 py-1.5 text-[20px] font-black uppercase tracking-widest">БОСС</span>
      )}
      <div className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Противник</div>
      <div className={`relative flex-1 min-h-[120px] max-h-[300px] w-full flex items-center justify-center transition-all duration-700 ${defeated ? 'grayscale opacity-30 rotate-12' : ''}`}>
        <SpriteImg
          src={monsterSpriteUrl(m)}
          fallback={m.emoji}
          className="h-full max-h-[300px] max-w-[300px] object-contain text-[160px] leading-none drop-shadow-[0_0_30px_rgba(255,60,174,0.35)] animate-[monsterIdle_2s_ease-in-out_infinite]"
        />
        {r && r.damageDealt > 0 && (
          <div className="absolute -top-2 right-0 text-[64px] font-black text-[var(--color-dungeon-gold)] drop-shadow-[0_0_20px_rgba(255,219,16,0.7)] animate-[fadeIn_0.4s_ease-out]">
            −{r.damageDealt}
          </div>
        )}
      </div>
      <div className={`${m.name.length > 12 ? 'text-[32px]' : 'text-[40px]'} font-black text-center leading-tight shrink-0`}>{m.name}</div>
      <div className="w-full shrink-0">
        <div className="flex justify-between text-[22px] font-bold text-white/80 tabular-nums mb-1">
          <span>HP</span>
          <span>{m.currentHp} / {m.maxHp}</span>
        </div>
        <div className="hp-bar w-full h-7 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#FF4848] to-[#FF3CAE] transition-[width] duration-700" style={{ width: `${hpPct * 100}%` }} />
        </div>
      </div>
      <div className="text-[22px] font-bold text-white/60 shrink-0">⚔️ Атака {m.attack}</div>
      {r?.monsterDefeated && (
        <div className="text-[36px] font-black text-[var(--color-dungeon-heal)] animate-[fadeIn_0.4s_ease-out]">Повержен!</div>
      )}
    </div>
  );
}

/** Question + options with reveal and (after reveal) who picked what. */
export function QuestionPanel({ v }: { v: LoopView }) {
  const { gs, reveal } = v;
  const q = gs.currentQuestion;
  if (!q) return null;
  const answers = v.isResults && !v.isChain ? v.results?.playerAnswers ?? null : null;
  const byOption = useMemo(() => {
    const map: Record<number, Player[]> = {};
    if (!answers) return map;
    for (const [pid, idx] of Object.entries(answers)) {
      if (idx === null || idx === undefined) continue;
      const p = gs.players[pid];
      if (!p) continue;
      (map[idx] ??= []).push(p);
    }
    return map;
  }, [answers, gs.players]);

  const long = q.text.length > 120;
  return (
    <div className="flex flex-col gap-7 h-full min-h-0">
      {q.category && (
        <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-purple)]">{q.category}</div>
      )}
      <div className={`${long ? 'text-[40px]' : 'text-[50px]'} font-extrabold leading-[1.15]`}>{q.text}</div>
      <div className="grid grid-cols-2 gap-5 mt-auto">
        {q.options.map((opt, i) => {
          const isCorrect = reveal !== null && reveal === i;
          const dim = reveal !== null && !isCorrect;
          const pickers = byOption[i] ?? [];
          return (
            <div
              key={i}
              className={`flex flex-col gap-2 rounded-3xl px-7 py-4 border transition-all ${
                isCorrect
                  ? 'bg-[var(--color-dungeon-heal)]/20 border-[var(--color-dungeon-heal)] shadow-[0_0_40px_rgba(141,255,133,0.35)]'
                  : dim
                    ? 'bg-white/[0.03] border-white/5 opacity-50'
                    : 'bg-white/[0.06] border-white/10'
              }`}
            >
              <div className="flex items-center gap-5">
                <span className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl text-[30px] font-black ${isCorrect ? 'bg-[var(--color-dungeon-heal)] text-[#06301a]' : 'bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]'}`}>
                  {OPTION_LETTERS[i] ?? i + 1}
                </span>
                <span className="text-[32px] font-bold leading-tight">{opt}</span>
              </div>
              {pickers.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-[80px]">
                  {pickers.map((p) => (
                    <span key={p.id} className={`rounded-full px-3 py-1 text-[18px] font-bold ${isCorrect ? 'bg-[var(--color-dungeon-heal)]/30 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/25 text-[#FF9A9A]'}`}>
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Everyone gets their own question" floor — no shared text to show. */
export function PersonalRoundPanel({ v }: { v: LoopView }) {
  const { alive } = v;
  const answered = alive.filter((p) => p.currentAnswer !== null && p.currentAnswer !== undefined).length;
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
      <div className="text-[120px] leading-none">🎯</div>
      <div className="text-[52px] font-black leading-tight">У каждого героя — свой вопрос</div>
      <div className="text-[30px] font-semibold text-white/70 max-w-[900px]">
        Вопросы на телефонах. Ошибся — теряешь HP, ответил верно — бьёшь монстра.
      </div>
      {v.isAnswering && (
        <div className="text-[40px] font-black text-[var(--color-dungeon-gold)] mt-4">
          Ответили {answered} из {alive.length}
        </div>
      )}
    </div>
  );
}

/** Chain floor: current player, question, history of the chain. */
export function ChainPanel({ v, log }: { v: LoopView; log: ChainLogEntry[] }) {
  const { gs } = v;
  const cur = v.chainPlayerId ? gs.players[v.chainPlayerId] : null;
  const q = gs.currentQuestion;
  const queueLeft = gs.chainQueue?.length ?? 0;
  const last = log[log.length - 1];
  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <div className="flex items-center gap-6">
        <div className="text-[26px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Сейчас отвечает</div>
        {cur ? (
          <div className="flex items-center gap-4 rounded-full bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)] px-8 py-3 text-[36px] font-black">
            <ClassIcon player={cur} size={44} />
            {cur.name}
            {cur.streak > 0 && <span className="text-[26px] font-extrabold">🔥{cur.streak}</span>}
          </div>
        ) : (
          <div className="text-[36px] font-black text-white/50">…</div>
        )}
        <div className="ml-auto text-[24px] font-bold text-white/60">Осталось вопросов: {queueLeft + (cur ? 1 : 0)}</div>
      </div>
      {q ? (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="text-[44px] font-extrabold leading-[1.15]">{q.text}</div>
          <div className="grid grid-cols-2 gap-4">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-4 rounded-3xl px-6 py-4 border bg-white/[0.06] border-white/10">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-[26px] font-black bg-[var(--color-dungeon-gold)] text-[var(--color-dungeon-gold-fg)]">
                  {OPTION_LETTERS[i] ?? i + 1}
                </span>
                <span className="text-[28px] font-bold leading-tight">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[40px] font-black text-white/50">Следующий вопрос…</div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[22px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] mr-2">Цепочка</span>
        {log.length === 0 && <span className="text-[22px] text-white/40 font-semibold">ещё никто не отвечал</span>}
        {log.map((e, i) => {
          const p = gs.players[e.playerId];
          const isLast = i === log.length - 1;
          return (
            <span
              key={i}
              className={`rounded-full px-4 py-1.5 text-[22px] font-extrabold ${e.correct ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/25 text-[#FF9A9A]'} ${isLast ? 'ring-2 ring-white/60' : ''}`}
            >
              {e.correct ? '✅' : '❌'} {p?.name ?? '?'}
            </span>
          );
        })}
        {last && (
          <span className="ml-auto text-[26px] font-black">
            {gs.players[last.playerId]?.name ?? '?'} — {last.correct ? <span className="text-[var(--color-dungeon-heal)]">верно!</span> : <span className="text-[#FF9A9A]">ошибка, −15 HP</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/** Results strip: damage dealt / taken / defeated / fallen. */
export function RoundSummary({ v }: { v: LoopView }) {
  const r = v.results;
  if (!r) return null;
  const { gs } = v;
  const params = v.floor?.params;
  const fallen = r.playersHit.map((id) => gs.players[id]).filter((p) => p && !p.isAlive);
  const hit = r.playersHit.map((id) => gs.players[id]).filter(Boolean);
  const nobodyRight = !v.isChain && r.damageDealt === 0;
  let headline: string;
  if (r.monsterDefeated) headline = v.monster ? `${v.monster.name} повержен!` : 'Этаж пройден!';
  else if (params?.whoAnswers === 'sacrifice') headline = r.damageDealt > 0 ? 'Жертва справилась!' : 'Жертва пала…';
  else if (nobodyRight) headline = 'Никто не ответил верно';
  else headline = 'Раунд сыгран';
  return (
    <div className="glass-panel flex items-center gap-10 px-8 py-4 animate-[fadeIn_0.3s_ease-out]">
      <div className={`text-[40px] font-black whitespace-nowrap ${r.monsterDefeated ? 'text-[var(--color-dungeon-heal)]' : nobodyRight ? 'text-[#FF9A9A]' : 'text-[var(--color-dungeon-gold)]'}`}>
        {headline}
      </div>
      <Stat icon="⚔️" label="Урон монстру" value={r.damageDealt} color="text-[var(--color-dungeon-gold)]" />
      <Stat icon="💥" label="Урон команде" value={r.damageTaken} color="text-[#FF9A9A]" />
      {hit.length > 0 && (
        <div className="min-w-0">
          <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Под удар</div>
          <div className="text-[24px] font-bold truncate">{hit.map((p) => p!.name).join(', ')}</div>
        </div>
      )}
      {fallen.length > 0 && (
        <div className="ml-auto rounded-full bg-[#FF4848]/20 text-[#FF9A9A] px-6 py-2 text-[26px] font-black whitespace-nowrap">
          💀 Пали: {fallen.map((p) => p!.name).join(', ')}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[36px]">{icon}</span>
      <div>
        <div className="text-[18px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)] whitespace-nowrap">{label}</div>
        <div className={`text-[36px] font-black leading-none tabular-nums ${color}`}>{value}</div>
      </div>
    </div>
  );
}

export function ClassIcon({ player, size }: { player: Player; size: number }) {
  const def = player.playerClass ? CLASS_DEFS[player.playerClass] : null;
  if (!def) return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{player.isBot ? '🤖' : '🧑'}</span>;
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-white/10 overflow-hidden shrink-0" style={{ width: size, height: size }}>
      {def.sprite ? (
        <SpriteImg src={def.sprite} fallback={def.emoji} className="w-full h-full object-cover object-top" />
      ) : (
        <span style={{ fontSize: size * 0.6 }}>{def.emoji}</span>
      )}
    </span>
  );
}

/** Team board: every player with class, HP, status, streak, perks. */
export function TeamBoard({ v, showPerks }: { v: LoopView; showPerks?: boolean }) {
  const { gs, players } = v;
  const params = v.floor?.params;
  const r = v.isResults ? v.results : null;
  const cols = Math.min(4, Math.max(1, players.length));
  const rows = Math.ceil(players.length / cols);
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {players.map((p) => {
        const hpPct = p.maxPersonalHp > 0 ? Math.max(0, Math.min(1, p.personalHp / p.maxPersonalHp)) : 0;
        const def = p.playerClass ? CLASS_DEFS[p.playerClass] : null;
        const isCaptain = params?.whoAnswers === 'captain' && p.id === v.captainId;
        const isSacrifice = params?.whoAnswers === 'sacrifice' && p.id === v.sacrificeId;
        const isChainTurn = v.isChain && p.id === v.chainPlayerId && gs.phase === 'chain-turn';
        const mustAnswer =
          v.isAnswering && p.isAlive && (params?.whoAnswers === 'everyone' || isCaptain || isSacrifice);
        const answered = p.currentAnswer !== null && p.currentAnswer !== undefined;
        const wasHit = r ? r.playersHit.includes(p.id) : false;
        const dmg = r?.playerDamage?.[p.id];
        const answeredRight = r && !v.isChain && (v.isPersonal ? (dmg ?? 0) > 0 : r.playerAnswers[p.id] === r.correctIndex);
        const participated = r && (params?.whoAnswers === 'everyone' || p.id === v.captainId || p.id === v.sacrificeId) && !v.isChain;
        const highlight = isCaptain || isSacrifice || isChainTurn;
        return (
          <div
            key={p.id}
            className={`relative glass-panel px-5 flex flex-col gap-2 transition-all ${rows > 1 ? 'py-2' : 'py-3'} ${!p.isAlive ? 'opacity-40 grayscale' : ''} ${highlight ? 'ring-2 ring-[var(--color-dungeon-gold)] shadow-[0_0_30px_rgba(255,219,16,0.25)]' : ''} ${wasHit && p.isAlive ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
          >
            <div className="flex items-center gap-3">
              <ClassIcon player={p} size={rows > 1 ? 40 : 52} />
              <div className="min-w-0 flex-1">
                <div className="text-[28px] font-extrabold truncate leading-tight">
                  {isCaptain && '👑 '}{isSacrifice && '💀 '}{isChainTurn && '🔗 '}{p.name}
                </div>
                <div className="text-[18px] font-bold text-[var(--color-dungeon-muted)] truncate leading-tight">
                  {def ? def.nameRu : p.isBot ? 'Бот' : 'Герой'}
                  {p.streak > 1 && <span className="text-[#FFB020]"> · 🔥{p.streak}</span>}
                  {typeof p.betAmount === 'number' && p.betAmount > 0 && <span className="text-[var(--color-dungeon-gold)]"> · ставка {p.betAmount}</span>}
                </div>
              </div>
              {!p.isAlive ? (
                <span className="text-[30px]">💀</span>
              ) : r && participated ? (
                <span className={`rounded-full px-3 py-1 text-[20px] font-extrabold ${answeredRight ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-[#FF4848]/25 text-[#FF9A9A]'}`}>
                  {answeredRight ? (typeof dmg === 'number' && dmg > 0 ? `+${dmg}` : 'верно') : 'мимо'}
                </span>
              ) : mustAnswer ? (
                <span className={`rounded-full px-3 py-1 text-[18px] font-extrabold ${answered ? 'bg-[var(--color-dungeon-heal)]/25 text-[var(--color-dungeon-heal)]' : 'bg-white/5 text-white/40'}`}>
                  {answered ? 'ответил' : 'думает…'}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${hpPct > 0.5 ? 'bg-[var(--color-dungeon-heal)]' : hpPct > 0.25 ? 'bg-[#FFB020]' : 'bg-[#FF4848]'}`}
                  style={{ width: `${hpPct * 100}%` }}
                />
              </div>
              <span className="text-[18px] font-bold text-white/70 tabular-nums w-[84px] text-right">{p.personalHp}/{p.maxPersonalHp}</span>
            </div>
            {showPerks && p.perks && p.perks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 -mt-1">
                {p.perks.map((perk, i) => {
                  const l = PERK_LABELS[perk.id];
                  return (
                    <span key={i} title={l?.name} className="rounded-full bg-[var(--color-dungeon-purple)]/20 text-[var(--color-dungeon-purple)] px-2.5 py-0.5 text-[17px] font-bold whitespace-nowrap">
                      {l?.emoji ?? '🎁'} {l?.name ?? perk.id}{perk.charges > 1 ? ` ×${perk.charges}` : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Floor intro: mechanic explanation + monster reveal. Shown for ~6 s. */
export function FloorIntro({ v }: { v: LoopView }) {
  const { gs, floor, monster } = v;
  if (!floor) return null;
  const { params } = floor;
  const who = whoAnswersLabel(v);
  return (
    <div className="h-full flex flex-col gap-8 p-10 animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-center justify-between">
        <div className="text-[26px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">{modeTitle(gs)}</div>
        <FloorDots current={gs.currentFloor} total={gs.totalFloors} floors={gs.floors} />
      </div>
      <div className="flex-1 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-12 items-center">
        <div className="flex flex-col gap-6">
          <div className="text-[36px] font-bold uppercase tracking-widest text-[var(--color-dungeon-gold)]">
            Этаж {gs.currentFloor} из {gs.totalFloors}{monster?.isBoss ? ' · БОСС' : ''}
          </div>
          <div className="text-[96px] leading-[1] font-black">{params.emoji} {params.name}</div>
          <div className="text-[40px] font-semibold text-white/85 leading-snug">{params.description}</div>
          <div className="flex flex-col gap-3 mt-2">
            <Rule icon={who.icon} text={who.text} />
            <Rule icon="⏱️" text={`${params.timeLimit} секунд на ответ`} />
            {params.commsBlocked && <Rule icon="🔇" text="Связь глушится — обсуждать нельзя" />}
            {params.speedScaling && <Rule icon="⚡" text="Чем быстрее ответ — тем сильнее удар" />}
            {params.bet && <Rule icon="🎲" text="Капитан делает ставку: больше риск — больше урон" />}
            {params.damageMode === 'wrong-only' && <Rule icon="🎯" text="Урон получают только ошибившиеся" />}
          </div>
        </div>
        {monster && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-[24px] font-bold uppercase tracking-widest text-[var(--color-dungeon-muted)]">Вас ждёт</div>
            <SpriteImg
              src={monsterSpriteUrl(monster)}
              fallback={monster.emoji}
              className="max-h-[440px] max-w-[440px] object-contain text-[280px] leading-none drop-shadow-[0_0_40px_rgba(255,60,174,0.45)] animate-[float_3s_ease-in-out_infinite]"
            />
            <div className="text-[56px] font-black text-center leading-tight">{monster.name}</div>
            <div className="text-[28px] font-bold text-white/70">❤️ {monster.maxHp} HP · ⚔️ атака {monster.attack}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Rule({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-4 text-[30px] font-bold">
      <span className="w-[56px] text-center text-[36px]">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

/** Final screen (victory / defeat). ScreenView normally renders its own, kept for completeness. */
export function FinalScreen({ v }: { v: LoopView }) {
  const { gs, players } = v;
  const isVictory = gs.phase === 'victory';
  const alive = players.filter((p) => p.isAlive).length;
  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 p-10 text-center">
      <div className="text-[140px] leading-none">{isVictory ? '🏆' : '💀'}</div>
      <div className={`text-[120px] leading-none font-black ${isVictory ? 'text-[var(--color-dungeon-gold)]' : 'text-[#FF4848]'}`}>
        {isVictory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
      </div>
      <div className="text-[36px] font-semibold text-white/70">
        {isVictory ? 'Подземелье покорено!' : 'Тьма поглотила героев…'} Этажей пройдено {isVictory ? gs.totalFloors : gs.currentFloor}/{gs.totalFloors} · выжили {alive}/{players.length}
      </div>
      <div className="w-full max-w-[1600px]">
        <TeamBoard v={v} showPerks />
      </div>
    </div>
  );
}

/** The standard battle layout: header, monster + centre panel, summary, team board. */
export function BattleLayout({ v, centre, showPerks }: { v: LoopView; centre: React.ReactNode; showPerks?: boolean }) {
  return (
    <div className="h-full flex flex-col gap-5 p-10 pt-4">
      <LoopHeader v={v} showTimer={v.isAnswering || v.gs.phase === 'chain-turn'} />
      <div className="flex-1 min-h-0 grid grid-cols-[400px_minmax(0,1fr)] gap-8 overflow-hidden">
        <MonsterPanel v={v} />
        <div className="min-h-0 flex flex-col gap-5 overflow-hidden">
          <div className="flex-1 min-h-0">{centre}</div>
          {v.isResults && <RoundSummary v={v} />}
        </div>
      </div>
      <TeamBoard v={v} showPerks={showPerks} />
    </div>
  );
}
