"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitEnquiryAction } from "@/app/_actions/enquiry-actions";
import { consentTextFor } from "@/lib/leads/consent";
import { BUSINESS_EMAIL, SOCIAL_LINKS } from "@/lib/social/links";
import { trackSocial } from "@/lib/social/track-client";
import { PHONE_COUNTRIES, composePhone, phoneCountryLabel } from "@/lib/phone-countries";
import {
  BUDGETS,
  CONFIGURATIONS,
  CONTACT_METHODS,
  CONTACT_TIMES,
  HOW_FOUND,
  INTENTS,
  LOANS,
  LOCATIONS,
  MARKETS,
  MAX_CONFIGURATIONS,
  MAX_LOCATIONS,
  POSSESSIONS,
  PROPERTY_TYPES,
  PURPOSES,
  TIMELINES,
  type MarketKey,
  type Option,
} from "@/lib/social/enquiry-options";

/**
 * The one-minute enquiry form: every question is a tap. A visitor types only their number (and a name if they like). It creates a
 * real lead for the sales team and shows up on the Founder's dashboard under Enquiries. Four short screens, and
 * every screen but the first can be skipped.
 */

type Answers = {
  intent?: string;
  market?: string;
  locations: string[];
  propertyType?: string;
  configurations: string[];
  budget?: string;
  purpose?: string;
  timeline?: string;
  possession?: string;
  loan?: string;
  contactMethod?: string;
  contactTime?: string;
  howFound?: string;
};

const CHIP = "inline-flex min-h-12 items-center justify-center rounded-md border px-4 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const STEPS = 4;

function Chips({ options, value, onPick, multi = false, max = 99 }: { options: readonly Option[]; value: string | string[] | undefined; onPick: (key: string) => void; multi?: boolean; max?: number }) {
  const picked = (key: string) => (Array.isArray(value) ? value.includes(key) : value === key);
  const full = multi && Array.isArray(value) && value.length >= max;
  return (
    <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => {
        const on = picked(o.key);
        return (
          <button key={o.key} type="button" role={multi ? undefined : "radio"} aria-checked={multi ? undefined : on} aria-pressed={multi ? on : undefined} disabled={!on && full} onClick={() => onPick(o.key)} className={`${CHIP} ${on ? "border-accent bg-accent text-accent-foreground" : "border-field-border bg-background text-foreground hover:bg-muted"} disabled:opacity-40`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EnquiryForm() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ locations: [], configurations: [] });
  const [name, setName] = useState("");
  const [country, setCountry] = useState("IN");
  const [digits, setDigits] = useState("");
  const [trap, setTrap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [started, setStarted] = useState(false);

  const touch = () => {
    if (started) return;
    setStarted(true);
    trackSocial({ kind: "form_started" });
  };
  const set = (patch: Partial<Answers>) => {
    touch();
    setError(null);
    setA((cur) => ({ ...cur, ...patch }));
  };
  const toggle = (list: string[], key: string, max: number) => (list.includes(key) ? list.filter((k) => k !== key) : list.length >= max ? list : [...list, key]);
  const single = (field: keyof Answers) => (key: string) => set({ [field]: (a[field] as string | undefined) === key ? undefined : key } as Partial<Answers>);

  const market = (a.market as MarketKey | undefined) ?? null;
  const selling = a.intent === "SELL" || a.intent === "RENT_OUT";
  const buying = a.intent === "BUY" || a.intent === "INVEST";
  const bands = market === "DUBAI" ? BUDGETS.AED : BUDGETS.INR;
  const preference = a.contactMethod === "PHONE_CALL" ? "PHONE_CALL" : "WHATSAPP";

  function next() {
    if (step === 0 && (!a.intent || !a.market)) return setError("Please tap what you are looking for and the city.");
    setError(null);
    setStep((s) => Math.min(STEPS - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function submit() {
    if (digits.replace(/\D/g, "").length < 6) return setError("Enter your WhatsApp or phone number.");
    setError(null);
    const params = new URLSearchParams(window.location.search);
    start(async () => {
      const answers = {
        intent: a.intent,
        market: a.market,
        ...(a.locations.length ? { locations: a.locations } : {}),
        ...(a.propertyType ? { propertyType: a.propertyType } : {}),
        ...(a.configurations.length ? { configurations: a.configurations } : {}),
        ...(a.budget ? { budget: a.budget } : {}),
        ...(a.purpose ? { purpose: a.purpose } : {}),
        ...(a.timeline ? { timeline: a.timeline } : {}),
        ...(a.possession ? { possession: a.possession } : {}),
        ...(a.loan ? { loan: a.loan } : {}),
        ...(a.contactMethod ? { contactMethod: a.contactMethod } : {}),
        ...(a.contactTime ? { contactTime: a.contactTime } : {}),
        ...(a.howFound ? { howFound: a.howFound } : {}),
      };
      const result = await submitEnquiryAction({
        answers,
        name: name.trim() || undefined,
        ...composePhone(country, digits),
        website: trap,
        landingPath: window.location.pathname,
        referrer: document.referrer || undefined,
        utmSource: params.get("utm_source") ?? undefined,
        utmMedium: params.get("utm_medium") ?? undefined,
        utmCampaign: params.get("utm_campaign") ?? undefined,
      }).catch(() => ({ ok: false as const, message: "We could not save your enquiry. Please try again." }));
      if (result.ok) {
        trackSocial({ kind: "form_submitted" });
        setDone(true);
      } else setError(result.message);
    });
  }

  if (done) {
    const whatsapp = SOCIAL_LINKS.find((l) => l.key === "whatsapp")?.url;
    const label = (options: readonly Option[], key?: string) => options.find((o) => o.key === key)?.label;
    const brief = (
      [
        ["Looking to", label(INTENTS, a.intent)],
        ["City", label(MARKETS, a.market)],
        ["Areas", market ? a.locations.map((k) => label(LOCATIONS[market], k)).filter(Boolean).join(", ") : ""],
        ["Property", label(PROPERTY_TYPES, a.propertyType)],
        ["Size", a.configurations.map((k) => label(CONFIGURATIONS, k)).filter(Boolean).join(", ")],
        ["Budget", label(bands, a.budget)],
        ["Timeline", label(TIMELINES, a.timeline)],
      ] as Array<[string, string | undefined]>
    ).filter((row): row is [string, string] => Boolean(row[1]));
    return (
      <div className="mx-auto w-full max-w-md px-5 py-12 text-center">
        <p aria-hidden="true" className="mx-auto flex size-16 items-center justify-center rounded-full bg-whatsapp text-3xl text-white">✓</p>
        <h1 className="mt-5 font-serif text-3xl font-medium text-foreground">Thank you</h1>
        <p className="mt-3 text-base leading-7 text-foreground/80">
          We have your requirements. Our team will reach you {preference === "PHONE_CALL" ? "by phone" : "on WhatsApp"}
          {a.contactTime && a.contactTime !== "ANYTIME" ? ` in the ${CONTACT_TIMES.find((t) => t.key === a.contactTime)?.label.split(" (")[0].toLowerCase()}` : ""} shortly.
        </p>
        {brief.length > 0 && (
          <div className="mt-6 rounded-xl border border-border bg-white p-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-700">Your brief</p>
            <dl className="mt-3 space-y-2 text-sm">
              {brief.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">Ambish will start from this, so you do not have to repeat it.</p>
          </div>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => trackSocial({ kind: "link_click", linkKey: "whatsapp" })} className="mt-6 flex min-h-14 items-center justify-center rounded-sm bg-whatsapp px-5 text-base font-bold text-white hover:bg-whatsapp-hover">
            Message us on WhatsApp now
          </a>
        )}
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">Back to Developer Connects</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-32 pt-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Developer Connects</p>
      <h1 className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight text-foreground">Tell us what you need</h1>
      <p className="mt-1 text-sm text-muted-foreground">Just tap. It takes about a minute.</p>
      <div className="mt-4 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`} />
        ))}
      </div>

      {step === 0 && (
        <>
          <Question title="What are you looking to do?">
            <Chips options={INTENTS} value={a.intent} onPick={single("intent")} />
          </Question>
          <Question title="Which city?">
            <Chips options={MARKETS} value={a.market} onPick={(k) => set({ market: k, locations: [], budget: undefined })} />
          </Question>
        </>
      )}

      {step === 1 && market && (
        <>
          <Question title={selling ? "Where is the property?" : "Which areas?"} hint={`Tap up to ${MAX_LOCATIONS}`}>
            <Chips multi max={MAX_LOCATIONS} options={LOCATIONS[market]} value={a.locations} onPick={(k) => set({ locations: toggle(a.locations, k, MAX_LOCATIONS) })} />
          </Question>
          <Question title="What type of property?">
            <Chips options={PROPERTY_TYPES} value={a.propertyType} onPick={single("propertyType")} />
          </Question>
          <Question title="What size?" hint={`Tap up to ${MAX_CONFIGURATIONS}`}>
            <Chips multi max={MAX_CONFIGURATIONS} options={CONFIGURATIONS} value={a.configurations} onPick={(k) => set({ configurations: toggle(a.configurations, k, MAX_CONFIGURATIONS) })} />
          </Question>
        </>
      )}

      {step === 2 && (
        <>
          <Question title={selling ? "Expected price or rent?" : "What is your budget?"}>
            <Chips options={bands} value={a.budget} onPick={single("budget")} />
          </Question>
          <Question title={selling ? "How soon do you want to close?" : "How soon are you planning?"}>
            <Chips options={TIMELINES} value={a.timeline} onPick={single("timeline")} />
          </Question>
          {buying && (
            <>
              <Question title="Is it for you to live in, or an investment?">
                <Chips options={PURPOSES} value={a.purpose} onPick={single("purpose")} />
              </Question>
              <Question title="Ready to move in, or under construction?">
                <Chips options={POSSESSIONS} value={a.possession} onPick={single("possession")} />
              </Question>
              <Question title="Do you need a home loan?">
                <Chips options={LOANS} value={a.loan} onPick={single("loan")} />
              </Question>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Question title="How should we reach you?">
            <Chips options={CONTACT_METHODS} value={a.contactMethod} onPick={single("contactMethod")} />
          </Question>
          <Question title="When is a good time?">
            <Chips options={CONTACT_TIMES} value={a.contactTime} onPick={single("contactTime")} />
          </Question>
          <Question title="How did you find us?">
            <Chips options={HOW_FOUND} value={a.howFound} onPick={single("howFound")} />
          </Question>
          <Question title="Your WhatsApp or phone number">
            <div className="flex gap-2">
              <div className="w-36 shrink-0">
                <select aria-label="Country code" value={country} onChange={(e) => setCountry(e.target.value)} className="min-h-12 w-full truncate rounded-md border border-field-border bg-background px-3 text-base text-foreground">
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {phoneCountryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <input aria-label="Phone number" inputMode="tel" autoComplete="tel-national" placeholder="Phone number" value={digits} onChange={(e) => { touch(); setError(null); setDigits(e.target.value.replace(/[^\d\s]/g, "").slice(0, 14)); }} className="min-h-12 w-full rounded-md border border-field-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </div>
          </Question>
          <Question title="Your name (optional)">
            <input aria-label="Your name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="min-h-12 w-full rounded-md border border-field-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Question>
          {/* Honeypot: invisible to people, tempting to scripts. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </label>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{consentTextFor(preference)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Business enquiries: {BUSINESS_EMAIL}</p>
        </>
      )}

      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-md gap-3">
          {step > 0 && (
            <button type="button" onClick={back} disabled={pending} className="inline-flex min-h-12 items-center justify-center rounded-sm border border-field-border px-5 text-base font-medium text-foreground hover:bg-muted">
              Back
            </button>
          )}
          {step < STEPS - 1 ? (
            <button type="button" onClick={next} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-sm bg-accent px-4 text-base font-semibold text-accent-foreground hover:bg-accent-hover">
              {step === 0 ? "Next" : "Next (or skip)"}
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={pending} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-sm bg-whatsapp px-4 text-base font-bold text-white hover:bg-whatsapp-hover disabled:opacity-60">
              {pending ? "Sending…" : "Send my requirements"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
