/**
 * Board sounds made with WebAudio: a short filtered noise burst for a move,
 * a lower one for a capture, two soft tones for check and a chord at the end.
 * No audio files to load, and nothing plays until the first user gesture.
 */

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'good' | 'bad';

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function knock(a: AudioContext, freq: number, gain: number) {
  const len = Math.floor(a.sampleRate * 0.06);
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);

  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

function tone(a: AudioContext, freq: number, start: number, dur: number, gain = 0.08) {
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function play(kind: SoundKind) {
  const a = audio();
  if (!a) return;
  switch (kind) {
    case 'move':
      return knock(a, 1800, 1.2);
    case 'capture':
      knock(a, 900, 1.6);
      return knock(a, 2400, 0.5);
    case 'check':
      knock(a, 1800, 1);
      tone(a, 880, 0.02, 0.18);
      return tone(a, 1175, 0.1, 0.25);
    case 'end':
      [523, 659, 784].forEach((f, i) => tone(a, f, i * 0.07, 0.9, 0.06));
      return;
    case 'good':
      tone(a, 784, 0, 0.18, 0.05);
      return tone(a, 1047, 0.08, 0.3, 0.05);
    case 'bad':
      tone(a, 330, 0, 0.25, 0.05);
      return tone(a, 262, 0.1, 0.35, 0.05);
  }
}
