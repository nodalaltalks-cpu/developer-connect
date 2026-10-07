import type { NextStep } from "@/lib/leads/intelligence";

/**
 * "Recommended next step" - shown on a lead page and in the Founder's intelligence view. It is labelled as what it is:
 * a short list of plain rules, not AI. The rule that fired and the facts behind it are always shown, so the person can
 * see exactly why and overrule it. Pure and server-rendered.
 */
export function NextStepCard({ step }: { step: NextStep }) {
  return (
    <section aria-labelledby="next-step-heading" className="rounded-lg border border-border p-4">
      <h2 id="next-step-heading" className="text-sm font-semibold text-foreground">
        Recommended next step
      </h2>
      <p className="mt-1 text-base font-medium text-foreground">{step.action}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        {step.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Suggested by a plain rule ({step.rule.toLowerCase().replace(/_/g, " ")}), not by AI. You know the buyer better than a rule does.</p>
    </section>
  );
}
