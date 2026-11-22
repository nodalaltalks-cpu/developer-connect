import type { PlainMessage } from "./prompt.ts";

/**
 * Talks to a model YOU run (or any open-weight model behind an OpenAI-compatible server: Ollama, vLLM, llama.cpp, LM Studio, a
 * rented GPU, a hosted open-model service). Nothing here is specific to a vendor: it is the common chat-completions format.
 *   ASK_LOCAL_URL    the server's base address, for example https://my-model.example.com/v1
 *   ASK_LOCAL_MODEL  the model's name on that server
 *   ASK_LOCAL_KEY    optional bearer key for the server
 */

export interface LocalSettings {
  url: string;
  model: string;
  key: string | undefined;
}

export function localSettings(env: Record<string, string | undefined> = process.env): LocalSettings | null {
  const url = env.ASK_LOCAL_URL?.trim().replace(/\/+$/, "");
  const model = env.ASK_LOCAL_MODEL?.trim();
  if (!url || !model) return null;
  return { url, model, key: env.ASK_LOCAL_KEY?.trim() || undefined };
}

/** Splits a server-sent-events buffer into complete `data:` payloads and the unfinished remainder. */
export function splitSse(buffer: string): { payloads: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const payloads: string[] = [];
  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (line.startsWith("data:")) payloads.push(line.slice(5).trim());
    }
  }
  return { payloads, rest };
}

/** The text piece inside one streamed chunk, or "" when it carries none. */
export function deltaText(payload: string): string {
  if (!payload || payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> };
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export interface LocalResult {
  text: string;
  model: string;
}

export async function askLocal(params: { messages: PlainMessage[]; onText: (text: string) => void; signal?: AbortSignal }): Promise<LocalResult> {
  const settings = localSettings();
  if (!settings) throw new Error("ASK_LOCAL_URL and ASK_LOCAL_MODEL are not set");
  const response = await fetch(`${settings.url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(settings.key ? { Authorization: `Bearer ${settings.key}` } : {}) },
    // Low temperature: the answer should restate the documents, not be creative.
    body: JSON.stringify({ model: settings.model, messages: params.messages, stream: true, temperature: 0.1, max_tokens: 700 }),
    signal: params.signal ?? AbortSignal.timeout(50_000),
  });
  if (!response.ok || !response.body) throw Object.assign(new Error(`model server answered ${response.status}`), { status: response.status });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { payloads, rest } = splitSse(buffer);
    buffer = rest;
    for (const payload of payloads) {
      const piece = deltaText(payload);
      if (!piece) continue;
      text += piece;
      // The reader sees the answer as it forms, without the source labels (those are checked and renumbered at the end).
      params.onText(piece.replace(/\[S\d+\]/g, ""));
    }
  }
  return { text, model: settings.model };
}
