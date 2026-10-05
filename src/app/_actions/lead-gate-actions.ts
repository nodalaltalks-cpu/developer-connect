"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getOrCreateSessionId, getDeviceType } from "@/lib/session";
import { getGateMode, RETURNING_LEAD_TTL_DAYS } from "@/lib/leads/gate/gate-config";
import { LEAD_COOKIE_NAME, signLeadToken, verifyLeadToken } from "@/lib/leads/gate/lead-cookie";
import {
  continueAsReturning as continueAsReturningCore,
  getGateState as getGateStateCore,
  recordFormStarted as recordFormStartedCore,
  submitGate as submitGateCore,
  type GateContext,
  type GateDeps,
} from "@/lib/leads/gate/gate-service";
import type {
  GateReturningInput,
  GateStateResponse,
  GateSubmitInput,
  GateSubmitResponse,
} from "@/lib/leads/gate/gate-flow";
import { GATE_ERROR_MESSAGES } from "@/lib/leads/gate/gate-copy";

/**
 * The PUBLIC entry points of the assistance gate. These are callable by any
 * visitor, so everything here follows three rules:
 *
 *  1. No founder authorization is (or may be) used — this is the buyer's own
 *     action. All input is untrusted and re-validated in gate-service.ts.
 *  2. The browser never supplies a URL. The destination is resolved from the
 *     verified developer record on the server.
 *  3. Nothing returned contains a lead id, a full phone number or an email —
 *     only a masked number — and nothing here sends personal data to analytics
 *     or to a log.
 *
 * The signed `dc_lead` cookie (set here, httpOnly) is the only thing that links
 * a returning browser to a lead, and it holds an id and an expiry, never a phone.
 */

async function buildGate(): Promise<{ deps: GateDeps; ctx: GateContext; leadId: string | null }> {
  const [{ userId }, sessionId, deviceType, store] = await Promise.all([auth(), getOrCreateSessionId(), getDeviceType(), cookies()]);
  const now = () => new Date();
  const leadId = verifyLeadToken(store.get(LEAD_COOKIE_NAME)?.value, process.env.LEAD_COOKIE_SECRET, now());
  return {
    deps: {
      developers: createPostgresRepositories(),
      leads: createPostgresLeadRepositories(),
      analytics: postgresAnalyticsSink,
      now,
    },
    ctx: { sessionId, userId: userId ?? null, deviceType },
    leadId,
  };
}

async function rememberLead(leadId: string): Promise<void> {
  const token = signLeadToken(leadId, process.env.LEAD_COOKIE_SECRET, new Date(), RETURNING_LEAD_TTL_DAYS * 86_400);
  if (!token) return; // no secret configured: returning-buyer convenience is simply off
  (await cookies()).set(LEAD_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: RETURNING_LEAD_TTL_DAYS * 86_400,
    path: "/",
  });
}

function failureResponse(): Extract<GateSubmitResponse, { ok: false }> {
  return { ok: false, code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE };
}

/** What the gate shows when it opens (and the anonymous "gate shown" event). */
export async function getGateState(developerId: string, sourceCta: string): Promise<GateStateResponse> {
  try {
    const { deps, ctx, leadId } = await buildGate();
    return await getGateStateCore(deps, ctx, developerId, sourceCta, leadId, getGateMode());
  } catch {
    return { mode: "unavailable", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE };
  }
}

/** The buyer started filling in the form (anonymous funnel event only). */
export async function recordGateFormStarted(developerId: string, sourceCta: string): Promise<void> {
  try {
    const { deps, ctx } = await buildGate();
    await recordFormStartedCore(deps, ctx, developerId, sourceCta);
  } catch {
    /* analytics must never break the gate */
  }
}

/** The buyer submits the gate: save the lead, then return the server-resolved verified destination. */
export async function submitGate(input: GateSubmitInput): Promise<GateSubmitResponse> {
  try {
    const { deps, ctx } = await buildGate();
    const result = await submitGateCore(deps, ctx, input);
    if (result.leadId) await rememberLead(result.leadId);
    return result.response;
  } catch {
    // Never a bypass: an unexpected failure is an error state the buyer can retry.
    return failureResponse();
  }
}

/** A returning buyer continues with the details already on file. */
export async function continueAsReturning(input: GateReturningInput): Promise<GateSubmitResponse> {
  try {
    const { deps, ctx, leadId } = await buildGate();
    const result = await continueAsReturningCore(deps, ctx, leadId, input);
    if (result.leadId) await rememberLead(result.leadId);
    return result.response;
  } catch {
    return failureResponse();
  }
}
