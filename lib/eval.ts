/**
 * Everything about turning engine scores into something a player can read:
 * win chances, move classes and accuracy. Scores are always stored from
 * White's point of view; helpers flip them for the side that moved.
 */

export type Score = { cp: number } | { mate: number };

/** Score used for a position that is already checkmate (no mate distance left). */
export const MATED_CP = 10000;
export type Side = 'w' | 'b';

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export const CLASSIFICATIONS: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder',
];

export const CLASS_INFO: Record<Classification, { label: string; phrase: string; symbol: string; color: string }> = {
  brilliant: { label: 'Brilliant', phrase: 'is brilliant', symbol: '!!', color: '#26c2a3' },
  great: { label: 'Great', phrase: 'is a great move', symbol: '!', color: '#5c8bd6' },
  best: { label: 'Best', phrase: 'is the best move', symbol: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', phrase: 'is excellent', symbol: '✦', color: '#96bc4b' },
  good: { label: 'Good', phrase: 'is good', symbol: '✓', color: '#97af8b' },
  book: { label: 'Book', phrase: 'is a book move', symbol: '≡', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', phrase: 'is an inaccuracy', symbol: '?!', color: '#f0c15c' },
  mistake: { label: 'Mistake', phrase: 'is a mistake', symbol: '?', color: '#e6912c' },
  blunder: { label: 'Blunder', phrase: 'is a blunder', symbol: '??', color: '#ca3431' },
};

export const isMate = (s: Score): s is { mate: number } => 'mate' in s;

/** Same curve Lichess uses: centipawns to the chance of winning, 0–100. */
export function winChance(score: Score): number {
  if (isMate(score)) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-4000, Math.min(4000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Win chance for one side, given a White-relative score. */
export const winChanceFor = (score: Score, side: Side) =>
  side === 'w' ? winChance(score) : 100 - winChance(score);

/** Move accuracy from the drop in win chance, again following Lichess. */
export function moveAccuracy(winLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Game accuracy as the mean of the arithmetic and harmonic means. The
 * harmonic part keeps one blunder from hiding behind many easy moves.
 */
export function gameAccuracy(accuracies: number[]): number | null {
  if (!accuracies.length) return null;
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const harmonic = accuracies.length / accuracies.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return (mean + harmonic) / 2;
}

export interface ClassifyInput {
  side: Side;
  /** Best line score of the position before the move. */
  bestScore: Score;
  /** Score of the second best line, when the engine found one. */
  secondScore?: Score;
  /** Score of the position after the move. */
  playedScore: Score;
  playedIsBest: boolean;
  isSacrifice: boolean;
  isBook: boolean;
  /** Taking a hanging piece is often the only move, but hardly a great find. */
  isCapture?: boolean;
}

export function classify(input: ClassifyInput): { classification: Classification; winLoss: number } {
  const before = winChanceFor(input.bestScore, input.side);
  const after = winChanceFor(input.playedScore, input.side);
  const winLoss = input.playedIsBest ? 0 : Math.max(0, before - after);

  if (input.isBook) return { classification: 'book', winLoss };

  // A piece given up for a position that still holds, when the game was not
  // already decided anyway.
  if (input.isSacrifice && winLoss <= 2 && before < 97 && after >= 45) {
    return { classification: 'brilliant', winLoss };
  }

  if (input.playedIsBest) {
    // The only move that keeps things together: the next best one costs a lot.
    const onlyMove = input.secondScore && before - winChanceFor(input.secondScore, input.side) >= 18;
    if (onlyMove && !input.isCapture && before >= 35) {
      return { classification: 'great', winLoss };
    }
    return { classification: 'best', winLoss };
  }

  if (winLoss < 2) return { classification: 'excellent', winLoss };
  if (winLoss < 5) return { classification: 'good', winLoss };
  if (winLoss < 10) return { classification: 'inaccuracy', winLoss };
  if (winLoss < 20) return { classification: 'mistake', winLoss };
  return { classification: 'blunder', winLoss };
}

/** "+1.4", "−0.3", "M3", "−M2" for display, from White's point of view. */
export function formatScore(score: Score): string {
  if (isMate(score)) {
    if (score.mate === 0) return '#';
    return `${score.mate < 0 ? '−' : ''}M${Math.abs(score.mate)}`;
  }
  if (Math.abs(score.cp) >= MATED_CP) return score.cp > 0 ? '1-0' : '0-1';
  const pawns = score.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
}

/** Plain words for the size of an advantage, used by the coach texts. */
export function describeScore(score: Score): string {
  if (isMate(score)) {
    if (score.mate === 0) return 'the game is over';
    const side = score.mate > 0 ? 'White' : 'Black';
    return `${side} has a forced mate in ${Math.abs(score.mate)}`;
  }
  const cp = score.cp;
  const side = cp > 0 ? 'White' : 'Black';
  const abs = Math.abs(cp);
  if (abs >= MATED_CP) return `${side} has delivered checkmate`;
  if (abs < 30) return 'the position is equal';
  if (abs < 90) return `${side} is slightly better`;
  if (abs < 200) return `${side} is clearly better`;
  if (abs < 500) return `${side} is winning`;
  return `${side} is completely winning`;
}

export const negate = (score: Score): Score =>
  isMate(score) ? { mate: -score.mate } : { cp: -score.cp };
