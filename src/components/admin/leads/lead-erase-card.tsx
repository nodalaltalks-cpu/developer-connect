"use client";

import { SectionBar } from "@/components/leads/section-bar";
import { useState, useTransition } from "react";
import { sendLeadToReturnedAction } from "@/app/admin/_actions/lead-actions";

/**
 * The founder's "erase" control for one lead. Nothing is destroyed here: the lead goes to Returned leads, with its whole
 * history, so it can be assigned to another team member to work again. Permanent removal is a separate, later step
 * (Returned leads -> Trash -> Delete permanently). The server action is founder-only and re-validates everything.
 */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function LeadEraseCard({ leadId }: { leadId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendLeadToReturnedAction(leadId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <SectionBar title="Erase lead" />
      <p className="mt-1 text-sm text-muted-foreground">
        Sends this lead to Returned leads, with its full history, so you can assign it to another team member to work again. From there it can be moved to Trash and deleted for good.
      </p>
      <button type="button" onClick={send} disabled={pending} className={`${BTN} mt-3`}>
        {pending ? "Moving…" : "Erase → Returned leads"}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
