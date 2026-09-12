"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { DeveloperEditToggle } from "@/components/admin/developer-edit-toggle";
import { DeveloperPublishPanel } from "@/components/admin/developer-publish-panel";
import { findPendingCandidate } from "@/lib/developer-connect/publish-state";
import type { Developer, WebsiteCandidate } from "@/lib/developer-connect/types";

/**
 * Everything on the developer detail page that depends on live
 * `developer` state — the header, progress steps, publish banner, edit
 * toggle, and publish panel. Holding `developer` here (seeded from the
 * server-fetched value, updated locally by DeveloperEditForm/
 * DeveloperPublishPanel's own callbacks) means a plain field save or a
 * republish/discard never needs `router.refresh()`: the edit section
 * stays exactly as open as the founder left it, and nothing else on the
 * page is disturbed. `candidates` never changes from these actions, so
 * it stays a plain prop rather than state.
 */
export function DeveloperDetailHeader({
  developer: initialDeveloper,
  candidates,
}: {
  developer: Developer;
  candidates: WebsiteCandidate[];
}) {
  const [developer, setDeveloper] = useState(initialDeveloper);

  const verifiedCandidate = candidates.find((c) => c.verificationStatus === "VERIFIED") ?? null;
  const activeCandidate = verifiedCandidate ?? candidates[0] ?? null;
  const reviewed =
    activeCandidate !== null &&
    activeCandidate.verificationStatus !== "DISCOVERED" &&
    activeCandidate.verificationStatus !== "PENDING_VERIFICATION";
  const published = verifiedCandidate !== null && developer.status === "ACTIVE";

  const pendingCandidate = published ? findPendingCandidate(candidates, verifiedCandidate!.id) : null;

  const steps = [
    { label: "Developer created", done: true },
    { label: "Website added", done: candidates.length > 0 },
    { label: "Founder review", done: reviewed },
    { label: "Published", done: published },
  ];

  const banner =
    candidates.length === 0
      ? { tone: "text-muted-foreground", label: "No official website yet — add one to begin review." }
      : published
        ? { tone: "text-accent-hover", label: "Published — visible in public search." }
        : activeCandidate?.verificationStatus === "REJECTED"
          ? {
              tone: "text-red-700",
              label: "Review required before publishing — the current website was rejected.",
            }
          : { tone: "text-accent-hover", label: "Everything is ready for your review." };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{developer.displayName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {developer.legalName} · {developer.city}, {developer.state} · {developer.status}
      </p>

      <ol className="mb-3 mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.done
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-background text-muted-foreground"
              }`}
              aria-hidden="true"
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className={step.done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
            {i < steps.length - 1 && <span className="mx-1 text-border">→</span>}
          </li>
        ))}
      </ol>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm font-medium ${banner.tone}`}>
          {banner.label}
          {activeCandidate && !published && (
            <>
              {" "}
              <Link href={`/admin/verification/${activeCandidate.id}`} className="underline hover:no-underline">
                Review now →
              </Link>
            </>
          )}
          {published && developer.pendingChanges && (
            <span className="ml-2 text-amber-800">● Unpublished changes</span>
          )}
        </p>
        {published && <DeveloperEditToggle developer={developer} onSaved={setDeveloper} />}
      </div>

      {published && <DeveloperPublishPanel developer={developer} onChange={setDeveloper} />}

      {pendingCandidate && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">This developer has unpublished changes.</p>
          <p className="mt-1 text-sm text-amber-800">
            A newer official website (
            <span className="font-mono">{pendingCandidate.canonicalDomain}</span>) hasn&apos;t been reviewed
            yet. The current verified website (
            <span className="font-mono">{verifiedCandidate!.canonicalDomain}</span>) stays live and public
            until you decide.
          </p>
          <Link
            href={`/admin/verification/${pendingCandidate.id}`}
            className={buttonClassName("primary", "mt-3")}
          >
            Review changes
          </Link>
        </div>
      )}
    </div>
  );
}
