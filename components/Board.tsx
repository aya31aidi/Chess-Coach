'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { Chessboard, defaultPieces, type Arrow } from 'react-chessboard';
import { CLASS_INFO, type Classification } from '@/lib/eval';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  /** Which side may move right now, or null for a locked board. */
  movable: 'w' | 'b' | null;
  lastMove?: { from: string; to: string } | null;
  badges?: { square: string; classification: Classification }[];
  arrows?: Arrow[];
  /** Returns false when the move was refused. */
  onMove: (uci: string) => boolean;
}

const HIGHLIGHT = 'rgb(233 180 76 / 0.42)';
const SELECTED = 'rgb(233 180 76 / 0.62)';
const DOT = 'radial-gradient(circle, rgb(17 20 30 / 0.32) 21%, transparent 23%)';
const RING = 'radial-gradient(circle, transparent 58%, rgb(17 20 30 / 0.32) 60%, rgb(17 20 30 / 0.32) 72%, transparent 74%)';
const CHECK = 'radial-gradient(circle, rgb(239 68 68 / 0.95) 0%, rgb(239 68 68 / 0.55) 40%, transparent 72%)';

export default function Board({ fen, orientation, movable, lastMove, badges = [], arrows = [], onMove }: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [fen]);

  const canMove = movable !== null && chess.turn() === movable;
  const targets = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected],
  );

  const ownPiece = (square: string) => {
    const p = chess.get(square as Square);
    return Boolean(p && canMove && p.color === chess.turn());
  };

  /** Plays from→to, asking for the piece first when a pawn promotes. */
  const attempt = (from: Square, to: Square): boolean => {
    const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return false;
    }
    setSelected(null);
    return onMove(from + to);
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (!canMove) return;
    const sq = square as Square;
    if (selected && targets.some((m) => m.to === sq)) {
      attempt(selected, sq);
      return;
    }
    setSelected(ownPiece(sq) && sq !== selected ? sq : null);
  };

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: HIGHLIGHT };
      styles[lastMove.to] = { background: HIGHLIGHT };
    }
    if (chess.inCheck()) {
      const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
      if (king) styles[king] = { ...styles[king], backgroundImage: CHECK };
    }
    if (selected) {
      styles[selected] = { background: SELECTED };
      for (const m of targets) {
        styles[m.to] = { ...styles[m.to], backgroundImage: chess.get(m.to) ? RING : DOT };
      }
    }
    return styles;
  }, [chess, lastMove, selected, targets]);

  const color = chess.turn() === 'w' ? 'w' : 'b';

  return (
    <div className="relative aspect-square w-full select-none">
      <Chessboard
        options={{
          id: 'coach-board',
          position: fen,
          boardOrientation: orientation,
          arrows,
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          animationDurationInMs: 180,
          boardStyle: { borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 60px -20px rgb(0 0 0 / 0.7)' },
          lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
          darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
          dropSquareStyle: { boxShadow: 'inset 0 0 0 4px rgb(233 180 76 / 0.8)' },
          squareStyles,
          canDragPiece: ({ square }) => Boolean(square && ownPiece(square)),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            Boolean(targetSquare) && attempt(sourceSquare as Square, targetSquare as Square),
          onPieceDrag: ({ square }) => square && ownPiece(square) && setSelected(square as Square),
          onSquareClick,
          squareRenderer: ({ square, children }) => {
            const badge = badges.find((b) => b.square === square);
            const info = badge && CLASS_INFO[badge.classification];
            return (
              <div style={{ position: 'relative', width: '100%', height: '100%', ...squareStyles[square] }}>
                {children}
                {info && (
                  <span
                    className="pointer-events-none absolute top-[3%] right-[3%] z-10 grid aspect-square w-[38%] place-items-center rounded-full text-[clamp(8px,1.6vw,13px)] font-extrabold text-white shadow-lg ring-2 ring-black/25"
                    style={{ background: info.color }}
                    aria-label={info.label}
                  >
                    {info.symbol}
                  </span>
                )}
              </div>
            );
          },
        }}
      />

      {promotion && (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-black/55 backdrop-blur-[2px]">
          <div className="card flex gap-2 p-3">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => {
              const Piece = defaultPieces[`${color}${p.toUpperCase()}`];
              return (
                <button
                  key={p}
                  type="button"
                  className="size-16 rounded-lg bg-panel-2 p-1 hover:bg-gold-soft"
                  onClick={() => {
                    const { from, to } = promotion;
                    setPromotion(null);
                    setSelected(null);
                    onMove(from + to + p);
                  }}
                  aria-label={`Promote to ${p}`}
                >
                  {Piece?.()}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn absolute bottom-4" onClick={() => setPromotion(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
