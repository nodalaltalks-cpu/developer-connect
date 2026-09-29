"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const DURATION_MS = 900;

/**
 * A count-up effect that plays once when its attached element scrolls
 * into view, landing on exactly `value` — never a rounding artifact,
 * never a number the server didn't actually send. Skips the animation
 * entirely under `prefers-reduced-motion`, showing the final value
 * immediately. Shared by StatCounter and any other element that needs
 * this exact same rolling-number style (e.g. a clickable stat) so there
 * is one place that defines "what this animation looks like".
 */
export function useCountUp(value: number): { ref: RefObject<HTMLElement | null>; display: number } {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(0);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasPlayedRef.current) return;
        hasPlayedRef.current = true;

        if (reduceMotion) {
          setDisplay(value);
          return;
        }

        const start = performance.now();
        function tick(now: number) {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / DURATION_MS);
          // Ease-out cubic — fast start, gentle landing, reads as "premium" rather than linear/mechanical.
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return { ref, display };
}

/**
 * `suffix` (e.g. "+") is purely presentational — it never touches `value`
 * itself, which still comes straight from the real query result passed
 * in by the caller (see (marketing)/page.tsx). A small left margin keeps
 * it from looking glued to the last digit; it's otherwise the same
 * size/weight as the number, matching how a stat like this is styled
 * elsewhere (a trailing "+" reads as part of the number, not a separate
 * label). Trailing, not leading — "1,201+", not "+1,201".
 */
export function StatCounter({
  value,
  label,
  suffix,
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
  const { ref, display } = useCountUp(value);

  return (
    <div ref={ref as RefObject<HTMLDivElement>}>
      <p className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {display.toLocaleString("en-IN")}
        {suffix && <span className="ml-0.5">{suffix}</span>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
