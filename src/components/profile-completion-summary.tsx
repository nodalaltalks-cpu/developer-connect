import type { ProfileCompletion } from "@/lib/profile/types";

const BAND_LABEL: Record<NonNullable<ProfileCompletion["band"]>, string> = {
  VERY_EARLY: "Just getting started",
  PARTIALLY_COMPLETED: "Partially completed",
  MORE_COMPLETE: "Mostly there",
  ALMOST_COMPLETE: "Almost complete",
  FULLY_COMPLETED: "Fully completed",
};

/** Renders the completion bar/summary. Only reachable once PROFILE_FIELD_CONFIG has real fields. */
export function ProfileCompletionSummary({ completion }: { completion: ProfileCompletion }) {
  if (completion.percentage === null || completion.band === null) {
    return null;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-medium text-foreground">{BAND_LABEL[completion.band]}</p>
        <p className="text-sm text-muted-foreground">{completion.percentage}% complete</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${completion.percentage}%` }}
        />
      </div>
      {completion.missingFieldKeys.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {completion.missingFieldKeys.length} thing
          {completion.missingFieldKeys.length === 1 ? "" : "s"} left to add.
        </p>
      )}
    </div>
  );
}
