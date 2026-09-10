"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClassName, type ButtonVariant } from "@/components/ui/button";

interface VerificationActionFormProps {
  label: string;
  variant: ButtonVariant;
  action: (candidateId: string, reason: string) => Promise<void>;
  candidateId: string;
  reasonPlaceholder: string;
}

/**
 * Every founder decision goes through one of the Server Actions in
 * app/admin/_actions/verification-actions.ts, which themselves call only
 * verification-service.ts — this component never touches the database.
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await action(candidateId, reason);
            setReason("");
            router.refresh();
          } catch {
            setError("That action didn't go through. Please try again.");
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
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
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
