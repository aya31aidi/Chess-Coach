/**
 * Stockfish (WASM, in a Web Worker) behind a small promise API.
 *
 * Searches run one at a time from a queue. Two callers asking about the same
 * position share one search, and each caller is answered as soon as the
 * search is deep enough for it: a move review needing depth 14 does not wait
 * for the live analysis to reach depth 18. Finished analyses are cached by
 * FEN, and a search nobody waits for any more is stopped, so clicking
 * quickly through a game never leaves a backlog behind.
 */

import { Chess } from 'chess.js';
import { MATED_CP, type Score } from './eval';

export interface EngineLine {
  multipv: number;
  depth: number;
  /** White's point of view. */
  score: Score;
  pv: string[];
}

export interface Analysis {
  fen: string;
  depth: number;
  multipv: number;
  lines: EngineLine[];
  bestmove: string | null;
  /** False when the search was stopped before reaching its target. */
  complete: boolean;
}

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
}

export interface PlayOptions {
  skill: number;
  depth?: number;
  movetime?: number;
}

type Listener = (a: Analysis) => void;

interface Waiter {
  depth: number;
  multipv: number;
  onUpdate?: Listener;
  resolve: (a: Analysis) => void;
}

interface Task {
  kind: 'analyse' | 'play';
  fen: string;
  depth?: number;
  movetime?: number;
  multipv: number;
  skill: number;
  waiters: Set<Waiter>;
  result: Analysis;
  stopped: boolean;
  lastNotify: number;
}

export interface Request {
  promise: Promise<Analysis>;
  release: () => void;
}

const NOTIFY_EVERY_MS = 120;

/** Positions the engine has nothing to say about: the game is over. */
function terminalAnalysis(fen: string): Analysis | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;
  const cp = chess.isCheckmate() ? (chess.turn() === 'w' ? -MATED_CP : MATED_CP) : 0;
  return {
    fen,
    depth: 99,
    multipv: 1,
    lines: [{ multipv: 1, depth: 99, score: { cp }, pv: [] }],
    bestmove: null,
    complete: true,
  };
}

/** True once every line the waiter asked for has reached its depth. */
const deepEnough = (a: Analysis, w: Waiter) =>
  a.lines.length >= w.multipv && a.lines.slice(0, w.multipv).every((l) => l.depth >= w.depth);

export class Engine {
  private worker: Worker;
  private queue: Task[] = [];
  private current: Task | null = null;
  private isReady = false;
  private cache = new Map<string, Analysis>();
  readonly ready: Promise<void>;
  private markReady!: () => void;

  constructor(url = '/engine/stockfish.js') {
    this.ready = new Promise((res) => (this.markReady = res));
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      for (const line of String(e.data).split('\n')) if (line) this.onLine(line.trim());
    };
    this.send('uci');
  }

  cached(fen: string): Analysis | undefined {
    return this.cache.get(fen);
  }

  /** Analyses a position; `onUpdate` sees the lines grow deeper as it searches. */
  analyse(fen: string, opts: SearchOptions, onUpdate?: Listener): Request {
    const multipv = opts.multipv ?? 1;
    const depth = opts.depth ?? 16;

    const done = terminalAnalysis(fen) ?? this.cache.get(fen);
    if (done && done.depth >= depth && done.multipv >= multipv) {
      onUpdate?.(done);
      return { promise: Promise.resolve(done), release: () => {} };
    }

    const shared = [this.current, ...this.queue].find(
      (t) =>
        t && t.kind === 'analyse' && t.fen === fen && !t.stopped &&
        (t.depth ?? 0) >= depth && t.multipv >= multipv,
    );
    const task = shared ?? this.createTask('analyse', fen, { depth, movetime: opts.movetime, multipv, skill: 20 });
    return this.attach(task, depth, multipv, onUpdate);
  }

  /** Asks the engine for a move at a given strength. */
  play(fen: string, opts: PlayOptions): Request {
    const task = this.createTask('play', fen, { ...opts, multipv: 1 });
    // A move is only known when the search ends, so this waiter never resolves early.
    return this.attach(task, Infinity, 1);
  }

  /** Answers everyone with what is known so far and stops searching. */
  stopAll() {
    for (const t of this.queue) this.finish(t);
    this.queue = [];
    if (this.current) {
      this.answerAll(this.current);
      this.stop(this.current);
    }
  }

  terminate() {
    this.worker.terminate();
  }

  // -------------------------------------------------------------------------

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private createTask(
    kind: Task['kind'],
    fen: string,
    o: { depth?: number; movetime?: number; multipv: number; skill: number },
  ): Task {
    const task: Task = {
      kind,
      fen,
      depth: o.depth,
      movetime: o.movetime,
      multipv: o.multipv,
      skill: o.skill,
      waiters: new Set(),
      result: { fen, depth: 0, multipv: o.multipv, lines: [], bestmove: null, complete: false },
      stopped: false,
      lastNotify: 0,
    };
    this.queue.push(task);
    queueMicrotask(() => this.pump());
    return task;
  }

  private attach(task: Task, depth: number, multipv: number, onUpdate?: Listener): Request {
    let waiter!: Waiter;
    const promise = new Promise<Analysis>((resolve) => {
      waiter = { depth, multipv, onUpdate, resolve };
    });
    task.waiters.add(waiter);
    return {
      promise,
      release: () => {
        if (!task.waiters.delete(waiter)) return;
        waiter.resolve(task.result);
        this.dropIfUnwanted(task);
      },
    };
  }

  /** Stops or unqueues a task once its last waiter is gone. */
  private dropIfUnwanted(task: Task) {
    if (task.waiters.size > 0) return;
    if (task === this.current) this.stop(task);
    else if (this.queue.includes(task)) {
      this.queue = this.queue.filter((t) => t !== task);
      this.finish(task);
    }
  }

  private stop(task: Task) {
    if (task.stopped) return;
    task.stopped = true;
    this.send('stop');
  }

  private pump() {
    if (!this.isReady || this.current) return;
    const task = this.queue.shift();
    if (!task) return;
    if (task.waiters.size === 0) {
      this.finish(task);
      this.pump();
      return;
    }
    this.current = task;
    const limits = [
      task.depth ? `depth ${task.depth}` : '',
      task.movetime ? `movetime ${task.movetime}` : '',
    ].filter(Boolean);
    this.send(`setoption name MultiPV value ${task.multipv}`);
    this.send(`setoption name Skill Level value ${task.skill}`);
    this.send(`position fen ${task.fen}`);
    this.send(`go ${limits.join(' ') || 'depth 12'}`);
  }

  private onLine(line: string) {
    if (line === 'uciok') {
      this.send('setoption name Hash value 32');
      this.send('isready');
      return;
    }
    if (line === 'readyok' && !this.isReady) {
      this.isReady = true;
      this.markReady();
      this.pump();
      return;
    }
    const task = this.current;
    if (!task) return;

    if (line.startsWith('info ')) {
      if (!this.readInfo(task, line)) return;
      this.notify(task, false);
      this.answerEarly(task);
      return;
    }
    if (line.startsWith('bestmove')) {
      const move = line.split(' ')[1];
      task.result = {
        ...task.result,
        bestmove: move && move !== '(none)' ? move : null,
        complete: !task.stopped,
      };
      this.current = null;
      this.finish(task);
      this.pump();
    }
  }

  /** Reads one "info" line into the task. Returns true when a line changed. */
  private readInfo(task: Task, line: string): boolean {
    const t = line.split(' ');
    const at = (key: string) => t.indexOf(key);
    if (at('pv') < 0 || at('score') < 0 || line.includes(' lowerbound') || line.includes(' upperbound')) {
      return false;
    }
    const depth = Number(t[at('depth') + 1]);
    const multipv = at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1;
    const kind = t[at('score') + 1];
    const value = Number(t[at('score') + 2]);
    const pv = t.slice(at('pv') + 1);

    // UCI scores are from the side to move; everything here is White's view.
    const sign = task.fen.split(' ')[1] === 'w' ? 1 : -1;
    const score: Score = kind === 'mate' ? { mate: sign * value } : { cp: sign * value };

    const lines = task.result.lines.filter((l) => l.multipv !== multipv);
    lines.push({ multipv, depth, score, pv });
    lines.sort((a, b) => a.multipv - b.multipv);
    task.result = { ...task.result, lines, depth: Math.max(task.result.depth, depth) };
    return true;
  }

  private notify(task: Task, force: boolean) {
    const now = Date.now();
    if (!force && now - task.lastNotify < NOTIFY_EVERY_MS) return;
    task.lastNotify = now;
    for (const w of task.waiters) w.onUpdate?.(task.result);
  }

  /** Hands the current lines to waiters whose depth is reached. */
  private answerEarly(task: Task) {
    let answered = false;
    for (const w of task.waiters) {
      if (deepEnough(task.result, w)) {
        task.waiters.delete(w);
        w.resolve(task.result);
        answered = true;
      }
    }
    if (answered) {
      this.remember(task);
      this.dropIfUnwanted(task);
    }
  }

  private answerAll(task: Task) {
    for (const w of task.waiters) {
      w.onUpdate?.(task.result);
      w.resolve(task.result);
    }
    task.waiters.clear();
  }

  private remember(task: Task) {
    const r = task.result;
    if (task.kind !== 'analyse' || !r.lines.length) return;
    const old = this.cache.get(task.fen);
    if (!old || r.depth > old.depth || (r.depth === old.depth && r.multipv > old.multipv)) {
      this.cache.set(task.fen, r);
    }
  }

  private finish(task: Task) {
    this.remember(task);
    this.answerAll(task);
  }
}
