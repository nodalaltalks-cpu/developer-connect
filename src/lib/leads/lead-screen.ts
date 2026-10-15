/**
 * Cheap, deterministic screening of an enquiry before anyone spends time or money on it. No external service, no cost, no
 * personal data leaving the system. Two jobs:
 *
 *  1. REFUSE a number that is plainly made up (9999999999, 9876543210, 9898989898). The visitor is asked for a real number;
 *     nothing is saved, nobody is alerted, no call is wasted.
 *  2. FLAG, never refuse, a name that reads like a property business ("Sharma Realty", "ABC Properties"). Brokers and
 *     channel partners often use their firm's name. The flag only changes the alert text ("check before calling"), so a real
 *     buyer with an unlucky surname is never turned away.
 *
 * Honest limit: a broker who gives a personal name and a working number passes. That case is handled by the first WhatsApp
 * question and by logging the outcome (see the Google Ads playbook), not by guessing here.
 */

/** The national significant number of an E.164 number: digits after +91 (10) or +971 (9). Anything else is returned as digits. */
export function nationalNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("971") && digits.length === 12) return digits.slice(3);
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  return digits;
}

const SAMPLE_NUMBERS = new Set(["9876543210", "9123456789", "9988776655", "9999988888", "8888899999", "9898989898", "9090909090", "1234567890", "0123456789"]);

/** True for a number that cannot be a real person's: one digit repeated, a run of 1-2-3, two digits alternating, or a known sample. */
export function isLikelyFakeNumber(national: string): boolean {
  const n = national.replace(/\D/g, "");
  if (n.length < 8) return false; // too short is a different error, reported elsewhere
  if (SAMPLE_NUMBERS.has(n)) return true;
  const counts = new Map<string, number>();
  for (const d of n) counts.set(d, (counts.get(d) ?? 0) + 1);
  if (Math.max(...counts.values()) >= n.length - 2) return true; // 9999999911 style
  if (counts.size <= 2) return true; // 9898989898 style
  let up = 1;
  let down = 1;
  let longestUp = 1;
  let longestDown = 1;
  for (let i = 1; i < n.length; i += 1) {
    const diff = Number(n[i]) - Number(n[i - 1]);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    longestUp = Math.max(longestUp, up);
    longestDown = Math.max(longestDown, down);
  }
  return Math.max(longestUp, longestDown) >= n.length - 2; // 9876543211 style
}

const BUSINESS_WORDS = /\b(realty|realtors?|real estate|properties|property|estate|estates|consultants?|consultancy|associates?|enterprises?|infra|infrastructure|developers?|builders?|brokers?|brokerage|agency|agencies|dealers?|services|solutions|investments?|marketing|ventures?|group|pvt|ltd|llp|co\.)\b/i;

/** True when a name reads like a property business rather than a person. Used for a "check first" flag, never to refuse. */
export function nameLooksLikeBusiness(name: string | null | undefined): boolean {
  const value = (name ?? "").trim();
  return value.length > 0 && BUSINESS_WORDS.test(value);
}

export interface ContactScreen {
  fakeNumber: boolean;
  /** Short, plain-language reasons to check before spending time. Empty for an ordinary enquiry. */
  flags: string[];
}

export function screenContact(input: { name?: string | null; e164: string }): ContactScreen {
  const flags: string[] = [];
  const name = (input.name ?? "").trim();
  const fakeNumber = isLikelyFakeNumber(nationalNumber(input.e164));
  if (nameLooksLikeBusiness(name)) flags.push("name looks like a property business (agent or channel partner?)");
  return { fakeNumber, flags };
}
