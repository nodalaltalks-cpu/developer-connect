"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveTestimonialAction,
  archiveTestimonialAction,
  createTestimonialRequestAction,
  markTestimonialSentAction,
  moveTestimonialToReviewAction,
  publishTestimonialAction,
  rejectTestimonialAction,
  seedIllustrativeTestimonialsAction,
  type CreateRequestResult,
  type TestimonialActionResult,
} from "@/app/admin/_actions/testimonial-actions";
import type { TestimonialStatus } from "@/lib/testimonials/model";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Create a request, then share it through the Founder's own WhatsApp or email (no recipient number is stored). */
export function RequestForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [result, setResult] = useState<Extract<CreateRequestResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setError(null);
      const res = await createTestimonialRequestAction(name);
      if (res.ok) {
        setResult(res);
        setName("");
      } else setError(res.error);
    });

  const sent = (channel: "WHATSAPP" | "EMAIL" | "LINK") => {
    if (!result) return;
    start(async () => {
      await markTestimonialSentAction(result.id, channel);
      router.refresh();
    });
  };

  return (
    <section aria-label="Request a testimonial" className="rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">Request a testimonial</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ask someone you have actually helped. The link is private to them and works once.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-sm text-foreground">
          <span className="sr-only">Their name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Their name (optional)" className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground" />
        </label>
        <button type="button" onClick={create} disabled={pending} className={PRIMARY}>
          Create request
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="mt-4 space-y-3 rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">Request created. This link is shown once; copy or send it now.</p>
          <p className="break-all rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground">{result.link}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <a href={result.whatsappHref} target="_blank" rel="noopener noreferrer" onClick={() => sent("WHATSAPP")} className={BTN}>
              Share on WhatsApp
            </a>
            <a href={result.mailtoHref} onClick={() => sent("EMAIL")} className={BTN}>
              Share by email
            </a>
            <button
              type="button"
              className={BTN}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
                sent("LINK");
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The next legal steps for one testimonial. The server enforces the same rules; this only offers what can work. */
export function RowActions({ id, status, illustrative, canPublish }: { id: string; status: TestimonialStatus; illustrative: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<TestimonialActionResult>) =>
    start(async () => {
      setError(null);
      const res = await work();
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "RECEIVED" && (
          <button type="button" disabled={pending} className={BTN} onClick={() => run(() => moveTestimonialToReviewAction(id))}>
            Move to review
          </button>
        )}
        {status === "PENDING_APPROVAL" && !illustrative && (
          <button type="button" disabled={pending || !canPublish} className={PRIMARY} onClick={() => run(() => approveTestimonialAction(id))}>
            Approve
          </button>
        )}
        {status === "APPROVED" && !illustrative && (
          <button type="button" disabled={pending} className={PRIMARY} onClick={() => run(() => publishTestimonialAction(id))}>
            Publish
          </button>
        )}
        {(status === "RECEIVED" || status === "PENDING_APPROVAL") && (
          <button
            type="button"
            disabled={pending}
            className={BTN}
            onClick={() => {
              const reason = window.prompt("Why is this being rejected? (kept in the audit trail; the author is not told)");
              if (reason) run(() => rejectTestimonialAction(id, reason));
            }}
          >
            Reject
          </button>
        )}
        {status !== "ARCHIVED" && (
          <button type="button" disabled={pending} className={BTN} onClick={() => run(() => archiveTestimonialAction(id))}>
            Archive
          </button>
        )}
      </div>
      {(status === "RECEIVED" || status === "PENDING_APPROVAL") && !canPublish && <p className="mt-1 text-xs text-muted-foreground">The author did not allow publishing, so this cannot be approved.</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function SeedButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={BTN}
        onClick={() =>
          start(async () => {
            const res = await seedIllustrativeTestimonialsAction();
            setMessage(res.ok ? (res.created === 0 ? "The templates already exist." : `Created ${res.created} internal templates.`) : res.error);
            router.refresh();
          })
        }
      >
        Create the 20 internal templates
      </button>
      {message && (
        <p role="status" className="mt-1 text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
