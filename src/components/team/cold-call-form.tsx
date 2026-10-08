"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { lookupMyColdCallNumberAction, saveMyColdCallLeadAction, searchMyProjectsAction, type ColdCallFormPayload } from "@/app/team/_actions/team-actions";
import type { ColdCallLookup } from "@/lib/leads/cold-call-service";
import type { ColdCallLeadResult } from "@/lib/leads/cold-call-lead-service";
import type { ProjectSearchHit } from "@/lib/leads/project-service";
import { CONFIGURATION_SUGGESTIONS, PROPERTY_TYPE_SUGGESTIONS } from "@/lib/leads/requirement-view";
import { formatEnumLabel, formatMoney, toBusinessLocalInput } from "@/lib/leads/format";
import { LEAD_PURPOSES, LEAD_TIMELINES, type LeadCurrency, type LeadPurpose, type LeadTimeline } from "@/lib/leads/types";
import { QUALIFICATION_REASONS, type QualificationOutcome, type QualificationReason } from "@/lib/leads/qualification-model";

/**
 * Cold Call intake, built for one thumb: short section cards, big choices, and ONE Save at the bottom that stores the
 * whole call at once (the server saves all of it or none of it, so a half-finished cold call can never exist).
 *
 * Two ways in, one form: a typed number (a NEW cold-call lead is created on Save) or a lead that already exists, usually
 * the one just dialed (its details are added). The browser sends only plain choices: the owner, the source (always COLD_CALL),
 * the canonical status and every timestamp are decided on the server.
 */

const FIELD = "min-h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const CARD = "rounded-xl border border-border bg-background p-4";
const CHOICE = "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-4 text-left text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP = "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const COUNTRIES = [
  { code: "+91", label: "India +91", minDigits: 10 },
  { code: "+971", label: "UAE +971", minDigits: 8 },
] as const;

const OUTCOMES: Array<{ value: Exclude<QualificationOutcome, "NOT_LOOKING">; title: string; help: string }> = [
  { value: "QUALIFIED", title: "Qualified", help: "Contacted, and genuinely interested." },
  { value: "PENDING_QUALIFICATION", title: "Pending qualification", help: "Spoke to them; still finding out." },
  { value: "FUTURE_POTENTIAL", title: "Future potential", help: "Not now, but worth coming back to." },
];

const PLAN_KINDS: Array<{ value: string; label: string }> = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "MEETING", label: "Meeting" },
  { value: "VIDEO_CALL", label: "Video call" },
];

const toggle = (on: boolean) => (on ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground hover:bg-muted");

function wholeNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d{1,12}$/.test(cleaned)) return null;
  return Number(cleaned);
}

export interface ColdCallFormProps {
  /** Set when adding details to an existing lead (e.g. the one just dialed). */
  leadId?: string;
  /** Existing lead: the last four digits only (the number itself is not sent to the page). */
  phoneLast4?: string | null;
  /** New lead: a number typed on the dial pad, carried over. */
  initialPhone?: string;
  initialName?: string | null;
  initialEmail?: string | null;
}

export function ColdCallForm({ leadId, phoneLast4, initialPhone = "", initialName = null, initialEmail = null }: ColdCallFormProps) {
  const existing = Boolean(leadId);
  const [pending, startTransition] = useTransition();

  // 1. contact
  const initialCountry = COUNTRIES.find((c) => initialPhone.startsWith(c.code)) ?? COUNTRIES[0];
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>(initialCountry);
  const [digits, setDigits] = useState(initialPhone.startsWith(initialCountry.code) ? initialPhone.slice(initialCountry.code.length).replace(/\D/g, "") : initialPhone.replace(/\D/g, "").slice(-10));
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [lookup, setLookup] = useState<{ number: string; result: ColdCallLookup | null } | null>(null);
  // 2-4. interest, projects, qualification
  const [interest, setInterest] = useState<"INTERESTED" | "NOT_LOOKING" | null>(null);
  const [projects, setProjects] = useState<ProjectSearchHit[]>([]);
  const [outcome, setOutcome] = useState<Exclude<QualificationOutcome, "NOT_LOOKING"> | null>(null);
  const [reason, setReason] = useState<QualificationReason | null>(null);
  // 5. next step
  const [planKind, setPlanKind] = useState<string | null>(null);
  const [planWhen, setPlanWhen] = useState("");
  const [planNote, setPlanNote] = useState("");
  // 6. requirement
  const [reqOpen, setReqOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [currency, setCurrency] = useState<LeadCurrency>("INR");
  const [purpose, setPurpose] = useState<LeadPurpose | "">("");
  const [timeline, setTimeline] = useState<LeadTimeline | "">("");
  // 7. note
  const [note, setNote] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Extract<ColdCallLeadResult, { saved: true }> | null>(null);
  const [duplicate, setDuplicate] = useState<Exclude<ColdCallLeadResult, { saved: true }> | null>(null);

  const full = `${country.code}${digits}`;
  const phoneReady = digits.length >= country.minDigits;
  const interested = interest === "INTERESTED";

  // Duplicate check while typing a NEW number (the server decides; a lead that is not yours reveals nothing).
  useEffect(() => {
    if (existing || !phoneReady) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await lookupMyColdCallNumberAction(full).catch(() => null);
      if (!stale) setLookup({ number: full, result });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [existing, phoneReady, full]);
  const lookupNow = !existing && phoneReady && lookup?.number === full ? lookup.result : null;
  const blocked = lookupNow?.kind === "NOT_YOURS" || lookupNow?.kind === "INVALID";

  const budgetMinNumber = wholeNumber(budgetMin);
  const budgetMaxNumber = wholeNumber(budgetMax);
  const requirement = useMemo(() => {
    const locations = location.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 5);
    const r = {
      ...(locations.length ? { locations } : {}),
      ...(configuration.trim() ? { configuration: configuration.trim() } : {}),
      ...(propertyType.trim() ? { propertyType: propertyType.trim() } : {}),
      ...(budgetMinNumber !== null ? { budgetMin: budgetMinNumber } : {}),
      ...(budgetMaxNumber !== null ? { budgetMax: budgetMaxNumber } : {}),
      ...(budgetMinNumber !== null || budgetMaxNumber !== null ? { budgetCurrency: currency } : {}),
      ...(purpose ? { purpose } : {}),
      ...(timeline ? { timeline } : {}),
    };
    return Object.keys(r).length ? r : null;
  }, [location, configuration, propertyType, budgetMinNumber, budgetMaxNumber, currency, purpose, timeline]);

  const problems: string[] = [];
  if (!existing && !phoneReady) problems.push("Enter the phone number.");
  if (blocked) problems.push("This number cannot be saved from here.");
  if (!interest) problems.push("Choose Interested or Not looking right now.");
  if (interested && !outcome) problems.push("Choose a qualification.");
  if (planKind && !planWhen) problems.push("Choose the date and time of the next step.");
  if (planKind === "SITE_VISIT" && projects.length === 0) problems.push("Add the project for the site visit.");
  if (interest && note.trim().length < 3) problems.push("Add a comment on the call. It is saved with the date, time and day.");
  const canSave = problems.length === 0 && !pending && !saved;

  const dirty = Boolean(digits || name || email || interest || note || projects.length);
  useEffect(() => {
    if (!dirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saved]);

  function save() {
    setError(null);
    setDuplicate(null);
    const payload: ColdCallFormPayload = {
      leadId: leadId ?? null,
      ...(existing ? {} : { phone: full }),
      name,
      email,
      interest: interest ?? "",
      qualification: interested ? { outcome: outcome ?? "", reason: outcome === "QUALIFIED" ? reason : null } : null,
      projectIds: interested ? projects.map((p) => p.id) : [],
      plan: interested && planKind ? { kind: planKind, whenLocal: planWhen, note: planNote } : null,
      requirement: interested ? requirement : null,
      note,
    };
    startTransition(async () => {
      const response = await saveMyColdCallLeadAction(payload);
      if (!response.ok) return setError(response.error);
      if (response.result.saved) return setSaved(response.result);
      setDuplicate(response.result);
    });
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-md" role="status">
        <div className={`${CARD} text-center`}>
          <p className="text-lg font-semibold text-foreground">{saved.createdLead ? "Cold call lead saved" : "Call details saved"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved.createdLead ? "It is your lead, and it is in the Cold Call bucket. " : ""}
            {saved.projects > 0 ? `${saved.projects} project${saved.projects === 1 ? "" : "s"} noted. ` : ""}
            {saved.planned ? "Next step scheduled. " : ""}
          </p>
          <div className="mt-4 grid gap-2">
            <Link href={`/team/leads/${saved.leadId}`} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-4 text-base font-semibold text-accent-foreground">
              Open lead
            </Link>
            <Link href="/team/dial" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border px-4 text-base font-medium text-foreground hover:bg-muted">
              Next number
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pb-32">
      {duplicate && (
        <div role="alert" className="mb-3 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
          {duplicate.reason === "EXISTS_YOURS" ? (
            <>
              This number is already your lead{duplicate.leadName ? `: ${duplicate.leadName}` : ""}.{" "}
              <Link href={`/team/cold-call/${duplicate.leadId}`} className="font-semibold text-accent-hover underline">
                Add details to it
              </Link>{" "}
              or{" "}
              <Link href={`/team/leads/${duplicate.leadId}`} className="font-semibold text-accent-hover underline">
                view it
              </Link>
              .
            </>
          ) : (
            "This number is already in the system and is not assigned to you, so it cannot be saved from here."
          )}
        </div>
      )}

      <ol className="space-y-3">
        <li className={CARD}>
          <h2 className="text-base font-semibold text-foreground">1. Contact</h2>
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} className={`${FIELD} mt-1.5`} />
            </label>
            {existing ? (
              <p className="text-sm text-muted-foreground">Phone ending {phoneLast4 ?? "••••"} (the number stays as it is).</p>
            ) : (
              <div>
                <span className="block text-sm font-medium text-foreground">Phone</span>
                <div className="mt-1.5 flex gap-2">
                  <select aria-label="Country code" value={country.code} onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])} className={`${FIELD} w-32 shrink-0`}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Phone number" inputMode="tel" autoComplete="off" value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 12))} className={FIELD} />
                </div>
                <div aria-live="polite" className="mt-2 text-sm">
                  {lookupNow?.kind === "YOURS" && (
                    <p className="rounded-md bg-muted px-3 py-2 text-foreground">
                      Already your lead{lookupNow.leadName ? `: ${lookupNow.leadName}` : ""}.{" "}
                      <Link href={`/team/leads/${lookupNow.leadId}`} className="font-semibold text-accent-hover underline">
                        View existing lead
                      </Link>
                    </p>
                  )}
                  {lookupNow?.kind === "NOT_YOURS" && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">Already in the system and not assigned to you.</p>}
                  {lookupNow?.kind === "INVALID" && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">Check the number.</p>}
                  {lookupNow?.kind === "NEW" && <p className="text-muted-foreground">New number.</p>}
                </div>
              </div>
            )}
            <label className="block text-sm font-medium text-foreground">
              Email (optional)
              <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" maxLength={254} className={`${FIELD} mt-1.5`} />
            </label>
          </div>
        </li>

        <li className={CARD}>
          <h2 className="text-base font-semibold text-foreground">2. Client interest</h2>
          <div role="radiogroup" aria-label="Client interest" className="mt-3 grid gap-2">
            {(["INTERESTED", "NOT_LOOKING"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={interest === value} onClick={() => setInterest(value)} className={`${CHOICE} ${toggle(interest === value)}`}>
                {value === "INTERESTED" ? "Interested" : "Not looking right now"}
                <span aria-hidden="true">{interest === value ? "●" : "○"}</span>
              </button>
            ))}
          </div>
        </li>

        {interested && (
          <>
            <li className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">3. Interested projects</h2>
                <button type="button" onClick={() => setSheetOpen(true)} disabled={projects.length >= 5} className={`${CHIP} border-border text-accent-hover hover:bg-muted disabled:opacity-50`}>
                  + Add project
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Search the projects you have in the system. Nothing is invented here.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {projects.map((p) => (
                    <li key={p.id} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent/10 py-1 pl-4 pr-1 text-sm text-foreground">
                      <span>
                        {p.name}
                        <span className="text-muted-foreground">, {p.locality ?? p.city}</span>
                      </span>
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setProjects((list) => list.filter((x) => x.id !== p.id))} className="inline-flex size-10 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-muted">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li className={CARD}>
              <h2 className="text-base font-semibold text-foreground">4. Client is</h2>
              <div role="radiogroup" aria-label="Qualification" className="mt-3 grid gap-2">
                {OUTCOMES.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={outcome === o.value} onClick={() => { setOutcome(o.value); if (o.value !== "QUALIFIED") setReason(null); }} className={`${CHOICE} ${toggle(outcome === o.value)} flex-col items-start justify-center py-2`}>
                    <span>{o.title}</span>
                    <span className="text-sm font-normal text-muted-foreground">{o.help}</span>
                  </button>
                ))}
              </div>
              {outcome === "QUALIFIED" && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-foreground">Reason (optional)</p>
                  <div role="radiogroup" aria-label="Reason" className="mt-2 flex flex-wrap gap-2">
                    {QUALIFICATION_REASONS.map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(reason === r ? null : r)} className={`${CHIP} ${toggle(reason === r)}`}>
                        {formatEnumLabel(r)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>

            <li className={CARD}>
              <h2 className="text-base font-semibold text-foreground">5. Next step (optional)</h2>
              <div role="radiogroup" aria-label="Next step" className="mt-3 flex flex-wrap gap-2">
                {PLAN_KINDS.map((k) => (
                  <button key={k.value} type="button" role="radio" aria-checked={planKind === k.value} onClick={() => { const next = planKind === k.value ? null : k.value; setPlanKind(next); if (next && !planWhen) setPlanWhen(toBusinessLocalInput(new Date(), { addDays: 1, atHour: 10 })); }} className={`${CHIP} ${toggle(planKind === k.value)}`}>
                    {k.label}
                  </button>
                ))}
              </div>
              {planKind && (
                <div className="mt-3 space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    When (India time)
                    <input type="datetime-local" value={planWhen} min={toBusinessLocalInput(new Date())} onChange={(e) => setPlanWhen(e.target.value)} className={`${FIELD} mt-1.5`} />
                  </label>
                  {planKind === "SITE_VISIT" && projects.length === 0 && <p className="text-sm text-red-700">Add the project for the site visit above.</p>}
                  <label className="block text-sm font-medium text-foreground">
                    Note (optional)
                    <input value={planNote} onChange={(e) => setPlanNote(e.target.value)} maxLength={500} className={`${FIELD} mt-1.5`} />
                  </label>
                </div>
              )}
            </li>

            <li className={CARD}>
              <button type="button" aria-expanded={reqOpen} onClick={() => setReqOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between text-left">
                <h2 className="text-base font-semibold text-foreground">6. Requirement (optional)</h2>
                <span aria-hidden="true" className="text-muted-foreground">{reqOpen ? "−" : "+"}</span>
              </button>
              {reqOpen && (
                <div className="mt-3 space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    Preferred location(s)
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Thane, Navi Mumbai" maxLength={200} className={`${FIELD} mt-1.5`} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-foreground">
                      Configuration
                      <input list="cc-config" value={configuration} onChange={(e) => setConfiguration(e.target.value)} maxLength={60} className={`${FIELD} mt-1.5`} />
                      <datalist id="cc-config">{CONFIGURATION_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
                    </label>
                    <label className="block text-sm font-medium text-foreground">
                      Property type
                      <input list="cc-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} maxLength={60} className={`${FIELD} mt-1.5`} />
                      <datalist id="cc-type">{PROPERTY_TYPE_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Budget</span>
                      <div role="radiogroup" aria-label="Currency" className="flex gap-2">
                        {(["INR", "AED"] as const).map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)} className={`${CHIP} min-h-11 px-3 ${toggle(currency === c)}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-3">
                      <input aria-label="Budget from" inputMode="numeric" placeholder="From" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} className={FIELD} />
                      <input aria-label="Budget to" inputMode="numeric" placeholder="To" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} className={FIELD} />
                    </div>
                    {(budgetMinNumber !== null || budgetMaxNumber !== null) && (
                      <p className="mt-1 text-xs text-muted-foreground">{[budgetMinNumber !== null ? formatMoney(budgetMinNumber, currency) : null, budgetMaxNumber !== null ? formatMoney(budgetMaxNumber, currency) : null].filter(Boolean).join(" to ")}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-foreground">
                      Purpose
                      <select value={purpose} onChange={(e) => setPurpose(e.target.value as LeadPurpose | "")} className={`${FIELD} mt-1.5`}>
                        <option value="">Not said</option>
                        {LEAD_PURPOSES.map((p) => <option key={p} value={p}>{formatEnumLabel(p)}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-foreground">
                      Timeline
                      <select value={timeline} onChange={(e) => setTimeline(e.target.value as LeadTimeline | "")} className={`${FIELD} mt-1.5`}>
                        <option value="">Not said</option>
                        {LEAD_TIMELINES.map((t) => <option key={t} value={t}>{formatEnumLabel(t)}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </li>
          </>
        )}

        {interest && (
          <li className={CARD}>
            <label className="block text-base font-semibold text-foreground">
              {interested ? "7. Comment on the call" : "3. Comment on the call"} <span className="font-normal text-red-700">(required)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${FIELD} mt-2 py-2 text-base font-normal`} />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">Required. Saved to the lead&apos;s history with the date, time and day, and it cannot be edited afterwards. The lead is not saved without it.</p>
          </li>
        )}
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mt-4 sm:border-0 sm:p-0">
        <div className="mx-auto max-w-md">
          {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {!error && problems.length > 0 && interest && <p className="mb-2 text-xs text-muted-foreground">{problems[0]}</p>}
          <button type="button" onClick={save} disabled={!canSave} className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-4 text-base font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {pending ? "Saving…" : existing ? "Save call details" : "Save cold call lead"}
          </button>
        </div>
      </div>

      <ProjectPicker open={sheetOpen} onClose={() => setSheetOpen(false)} chosen={projects} onPick={(p) => { setProjects((list) => (list.some((x) => x.id === p.id) || list.length >= 5 ? list : [...list, p])); setSheetOpen(false); }} />
    </div>
  );
}

function ProjectPicker({ open, onClose, chosen, onPick }: { open: boolean; onClose: () => void; chosen: ProjectSearchHit[]; onPick: (project: ProjectSearchHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; items: ProjectSearchHit[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const items = await searchMyProjectsAction(query).catch(() => []);
      if (!stale) setHits({ query, items });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const shown = hits?.query === query ? hits.items : null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Add a project">
      <div className="space-y-3">
        <input ref={input} autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project, developer or place" aria-label="Search projects" className={FIELD} />
        {query.trim().length < 2 && <p className="text-sm text-muted-foreground">Type at least two letters.</p>}
        {query.trim().length >= 2 && shown === null && <p className="text-sm text-muted-foreground">Searching…</p>}
        {shown && shown.length === 0 && <p className="text-sm text-muted-foreground">No active project matches. Projects are added by the Founder.</p>}
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
      </div>
    </BottomSheet>
  );
}
