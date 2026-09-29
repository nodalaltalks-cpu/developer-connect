"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { unlockTrashAction, getTrashForRangeAction } from "@/app/admin/_actions/trash-actions";
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
 *
 * `rangeKey` (the Founder Dashboard's global date filter) is handled in
 * TWO distinct ways, on purpose:
 *  - The FIRST time this component ever reaches "unlocked" in its
 *    current mounted lifetime, getting there goes through the full
 *    step-up reverification flow (`unlockTrashAction`) — this is the
 *    "initial access" the security model is actually protecting.
 *  - Every SUBSEQUENT `rangeKey` change, once already unlocked, calls
 *    the plain founder-authed `getTrashForRangeAction` instead — no new
 *    reverification prompt, because changing which period is displayed
 *    is not a new act of accessing Trash. This fixes the earlier
 *    behavior where every range change re-ran the full challenge.
 * `hasUnlockedRef` is what remembers which of the two paths applies; it
 * lives only in this component instance's memory — a real page
 * reload/re-navigation to Trash creates a fresh instance and the full
 * reverification flow runs again from scratch. Nothing is persisted
 * server-side, so no authorization outlives this one open view.
 */
export function TrashGate({ rangeKey }: { rangeKey: string }) {
  const [status, setStatus] = useState<Status>("verifying");
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // True once the FULL reverification-gated unlock has succeeded at
  // least once in this component's current mounted lifetime.
  const hasUnlockedRef = useRef(false);
  // Which rangeKey the effect below has already handled — guards against
  // re-running for an unrelated re-render, same idea as before.
  const lastHandledRangeKeyRef = useRef<string | null>(null);
  const verifiedUnlock = useReverification(unlockTrashAction);

  const runInitialUnlock = useCallback(async () => {
    setStatus("verifying");
    try {
      const result = await verifiedUnlock(rangeKey);
      hasUnlockedRef.current = true;
      setSubmissions(result.submissions);
      setStatus("unlocked");
    } catch (err) {
      if (isReverificationCancelledError(err)) {
        setStatus("needs-verification");
      } else {
        setStatus("error");
      }
    }
    // verifiedUnlock is a new function identity on every render regardless
    // of rangeKey (it wraps unlockTrashAction fresh each time) — omitted
    // deliberately so this callback's identity (and therefore the effect
    // below) only changes when rangeKey itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // Range changed AFTER Trash was already unlocked once — no
  // reverification, just a plain re-fetch for the new period.
  const refetchForRange = useCallback(async (nextRangeKey: string) => {
    setIsRefreshing(true);
    try {
      const result = await getTrashForRangeAction(nextRangeKey);
      setSubmissions(result.submissions);
    } catch {
      // A transient failure here leaves the previous period's results on
      // screen rather than replacing them with an error state — this is
      // a filter refresh, not the sensitive initial access, so failing
      // quietly and letting the Founder try the range selector again is
      // preferable to bouncing them back to a lock screen.
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (lastHandledRangeKeyRef.current === rangeKey) return;
    lastHandledRangeKeyRef.current = rangeKey;

    if (hasUnlockedRef.current) {
      refetchForRange(rangeKey);
    } else {
      runInitialUnlock();
    }
  }, [rangeKey, runInitialUnlock, refetchForRange]);

  if (status === "unlocked") {
    return (
      <div>
        {isRefreshing && (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            Updating for the selected range…
          </p>
        )}
        {/* ContactTrashList seeds its own local state from
            `initialSubmissions` only on mount (it owns optimistic
            restore/delete updates afterward) — keying by `rangeKey`
            forces a fresh instance exactly when a range change just
            replaced `submissions`, which is the one time this component
            actually needs to pick up the new data rather than keep
            showing the previous range's rows. */}
        <ContactTrashList key={rangeKey} initialSubmissions={submissions} />
      </div>
    );
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
          <button type="button" onClick={runInitialUnlock} className={buttonClassName("primary", "mt-1")}>
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
          <button type="button" onClick={runInitialUnlock} className={buttonClassName("secondary", "mt-1")}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
