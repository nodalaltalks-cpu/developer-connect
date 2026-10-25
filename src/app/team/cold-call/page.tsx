import Link from "next/link";
import { requireTab } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { QuickLeadScreen } from "@/components/team/quick-lead-screen";
import { parseColdCallNumber } from "@/lib/leads/cold-call-service";

export const metadata = {
  title: "Add a lead | Developer Connects",
  robots: { index: false, follow: false },
};

// Private and per-person: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function NewColdCallLeadPage({ searchParams }: PageProps<"/team/cold-call">) {
  // Signed-in, approved, active team members only (the same gate as every /team page).
  await requireTab("dial");
  const params = await searchParams;
  // A number carried over from the dial pad. It is only ever a starting value: the server validates it again on Save.
  const carried = parseColdCallNumber(first(params.phone));
  return (
    <div>
      <SectionHeading title="Add a lead" description="For a client you spoke to without using the dial pad. Tap the answers; use NA where they did not say." />
      <QuickLeadScreen askPhone initialPhone={carried.ok ? carried.e164 : ""} />
      {/* The Save button is a plain in-page button, so the back link only needs room above the phone's bottom bar. */}
      <p className="mt-4 pb-24 text-center text-sm sm:pb-0">
        <Link href="/team/dial" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          ← Back to the dial pad
        </Link>
      </p>
    </div>
  );
}
