import Link from "next/link";
import { VerifiedBadge } from "@/components/verified-badge";
import { OfficialWebsiteVerifiedBadge } from "@/components/official-website-verified-badge";
import { ConnectWithDeveloperButton } from "@/components/connect-with-developer-button";
import { buttonClassName } from "@/components/ui/button";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";

/**
 * The public directory's card. Every developer reaching this component
 * already passed the same VERIFIED-only boundary as search (see
 * listVerifiedDevelopers/searchPublicDevelopers) — officialWebsite is
 * only ever null here defensively, not in real use, since only verified
 * developers are ever passed in.
 *
 * Two distinct, clearly separated actions rather than a whole-card link:
 * "Connect with {developer}" (opens the Developer Connects enquiry gate) and
 * "View developer" (internal). The card never shows or links to the
 * developer's own website: that is internal verification data.
 */
export function DeveloperCard({ developer }: { developer: PublicDeveloperProfile }) {
  const website = developer.officialWebsite;

  return (
    <article className="flex h-full min-w-0 flex-col rounded-lg border border-border p-5 transition-colors hover:border-accent-hover focus-within:border-accent-hover">
      <div>
        <VerifiedBadge />

        <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">
          {developer.displayName}
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          {developer.city}, {developer.state}
        </p>

        {developer.headquartersLocation && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Head office
            </p>
            <p className="mt-0.5 text-sm text-foreground">{developer.headquartersLocation}</p>
          </div>
        )}

        {website && (
          <div className="mt-3">
            <OfficialWebsiteVerifiedBadge full />
          </div>
        )}
      </div>

      {/* mt-auto anchors this CTA row to the bottom of the card regardless
          of how much content is above it — keeps "Connect with developer"
          and "View developer" aligned across a row of cards whose content
          height differs (headquarters/website present or not). */}
      <div className="mt-auto flex flex-col gap-2 pt-5">
        {website && (
          <ConnectWithDeveloperButton
            developerId={developer.id}
            developerName={developer.displayName}
            sourceCta="directory_card"
            size="compact"
          />
        )}
        <Link
          href={`/developers/${developer.slug}`}
          className={buttonClassName("secondary", "w-full")}
        >
          View developer
        </Link>
      </div>
    </article>
  );
}
