# Chess Coach

A chess trainer that plays, judges and explains. Stockfish 19 runs in the browser as WebAssembly; every move is classified (brilliant to blunder) from the engine's evaluation, and a coach explains what changed: the threat that was missed, the better move, and a principle to take away. With an Anthropic API key, the explanations come from Claude, which only receives facts that the engine and chess.js have verified.

## Features

- **Play Stockfish** at eight strengths, or use the **analysis board** for both sides.
- **Live evaluation**: eval bar, top three engine lines, best-move arrow (hidden while playing unless switched on).
- **Move classification** after every move: Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder, shown as a badge on the board.
- **Coach**: an instant built-in explanation for every move; an AI explanation streamed on request, and automatically for key moments.
- **"What is the plan here?"** for any position.
- **Game review**: accuracy per side, evaluation graph, key moments.
- **Learn from mistakes**: replays each mistake as a puzzle and checks the answer with the engine.
- **Tilt detector** (optional camera): "tilt" is a chess player's frustration after a mistake, the moment when the next blunder usually follows. MediaPipe reads facial expressions in the browser; each move is tagged with the mood the player was in while choosing it. Frustration right after a mistake triggers a warning with a short checklist, and the review shows a mood strip under the evaluation graph, accuracy per mood and the clearest pattern (for example "3 of your 4 mistakes came while you looked frustrated"). A surprised look right after Stockfish's move brings up an explanation of that move.
- Opening names, PGN/FEN import, PGN export, take-backs, hints, keyboard navigation, synthesized sounds, and the game survives a reload.

## How it works

```
Browser                                              Server (one route)
──────────────────────────────────────────────       ─────────────────────────
Stockfish (WASM, 2 web workers)                      /api/coach
  ├─ analysis: live lines, move review                 re-checks the FEN, moves
  └─ opponent: plays at the chosen strength            and scores with chess.js,
lib/review.ts   win chance → classification            builds the prompt itself,
lib/coach.ts    verified facts → built-in text  ───►   streams Claude's answer
MediaPipe Face Landmarker (optional, local)
```

- **Engine** (`lib/engine.ts`): a promise wrapper around the UCI protocol. Searches run one at a time; two callers asking about the same position share one search, results are cached by FEN, and a search nobody waits for any more is stopped.
- **Classification** (`lib/eval.ts`, `lib/review.ts`): centipawns become winning chances with the curve Lichess uses, and a move is judged by how much winning chance it gives away compared with the engine's best move. A sound piece sacrifice is *brilliant*; the only move that holds is *great*; moves that follow the opening book are *book*.
- **Grounded coaching** (`lib/coach.ts`): engine lines are converted to SAN and combined with facts chess.js can prove (captures, checks, hanging pieces, forced mates). The same facts produce the built-in text and the AI prompt, and the prompt forbids moves or variations that are not in them. The API route accepts engine data only, never free text, so it cannot be used as a general chatbot. It also has a per-IP rate limit and a daily cap.
- **Tilt** (`lib/mood.ts`, `lib/review.ts`): blendshape scores (smile, frown, raised brows, open jaw) are mapped to a mood with readable rules and smoothed over time. Between two moves, the time spent in each mood is collected; a move is tagged with the longest one, or with frustration once it lasted 1.5 seconds. Tilt means frustrated with a mistake among the last three own moves. Video frames never leave the browser.

## Running locally

Requires Node.js 20 or later.

```bash
npm install          # also copies the Stockfish and MediaPipe WASM files into public/
npm run dev          # http://localhost:3200
```

Optional, for AI explanations: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. Without a key, everything works with the built-in explanations.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables the AI coach (model `claude-opus-5-5`). |
| `COACH_DAILY_LIMIT` | AI answers per server instance and day, default 300. |

## Tests

```bash
npm test             # classification, openings, position facts, coach texts, input checks, mood and tilt rules
npm run typecheck
```

## Deployment

Works on Vercel as is: the install step copies the WASM files, the page is static, and `/api/coach` runs as one serverless function. Set `ANTHROPIC_API_KEY` in the project settings to enable the AI coach.

## Background

This is a rebuild of a 2024 prototype that used React, a Flask backend running Stockfish, a Mistral model for comments and a separate emotion-detection experiment (MediaPipe face mesh with a Random Forest). The rebuild moves the engine into the browser, grounds every explanation in engine facts, and turns the emotion experiment into the tilt detector.

## Credits and licences

- [Stockfish](https://stockfishchess.org) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPL-3.0. The engine files are served unmodified from the npm package, with the licence text next to them (`/engine/COPYING.txt`).
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause.
- [react-chessboard](https://github.com/Clariity/react-chessboard), MIT, including the piece set.
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe), Apache-2.0.
