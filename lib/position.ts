/**
 * Facts about a position that chess.js can prove on its own: material,
 * pieces left hanging, sacrifices, and engine lines turned into SAN. The
 * coach texts (built-in and AI) are only allowed to talk about these facts
 * plus the engine numbers, which keeps the explanations honest.
 */

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export interface UciMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function parseUci(uci: string): UciMove | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) return null;
  return { from: m[1] as Square, to: m[2] as Square, promotion: m[3] as PieceSymbol | undefined };
}

/** Plays a UCI move on a copy of the position. Null when it is not legal. */
export function playUci(fen: string, uci: string) {
  const move = parseUci(uci);
  if (!move) return null;
  const chess = new Chess(fen);
  try {
    const played = chess.move(move);
    return { chess, move: played };
  } catch {
    return null;
  }
}

/** Converts an engine line to SAN, stopping at the first move that does not fit. */
export function lineToSan(fen: string, uciLine: string[], max = 8): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciLine.slice(0, max)) {
    const move = parseUci(uci);
    if (!move) break;
    try {
      out.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return out;
}

/** "12. Nf3 Nc6 13. Bb5" style numbering for a line starting at `fen`. */
export function numberLine(fen: string, san: string[]): string {
  const parts = fen.split(' ');
  let moveNo = Number(parts[5]) || 1;
  let white = parts[1] === 'w';
  return san
    .map((m, i) => {
      let s = '';
      if (white) s = `${moveNo}. ${m}`;
      else s = i === 0 ? `${moveNo}… ${m}` : m;
      if (!white) moveNo++;
      white = !white;
      return s;
    })
    .join(' ');
}

export function material(chess: Chess): Record<Color, number> {
  const total = { w: 0, b: 0 };
  for (const row of chess.board()) {
    for (const p of row) if (p) total[p.color] += PIECE_VALUE[p.type];
  }
  return total;
}

export interface HangingPiece {
  square: Square;
  piece: PieceSymbol;
}

/**
 * Pieces of `color` that the side to move can win right now: attacked by a
 * legal capture and either undefended or attacked by something cheaper.
 * Only meaningful when it is the opponent's turn.
 */
export function hangingPieces(chess: Chess, color: Color): HangingPiece[] {
  if (chess.turn() === color) return [];
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured);
  const result: HangingPiece[] = [];
  const seen = new Set<string>();
  for (const m of captures) {
    const target = chess.get(m.to);
    if (!target || target.color !== color || target.type === 'k' || seen.has(m.to)) continue;
    const defended = chess.attackers(m.to, color).length > 0;
    if (!defended || PIECE_VALUE[m.piece] < PIECE_VALUE[target.type]) {
      result.push({ square: m.to, piece: target.type });
      seen.add(m.to);
    }
  }
  return result.sort((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
}

/**
 * True when the move puts material en prise on purpose: the moved piece can
 * be taken by a cheaper piece, or for free, and it is worth more than
 * whatever it just captured.
 */
export function isSacrifice(fenBefore: string, uci: string): boolean {
  const result = playUci(fenBefore, uci);
  if (!result) return false;
  const { chess, move } = result;
  const value = PIECE_VALUE[move.promotion ?? move.piece];
  const gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  if (value < 3 || value - gained < 2) return false;

  const takers = chess.moves({ verbose: true }).filter((m) => m.to === move.to && m.captured);
  if (!takers.length) return false;
  const defended = chess.attackers(move.to, move.color).length > 0;
  const cheapest = Math.min(...takers.map((m) => PIECE_VALUE[m.piece]));
  return !defended || cheapest < value;
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

export function gamePhase(chess: Chess, plies: number): Phase {
  const m = material(chess);
  const nonPawn = chess
    .board()
    .flat()
    .filter((p) => p && p.type !== 'p' && p.type !== 'k').length;
  if (plies < 16 && nonPawn >= 12) return 'opening';
  if (m.w + m.b <= 26 || nonPawn <= 6) return 'endgame';
  return 'middlegame';
}

export const describePiece = (p: HangingPiece) => `${PIECE_NAME[p.piece]} on ${p.square}`;
