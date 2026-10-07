import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { NextStepCard } from "@/components/leads/next-step-card";
import { formatRate } from "@/lib/leads/call-analytics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatEnumLabel, formatMoneyExact } from "@/lib/leads/format";
import { getIntelligence } from "@/lib/leads/intelligence-service";
import { SUFFICIENCY, type RateEstimate } from "@/lib/leads/intelligence";

export const metadata = {
  title: "Intelligence | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

function Rate({ r }: { r: RateEstimate }) {
  if (r.status === "INSUFFICIENT_DATA") return <span className="text-muted-foreground">Not enough data ({r.n} of {SUFFICIENCY.MIN_LEADS_FOR_RATE} leads)</span>;
  return (
    <span>
      {formatRate(r.rate)} <span className="text-xs text-muted-foreground">(likely {formatRate(r.low)} to {formatRate(r.high)}, from {r.n} leads)</span>
    </span>
  );
}

export default async function IntelligencePage() {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const intel = await getIntelligence(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id });

  return (
    <div>
      <SectionHeading title="Intelligence" description="Decision support built on your own history. It says plainly what is a rule, what is a statistic, and when there is too little data to say anything. Nothing here is a black box." />

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="text-base font-semibold text-foreground">
          Recommended next steps
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">The leads your Today queue ranks highest, each with the plain rule that applies and why. These are rules, not AI.</p>
        {intel.steps.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing queued" description="Leads that need attention appear here with a recommended next step." />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {intel.steps.map((s) => (
              <li key={s.leadId}>
                <p className="mb-1 text-sm">
                  <Link href={`/admin/leads/${s.leadId}`} className="font-medium text-accent-hover hover:underline">
                    {s.name ?? "Unnamed lead"}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">· {formatEnumLabel(s.status)}</span>
                </p>
                <NextStepCard step={s.step} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="quality-heading" className="mt-10">
        <h2 id="quality-heading" className="text-base font-semibold text-foreground">
          Source quality, with the uncertainty
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">A rate is shown only when a channel has at least {SUFFICIENCY.MIN_LEADS_FOR_RATE} leads, always with the range it plausibly lies in (95% interval), so a lucky small sample is not mistaken for a trend.</p>
        <ul className="mt-3 space-y-2">
          {intel.channels.map((c) => (
            <li key={c.channel} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground">
                Qualified: <Rate r={c.qualified} />
              </p>
              <p className="text-xs text-muted-foreground">
                Booked: <Rate r={c.booked} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="forecast-heading" className="mt-10">
        <h2 id="forecast-heading" className="text-base font-semibold text-foreground">
          Forecast from history
        </h2>
        {intel.forecast.status === "INSUFFICIENT_DATA" ? (
          <div role="status" className="mt-2 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
            <p className="font-medium">No forecast yet - there is not enough history to make one honestly.</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {intel.forecast.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-border p-3 text-sm">
            <p className="text-foreground">
              Expected bookings from today&apos;s open pipeline: <strong>{intel.forecast.expectedBookings?.toFixed(1)}</strong>
            </p>
            {(["INR", "AED"] as const).filter((c) => intel.forecast.expectedCommission[c] !== undefined).map((c) => (
              <p key={c} className="text-xs text-muted-foreground">
                Expected commission ({c}): {formatMoneyExact(intel.forecast.expectedCommission[c]!, c)}
              </p>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">An expectation from how past leads at each stage went on to book - not a promise. Each stage&apos;s rate and sample size are in the table below.</p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {intel.forecast.stages.map((s) => (
                <li key={s.stage}>
                  {formatEnumLabel(s.stage)}: {s.open} open · booked {formatRate(s.rate.rate)} historically ({s.rate.n} leads)
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="model-heading" className="mt-10">
        <h2 id="model-heading" className="text-base font-semibold text-foreground">
          Machine-learning model status
        </h2>
        <p className="mt-2 rounded-md border border-border p-3 text-sm text-foreground">{intel.modelStatus}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {intel.readiness.labelledLeads} leads have a settled outcome and {intel.readiness.positives} of them booked. A model is attempted only with at least {SUFFICIENCY.MODEL_MIN_LABELLED_LEADS} settled leads and {SUFFICIENCY.MODEL_MIN_POSITIVES} bookings, and is shown to no one unless it beats chance on leads it never trained on.
        </p>
      </section>
    </div>
  );
}
