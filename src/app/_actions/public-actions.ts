"use server";

import { auth } from "@clerk/nextjs/server";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { searchPublicDevelopers } from "@/lib/developer-connect/search-service";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { safeRecordAnalyticsEvent } from "@/lib/developer-connect/events";
import { getOrCreateSessionId, getDeviceType } from "@/lib/session";
import type { PublicDeveloperProfile } from "@/lib/developer-connect/public-view";
import type { DeveloperGeoFilter } from "@/lib/developer-connect/repository";

/** The signed-in Clerk user id, when the request happens to be authenticated — never required, never inferred. */
async function currentUserId(): Promise<string | undefined> {
  const { userId } = await auth();
  return userId ?? undefined;
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
  const results = await searchPublicDevelopers(repos, rawQuery, geo);

  const query = rawQuery.trim();
  if (query) {
    const sessionId = await getOrCreateSessionId();
    const deviceType = await getDeviceType();
    const userId = await currentUserId();
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
