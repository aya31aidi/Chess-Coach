/**
 * Copies the WebAssembly files the browser loads from node_modules into
 * public/, so they are served by the app itself:
 *   - Stockfish (lite, single-threaded: needs no cross-origin isolation).
 *     The script finds its .wasm by swapping its own extension, so both
 *     files keep the same base name.
 *   - MediaPipe Tasks Vision, for the optional mood camera.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');

const sets = [
  {
    name: 'Stockfish',
    src: join(modules, 'stockfish'),
    dest: 'public/engine',
    files: [
      ['bin/stockfish-19-lite-single.js', 'stockfish.js'],
      ['bin/stockfish-19-lite-single.wasm', 'stockfish.wasm'],
      ['Copying.txt', 'COPYING.txt'],
    ],
  },
  {
    name: 'MediaPipe',
    src: join(modules, '@mediapipe', 'tasks-vision', 'wasm'),
    dest: 'public/mediapipe',
    files: [
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
      'vision_wasm_nosimd_internal.js',
      'vision_wasm_nosimd_internal.wasm',
    ].map((f) => [f, f]),
  },
];

for (const set of sets) {
  if (!existsSync(set.src)) {
    console.warn(`copy-engine: ${set.name} not installed, skipping`);
    continue;
  }
  const dest = join(root, set.dest);
  mkdirSync(dest, { recursive: true });
  for (const [from, to] of set.files) copyFileSync(join(set.src, from), join(dest, to));
  console.log(`copy-engine: ${set.name} copied to ${set.dest}`);
}
