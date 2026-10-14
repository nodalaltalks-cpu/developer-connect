/**
 * New-enquiry alerts: what should interrupt the person who must contact a buyer. Pure, so the rules are testable without a browser.
 *
 * A "new enquiry" is a digital lead that is still in the NEW status: nobody has contacted the buyer yet. It stays a pending priority
 * (a red banner on every screen) until it is contacted, and it interrupts with a strong vibration and a pop-up the first time it is seen
 * on a device. The phone remembers which ones it has already shown, so each enquiry buzzes once per device, then waits as the banner.
 */

export interface NewLeadItem {
  id: string;
  /** The buyer's name when they gave one. Never a phone number. */
  name: string | null;
  /** The developer they asked to connect with, when known. */
  developer: string | null;
  /** ISO time the enquiry came in. */
  createdAt: string;
  /** Where to open it: the founder's lead page or the team member's. */
  href: string;
}

/** Long and unmistakable: five heavy pulses ending in one long one (about six seconds). Repeated until the pop-up is dealt with. */
export const NEW_LEAD_VIBRATION: readonly number[] = [800, 200, 800, 200, 800, 200, 800, 200, 1500];

/** How often the vibration repeats while a pop-up is still on screen. */
export const NEW_LEAD_REPEAT_MS = 8_000;

export function newLeadKey(item: Pick<NewLeadItem, "id">): string {
  return `NEW:${item.id}`;
}

/** The items this device has not alerted about yet, newest first. */
export function unseenNewLeads(items: readonly NewLeadItem[], seen: ReadonlySet<string>): NewLeadItem[] {
  return items.filter((item) => !seen.has(newLeadKey(item))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function bannerText(total: number): string {
  return total === 1 ? "1 new enquiry is waiting. Contact the buyer as soon as possible." : `${total} new enquiries are waiting. Contact the buyers as soon as possible.`;
}

export function alertHeadline(item: Pick<NewLeadItem, "name" | "developer">): string {
  const who = item.name ?? "A buyer";
  return item.developer ? `${who} wants to connect with ${item.developer}` : `${who} sent an enquiry`;
}
