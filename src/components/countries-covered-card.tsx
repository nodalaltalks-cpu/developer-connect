"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useCountUp } from "@/components/stat-counter";
import { OPERATING_COUNTRIES } from "@/lib/developer-connect/operating-countries";

/**
 * The third homepage stat, styled identically to StatCounter (same
 * useCountUp animation) but wrapped in a button that reveals which
 * countries `value` refers to — Country -> State -> City filtering
 * itself is unchanged; this just gives a quick, premium way to see and
 * pick a country before dropping into the existing geo filter (Part 4/5
 * of the task this implements: reuse the existing filter route, never a
 * new country-selection system).
 */
export function CountriesCoveredCard({ value }: { value: number }) {
  const { ref, display } = useCountUp(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Countries covered: ${value}. Show which countries.`}
        className="w-full rounded-lg py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span ref={ref as RefObject<HTMLSpanElement>} className="block text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {display.toLocaleString("en-IN")}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">Countries covered</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Countries Developer Connects covers"
          className="absolute right-0 top-full z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-1.5 text-left shadow-lg"
        >
          <ul>
            {OPERATING_COUNTRIES.map((country) => (
              <li key={country.name}>
                <Link
                  href={`/?country=${encodeURIComponent(country.name)}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  {country.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
