"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ADVISOR_CONTACT, callHref, contextFromPath, mailtoHref, whatsappHref, type AdvisorContext, type AdvisorRegion } from "@/lib/advisor-contact";
import { MARKET_STORAGE_KEY, isMarket, type Market } from "@/lib/hero-market";
import { recordAdvisorContactAction } from "@/app/_actions/enquiry-history-actions";

/**
 * "Talk to an Advisor": ONE sheet, ONE bar, ONE trigger, used everywhere on the public site. It replaces the old enquiry form: the
 * visitor reaches a real person on WhatsApp, email or phone, with a message already written from what they were looking at.
 *
 * Context (developer, project, article, place) is plain visible text set by the page through <AdvisorPageContext />; the market
 * comes from the page address or the visitor's own earlier choice on this device. Nothing private is ever placed in a message.
 */

interface AdvisorState {
  context: AdvisorContext;
  open: () => void;
  setPage: (page: Partial<Omit<AdvisorContext, "region">> | null) => void;
}

const AdvisorCtx = createContext<AdvisorState | null>(null);

export function useAdvisor(): AdvisorState {
  const value = useContext(AdvisorCtx);
  if (!value) throw new Error("useAdvisor must be used inside <AdvisorProvider>");
  return value;
}

/** Pages that are not the public buyer experience: no advisor bar, no extra bottom space. */
const HIDDEN_PREFIXES = ["/admin", "/team", "/profile", "/post-sign-in", "/sign-in", "/sign-up", "/testimonial"] as const;
export function advisorHiddenOn(pathname: string | null): boolean {
  if (!pathname) return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [market, setMarket] = useState<Market | null>(null);
  const [page, setPageState] = useState<Partial<Omit<AdvisorContext, "region">>>({});
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MARKET_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage can only be read after mount
      if (isMarket(stored)) setMarket(stored);
    } catch {
      // storage blocked: the region falls back to the page address or UAE
    }
  }, []);

  // A page's own context never leaks to the next page: <AdvisorPageContext /> clears itself when the page unmounts.

  const context = useMemo<AdvisorContext>(() => ({ ...contextFromPath(pathname, market), ...page }), [pathname, market, page]);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const setPage = useCallback((next: Partial<Omit<AdvisorContext, "region">> | null) => setPageState(next ?? {}), []);
  const value = useMemo<AdvisorState>(() => ({ context, open, setPage }), [context, open, setPage]);
  const hidden = advisorHiddenOn(pathname);

  return (
    <AdvisorCtx.Provider value={value}>
      {children}
      {!hidden && <AdvisorBar />}
      <BottomSheet open={isOpen} onClose={close} title="Talk to an Advisor">
        <AdvisorChoices context={context} onChoose={close} />
      </BottomSheet>
    </AdvisorCtx.Provider>
  );
}

/** A public page tells the advisor what the visitor is looking at (visible text only). Renders nothing. */
export function AdvisorPageContext({ developer, project, article, location, region }: Partial<Omit<AdvisorContext, "region">> & { region?: AdvisorRegion }) {
  const { setPage } = useAdvisor();
  useEffect(() => {
    setPage({ developer, project, article, location, ...(region ? { region } : {}) } as Partial<Omit<AdvisorContext, "region">>);
    return () => setPage(null);
  }, [developer, project, article, location, region, setPage]);
  return null;
}

const ROW =
  "flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** WhatsApp, email and call for the visitor's market first, then the other market. Used inside the sheet and on /advisor. */
export function AdvisorChoices({ context, onChoose }: { context: AdvisorContext; onChoose?: () => void }) {
  const first: AdvisorRegion = context.region;
  const second: AdvisorRegion = first === "india" ? "uae" : "india";
  const subject = context.project ?? context.developer ?? context.article ?? context.location ?? "";
  // Recorded for a signed-in visitor so it shows in their history (a no-op for anyone else). Never delays the contact itself.
  const choose = (channel: "whatsapp" | "call" | "email") => () => {
    void recordAdvisorContactAction(channel, subject).catch(() => {});
    onChoose?.();
  };
  return (
    <div>
      <p className="text-sm leading-6 text-muted-foreground">
        Speak with Ambish directly. Your message is already written; change it if you like. No form, no waiting for a call back.
      </p>
      <ul className="mt-4 space-y-2">
        {[first, second].map((region, index) => {
          const contact = ADVISOR_CONTACT[region];
          const ctx = { ...context, region };
          return (
            <li key={region} className={index === 0 ? "" : "pt-2"}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {contact.label} <span className="font-normal normal-case tracking-normal">· {contact.display}</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
                <a href={whatsappHref(ctx)} target="_blank" rel="noopener noreferrer" data-cta="advisor_whatsapp" onClick={choose("whatsapp")} className={`${ROW} border-[#1ebe5b] bg-[#25D366] text-white hover:bg-[#1ebe5b]`}>
                  <span className="flex items-center gap-3 font-medium">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 fill-current">
                      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.8h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.4z" />
                    </svg>
                    WhatsApp {contact.label}
                  </span>
                  <span aria-hidden="true">↗</span>
                </a>
                <a href={callHref(region)} data-cta="advisor_call" onClick={choose("call")} className={ROW}>
                  <span className="font-medium text-foreground">Call {contact.display}</span>
                  <span aria-hidden="true" className="text-muted-foreground">→</span>
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <a href={mailtoHref(context)} data-cta="advisor_email" onClick={choose("email")} className={`${ROW} mt-4`}>
        <span className="min-w-0">
          <span className="block font-medium text-foreground">Email</span>
          <span className="block truncate text-xs text-muted-foreground">{ADVISOR_CONTACT.email}</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
      </a>
    </div>
  );
}

/**
 * The "Talk to an Advisor" button. `data-cta` makes the click a tracked first-party event. The gold tone is the page's primary
 * call to action: brass fill with a travelling light round its edge, a sheen and a glow (see .dc-cta in globals.css), plus a
 * small arrow that nudges toward the click. `size="hero"` is the larger version for the top of a page.
 */
export function AdvisorTrigger({ className = "", children = "Talk to an Advisor", tone = "gold", size = "default" }: { className?: string; children?: ReactNode; tone?: "gold" | "light" | "navy"; size?: "default" | "hero" }) {
  const { open } = useAdvisor();
  const tones = {
    gold: "dc-cta text-gold-foreground",
    light: "border border-white/40 text-white hover:bg-white/10",
    navy: "bg-accent text-accent-foreground hover:bg-accent-hover",
  } as const;
  return (
    <button
      type="button"
      data-cta="advisor_open"
      aria-haspopup="dialog"
      onClick={open}
      className={`inline-flex ${size === "hero" ? "min-h-14 px-9 text-base" : "min-h-12 px-7 text-sm"} items-center justify-center rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tone === "gold" ? "" : "transition-colors"} ${tones[tone]} ${className}`}
    >
      {children}
      {tone === "gold" && (
        <span aria-hidden="true" className="dc-cta-arrow">
          &rarr;
        </span>
      )}
    </button>
  );
}

/**
 * The persistent phone bar. One concierge action, restrained: it sits below the content (a spacer is added so it never covers
 * the footer), respects the safe area, and hides while the sheet or the keyboard is in use.
 */
export function AdvisorBar() {
  const { context } = useAdvisor();
  const subject = context.project ?? context.developer ?? null;
  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.75rem+env(safe-area-inset-bottom))] sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground">{subject ? `Questions about ${subject}?` : "Researching privately?"}</p>
          <AdvisorTrigger className="shrink-0 px-5">Talk to an Advisor</AdvisorTrigger>
        </div>
      </div>
    </>
  );
}
