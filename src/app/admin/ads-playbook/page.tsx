import Link from "next/link";
import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { AD_DESCRIPTIONS, AD_FACT_TEMPLATES, AD_GROUPS, AD_HEADLINES, CAMPAIGN_SETTINGS, DESCRIPTION_MAX, GATES, HEADLINE_MAX, NEGATIVE_KEYWORDS, WEEKLY_ROUTINE } from "@/lib/campaign/ads-playbook";

export const metadata = { title: "Google Ads playbook | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-foreground/85">{children}</div>
    </section>
  );
}

export default async function AdsPlaybookPage() {
  await requireFounder();
  return (
    <div>
      <SectionHeading title="Google Ads playbook" description="A small-budget Google Search setup for one project in the western suburbs. Everything here is copy-ready; nothing is published or spent until you do it." />

      <Card title="Before any rupee is spent">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Pick the project and add it to the project list (name, MahaRERA number, price sheet, possession, the developer&apos;s written permission to advertise).</li>
          <li>Create the Google Ads account yourself and add the payment method.</li>
          <li>Create a &quot;Lead&quot; website conversion, then put its AW id and label into the site settings.</li>
          <li>Create a campaign in <Link href="/admin/campaigns" className="underline underline-offset-4">Campaigns</Link> with the same tag you put in the tracking template.</li>
          <li>Make one test enquiry from your own phone through the project page and confirm it shows as Google.</li>
        </ol>
      </Card>

      <Card title="Campaign settings">
        <ul className="space-y-3">
          {CAMPAIGN_SETTINGS.map((s) => (
            <li key={s.setting}>
              <p className="font-semibold text-foreground">{s.setting}</p>
              <p>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.why}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Ad groups to start with">
        <ul className="space-y-3">
          {AD_GROUPS.map((g) => (
            <li key={g.name}>
              <p className="font-semibold text-foreground">{g.name}</p>
              <p className="font-mono text-xs">{g.keywords}</p>
              <p className="text-xs text-muted-foreground">{g.note}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Ad headlines (max ${HEADLINE_MAX} characters each)`}>
        <ul className="space-y-1">
          {[...AD_HEADLINES, ...AD_FACT_TEMPLATES.headlines].map((h) => (
            <li key={h} className="flex justify-between gap-3">
              <span>{h}</span>
              <span className="text-xs text-muted-foreground">{h.includes("{") ? "count after filling" : `${h.length}`}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Ad descriptions (max ${DESCRIPTION_MAX} characters each)`}>
        <ul className="space-y-2">
          {[...AD_DESCRIPTIONS, ...AD_FACT_TEMPLATES.descriptions].map((d) => (
            <li key={d} className="flex justify-between gap-3">
              <span>{d}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{d.includes("{") ? "count after filling" : `${d.length}`}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Every ad must carry the MahaRERA number. Do not add &quot;verified&quot;, &quot;guaranteed&quot;, &quot;best&quot;, price-bait or countdown pressure.</p>
      </Card>

      <Card title="Negative keywords (add as one account-level list)">
        <p className="font-mono text-xs leading-6">{NEGATIVE_KEYWORDS.join(", ")}</p>
        <p className="text-xs text-muted-foreground">A starting list, not a finished one. The search terms report is where the rest comes from.</p>
      </Card>

      <Card title="Routine">
        <ul className="list-disc space-y-1 pl-5">
          {WEEKLY_ROUTINE.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>

      <Card title="Go / no-go gates">
        <ul className="space-y-2">
          {GATES.map((g) => (
            <li key={g.when}>
              <p className="font-semibold text-foreground">{g.when}</p>
              <p>Pass: {g.pass}</p>
              <p>Otherwise: {g.fail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
