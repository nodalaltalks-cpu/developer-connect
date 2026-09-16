"use client";

import { useEffect, useState, useCallback } from "react";

const SHOW_THRESHOLD_PX = 400;

/**
 * A small, subtle "back to top" control for the admin dashboard (Part 13
 * of the admin UX polish task). Acts on the ordinary document scroll —
 * admin/layout.tsx doesn't put the main content in its own scroll
 * container, and this deliberately doesn't introduce one just to serve
 * this control. Fixed at the bottom-right of the viewport rather than
 * literally beside the sidebar: the sidebar is a horizontal scrolling row
 * at the TOP of the page on mobile, so anchoring there would put this
 * control in the way of that scroll, not beside it.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SHOW_THRESHOLD_PX);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:bottom-8 lg:right-8"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
