import { SectionHeading } from "@/components/admin/empty-state";
import { DeveloperIntakeForm } from "@/components/admin/developer-intake-form";

export default function AdminNewDeveloperPage() {
  return (
    <div className="max-w-xl">
      <SectionHeading
        title="Add a developer"
        description="Create the developer record and its official website candidate together. Nothing here verifies or publishes anything yet — you'll add supporting evidence and review it separately."
      />
      <DeveloperIntakeForm />
    </div>
  );
}
