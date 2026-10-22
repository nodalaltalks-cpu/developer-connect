import type { DeveloperProfile } from "@/lib/developer-connect/developer-profiles";

/**
 * A short, sourced "About" block on a developer's page. Sources are plain names (the site never links out to third parties); the
 * facts, sources and review month come from lib/developer-connect/developer-profiles.ts.
 */
export function DeveloperAtAGlance({ name, profile }: { name: string; profile: DeveloperProfile }) {
  return (
    <section className="mt-10 border-t border-border pt-8" aria-labelledby="about-developer">
      <h2 id="about-developer" className="text-lg font-semibold text-foreground">
        About {name}
      </h2>
      <p className="mt-2 text-sm text-foreground">{profile.summary}</p>
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
        {profile.facts.map((fact) => (
          <div key={fact.label} className="grid grid-cols-1 gap-0.5 px-4 py-3 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-0.5">{fact.label}</dt>
            <dd className="text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Compiled from public sources ({profile.sources.map((source) => source.name).join(", ")}), {profile.checked}. Details change, so confirm
        them with the developer and the project&apos;s registration before you decide.
      </p>
    </section>
  );
}
