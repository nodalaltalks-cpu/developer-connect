import type { DeveloperConnectRepositories } from "./repository.ts";
import type { WebsiteCandidate } from "./types.ts";
import { PENDING_VERIFICATION_STATUSES } from "./verification-queue-state.ts";

/** How many queue rows /admin/verification renders at once, and how many each "Load more" adds. */
export const VERIFICATION_QUEUE_PAGE_SIZE = 50;

export interface VerificationQueueRow {
  candidate: WebsiteCandidate;
  developerName: string;
}

/**
 * One page of the Founder verification queue — every candidate in a
 * pending status (PENDING_VERIFICATION_STATUSES), newest first — with the
 * developer name each collapsed row shows, fetched in one batched lookup
 * for just this page. `total` is the whole queue's size across all pages.
 *
 * Read-only: which statuses count as "waiting for review" and everything
 * that happens when a row is reviewed are unchanged (see
 * verification-queue-state.ts and verification-service.ts).
 */
export async function getVerificationQueuePage(
  repos: DeveloperConnectRepositories,
  offset: number,
  pageSize = VERIFICATION_QUEUE_PAGE_SIZE,
): Promise<{ rows: VerificationQueueRow[]; total: number }> {
  const { candidates, total } = await repos.candidates.listByStatusesPage([...PENDING_VERIFICATION_STATUSES], {
    limit: pageSize,
    offset: Math.max(0, Math.floor(offset)),
  });

  const developerIds = [...new Set(candidates.map((c) => c.developerId))];
  const developers = await repos.developers.getManyByIds(developerIds);
  const developerNames = new Map(developers.map((d) => [d.id, d.displayName]));

  return {
    rows: candidates.map((candidate) => ({
      candidate,
      developerName: developerNames.get(candidate.developerId) ?? "Unknown developer",
    })),
    total,
  };
}
