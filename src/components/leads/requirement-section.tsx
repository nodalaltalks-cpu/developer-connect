"use client";

import { SectionBar } from "@/components/leads/section-bar";
import { useState, useTransition } from "react";
import { ProjectPicker, type AddProject, type SearchProjects } from "@/components/team/project-picker";
import { formatDateTime, formatEnumLabel, formatMoney } from "@/lib/leads/format";
import {
  CONFIGURATION_SUGGESTIONS,
  PROPERTY_TYPE_SUGGESTIONS,
  budgetLabel,
  splitRequirements,
  type RequirementView,
} from "@/lib/leads/requirement-view";
import {
  LEAD_CURRENCIES,
  LEAD_PURPOSES,
  LEAD_TIMELINES,
  type LeadCurrency,
  type LeadPurpose,
  type LeadTimeline,
  type RequirementInput,
  type RequirementStatus,
} from "@/lib/leads/types";

/**
 * The buyer requirement, inside the lead page — shared by the Founder and the team member. It is a view over the
 * lead's requirement history: the current requirement up top (details, status controls, Edit), earlier ones folded
 * away. The three actions are PASSED IN by the page as individual props (the Founder's or the team member's server
 * actions, with the lead id already bound), so this component imports neither set and never says who is acting; the
 * server re-checks everything.
 */

export type RequirementActionResult = { ok: true } | { ok: false; error: string };

export type CreateRequirement = (input: RequirementInput) => Promise<RequirementActionResult>;
export type UpdateRequirement = (requirementId: string, input: RequirementInput) => Promise<RequirementActionResult>;
export type SetRequirementStatus = (requirementId: string, status: RequirementStatus) => Promise<RequirementActionResult>;
/** One save for the requirement and the projects the buyer will be sent details of (the requirement id is null for a new one). */
export type SaveRequirementWithProjects = (requirementId: string | null, input: RequirementInput, projectIds: string[]) => Promise<RequirementActionResult>;

/** A project chosen for this buyer. */
export interface ChosenProjectView {
  projectId: string;
  name: string;
  developerName: string;
}

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_LABEL: Record<RequirementStatus, string> = { ACTIVE: "Active", ON_HOLD: "On hold", FULFILLED: "Fulfilled", CLOSED: "Closed" };

const toIntOrNull = (value: string): number | null => {
  const cleaned = value.replace(/[,\s]/g, "");
  return cleaned === "" ? null : Number(cleaned);
};

function Summary({ r }: { r: RequirementView }) {
  const rows: Array<[string, string | null]> = [
    ["Location", r.locations.length ? r.locations.join(", ") : null],
    ["Budget", budgetLabel(r)],
    ["Configuration", r.configuration],
    ["Property type", r.propertyType],
    ["Purpose", r.purpose ? formatEnumLabel(r.purpose) : null],
    ["Timeline", r.timeline ? formatEnumLabel(r.timeline) : null],
    ["Notes", r.notes],
  ];
  const shown = rows.filter(([, value]) => value);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RequirementSection({
  requirements,
  prefill,
  onSave,
  onSetStatus,
  projects,
  searchProjects,
  addProject,
}: {
  requirements: RequirementView[];
  /** Details the lead already carries, offered as the starting point when there is no structured requirement yet. */
  prefill: RequirementInput;
  onSave: SaveRequirementWithProjects;
  onSetStatus: SetRequirementStatus;
  /** The projects currently chosen for this buyer (saved with the requirement). */
  projects: ChosenProjectView[];
  searchProjects: SearchProjects;
  addProject: AddProject;
}) {
  const { current, history } = splitRequirements(requirements);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [locations, setLocations] = useState<string[]>([]);
  const [locationDraft, setLocationDraft] = useState("");
  const [currency, setCurrency] = useState<LeadCurrency | "">("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [purpose, setPurpose] = useState<LeadPurpose | "">("");
  const [timeline, setTimeline] = useState<LeadTimeline | "">("");
  const [notes, setNotes] = useState("");
  const [chosen, setChosen] = useState<ChosenProjectView[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  function open(next: "edit" | "new") {
    setChosen(projects);
    setPickerOpen(false);
    const from: RequirementInput = next === "edit" && current ? current : current?.status === "ACTIVE" ? {} : prefill;
    setLocations(from.locations ?? []);
    setLocationDraft("");
    setCurrency(from.budgetCurrency ?? "");
    setBudgetMin(from.budgetMin?.toString() ?? "");
    setBudgetMax(from.budgetMax?.toString() ?? "");
    setConfiguration(from.configuration ?? "");
    setPropertyType(from.propertyType ?? "");
    setPurpose(from.purpose ?? "");
    setTimeline(from.timeline ?? "");
    setNotes(from.notes ?? "");
    setMessage(null);
    setMode(next);
  }

  function addLocation() {
    const name = locationDraft.trim();
    if (name && !locations.some((l) => l.toLowerCase() === name.toLowerCase())) setLocations([...locations, name]);
    setLocationDraft("");
  }

  function perform(work: () => Promise<RequirementActionResult>, success: string, then?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setMessage({ tone: "ok", text: success });
        then?.();
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  function save() {
    // A location typed but not yet added still counts.
    const draft = locationDraft.trim();
    const finalLocations = draft && !locations.some((l) => l.toLowerCase() === draft.toLowerCase()) ? [...locations, draft] : locations;
    const input: RequirementInput = {
      locations: finalLocations,
      budgetCurrency: currency || null,
      budgetMin: toIntOrNull(budgetMin),
      budgetMax: toIntOrNull(budgetMax),
      configuration: configuration || null,
      propertyType: propertyType || null,
      purpose: purpose || null,
      timeline: timeline || null,
      notes: notes || null,
    };
    if (chosen.length === 0) {
      setMessage({ tone: "error", text: "Add at least one project: the one whose details you will send this buyer." });
      return;
    }
    const ids = chosen.map((p) => p.projectId);
    // "Start a new one" begins a fresh requirement; editing changes the current one. Either way the projects are saved with it.
    if (mode === "edit" && current) perform(() => onSave(current.id, input, ids), "Saved.", () => setMode("view"));
    else perform(() => onSave(null, input, ids), "Saved.", () => setMode("view"));
  }

  const hint = (value: string) => {
    const n = toIntOrNull(value);
    return n !== null && currency && Number.isFinite(n) ? formatMoney(n, currency) : null;
  };

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="buyer-requirement-heading">
      <SectionBar id="buyer-requirement-heading" title="Buyer requirement" />
      <div className="flex items-start justify-end gap-3">
        {current && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{STATUS_LABEL[current.status]}</span>
        )}
      </div>

      {message && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      {mode === "view" && (
        <div className="mt-3">
          {current ? (
            <>
              <Summary r={current} />
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">Projects to send details of</p>
                {projects.length === 0 ? (
                  <p className="mt-1 text-sm font-medium text-red-700">None yet. Edit to add the project: it is required.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {projects.map((p) => (
                      <li key={p.projectId} className="rounded-full border border-accent bg-accent/10 px-3 py-1 text-sm text-foreground">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Updated {formatDateTime(new Date(current.updatedAt))}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className={BTN_PRIMARY} onClick={() => open("edit")} disabled={pending}>
                  Edit
                </button>
                {current.status === "ACTIVE" ? (
                  <button type="button" className={BTN} disabled={pending} onClick={() => perform(() => onSetStatus(current.id, "ON_HOLD"), "Put on hold.")}>
                    Put on hold
                  </button>
                ) : (
                  <button type="button" className={BTN} disabled={pending} onClick={() => perform(() => onSetStatus(current.id, "ACTIVE"), "Requirement resumed.")}>
                    Resume
                  </button>
                )}
              </div>
              <details className="mt-2">
                <summary className="min-h-11 cursor-pointer py-2.5 text-sm text-muted-foreground">More</summary>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button type="button" className={BTN} disabled={pending} onClick={() => perform(() => onSetStatus(current.id, "FULFILLED"), "Marked fulfilled.")}>
                    Mark fulfilled
                  </button>
                  <button type="button" className={BTN} disabled={pending} onClick={() => perform(() => onSetStatus(current.id, "CLOSED"), "Requirement closed.")}>
                    Close
                  </button>
                  <button type="button" className={BTN} disabled={pending} onClick={() => open("new")}>
                    Start a new one
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {requirements.length > 0 ? "No active requirement." : "No requirement recorded yet."}
              </p>
              <button type="button" className={`${BTN_PRIMARY} mt-3 w-full`} onClick={() => open("new")} disabled={pending}>
                Add requirement
              </button>
            </>
          )}
        </div>
      )}

      {mode !== "view" && (
        <div className="mt-3 grid gap-3">
          <div className="rounded-lg border-2 border-accent/50 p-3">
            <p className="text-sm font-semibold text-foreground">
              Project to send details of <span className="font-normal text-red-700">(required)</span>
            </p>
            {chosen.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {chosen.map((p) => (
                  <li key={p.projectId}>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent bg-accent/10 px-3 text-sm text-foreground hover:bg-accent/20"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => setChosen(chosen.filter((c) => c.projectId !== p.projectId))}
                    >
                      {p.name} <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={`${BTN} mt-2 w-full`} onClick={() => setPickerOpen(true)}>
              {chosen.length === 0 ? "+ Add a project" : "+ Add another project"}
            </button>
            {chosen.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Search the list, or type the project name and add it.</p>}
          </div>
          <ProjectPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            search={searchProjects}
            add={addProject}
            chosen={chosen.map((p) => ({ id: p.projectId, name: p.name, developerName: p.developerName, city: "", locality: null }))}
            onPick={(hit) => {
              setChosen((list) => (list.some((c) => c.projectId === hit.id) ? list : [...list, { projectId: hit.id, name: hit.name, developerName: hit.developerName }]));
              setPickerOpen(false);
            }}
          />
          <div>
            <label htmlFor="req-location" className="block text-sm font-medium text-foreground">
              Preferred locations
            </label>
            {locations.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {locations.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm text-foreground hover:bg-muted"
                      aria-label={`Remove ${name}`}
                      onClick={() => setLocations(locations.filter((l) => l !== name))}
                    >
                      {name} <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex gap-2">
              <input
                id="req-location"
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLocation();
                  }
                }}
                placeholder="e.g. Thane, Navi Mumbai"
                maxLength={120}
                className={FIELD}
              />
              <button type="button" className={BTN} onClick={addLocation} disabled={!locationDraft.trim()}>
                Add
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">Budget</p>
            <div className="mt-1.5 grid grid-cols-[6rem_1fr_1fr] gap-2">
              <select value={currency} onChange={(e) => setCurrency(e.target.value as LeadCurrency | "")} className={FIELD} aria-label="Budget currency">
                <option value="">Currency</option>
                {LEAD_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} inputMode="numeric" placeholder="Minimum" className={FIELD} aria-label="Minimum budget" />
              <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} inputMode="numeric" placeholder="Maximum" className={FIELD} aria-label="Maximum budget" />
            </div>
            {(hint(budgetMin) || hint(budgetMax)) && (
              <p className="mt-1 text-xs text-muted-foreground">{[hint(budgetMin), hint(budgetMax)].filter(Boolean).join(" to ")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="req-config" className="block text-sm font-medium text-foreground">
                Configuration
              </label>
              <input id="req-config" list="req-config-options" value={configuration} onChange={(e) => setConfiguration(e.target.value)} maxLength={60} className={`${FIELD} mt-1.5`} />
              <datalist id="req-config-options">
                {CONFIGURATION_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="req-type" className="block text-sm font-medium text-foreground">
                Property type
              </label>
              <input id="req-type" list="req-type-options" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} maxLength={60} className={`${FIELD} mt-1.5`} />
              <datalist id="req-type-options">
                {PROPERTY_TYPE_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="req-purpose" className="block text-sm font-medium text-foreground">
                Purpose
              </label>
              <select id="req-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as LeadPurpose | "")} className={`${FIELD} mt-1.5`}>
                <option value="">Not said</option>
                {LEAD_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {formatEnumLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="req-timeline" className="block text-sm font-medium text-foreground">
                Buying timeline
              </label>
              <select id="req-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value as LeadTimeline | "")} className={`${FIELD} mt-1.5`}>
                <option value="">Not said</option>
                {LEAD_TIMELINES.map((t) => (
                  <option key={t} value={t}>
                    {formatEnumLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="req-notes" className="block text-sm font-medium text-foreground">
              Context (optional)
            </label>
            <textarea id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={`${FIELD} mt-1.5 py-2`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className={BTN} onClick={() => setMode("view")} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && mode === "view" && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2.5 text-sm text-muted-foreground">Earlier requirements ({history.length})</summary>
          <ul className="space-y-3">
            {history.map((r) => (
              <li key={r.id} className="rounded-md bg-muted p-3">
                <p className="text-xs font-medium text-foreground">
                  {STATUS_LABEL[r.status]} · {formatDateTime(new Date(r.createdAt))}
                </p>
                <div className="mt-2">
                  <Summary r={r} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
