/**
 * The record of a game and the verdict on each of its moves. Pure functions
 * only; the engine calls live in the component that owns the game.
 */

import type { Color, PieceSymbol, Square } from 'chess.js';
import type { Mood } from './coach';
import type { Analysis } from './engine';
import { classify, moveAccuracy, type Classification, type Score } from './eval';
import { isBookLine } from './openings';
import { isSacrifice } from './position';

export interface Ply {
  san: string;
  uci: string;
  from: Square;
  to: Square;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  captured?: PieceSymbol;
  check: boolean;
  byEngine: boolean;
  /** How the player looked while choosing this move (mood camera on only). */
  mood?: Mood;
  review?: PlyReview;
}

export interface PlyReview {
  classification: Classification;
  winLoss: number;
  accuracy: number;
  scoreBefore: Score;
  scoreAfter: Score;
  bestUci: string | null;
  bestLine: string[];
  replyLine: string[];
}

const ZERO: Score = { cp: 0 };

/** `bookHistory` is null for games set up from a custom position. */
export function reviewPly(
  ply: Ply,
  index: number,
  bookHistory: string[] | null,
  before: Analysis,
  after: Analysis,
): PlyReview {
  const best = before.lines[0];
  const second = before.lines[1];
  const reply = after.lines[0];
  const bestUci = best?.pv[0] ?? null;
  const scoreBefore = best?.score ?? ZERO;
  const scoreAfter = reply?.score ?? scoreBefore;

  const { classification, winLoss } = classify({
    side: ply.color,
    bestScore: scoreBefore,
    secondScore: second?.score,
    playedScore: scoreAfter,
    playedIsBest: bestUci === ply.uci,
    isSacrifice: isSacrifice(ply.fenBefore, ply.uci),
    isBook: bookHistory !== null && index < 20 && isBookLine(bookHistory, index + 1),
    isCapture: Boolean(ply.captured),
  });

  return {
    classification,
    winLoss,
    accuracy: moveAccuracy(winLoss),
    scoreBefore,
    scoreAfter,
    bestUci,
    bestLine: best?.pv ?? [],
    replyLine: reply?.pv ?? [],
  };
}

export interface GameSummary {
  accuracy: Record<Color, number | null>;
  counts: Record<Color, Partial<Record<Classification, number>>>;
  reviewed: number;
}

export function summarize(plies: Ply[], gameAccuracy: (a: number[]) => number | null): GameSummary {
  const acc: Record<Color, number[]> = { w: [], b: [] };
  const counts: GameSummary['counts'] = { w: {}, b: {} };
  let reviewed = 0;
  for (const p of plies) {
    if (!p.review) continue;
    reviewed++;
    // Book moves say nothing about how well someone plays.
    if (p.review.classification !== 'book') acc[p.color].push(p.review.accuracy);
    const c = counts[p.color];
    c[p.review.classification] = (c[p.review.classification] ?? 0) + 1;
  }
  return { accuracy: { w: gameAccuracy(acc.w), b: gameAccuracy(acc.b) }, counts, reviewed };
}

export const isMiss = (c?: Classification) => c === 'mistake' || c === 'blunder';

// ---------------------------------------------------------------------------
// Tilt: how the player's mood lines up with the quality of their moves

export type MoodGroup = 'calm' | 'happy' | 'surprised' | 'frustrated';

export const MOOD_GROUP_INFO: Record<MoodGroup, { label: string; color: string }> = {
  calm: { label: 'Calm', color: '#7d8aa8' },
  happy: { label: 'Happy', color: '#e9b44c' },
  surprised: { label: 'Surprised', color: '#5c8bd6' },
  frustrated: { label: 'Frustrated', color: '#e5484d' },
};

/** Focused counts as calm: a frown of concentration is not tilt. */
export const moodGroup = (m: Mood): MoodGroup =>
  m === 'neutral' || m === 'focused' ? 'calm' : m;

export interface MoodStats {
  group: MoodGroup;
  moves: number;
  accuracy: number;
  misses: number;
}

export interface MoodReport {
  stats: MoodStats[];
  /** One sentence on the clearest pattern, or null with too little data. */
  insight: string | null;
  tracked: number;
}

const ORDER: MoodGroup[] = ['calm', 'happy', 'surprised', 'frustrated'];

export function moodReport(plies: Ply[]): MoodReport {
  const own = plies.filter((p) => p.mood && p.review && p.review.classification !== 'book');
  const by = new Map<MoodGroup, Ply[]>();
  for (const p of own) {
    const g = moodGroup(p.mood!);
    by.set(g, [...(by.get(g) ?? []), p]);
  }
  const stats = ORDER.filter((g) => by.has(g)).map((group) => {
    const list = by.get(group)!;
    return {
      group,
      moves: list.length,
      accuracy: list.reduce((s, p) => s + p.review!.accuracy, 0) / list.length,
      misses: list.filter((p) => isMiss(p.review!.classification)).length,
    };
  });

  const get = (g: MoodGroup) => stats.find((s) => s.group === g);
  const frustrated = get('frustrated');
  const calm = get('calm');
  const misses = stats.reduce((s, x) => s + x.misses, 0);
  let insight: string | null = null;

  if (own.length >= 4) {
    if (frustrated && misses >= 2 && frustrated.misses / misses >= 0.5) {
      insight = `${frustrated.misses} of your ${misses} mistakes came while you looked frustrated.`;
    } else if (frustrated && calm && frustrated.moves >= 2 && calm.moves >= 2 && calm.accuracy - frustrated.accuracy >= 10) {
      insight = `Your accuracy dropped from ${Math.round(calm.accuracy)} when calm to ${Math.round(frustrated.accuracy)} when frustrated.`;
    } else if (!frustrated) {
      insight = 'No frustration detected during this game: steady nerves.';
    } else if (frustrated.misses === 0) {
      insight = 'You had frustrated moments, but they did not cost you any mistakes.';
    }
  }
  return { stats, insight, tracked: own.length };
}

/**
 * Tilt: the player looks frustrated and one of their last few moves was a
 * mistake. That combination is when players most often blunder again.
 */
export function isTilted(mood: Mood, plies: Ply[], isOwn: (p: Ply) => boolean): Ply | null {
  if (mood !== 'frustrated') return null;
  const recent = plies.filter(isOwn).slice(-3);
  return [...recent].reverse().find((p) => isMiss(p.review?.classification)) ?? null;
}
