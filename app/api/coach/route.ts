/**
 * AI coach endpoint. Streams a short explanation of one move ("move") or of
 * the current position ("plan") as plain text.
 *
 * The request carries engine data only: FEN, UCI moves and scores. The route
 * re-checks all of it with chess.js and writes the prompt itself, so it
 * cannot be used as a general-purpose chatbot.
 *
 * Environment (.env.local locally, project settings on Vercel):
 *   ANTHROPIC_API_KEY   optional; without it GET reports ai: false and the
 *                       app keeps to its built-in explanations
 *   COACH_DAILY_LIMIT   optional, AI answers per server instance and day
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  buildMoveFacts, buildPositionFacts, COACH_SYSTEM, movePrompt, positionPrompt,
  readMoveReport, readPositionReport,
} from '@/lib/coach';

const MODEL = 'claude-opus-5-5';

/* Best effort, like the contact form on the portfolio: a recycled function
   instance resets the counters. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();
const daily = { day: '', count: 0 };

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function overDailyLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (daily.day !== today) Object.assign(daily, { day: today, count: 0 });
  daily.count++;
  return daily.count > (Number(process.env.COACH_DAILY_LIMIT) || 300);
}

export function GET() {
  return Response.json({ ai: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ai-off' }, { status: 503 });

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return Response.json({ error: 'invalid' }, { status: 400 });
  }

  let prompt: string | null = null;
  if (data.kind === 'move') {
    const report = readMoveReport(data);
    const facts = report && buildMoveFacts(report);
    if (facts) prompt = movePrompt(facts);
  } else if (data.kind === 'plan') {
    const report = readPositionReport(data);
    if (report) prompt = positionPrompt(buildPositionFacts(report));
  }
  if (!prompt) return Response.json({ error: 'invalid' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (rateLimited(ip) || overDailyLimit()) return Response.json({ error: 'busy' }, { status: 429 });

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    // Short, grounded answers: low effort keeps them quick.
    output_config: { effort: 'low' },
    // If a safety classifier declines, the API retries on its recommended model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: COACH_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  }, { signal: req.signal });

  const logError = (err: unknown) => {
    if (err instanceof Anthropic.RateLimitError) console.warn('Coach: Anthropic rate limit');
    else if (err instanceof Anthropic.APIError) console.error(`Coach: API error ${err.status}`, err.message);
    else console.error('Coach: stream failed', err);
  };

  // Wait for the first event, so a bad key or an outage still gets a proper
  // status code instead of a stream that breaks after the headers.
  const events = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    first = await events.next();
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return new Response(null, { status: 499 });
    logError(err);
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    return Response.json({ error: 'upstream' }, { status });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let r = first; !r.done; r = await events.next()) {
          const event = r.value;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') console.warn('Coach: request declined', final.stop_details);
        controller.close();
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) return controller.close();
        logError(err);
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
