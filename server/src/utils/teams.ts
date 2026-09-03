/**
 * Team helpers (see docs/TEAMS.md). All of them read state.teams / player.teamId
 * and are safe to call in any teamMode — outside 'teams' they return empty results.
 */
import type { GameState, Player, Team, TeamMode } from '../../../shared/types.ts';
import { DEFAULT_TEAMS, MAX_TEAMS, MIN_TEAMS, TEAM_MODES_BY_GAME } from '../../../shared/types.ts';

/** Team the player belongs to (teams-mode only). */
export function getTeamOf(state: GameState, playerId: string): Team | undefined {
  const teamId = state.players[playerId]?.teamId;
  if (!teamId) return undefined;
  return state.teams?.find((t) => t.id === teamId);
}

/** Players of a team (alive or not). */
export function playersOfTeam(state: GameState, teamId: string): Player[] {
  return Object.values(state.players).filter((p) => p.teamId === teamId);
}

/** Only teams that have at least one player. */
export function teamsWithPlayers(state: GameState): Team[] {
  return (state.teams ?? []).filter((t) => playersOfTeam(state, t.id).length > 0);
}

/** teamId -> players. Every team of state.teams is present (possibly empty). */
export function groupByTeam(state: GameState): Record<string, Player[]> {
  const out: Record<string, Player[]> = {};
  for (const t of state.teams ?? []) out[t.id] = [];
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    (out[p.teamId] ??= []).push(p);
  }
  return out;
}

/** Team with the fewest players (first one on ties). undefined when there are no teams. */
export function smallestTeam(state: GameState): Team | undefined {
  const groups = groupByTeam(state);
  let best: Team | undefined;
  let bestN = Infinity;
  for (const t of state.teams ?? []) {
    const n = groups[t.id]?.length ?? 0;
    if (n < bestN) { best = t; bestN = n; }
  }
  return best;
}

/** Formats available for a game mode (falls back to coop-only for unknown ids). */
export function availableTeamModes(gameMode: GameState['gameMode']): TeamMode[] {
  return TEAM_MODES_BY_GAME[gameMode ?? 'classic'] ?? ['coop'];
}

/** Fresh copy of the first `n` default teams (2..4). */
export function makeTeams(n: number): Team[] {
  const count = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.floor(n)));
  return DEFAULT_TEAMS.slice(0, count).map((t) => ({ ...t }));
}

/**
 * Lobby validation for teams-mode: every player has a team and at least two
 * teams are non-empty. Returns an error message or null when everything is fine.
 * Outside teams-mode always null.
 */
export function teamSetupError(state: GameState): string | null {
  if (state.teamMode !== 'teams') return null;
  const players = Object.values(state.players);
  const teamIds = new Set((state.teams ?? []).map((t) => t.id));
  if (players.some((p) => !p.teamId || !teamIds.has(p.teamId))) return 'Распределитесь по командам';
  if (teamsWithPlayers(state).length < 2) return 'Распределитесь по командам';
  return null;
}
