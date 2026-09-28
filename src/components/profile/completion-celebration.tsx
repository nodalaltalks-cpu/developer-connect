"use client";

import { useEffect, useMemo, useState } from "react";

const AUTO_DISMISS_MS = 3500;
/** Reuses the app's own accent (blue) and trust (green) tokens, plus one warm tone — an original, restrained palette, not a copy of any other product's confetti. */
const PARTICLE_COLORS = ["#2563eb", "#15803d", "#f59e0b", "#1d4ed8"];
const PARTICLE_COUNT = 22;

interface ConfettiPiece {
  left: number;
  color: string;
  delay: number;
  spin: number;
}

function buildConfetti(): ConfettiPiece[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    left: Math.random() * 100,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: Math.random() * 0.4,
    spin: 180 + Math.random() * 180,
  }));
}

/**
 * The celebration overlay itself (Part 7/8 of the profile-UX task).
 * Rendered ONLY when the caller (profile-editor.tsx) already decided —
 * via the pure `shouldCelebrate()` — that a section genuinely went
 * incomplete -> complete AND overall percentage increased. This
 * component has no opinion on WHEN to show; it only ever shows once
 * mounted, and unmounts itself (via `onDismiss`) after a short delay or
 * on explicit dismissal.
 *
 * Mobile-first: a full-viewport overlay (`fixed inset-0`) with safe-area
 * padding; on a wider viewport (`sm:` and up) it shrinks to a centered,
 * proportional card instead of forcing a phone-sized panel to fill a
 * desktop screen. Body scroll is locked while visible and restored on
 * unmount either way (dismissed or auto-expired).
 */
export function CompletionCelebration({
  sectionTitle,
  percentage,
  onDismiss,
}: {
  sectionTitle: string;
  percentage: number;
  onDismiss: () => void;
}) {
  // A lazy initializer, not an effect: this runs once during this
  // component's first render, which on the client (this is only ever
  // rendered client-side, but Next still server-renders "use client"
  // components for the initial HTML) means `window` already exists —
  // no separate synchronous setState-in-effect needed just to read a
  // one-time value.
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  const confetti = useMemo(() => buildConfetti(), []);

  // Genuinely subscribes to an external system (the media query
  // actually changing, and the auto-dismiss timer / Escape key) —
  // setState only ever runs inside those callbacks, never synchronously
  // in the effect body itself.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleMotionChange);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      clearTimeout(timer);
      media.removeEventListener("change", handleMotionChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-0 sm:p-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Section completed"
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background px-6 text-center sm:h-auto sm:max-w-sm sm:rounded-2xl sm:border sm:border-border sm:px-8 sm:py-10 sm:shadow-xl"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 1.5rem)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
      >
        {!reducedMotion && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {confetti.map((piece, i) => (
              <span
                key={i}
                className="dc-confetti-piece"
                style={
                  {
                    left: `${piece.left}%`,
                    backgroundColor: piece.color,
                    "--dc-confetti-delay": `${piece.delay}s`,
                    "--dc-confetti-spin": `${piece.spin}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-2 sm:top-2"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>

        <p className="relative text-3xl" aria-hidden="true">
          🎉
        </p>
        <p className="relative mt-3 text-lg font-semibold text-foreground">Nice! {sectionTitle} completed</p>
        <p className="relative mt-1.5 text-sm text-muted-foreground">
          Your profile is now {percentage}% complete.
        </p>
      </div>
    </div>
  );
}
