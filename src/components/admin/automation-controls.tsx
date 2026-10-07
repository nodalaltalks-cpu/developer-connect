"use client";

import { useState, useTransition } from "react";
import { runAutomationsNowAction, setAutomationEnabledAction } from "@/app/admin/_actions/automation-actions";
import { AUTOMATION_RULES, AUTOMATION_LABELS, type AutomationRule } from "@/lib/leads/automation-rules";

/** The Founder's switches and "Run now". The actions authorize the Founder first; the page only reflects what the server holds. */

export function AutomationControls({ settings }: { settings: Record<AutomationRule, boolean> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [state, setState] = useState(settings);
  const btn = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  function toggle(rule: AutomationRule) {
    const next = !state[rule];
    setMessage(null);
    startTransition(async () => {
      const res = await setAutomationEnabledAction(rule, next);
      if (res.ok) setState((s) => ({ ...s, [rule]: next }));
      else setMessage({ tone: "error", text: res.error });
    });
  }

  return (
    <div>
      <ul className="space-y-2">
        {AUTOMATION_RULES.map((rule) => (
          <li key={rule} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{AUTOMATION_LABELS[rule].title}</p>
              <p className="text-xs text-muted-foreground">{AUTOMATION_LABELS[rule].description}</p>
            </div>
            <button type="button" role="switch" aria-checked={state[rule]} aria-label={AUTOMATION_LABELS[rule].title} disabled={pending} onClick={() => toggle(rule)} className={`${btn} shrink-0`}>
              {state[rule] ? "On" : "Off"}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const res = await runAutomationsNowAction();
              setMessage(res.ok ? { tone: "ok", text: res.message ?? "Run finished." } : { tone: "error", text: res.error });
            });
          }}
        >
          {pending ? "Working…" : "Run now"}
        </button>
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
