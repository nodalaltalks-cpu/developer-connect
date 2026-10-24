import type { ProfileCompletion } from "@/lib/profile/types";

/**
 * One short timeline in place of the separate progress card, "next step" card and "what's left" list. Done steps are ticked, the
 * first step still to do is the live one, the rest wait behind it. Every step is a real jump to its section. The urgency is
 * about the person's own picks (nothing is invented: no countdowns, no claims about other buyers).
 */
export function ProfileTimeline({
  completion,
  onJump,
}: {
  completion: ProfileCompletion;
  onJump: (sectionId: string) => void;
}) {
  const steps = completion.sections.filter((s) => s.totalFields > 0);
  const left = steps.filter((s) => !s.complete);
  const nextId = left[0]?.sectionId ?? null;
  const percentage = completion.percentage ?? 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-foreground">
          {left.length === 1 ? "Only 1 step left" : `Only ${left.length} steps left`}
        </p>
        <p className="shrink-0 text-sm text-muted-foreground">{percentage}%</p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile strength"
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Takes about 2 minutes. Finish it while you are here.</p>

      <ol className="mt-4" aria-label="Profile steps">
        {steps.map((step, index) => {
          const isNext = step.sectionId === nextId;
          const last = index === steps.length - 1;
          return (
            <li key={step.sectionId} className="relative flex gap-3 pb-1">
              {!last && <span aria-hidden="true" className="absolute left-[11px] top-7 h-[calc(100%-1.25rem)] w-px bg-border" />}
              <span
                aria-hidden="true"
                className={`relative z-[1] mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.complete
                    ? "bg-accent text-accent-foreground"
                    : isNext
                      ? "border-2 border-accent bg-background text-accent-hover"
                      : "border border-border bg-background text-muted-foreground"
                }`}
              >
                {step.complete ? "✓" : index + 1}
              </span>
              <button
                type="button"
                onClick={() => onJump(step.sectionId)}
                className={`flex min-h-11 flex-1 items-center justify-between gap-2 py-1 text-left text-sm ${
                  step.complete ? "text-muted-foreground" : isNext ? "font-semibold text-foreground" : "text-foreground"
                }`}
              >
                <span>{step.title}</span>
                {isNext && <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Do this now</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
