import { channelOf, CHANNEL_LABEL, type AcquisitionChannel, type AcquisitionRow, type AttributionBasis } from "./acquisition.ts";

/**
 * Two numbers that decide whether paid leads are worth buying, read from records only:
 *  - SPEED TO FIRST CONTACT: minutes from the lead being created to the first call placed or WhatsApp opened for it.
 *  - JUNK RATE: leads that turned out to be a wrong number or were marked Unqualified, as a share of the leads.
 *
 * Only digital leads are measured (cold-call and imported leads are not "responded to"). A median or a rate is shown only once a
 * channel has MIN_SAMPLE leads, so 1 of 2 is never printed as "50%".
 */

export const RESPONSE_MIN_SAMPLE = 10;
/** The promise: first contact within this many minutes of the enquiry. */
export const FAST_RESPONSE_MINUTES = 5;

const DIGITAL: ReadonlySet<AcquisitionChannel> = new Set(["GOOGLE_ADS", "META", "INSTAGRAM", "WHATSAPP", "REFERRAL", "ORGANIC_SEARCH", "OTHER_DIGITAL", "DIRECT_OR_UNKNOWN"]);

export interface ChannelQuality {
  channel: AcquisitionChannel;
  label: string;
  leads: number;
  /** Leads with a recorded first contact. */
  contacted: number;
  /** Minutes from enquiry to first contact; null below the sample size or when no lead has been contacted. */
  medianMinutes: number | null;
  /** Share (0..100, one decimal) of CONTACTED leads reached within FAST_RESPONSE_MINUTES; null below the sample size. */
  fastShare: number | null;
  /** Leads never contacted at all. */
  neverContacted: number;
  junk: number;
  /** junk / leads as a percentage, one decimal; null below the sample size. */
  junkRate: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pct = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

/** Minutes between enquiry and first contact; a contact stamped before the enquiry (clock skew, imports) counts as 0, never negative. */
export function minutesToFirstContact(row: Pick<AcquisitionRow, "createdAt" | "firstContactAt">): number | null {
  if (!row.firstContactAt) return null;
  return Math.max(0, (row.firstContactAt.getTime() - row.createdAt.getTime()) / 60_000);
}

export function buildChannelQuality(rows: readonly AcquisitionRow[], basis: AttributionBasis = "first"): ChannelQuality[] {
  const by = new Map<AcquisitionChannel, AcquisitionRow[]>();
  for (const r of rows) {
    const channel = channelOf(r, basis);
    if (!DIGITAL.has(channel)) continue;
    const list = by.get(channel);
    if (list) list.push(r);
    else by.set(channel, [r]);
  }
  return [...by.entries()]
    .map(([channel, list]) => {
      const minutes = list.map(minutesToFirstContact).filter((m): m is number => m !== null);
      const junk = list.filter((r) => r.junk === true).length;
      const enough = list.length >= RESPONSE_MIN_SAMPLE;
      return {
        channel,
        label: CHANNEL_LABEL[channel],
        leads: list.length,
        contacted: minutes.length,
        medianMinutes: enough && minutes.length > 0 ? Math.round(median(minutes) * 10) / 10 : null,
        fastShare: enough && minutes.length > 0 ? pct(minutes.filter((m) => m <= FAST_RESPONSE_MINUTES).length, minutes.length) : null,
        neverContacted: list.length - minutes.length,
        junk,
        junkRate: enough ? pct(junk, list.length) : null,
      };
    })
    .sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
}
