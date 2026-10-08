"use client";

import { useState, useTransition } from "react";
import { recordSpendAction, voidSpendAction, type FinanceActionResult } from "@/app/admin/_actions/finance-actions";
import { ACQUISITION_CHANNELS, CHANNEL_LABEL } from "@/lib/leads/acquisition";
import type { LeadCurrency } from "@/lib/leads/types";

const FIELD = "min-h-11 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Records marketing spend (Founder only - the action authorizes first). Entries are never edited: a mistake is voided. */
export function SpendForm({ campaigns, today }: { campaigns: Array<{ id: string; name: string }>; today: string }) {
  const [channel, setChannel] = useState("GOOGLE_ADS");
  const [campaignId, setCampaignId] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [currency, setCurrency] = useState<LeadCurrency>("INR");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<FinanceActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="s-channel" className="block text-sm font-medium text-foreground">
            Channel
          </label>
          <select id="s-channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={`${FIELD} mt-1.5`}>
            {ACQUISITION_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="s-camp" className="block text-sm font-medium text-foreground">
            Campaign (optional)
          </label>
          <select id="s-camp" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${FIELD} mt-1.5`}>
            <option value="">No specific campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-1">
          <label htmlFor="s-date" className="block text-sm font-medium text-foreground">
            Date spent
          </label>
          <input id="s-date" type="date" max={today} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="s-cur" className="block text-sm font-medium text-foreground">
            Currency
          </label>
          <select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value as LeadCurrency)} className={`${FIELD} mt-1.5`}>
            <option value="INR">INR</option>
            <option value="AED">AED</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="s-amt" className="block text-sm font-medium text-foreground">
            Amount
          </label>
          <input id="s-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
      </div>
      <div>
        <label htmlFor="s-note" className="block text-sm font-medium text-foreground">
          Note (optional)
        </label>
        <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${FIELD} mt-1.5`} />
      </div>
      <button
        type="button"
        disabled={pending || !amount.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await recordSpendAction({ channel, campaignId: campaignId || null, spentOn, currency, amount: Number(amount.replace(/[,\s]/g, "")), note: note || null });
            setResult(res);
            if (res.ok) {
              setAmount("");
              setNote("");
            }
          })
        }
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Saving…" : "Record spend"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Spend recorded.
        </p>
      )}
    </div>
  );
}

export function VoidSpendButton({ spendId }: { spendId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const btn = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        Void
      </button>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      <label htmlFor={`v-${spendId}`} className="text-xs font-medium text-foreground">
        Why is this entry wrong?
      </label>
      <input id={`v-${spendId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={FIELD} />
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          disabled={pending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await voidSpendAction(spendId, reason);
              setError(res.ok ? null : res.error);
            })
          }
        >
          Confirm void
        </button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
