"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ADVISOR_CONTACT, callHref, contextFromPath, mailtoHref, whatsappHref, type AdvisorContext, type AdvisorRegion } from "@/lib/advisor-contact";
import { MARKET_STORAGE_KEY, isMarket, type Market } from "@/lib/hero-market";

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

  // A page's own context never leaks to the next page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on navigation
    setPageState({});
  }, [pathname]);

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
                <a href={whatsappHref(ctx)} target="_blank" rel="noopener noreferrer" data-cta="advisor_whatsapp" onClick={onChoose} className={`${ROW} ${index === 0 ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover" : ""}`}>
                  <span className="font-medium">WhatsApp {contact.label}</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <a href={callHref(region)} data-cta="advisor_call" onClick={onChoose} className={ROW}>
                  <span className="font-medium text-foreground">Call {contact.display}</span>
                  <span aria-hidden="true" className="text-muted-foreground">→</span>
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <a href={mailtoHref(context)} data-cta="advisor_email" onClick={onChoose} className={`${ROW} mt-4`}>
        <span className="min-w-0">
          <span className="block font-medium text-foreground">Email</span>
          <span className="block truncate text-xs text-muted-foreground">{ADVISOR_CONTACT.email}</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
      </a>
    </div>
  );
}

/** The gold "Talk to an Advisor" button. `data-cta` makes the click a tracked first-party event. */
export function AdvisorTrigger({ className = "", children = "Talk to an Advisor", tone = "gold" }: { className?: string; children?: ReactNode; tone?: "gold" | "light" | "navy" }) {
  const { open } = useAdvisor();
  const tones = {
    gold: "bg-gold text-gold-foreground hover:bg-gold-hover",
    light: "border border-white/40 text-white hover:bg-white/10",
    navy: "bg-accent text-accent-foreground hover:bg-accent-hover",
  } as const;
  return (
    <button
      type="button"
      data-cta="advisor_open"
      aria-haspopup="dialog"
      onClick={open}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tones[tone]} ${className}`}
    >
      {children}
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
