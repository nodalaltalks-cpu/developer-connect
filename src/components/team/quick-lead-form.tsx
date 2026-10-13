"use client";

import { useState, useTransition } from "react";
import { saveMyColdCallLeadAction } from "@/app/team/_actions/team-actions";
import { WhenInput } from "@/components/leads/when-input";
import { ProjectPicker } from "@/components/team/project-picker";
import type { ProjectSearchHit } from "@/lib/leads/project-service";
import { CountryCodeField, DEFAULT_COUNTRY, countryReady, dialCode, maxDigits, minDigits, type CountrySelection } from "@/components/team/country-code-field";
import { BUDGETS, CONFIGURATIONS, TIMELINES } from "@/lib/social/enquiry-options";
import { toBusinessLocalInput } from "@/lib/leads/format";
import type { LeadCurrency, LeadPurpose, LeadTimeline, RequirementInput } from "@/lib/leads/types";

/**
 * THE SHORT LEAD FORM: what an employee fills in after a client sounds interested, on one screen and a little scroll. Every answer is
 * a tap. Anything the client did not say is "NA" (allowed, but it must be a deliberate tap, so nothing is left blank by accident).
 * Saving makes the number the employee's lead; calls already made to it stay on it.
 */

const NA = "NA";
const INTENTS = [
  { key: "BUY", label: "Buy" },
  { key: "INVEST", label: "Invest" },
  { key: "RENT_IN", label: "Rent" },
];
const CITIES = [
  { key: "MUMBAI", label: "Mumbai" },
  { key: "DUBAI", label: "Dubai" },
  { key: "OTHER", label: "Other city" },
];
const NEXT_STEPS = [
  { key: "CALL", label: "Call back" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "MEETING", label: "Meeting" },
  { key: "NONE", label: "None" },
];
const QUICK_COMMENTS = ["Wants details on WhatsApp", "Asked to call back", "Comparing options", "Ready to visit"];

const CHIP = "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const FIELD = "min-h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Row({ label, missing, children }: { label: string; missing: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 ${missing ? "border-amber-400 bg-amber-50/50" : "border-border"}`}>
      <p className="mb-2 text-sm font-semibold text-foreground">
        {label}
        {missing && <span className="ml-2 text-xs font-normal text-amber-800">tap an option, or NA</span>}
      </p>
      {children}
    </div>
  );
}

function Pick({ options, value, onPick, withNA = true }: { options: ReadonlyArray<{ key: string; label: string }>; value: string; onPick: (key: string) => void; withNA?: boolean }) {
  const all = withNA ? [...options, { key: NA, label: "NA" }] : options;
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {all.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onPick(value === o.key ? "" : o.key)} className={`${CHIP} ${value === o.key ? (o.key === NA ? "border-foreground bg-foreground text-background" : "border-accent bg-accent text-accent-foreground") : "border-border bg-background text-foreground hover:bg-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface QuickLeadSaved {
  leadId: string;
}

export function QuickLeadForm({ leadId = null, askPhone = false, initialPhone = "", onSaved }: { leadId?: string | null; askPhone?: boolean; initialPhone?: string; onSaved: (saved: QuickLeadSaved) => void }) {
  const [country, setCountry] = useState<CountrySelection>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState(initialPhone.replace(/^\+91/, "").replace(/\D/g, ""));
  const [name, setName] = useState("");
  const [nameNA, setNameNA] = useState(false);
  const [intent, setIntent] = useState("");
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [size, setSize] = useState("");
  const [timeline, setTimeline] = useState("");
  const [next, setNext] = useState("");
  const [when, setWhen] = useState("");
  const [comment, setComment] = useState("");
  const [projects, setProjects] = useState<ProjectSearchHit[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const bands = city === "DUBAI" ? BUDGETS.AED : BUDGETS.INR;
  const phoneOk = !askPhone || (countryReady(country) && digits.length >= minDigits(country));
  const nameOk = nameNA || name.trim().length > 0;
  const planOk = next !== "" && (next === "NONE" || when !== "");
  const commentOk = comment.trim().length >= 3;
  const missing = { phone: !phoneOk, name: !nameOk, intent: !intent, city: !city, budget: !budget, size: !size, timeline: !timeline, plan: !planOk };
  const complete = !Object.values(missing).some(Boolean) && commentOk;
  const [showMissing, setShowMissing] = useState(false);

  function save() {
    setShowMissing(true);
    if (!complete) return setError("A few details are still needed. Tap an option for each, or NA where the client did not say.");
    setError(null);
    const band = budget !== NA ? [...BUDGETS.INR, ...BUDGETS.AED].find((b) => b.key === budget) : undefined;
    const requirement: RequirementInput = {
      ...(city !== NA ? { locations: [CITIES.find((c) => c.key === city)?.label ?? city] } : {}),
      ...(band ? { budgetMin: band.min, budgetMax: band.max, budgetCurrency: (budget.startsWith("AED") ? "AED" : "INR") as LeadCurrency } : {}),
      ...(size !== NA ? { configuration: CONFIGURATIONS.find((c) => c.key === size)?.label ?? size } : {}),
      ...(timeline !== NA ? { timeline: timeline as LeadTimeline } : {}),
      ...(intent === "INVEST" ? { purpose: "INVESTMENT" as LeadPurpose } : intent === "BUY" ? { purpose: "SELF_USE" as LeadPurpose } : {}),
      ...(intent !== NA ? { notes: `Looking to: ${INTENTS.find((i) => i.key === intent)?.label ?? intent}` } : {}),
    };
    start(async () => {
      const result = await saveMyColdCallLeadAction({
        leadId,
        phone: askPhone ? `${dialCode(country)}${digits}` : undefined,
        name: nameNA ? undefined : name.trim(),
        interest: "INTERESTED",
        projectIds: projects.map((p) => p.id),
        qualification: { outcome: "PENDING_QUALIFICATION" },
        plan: next !== "NONE" ? { kind: next, whenLocal: when } : null,
        requirement,
        note: comment.trim(),
      }).catch(() => ({ ok: false as const, error: "Could not save. Please try again." }));
      if (!result.ok) return setError(result.error);
      if (!result.result.saved) return setError(result.result.reason === "EXISTS_YOURS" ? "This number is already your lead. Open it from My leads." : "This number is already in the system and is not assigned to you.");
      onSaved({ leadId: result.result.leadId });
    });
  }

  const show = (k: keyof typeof missing) => showMissing && missing[k];

  return (
    <div className="space-y-3">
      {askPhone && (
        <Row label="Phone number" missing={show("phone")}>
          <div className="flex gap-2">
            <CountryCodeField value={country} onChange={setCountry} />
            <input aria-label="Phone number" inputMode="tel" autoComplete="off" placeholder="Phone number" value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, maxDigits(country)))} className={`${FIELD} min-w-0 flex-1`} />
          </div>
        </Row>
      )}

      <Row label="Name" missing={show("name")}>
        <div className="flex gap-2">
          <input aria-label="Client name" autoComplete="off" maxLength={120} placeholder="Client name" value={nameNA ? "" : name} disabled={nameNA} onChange={(e) => setName(e.target.value)} className={`${FIELD} min-w-0 flex-1 disabled:opacity-50`} />
          <button type="button" aria-pressed={nameNA} onClick={() => setNameNA((v) => !v)} className={`${CHIP} ${nameNA ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted"}`}>
            NA
          </button>
        </div>
      </Row>

      <Row label="Looking to" missing={show("intent")}>
        <Pick options={INTENTS} value={intent} onPick={setIntent} />
      </Row>
      <Row label="City" missing={show("city")}>
        <Pick options={CITIES} value={city} onPick={(k) => { setCity(k); setBudget(""); }} />
      </Row>
      <Row label={`Budget${city === "DUBAI" ? " (AED)" : " (₹)"}`} missing={show("budget")}>
        <Pick options={bands} value={budget} onPick={setBudget} />
      </Row>
      <Row label="Size" missing={show("size")}>
        <Pick options={CONFIGURATIONS.filter((c) => c.key !== "NOT_SURE")} value={size} onPick={setSize} />
      </Row>
      <Row label="When" missing={show("timeline")}>
        <Pick options={TIMELINES} value={timeline} onPick={setTimeline} />
      </Row>

      <Row label="Next step" missing={show("plan")}>
        <Pick options={NEXT_STEPS} value={next} onPick={(k) => { setNext(k); if (k === "NONE") setWhen(""); }} withNA={false} />
        {next !== "" && next !== "NONE" && (
          <div className="mt-3">
            <WhenInput value={when} min={toBusinessLocalInput(new Date())} onChange={setWhen} className={FIELD} />
          </div>
        )}
      </Row>

      <Row label="Project (optional)" missing={false}>
        <div className="flex flex-wrap items-center gap-2">
          {projects.map((p) => (
            <span key={p.id} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent bg-accent/10 px-3 text-base text-foreground">
              {p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setProjects((list) => list.filter((x) => x.id !== p.id))} className="text-lg leading-none text-muted-foreground">×</button>
            </span>
          ))}
          {projects.length < 5 && (
            <button type="button" onClick={() => setSheetOpen(true)} className={`${CHIP} border-border bg-background text-accent-hover hover:bg-muted`}>
              + Add project
            </button>
          )}
        </div>
      </Row>

      <Row label="Comment on the call" missing={showMissing && !commentOk}>
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_COMMENTS.map((q) => (
            <button key={q} type="button" onClick={() => setComment((c) => (c ? `${c}. ${q}` : q))} className="min-h-11 rounded-full border border-border bg-background px-3 text-sm text-foreground hover:bg-muted">
              {q}
            </button>
          ))}
        </div>
        <textarea aria-label="Comment on the call" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What was said, what happens next" className={`${FIELD} py-2`} />
      </Row>

      <ProjectPicker open={sheetOpen} onClose={() => setSheetOpen(false)} chosen={projects} onPick={(p) => { setProjects((list) => (list.some((x) => x.id === p.id) || list.length >= 5 ? list : [...list, p])); setSheetOpen(false); }} />

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={save} disabled={pending} className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-green-600 px-4 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-60">
        {pending ? "Saving…" : "Save lead and next number"}
      </button>
    </div>
  );
}
