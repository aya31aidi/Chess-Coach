/**
 * The coach, without the AI part. Raw engine output is turned into checked
 * facts here; the same facts feed the built-in explanations (always
 * available, instant) and the prompt for the AI coach on the server.
 */

import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import {
  CLASS_INFO, CLASSIFICATIONS, describeScore, formatScore, winChanceFor,
  type Classification, type Score,
} from './eval';
import { findOpening } from './openings';
import {
  colorName, describePiece, gamePhase, hangingPieces, lineToSan, numberLine,
  other, PIECE_NAME, playUci, type Phase,
} from './position';

export type Mood = 'neutral' | 'happy' | 'frustrated' | 'surprised' | 'focused';
export const MOODS: Mood[] = ['neutral', 'happy', 'frustrated', 'surprised', 'focused'];

/** What the browser sends about one move. Everything in it is re-checked. */
export interface MoveReport {
  fenBefore: string;
  uci: string;
  /** SAN moves from the standard start up to this position, for the opening
      name. Empty for games set up from a custom position. */
  history: string[];
  bestLine: string[];
  replyLine: string[];
  scoreBefore: Score;
  scoreAfter: Score;
  classification: Classification;
  mood?: Mood;
}

export interface PositionReport {
  fen: string;
  history: string[];
  lines: { score: Score; pv: string[] }[];
  mood?: Mood;
}

export interface MoveFacts {
  side: string;
  opponent: string;
  moveLabel: string;
  san: string;
  classification: Classification;
  label: string;
  evalBefore: string;
  evalAfter: string;
  verdictAfter: string;
  winBefore: number;
  winAfter: number;
  bestSan: string | null;
  bestLine: string;
  playedWasBest: boolean;
  bestCaptures: string | null;
  replySan: string | null;
  replyLine: string;
  captured: string | null;
  check: boolean;
  checkmate: boolean;
  /** Moves until the opponent mates, when the move allows a forced mate. */
  allowsMate: number | null;
  hanging: string[];
  opening: string | null;
  phase: Phase;
  mood: Mood;
}

export interface PositionFacts {
  side: string;
  moveLabel: string;
  eval: string;
  verdict: string;
  /** `win` is the side to move's winning chance after that line. */
  lines: { line: string; eval: string; win: number }[];
  canWin: string[];
  opening: string | null;
  phase: Phase;
  mood: Mood;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function moveLabel(fen: string) {
  const [, turn, , , , no] = fen.split(' ');
  return turn === 'w' ? `${no}.` : `${no}…`;
}

export function buildMoveFacts(r: MoveReport): MoveFacts | null {
  const played = playUci(r.fenBefore, r.uci);
  if (!played) return null;
  const { chess: after, move } = played;
  const side = move.color;

  const bestSanLine = lineToSan(r.fenBefore, r.bestLine, 6);
  const replySanLine = lineToSan(move.after, r.replyLine, 6);
  const best = r.bestLine[0] ? playUci(r.fenBefore, r.bestLine[0]) : null;
  // Mate scores are White-relative: a mate against the mover has the other sign.
  const mateAgainst = 'mate' in r.scoreAfter && r.scoreAfter.mate !== 0 && (r.scoreAfter.mate > 0) !== (side === 'w')
    ? Math.abs(r.scoreAfter.mate)
    : null;

  return {
    side: colorName(side),
    opponent: colorName(other(side)),
    moveLabel: moveLabel(r.fenBefore),
    san: move.san,
    classification: r.classification,
    label: CLASS_INFO[r.classification].label,
    evalBefore: formatScore(r.scoreBefore),
    evalAfter: formatScore(r.scoreAfter),
    verdictAfter: describeScore(r.scoreAfter),
    winBefore: Math.round(winChanceFor(r.scoreBefore, side)),
    winAfter: Math.round(winChanceFor(r.scoreAfter, side)),
    bestSan: bestSanLine[0] ?? null,
    bestLine: numberLine(r.fenBefore, bestSanLine),
    playedWasBest: r.bestLine[0] === r.uci,
    bestCaptures: best?.move.captured ? PIECE_NAME[best.move.captured] : null,
    replySan: replySanLine[0] ?? null,
    replyLine: numberLine(move.after, replySanLine),
    captured: move.captured ? PIECE_NAME[move.captured] : null,
    check: after.inCheck(),
    checkmate: after.isCheckmate(),
    allowsMate: mateAgainst,
    hanging: hangingPieces(after, side).map(describePiece),
    opening: r.history.length || r.fenBefore === DEFAULT_POSITION
      ? findOpening([...r.history, move.san])?.name ?? null
      : null,
    phase: gamePhase(after, r.history.length + 1),
    mood: r.mood ?? 'neutral',
  };
}

export function buildPositionFacts(r: PositionReport): PositionFacts {
  const chess = new Chess(r.fen);
  const side = chess.turn();
  const top = r.lines[0]?.score ?? { cp: 0 };
  return {
    side: colorName(side),
    moveLabel: moveLabel(r.fen),
    eval: formatScore(top),
    verdict: describeScore(top),
    lines: r.lines.slice(0, 3).map((l) => ({
      line: numberLine(r.fen, lineToSan(r.fen, l.pv, 6)),
      eval: formatScore(l.score),
      win: winChanceFor(l.score, side),
    })).filter((l) => l.line),
    canWin: hangingPieces(chess, other(side)).map(describePiece),
    opening: findOpening(r.history)?.name ?? null,
    phase: gamePhase(chess, r.history.length),
    mood: r.mood ?? 'neutral',
  };
}

// ---------------------------------------------------------------------------
// Built-in explanations

function moodOpening(f: MoveFacts): string {
  const bad = ['inaccuracy', 'mistake', 'blunder'].includes(f.classification);
  const good = ['brilliant', 'great', 'best'].includes(f.classification);
  if (f.mood === 'frustrated' && bad) return 'Deep breath: this happens to every player. ';
  if (f.mood === 'happy' && good) return 'Well deserved smile. ';
  if (f.mood === 'surprised' && bad) return 'Surprised? Here is what happened. ';
  return '';
}

function tipFor(f: MoveFacts): string {
  if (f.checkmate) return '';
  if (f.allowsMate) return 'Before grabbing material, check every check the opponent gets in return.';
  if (f.hanging.length) return 'Before each move, check which pieces it leaves without protection.';
  if (f.bestCaptures && !f.captured) return 'Look at checks, captures and threats first; a free piece was on the board.';
  if (f.classification === 'blunder' || f.classification === 'mistake') {
    return 'Ask what the opponent wants to do after the move, not only what the move itself does.';
  }
  if (f.phase === 'opening' && f.classification === 'inaccuracy') {
    return 'In the opening, develop pieces, fight for the centre and castle early.';
  }
  return '';
}

export function explainMove(f: MoveFacts): string {
  const parts: string[] = [moodOpening(f)];
  const move = `${f.moveLabel} ${f.san}`;
  const better = f.bestLine || f.bestSan;

  switch (f.classification) {
    case 'book':
      parts.push(`${move} is a known opening move${f.opening ? `, part of the ${f.opening}` : ''}.`);
      break;
    case 'brilliant':
      parts.push(`${move} gives up material on purpose, and the engine confirms it works.`);
      if (f.replyLine) parts.push(`The main line goes ${f.replyLine}.`);
      parts.push(`${capitalize(f.verdictAfter)} (${f.evalAfter}).`);
      break;
    case 'great':
      parts.push(`${move} is the only move that keeps the position together; the alternatives lose ground.`);
      parts.push(`${capitalize(f.verdictAfter)} (${f.evalAfter}).`);
      break;
    case 'best':
      parts.push(`${move} is the engine's top choice.`);
      if (f.checkmate) parts.push('Checkmate.');
      else {
        if (f.captured) parts.push(`It wins the ${f.captured}.`);
        else if (f.check) parts.push('It comes with check.');
        parts.push(`${capitalize(f.verdictAfter)} (${f.evalAfter}).`);
      }
      break;
    case 'excellent':
    case 'good':
      parts.push(`${move} ${CLASS_INFO[f.classification].phrase}.`);
      if (better) parts.push(`${better} was a little more precise.`);
      parts.push(`${capitalize(f.verdictAfter)} (${f.evalAfter}).`);
      break;
    case 'inaccuracy':
      parts.push(`${move} is an inaccuracy: the evaluation goes from ${f.evalBefore} to ${f.evalAfter}.`);
      if (better) parts.push(`Stronger was ${better}.`);
      break;
    case 'mistake':
    case 'blunder':
      parts.push(`${move} ${CLASS_INFO[f.classification].phrase}.`);
      if (f.allowsMate) {
        parts.push(`It allows a forced mate in ${f.allowsMate}${f.replyLine ? `: ${f.replyLine}` : ''}.`);
      } else {
        if (f.hanging.length) parts.push(`It leaves the ${f.hanging[0]} unprotected.`);
        if (f.replyLine) parts.push(`${f.opponent} answers ${f.replyLine}.`);
      }
      if (better) parts.push(`Better was ${better}.`);
      if (!f.allowsMate) parts.push(`Now ${f.verdictAfter} (${f.evalAfter}).`);
      break;
  }

  const tip = tipFor(f);
  if (tip) parts.push(`\nTip: ${tip}`);
  return parts.join(' ').replace(/ \n/g, '\n').trim();
}

export function explainPosition(f: PositionFacts): string {
  const parts = [`${capitalize(f.verdict)} (${f.eval}).`];
  if (f.opening) parts.push(`Opening: ${f.opening}.`);
  if (f.canWin.length) parts.push(`${f.side} can win the ${f.canWin[0]}.`);
  const [main, second] = f.lines;
  if (main) parts.push(`The engine's main idea: ${main.line}.`);
  if (main && second) {
    // In a lost position every line is bad, so "good" would mislead.
    const lost = main.win < 10;
    const close = main.win - second.win <= 8;
    parts.push(
      lost
        ? `Another way to fight on: ${second.line} (${second.eval}).`
        : close
          ? `Also good: ${second.line} (${second.eval}).`
          : `Other moves are clearly weaker, for example ${second.line} (${second.eval}).`,
    );
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// AI prompt

export const COACH_SYSTEM = `You are the coach inside a chess training app. A club player has asked about one move or one position.

Ground rules:
- Use only the facts below. The evaluations and lines come from Stockfish and are verified; treat anything else as unknown.
- Never invent moves or variations that are not in the facts. Quote moves exactly as written.
- When the facts do not show why a move is good or bad, say what the engine prefers and stop there rather than guessing.
- Explain ideas (threats, weak squares, piece activity, king safety) only when the given lines clearly show them.
- Write 2 to 4 short sentences in plain text, speaking to the player as "you". No headings, no lists, no markdown.
- End with one line starting with "Tip:" holding one general principle the player can reuse.
- Match the tone to the player's mood when one is given: encouraging when frustrated, celebratory when happy, calm and clear when surprised.`;

function moodLine(mood: Mood) {
  return mood === 'neutral' ? '' : `\nPlayer's mood (from the optional camera): ${mood}`;
}

export function movePrompt(f: MoveFacts): string {
  const lines = [
    `Explain this move.`,
    `Move: ${f.moveLabel} ${f.san}, played by ${f.side}`,
    `Engine verdict: ${f.label}`,
    `Evaluation before: ${f.evalBefore} (White's view); after: ${f.evalAfter} (${f.verdictAfter})`,
    `${f.side}'s winning chances: ${f.winBefore}% before, ${f.winAfter}% after`,
    f.playedWasBest ? 'This was the engine\'s first choice.' : f.bestSan ? `Engine's best move instead: ${f.bestSan}${f.bestLine ? `, line ${f.bestLine}` : ''}` : '',
    f.bestCaptures && !f.playedWasBest ? `The best move would have captured a ${f.bestCaptures}.` : '',
    f.replyLine ? `Best play for ${f.opponent} after the move: ${f.replyLine}` : '',
    f.captured ? `The move captured a ${f.captured}.` : '',
    f.checkmate ? 'The move is checkmate.' : f.check ? 'The move gives check.' : '',
    f.allowsMate ? `The move allows ${f.opponent} a forced mate in ${f.allowsMate}.` : '',
    f.hanging.length ? `${f.side}'s pieces now hanging: ${f.hanging.join(', ')}` : '',
    f.opening ? `Opening: ${f.opening}` : '',
    `Game phase: ${f.phase}`,
  ];
  return lines.filter(Boolean).join('\n') + moodLine(f.mood);
}

export function positionPrompt(f: PositionFacts): string {
  const lines = [
    `Explain the plan in this position for the side to move.`,
    `${f.side} to move (${f.moveLabel})`,
    `Evaluation: ${f.eval} (White's view), meaning ${f.verdict}`,
    ...f.lines.map((l, i) => `Engine line ${i + 1} (${l.eval}): ${l.line}`),
    f.canWin.length ? `${f.side} can win: ${f.canWin.join(', ')}` : '',
    f.opening ? `Opening: ${f.opening}` : '',
    `Game phase: ${f.phase}`,
  ];
  return lines.filter(Boolean).join('\n') + moodLine(f.mood);
}

// ---------------------------------------------------------------------------
// Input checks for the API route

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SAN_RE = /^[KQRBNa-hO1-8x=+#-]{2,8}$/;

function readScore(v: unknown): Score | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.cp === 'number' && Number.isFinite(o.cp) && Math.abs(o.cp) <= 100000) return { cp: Math.round(o.cp) };
  if (typeof o.mate === 'number' && Number.isInteger(o.mate) && Math.abs(o.mate) <= 500) return { mate: o.mate };
  return null;
}

const readUciList = (v: unknown, max = 12) =>
  Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string' && UCI_RE.test(m)).slice(0, max) : [];

const readHistory = (v: unknown) =>
  Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string' && SAN_RE.test(m)).slice(0, 600) : [];

const readFen = (v: unknown) => (typeof v === 'string' && v.length < 100 && validateFen(v).ok ? v : null);

const readMood = (v: unknown): Mood => (MOODS.includes(v as Mood) ? (v as Mood) : 'neutral');

export function readMoveReport(v: Record<string, unknown>): MoveReport | null {
  const fenBefore = readFen(v.fenBefore);
  const scoreBefore = readScore(v.scoreBefore);
  const scoreAfter = readScore(v.scoreAfter);
  const classification = CLASSIFICATIONS.includes(v.classification as Classification)
    ? (v.classification as Classification) : null;
  if (!fenBefore || !scoreBefore || !scoreAfter || !classification) return null;
  if (typeof v.uci !== 'string' || !UCI_RE.test(v.uci)) return null;
  return {
    fenBefore,
    uci: v.uci,
    history: readHistory(v.history),
    bestLine: readUciList(v.bestLine),
    replyLine: readUciList(v.replyLine),
    scoreBefore,
    scoreAfter,
    classification,
    mood: readMood(v.mood),
  };
}

export function readPositionReport(v: Record<string, unknown>): PositionReport | null {
  const fen = readFen(v.fen);
  if (!fen || !Array.isArray(v.lines)) return null;
  const lines = v.lines.slice(0, 3).flatMap((l) => {
    const o = (l ?? {}) as Record<string, unknown>;
    const score = readScore(o.score);
    return score ? [{ score, pv: readUciList(o.pv) }] : [];
  });
  return { fen, history: readHistory(v.history), lines, mood: readMood(v.mood) };
}
