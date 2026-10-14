"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { ProjectSearchHit } from "@/lib/leads/project-service";

export type SearchProjects = (query: string) => Promise<ProjectSearchHit[]>;
export type AddProject = (name: string) => Promise<{ ok: true; project: ProjectSearchHit } | { ok: false; error: string }>;

const FIELD = "min-h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * Pick a project the client is interested in: search the inventory, or type ANY project name and add it (it is saved once and
 * suggested next time). The search and add functions are passed in, so the team's and the Founder's own actions are used as they should be.
 */
export function ProjectPicker({ open, onClose, chosen, onPick, search, add }: { open: boolean; onClose: () => void; chosen: ProjectSearchHit[]; onPick: (project: ProjectSearchHit) => void; search: SearchProjects; add: AddProject }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; items: ProjectSearchHit[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const items = await search(query).catch(() => []);
      if (!stale) setHits({ query, items });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query, search]);

  const [suggestions, setSuggestions] = useState<ProjectSearchHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Nothing typed yet: the projects added before, so a repeat is one tap.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    void search("").then((items) => !stale && setSuggestions(items)).catch(() => {});
    return () => {
      stale = true;
    };
  }, [open, search]);

  const typed = query.replace(/\s+/g, " ").trim();
  async function addTyped() {
    setAdding(true);
    setAddError(null);
    const result = await add(typed).catch(() => ({ ok: false as const, error: "Could not add that project. Try again." }));
    setAdding(false);
    if (result.ok) {
      setQuery("");
      onPick(result.project);
    } else setAddError(result.error);
  }

  const shown = hits?.query === query ? hits.items : null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Add a project">
      <div className="space-y-3">
        <input ref={input} autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project, developer or place" aria-label="Search projects" className={FIELD} />
        {query.trim().length < 2 && suggestions.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Projects you added before</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {suggestions.map((p) => {
                const already = chosen.some((c) => c.id === p.id);
                return (
                  <li key={p.id}>
                    <button type="button" disabled={already} onClick={() => onPick(p)} className="flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left hover:bg-muted disabled:opacity-50">
                      <span className="text-base font-medium text-foreground">{p.name}</span>
                      <span className="text-sm text-muted-foreground">{already ? "added" : "tap to add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {query.trim().length < 2 && <p className="text-sm text-muted-foreground">Type the project name. If it is not in the list, you can add it.</p>}
        {query.trim().length >= 2 && shown === null && <p className="text-sm text-muted-foreground">Searching…</p>}
        {shown && shown.length === 0 && <p className="text-sm text-muted-foreground">No saved project has that name yet.</p>}
        {shown && shown.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {shown.map((p) => {
              const already = chosen.some((c) => c.id === p.id);
              return (
                <li key={p.id}>
                  <button type="button" disabled={already} onClick={() => onPick(p)} className="flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left hover:bg-muted disabled:opacity-50">
                    <span className="text-base font-medium text-foreground">{p.name}</span>
                    <span className="text-sm text-muted-foreground">{[p.developerName, p.locality, p.city].filter(Boolean).join(" · ")}{already ? " · added" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {typed.length >= 2 && !(shown ?? []).some((p) => p.name.toLowerCase() === typed.toLowerCase()) && (
          <button type="button" disabled={adding || shown === null} onClick={addTyped} className="flex min-h-14 w-full items-center justify-center rounded-lg border border-accent bg-accent/10 px-4 py-2 text-base font-semibold text-accent-hover hover:bg-accent/20 disabled:opacity-50">
            {adding ? "Adding…" : `Add “${typed}” as a project`}
          </button>
        )}
        {addError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{addError}</p>}
      </div>
    </BottomSheet>
  );
}
