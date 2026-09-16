"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import type { ContactSubmission } from "@/lib/engagement/types";

/**
 * Gates the Trash *data fetch* itself, not just the UI, behind a fresh
 * Founder reverification (Part 16/17: "every visit to Trash" should
 * challenge, using Clerk's own step-up auth — never a second, custom
 * password). This matters because a Server Component that fetched Trash
 * server-side and passed it as props to a "locked-looking" client
 * component would still have shipped the real Trash contents to the
 * browser in the RSC payload before the Founder ever verified anything.
 * Routing the fetch through this reverification-gated action instead
 * means the data genuinely doesn't leave the server until `has()` confirms
 * a recent first-factor verification.
 *
 * "strict" is Clerk's tightest built-in freshness window — the closest
 * fit to "prompt on essentially every real visit" without inventing a
 * bespoke afterMinutes value to justify. This Clerk feature (session
 * reverification / step-up auth) is publicly documented but still in
 * beta as of this SDK version — see the final report for what that means
 * in practice for the Founder.
 */
export async function unlockTrashAction(): Promise<
  { submissions: ContactSubmission[] } | ReturnType<typeof reverificationError>
> {
  await requireFounderForAction();

  const { has } = await auth();
  if (!has({ reverification: "strict" })) {
    return reverificationError("strict");
  }

  const engagement = createEngagementRepositories();
  const submissions = await engagement.contact.listTrash(200);
  return { submissions };
}
