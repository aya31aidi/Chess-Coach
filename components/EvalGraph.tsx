import { useMemo } from 'react';
import { CLASS_INFO, winChance } from '@/lib/eval';
import { MOOD_GROUP_INFO, moodGroup, type Ply } from '@/lib/review';

const W = 600;
const H = 120;
const MARKED = new Set(['brilliant', 'great', 'mistake', 'blunder']);

/**
 * White's winning chances over the game; click to jump to a move. When the
 * tilt camera was on, a strip below shows the player's mood per move.
 */
export default function EvalGraph({ plies, cursor, onSelect }: {
  plies: Ply[];
  cursor: number;
  onSelect: (cursor: number) => void;
}) {
  const values = useMemo(() => {
    const first = plies[0]?.review?.scoreBefore;
    const out = [first ? winChance(first) : 50];
    for (const p of plies) out.push(p.review ? winChance(p.review.scoreAfter) : out[out.length - 1]);
    return out;
  }, [plies]);

  if (plies.length < 2) return null;

  const step = W / (values.length - 1);
  const line = values.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ');
  const pct = (i: number) => `${(i / (values.length - 1)) * 100}%`;
  const hasMood = plies.some((p) => p.mood);

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const share = (e.clientX - box.left) / box.width;
    onSelect(Math.max(0, Math.min(plies.length, Math.round(share * plies.length))));
  };

  return (
    <div>
      <div className="relative h-28 w-full cursor-pointer" onClick={pick} role="img" aria-label="Evaluation graph">
        {/* Stretched to the box on purpose; the dots below are drawn in HTML so they stay round. */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full rounded-lg bg-[#2a2f3f]">
          <polygon points={`0,${H} ${line} ${W},${H}`} fill="#eef0f5" />
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgb(233 180 76 / 0.5)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-gold" style={{ left: pct(cursor) }} />
        {plies.map((p, i) =>
          p.review && MARKED.has(p.review.classification) ? (
            <span
              key={i}
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#11141e]"
              style={{
                left: pct(i + 1),
                top: `${100 - values[i + 1]}%`,
                background: CLASS_INFO[p.review.classification].color,
              }}
            />
          ) : null,
        )}
      </div>

      {hasMood && (
        // One segment per move with a recorded mood, centred under its point on the graph.
        <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bg" aria-label="Mood per move">
          {plies.map((p, i) => {
            if (!p.mood) return null;
            const info = MOOD_GROUP_INFO[moodGroup(p.mood)];
            return (
              <span
                key={i}
                className="absolute inset-y-0"
                style={{ left: pct(i + 0.5), width: `${100 / plies.length}%`, background: info.color }}
                title={`${p.san}: ${info.label}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
