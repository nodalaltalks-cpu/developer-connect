"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { unlockTrashAction } from "@/app/admin/_actions/trash-actions";
import { ContactTrashList } from "@/components/admin/contact-trash-list";
import { buttonClassName } from "@/components/ui/button";
import type { ContactSubmission } from "@/lib/engagement/types";

type Status = "verifying" | "unlocked" | "needs-verification" | "error";

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-muted-foreground"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * The Founder-only reveal gate for Trash (Part 16/17). Trash's contents
 * are never fetched until `verifiedUnlock()` resolves with real data —
 * see unlockTrashAction for why the gate lives at the data-fetch layer,
 * not just here in the UI. Fires automatically on mount so the flow
 * matches "Click Trash -> security prompt -> Trash opens" without an
 * extra intermediate click; a Founder who cancels the Clerk prompt sees a
 * plain retry state, never a crash and never Trash's contents.
 */
export function TrashGate() {
  const [status, setStatus] = useState<Status>("verifying");
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const attemptedRef = useRef(false);
  const verifiedUnlock = useReverification(unlockTrashAction);

  const runUnlock = useCallback(async () => {
    setStatus("verifying");
    try {
      const result = await verifiedUnlock();
      setSubmissions(result.submissions);
      setStatus("unlocked");
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setStatus("needs-verification");
      } else {
        setStatus("error");
      }
    }
    // verifiedUnlock is a new function identity on every render (it wraps
    // unlockTrashAction fresh each time) — depending on it here would
    // re-run the effect below on every render instead of once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    runUnlock();
  }, [runUnlock]);

  if (status === "unlocked") {
    return <ContactTrashList initialSubmissions={submissions} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-8 py-16 text-center">
      <LockIcon />
      {status === "verifying" && (
        <p className="text-sm text-muted-foreground">Verifying your identity to open Trash…</p>
      )}
      {status === "needs-verification" && (
        <>
          <p className="text-sm font-medium text-foreground">Verification required</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Trash contains soft-deleted requests and is protected. Verify your identity to
            continue.
          </p>
          <button type="button" onClick={runUnlock} className={buttonClassName("primary", "mt-1")}>
            Verify to open Trash
          </button>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-sm font-medium text-foreground">Couldn&apos;t open Trash</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong verifying your identity. Please try again.
          </p>
          <button type="button" onClick={runUnlock} className={buttonClassName("secondary", "mt-1")}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
