import { SectionHeading, EmptyState } from "@/components/admin/empty-state";

export default function AdminAutomationPage() {
  return (
    <div>
      <SectionHeading
        title="Automation"
        description="Automated developer/website discovery — architecture-ready, not yet built."
      />

      <EmptyState
        title="No research agent exists yet"
        description="Phase 2A explicitly deferred automated discovery. The schema is already ready for it: discoverySource already has an AGENT_CRAWL value, and the same submitWebsiteCandidate → verification queue → founder approval pipeline a human uses today is exactly what an agent will use — it cannot skip founder review. When an agent exists, its run history (developers scanned, candidates found, evidence collected, failures) belongs here."
      />
    </div>
  );
}
