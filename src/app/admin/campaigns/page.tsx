import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { CampaignForm, CampaignStatusButtons } from "@/components/admin/campaign-form";
import { listCampaigns } from "@/lib/leads/campaign-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";

export const metadata = {
  title: "Campaigns | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const STATUS = { ACTIVE: "Active", PAUSED: "Paused", ENDED: "Ended" } as const;

export default async function CampaignsPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const campaigns = await listCampaigns(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id });

  return (
    <div>
      <SectionHeading title="Campaigns" description="A campaign is tied to one utm_campaign tag; leads arriving with that tag are attributed to it, once. Spend is not tracked yet." />
      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Create one below, then use its tag as utm_campaign in your ad links." />
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    utm_campaign = {c.utmCampaign}
                    {c.utmSource ? ` · ${c.utmSource}` : ""}
                    {c.utmMedium ? ` / ${c.utmMedium}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.startDate ?? "No start"} to {c.endDate ?? "no end"}
                    {c.landingPage ? ` · ${c.landingPage}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{STATUS[c.status]}</span>
              </div>
              <div className="mt-2">
                <CampaignStatusButtons campaignId={c.id} status={c.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-sm font-semibold text-foreground">Create a campaign</h2>
      <div className="mt-3">
        <CampaignForm />
      </div>
    </div>
  );
}
