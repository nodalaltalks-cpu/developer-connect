"use client";

import { useTransition } from "react";
import { markRatingsSeenAction } from "@/app/admin/_actions/rating-actions";

export function MarkRatingsSeenButton({ unseen }: { unseen: number }) {
  const [pending, startTransition] = useTransition();
  if (unseen === 0) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markRatingsSeenAction()))}
      className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {pending ? "Marking…" : `Mark ${unseen} as read`}
    </button>
  );
}
