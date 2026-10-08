"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { skipMyQueueLeadAction } from "@/app/team/_actions/team-actions";

/** "Skip for now": leave this lead for later and show the next one. Recorded on the server; the list refreshes from the server's answer. */
export function SkipLeadButton({ batchId, leadId }: { batchId: string; leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await skipMyQueueLeadAction(batchId, leadId);
            if (result.ok) router.refresh();
            else setError(result.error);
          });
        }}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Skipping…" : "Skip for now"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
