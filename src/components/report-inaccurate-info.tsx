"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClassName } from "@/components/ui/button";
import { submitInaccuracyReportAction } from "@/app/_actions/engagement-actions";
import type { InaccuracyReportCategory } from "@/lib/engagement/types";

const CATEGORIES: { value: InaccuracyReportCategory; label: string }[] = [
  { value: "OFFICIAL_WEBSITE", label: "Official website" },
  { value: "DEVELOPER_NAME", label: "Developer name" },
  { value: "HEADQUARTERS", label: "Headquarters" },
  { value: "OTHER", label: "Other" },
];

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

/**
 * "Report inaccurate information" (Part 24) — a native <dialog> rather
 * than a hand-rolled modal: free focus trapping, Escape-to-close, and a
 * ::backdrop, with no extra dependency. Developer is pre-filled from the
 * page it's opened on and never editable — a visitor reports against the
 * developer they're actually looking at, never an arbitrary id typed into
 * a form.
 */
export function ReportInaccurateInfo({ developerId, developerName }: { developerId: string; developerName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<InaccuracyReportCategory>("OFFICIAL_WEBSITE");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setStatus("idle");
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await submitInaccuracyReportAction({
        developerId,
        category,
        details,
        reporterEmail: email || undefined,
      });
      if (result.ok) {
        setStatus("success");
        setDetails("");
        setEmail("");
      } else {
        setError(result.error ?? "Could not submit this report.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex min-h-11 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
      >
        Report inaccurate information
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setStatus("idle")}
        aria-labelledby="report-inaccurate-info-title"
        className="w-full max-w-md rounded-lg border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-foreground/30"
      >
        <div className="p-6">
          {status === "success" ? (
            <div role="status" aria-live="polite">
              <p className="text-sm font-medium text-trust">Thanks. We&apos;ve received your report.</p>
              <button type="button" onClick={close} className={buttonClassName("secondary", "mt-4")}>
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 id="report-inaccurate-info-title" className="text-base font-semibold text-foreground">
                Report inaccurate information
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">About {developerName}</p>

              <div className="mt-4">
                <label className={labelClassName} htmlFor="report-category">
                  What is incorrect?
                </label>
                <select
                  id="report-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as InaccuracyReportCategory)}
                  className={inputClassName}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className={labelClassName} htmlFor="report-details">
                  Details
                </label>
                <textarea
                  id="report-details"
                  required
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What's wrong, and what should it be?"
                  className={inputClassName}
                />
              </div>

              <div className="mt-4">
                <label className={labelClassName} htmlFor="report-email">
                  Email <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="report-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                />
              </div>

              {error && (
                <p role="alert" aria-live="polite" className="mt-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="mt-5 flex items-center gap-3">
                <button type="submit" disabled={isPending} className={buttonClassName("primary")}>
                  {isPending ? "Submitting…" : "Submit"}
                </button>
                <button type="button" onClick={close} disabled={isPending} className={buttonClassName("secondary")}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
