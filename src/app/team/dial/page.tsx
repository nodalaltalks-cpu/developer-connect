import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { ColdCallPad } from "@/components/team/cold-call-pad";

export const metadata = {
  title: "Cold call | Developer Connects",
  robots: { index: false, follow: false },
};

// Private and per-person: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeamDialPage() {
  // Signed-in, approved, active team members only (the same gate as every /team page).
  await requireEmployee();
  return (
    <div>
      <SectionHeading title="Cold call" description="Type a number and call it from your own SIM. The call is counted, and a new number becomes your lead. An existing lead is never duplicated." />
      <ColdCallPad />
      <p className="mt-6 text-center text-sm">
        <Link href="/team/calls" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          See my call logs
        </Link>
      </p>
    </div>
  );
}
