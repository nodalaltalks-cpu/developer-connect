"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { recordOfficialWebsiteClick } from "@/app/_actions/public-actions";
import { AssistanceGate } from "@/components/assistance-gate";
import { buttonClassName } from "@/components/ui/button";
import { notifyOfficialWebsiteClicked } from "@/lib/login-conversion";
import type { GateSourceCta } from "@/lib/leads/gate/gate-config";

interface ConnectWithDeveloperButtonProps {
  developerId: string;
  developerName: string;
  sourceCta?: GateSourceCta;
  /** "primary" on the developer page, "compact" on directory cards. */
  size?: "primary" | "compact";
}

/**
 * "Connect with {Developer}". Pressing it opens the property-assistance gate
 * (see assistance-gate.tsx), where the buyer shares their details with
 * Developer Connects and we help connect them with the developer.
 *
 * Note what is NOT here: a URL, a domain, a link. The button is a real
 * <button>; the browser is never handed a developer website, because the
 * buyer is never sent to one. The developer's verified website is internal
 * data for the Founder.
 *
 * The anonymous `official_website_clicked` event still fires on the press
 * (its stored name is kept so analytics stay continuous), without a domain.
 */
export function ConnectWithDeveloperButton({
  developerId,
  developerName,
  sourceCta = "developer_page",
  size = "primary",
}: ConnectWithDeveloperButtonProps) {
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  // Phone-only sticky CTA: shown only while the in-page button has scrolled out of view, so it never doubles up.
  const mainRef = useRef<HTMLButtonElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (size !== "primary" || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  const handleClick = () => {
    void recordOfficialWebsiteClick(developerId);
    setOpenedAt(new Date().toISOString());
  };

  const close = useCallback(() => setOpenedAt(null), []);
  // Fires once the request is saved; lets the sign-in prompt count it - after the gate, never over it.
  const completed = useCallback(() => notifyOfficialWebsiteClicked(), []);

  return (
    <>
      <button
        ref={mainRef}
        type="button"
        data-cta={size === "primary" ? "connect_developer" : "connect_card"}
        onClick={handleClick}
        aria-haspopup="dialog"
        className={buttonClassName("primary", size === "primary" ? "w-full sm:w-auto text-base px-6 py-3.5" : "w-full")}
      >
        Connect with {developerName}
      </button>
      {size === "primary" && offscreen && !openedAt && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:hidden">
          <button type="button" data-cta="connect_sticky" onClick={handleClick} aria-haspopup="dialog" className={buttonClassName("primary", "w-full text-base py-3.5")}>
            Connect with {developerName}
          </button>
        </div>
      )}
      {openedAt &&
        createPortal(
          <AssistanceGate
            developerId={developerId}
            developerName={developerName}
            sourceCta={sourceCta}
            requestedAt={openedAt}
            onClose={close}
            onCompleted={completed}
          />,
          document.body,
        )}
    </>
  );
}
