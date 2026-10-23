import { CLASS_INFO, CLASSIFICATIONS, type Classification } from '@/lib/eval';
import { MOOD_GROUP_INFO, type GameSummary, type MoodReport, type Ply } from '@/lib/review';
import Badge from './Badge';
import EvalGraph from './EvalGraph';

const KEY: Classification[] = ['brilliant', 'great', 'mistake', 'blunder'];

function MoodSection({ report, cameraOn }: { report: MoodReport; cameraOn: boolean }) {
  if (!report.tracked) {
    return (
      <p className="rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-faint">
        {cameraOn
          ? 'Tilt detector is on. Your mood is recorded with each move and shown here once moves are reviewed.'
          : 'Turn on the Tilt camera at the top to see how frustration affects your moves. Video stays on this device.'}
      </p>
    );
  }
  const best = Math.max(...report.stats.map((s) => s.accuracy));
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Mood and accuracy</h3>
      {report.insight && <p className="mb-3 text-sm leading-relaxed">{report.insight}</p>}
      <div className="space-y-2">
        {report.stats.map((s) => {
          const info = MOOD_GROUP_INFO[s.group];
          return (
            <div key={s.group} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: info.color }} />
                {info.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-bg">
                <span className="block h-full rounded-full" style={{ width: `${(s.accuracy / Math.max(best, 1)) * 100}%`, background: info.color }} />
              </span>
              <span className="whitespace-nowrap text-right text-faint">
                {Math.round(s.accuracy)}% · {s.moves} {s.moves === 1 ? 'move' : 'moves'}
                {s.misses > 0 && (
                  <span className="text-bad"> · {s.misses} {s.misses === 1 ? 'mistake' : 'mistakes'}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReviewPanel({
  plies, cursor, summary, moods, cameraOn, names, progress, practiceCount, onSelect, onReview, onPractice,
}: {
  plies: Ply[];
  cursor: number;
  summary: GameSummary;
  moods: MoodReport;
  cameraOn: boolean;
  names: { w: string; b: string };
  progress: { done: number; total: number } | null;
  practiceCount: number;
  onSelect: (cursor: number) => void;
  onReview: () => void;
  onPractice: () => void;
}) {
  const complete = plies.length > 0 && summary.reviewed === plies.length;
  const moments = plies
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.review && KEY.includes(p.review.classification));

  if (!plies.length) {
    return <p className="px-2 py-6 text-center text-sm text-faint">Play a few moves, then come back here for the review.</p>;
  }

  return (
    <div className="space-y-5">
      {!complete && (
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <p className="text-sm text-muted">
            {summary.reviewed} of {plies.length} moves checked. The full review runs Stockfish over every position.
          </p>
          {progress ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-300"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          ) : (
            <button type="button" className="btn btn-gold mt-3" onClick={onReview}>
              Review the whole game
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(['w', 'b'] as const).map((side) => (
          <div key={side} className="rounded-xl border border-line bg-panel-2 p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-muted">
              <span className={`size-2.5 rounded-full ${side === 'w' ? 'bg-[#eef0f5]' : 'bg-[#2a2f3f] ring-1 ring-line-strong'}`} />
              {names[side]}
            </div>
            <div className="mt-1 font-display text-3xl font-bold">
              {summary.accuracy[side] === null ? '–' : summary.accuracy[side]!.toFixed(1)}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-faint">accuracy</div>
          </div>
        ))}
      </div>

      <EvalGraph plies={plies} cursor={cursor} onSelect={onSelect} />

      <MoodSection report={moods} cameraOn={cameraOn} />

      <table className="w-full text-sm">
        <tbody>
          {CLASSIFICATIONS.filter((c) => summary.counts.w[c] || summary.counts.b[c]).map((c) => (
            <tr key={c} className="border-b border-line last:border-0">
              <td className="w-10 py-1.5 text-center font-semibold">{summary.counts.w[c] ?? 0}</td>
              <td className="py-1.5">
                <span className="flex items-center justify-center gap-2" style={{ color: CLASS_INFO[c].color }}>
                  <Badge c={c} /> {CLASS_INFO[c].label}
                </span>
              </td>
              <td className="w-10 py-1.5 text-center font-semibold">{summary.counts.b[c] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {moments.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Key moments</h3>
          <div className="flex flex-wrap gap-1.5">
            {moments.map(({ p, i }) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i + 1)}
                className={`chip border py-1 ${cursor === i + 1 ? 'border-gold text-gold' : 'border-line text-ink hover:border-line-strong'}`}
              >
                <Badge c={p.review!.classification} />
                {p.fenBefore.split(' ')[5]}
                {p.color === 'w' ? '.' : '…'} {p.san}
              </button>
            ))}
          </div>
        </div>
      )}

      {practiceCount > 0 && (
        <button type="button" className="btn w-full border-gold/40 text-gold" onClick={onPractice}>
          Learn from mistakes ({practiceCount})
        </button>
      )}
    </div>
  );
}
