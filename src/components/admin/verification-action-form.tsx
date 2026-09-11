"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClassName, type ButtonVariant } from "@/components/ui/button";
import type { VerificationActionResult } from "@/app/admin/_actions/verification-actions";

interface VerificationActionFormProps {
  label: string;
  variant: ButtonVariant;
  action: (candidateId: string, reason: string) => Promise<VerificationActionResult>;
  candidateId: string;
  reasonPlaceholder: string;
}

/**
 * Every founder decision goes through one of the Server Actions in
 * app/admin/_actions/verification-actions.ts, which themselves call only
 * verification-service.ts — this component never touches the database.
 *
 * The Server Action always returns `{ ok, error }` rather than throwing,
 * so whatever specific, real reason it gives is shown here verbatim —
 * never replaced with a generic "something went wrong."
 */
export function VerificationActionForm({
  label,
  variant,
  action,
  candidateId,
  reasonPlaceholder,
}: VerificationActionFormProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus();
    }
  }, [error]);

  return (
    <form
      ref={containerRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (isPending) return;
        setError(null);
        startTransition(async () => {
          const result = await action(candidateId, reason);
          if (result.ok) {
            setReason("");
            router.refresh();
          } else {
            setError(result.error ?? "Could not complete this action.");
          }
        });
      }}
      className="rounded-lg border border-border p-4"
    >
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={reasonPlaceholder}
        required
        rows={2}
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
      <button
        type="submit"
        disabled={isPending}
        className={buttonClassName(variant, "mt-3 w-full sm:w-auto")}
      >
        {isPending ? "Saving…" : label}
      </button>
    </form>
  );
}
