import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import type { DeviceType } from "./developer-connect/events.ts";

const SESSION_COOKIE = "dc_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Anonymous, session-scoped identifier for analytics — never tied to an
 * account, never used for auth. Only callable from a Server Action or
 * Route Handler (cookie writes aren't allowed during Server Component
 * rendering).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return id;
}

/** Coarse mobile/desktop classification from User-Agent — no fingerprinting, no third-party lookup. */
export async function getDeviceType(): Promise<DeviceType> {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent");
  if (!userAgent) return "unknown";
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop";
}
