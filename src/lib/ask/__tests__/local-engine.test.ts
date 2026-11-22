import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deltaText, localSettings, splitSse } from "../local.ts";
import { generate, pickProvider } from "../engine.ts";
import { retrieve } from "../retrieve.ts";

test("the provider is chosen from the environment: own model first, Claude second, otherwise none", () => {
  assert.equal(pickProvider({}), null);
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: "k" }), "claude");
  assert.equal(pickProvider({ ASK_LOCAL_URL: "http://x/v1", ASK_LOCAL_MODEL: "m" }), "local");
  assert.equal(pickProvider({ ASK_LOCAL_URL: "http://x/v1", ASK_LOCAL_MODEL: "m", ANTHROPIC_API_KEY: "k" }), "local");
  assert.equal(pickProvider({ ASK_LOCAL_URL: "http://x/v1", ASK_LOCAL_MODEL: "m", ANTHROPIC_API_KEY: "k", ASK_PROVIDER: "claude" }), "claude");
  assert.equal(pickProvider({ ASK_PROVIDER: "local", ANTHROPIC_API_KEY: "k" }), null, "asked for local but it is not configured");
  assert.equal(pickProvider({ ASK_LOCAL_URL: "http://x/v1", ASK_LOCAL_MODEL: "m", ASK_ENABLED: "false" }), null);
});

test("the own-model settings need both an address and a model name", () => {
  assert.equal(localSettings({ ASK_LOCAL_URL: "http://x/v1" }), null);
  assert.deepEqual(localSettings({ ASK_LOCAL_URL: "http://x/v1/", ASK_LOCAL_MODEL: "m", ASK_LOCAL_KEY: " k " }), { url: "http://x/v1", model: "m", key: "k" });
});

test("a streamed reply is split into chunks and the text pulled out", () => {
  const buffer = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\ndata: {"choi';
  const { payloads, rest } = splitSse(buffer);
  assert.equal(payloads.length, 3);
  assert.equal(rest, 'data: {"choi');
  assert.equal(payloads.map(deltaText).join(""), "Hello");
  assert.equal(deltaText("not json"), "");
});

let server: http.Server;
let reply = "";
let seenAuth: string | undefined;
let seenBody: { model?: string; stream?: boolean; messages?: Array<{ role: string; content: string }> } = {};

before(async () => {
  server = http.createServer((req, res) => {
    seenAuth = req.headers.authorization;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seenBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      // Stream the reply in small pieces, as a real server does.
      for (let i = 0; i < reply.length; i += 17) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(i, i + 17) } }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  process.env.ASK_LOCAL_URL = `http://127.0.0.1:${port}/v1`;
  process.env.ASK_LOCAL_MODEL = "my-real-estate-model";
  process.env.ASK_LOCAL_KEY = "secret";
});

after(() => {
  server.close();
  delete process.env.ASK_LOCAL_URL;
  delete process.env.ASK_LOCAL_MODEL;
  delete process.env.ASK_LOCAL_KEY;
});

test("an own-model answer is streamed, verified in code, and an invented sentence is removed", async () => {
  const retrieval = retrieve("How do I check a project on MahaRERA before paying?", { k: 4 });
  const good = retrieval.passages[0].text.split(/(?<=[.!?])\s+/)[0].replace(/\s+/g, " ").trim();
  reply = `${good} [S1] MahaRERA also pays you a cash refund of 9876 rupees every month [S1].`;

  let streamed = "";
  const result = await generate("local", { history: [], question: "How do I check a project on MahaRERA before paying?", passages: retrieval.passages, onText: (t) => (streamed += t) });

  assert.equal(seenAuth, "Bearer secret");
  assert.equal(seenBody.model, "my-real-estate-model");
  assert.equal(seenBody.stream, true);
  assert.match(seenBody.messages?.[0].content ?? "", /\[S1\]/, "the system prompt asks for source labels");
  assert.match(seenBody.messages?.[seenBody.messages.length - 1].content ?? "", /Documents:/);

  assert.ok(streamed.length > 0 && !streamed.includes("[S1]"), "the reader sees text without raw labels while it streams");
  assert.equal(result.provider, "local");
  assert.equal(result.dropped, 1, "the invented sentence is removed");
  assert.ok(!result.formatted.text.includes("9876"));
  assert.equal(result.formatted.uncited, false);
  assert.equal(result.formatted.sources.length, 1);
});

test("an own-model reply that is all invention leaves nothing to show, so the visitor gets the guide passages instead", async () => {
  const retrieval = retrieve("How do I check a project on MahaRERA before paying?", { k: 4 });
  reply = "Property prices will triple next year [S1]. Buy today [S2].";
  const result = await generate("local", { history: [], question: "q", passages: retrieval.passages, onText: () => {} });
  assert.equal(result.formatted.uncited, true);
});
