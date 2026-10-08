import { formatDateTimeFull } from "@/lib/leads/format";
import { JOURNEY_LABEL, type JourneyStep } from "@/lib/leads/lead-journey";

/** The road from first contact to revenue, with the date each stage was reached. Read-only: nobody ticks these by hand. */
export function LeadJourney({ steps }: { steps: JourneyStep[] }) {
  return (
    <section aria-label="Lead journey" className="rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">Journey</h2>
      <ol className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.stage} aria-current={step.state === "CURRENT" ? "step" : undefined} className="flex min-h-9 items-center gap-3 text-sm">
            <span
              aria-hidden
              className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                step.state === "DONE" ? "border-green-600 bg-green-600 text-white" : step.state === "CURRENT" ? "border-accent text-accent-hover" : "border-border text-muted-foreground"
              }`}
            >
              {step.state === "DONE" ? "✓" : ""}
            </span>
            <span className={step.state === "AHEAD" || step.state === "SKIPPED" ? "text-muted-foreground" : "font-medium text-foreground"}>{JOURNEY_LABEL[step.stage]}</span>
            <span className="ml-auto text-xs text-muted-foreground">{step.at ? formatDateTimeFull(step.at) : step.state === "CURRENT" ? "Next" : step.state === "SKIPPED" ? "Not recorded" : ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
