"use client";

import { useEffect, useMemo, useState } from "react";

/** Reuses the app's own accent (blue) and trust (green) tokens, plus warm tones — an original palette, not a copy of any other product's confetti. */
const PARTICLE_COLORS = ["#2563eb", "#15803d", "#f59e0b", "#1d4ed8", "#ec4899", "#8b5cf6", "#ef4444"];
const PARTICLE_COUNT = 70;

interface ConfettiPiece {
  left: number;
  color: string;
  delay: number;
  duration: number;
  spin: number;
  drift: number;
  width: number;
  height: number;
}

function buildConfetti(): ConfettiPiece[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const width = 6 + Math.random() * 6;
    return {
      left: Math.random() * 100,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 1.6,
      spin: 240 + Math.random() * 480,
      drift: (Math.random() - 0.5) * 160,
      width,
      height: width * (1 + Math.random()),
    };
  });
}

/**
 * The celebration overlay itself. Rendered ONLY when the caller
 * (profile-editor.tsx) already decided — via the pure `shouldCelebrate()` —
 * that a section genuinely went incomplete -> complete AND overall
 * percentage increased. This component has no opinion on WHEN to show.
 *
 * Confetti falls across the WHOLE viewport over a dimmed page, with a
 * centered card holding the message and two actions: close, or jump straight
 * to the next incomplete section (the motivation to keep filling details).
 * The card stays until the user acts (button, backdrop click or Escape) so
 * the next-step action is never missed. Body scroll is locked while visible
 * and restored on unmount.
 */
export function CompletionCelebration({
  sectionTitle,
  percentage,
  nextSectionTitle,
  onContinue,
  onDismiss,
}: {
  sectionTitle: string;
  percentage: number;
  /** Title of the next incomplete section, or null when nothing is left. */
  nextSectionTitle: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  const confetti = useMemo(() => buildConfetti(), []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleMotionChange);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener("change", handleMotionChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = nextSectionTitle === null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Section completed"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border bg-background px-6 py-8 text-center shadow-xl sm:px-8"
      >
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <h2 className="mt-3 text-xl font-semibold text-foreground">
          {allDone ? "Your profile is complete!" : `${sectionTitle} completed!`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {allDone
            ? `Amazing — every section is filled in. Your profile is ${percentage}% complete.`
            : `Congratulations, your profile is now ${percentage}% complete. Keep going — next up is ${nextSectionTitle}.`}
        </p>

        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completion"
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percentage}%` }} />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 flex-1 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </button>
          {!allDone && (
            <button
              type="button"
              onClick={onContinue}
              className="min-h-11 flex-1 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Continue: {nextSectionTitle} →
            </button>
          )}
        </div>
      </div>

      {!reducedMotion && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          {confetti.map((piece, i) => (
            <span
              key={i}
              className="dc-confetti-piece"
              style={
                {
                  left: `${piece.left}%`,
                  backgroundColor: piece.color,
                  "--dc-confetti-delay": `${piece.delay}s`,
                  "--dc-confetti-duration": `${piece.duration}s`,
                  "--dc-confetti-spin": `${piece.spin}deg`,
                  "--dc-confetti-drift": `${piece.drift}px`,
                  "--dc-confetti-w": `${piece.width}px`,
                  "--dc-confetti-h": `${piece.height}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
