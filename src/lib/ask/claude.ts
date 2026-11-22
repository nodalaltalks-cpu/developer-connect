import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, type BuiltMessage } from "./prompt.ts";
import type { RawTextBlock } from "./answer.ts";

/**
 * The one place the assistant calls Claude. Settings come from environment variables so cost can be changed without code:
 *   ANTHROPIC_API_KEY  required to turn AI answers on (without it the page still works, as search over the guides)
 *   ASK_MODEL          the Claude model (default claude-opus-5-5)
 *   ASK_EFFORT         low | medium | high (default low: the sources are short and the answer is a summary of them)
 *   ASK_ENABLED        set to "false" to switch AI answers off without removing the key
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
const EFFORTS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];

export function askEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.ASK_ENABLED !== "false";
}

export function askSettings(env: Record<string, string | undefined> = process.env): { model: string; effort: Effort } {
  const effort = EFFORTS.find((e) => e === env.ASK_EFFORT) ?? "low";
  return { model: env.ASK_MODEL || DEFAULT_MODEL, effort };
}

export interface ClaudeResult {
  content: RawTextBlock[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

let client: Anthropic | null = null;

export async function askClaude(params: { messages: BuiltMessage[]; onText: (text: string) => void; signal?: AbortSignal }): Promise<ClaudeResult> {
  client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 });
  const { model, effort } = askSettings();
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: params.messages as Anthropic.Beta.BetaMessageParam[],
      output_config: { effort },
      // If a safety classifier declines, the same request is re-run on the fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal: params.signal },
  );
  stream.on("text", (delta) => params.onText(delta));
  const message = await stream.finalMessage();
  return {
    content: message.content as unknown as RawTextBlock[],
    stopReason: message.stop_reason,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    model: message.model,
  };
}
