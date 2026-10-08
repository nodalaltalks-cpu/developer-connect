import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { ColdCallForm } from "@/components/team/cold-call-form";
import { parseColdCallNumber } from "@/lib/leads/cold-call-service";

export const metadata = {
  title: "New cold call lead | Developer Connects",
  robots: { index: false, follow: false },
};

// Private and per-person: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function NewColdCallLeadPage({ searchParams }: PageProps<"/team/cold-call">) {
  // Signed-in, approved, active team members only (the same gate as every /team page).
  await requireEmployee();
  const params = await searchParams;
  // A number carried over from the dial pad. It is only ever a starting value: the server validates it again on Save.
  const carried = parseColdCallNumber(first(params.phone));
  return (
    <div>
      <SectionHeading title="New cold call lead" description="Record what you learned on the call. It is saved to your leads as a Cold Call lead." />
      <ColdCallForm initialPhone={carried.ok ? carried.e164 : ""} />
      <p className="mt-6 text-center text-sm">
        <Link href="/team/dial" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          ← Back to the dial pad
        </Link>
      </p>
    </div>
  );
}
