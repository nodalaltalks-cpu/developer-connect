import { askClaude } from "./claude.ts";
import { askLocal, localSettings } from "./local.ts";
import { buildMessages, localMessages, type ChatTurn } from "./prompt.ts";
import { formatAnswer, type FormattedAnswer } from "./answer.ts";
import { groundAnswer } from "./grounding.ts";
import type { RetrievedPassage } from "./retrieve.ts";

/**
 * Chooses which model answers, and checks its answer the way that model needs.
 *   ASK_PROVIDER=local   your own / open-weight model (ASK_LOCAL_URL, ASK_LOCAL_MODEL): answers are verified sentence by sentence in code
 *   ASK_PROVIDER=claude  Claude (ANTHROPIC_API_KEY): citations are verified by the API
 *   (unset)              your own model if it is configured, else Claude if a key is set, else none (the page shows guide search results)
 *   ASK_ENABLED=false    switches AI answers off entirely
 */

export type ProviderName = "claude" | "local";

type Env = Record<string, string | undefined>;

export function pickProvider(env: Env = process.env): ProviderName | null {
  if (env.ASK_ENABLED === "false") return null;
  const hasLocal = localSettings(env) !== null;
  const hasClaude = Boolean(env.ANTHROPIC_API_KEY);
  if (env.ASK_PROVIDER === "local") return hasLocal ? "local" : null;
  if (env.ASK_PROVIDER === "claude") return hasClaude ? "claude" : null;
  if (hasLocal) return "local";
  if (hasClaude) return "claude";
  return null;
}

export interface Generated {
  formatted: FormattedAnswer;
  /** The model declined for safety reasons. */
  refused: boolean;
  provider: ProviderName;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Sentences removed by the code-level check (own-model path only). */
  dropped: number;
}

export async function generate(
  provider: ProviderName,
  params: { history: ChatTurn[]; question: string; passages: RetrievedPassage[]; onText: (text: string) => void; signal?: AbortSignal },
): Promise<Generated> {
  if (provider === "local") {
    const result = await askLocal({ messages: localMessages(params.history, params.question, params.passages), onText: params.onText, signal: params.signal });
    const grounded = groundAnswer(result.text, params.passages);
    return { formatted: grounded, refused: false, provider, model: result.model, inputTokens: null, outputTokens: null, dropped: grounded.dropped };
  }
  const result = await askClaude({ messages: buildMessages(params.history, params.question, params.passages), onText: params.onText, signal: params.signal });
  return {
    formatted: formatAnswer(result.content, params.passages),
    refused: result.stopReason === "refusal",
    provider,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    dropped: 0,
  };
}
