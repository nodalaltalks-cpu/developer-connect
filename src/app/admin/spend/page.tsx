import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { SpendForm, VoidSpendButton } from "@/components/admin/spend-form";
import { CHANNEL_LABEL, type AcquisitionChannel } from "@/lib/leads/acquisition";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { businessDate, listSpend } from "@/lib/leads/finance-service";
import { formatMoneyExact as formatMoney } from "@/lib/leads/format";

export const metadata = {
  title: "Marketing spend | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function SpendPage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const repos = createPostgresLeadRepositories();
  const actor = { actorType: "FOUNDER" as const, actorId: user!.id };
  const now = new Date();
  const [entries, campaigns] = await Promise.all([listSpend(repos, actor, { from: new Date(now.getTime() - 90 * 86_400_000), to: new Date(now.getTime() + 86_400_000) }, 100), repos.campaigns.list(200)]);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <div>
      <SectionHeading title="Marketing spend" description="Money actually spent on acquisition. Entries are never edited or deleted: if one is wrong, void it (with a reason) and record it again. INR and AED are kept apart." />
      {entries.length === 0 ? (
        <EmptyState title="No spend recorded in the last 90 days" description="Record spend below; the Finance report turns it into cost per lead, per qualified lead and per booking." />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className={`rounded-lg border border-border p-3 ${e.voidedAt ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    <span className={e.voidedAt ? "line-through" : ""}>{formatMoney(e.amount, e.currency)}</span> · {CHANNEL_LABEL[e.channel as AcquisitionChannel] ?? e.channel}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.spentOn}
                    {e.campaignId ? ` · ${names.get(e.campaignId) ?? "Campaign"}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                  {e.voidedAt && <p className="text-xs text-red-700">Voided: {e.voidReason}</p>}
                </div>
                {!e.voidedAt && (
                  <div className="shrink-0">
                    <VoidSpendButton spendId={e.id} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-sm font-semibold text-foreground">Record spend</h2>
      <div className="mt-3">
        <SpendForm campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} today={businessDate(now)} />
      </div>
    </div>
  );
}
