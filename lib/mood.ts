/**
 * Mood from MediaPipe face blendshapes: smile, frown, raised brows, open jaw.
 *
 * The 2024 version of this idea trained a Random Forest on raw face mesh
 * landmarks. Blendshapes already describe expressions, so a few readable
 * rules do the same job with no training data. Readings are smoothed, and a
 * new mood has to hold for a moment before it counts, so a blink or a quick
 * glance away does not flip the coach's tone.
 */

import type { Mood } from './coach';

export interface Blendshape {
  categoryName: string;
  score: number;
}

export interface Expression {
  smile: number;
  frown: number;
  browDown: number;
  browUp: number;
  eyeWide: number;
  jawOpen: number;
  press: number;
}

const avg = (m: Map<string, number>, ...names: string[]) =>
  names.reduce((s, n) => s + (m.get(n) ?? 0), 0) / names.length;

export function readExpression(shapes: Blendshape[]): Expression {
  const m = new Map(shapes.map((s) => [s.categoryName, s.score]));
  return {
    smile: avg(m, 'mouthSmileLeft', 'mouthSmileRight'),
    frown: avg(m, 'mouthFrownLeft', 'mouthFrownRight'),
    browDown: avg(m, 'browDownLeft', 'browDownRight'),
    browUp: Math.max(m.get('browInnerUp') ?? 0, avg(m, 'browOuterUpLeft', 'browOuterUpRight')),
    eyeWide: avg(m, 'eyeWideLeft', 'eyeWideRight'),
    jawOpen: m.get('jawOpen') ?? 0,
    press: avg(m, 'mouthPressLeft', 'mouthPressRight'),
  };
}

export function moodOf(e: Expression): Mood {
  if (e.smile > 0.45) return 'happy';
  if (e.jawOpen > 0.3 && (e.browUp > 0.4 || e.eyeWide > 0.3)) return 'surprised';
  if (e.browDown > 0.45 || e.frown > 0.3 || e.press > 0.55) return 'frustrated';
  if (e.browDown > 0.2) return 'focused';
  return 'neutral';
}

/** Exponential smoothing plus a hold time before the mood may change. */
export class MoodTracker {
  private smooth: Expression | null = null;
  private candidate: Mood = 'neutral';
  private since = 0;
  mood: Mood = 'neutral';

  constructor(private alpha = 0.35, private holdMs = 700) {}

  update(shapes: Blendshape[], now: number): Mood {
    const e = readExpression(shapes);
    const s = this.smooth;
    this.smooth = s
      ? (Object.fromEntries(
          Object.entries(e).map(([k, v]) => [k, s[k as keyof Expression] + this.alpha * (v - s[k as keyof Expression])]),
        ) as unknown as Expression)
      : e;

    const next = moodOf(this.smooth);
    if (next !== this.candidate) {
      this.candidate = next;
      this.since = now;
    } else if (next !== this.mood && now - this.since >= this.holdMs) {
      this.mood = next;
    }
    return this.mood;
  }
}

/**
 * Collects how long each mood lasts between two moves, so a move can be
 * tagged with the mood the player was in while choosing it.
 */
export class MoodWindow {
  private totals: Partial<Record<Mood, number>> = {};
  private current: Mood = 'neutral';
  private since = 0;

  set(mood: Mood, now: number) {
    this.add(now);
    this.current = mood;
  }

  reset(now: number) {
    this.totals = {};
    this.since = now;
  }

  /** The mood for the move just played; starts a new window. */
  take(now: number): Mood {
    this.add(now);
    const totals = this.totals;
    this.reset(now);
    // A short burst of frustration matters more than long calm before it.
    if ((totals.frustrated ?? 0) >= 1500) return 'frustrated';
    let best: Mood = 'neutral';
    for (const [mood, ms] of Object.entries(totals) as [Mood, number][]) {
      if (ms > (totals[best] ?? 0)) best = mood;
    }
    return best;
  }

  private add(now: number) {
    if (this.since) this.totals[this.current] = (this.totals[this.current] ?? 0) + (now - this.since);
    this.since = now;
  }
}

export const MOOD_LABEL: Record<Mood, string> = {
  neutral: 'Calm',
  happy: 'Happy',
  frustrated: 'Frustrated',
  surprised: 'Surprised',
  focused: 'Focused',
};
