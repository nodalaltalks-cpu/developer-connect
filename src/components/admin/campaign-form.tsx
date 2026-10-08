"use client";

import { useState, useTransition } from "react";
import { createCampaignAction, setCampaignStatusAction, type CampaignActionResult } from "@/app/admin/_actions/campaign-actions";
import type { CampaignStatus } from "@/lib/leads/types";

const FIELD = "min-h-11 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Creates a campaign (Founder only - the action authorizes first). The UTM tag is the attribution key and cannot be changed later. */
export function CampaignForm() {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [landing, setLanding] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<CampaignActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await createCampaignAction({ name, utmCampaign: tag, utmSource: source || null, utmMedium: medium || null, landingPage: landing || null, startDate: start || null, endDate: end || null });
      setResult(res);
      if (res.ok) {
        setName("");
        setTag("");
        setSource("");
        setMedium("");
        setLanding("");
        setStart("");
        setEnd("");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <label htmlFor="c-name" className="block text-sm font-medium text-foreground">
          Campaign name
        </label>
        <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={`${FIELD} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="c-tag" className="block text-sm font-medium text-foreground">
          UTM campaign tag
        </label>
        <input id="c-tag" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={80} placeholder="e.g. thane_diwali_2026" className={`${FIELD} mt-1.5`} />
        <p className="mt-1 text-xs text-muted-foreground">Exactly as it appears as utm_campaign in the ad link. Leads are attributed by this tag, so it cannot be changed later.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="c-source" className="block text-sm font-medium text-foreground">
            Source (optional)
          </label>
          <input id="c-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} placeholder="e.g. google" className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="c-medium" className="block text-sm font-medium text-foreground">
            Medium (optional)
          </label>
          <input id="c-medium" value={medium} onChange={(e) => setMedium(e.target.value)} maxLength={60} placeholder="e.g. cpc" className={`${FIELD} mt-1.5`} />
        </div>
      </div>
      <div>
        <label htmlFor="c-landing" className="block text-sm font-medium text-foreground">
          Landing page (optional)
        </label>
        <input id="c-landing" value={landing} onChange={(e) => setLanding(e.target.value)} maxLength={120} placeholder="/developers/example" className={`${FIELD} mt-1.5`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="c-start" className="block text-sm font-medium text-foreground">
            Start date (optional)
          </label>
          <input id="c-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="c-end" className="block text-sm font-medium text-foreground">
            End date (optional)
          </label>
          <input id="c-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim() || !tag.trim()}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Saving…" : "Create campaign"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Campaign created.
        </p>
      )}
    </div>
  );
}

const NEXT: Record<CampaignStatus, { to: CampaignStatus; label: string }> = { ACTIVE: { to: "PAUSED", label: "Pause" }, PAUSED: { to: "ACTIVE", label: "Resume" }, ENDED: { to: "ACTIVE", label: "Reopen" } };

export function CampaignStatusButtons({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (to: CampaignStatus) =>
    startTransition(async () => {
      const res = await setCampaignStatusAction(campaignId, to);
      setError(res.ok ? null : res.error);
    });
  const cls = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={cls} disabled={pending} onClick={() => run(NEXT[status].to)}>
        {NEXT[status].label}
      </button>
      {status !== "ENDED" && (
        <button type="button" className={cls} disabled={pending} onClick={() => run("ENDED")}>
          End
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
