"use client";

import type { ReactNode } from "react";
import { recordLeadWhatsAppOpenedAction } from "@/app/admin/_actions/lead-actions";
import { recordMyWhatsAppOpenedAction } from "@/app/team/_actions/team-actions";

/**
 * Opens WhatsApp to a lead and records that it was OPENED. Never that a message was sent: Developer Connects has no
 * WhatsApp API, so it cannot know. The record is fired as the link is followed (the link opens in a new tab or the
 * WhatsApp app, so this page stays alive long enough to send it), and a failure to record never stops WhatsApp opening.
 * The server decides whether the signed-in person may act on the lead; the browser only says which lead.
 */
export function WhatsAppOpenLink({
  href,
  leadId,
  scope,
  className,
  onOpen,
  children = "WhatsApp",
}: {
  href: string;
  leadId: string;
  /** Which workspace this is: the Founder's or a team member's. Only picks the action; both authorize on the server. */
  scope: "admin" | "team";
  className: string;
  /** Anything else the caller wants to happen on click (e.g. remembering the contact channel for the outcome form). */
  onOpen?: () => void;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        onOpen?.();
        void (scope === "admin" ? recordLeadWhatsAppOpenedAction(leadId) : recordMyWhatsAppOpenedAction(leadId)).catch(() => {});
      }}
    >
      {children}
    </a>
  );
}
