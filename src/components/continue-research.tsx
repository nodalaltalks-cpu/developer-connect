import Link from "next/link";
import { VerifiedBadge } from "@/components/verified-badge";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";

/**
 * "Continue your research" (Part 8/9) — a quiet, compact strip, not a
 * second directory. Only rendered when real recently-viewed data exists
 * (see getRecentlyViewedDevelopers) — never a placeholder pretending
 * there's history when there isn't.
 */
export function ContinueResearch({ developers }: { developers: PublicDeveloperProfile[] }) {
  if (developers.length === 0) return null;

  return (
    <div className="mx-auto mt-10 max-w-5xl sm:mt-12">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Continue your research
      </h2>
      <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {developers.map((developer) => (
          <li key={developer.id} className="shrink-0">
            <Link
              href={`/developers/${developer.slug}`}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm hover:border-accent-hover hover:bg-muted"
            >
              <VerifiedBadge label={false} />
              <span className="font-medium text-foreground">{developer.displayName}</span>
              <span className="text-muted-foreground">{developer.city}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
