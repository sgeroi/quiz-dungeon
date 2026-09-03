// Helpers for the classic RPG mode team formats (ffa / teams / coop).
// Pure functions over room-broadcast GameState — no correct answers involved.
import type { GameState, Monster, Player, Team, TeamMode } from '../types';

export type TeamBattleEntry = NonNullable<GameState['teamBattle']>[string];

export interface ClassicView {
  teamMode: TeamMode;
  isTeams: boolean;
  isFfa: boolean;
  /** Player's team (teams-mode only). */
  myTeam: Team | undefined;
  myBattle: TeamBattleEntry | undefined;
  /** Captain / sacrifice relevant for this player: own team in teams-mode, party otherwise. */
  captainId: string | null;
  sacrificeId: string | null;
  /** Monster as this player sees it (own team's HP in teams-mode). */
  monster: Monster | null;
  /** Party shown around the player (teammates in teams-mode). */
  party: Player[];
  /** ffa: playerId -> score. */
  scores: Record<string, number>;
  /** teams: teamId -> score. */
  teamScores: Record<string, number>;
  myScore: number;
}

export function teamOf(gs: GameState, playerId: string | null | undefined): Team | undefined {
  if (!playerId) return undefined;
  const teamId = gs.players[playerId]?.teamId;
  if (!teamId) return undefined;
  return (gs.teams ?? []).find((t) => t.id === teamId);
}

/** Monster copy with the team's HP (teams-mode) or the shared floor monster. */
export function monsterFor(gs: GameState, teamId: string | null | undefined): Monster | null {
  const floor = gs.floors?.[gs.currentFloor - 1];
  const m = floor?.monster ?? null;
  if (!m) return null;
  if (gs.teamMode === 'teams' && teamId) {
    const tb = gs.teamBattle?.[teamId];
    if (tb) return { ...m, currentHp: tb.monsterHp, maxHp: tb.monsterMaxHp };
  }
  return m;
}

/** Captain id for a team (teams-mode) or the party captain. */
export function captainFor(gs: GameState, teamId: string | null | undefined, fallback: string | null): string | null {
  if (gs.teamMode === 'teams') return teamId ? gs.teamBattle?.[teamId]?.captainId ?? null : null;
  return gs.captainId ?? fallback ?? null;
}

export function sacrificeFor(gs: GameState, teamId: string | null | undefined, fallback: string | null): string | null {
  if (gs.teamMode === 'teams') return teamId ? gs.teamBattle?.[teamId]?.sacrificeId ?? null : null;
  return gs.sacrificePlayerId ?? fallback ?? null;
}

export function teamScoresOf(gs: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of gs.teams ?? []) out[t.id] = gs.teamBattle?.[t.id]?.score ?? 0;
  return out;
}

export function scoresOf(gs: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of Object.values(gs.players)) out[p.id] = gs.classicScores?.[p.id] ?? 0;
  return out;
}

/** Teams that have at least one player, in state order. */
export function teamsInPlay(gs: GameState): Team[] {
  const players = Object.values(gs.players);
  return (gs.teams ?? []).filter((t) => players.some((p) => p.teamId === t.id));
}

export function playersOfTeam(gs: GameState, teamId: string): Player[] {
  return Object.values(gs.players).filter((p) => p.teamId === teamId);
}

/** Players sorted by ffa score (desc), then HP. */
export function rankedPlayers(gs: GameState): Player[] {
  const scores = scoresOf(gs);
  return Object.values(gs.players)
    .slice()
    .sort((a, b) => (scores[b.id] - scores[a.id]) || (Number(b.isAlive) - Number(a.isAlive)) || (b.personalHp - a.personalHp));
}

/** Teams sorted by score (desc). */
export function rankedTeams(gs: GameState): Team[] {
  const scores = teamScoresOf(gs);
  return teamsInPlay(gs).slice().sort((a, b) => scores[b.id] - scores[a.id]);
}

export function classicView(
  gs: GameState,
  playerId: string | null,
  storeCaptainId: string | null,
  storeSacrificeId: string | null,
): ClassicView {
  const teamMode: TeamMode = gs.teamMode ?? 'coop';
  const isTeams = teamMode === 'teams';
  const isFfa = teamMode === 'ffa';
  const myTeam = isTeams ? teamOf(gs, playerId) : undefined;
  const myBattle = myTeam ? gs.teamBattle?.[myTeam.id] : undefined;
  const players = Object.values(gs.players);
  const scores = scoresOf(gs);
  const teamScores = teamScoresOf(gs);
  return {
    teamMode,
    isTeams,
    isFfa,
    myTeam,
    myBattle,
    captainId: captainFor(gs, myTeam?.id, storeCaptainId),
    sacrificeId: sacrificeFor(gs, myTeam?.id, storeSacrificeId),
    monster: monsterFor(gs, myTeam?.id),
    party: isTeams && myTeam ? players.filter((p) => p.teamId === myTeam.id) : players,
    scores,
    teamScores,
    myScore: isTeams ? (myTeam ? teamScores[myTeam.id] ?? 0 : 0) : playerId ? scores[playerId] ?? 0 : 0,
  };
}
