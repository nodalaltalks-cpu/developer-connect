"use client";

import { useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { submitContactMessageAction } from "@/app/_actions/engagement-actions";
import type { ContactReason } from "@/lib/engagement/types";

const REASONS: { value: ContactReason; label: string }[] = [
  { value: "GENERAL_QUESTION", label: "General question" },
  { value: "REPORT_INACCURATE_INFO", label: "Report inaccurate information" },
  { value: "DEVELOPER_LISTING", label: "Developer listing" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "OTHER", label: "Other" },
];

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

const REASON_VALUES = new Set(REASONS.map((r) => r.value));

function isContactReason(value: string | undefined): value is ContactReason {
  return Boolean(value && REASON_VALUES.has(value as ContactReason));
}

/** Sending/Success/Error states (Part 26) — no phone field, never mandatory. */
export function ContactForm({ initialReason }: { initialReason?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<ContactReason>(
    isContactReason(initialReason) ? initialReason : "GENERAL_QUESTION",
  );
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await submitContactMessageAction({ name, email, reason, message });
      if (result.ok) {
        setStatus("success");
        setName("");
        setEmail("");
        setMessage("");
        setReason("GENERAL_QUESTION");
      } else {
        setStatus("error");
        setError(result.error ?? "Could not send your message. Please try again.");
      }
    });
  }

  if (status === "success") {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-trust/30 bg-trust-soft p-6">
        <p className="text-sm font-medium text-trust">Thanks. We&apos;ve received your message and will get back to you.</p>
        <button type="button" onClick={() => setStatus("idle")} className={buttonClassName("secondary", "mt-4")}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName} htmlFor="contact-name">
            Name
          </label>
          <input
            id="contact-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName} htmlFor="contact-email">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClassName} htmlFor="contact-reason">
          Reason
        </label>
        <select
          id="contact-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ContactReason)}
          className={inputClassName}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className={labelClassName} htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClassName}
        />
      </div>

      {status === "error" && error && (
        <p role="alert" aria-live="polite" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={buttonClassName("primary", "mt-5")}>
        {isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
