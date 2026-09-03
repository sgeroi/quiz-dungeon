export interface LmAnswerInfo { optionIdx: number | null; elapsedMs: number; correct: boolean; }
export interface LmSnapshot {
  round: number;
  timeLimit: number;
  suddenDeath: boolean;
  hearts: Record<string, number>;
  alive: string[];
  eliminated: { id: string; round: number }[];
  answered: string[];
  correctCount: Record<string, number>;
  question: { id: string; text: string; options: string[] } | null;
  questionStartMs: number;
  revealCorrectIndex: number | null;
  revealAnswers: Record<string, LmAnswerInfo> | null;
  lastLosers: string[];
  lastEliminated: string[];
  mercy: boolean;
  coop: { hearts: number; maxHearts: number; target: number } | null;
  teamAlive: Record<string, number> | null;
  teamScores: Record<string, number> | null;
  scores: Record<string, number>;
  winner: string | null;
  winnerTeamId: string | null;
  finished: boolean;
  victory: boolean | null;
}
export const LM_OPTION_STYLES = [
  { label: 'A', bg: 'linear-gradient(135deg,#FF3CAE,#C2185B)' },
  { label: 'B', bg: 'linear-gradient(135deg,#75BFFF,#2F6BFF)' },
  { label: 'C', bg: 'linear-gradient(135deg,#FFDB10,#FF8A00)' },
  { label: 'D', bg: 'linear-gradient(135deg,#8DFF85,#05DF72)' },
];
export function hearts(n: number, max = 2): string { return '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n)); }
