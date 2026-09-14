import type { EngagementRepositories } from "./repository.ts";
import type {
  InaccuracyReport,
  ContactSubmission,
  NewsletterSubscriber,
  InaccuracyReportCategory,
  ContactReason,
} from "./types.ts";
import type { DeveloperRepository } from "../developer-connect/repository.ts";
import { NotFoundError } from "../developer-connect/errors.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalEmail(email: string | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new Error("That doesn't look like a valid email address.");
  }
  return trimmed;
}

function requireEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    throw new Error("Please enter a valid email address.");
  }
  return trimmed;
}

/**
 * A visitor flagging something wrong on a public developer page. Requires
 * the developer to actually exist — a fabricated developerId from the
 * browser cannot create an orphaned report — but never touches
 * developer/verification data itself; this is purely a Founder-facing
 * signal.
 */
export async function submitInaccuracyReport(
  repos: EngagementRepositories,
  developers: Pick<DeveloperRepository, "getById">,
  input: { developerId: string; category: InaccuracyReportCategory; details: string; reporterEmail?: string },
): Promise<InaccuracyReport> {
  const developer = await developers.getById(input.developerId);
  if (!developer) {
    throw new NotFoundError(`Developer ${input.developerId} not found`);
  }

  const details = input.details.trim();
  if (!details) {
    throw new Error("Please describe what's incorrect.");
  }

  return repos.reports.create({
    developerId: input.developerId,
    category: input.category,
    details,
    reporterEmail: normalizeOptionalEmail(input.reporterEmail),
  });
}

export async function submitContactMessage(
  repos: EngagementRepositories,
  input: { name: string; email: string; reason: ContactReason; message: string; userId?: string | null },
): Promise<ContactSubmission> {
  const name = input.name.trim();
  const message = input.message.trim();
  if (!name) throw new Error("Please enter your name.");
  if (!message) throw new Error("Please enter a message.");

  return repos.contact.create({
    name,
    email: requireEmail(input.email),
    reason: input.reason,
    message,
    userId: input.userId ?? null,
  });
}

export async function subscribeToNewsletter(
  repos: EngagementRepositories,
  input: { email: string; source?: string; userId?: string | null },
): Promise<{ subscriber: NewsletterSubscriber; alreadySubscribed: boolean }> {
  return repos.newsletter.subscribe({
    email: requireEmail(input.email),
    source: input.source,
    userId: input.userId ?? null,
  });
}
