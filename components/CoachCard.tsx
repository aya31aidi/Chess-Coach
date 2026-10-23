import { CLASS_INFO } from '@/lib/eval';
import type { Ply } from '@/lib/review';
import Badge from './Badge';

export interface CoachEntry {
  text: string;
  source: 'builtin' | 'ai';
  streaming: boolean;
  note?: string;
}

const KnightIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M7 21h11v-2.2c0-2.7-.9-4.4-2.3-6 1.1-.5 1.8-1.6 1.8-2.9 0-1-.4-1.8-1.1-2.4L18 5.2 16.3 3.5l-2.4 2.3A7.6 7.6 0 0 0 6 10.5L5 12.4l1.6 1.2 1.6-1c.6.5 1.4.7 2.2.6-1.4 1.3-3.4 3.3-3.4 5.6V21Z" />
  </svg>
);

export default function CoachCard({
  ply, entry, reply, onShowReply, aiAvailable, showBest, canRetry, onAskAI, onToggleBest, onRetry, intro,
}: {
  ply: Ply | null;
  entry?: CoachEntry;
  /** Stockfish's answer to `ply` in a live game, shown as one line below. */
  reply?: Ply | null;
  onShowReply?: () => void;
  aiAvailable: boolean;
  showBest: boolean;
  canRetry: boolean;
  onAskAI: () => void;
  onToggleBest: () => void;
  onRetry: () => void;
  intro: string;
}) {
  const review = ply?.review;
  const info = review ? CLASS_INFO[review.classification] : null;
  const better = review && review.bestUci && review.bestUci !== ply?.uci;

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-center gap-3">
        {review ? (
          <Badge c={review.classification} size="lg" />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-gold-soft text-gold">
            <KnightIcon />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {ply ? (
              <>
                {ply.san}{' '}
                {info ? (
                  <span style={{ color: info.color }}>{info.phrase}</span>
                ) : (
                  <span className="text-faint">is being checked…</span>
                )}
              </>
            ) : (
              'Coach'
            )}
          </p>
          <p className="text-xs text-faint">
            {entry?.source === 'ai' ? 'AI coach · grounded in Stockfish' : 'Coach'}
            {entry?.streaming && <span className="thinking-dot ml-1">●</span>}
          </p>
        </div>
      </div>

      <p className="mt-3 min-h-12 whitespace-pre-line text-[15px] leading-relaxed text-ink/90">
        {ply ? entry?.text || (review ? '' : 'Stockfish is looking at this move…') : intro}
      </p>
      {entry?.note && <p className="mt-2 text-xs text-faint">{entry.note}</p>}

      {reply && (
        <button
          type="button"
          onClick={onShowReply}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm text-muted hover:border-line-strong"
          title="Show this move on the board"
        >
          <span className="text-faint">Stockfish replied</span>
          <span className="font-semibold text-ink">
            {reply.fenBefore.split(' ')[5]}
            {reply.color === 'w' ? '.' : '…'} {reply.san}
          </span>
          {reply.review && <Badge c={reply.review.classification} />}
        </button>
      )}

      {ply && review && (
        <div className="mt-4 flex flex-wrap gap-2">
          {better && (
            <button type="button" className={`btn ${showBest ? 'border-good text-good' : ''}`} onClick={onToggleBest}>
              {showBest ? 'Hide best move' : 'Show best move'}
            </button>
          )}
          {canRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          )}
          {aiAvailable && entry?.source !== 'ai' && (
            <button type="button" className="btn border-gold/40 text-gold" onClick={onAskAI} disabled={entry?.streaming}>
              Ask the AI coach
            </button>
          )}
        </div>
      )}
    </div>
  );
}
