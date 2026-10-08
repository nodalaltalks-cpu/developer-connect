"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enableMyWorkspaceAction } from "@/app/admin/_actions/staff-actions";

/** One card for the Founder: turn on their own calling workspace (dial pad, queue, follow-ups), tracked like any team member. */
export function EnableWorkspace({ enrolledAs }: { enrolledAs: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (enrolledAs) {
    return (
      <section aria-label="My calling workspace" className="mb-5 rounded-xl border border-border p-4">
        <h2 className="text-base font-semibold text-foreground">My calling workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">You are set up as {enrolledAs}. Your calls, follow-ups and results are tracked like any team member&apos;s.</p>
        <Link href="/team" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          Open my workspace
        </Link>
      </section>
    );
  }
  return (
    <section aria-label="My calling workspace" className="mb-5 rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">Work your own calls and leads</h2>
      <p className="mt-1 text-sm text-muted-foreground">Turn on your own calling workspace: the dial pad, calling queue, follow-ups and Cold Call form. Your calls and results are tracked like any team member&apos;s, and you stay the Founder.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await enableMyWorkspaceAction();
            if (res.ok) {
              setMessage(res.message ?? "Done.");
              router.refresh();
            } else setError(res.error);
          })
        }
        className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        Set up my calling workspace
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
