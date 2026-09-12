"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { approveCandidateAction } from "@/app/admin/_actions/verification-actions";

const DEFAULT_REASON = "Reviewed and approved by founder";

/**
 * The one obvious final action on the founder review screen. Internally
 * this calls the exact same approveCandidateAction as before (which now
 * composes markReadyForReview + approveCandidate under the hood) — this
 * component only changes what the founder sees: a single click, no
 * mandatory reason field, since the lean workflow no longer requires the
 * founder to justify every approval in writing.
 */
export function ApprovePublishForm({ candidateId }: { candidateId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus();
    }
  }, [error]);

  function handleApprove() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await approveCandidateAction(candidateId, note.trim() || DEFAULT_REASON);
      if (result.ok) {
        setJustPublished(true);
        router.refresh();
      } else {
        setError(result.error ?? "Could not complete this action.");
      }
    });
  }

  return (
    <div ref={containerRef} className="rounded-lg border border-accent-soft bg-accent-soft/40 p-4">
      <label className="block text-sm font-medium text-foreground" htmlFor="approve-note">
        Notes (optional)
      </label>
      <input
        id="approve-note"
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Why is this the official site?"
        className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="polite"
          className="mt-2 text-sm text-red-700 focus:outline-none"
        >
          {error}
        </p>
      )}

      {justPublished && !error && (
        <div className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2" role="status" aria-live="polite">
          <p className="text-sm font-medium text-green-700">✓ Verified &amp; Published</p>
          <p className="mt-1 text-sm text-green-700">
            This developer is now publicly visible.{" "}
            <Link href="/admin/verification" className="font-medium underline">
              Back to verification queue
            </Link>
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        className={buttonClassName("primary", "mt-3 w-full")}
      >
        {isPending ? "Publishing…" : "Approve & Publish"}
      </button>
    </div>
  );
}
