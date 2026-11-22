"use client";

import { useRef, useState } from "react";
import Link from "next/link";

/**
 * The "Ask Developer Connects" chat. Everything shown comes from /api/ask, which answers only from the site's own guides and sends
 * back the passages it used. Nothing is stored: the conversation lives in this page and is gone when it closes.
 */

interface Source {
  n: number;
  title: string;
  url: string;
  quote: string;
  updated?: string;
}
interface SearchResult {
  title: string;
  url: string;
  excerpt: string;
  updated?: string;
}
type Entry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; kind: "answer"; text: string; sources: Source[] }
  | { id: number; role: "assistant"; kind: "search"; note?: string; results: SearchResult[] }
  | { id: number; role: "assistant"; kind: "declined"; message: string; results: SearchResult[] }
  | { id: number; role: "assistant"; kind: "error"; message: string };

type Market = "india" | "dubai" | undefined;

const EXAMPLES: Record<"india" | "dubai" | "any", string[]> = {
  india: ["How do I check a project on MahaRERA?", "What hidden costs come on top of the price of a flat?", "Under construction or ready to move: which suits me?"],
  dubai: ["How does off-plan property work in Dubai?", "What does Oqood mean?", "What do I need to know about escrow?"],
  any: ["How do I check a project on MahaRERA?", "How does off-plan property work in Dubai?", "What is carpet area?"],
};

const FIELD =
  "block min-h-12 w-full rounded-sm border border-field-border bg-white px-3 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

const link = "font-semibold text-accent-hover underline underline-offset-4";

function stripMarkers(text: string): string {
  return text.replace(/\s?\[\d+\]/g, "");
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ol className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
      {sources.map((s) => (
        <li key={s.n} className="leading-6">
          <span className="font-semibold text-foreground">[{s.n}] </span>
          <Link href={s.url} className={link}>
            {s.title}
          </Link>
          {s.updated ? <span className="text-muted-foreground"> (facts checked {s.updated})</span> : null}
          <span className="mt-1 block text-muted-foreground">“{s.quote}”</span>
        </li>
      ))}
    </ol>
  );
}

function ResultList({ results }: { results: SearchResult[] }) {
  return (
    <ul className="mt-3 space-y-4 text-sm">
      {results.map((r, i) => (
        <li key={`${r.url}-${i}`} className="leading-6">
          <Link href={r.url} className={link}>
            {r.title}
          </Link>
          {r.updated ? <span className="text-muted-foreground"> (facts checked {r.updated})</span> : null}
          <span className="mt-1 block whitespace-pre-line text-muted-foreground">{r.excerpt}</span>
        </li>
      ))}
    </ul>
  );
}

export function AskChat() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState("");
  const [market, setMarket] = useState<Market>(undefined);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  const scrollDown = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history: Array<{ role: "user" | "assistant"; text: string }> = [];
    for (const e of entries) {
      if (e.role === "user") history.push({ role: "user", text: e.text });
      else if (e.kind === "answer") history.push({ role: "assistant", text: stripMarkers(e.text) });
    }
    setEntries((prev) => [...prev, { id: nextId.current++, role: "user", text: trimmed }]);
    setQuestion("");
    setBusy(true);
    setLive("");
    scrollDown();
    const answerId = nextId.current++;
    const add = (entry: Entry) => setEntries((prev) => [...prev.filter((e) => e.id !== answerId), entry]);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, history: history.slice(-6), market }),
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        add({ id: answerId, role: "assistant", kind: "error", message: body.error ?? "Something went wrong. Please try again." });
      } else if (type.includes("application/json")) {
        const body = (await response.json()) as { mode: "declined" | "search"; message?: string; results?: SearchResult[] };
        if (body.mode === "declined") add({ id: answerId, role: "assistant", kind: "declined", message: body.message ?? "", results: [] });
        else add({ id: answerId, role: "assistant", kind: "search", results: body.results ?? [] });
      } else if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let partial = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as
              | { t: "delta"; text: string }
              | { t: "final"; text: string; sources: Source[] }
              | { t: "search"; results: SearchResult[]; note?: string }
              | { t: "declined"; message: string; results: SearchResult[] };
            if (event.t === "delta") {
              partial += event.text;
              setLive(partial);
              scrollDown();
            } else if (event.t === "final") {
              setLive("");
              add({ id: answerId, role: "assistant", kind: "answer", text: event.text, sources: event.sources });
            } else if (event.t === "search") {
              setLive("");
              add({ id: answerId, role: "assistant", kind: "search", note: event.note, results: event.results });
            } else if (event.t === "declined") {
              setLive("");
              add({ id: answerId, role: "assistant", kind: "declined", message: event.message, results: event.results });
            }
          }
        }
      }
    } catch {
      add({ id: answerId, role: "assistant", kind: "error", message: "Could not reach the assistant. Please check your connection and try again." });
    } finally {
      setBusy(false);
      setLive("");
      scrollDown();
    }
  }

  const examples = EXAMPLES[market ?? "any"];
  const pill = (active: boolean) => `min-h-11 flex-1 rounded-sm px-3 text-sm font-semibold transition-colors ${active ? "bg-ink text-pearl" : "text-foreground hover:bg-muted"}`;

  return (
    <section aria-labelledby="ask-heading" className="mt-8 overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(20,23,31,0.04),0_24px_48px_-32px_rgba(11,18,32,0.35)]">
      <h2 id="ask-heading" className="sr-only">
        Ask a question
      </h2>
      <div className="border-b border-border p-4 sm:p-5">
        <div role="group" aria-label="Which market is your question about" className="flex gap-1 rounded-sm border border-field-border p-1 sm:max-w-md">
          <button type="button" aria-pressed={market === undefined} onClick={() => setMarket(undefined)} className={pill(market === undefined)}>
            Either
          </button>
          <button type="button" aria-pressed={market === "india"} onClick={() => setMarket("india")} className={pill(market === "india")}>
            Mumbai and India
          </button>
          <button type="button" aria-pressed={market === "dubai"} onClick={() => setMarket("dubai")} className={pill(market === "dubai")}>
            Dubai
          </button>
        </div>
      </div>

      <div className="min-h-64 space-y-5 p-4 sm:p-6" aria-live="polite">
        {entries.length === 0 && !busy ? (
          <div>
            <p className="text-base leading-7 text-foreground/85">Ask about buying a home: what to check, what the terms mean, what it costs, how the process works.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {examples.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => void ask(example)} className="min-h-11 rounded-full border border-field-border px-4 py-2 text-left text-sm text-foreground hover:bg-muted">
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {entries.map((entry) =>
          entry.role === "user" ? (
            <div key={entry.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-xl bg-ink px-4 py-3 text-base leading-7 text-pearl">{entry.text}</p>
            </div>
          ) : (
            <div key={entry.id} className="max-w-[95%] rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
              {entry.kind === "answer" ? (
                <>
                  <p className="whitespace-pre-line text-base leading-7 text-foreground">{entry.text}</p>
                  <SourceList sources={entry.sources} />
                </>
              ) : entry.kind === "search" ? (
                <>
                  <p className="text-sm font-medium text-foreground">{entry.note ?? "Here is what our guides say about this."}</p>
                  <ResultList results={entry.results} />
                </>
              ) : entry.kind === "declined" ? (
                <>
                  <p className="text-base leading-7 text-foreground">{entry.message}</p>
                  {entry.results.length > 0 ? (
                    <>
                      <p className="mt-3 text-sm font-medium text-foreground">The closest pages we have:</p>
                      <ResultList results={entry.results} />
                    </>
                  ) : null}
                  <p className="mt-4 text-sm">
                    <Link href="/advisor" className={link}>
                      Talk to an advisor
                    </Link>
                  </p>
                </>
              ) : (
                <p className="text-base leading-7 text-foreground">{entry.message}</p>
              )}
            </div>
          ),
        )}

        {busy ? (
          <div className="max-w-[95%] rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
            <p className="whitespace-pre-line text-base leading-7 text-foreground/80">{live || "Looking through our guides…"}</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="ask-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
            placeholder="Type your question"
            autoComplete="off"
            maxLength={500}
            className={FIELD}
          />
          <button
            type="submit"
            disabled={busy || question.trim() === ""}
            className="min-h-12 shrink-0 rounded-sm bg-ink px-6 text-sm font-semibold text-pearl transition-opacity disabled:opacity-50"
          >
            {busy ? "Answering…" : "Ask"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Answers come only from Developer Connects&apos; own guides, with the passage each one is based on. Information, not legal, tax or financial advice. Nothing you type is stored.
        </p>
      </form>
    </section>
  );
}
