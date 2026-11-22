import { retrieve, type RetrievedPassage } from "@/lib/ask/retrieve";
import { buildMessages } from "@/lib/ask/prompt";
import { formatAnswer } from "@/lib/ask/answer";
import { askClaude, askEnabled } from "@/lib/ask/claude";
import { rateLimit, validateAsk, visitorKey, withinDailyCap } from "@/lib/ask/limits";

/**
 * POST /api/ask: "Ask Developer Connects", the property research assistant.
 *
 * Every answer comes from the site's own published guides (see lib/ask/corpus.ts) and carries the exact passages it came from.
 * Three outcomes, all safe by construction:
 *  - declined: the question is not about buying property in India or Dubai, or our guides do not cover it. No AI is called.
 *  - search:   AI answers are off (no key, daily cap, error, or the answer could not be tied to a source). The visitor gets the
 *              relevant guide passages themselves, which cost nothing and cannot be wrong about what the guides say.
 *  - answer:   streamed from Claude, every sentence tied to a quoted passage.
 * The question text is never stored or logged; only sizes, source ids and token counts are.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 20_000;
const DEFAULT_DAILY_CAP = 400;

const DECLINED_MESSAGE =
  "I can only answer questions about buying property in India (especially Mumbai) and in Dubai, using Developer Connects' guides, and I could not find this in them. Try rewording it, or talk to an advisor.";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function searchResults(passages: RetrievedPassage[]) {
  return passages.slice(0, 4).map((p) => ({ title: p.title, url: p.url, excerpt: p.text.length > 320 ? `${p.text.slice(0, 319)}…` : p.text, ...(p.updated ? { updated: p.updated } : {}) }));
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser callers carry no Origin; they are still rate limited
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: "Not allowed." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "That is too long." }, 413);

  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, MAX_BODY_BYTES));
  } catch {
    return json({ error: "Send a question." }, 400);
  }
  const parsed = validateAsk(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { question, history, market } = parsed.value;

  const decision = rateLimit(visitorKey(request.headers));
  if (!decision.allowed) {
    return json({ error: "You have asked a lot of questions. Please try again in a little while." }, 429, { "Retry-After": String(decision.retryAfterSeconds) });
  }

  // A short follow-up ("and in Dubai?") only makes sense with the question before it.
  const previousUser = [...history].reverse().find((t) => t.role === "user")?.text ?? "";
  const searchText = question.split(/\s+/).length < 6 && previousUser ? `${previousUser} ${question}` : question;
  const retrieval = retrieve(searchText, { market, k: 6 });

  if (!retrieval.answerable) return json({ mode: "declined", message: DECLINED_MESSAGE });

  const cap = Number(process.env.ASK_DAILY_CAP) || DEFAULT_DAILY_CAP;
  if (!askEnabled() || !withinDailyCap(cap)) {
    return json({ mode: "search", market: retrieval.market, results: searchResults(retrieval.passages) });
  }

  const messages = buildMessages(history, question, retrieval.passages);
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const result = await askClaude({ messages, onText: (text) => send({ t: "delta", text }), signal: request.signal });
        const formatted = formatAnswer(result.content, retrieval.passages);
        console.info(
          JSON.stringify({ ask: { ms: Date.now() - startedAt, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, stop: result.stopReason, sources: retrieval.passages.map((p) => p.id), cited: formatted.sources.length, notCovered: formatted.notCovered, uncited: formatted.uncited } }),
        );
        if (result.stopReason === "refusal" || formatted.notCovered) {
          send({ t: "declined", message: DECLINED_MESSAGE, results: searchResults(retrieval.passages) });
        } else if (formatted.uncited) {
          // An answer we cannot tie to a source is never shown as an answer.
          send({ t: "search", results: searchResults(retrieval.passages) });
        } else {
          send({ t: "final", text: formatted.text, sources: formatted.sources, market: retrieval.market });
        }
      } catch (error) {
        console.error(JSON.stringify({ askError: { ms: Date.now() - startedAt, name: error instanceof Error ? error.name : "unknown", status: (error as { status?: number }).status ?? null } }));
        send({ t: "search", results: searchResults(retrieval.passages), note: "The assistant is busy right now. Here is what our guides say." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
