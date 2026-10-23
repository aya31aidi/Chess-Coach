import { useMemo } from 'react';
import type { Analysis } from '@/lib/engine';
import { formatScore } from '@/lib/eval';
import { lineToSan, numberLine } from '@/lib/position';

export default function EngineLines({ analysis, onPlay }: {
  analysis: Analysis | null;
  onPlay?: (uci: string) => void;
}) {
  const rows = useMemo(() => {
    if (!analysis) return [];
    return analysis.lines.map((l) => ({
      key: l.multipv,
      score: formatScore(l.score),
      white: 'mate' in l.score ? l.score.mate > 0 : l.score.cp >= 0,
      first: l.pv[0],
      text: numberLine(analysis.fen, lineToSan(analysis.fen, l.pv, 8)),
    }));
  }, [analysis]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-faint">
        <span>Stockfish 19</span>
        <span>{analysis ? `depth ${analysis.depth}` : 'starting…'}</span>
      </div>
      {rows.length === 0 && <div className="h-7 animate-pulse rounded-md bg-panel-2" />}
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          disabled={!onPlay || !r.first}
          onClick={() => r.first && onPlay?.(r.first)}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-panel-2 disabled:hover:bg-transparent"
        >
          <span
            className={`w-12 shrink-0 rounded px-1 py-0.5 text-center text-xs font-bold ${
              r.white ? 'bg-[#eef0f5] text-[#1b2031]' : 'bg-[#2a2f3f] text-[#eef0f5]'
            }`}
          >
            {r.score}
          </span>
          <span className="truncate text-muted">{r.text}</span>
        </button>
      ))}
    </div>
  );
}
