"use client";

import { useEffect, useState } from "react";
import { ENQUIRE_ANCHOR } from "@/components/campaign/project-quick-form";

/**
 * The always-visible button at the bottom of a project page on a phone, like the call-to-action bar in an in-app lead form. It
 * takes the visitor to the form (it never sends anything itself, so the consent line is always seen) and hides while the form is
 * already on screen.
 */
export function StickyEnquireBar({ label }: { label: string }) {
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(ENQUIRE_ANCHOR);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setFormVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.2 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (formVisible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
      <button
        type="button"
        onClick={() => document.getElementById(ENQUIRE_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" })}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-sm bg-gold px-4 text-base font-bold text-ink"
      >
        {label}
      </button>
    </div>
  );
}
