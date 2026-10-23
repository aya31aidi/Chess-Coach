'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import type { Arrow } from 'react-chessboard';
import {
  buildMoveFacts, buildPositionFacts, explainMove, explainPosition,
  type Mood, type MoveReport, type PositionReport,
} from '@/lib/coach';
import { Engine, type Analysis } from '@/lib/engine';
import { CLASS_INFO, gameAccuracy, winChanceFor, type Classification } from '@/lib/eval';
import { findOpening } from '@/lib/openings';
import { colorName, parseUci, playUci } from '@/lib/position';
import { MoodWindow } from '@/lib/mood';
import { isMiss, isTilted, moodReport, reviewPly, summarize, type Ply } from '@/lib/review';
import { play as playSound, type SoundKind } from '@/lib/sound';
import Board from './Board';
import CoachCard, { type CoachEntry } from './CoachCard';
import { ImportDialog, LEVELS, NewGameDialog, type Mode, type NewGame } from './Dialogs';
import EngineLines from './EngineLines';
import EvalBar from './EvalBar';
import MoveList from './MoveList';
import ReviewPanel from './ReviewPanel';
import * as Icon from './icons';

type Tab = 'coach' | 'moves' | 'review';

interface Settings {
  sound: boolean;
  autoAI: boolean;
  showEngine: boolean;
}

interface Practice {
  queue: number[];
  pos: number;
  fen: string;
  shownFen: string;
  side: 'w' | 'b';
  status: 'try' | 'checking' | 'solved' | 'revealed';
  attempts: number;
  feedback: string;
  lastMove: { from: string; to: string } | null;
}

interface Saved {
  v: 1;
  startFen: string;
  moves: string[];
  /** Mood per move, null where the camera was off. */
  moods?: (Mood | null)[];
  mode: Mode;
  playerColor: 'w' | 'b';
  level: number;
  settings: Settings;
}

const STORAGE_KEY = 'chess-coach:game';
const DEFAULT_SETTINGS: Settings = { sound: true, autoAI: true, showEngine: false };
/** Moves worth an automatic AI explanation; the rest are one click away. */
const AUTO_AI = new Set<Classification>(['brilliant', 'great', 'mistake', 'blunder']);
const LIVE_SEARCH = { depth: 18, movetime: 4000, multipv: 3 };

const keyOf = (p: Ply) => `${p.fenBefore}|${p.uci}`;

function buildPly(fenBefore: string, uci: string, byEngine: boolean, mood?: Mood): Ply | null {
  const result = playUci(fenBefore, uci);
  if (!result) return null;
  const { chess, move } = result;
  return {
    mood,
    san: move.san,
    uci,
    from: move.from,
    to: move.to,
    color: move.color,
    fenBefore,
    fenAfter: move.after,
    captured: move.captured,
    check: chess.inCheck(),
    byEngine,
  };
}

function soundFor(ply: Ply, over: boolean): SoundKind {
  if (over) return 'end';
  if (ply.check) return 'check';
  return ply.captured ? 'capture' : 'move';
}

function resultText(game: Chess, mode: Mode, player: 'w' | 'b'): string | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w';
    if (mode === 'play') return winner === player ? 'Checkmate. You win!' : 'Checkmate. Stockfish wins.';
    return `Checkmate. ${colorName(winner)} wins.`;
  }
  if (game.isStalemate()) return 'Draw by stalemate.';
  if (game.isThreefoldRepetition()) return 'Draw by repetition.';
  if (game.isInsufficientMaterial()) return 'Draw: insufficient material.';
  return 'Draw by the fifty-move rule.';
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s?.v === 1 && validateFen(s.startFen).ok ? s : null;
  } catch {
    return null;
  }
}

export default function ChessCoach({ mood = 'neutral', moodActive = false, moodSlot }: {
  mood?: Mood;
  /** True while the camera sees a face, so "neutral" means calm, not "off". */
  moodActive?: boolean;
  moodSlot?: React.ReactNode;
}) {
  const [startFen, setStartFen] = useState(DEFAULT_POSITION);
  const [plies, setPlies] = useState<Ply[]>([]);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('play');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [level, setLevel] = useState(3);
  const [flipped, setFlipped] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>('coach');

  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [live, setLive] = useState<Analysis | null>(null);
  const [thinking, setThinking] = useState(false);
  const [coach, setCoach] = useState<Record<string, CoachEntry>>({});
  const [plan, setPlan] = useState<{ fen: string; entry: CoachEntry } | null>(null);
  const [showBest, setShowBest] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  const [overlayClosed, setOverlayClosed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [moodNote, setMoodNote] = useState<{ kind: 'tilt' | 'surprise'; text: string } | null>(null);

  const engines = useRef<{ analysis: Engine; player: Engine } | null>(null);
  const lastPlyAt = useRef(0);
  const moodWindow = useRef(new MoodWindow());
  // Ply counts at which a note was last shown, so each shows once per move.
  const noteShownAt = useRef({ tilt: -1, surprise: -1 });
  const pliesRef = useRef<Ply[]>([]);
  const cursorRef = useRef(0);
  const startRef = useRef(DEFAULT_POSITION);
  const aiAbort = useRef<AbortController | null>(null);
  const runId = useRef(0);
  // State, not a ref: saving must wait for the render that has the restored game.
  const [hydrated, setHydrated] = useState(false);

  // Values read inside async callbacks, kept current on every render.
  const latest = useRef({ settings, aiAvailable, mode, mood, moodActive });
  latest.current = { settings, aiAvailable, mode, mood, moodActive };

  const commit = useCallback((next: Ply[], nextCursor = next.length) => {
    pliesRef.current = next;
    cursorRef.current = nextCursor;
    setPlies(next);
    setCursor(nextCursor);
  }, []);

  const goTo = useCallback((c: number) => {
    const n = Math.max(0, Math.min(pliesRef.current.length, c));
    cursorRef.current = n;
    setCursor(n);
    setShowBest(false);
    setHint(null);
  }, []);

  // --- Derived state -------------------------------------------------------

  const game = useMemo(() => {
    const c = new Chess(startFen);
    for (const p of plies) c.move(parseUci(p.uci)!);
    return c;
  }, [startFen, plies]);

  const isLive = cursor === plies.length && !practice;
  const result = resultText(game, mode, playerColor);
  const viewFen = practice ? practice.shownFen : cursor === 0 ? startFen : plies[cursor - 1].fenAfter;
  const viewTurn = viewFen.split(' ')[1] as 'w' | 'b';
  const viewPly = !practice && cursor > 0 ? plies[cursor - 1] : null;
  // The move the coach talks about. While playing live, that is the player's
  // own last move: Stockfish answers within a second and would push it away.
  let coachIndex = practice ? -1 : cursor - 1;
  if (!practice && mode === 'play' && isLive) {
    coachIndex = -1;
    for (let i = plies.length - 1; i >= 0; i--) {
      if (!plies[i].byEngine) {
        coachIndex = i;
        break;
      }
    }
  }
  const coachPly = coachIndex >= 0 ? plies[coachIndex] : null;
  const liveForView = live?.fen === viewFen ? live : null;
  const standardStart = startFen === DEFAULT_POSITION;
  const history = useMemo(() => plies.map((p) => p.san), [plies]);
  const opening = standardStart ? findOpening(history.slice(0, cursor)) : null;
  const summary = useMemo(() => summarize(plies, gameAccuracy), [plies]);
  const startMove = { number: Number(startFen.split(' ')[5]) || 1, black: startFen.split(' ')[1] === 'b' };
  const engineVisible = mode === 'analysis' || settings.showEngine || Boolean(result);
  const names =
    mode === 'play'
      ? { w: playerColor === 'w' ? 'You' : 'Stockfish', b: playerColor === 'b' ? 'You' : 'Stockfish' }
      : { w: 'White', b: 'Black' };

  const reportFor = useCallback((ply: Ply, index: number): MoveReport | null => {
    if (!ply.review) return null;
    const r = ply.review;
    return {
      fenBefore: ply.fenBefore,
      uci: ply.uci,
      history: startRef.current === DEFAULT_POSITION ? pliesRef.current.slice(0, index).map((p) => p.san) : [],
      bestLine: r.bestLine.slice(0, 8),
      replyLine: r.replyLine.slice(0, 8),
      scoreBefore: r.scoreBefore,
      scoreAfter: r.scoreAfter,
      classification: r.classification,
      // The mood while the move was chosen, not whatever the camera sees now.
      mood: ply.mood ?? 'neutral',
    };
  }, []);

  const builtinEntry = useCallback(
    (ply: Ply, index: number): CoachEntry | undefined => {
      const report = reportFor(ply, index);
      const facts = report && buildMoveFacts(report);
      return facts ? { text: explainMove(facts), source: 'builtin', streaming: false } : undefined;
    },
    [reportFor],
  );

  // --- Engines and AI availability ----------------------------------------

  useEffect(() => {
    let alive = true;
    let analysis: Engine;
    let player: Engine;
    try {
      analysis = new Engine();
      player = new Engine();
    } catch {
      setEngineError(true);
      return;
    }
    engines.current = { analysis, player };
    let ready = false;
    const timeout = setTimeout(() => alive && !ready && setEngineError(true), 20000);
    Promise.all([analysis.ready, player.ready]).then(() => {
      ready = true;
      if (alive) setEngineReady(true);
    });
    return () => {
      alive = false;
      clearTimeout(timeout);
      analysis.terminate();
      player.terminate();
      engines.current = null;
      setEngineReady(false);
    };
  }, []);

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => r.json())
      .then((d: { ai?: boolean }) => setAiAvailable(Boolean(d.ai)))
      .catch(() => setAiAvailable(false));
  }, []);

  // --- Saved game ----------------------------------------------------------

  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      const list: Ply[] = [];
      let fen = saved.startFen;
      for (const [i, uci] of saved.moves.entries()) {
        const ply = buildPly(fen, uci, false, saved.moods?.[i] ?? undefined);
        if (!ply) break;
        list.push(ply);
        fen = ply.fenAfter;
      }
      // Which moves the engine played only matters for "Try again" and practice.
      if (saved.mode === 'play') for (const p of list) p.byEngine = p.color !== saved.playerColor;
      startRef.current = saved.startFen;
      setStartFen(saved.startFen);
      setMode(saved.mode);
      setPlayerColor(saved.playerColor);
      setLevel(Math.min(LEVELS.length - 1, Math.max(0, saved.level)));
      setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
      commit(list);
    }
    setHydrated(true);
  }, [commit]);

  useEffect(() => {
    if (!hydrated) return;
    const saved: Saved = {
      v: 1,
      startFen,
      moves: plies.map((p) => p.uci),
      moods: plies.map((p) => p.mood ?? null),
      mode,
      playerColor,
      level,
      settings,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private mode or full storage: the game just will not survive a reload.
    }
  }, [hydrated, startFen, plies, mode, playerColor, level, settings]);

  // --- Live analysis of the position on the board --------------------------

  useEffect(() => {
    const engine = engines.current?.analysis;
    if (!engineReady || !engine) return;
    setLive(engine.cached(viewFen) ?? null);
    const req = engine.analyse(viewFen, LIVE_SEARCH, setLive);
    return () => req.release();
  }, [viewFen, engineReady]);

  // --- Move review and the coach ------------------------------------------

  const askAI = useCallback(
    async (kind: 'move' | 'plan', key: string, payload: MoveReport | PositionReport, fallback: CoachEntry) => {
      aiAbort.current?.abort();
      const ctrl = new AbortController();
      aiAbort.current = ctrl;
      const put = (entry: CoachEntry) =>
        kind === 'move'
          ? setCoach((c) => ({ ...c, [key]: entry }))
          : setPlan((p) => (p && p.fen === key ? { fen: key, entry } : p));

      put({ ...fallback, streaming: true });
      let status = 0;
      try {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, ...payload }),
          signal: ctrl.signal,
        });
        status = res.status;
        if (!res.ok || !res.body) throw new Error(`coach ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          put({ text, source: 'ai', streaming: true });
        }
        if (!text.trim()) throw new Error('empty answer');
        put({ text: text.trim(), source: 'ai', streaming: false });
      } catch {
        if (ctrl.signal.aborted) return put({ ...fallback, streaming: false });
        put({
          ...fallback,
          streaming: false,
          note:
            status === 429
              ? 'The AI coach is busy right now, so this is the built-in explanation.'
              : 'The AI coach could not answer, so this is the built-in explanation.',
        });
      }
    },
    [],
  );

  const explainWithAI = useCallback(
    (index: number) => {
      const ply = pliesRef.current[index];
      const report = ply && reportFor(ply, index);
      const fallback = ply && builtinEntry(ply, index);
      if (report && fallback) void askAI('move', keyOf(ply), report, fallback);
    },
    [askAI, builtinEntry, reportFor],
  );

  /** Analyses the positions around one move and stores the verdict. */
  const reviewAt = useCallback(async (index: number, depth = 14) => {
    const engine = engines.current?.analysis;
    const ply = pliesRef.current[index];
    if (!engine || !ply) return null;
    if (ply.review) return ply.review;

    const a = engine.analyse(ply.fenBefore, { depth, multipv: 2 });
    const b = engine.analyse(ply.fenAfter, { depth, multipv: 1 });
    const [before, after] = await Promise.all([a.promise, b.promise]);
    a.release();
    b.release();

    const current = pliesRef.current[index];
    if (!current || keyOf(current) !== keyOf(ply) || !before.lines.length) return null;
    const book = startRef.current === DEFAULT_POSITION ? pliesRef.current.slice(0, index + 1).map((p) => p.san) : null;
    const review = reviewPly(current, index, book, before, after);
    const next = pliesRef.current.map((p, i) => (i === index ? { ...p, review } : p));
    pliesRef.current = next;
    setPlies(next);
    return review;
  }, []);

  // Moves restored from storage or imported carry no verdict until viewed.
  useEffect(() => {
    if (!engineReady) return;
    if (viewPly && !viewPly.review) void reviewAt(cursor - 1);
    if (coachPly && !coachPly.review) void reviewAt(coachIndex);
  }, [engineReady, viewPly, cursor, coachPly, coachIndex, reviewAt]);

  const afterMove = useCallback(
    async (index: number) => {
      const review = await reviewAt(index);
      const ply = pliesRef.current[index];
      if (!review || !ply) return;
      const { settings: s, aiAvailable: ai, mode: m } = latest.current;
      const mine = m === 'analysis' || !ply.byEngine;
      if (s.sound && mine) {
        if (review.classification === 'brilliant' || review.classification === 'great') playSound('good');
        else if (review.classification === 'blunder') playSound('bad');
      }
      if (ai && s.autoAI && mine && AUTO_AI.has(review.classification)) explainWithAI(index);
    },
    [reviewAt, explainWithAI],
  );

  const applyMove = useCallback(
    (uci: string, byEngine: boolean) => {
      const list = pliesRef.current;
      const at = cursorRef.current;
      const base = at === 0 ? startRef.current : list[at - 1].fenAfter;
      const { mode: m, moodActive: cam } = latest.current;
      const own = m === 'analysis' || !byEngine;
      const mood = own && cam ? moodWindow.current.take(Date.now()) : undefined;
      const ply = buildPly(base, uci, byEngine, mood);
      if (!ply) return false;
      const next = [...list.slice(0, at), ply];
      commit(next);
      lastPlyAt.current = Date.now();
      setShowBest(false);
      setHint(null);
      setOverlayClosed(false);
      if (latest.current.settings.sound) playSound(soundFor(ply, new Chess(ply.fenAfter).isGameOver()));
      void afterMove(next.length - 1);
      return true;
    },
    [commit, afterMove],
  );

  // --- Stockfish's moves in play mode --------------------------------------

  // Depends on the position, not on `plies`: reviews landing on earlier moves
  // must not restart the engine's search.
  const liveFen = plies.length ? plies[plies.length - 1].fenAfter : startFen;
  const atLive = cursor === plies.length;

  useEffect(() => {
    const engine = engines.current?.player;
    if (!engineReady || !engine || mode !== 'play' || practice || result || !atLive) return;
    const fen = liveFen;
    if (fen.split(' ')[1] === playerColor) return;

    const lv = LEVELS[level];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    setThinking(true);
    const req = engine.play(fen, { skill: lv.skill, depth: lv.depth, movetime: lv.movetime });
    req.promise.then((a) => {
      if (cancelled || !a.bestmove) return;
      // A short pause, so instant replies at low levels do not feel abrupt.
      timer = setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        applyMove(a.bestmove!, true);
      }, Math.max(0, 450 - (Date.now() - started)));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      req.release();
      setThinking(false);
    };
  }, [engineReady, mode, practice, result, atLive, liveFen, playerColor, level, applyMove]);

  // --- Board input ---------------------------------------------------------

  const onPracticeMove = (uci: string) => {
    const p = practice;
    const engine = engines.current?.analysis;
    if (!p || !engine || (p.status !== 'try' && p.status !== 'revealed')) return false;
    const target = pliesRef.current[p.queue[p.pos]];
    const review = target?.review;
    const played = playUci(p.fen, uci);
    if (!review || !played) return false;
    // Once the solution is on the board, only that move continues.
    if (p.status === 'revealed' && uci !== review.bestUci) return false;
    const lastMove = { from: played.move.from, to: played.move.to };
    const solved = (feedback: string) => {
      if (latest.current.settings.sound) playSound('good');
      setPractice({ ...p, status: 'solved', shownFen: played.move.after, lastMove, feedback });
    };

    if (uci === review.bestUci) {
      solved(`Correct! ${played.move.san} is the engine's choice.`);
      return true;
    }
    setPractice({ ...p, status: 'checking', shownFen: played.move.after, lastMove, feedback: 'Checking…' });
    const req = engine.analyse(played.move.after, { depth: 12 });
    void req.promise.then((a) => {
      req.release();
      const score = a.lines[0]?.score;
      const loss = score ? winChanceFor(review.scoreBefore, p.side) - winChanceFor(score, p.side) : 100;
      if (uci !== target.uci && loss < 4) {
        solved(`${played.move.san} works too. The engine slightly preferred another move.`);
        return;
      }
      if (latest.current.settings.sound) playSound('bad');
      const attempts = p.attempts + 1;
      setPractice({
        ...p,
        attempts,
        status: 'checking',
        feedback: uci === target.uci ? 'That is the move from the game. Look for something better.' : 'Not quite. Try again.',
      });
      setTimeout(() => {
        setPractice((cur) =>
          cur && cur.pos === p.pos
            ? { ...cur, shownFen: cur.fen, lastMove: null, status: attempts >= 3 ? 'revealed' : 'try',
                feedback: attempts >= 3 ? 'Here is the engine move. Play it to continue.' : cur.feedback }
            : cur,
        );
      }, 900);
    });
    return true;
  };

  const onBoardMove = (uci: string) => {
    if (practice) return onPracticeMove(uci);
    if (mode === 'play' && (!isLive || result || viewTurn !== playerColor || thinking)) return false;
    return applyMove(uci, false);
  };

  // --- Actions -------------------------------------------------------------

  const reset = useCallback(() => {
    runId.current++;
    aiAbort.current?.abort();
    engines.current?.analysis.stopAll();
    engines.current?.player.stopAll();
    setCoach({});
    setPlan(null);
    setPractice(null);
    setProgress(null);
    setShowBest(false);
    setHint(null);
    setOverlayClosed(false);
    setTab('coach');
  }, []);

  const startGame = (g: NewGame) => {
    reset();
    const color = g.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : g.color;
    startRef.current = DEFAULT_POSITION;
    setStartFen(DEFAULT_POSITION);
    setMode(g.mode);
    setPlayerColor(color);
    setLevel(g.level);
    setFlipped(false);
    commit([]);
    setDialog(null);
  };

  const importGame = (text: string): string | null => {
    let start = DEFAULT_POSITION;
    let moves: string[] = [];
    if (validateFen(text).ok) {
      start = text;
    } else {
      const chess = new Chess();
      try {
        chess.loadPgn(text);
      } catch {
        return 'That does not look like a valid PGN or FEN.';
      }
      const verbose = chess.history({ verbose: true });
      if (!verbose.length) return 'The PGN has no moves.';
      start = verbose[0].before;
      moves = verbose.map((m) => m.from + m.to + (m.promotion ?? ''));
    }
    const list: Ply[] = [];
    let fen = start;
    for (const uci of moves) {
      const ply = buildPly(fen, uci, false);
      if (!ply) break;
      list.push(ply);
      fen = ply.fenAfter;
    }
    reset();
    startRef.current = start;
    setStartFen(start);
    setMode('analysis');
    setFlipped(false);
    commit(list, moves.length ? 0 : list.length);
    if (list.length) setTab('review');
    setDialog(null);
    return null;
  };

  const takeBack = () => {
    const list = pliesRef.current;
    let n = list.length;
    if (!n) return;
    if (mode === 'play') {
      while (n > 0 && list[n - 1].byEngine) n--;
      if (n > 0) n--;
    } else n--;
    engines.current?.player.stopAll();
    commit(list.slice(0, n));
    setShowBest(false);
    setHint(null);
  };

  const retryFrom = (index: number) => {
    engines.current?.player.stopAll();
    commit(pliesRef.current.slice(0, index));
    setShowBest(false);
  };

  const reviewGame = async () => {
    const run = ++runId.current;
    const todo = pliesRef.current.map((_, i) => i).filter((i) => !pliesRef.current[i].review);
    setProgress({ done: 0, total: todo.length });
    for (let k = 0; k < todo.length; k++) {
      if (runId.current !== run) return;
      await reviewAt(todo[k], 13);
      setProgress({ done: k + 1, total: todo.length });
    }
    if (runId.current === run) setProgress(null);
  };

  const practiceQueue = useMemo(
    () =>
      plies
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => isMiss(p.review?.classification) && (mode === 'analysis' || !p.byEngine))
        .map(({ i }) => i),
    [plies, mode],
  );

  const startPractice = (pos = 0, queue = practiceQueue) => {
    const ply = plies[queue[pos]];
    if (!ply) return setPractice(null);
    setTab('coach');
    goTo(queue[pos]);
    setPractice({
      queue,
      pos,
      fen: ply.fenBefore,
      shownFen: ply.fenBefore,
      side: ply.color,
      status: 'try',
      attempts: 0,
      feedback: `In the game, ${ply.san} was played here. Find a better move for ${colorName(ply.color)}.`,
      lastMove: null,
    });
  };

  const askPlan = () => {
    if (!liveForView || liveForView.depth < 8) return;
    const report: PositionReport = {
      fen: viewFen,
      history: standardStart ? history.slice(0, cursor) : [],
      lines: liveForView.lines.map((l) => ({ score: l.score, pv: l.pv.slice(0, 8) })),
      mood,
    };
    const entry: CoachEntry = { text: explainPosition(buildPositionFacts(report)), source: 'builtin', streaming: false };
    setPlan({ fen: viewFen, entry });
    if (aiAvailable) void askAI('plan', viewFen, report, entry);
  };

  const copyPgn = async () => {
    const chess = new Chess(startFen);
    if (!standardStart) {
      chess.setHeader('SetUp', '1');
      chess.setHeader('FEN', startFen);
    }
    chess.setHeader('Event', 'Chess Coach');
    chess.setHeader('White', names.w);
    chess.setHeader('Black', names.b);
    for (const p of plies) chess.move(parseUci(p.uci)!);
    try {
      await navigator.clipboard.writeText(chess.pgn());
      setToast('PGN copied to the clipboard');
    } catch {
      setToast('Copying is blocked in this browser');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Tilt detector -------------------------------------------------------

  // Time spent in each mood since the last move.
  useEffect(() => {
    moodWindow.current.set(mood, Date.now());
  }, [mood]);

  useEffect(() => {
    moodWindow.current.reset(Date.now());
    if (!moodActive) setMoodNote(null);
  }, [moodActive]);

  // Runs on mood changes and when a review lands: frustration often shows
  // before the engine has finished judging the move that caused it.
  const ownMoves = plies.filter((p) => mode === 'analysis' || !p.byEngine).length;

  useEffect(() => {
    if (!moodActive || practice) return;
    const list = plies;
    const isOwn = (p: Ply) => mode === 'analysis' || !p.byEngine;
    const shown = noteShownAt.current;

    const miss = isTilted(mood, list, isOwn);
    if (miss && shown.tilt !== ownMoves) {
      shown.tilt = ownMoves;
      const label = CLASS_INFO[miss.review!.classification].label.toLowerCase();
      setMoodNote({
        kind: 'tilt',
        text:
          `Tilt check: you look frustrated after the ${label} ${miss.san}. This is the moment when players most often blunder again.\n` +
          `Before the next move, take a breath and check: what does the opponent threaten, and which of your pieces are unprotected?`,
      });
      return;
    }

    // Surprised right after Stockfish's move: explain what that move does.
    const last = list[list.length - 1];
    if (mood === 'surprised' && last?.byEngine && last.review && shown.surprise !== list.length
        && Date.now() - lastPlyAt.current < 8000) {
      shown.surprise = list.length;
      const entry = builtinEntry(last, list.length - 1);
      if (entry) setMoodNote({ kind: 'surprise', text: `Surprised by ${last.san}? ${entry.text.split('\nTip:')[0]}` });
    }
  }, [mood, moodActive, plies, ownMoves, practice, mode, builtinEntry]);

  // A tilt warning stays until the player's next move; the other note fades.
  useEffect(() => {
    setMoodNote((n) => (n?.kind === 'tilt' && noteShownAt.current.tilt !== ownMoves ? null : n));
  }, [ownMoves]);

  useEffect(() => {
    if (moodNote?.kind !== 'surprise') return;
    const t = setTimeout(() => setMoodNote(null), 15000);
    return () => clearTimeout(t);
  }, [moodNote]);

  const moods = useMemo(() => moodReport(plies), [plies]);

  // Arrow keys step through the game, as on most chess sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || practice || (e.target as HTMLElement).closest('input, textarea')) return;
      const steps: Record<string, number> = {
        ArrowLeft: cursorRef.current - 1,
        ArrowRight: cursorRef.current + 1,
        Home: 0,
        End: pliesRef.current.length,
      };
      if (e.key in steps) {
        e.preventDefault();
        goTo(steps[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, practice, goTo]);

  // --- Board decorations ---------------------------------------------------

  const arrows: Arrow[] = [];
  const arrowFor = (uci: string | null | undefined, color: string) => {
    const m = uci && parseUci(uci);
    if (m) arrows.push({ startSquare: m.from, endSquare: m.to, color });
  };
  if (practice) {
    if (practice.status === 'revealed') arrowFor(plies[practice.queue[practice.pos]]?.review?.bestUci, 'rgb(129 182 76 / 0.9)');
  } else {
    if (hint && isLive) arrowFor(hint, 'rgb(233 180 76 / 0.9)');
    if (showBest && viewPly?.review) arrowFor(viewPly.review.bestUci, 'rgb(129 182 76 / 0.9)');
    if (engineVisible && !hint && !showBest && liveForView && liveForView.depth >= 10 && !result) {
      arrowFor(liveForView.lines[0]?.pv[0], 'rgb(92 139 214 / 0.55)');
    }
  }

  const movable: 'w' | 'b' | null = practice
    ? practice.status === 'try' || practice.status === 'revealed' ? practice.side : null
    : !engineReady && mode === 'play'
      ? null
      : mode === 'analysis'
        ? viewTurn
        : isLive && !result && !thinking && viewTurn === playerColor
          ? playerColor
          : null;

  const orientation = (mode === 'play' && playerColor === 'b') !== flipped ? 'black' : 'white';
  const topSide = orientation === 'white' ? 'b' : 'w';
  const bottomSide = topSide === 'w' ? 'b' : 'w';
  const entryFor = (ply: Ply | null, index: number) =>
    ply ? coach[keyOf(ply)] ?? builtinEntry(ply, index) : undefined;
  const replyPly = mode === 'play' && coachIndex >= 0 && coachIndex + 1 < plies.length ? plies[coachIndex + 1] : null;
  const canRetry = Boolean(mode === 'play' && coachPly && !coachPly.byEngine && isMiss(coachPly.review?.classification));

  const badges: { square: string; classification: Classification }[] = [];
  // During a live game the player's verdict stays on the board next to the reply,
  // unless the reply captured on that very square.
  if (coachPly?.review && coachPly !== viewPly && replyPly?.to !== coachPly.to) {
    badges.push({ square: coachPly.to, classification: coachPly.review.classification });
  }
  if (viewPly?.review) badges.push({ square: viewPly.to, classification: viewPly.review.classification });

  const playerBar = (side: 'w' | 'b') => (
    <div className="flex h-8 items-center justify-between px-1 text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <span className={`size-3 rounded-full ${side === 'w' ? 'bg-[#eef0f5]' : 'bg-[#2a2f3f] ring-1 ring-line-strong'}`} />
        {names[side]}
        {mode === 'play' && names[side] === 'Stockfish' && (
          <span className="chip bg-panel-2 font-medium text-muted">{LEVELS[level].name}</span>
        )}
      </span>
      {thinking && names[side] === 'Stockfish' && (
        <span className="flex items-center gap-1 text-xs text-gold">
          thinking<span className="thinking-dot">●</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1240px] flex-col px-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gold-soft text-gold">
            <Icon.Knight />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none">Chess Coach</h1>
            <p className="mt-1 text-xs text-faint">
              {mode === 'play' ? `Playing ${colorName(playerColor)} vs Stockfish` : 'Analysis board'}
              {opening && ` · ${opening.name}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {moodSlot}
          <button
            type="button"
            className={`btn btn-icon ${settings.sound ? '' : 'text-faint'}`}
            onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
            title={settings.sound ? 'Sound on' : 'Sound off'}
            aria-pressed={settings.sound}
          >
            {settings.sound ? <Icon.Sound /> : <Icon.Mute />}
          </button>
          {mode === 'play' && (
            <button
              type="button"
              className={`btn btn-icon ${settings.showEngine ? 'text-gold' : 'text-faint'}`}
              onClick={() => setSettings((s) => ({ ...s, showEngine: !s.showEngine }))}
              title={settings.showEngine ? 'Hide the engine while playing' : 'Show the engine while playing'}
              aria-pressed={settings.showEngine}
            >
              <Icon.Eye />
            </button>
          )}
          {aiAvailable && (
            <button
              type="button"
              className={`btn btn-icon ${settings.autoAI ? 'text-gold' : 'text-faint'}`}
              onClick={() => setSettings((s) => ({ ...s, autoAI: !s.autoAI }))}
              title={settings.autoAI ? 'AI explains key moves automatically' : 'AI explains moves only on request'}
              aria-pressed={settings.autoAI}
            >
              <Icon.Sparkle />
            </button>
          )}
          <button type="button" className="btn" onClick={() => setDialog('import')}>
            <Icon.Upload /> Import
          </button>
          <button type="button" className="btn btn-gold" onClick={() => setDialog('new')}>
            <Icon.Plus /> New game
          </button>
        </div>
      </header>

      <main className="grid flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="mx-auto w-full max-w-[min(100%,calc(100dvh-210px+3rem))] lg:mx-0">
          {playerBar(topSide)}
          <div className="flex gap-2 sm:gap-3">
            {engineVisible ? (
              <EvalBar score={liveForView?.lines[0]?.score ?? null} depth={liveForView?.depth ?? 0} flipped={orientation === 'black'} />
            ) : (
              <div className="w-3.5 shrink-0 rounded-md bg-[#2a2f3f]/50 sm:w-6" title="Engine hidden while playing" />
            )}
            <div className="relative min-w-0 flex-1">
              <Board
                fen={viewFen}
                orientation={orientation}
                movable={movable}
                lastMove={practice ? practice.lastMove : viewPly ? { from: viewPly.from, to: viewPly.to } : null}
                badges={badges}
                arrows={arrows}
                onMove={onBoardMove}
              />
              {!engineReady && (
                <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-muted">
                  {engineError ? 'Stockfish could not start in this browser' : 'Loading Stockfish…'}
                </div>
              )}
              {result && isLive && !overlayClosed && (
                <div className="absolute inset-0 z-30 grid place-items-center rounded-xl bg-black/45 p-4">
                  <div className="card relative max-w-xs bg-panel p-5 text-center shadow-2xl">
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-md p-1 text-faint hover:text-ink"
                      onClick={() => setOverlayClosed(true)}
                      aria-label="Close"
                    >
                      <Icon.Close />
                    </button>
                    <p className="font-display text-2xl font-bold">{result}</p>
                    <p className="mt-1 text-sm text-muted">See where the game was won and lost.</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        type="button"
                        className="btn btn-gold"
                        onClick={() => {
                          setOverlayClosed(true);
                          setTab('review');
                          void reviewGame();
                        }}
                      >
                        Review game
                      </button>
                      <button type="button" className="btn" onClick={() => setDialog('new')}>
                        New game
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {playerBar(bottomSide)}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" className="btn btn-icon" onClick={() => goTo(0)} disabled={!cursor || !!practice} title="First move">
              <Icon.First />
            </button>
            <button type="button" className="btn btn-icon" onClick={() => goTo(cursor - 1)} disabled={!cursor || !!practice} title="Previous move">
              <Icon.Prev />
            </button>
            <button type="button" className="btn btn-icon" onClick={() => goTo(cursor + 1)} disabled={cursor === plies.length || !!practice} title="Next move">
              <Icon.Next />
            </button>
            <button type="button" className="btn btn-icon" onClick={() => goTo(plies.length)} disabled={cursor === plies.length || !!practice} title="Last move">
              <Icon.Last />
            </button>
            <span className="mx-1 h-6 w-px bg-line" />
            <button type="button" className="btn btn-icon" onClick={() => setFlipped((f) => !f)} title="Flip board">
              <Icon.Flip />
            </button>
            <button type="button" className="btn btn-icon" onClick={takeBack} disabled={!plies.length || !!practice || thinking} title="Take back">
              <Icon.Undo />
            </button>
            <button type="button" className="btn btn-icon" onClick={copyPgn} disabled={!plies.length} title="Copy PGN">
              <Icon.Copy />
            </button>
            {mode === 'play' && (
              <button
                type="button"
                className="btn"
                disabled={!isLive || !!result || viewTurn !== playerColor || !liveForView || liveForView.depth < 10}
                onClick={() => setHint(liveForView?.lines[0]?.pv[0] ?? null)}
                title="Show a good move"
              >
                <Icon.Bulb /> Hint
              </button>
            )}
            {mode === 'play' && !isLive && !practice && (
              <button type="button" className="btn border-gold/40 text-gold" onClick={() => goTo(plies.length)}>
                Back to game
              </button>
            )}
          </div>
        </section>

        <aside className="card flex min-h-[420px] flex-col overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]">
          <nav className="flex border-b border-line" role="tablist">
            {(['coach', 'moves', 'review'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold capitalize ${
                  tab === t ? 'border-b-2 border-gold text-ink' : 'text-faint hover:text-muted'
                }`}
              >
                {t}
                {t === 'moves' && plies.length > 0 && <span className="ml-1 text-xs text-faint">{plies.length}</span>}
              </button>
            ))}
          </nav>

          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
            {tab === 'coach' && (
              <>
                {moodNote && (
                  <div
                    className={`rise flex gap-3 rounded-xl border p-3 text-sm leading-relaxed ${
                      moodNote.kind === 'tilt' ? 'border-bad/50 bg-bad/10' : 'border-gold/30 bg-gold-soft'
                    }`}
                    role={moodNote.kind === 'tilt' ? 'alert' : undefined}
                  >
                    <span className={`mt-0.5 ${moodNote.kind === 'tilt' ? 'text-bad' : 'text-gold'}`}>
                      <Icon.Camera />
                    </span>
                    <p className="flex-1 whitespace-pre-line">{moodNote.text}</p>
                    <button type="button" className="self-start text-faint hover:text-ink" onClick={() => setMoodNote(null)} aria-label="Dismiss">
                      <Icon.Close />
                    </button>
                  </div>
                )}
                {practice ? (
                  <div className="rounded-xl border border-gold/30 bg-panel-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gold">
                      Learn from mistakes · {practice.pos + 1} of {practice.queue.length}
                    </p>
                    <p className="mt-2 text-[15px] leading-relaxed">{practice.feedback}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {practice.status === 'try' && practice.attempts > 0 && (
                        <button type="button" className="btn" onClick={() => setPractice({ ...practice, status: 'revealed', feedback: 'Here is the engine move. Play it to continue.' })}>
                          Show solution
                        </button>
                      )}
                      {practice.status === 'solved' && practice.pos + 1 < practice.queue.length && (
                        <button type="button" className="btn btn-gold" onClick={() => startPractice(practice.pos + 1, practice.queue)}>
                          Next position
                        </button>
                      )}
                      <button type="button" className="btn" onClick={() => setPractice(null)}>
                        {practice.status === 'solved' && practice.pos + 1 >= practice.queue.length ? 'Done' : 'Stop practice'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <CoachCard
                    ply={coachPly}
                    entry={entryFor(coachPly, coachIndex)}
                    reply={replyPly}
                    onShowReply={() => goTo(coachIndex + 2)}
                    aiAvailable={aiAvailable}
                    showBest={showBest && coachPly === viewPly}
                    canRetry={canRetry}
                    onAskAI={() => explainWithAI(coachIndex)}
                    onToggleBest={() => {
                      if (coachPly !== viewPly) {
                        // The arrow belongs to the position right after that move.
                        goTo(coachIndex + 1);
                        setShowBest(true);
                      } else setShowBest((s) => !s);
                    }}
                    onRetry={() => retryFrom(coachIndex)}
                    intro={
                      mode === 'play'
                        ? 'Make your move. Stockfish checks every move you play, and the coach explains what changed: what was good, what went wrong, and what to play instead.'
                        : 'Move pieces for both sides, or import a game. Every move is checked by Stockfish and explained by the coach.'
                    }
                  />
                )}

                {engineVisible && !practice && (
                  <div className="rounded-xl border border-line p-3">
                    <EngineLines
                      analysis={liveForView}
                      onPlay={mode === 'analysis' ? (uci) => applyMove(uci, false) : undefined}
                    />
                    <button
                      type="button"
                      className="btn mt-3 w-full"
                      onClick={askPlan}
                      disabled={!liveForView || liveForView.depth < 8 || plan?.entry.streaming}
                    >
                      <Icon.Compass /> What is the plan here?
                    </button>
                    {plan && plan.fen === viewFen && (
                      <div className="rise mt-3 rounded-lg bg-panel-2 p-3 text-sm leading-relaxed text-ink/90">
                        <p className="mb-1 text-xs text-faint">
                          {plan.entry.source === 'ai' ? 'AI coach · grounded in Stockfish' : 'Coach'}
                          {plan.entry.streaming && <span className="thinking-dot ml-1">●</span>}
                        </p>
                        <p className="whitespace-pre-line">{plan.entry.text}</p>
                        {plan.entry.note && <p className="mt-2 text-xs text-faint">{plan.entry.note}</p>}
                      </div>
                    )}
                  </div>
                )}

                {!engineVisible && !practice && (
                  <p className="px-1 text-xs text-faint">
                    The engine evaluation is hidden while playing. Use the eye button to show it, or ask for a hint.
                  </p>
                )}
              </>
            )}

            {tab === 'moves' && <MoveList plies={plies} cursor={cursor} startMove={startMove} onSelect={goTo} />}

            {tab === 'review' && (
              <ReviewPanel
                plies={plies}
                cursor={cursor}
                summary={summary}
                moods={moods}
                cameraOn={moodActive}
                names={names}
                progress={progress}
                practiceCount={practiceQueue.length}
                onSelect={(c) => {
                  setPractice(null);
                  goTo(c);
                }}
                onReview={reviewGame}
                onPractice={() => startPractice()}
              />
            )}
          </div>
        </aside>
      </main>

      <footer className="mt-10 text-center text-xs text-faint">
        Stockfish 19 runs in your browser (WebAssembly).{' '}
        {aiAvailable ? 'AI explanations by Claude, based only on engine facts.' : 'Built-in explanations based on engine facts.'}
      </footer>

      {dialog === 'new' && (
        <NewGameDialog
          initial={{ mode, color: playerColor, level }}
          onStart={startGame}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'import' && <ImportDialog onImport={importGame} onClose={() => setDialog(null)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-panel-2 px-4 py-2 text-sm shadow-xl ring-1 ring-line">
          {toast}
        </div>
      )}
    </div>
  );
}
