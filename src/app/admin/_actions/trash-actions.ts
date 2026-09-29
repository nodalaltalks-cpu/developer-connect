"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";
import { requireFounderForAction } from "@/lib/auth";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";
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
 *
 * `rangeKey` is the Founder Dashboard's global date-filter selection
 * (passed as a plain string, not a resolved `{start,end}` — a Server
 * Action's arguments should stay simple/serializable, and re-resolving
 * it here from the same shared `resolveDateRange()` guarantees this can
 * never compute a boundary differently than any other page). Filters
 * Trash to items that ENTERED Trash (deletedAt) during that period —
 * never `createdAt` (see listTrash's own doc comment). Omitted/invalid
 * falls back to the shared default (Month), same as every other page.
 */
export async function unlockTrashAction(
  rangeKey?: string,
): Promise<{ submissions: ContactSubmission[] } | ReturnType<typeof reverificationError>> {
  await requireFounderForAction();

  const { has } = await auth();
  if (!has({ reverification: "strict" })) {
    return reverificationError("strict");
  }

  const range = resolveDateRange(parseDateRangeKey(rangeKey));
  const engagement = createEngagementRepositories();
  const submissions = await engagement.contact.listTrash(200, range);
  return { submissions };
}

/**
 * Re-fetches Trash for a DIFFERENT date range, WITHOUT repeating the
 * step-up reverification check above — called only from trash-gate.tsx,
 * and only after `unlockTrashAction` has already succeeded once in the
 * current page view (see that component for exactly how it enforces
 * that ordering; this action itself has no server-side memory of it).
 *
 * Why this is safe, and exactly what it does and doesn't change:
 * changing which period Trash is filtered to is not a new act of
 * ACCESSING Trash — it's the same already-open view asking for a
 * different slice of the same data it already fetched. Re-running the
 * full "strict" reverification challenge for that (as the single-action
 * design originally did, before this fix) meant a Founder who had
 * already unlocked Trash could still be re-prompted just for changing
 * the global filter — the UX bug this action exists to fix. Founder
 * authorization (`requireFounderForAction`) is still checked on every
 * call, same as every other action in this file; only the step-up
 * reverification check is skipped here.
 *
 * Residual trade-off, stated plainly: unlike `unlockTrashAction`, this
 * action does not itself verify that step-up reverification happened —
 * it trusts the CLIENT to have already done so via `unlockTrashAction`
 * first. A party who already holds a valid, signed-in Founder session
 * (e.g. a stolen session cookie) could in principle call this action
 * directly without ever completing step-up reverification, which the
 * single-action design did not allow. This is a deliberate, narrow
 * loosening made to satisfy the explicit "don't re-prompt on a filter
 * change" requirement — flagged here rather than silently decided. A
 * tighter alternative (a short-lived server-issued token proving THIS
 * browser session's `unlockTrashAction` call actually passed
 * reverification, checked here before returning data) would close this
 * gap but adds real state/expiry logic; not built without asking first.
 */
export async function getTrashForRangeAction(rangeKey?: string): Promise<{ submissions: ContactSubmission[] }> {
  await requireFounderForAction();

  const range = resolveDateRange(parseDateRangeKey(rangeKey));
  const engagement = createEngagementRepositories();
  const submissions = await engagement.contact.listTrash(200, range);
  return { submissions };
}
