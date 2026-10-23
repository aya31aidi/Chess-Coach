import { useEffect, useRef } from 'react';
import type { Ply } from '@/lib/review';
import Badge from './Badge';

/** Moves in pairs; `cursor` is the number of plies shown on the board. */
export default function MoveList({ plies, cursor, startMove, onSelect }: {
  plies: Ply[];
  cursor: number;
  startMove: { number: number; black: boolean };
  onSelect: (cursor: number) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and
  // React would try to call it as the effect's cleanup.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // A game set up from a FEN can start with Black to move.
  const offset = startMove.black ? 1 : 0;
  const rows: (Ply | null)[][] = [];
  const padded: (Ply | null)[] = [...Array(offset).fill(null), ...plies];
  for (let i = 0; i < padded.length; i += 2) rows.push(padded.slice(i, i + 2));

  if (!plies.length) {
    return <p className="px-2 py-6 text-center text-sm text-faint">No moves yet. Make the first move on the board.</p>;
  }

  return (
    <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 text-sm">
      {rows.map((pair, r) => (
        <li key={r} className="contents">
          <span className="py-1 pl-2 text-faint">{startMove.number + r}.</span>
          {[0, 1].map((k) => {
            const ply = pair[k];
            const index = r * 2 + k - offset;
            if (!ply) return <span key={k} />;
            const current = index + 1 === cursor;
            return (
              <button
                key={k}
                ref={current ? active : undefined}
                type="button"
                onClick={() => onSelect(index + 1)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-left font-medium ${
                  current ? 'bg-gold-soft text-gold' : 'hover:bg-panel-2'
                }`}
              >
                {ply.review && <Badge c={ply.review.classification} />}
                {ply.san}
              </button>
            );
          })}
        </li>
      ))}
    </ol>
  );
}
