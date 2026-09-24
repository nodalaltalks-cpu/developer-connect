"use server";

import { auth } from "@clerk/nextjs/server";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDirectoryPage, searchPublicDevelopers } from "@/lib/developer-connect/search-service";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { safeRecordAnalyticsEvent } from "@/lib/developer-connect/events";
import { getOrCreateSessionId, getDeviceType } from "@/lib/session";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";
import type { DeveloperGeoFilter } from "@/lib/developer-connect/repository";

/** The signed-in Clerk user id, when the request happens to be authenticated — never required, never inferred. */
async function currentUserId(): Promise<string | undefined> {
  const { userId } = await auth();
  return userId ?? undefined;
}

/**
 * A signed-in visitor's own profile city, if they've filled it in — the
 * one profile-driven search ranking signal (Part 11/15). Read-only
 * (never getOrCreateProfile, same reasoning as site-header.tsx): a
 * search must never have the side effect of creating a profile row.
 */
async function preferredCityFor(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const profile = await createPostgresProfileRepository().getByUserId(userId);
  const city = profile?.data.city;
  return typeof city === "string" && city.trim() ? city.trim() : undefined;
}

/**
 * The public journey's only entry points into the domain layer. Every
 * function here goes through search-service.ts (which itself only ever
 * returns `toPublicDeveloperProfile` shapes) — nothing here can hand a
 * raw Developer/WebsiteCandidate row to the browser.
 *
 * Analytics recording is fire-and-forget from the caller's perspective
 * (awaited here, but wrapped in safeRecordAnalyticsEvent so a database
 * hiccup can never surface as a broken search or a broken page).
 */

export async function searchDevelopers(
  rawQuery: string,
  geo?: DeveloperGeoFilter,
): Promise<PublicDeveloperProfile[]> {
  const repos = createPostgresRepositories();
  const userId = await currentUserId();
  const preferredCity = await preferredCityFor(userId);
  const results = await searchPublicDevelopers(repos, rawQuery, geo, preferredCity);

  const query = rawQuery.trim();
  if (query) {
    const sessionId = await getOrCreateSessionId();
    const deviceType = await getDeviceType();
    if (results.length === 0) {
      await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
        eventName: "zero_result_search",
        occurredAt: new Date(),
        sessionId,
        deviceType,
        userId,
        query,
        country: geo?.country,
        state: geo?.state,
        city: geo?.city,
      });
    } else {
      await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
        eventName: "search_performed",
        occurredAt: new Date(),
        sessionId,
        deviceType,
        userId,
        query,
        resultCount: results.length,
        country: geo?.country,
        state: geo?.state,
        city: geo?.city,
      });
    }
  }

  return results;
}

/**
 * The homepage directory's "Load more": the next page of published
 * developers for the same query/Country/State/City the page was rendered
 * with. Read-only — sets no cookie and records no analytics event.
 *
 * The anonymous, unfiltered view stays the limited initial-discovery
 * sample (see the homepage); this returns nothing for that case, exactly
 * as the page itself never offers "Load more" there.
 */
export async function loadMoreDirectoryDevelopers(
  filter: { query?: string; country?: string; state?: string; city?: string },
  offset: number,
): Promise<{ developers: PublicDeveloperProfile[]; total: number }> {
  const hasActiveFilter = Boolean(filter.query?.trim() || filter.country || filter.state || filter.city);
  if (!hasActiveFilter && !(await currentUserId())) return { developers: [], total: 0 };
  if (!Number.isFinite(offset) || offset < 0) return { developers: [], total: 0 };

  return getPublicDirectoryPage(createPostgresRepositories(), filter, offset);
}

export async function recordSearchResultClick(
  developerId: string,
  query: string,
  position: number,
): Promise<void> {
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();
  const userId = await currentUserId();
  await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
    eventName: "search_result_clicked",
    occurredAt: new Date(),
    sessionId,
    deviceType,
    userId,
    developerId,
    query,
    position,
  });
}

export async function recordDeveloperPageView(
  developerId: string,
  referrerQuery?: string,
): Promise<void> {
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();
  const userId = await currentUserId();
  await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
    eventName: "developer_page_viewed",
    occurredAt: new Date(),
    sessionId,
    deviceType,
    userId,
    developerId,
    referrerQuery,
  });
}

export async function recordOfficialWebsiteClick(
  developerId: string,
  targetDomain: string,
): Promise<void> {
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();
  const userId = await currentUserId();
  await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
    eventName: "official_website_clicked",
    occurredAt: new Date(),
    sessionId,
    deviceType,
    userId,
    developerId,
    targetDomain,
  });
}

export async function recordDeveloperShare(
  developerId: string,
  method: "whatsapp" | "email" | "copy_link" | "native_share",
): Promise<void> {
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();
  const userId = await currentUserId();
  await safeRecordAnalyticsEvent(postgresAnalyticsSink, {
    eventName: "developer_shared",
    occurredAt: new Date(),
    sessionId,
    deviceType,
    userId,
    developerId,
    method,
  });
}
