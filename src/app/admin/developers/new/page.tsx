import { SectionHeading } from "@/components/admin/empty-state";
import { DeveloperIntakeForm } from "@/components/admin/developer-intake-form";

export default function AdminNewDeveloperPage() {
  return (
    <div className="max-w-xl">
      <SectionHeading
        title="Add a developer"
        description="Create the developer record first. You'll add its official website candidate and supporting evidence next — creating this record does not verify or publish anything yet."
      />
      <DeveloperIntakeForm />
    </div>
  );
}
