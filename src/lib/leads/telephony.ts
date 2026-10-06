import type { CallStatus } from "./types.ts";

/**
 * THE TELEPHONY BOUNDARY. Developer Connects does not place or receive phone calls by itself: a call is real only when
 * a licensed telephony provider connects it, and the provider's own events are the only authority for what happened
 * (ringing, answered, ended, how long). This file is the whole contract between the app and a provider; the rest of
 * the system (call records, history, analytics, screens) is written against it and never against a vendor.
 *
 * NO PROVIDER IS CONFIGURED YET. That is deliberate and visible: `getTelephonyProvider()` returns a provider that
 * reports `configured: false`, placing a call is refused (nothing is recorded), and the webhook endpoint answers 503.
 * Nothing here simulates a call. To go live, a vendor adapter implementing TelephonyProvider is added to ADAPTERS and
 * selected with the TELEPHONY_PROVIDER setting — see docs in the Phase 2 report for what a vendor must supply
 * (outbound number/caller ID, click-to-call or WebRTC, signed status webhooks, recording policy).
 */

/** One status/lifecycle event from the provider, already verified and normalised by the adapter. */
export interface ProviderEvent {
  provider: string;
  /** The provider's unique id for THIS event — the idempotency key. A redelivered webhook carries the same id. */
  providerEventId: string;
  /** The provider's id for the call. */
  providerCallId: string;
  /** The provider's own label for the event, kept as evidence. */
  eventType: string;
  /** Our normalised status for the call after this event, or null for an informational event. */
  status: CallStatus | null;
  /** When the PROVIDER says it happened. */
  occurredAt: Date;
  /** Provider-reported timestamps, when the event carries them. */
  answeredAt?: Date;
  endedAt?: Date;
  /** Provider-reported talk time in whole seconds. */
  durationSeconds?: number;
  endReason?: string;
  /** The raw event, stored verbatim as evidence. */
  payload: Record<string, unknown>;
}

export interface PlaceCallRequest {
  /** Our call id — also sent to the provider as the reference so its events can be matched back. */
  callId: string;
  /** The number to dial, E.164. Never logged or stored in full on the call record. */
  toE164: string;
  /** The internal user placing the call (so the provider can bridge to that person's phone/browser). */
  staffUserId: string;
}

export interface TelephonyProvider {
  readonly name: string;
  /** False until a real provider is wired. While false, calls cannot be placed and nothing is recorded. */
  readonly configured: boolean;
  /** Starts the call. Resolves with the provider's call id; rejects if the provider refused. */
  initiateCall(request: PlaceCallRequest): Promise<{ providerCallId: string }>;
  /**
   * Verifies a webhook delivery (signature/secret) and turns it into events. MUST throw WebhookVerificationError for
   * anything it cannot prove came from the provider. `rawBody` is the exact bytes received, unparsed.
   */
  parseWebhook(rawBody: string, headers: Record<string, string>): ProviderEvent[];
}

export class TelephonyNotConfiguredError extends Error {
  constructor() {
    super("The internal dialer is not connected to a telephony provider yet, so calls cannot be placed or counted.");
  }
}

export class WebhookVerificationError extends Error {}

export const notConfiguredProvider: TelephonyProvider = {
  name: "none",
  configured: false,
  async initiateCall() {
    throw new TelephonyNotConfiguredError();
  },
  parseWebhook() {
    throw new WebhookVerificationError("No telephony provider is configured.");
  },
};

/**
 * Vendor adapters, by the name used in TELEPHONY_PROVIDER. EMPTY on purpose: the first real adapter (written against
 * the chosen vendor's documentation and tested against its sandbox) is registered here.
 */
const ADAPTERS: Record<string, (env: Record<string, string | undefined>) => TelephonyProvider> = {};

export function getTelephonyProvider(env: Record<string, string | undefined> = process.env): TelephonyProvider {
  const name = env.TELEPHONY_PROVIDER?.trim();
  if (!name) return notConfiguredProvider;
  const factory = ADAPTERS[name];
  // A name with no adapter is treated as NOT configured: never half-configured, never silently simulated.
  return factory ? factory(env) : notConfiguredProvider;
}
