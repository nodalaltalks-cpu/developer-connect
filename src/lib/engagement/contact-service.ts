import type { EngagementRepositories } from "./repository.ts";
import type { NotificationRepository } from "../notifications/repository.ts";
import type { ContactSubmission, ContactStatus, ContactStatusHistoryEntry, ContactReason } from "./types.ts";
import { NotFoundError } from "../developer-connect/errors.ts";

/**
 * Founder case-management for Contact Us submissions (status lifecycle,
 * history, soft-delete/Trash, restore, permanent delete) — kept in its
 * own file, separate from engagement-service.ts, because that file also
 * serves Reports and Newsletter and this is meaningfully more logic than
 * "validate and create." Reports/Newsletter are deliberately untouched.
 */

export interface ContactActor {
  actorType: "FOUNDER" | "SYSTEM" | "AGENT";
  actorId: string;
}

const REQUEST_LABELS: Record<ContactReason, string> = {
  GENERAL_QUESTION: "Contact Us request",
  REPORT_INACCURATE_INFO: "report",
  DEVELOPER_LISTING: "developer listing request",
  PARTNERSHIP: "partnership request",
  OTHER: "request",
};

/**
 * The ONE place Contact status-update notification copy is composed —
 * same "one composer function" discipline as composeFounderMessage.
 * OPEN deliberately returns null: the task's own specified copy list
 * (Part 49) only defines language for IN_REVIEW/ON_HOLD/RESOLVED/
 * REJECTED, so a manual reopen never fabricates a notification the
 * product spec never asked for.
 */
export function composeContactStatusNotification(
  submission: Pick<ContactSubmission, "reason">,
  newStatus: ContactStatus,
): { title: string; body: string } | null {
  const label = REQUEST_LABELS[submission.reason] ?? "request";
  switch (newStatus) {
    case "IN_REVIEW":
      return { title: "Your request is under review", body: `Your ${label} is now under review.` };
    case "ON_HOLD":
      return {
        title: "Your request is on hold",
        body: `Your ${label} is currently on hold. We may need additional information before we can continue.`,
      };
    case "RESOLVED":
      return { title: "Your request has been resolved", body: `Your ${label} has been resolved.` };
    case "REJECTED":
      return {
        title: "Update on your request",
        body: `Your ${label} has been reviewed and could not be accepted.`,
      };
    default:
      return null;
  }
}

export interface ChangeContactStatusResult {
  submission: ContactSubmission;
  /** Null when this was a no-op — the selected status already matched (Part 30's idempotency rule): no history event, no notification. */
  historyEntry: ContactStatusHistoryEntry | null;
  notificationSent: boolean;
}

/**
 * The one place a Contact submission's status can change.
 *
 * Idempotent (Part 30): selecting the status a submission is already in
 * returns the current state untouched — no history event, no
 * notification, so a page refresh/re-render/double-click can never
 * duplicate either.
 *
 * Transactional for the status+history pair (Part 31): both are written
 * inside repos.runInTransaction, so a Founder can never see the list say
 * "Resolved" while history still says "Open", or the reverse. The
 * notification is sent AFTER that transaction commits, as a best-effort
 * side effect — same discipline as safeRecordAnalyticsEvent elsewhere in
 * this codebase: a failure to notify must never undo or fail a status
 * change the Founder already made and that history already recorded.
 *
 * Never fabricates a notification for a requester who isn't linked to an
 * authenticated account (submission.userId is null for anonymous Contact
 * Us visitors) — the status change and its history still happen exactly
 * the same either way; see Part 22 of the spec this implements.
 */
export async function changeContactStatus(
  repos: EngagementRepositories,
  notificationRepo: NotificationRepository,
  id: string,
  newStatus: ContactStatus,
  note: string | null | undefined,
  actor: ContactActor,
): Promise<ChangeContactStatusResult> {
  const trimmedNote = note?.trim() || null;

  const { submission, historyEntry } = await repos.runInTransaction(async (txRepos) => {
    const current = await txRepos.contact.getById(id);
    if (!current) throw new NotFoundError(`Contact submission ${id} not found`);
    if (current.deletedAt) {
      throw new Error("This request is in Trash. Restore it before changing its status.");
    }

    if (current.status === newStatus) {
      return { submission: current, historyEntry: null };
    }

    const updated = await txRepos.contact.updateStatus(id, newStatus);
    if (!updated) throw new NotFoundError(`Contact submission ${id} not found`);

    const entry = await txRepos.contactHistory.append({
      contactSubmissionId: id,
      eventType: "STATUS_CHANGE",
      previousStatus: current.status,
      newStatus,
      note: trimmedNote,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    return { submission: updated, historyEntry: entry as ContactStatusHistoryEntry | null };
  });

  if (!historyEntry) {
    return { submission, historyEntry: null, notificationSent: false };
  }

  let notificationSent = false;
  if (submission.userId) {
    const message = composeContactStatusNotification(submission, newStatus);
    if (message) {
      try {
        await notificationRepo.create({
          userId: submission.userId,
          type: "CONTACT_STATUS_UPDATE",
          title: message.title,
          body: message.body,
          targetRoute: null,
        });
        notificationSent = true;
      } catch {
        // Best-effort — see the function doc comment above.
      }
    }
  }

  return { submission, historyEntry, notificationSent };
}

/** Fetches one submission's full activity history, newest first — used by the expanded Contact card and the Trash detail view alike. */
export async function getContactHistory(
  repos: EngagementRepositories,
  contactSubmissionId: string,
): Promise<ContactStatusHistoryEntry[]> {
  return repos.contactHistory.listBySubmission(contactSubmissionId);
}

/**
 * Delete (Trash) → soft-delete only. Idempotent: moving an already-trashed
 * submission to Trash again is a no-op (no duplicate TRASHED event).
 */
export async function moveContactToTrash(
  repos: EngagementRepositories,
  id: string,
  actor: ContactActor,
): Promise<ContactSubmission> {
  return repos.runInTransaction(async (txRepos) => {
    const current = await txRepos.contact.getById(id);
    if (!current) throw new NotFoundError(`Contact submission ${id} not found`);
    if (current.deletedAt) return current;

    const updated = await txRepos.contact.softDelete(id, actor.actorId);
    if (!updated) throw new NotFoundError(`Contact submission ${id} not found`);

    await txRepos.contactHistory.append({
      contactSubmissionId: id,
      eventType: "TRASHED",
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    return updated;
  });
}

/** Restore: Trash → active Contact list. Idempotent: restoring an already-active submission is a no-op. */
export async function restoreContactFromTrash(
  repos: EngagementRepositories,
  id: string,
  actor: ContactActor,
): Promise<ContactSubmission> {
  return repos.runInTransaction(async (txRepos) => {
    const current = await txRepos.contact.getById(id);
    if (!current) throw new NotFoundError(`Contact submission ${id} not found`);
    if (!current.deletedAt) return current;

    const updated = await txRepos.contact.restore(id);
    if (!updated) throw new NotFoundError(`Contact submission ${id} not found`);

    await txRepos.contactHistory.append({
      contactSubmissionId: id,
      eventType: "RESTORED",
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    return updated;
  });
}

/**
 * Real, irreversible deletion — only ever reachable from Trash (a
 * not-yet-trashed submission must be moved to Trash first; this is
 * enforced here, not just in the UI). Records the audit event BEFORE
 * destroying the row: contact_status_history.contactSubmissionId is
 * deliberately not a foreign key (see schema.ts) so this event survives
 * the row it describes. Only the submission id is recorded — never the
 * name/email/message content — per Part 17's "do not expose deleted
 * content unnecessarily in the audit log."
 */
export async function permanentlyDeleteContact(
  repos: EngagementRepositories,
  id: string,
  actor: ContactActor,
): Promise<void> {
  await repos.runInTransaction(async (txRepos) => {
    const current = await txRepos.contact.getById(id);
    if (!current) throw new NotFoundError(`Contact submission ${id} not found`);
    if (!current.deletedAt) {
      throw new Error("Move this request to Trash before deleting it permanently.");
    }

    await txRepos.contactHistory.append({
      contactSubmissionId: id,
      eventType: "PERMANENT_DELETE",
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    const deleted = await txRepos.contact.permanentDelete(id);
    if (!deleted) throw new NotFoundError(`Contact submission ${id} not found`);
  });
}
