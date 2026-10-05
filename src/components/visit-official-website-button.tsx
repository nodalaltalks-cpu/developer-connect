"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { recordOfficialWebsiteClick } from "@/app/_actions/public-actions";
import { AssistanceGate } from "@/components/assistance-gate";
import { buttonClassName } from "@/components/ui/button";
import { notifyOfficialWebsiteClicked } from "@/lib/login-conversion";
import type { GateSourceCta } from "@/lib/leads/gate/gate-config";

interface VisitOfficialWebsiteButtonProps {
  developerId: string;
  developerName: string;
  /** The verified domain, shown to the buyer in the gate (display only — the destination itself is resolved by the server). */
  domain: string;
  sourceCta?: GateSourceCta;
}

/**
 * "Visit official website". Pressing it opens the property-assistance gate
 * (see assistance-gate.tsx); the buyer reaches the verified official website
 * only after completing it.
 *
 * Note what is NOT here any more: a URL. The button is a real <button>, the
 * browser is never handed the destination up front, and the address that is
 * eventually opened is resolved by the server from the verified developer
 * record once the buyer's details are saved.
 *
 * The existing anonymous `official_website_clicked` event still fires on the
 * press itself, so click analytics stay continuous with the earlier data.
 */
export function VisitOfficialWebsiteButton({
  developerId,
  developerName,
  domain,
  sourceCta = "developer_page",
}: VisitOfficialWebsiteButtonProps) {
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  const handleClick = () => {
    void recordOfficialWebsiteClick(developerId, domain);
    setOpenedAt(new Date().toISOString());
  };

  const close = useCallback(() => setOpenedAt(null), []);
  // Fires once the buyer has been sent on; lets the sign-in prompt count it — after the gate, never over it.
  const completed = useCallback(() => notifyOfficialWebsiteClicked(), []);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-haspopup="dialog"
        className={buttonClassName("primary", "w-full sm:w-auto text-base px-6 py-3.5")}
      >
        Visit official website
        <span aria-hidden="true">↗</span>
      </button>
      {openedAt &&
        createPortal(
          <AssistanceGate
            developerId={developerId}
            developerName={developerName}
            domain={domain}
            sourceCta={sourceCta}
            clickedAt={openedAt}
            onClose={close}
            onCompleted={completed}
          />,
          document.body,
        )}
    </>
  );
}
