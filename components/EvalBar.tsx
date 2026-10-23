import { formatScore, winChance, type Score } from '@/lib/eval';

/** Vertical bar beside the board; White's share grows from White's side. */
export default function EvalBar({ score, flipped, depth }: { score: Score | null; flipped: boolean; depth: number }) {
  const white = score ? winChance(score) : 50;
  const label = score ? formatScore(score) : '…';
  const whiteAhead = white >= 50;

  return (
    <div
      className="relative w-3.5 shrink-0 overflow-hidden rounded-md bg-[#2a2f3f] sm:w-6"
      title={score ? `${label} at depth ${depth}` : 'Engine starting'}
      aria-label={`Evaluation ${label}`}
    >
      <div
        className="absolute inset-x-0 bg-[#eef0f5] transition-[height] duration-500 ease-out"
        style={{ height: `${white}%`, [flipped ? 'top' : 'bottom']: 0 }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-gold/60" />
      <span
        className={`absolute inset-x-0 hidden text-center text-[10px] font-bold sm:block ${
          whiteAhead ? 'text-[#1b2031]' : 'text-[#eef0f5]'
        }`}
        style={{ [whiteAhead !== flipped ? 'bottom' : 'top']: 4 }}
      >
        {label.replace('−', '-')}
      </span>
    </div>
  );
}
