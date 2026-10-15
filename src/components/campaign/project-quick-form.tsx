"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { submitEnquiryAction } from "@/app/_actions/enquiry-actions";
import { consentTextFor } from "@/lib/leads/consent";
import { composePhone } from "@/lib/phone-countries";
import { readAttributionForSubmit } from "@/lib/leads/attribution-storage";
import {
  forgetContact,
  indianMobileDigits,
  maskDigits,
  parseRememberedContact,
  readRememberedContactRaw,
  rememberContact,
  subscribeRememberedContact,
} from "@/lib/leads/remembered-contact";
import { trackAdsLeadConversion, trackEvent } from "@/lib/analytics/client";
import { trackSocial } from "@/lib/social/track-client";

/** Where the sticky mobile button and any in-page link scroll to. */
export const ENQUIRE_ANCHOR = "enquire";

/**
 * The enquiry form on a paid landing page, built like an in-app lead form: if the visitor has enquired before on this device it
 * shows "Enquire as Meera · +91 98•••• •210" and ONE tap sends; otherwise it asks for a name and a mobile number and nothing else.
 * Browser autofill works too (proper field names), so a phone that knows the visitor fills both in one tap.
 *
 * It creates the same real lead as the full enquiry form (same server action, same attribution, same consent record); the buyer
 * can add budget and area afterwards on /enquire. The remembered details live only on the visitor's device (see
 * lib/leads/remembered-contact.ts) and "Not you?" clears them.
 */
export function ProjectQuickForm({ projectName, whatsappHref }: { projectName: string; whatsappHref: string }) {
  const raw = useSyncExternalStore(subscribeRememberedContact, readRememberedContactRaw, () => "");
  const remembered = useMemo(() => parseRememberedContact(raw), [raw]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [trap, setTrap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [pending, start] = useTransition();

  const oneTap = remembered !== null && !editing;

  const touch = () => {
    if (started) return;
    setStarted(true);
    trackSocial({ kind: "form_started" });
  };

  function submit() {
    const sendName = oneTap ? remembered!.name : name.trim();
    const sendDigits = oneTap ? remembered!.digits : indianMobileDigits(digits);
    if (sendName.length < 2) return setError("Please enter your name.");
    if (!sendDigits) return setError("Enter your 10-digit mobile number.");
    setError(null);
    const touchData = readAttributionForSubmit()?.currentTouch;
    const params = new URLSearchParams(window.location.search);
    start(async () => {
      const result = await submitEnquiryAction({
        answers: { intent: "BUY", market: "MUMBAI", contactMethod: "WHATSAPP" },
        name: sendName,
        ...composePhone("IN", sendDigits),
        website: trap,
        landingPath: touchData?.landingPath ?? window.location.pathname,
        referrer: touchData?.referrer ?? (document.referrer || undefined),
        utmSource: touchData?.utmSource ?? params.get("utm_source") ?? undefined,
        utmMedium: touchData?.utmMedium ?? params.get("utm_medium") ?? undefined,
        utmCampaign: touchData?.utmCampaign ?? params.get("utm_campaign") ?? undefined,
        utmContent: touchData?.utmContent ?? params.get("utm_content") ?? undefined,
        utmTerm: touchData?.utmTerm ?? params.get("utm_term") ?? undefined,
        gclid: touchData?.gclid ?? params.get("gclid") ?? undefined,
        fbclid: touchData?.fbclid ?? params.get("fbclid") ?? undefined,
      }).catch(() => ({ ok: false as const, message: "We could not save your details. Please try again." }));
      if (result.ok) {
        rememberContact({ name: sendName, digits: sendDigits });
        trackSocial({ kind: "form_submitted" });
        trackAdsLeadConversion(trackEvent("generate_lead", { source: "project_page", market: "mumbai", project: projectName }));
        setDone(true);
      } else setError(result.message);
    });
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl bg-white p-5 text-foreground">
        <p className="text-lg font-semibold">Thank you, we have your details.</p>
        <p className="mt-1 text-sm leading-6 text-foreground/80">An advisor will call or WhatsApp you shortly (9 am to 9 pm). Want the brochure sooner? Message us now.</p>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-cta="advisor_whatsapp" className="mt-4 flex min-h-12 items-center justify-center rounded-sm bg-whatsapp px-5 text-base font-bold text-white hover:bg-whatsapp-hover">
          Message us on WhatsApp
        </a>
      </div>
    );
  }

  const field = "min-h-12 w-full rounded-md border border-field-border bg-white px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <form
      id={ENQUIRE_ANCHOR}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="space-y-3"
    >
      {oneTap ? (
        <div className="rounded-xl bg-white/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-pearl">Enquire as</p>
          <p className="mt-1 text-lg font-semibold text-white">{remembered!.name}</p>
          <p className="text-sm text-pearl">{maskDigits(remembered!.digits)}</p>
          <button
            type="button"
            onClick={() => {
              forgetContact();
              setEditing(true);
            }}
            className="mt-2 inline-flex min-h-10 items-center text-sm text-pearl underline underline-offset-4"
          >
            Not you? Use different details
          </button>
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium text-white">
            Your name
            <input
              name="name"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => {
                touch();
                setError(null);
                setName(e.target.value);
              }}
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="block text-sm font-medium text-white">
            Mobile number (WhatsApp)
            <span className="mt-1 flex gap-2">
              <span className="inline-flex min-h-12 shrink-0 items-center rounded-md border border-field-border bg-white px-3 text-base text-foreground">+91</span>
              <input
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98XXXXXXXX"
                value={digits}
                onChange={(e) => {
                  touch();
                  setError(null);
                  setDigits(e.target.value.replace(/[^\d\s]/g, "").slice(0, 14));
                }}
                className={field}
              />
            </span>
          </label>
        </>
      )}
      {/* Honeypot: invisible to people, tempting to scripts. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex min-h-14 w-full items-center justify-center rounded-sm bg-gold px-7 text-base font-bold text-ink hover:opacity-90 disabled:opacity-60">
        {pending ? "Sending…" : "Send me the details"}
      </button>
      <p className="text-xs leading-5 text-pearl">{consentTextFor("WHATSAPP")}</p>
    </form>
  );
}
