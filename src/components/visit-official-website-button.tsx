"use client";

import { recordOfficialWebsiteClick } from "@/app/_actions/public-actions";
import { buttonClassName } from "@/components/ui/button";
import { notifyOfficialWebsiteClicked } from "@/lib/login-conversion";

interface VisitOfficialWebsiteButtonProps {
  developerId: string;
  url: string;
  domain: string;
}

/**
 * The one action this entire page exists for. A real <a target="_blank">
 * so the browser navigates immediately regardless of the click handler —
 * analytics recording never blocks or delays reaching the real site.
 */
export function VisitOfficialWebsiteButton({
  developerId,
  url,
  domain,
}: VisitOfficialWebsiteButtonProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        void recordOfficialWebsiteClick(developerId, domain);
        notifyOfficialWebsiteClicked();
      }}
      className={buttonClassName("primary", "w-full sm:w-auto text-base px-6 py-3.5")}
    >
      Visit official website
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
