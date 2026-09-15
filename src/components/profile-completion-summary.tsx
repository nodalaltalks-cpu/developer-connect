import Link from "next/link";
import type { ProfileCompletion } from "@/lib/profile/types";

const BAND_LABEL: Record<NonNullable<ProfileCompletion["band"]>, string> = {
  VERY_EARLY: "Getting started",
  PARTIALLY_COMPLETED: "Making progress",
  MORE_COMPLETE: "Making good progress",
  ALMOST_COMPLETE: "Almost there",
  FULLY_COMPLETED: "Profile complete",
};

/**
 * Milestones are read directly off the current, real percentage — not a
 * separately persisted achievement log. That's a deliberate choice: since
 * completion is always recalculated from the profile's actual current
 * data (see completion.ts), a milestone is "genuinely achieved" exactly
 * when the current percentage has reached it. If a user later removes an
 * answer and drops below a threshold, that milestone stops showing as
 * achieved — which is honest, not a bug.
 */
const MILESTONES = [
  { threshold: 25, label: "Getting started" },
  { threshold: 50, label: "Making progress" },
  { threshold: 75, label: "Almost there" },
  { threshold: 100, label: "Profile complete" },
];

/**
 * Compact "what's left" (Part 4): completed sections get a quiet
 * checkmark, incomplete ones become direct links to `/profile?section=…`
 * — ProfileEditor already scrolls/focuses that section on load (see
 * requestedSectionId), so this is a real one-click jump, never "go hunt
 * for it yourself."
 */
function WhatsLeft({ completion }: { completion: ProfileCompletion }) {
  const done = completion.sections.filter((s) => s.complete);
  const remaining = completion.sections.filter((s) => !s.complete && s.totalFields > 0);
  if (remaining.length === 0) return null;

  return (
    <div className="mt-3 text-sm">
      {done.length > 0 && (
        <ul className="space-y-1">
          {done.map((section) => (
            <li key={section.sectionId} className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="text-accent-hover">
                ✓
              </span>
              {section.title}
            </li>
          ))}
        </ul>
      )}
      <p className={`text-xs font-medium uppercase tracking-wide text-muted-foreground ${done.length > 0 ? "mt-3" : ""}`}>
        Still useful
      </p>
      <ul className="mt-1.5 space-y-1">
        {remaining.map((section) => (
          <li key={section.sectionId}>
            <Link
              href={`/profile?section=${section.sectionId}`}
              className="inline-flex items-center gap-1.5 text-accent-hover hover:underline"
            >
              <span aria-hidden="true">→</span>
              {section.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders profile strength, milestones, and the completion moment. Only reachable once PROFILE_FIELD_CONFIG has real fields. */
export function ProfileCompletionSummary({ completion }: { completion: ProfileCompletion }) {
  if (completion.percentage === null || completion.band === null) {
    return null;
  }

  const isComplete = completion.percentage >= 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-medium text-foreground">
          {isComplete ? "You're all set" : BAND_LABEL[completion.band]}
        </p>
        <p className="text-sm text-muted-foreground">{completion.percentage}% complete</p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={completion.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile strength"
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${completion.percentage}%` }}
        />
      </div>

      {isComplete ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Thanks — we now have a better understanding of what matters to you.
        </p>
      ) : (
        completion.missingFieldKeys.length > 0 && <WhatsLeft completion={completion} />
      )}

      <ol className="mt-4 flex items-center gap-2" aria-label="Profile milestones">
        {MILESTONES.map((milestone) => {
          const achieved = completion.percentage! >= milestone.threshold;
          return (
            <li key={milestone.threshold} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  achieved
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-background text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {achieved ? "✓" : ""}
              </span>
              <span
                className={`text-center text-[11px] leading-tight ${
                  achieved ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {milestone.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
