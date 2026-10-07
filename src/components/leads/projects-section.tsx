"use client";

import { useState, useTransition } from "react";
import type { LeadProjectsViewModel, MatchRowView } from "@/lib/leads/project-view";
import type { MatchResult } from "@/lib/leads/project-matching";
import { formatDateTimeFull } from "@/lib/leads/format";

/**
 * "Projects" on a lead page: which projects fit the buyer's requirement, WHY (each criterion is Match, Mismatch or
 * Unknown with a reason - never a score), and the buyer's shortlist with its history. The actions arrive as props with
 * the lead already bound; the server decides who may shortlist.
 */

export type ProjectActionResult = { ok: true } | { ok: false; error: string };
export type ShortlistProject = (projectId: string) => Promise<ProjectActionResult>;
export type RemoveShortlist = (entryId: string) => Promise<ProjectActionResult>;

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const RESULT_LABEL: Record<MatchResult, string> = { MATCH: "Match", MISMATCH: "Mismatch", UNKNOWN: "Unknown" };
const RESULT_TONE: Record<MatchResult, string> = { MATCH: "bg-green-50 text-green-800", MISMATCH: "bg-red-50 text-red-800", UNKNOWN: "bg-muted text-muted-foreground" };

function Row({ row, pending, onShortlist, onRemove }: { row: MatchRowView; pending: boolean; onShortlist: () => void; onRemove: () => void }) {
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.developerName}
            {row.place ? ` · ${row.place}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${RESULT_TONE[row.overall]}`}>{RESULT_LABEL[row.overall]}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {row.criteria.map((c) => (
          <li key={c.key} className="text-xs">
            <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-medium ${RESULT_TONE[c.result]}`}>
              {c.label}: {RESULT_LABEL[c.result]}
            </span>
            <span className="text-muted-foreground">{c.reason}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        {row.shortlistEntryId ? (
          <button type="button" className={BTN} disabled={pending} onClick={onRemove}>
            Remove from shortlist
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={onShortlist}>
            Shortlist for this buyer
          </button>
        )}
      </div>
    </li>
  );
}

export function ProjectsSection({ view, onShortlist, onRemove }: { view: LeadProjectsViewModel; onShortlist: ShortlistProject; onRemove: RemoveShortlist }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function perform(work: () => Promise<ProjectActionResult>, success: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      setMessage(result.ok ? { tone: "ok", text: success } : { tone: "error", text: result.error });
    });
  }

  return (
    <section aria-labelledby="projects-heading" className="rounded-lg border border-border p-4">
      <h2 id="projects-heading" className="text-sm font-semibold text-foreground">
        Projects
      </h2>
      {message && (
        <p role="status" className={`mt-2 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      {!view.hasRequirement ? (
        <p className="mt-2 text-sm text-muted-foreground">Add the buyer&apos;s requirement first - projects are matched against it.</p>
      ) : view.matches.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">There are no active projects to match yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Best fit first. Match means both sides state it and agree; Unknown means one side has not said. This is not a score.</p>
          <ul className="mt-3 space-y-2">
            {view.matches.map((row) => (
              <Row key={row.projectId} row={row} pending={pending} onShortlist={() => perform(() => onShortlist(row.projectId), "Shortlisted.")} onRemove={() => perform(() => onRemove(row.shortlistEntryId!), "Removed from the shortlist.")} />
            ))}
          </ul>
        </>
      )}
      {view.history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Shortlist history ({view.history.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {view.history.map((h) => (
              <li key={h.entryId}>
                {h.projectName} ({h.developerName}) - shortlisted {formatDateTimeFull(new Date(h.shortlistedAt))}
                {h.removedAt ? `, removed ${formatDateTimeFull(new Date(h.removedAt))}` : ", still shortlisted"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
