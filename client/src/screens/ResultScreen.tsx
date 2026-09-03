import { useStore } from '../store';
import { TEAM_MODE_INFO } from '../types';
import type { Player, Team } from '../types';
import TeamBadge from '../components/TeamBadge';
import { pickScores, teamTotals } from '../presenter/DefaultPresenter';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultScreen() {
  const { gameState, gameOver } = useStore();
  if (!gameState) return null;

  const isVictory = gameState.phase === 'victory';
  const players = Object.values(gameState.players);
  const alive = players.filter(p => p.isAlive).length;

  const stats = gameOver?.stats;
  const teamMode = stats?.teamMode ?? gameState.teamMode ?? 'coop';
  const teams: Team[] = gameState.teams ?? [];

  // ---- teams: table by teamScores ----
  const teamScores = teamMode === 'teams' && teams.length > 0 ? (stats?.teamScores ?? teamTotals(gameState)) : null;
  const teamRows = teamScores
    ? teams.slice().sort((a, b) => (teamScores[b.id] ?? 0) - (teamScores[a.id] ?? 0))
    : null;
  const winnerTeamId = teamRows ? (stats?.winnerTeamId ?? teamRows[0]?.id) : undefined;
  const winnerTeam = winnerTeamId ? teams.find((t) => t.id === winnerTeamId) : undefined;

  // ---- ffa: table by scores ----
  const scores = teamMode === 'ffa' ? (stats?.scores ?? pickScores(gameState)) : null;
  const scoreRows: Player[] | null = scores
    ? players.slice().sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
    : null;
  const winnerPlayerId = scoreRows ? (stats?.winnerPlayerId ?? scoreRows[0]?.id) : undefined;
  const winnerPlayer = winnerPlayerId ? gameState.players[winnerPlayerId] : undefined;

  const hasTable = !!teamRows || !!scoreRows;
  const title = winnerTeam
    ? `Победили ${winnerTeam.name}!`
    : winnerPlayer
      ? `Победил ${winnerPlayer.name}!`
      : isVictory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
  const positive = hasTable || isVictory;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto relative">
      {/* Background glow */}
      <div className={`absolute inset-0 ${positive ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,197,24,0.05),transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.05),transparent_70%)]'}`} />

      <div className="relative flex flex-col items-center w-full">
        {/* Icon */}
        <div className="relative mb-4">
          <div className={`absolute inset-0 blur-3xl rounded-full ${positive ? 'bg-[var(--color-dungeon-gold)]/20' : 'bg-red-500/20'}`} />
          <span className="relative text-8xl animate-[float_3s_ease-in-out_infinite] drop-shadow-lg">
            {winnerTeam ? winnerTeam.emoji : positive ? '🏆' : '💀'}
          </span>
        </div>

        <h1
          className={`text-3xl sm:text-4xl font-black mb-2 text-center leading-tight ${
            winnerTeam ? '' : positive ? 'bg-gradient-to-r from-[var(--color-dungeon-gold)] via-amber-300 to-[var(--color-dungeon-gold)] bg-clip-text text-transparent' : 'text-red-400'
          }`}
          style={winnerTeam ? { color: winnerTeam.color } : undefined}
        >
          {title}
        </h1>
        <p className="text-gray-500 text-sm mb-6 text-center">
          {hasTable
            ? `${TEAM_MODE_INFO[teamMode].emoji} ${TEAM_MODE_INFO[teamMode].name}`
            : isVictory ? 'Подземелье покорено!' : 'Тьма поглотила героев...'}
        </p>

        {/* Teams table */}
        {teamRows && teamScores && (
          <div className="w-full flex flex-col gap-2 mb-6" data-testid="result-teams">
            {teamRows.map((t, i) => {
              const members = players.filter((p) => p.teamId === t.id);
              const isWinner = t.id === winnerTeamId;
              return (
                <div
                  key={t.id}
                  className="rounded-2xl p-3 border"
                  style={{ backgroundColor: `${t.color}${isWinner ? '2b' : '12'}`, borderColor: isWinner ? t.color : `${t.color}55` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-7 text-center">{MEDALS[i] ?? `${i + 1}.`}</span>
                    <TeamBadge team={t} size="md" />
                    <span className="ml-auto text-2xl font-black tabular-nums" style={{ color: t.color }}>{teamScores[t.id] ?? 0}</span>
                  </div>
                  <div className="mt-1.5 pl-10 text-xs font-semibold text-white/70 truncate">
                    {members.map((p) => p.name).join(', ') || 'пусто'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FFA table */}
        {scoreRows && scores && (
          <div className="w-full flex flex-col gap-2 mb-6" data-testid="result-scores">
            {scoreRows.map((p, i) => {
              const isWinner = p.id === winnerPlayerId;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${isWinner ? 'bg-[var(--color-dungeon-gold)]/12 ring-2 ring-[var(--color-dungeon-gold)]' : 'glass-panel'}`}
                >
                  <span className="text-xl w-7 text-center">{MEDALS[i] ?? `${i + 1}.`}</span>
                  <span className="flex-1 text-white font-bold text-sm truncate">{p.isBot ? '🤖 ' : ''}{p.name}</span>
                  <span className={`text-lg font-black tabular-nums ${isWinner ? 'text-[var(--color-dungeon-gold)]' : 'text-white'}`}>{scores[p.id] ?? 0}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Coop / fallback: floors + survivors + HP list */}
        {!hasTable && (
          <>
            <div className="w-full glass-panel rounded-2xl p-4 mb-5">
              <div className="flex justify-between text-sm mb-3 pb-3 border-b border-white/5">
                <span className="text-gray-400">Этажей пройдено</span>
                <span className="text-white font-bold">{gameState.currentFloor}/{gameState.totalFloors}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Выживших</span>
                <span className={`font-bold ${alive > 0 ? 'text-green-400' : 'text-red-400'}`}>{alive}/{players.length}</span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2 mb-6">
              {players.slice().sort((a, b) => (b.personalHp - a.personalHp)).map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${p.isAlive ? 'glass-panel' : 'bg-white/3 opacity-50'}`}
                >
                  <span className="text-xl">{p.isAlive ? '💪' : '👻'}</span>
                  <span className="flex-1 text-white font-medium text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${p.isAlive ? 'bg-green-500' : 'bg-red-500/50'}`} style={{ width: `${(p.personalHp / p.maxPersonalHp) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 font-mono w-8">{p.personalHp}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[var(--color-dungeon-accent)] to-rose-600 text-white font-bold text-lg transition-all hover:brightness-110 hover:shadow-[0_4px_20px_rgba(233,69,96,0.3)] active:scale-[0.97]"
        >
          🔄 Новая игра
        </button>
      </div>
    </div>
  );
}
