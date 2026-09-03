import type { GameState } from '../types';
import TeamBadge from './TeamBadge';
import { rankedPlayers, rankedTeams, scoresOf, teamScoresOf } from './classicTeams';

const MEDALS = ['🥇', '🥈', '🥉'];

interface Props {
  gameState: GameState;
  playerId: string;
}

/**
 * Compact standings for the player screen (classic RPG mode).
 * teams — every team: badge, monster HP bar, score (own team highlighted).
 * ffa   — personal score + rank and the top of the leaderboard.
 * coop  — renders nothing.
 */
export default function ScoreStrip({ gameState: gs, playerId }: Props) {
  const mode = gs.teamMode ?? 'coop';
  if (mode === 'coop') return null;

  if (mode === 'teams') {
    const teams = rankedTeams(gs);
    const scores = teamScoresOf(gs);
    const myTeamId = gs.players[playerId]?.teamId;
    if (teams.length === 0) return null;
    return (
      <div className="grid gap-1.5 mb-2" style={{ gridTemplateColumns: `repeat(${Math.min(teams.length, 4)}, minmax(0, 1fr))` }} data-testid="score-strip-teams">
        {teams.map((t) => {
          const tb = gs.teamBattle?.[t.id];
          const hpPct = tb && tb.monsterMaxHp > 0 ? Math.max(0, Math.min(100, (tb.monsterHp / tb.monsterMaxHp) * 100)) : 0;
          const mine = t.id === myTeamId;
          return (
            <div
              key={t.id}
              className={`rounded-xl px-2 py-1.5 border ${mine ? 'ring-1' : ''}`}
              style={{ backgroundColor: `${t.color}${mine ? '26' : '12'}`, borderColor: `${t.color}${mine ? 'aa' : '44'}`, ['--tw-ring-color' as string]: t.color }}
            >
              <div className="flex items-center justify-between gap-1">
                <TeamBadge team={t} size="sm" iconOnly={teams.length > 2} />
                <span className="font-black tabular-nums text-sm" style={{ color: t.color }}>{scores[t.id] ?? 0}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-black/40 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${tb?.floorCleared ? 'bg-gray-500' : 'bg-gradient-to-r from-red-600 to-red-400'}`} style={{ width: `${hpPct}%` }} />
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5 tabular-nums">
                {tb?.floorCleared ? '💀 повержен' : tb ? `👹 ${tb.monsterHp}/${tb.monsterMaxHp}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ffa
  const ranked = rankedPlayers(gs);
  const scores = scoresOf(gs);
  const myRank = ranked.findIndex((p) => p.id === playerId);
  const top = ranked.slice(0, 3);
  return (
    <div className="glass-panel rounded-xl px-3 py-2 mb-2 flex items-center gap-3" data-testid="score-strip-ffa">
      <div className="shrink-0">
        <div className="text-[10px] uppercase text-gray-500 font-bold">Мои очки</div>
        <div className="text-lg font-black text-[var(--color-dungeon-gold)] leading-none tabular-nums">
          {scores[playerId] ?? 0}
          <span className="text-xs text-gray-400 font-bold ml-1">#{myRank + 1}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {top.map((p, i) => (
          <div key={p.id} className={`flex items-center justify-between text-xs ${p.id === playerId ? 'text-[var(--color-dungeon-gold)]' : 'text-gray-300'}`}>
            <span className="truncate">{MEDALS[i]} {p.name}</span>
            <span className="font-bold tabular-nums ml-2">{scores[p.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
