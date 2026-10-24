"use client";

import { useState } from "react";
import { saveSettingsAction } from "@/app/admin/_actions/social-automation-actions";
import { DEFAULT_PUBLIC_REPLY } from "@/lib/social-automation/logic";
import { AREA, BTN, FIELD, useAction } from "./ui";

/** The global emergency switch and the freshness windows. While the switch is off, no post sends anything, whatever its own mode. */
export function SettingsPanel({
  enabled,
  priceMaxAgeDays,
  availabilityMaxAgeDays,
  defaultPublicReply,
  defaultPublicReplyFallback,
}: {
  enabled: boolean;
  priceMaxAgeDays: number;
  availabilityMaxAgeDays: number;
  defaultPublicReply: string | null;
  defaultPublicReplyFallback: string | null;
}) {
  const { pending, notice, run } = useAction();
  const [priceDays, setPriceDays] = useState(String(priceMaxAgeDays));
  const [availDays, setAvailDays] = useState(String(availabilityMaxAgeDays));
  const [reply, setReply] = useState(defaultPublicReply ?? "");
  const [replyFallback, setReplyFallback] = useState(defaultPublicReplyFallback ?? "");

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">Global automation switch</h2>
          <p className="text-sm text-muted-foreground">
            {enabled ? "ON: posts set to Live may send. Dry-run posts still only record what they would do." : "OFF: nothing is sent to anyone, whatever a post is set to. Dry runs still record what would have happened."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{enabled ? "ON" : "OFF"}</span>
        <button type="button" disabled={pending} onClick={() => run(() => saveSettingsAction({ enabled: !enabled }), enabled ? "Automation switched off. Nothing will be sent." : "Automation switched on. Only posts set to Live can send.")} className={`${BTN} ${enabled ? "border-red-500 bg-red-50 text-red-700" : ""}`}>
          {enabled ? "Switch off now" : "Switch on"}
        </button>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSettingsAction({ priceMaxAgeDays: Number(priceDays), availabilityMaxAgeDays: Number(availDays) }), "Saved.");
        }}
      >
        <label className="block text-sm font-medium text-foreground">
          Price counts as current for (days)
          <input type="number" min={1} max={365} value={priceDays} onChange={(e) => setPriceDays(e.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Availability counts as current for (days)
          <input type="number" min={1} max={365} value={availDays} onChange={(e) => setAvailDays(e.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={pending} className={BTN}>Save days</button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">A price older than this, never verified, or changed since you verified it is left out of automatic messages.</p>

      <form
        className="mt-6 space-y-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSettingsAction({ defaultPublicReply: reply, defaultPublicReplyFallback: replyFallback }), "Common replies saved.");
        }}
      >
        <h3 className="text-base font-semibold text-foreground">Common public reply</h3>
        <p className="text-sm text-muted-foreground">Posted under the comment on every post that does not write its own. Change it here once and it applies everywhere.</p>
        <label className="block text-sm font-medium text-foreground">
          When the private message was sent
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={300} rows={2} placeholder={DEFAULT_PUBLIC_REPLY} className={`${AREA} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-foreground">
          When it could not be sent (must not mention a DM; leave empty for no public reply)
          <textarea value={replyFallback} onChange={(e) => setReplyFallback(e.target.value)} maxLength={300} rows={2} className={`${AREA} mt-1`} />
        </label>
        <button type="submit" disabled={pending} className={BTN}>Save common replies</button>
      </form>
      {notice && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{notice.text}</p>
      )}
    </section>
  );
}
