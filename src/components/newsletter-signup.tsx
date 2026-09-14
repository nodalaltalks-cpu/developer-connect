"use client";

import { useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { subscribeNewsletterAction } from "@/app/_actions/engagement-actions";

type Status = "idle" | "success" | "already" | "error";

/** Positioning + form only, per Part 28 — no unnecessary fields. */
export function NewsletterSignup({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await subscribeNewsletterAction({ email, source });
      if (result.ok) {
        setStatus(result.alreadySubscribed ? "already" : "success");
        setEmail("");
      } else {
        setStatus("error");
        setError(result.error ?? "Could not subscribe right now.");
      }
    });
  }

  return (
    <div>
      <p className="text-sm font-semibold text-foreground">Stay informed</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        New developers, market coverage, and useful real-estate research — no spam.
      </p>

      {status === "success" || status === "already" ? (
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-trust">
          {status === "already" ? "You're already subscribed." : "Thanks — you're subscribed."}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex max-w-sm flex-col gap-2 sm:flex-row">
          <label htmlFor={`newsletter-email-${source}`} className="sr-only">
            Email address
          </label>
          <input
            id={`newsletter-email-${source}`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" disabled={isPending} className={buttonClassName("primary", "shrink-0")}>
            {isPending ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}

      {status === "error" && error && (
        <p role="alert" aria-live="polite" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
