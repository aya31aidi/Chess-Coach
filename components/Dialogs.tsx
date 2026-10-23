'use client';

import { useEffect, useRef, useState } from 'react';

export const LEVELS = [
  { name: 'Beginner', skill: 0, depth: 1 },
  { name: 'Casual', skill: 3, depth: 3 },
  { name: 'Club', skill: 6, depth: 6 },
  { name: 'Intermediate', skill: 9, movetime: 300 },
  { name: 'Advanced', skill: 12, movetime: 500 },
  { name: 'Expert', skill: 15, movetime: 800 },
  { name: 'Master', skill: 18, movetime: 1000 },
  { name: 'Stockfish', skill: 20, movetime: 1500 },
];

export type Mode = 'play' | 'analysis';

export interface NewGame {
  mode: Mode;
  color: 'w' | 'b' | 'random';
  level: number;
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    box.current?.querySelector<HTMLElement>('button, textarea')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-md bg-panel p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-xl bg-bg p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg py-2 text-sm font-medium ${value === o.value ? 'bg-panel-2 text-gold shadow' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NewGameDialog({ initial, onStart, onClose }: {
  initial: NewGame;
  onStart: (g: NewGame) => void;
  onClose: () => void;
}) {
  const [game, setGame] = useState(initial);
  const set = (patch: Partial<NewGame>) => setGame((g) => ({ ...g, ...patch }));

  return (
    <Shell title="New game" onClose={onClose}>
      <div className="space-y-4">
        <Choice
          value={game.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'play', label: 'Play Stockfish' },
            { value: 'analysis', label: 'Analysis board' },
          ]}
        />
        {game.mode === 'play' && (
          <>
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-faint">Play as</p>
              <Choice
                value={game.color}
                onChange={(color) => set({ color })}
                options={[
                  { value: 'w', label: 'White' },
                  { value: 'random', label: 'Random' },
                  { value: 'b', label: 'Black' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 flex justify-between text-xs uppercase tracking-wider text-faint">
                <span>Opponent strength</span>
                <span className="text-gold">{LEVELS[game.level].name}</span>
              </p>
              <input
                type="range"
                min={0}
                max={LEVELS.length - 1}
                value={game.level}
                onChange={(e) => set({ level: Number(e.target.value) })}
                className="w-full accent-[var(--gold)]"
                aria-label="Opponent strength"
              />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-gold" onClick={() => onStart(game)}>
            Start
          </button>
        </div>
      </div>
    </Shell>
  );
}

export function ImportDialog({ onImport, onClose }: {
  /** Returns an error message, or null when the text was loaded. */
  onImport: (text: string) => string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Shell title="Import a game" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Paste a PGN to review a whole game, or a FEN to start from a position.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={7}
        spellCheck={false}
        className="scroll-thin w-full resize-y rounded-xl border border-line bg-bg p-3 font-mono text-xs outline-none focus:border-gold/60"
        placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …\n\nor\n\nr1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'}
      />
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-gold"
          disabled={!text.trim()}
          onClick={() => {
            const err = onImport(text.trim());
            if (err) setError(err);
          }}
        >
          Load
        </button>
      </div>
    </Shell>
  );
}
