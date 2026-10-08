import { channelOf, CHANNEL_LABEL, type AcquisitionChannel, type TouchEvidence } from "../leads/acquisition.ts";

/**
 * The Founder's visitor-behaviour report: pure functions over per-session facts and per-page aggregates, so every rule is
 * unit-tested and no number here can come from anywhere but real recorded events.
 *
 * Honesty rules: a rate is only shown when its denominator is big enough to mean something (MIN_SAMPLE); a comparison is
 * only made when BOTH sides are big enough; with too little data the page says so instead of drawing a conclusion.
 */

export const MIN_SAMPLE = 30;

export type Device = "mobile" | "desktop" | "unknown";

/** One visitor session, reduced to what matters. Contains no personal data. */
export interface SessionFacts {
  sessionId: string;
  device: Device;
  firstPath: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  hasGclid: boolean;
  hasFbclid: boolean;
  viewedDeveloper: boolean;
  clickedConnect: boolean;
  gateShown: boolean;
  formStarted: boolean;
  leadSubmitted: boolean;
}

export interface PageHealthRow {
  path: string;
  device: Device;
  views: number;
  /** Visits that had a recorded engagement summary. */
  measured: number;
  avgEngagedSeconds: number | null;
  avgScrollPercent: number | null;
  /** Left within 5 engaged seconds, scrolled under a quarter, and pressed nothing. */
  bounced: number;
}

export interface CtaRow {
  ctaId: string;
  device: Device;
  clicks: number;
}

export const FUNNEL_STEPS = [
  { key: "sessions", label: "Visited the site" },
  { key: "viewedDeveloper", label: "Opened a developer page" },
  { key: "clickedConnect", label: "Pressed Connect" },
  { key: "gateShown", label: "Saw the contact form" },
  { key: "formStarted", label: "Started filling it" },
  { key: "leadSubmitted", label: "Sent an enquiry" },
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"];

export interface FunnelStep {
  key: FunnelKey;
  label: string;
  count: number;
  /** Share of the PREVIOUS step that continued; null for the first step or when the previous step is empty. */
  continuedPercent: number | null;
  /** Share of everyone who visited. */
  ofVisitorsPercent: number | null;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

function touchOf(s: SessionFacts): TouchEvidence {
  return {
    utmSource: s.utmSource,
    utmMedium: s.utmMedium,
    utmCampaign: s.utmCampaign,
    gclid: s.hasGclid ? "present" : null,
    fbclid: s.hasFbclid ? "present" : null,
    referrer: s.referrerHost ? `https://${s.referrerHost}/` : null,
    landingPath: s.firstPath,
  };
}

/** The visitor's channel, by the same rules the lead acquisition report uses (click ids and tags name a channel; nothing is guessed). */
export function sessionChannel(s: SessionFacts): AcquisitionChannel {
  const touch = touchOf(s);
  return channelOf({ sourceType: "DIGITAL", creationMethod: "WEBSITE", first: touch, latest: touch });
}

/**
 * How far a visitor got: the index of the LAST funnel step they reached (0 = only visited). A step counts everyone who reached
 * it OR went further, so the funnel can only narrow. Without this, a visitor who sent an enquiry from a directory card (no
 * recorded press on the developer-page Connect button) would show a step bigger than the one before it.
 */
function furthestStep(s: SessionFacts): number {
  if (s.leadSubmitted) return 5;
  if (s.formStarted) return 4;
  if (s.gateShown) return 3;
  if (s.clickedConnect) return 2;
  if (s.viewedDeveloper) return 1;
  return 0;
}

export function buildFunnel(sessions: readonly SessionFacts[]): FunnelStep[] {
  const reached = (step: number) => sessions.filter((s) => furthestStep(s) >= step).length;
  const counts: Record<FunnelKey, number> = {
    sessions: sessions.length,
    viewedDeveloper: reached(1),
    clickedConnect: reached(2),
    gateShown: reached(3),
    formStarted: reached(4),
    leadSubmitted: reached(5),
  };
  return FUNNEL_STEPS.map((step, index) => {
    const previous = index === 0 ? null : counts[FUNNEL_STEPS[index - 1].key];
    return {
      key: step.key,
      label: step.label,
      count: counts[step.key],
      continuedPercent: previous === null ? null : pct(counts[step.key], previous),
      ofVisitorsPercent: index === 0 ? null : pct(counts[step.key], counts.sessions),
    };
  });
}

export interface ChannelRow {
  channel: AcquisitionChannel;
  label: string;
  sessions: number;
  sharePercent: number | null;
  connectPercent: number | null;
  leadPercent: number | null;
  leads: number;
}

export function buildChannels(sessions: readonly SessionFacts[]): ChannelRow[] {
  const groups = new Map<AcquisitionChannel, SessionFacts[]>();
  for (const s of sessions) {
    const channel = sessionChannel(s);
    groups.set(channel, [...(groups.get(channel) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([channel, rows]) => ({
      channel,
      label: CHANNEL_LABEL[channel],
      sessions: rows.length,
      sharePercent: pct(rows.length, sessions.length),
      connectPercent: rows.length >= MIN_SAMPLE ? pct(rows.filter((r) => r.clickedConnect).length, rows.length) : null,
      leadPercent: rows.length >= MIN_SAMPLE ? pct(rows.filter((r) => r.leadSubmitted).length, rows.length) : null,
      leads: rows.filter((r) => r.leadSubmitted).length,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

export interface DeviceRow {
  device: Device;
  sessions: number;
  connectPercent: number | null;
  leadPercent: number | null;
}

export function buildDevices(sessions: readonly SessionFacts[]): DeviceRow[] {
  return (["mobile", "desktop", "unknown"] as const)
    .map((device) => {
      const rows = sessions.filter((s) => s.device === device);
      return {
        device,
        sessions: rows.length,
        connectPercent: rows.length >= MIN_SAMPLE ? pct(rows.filter((r) => r.clickedConnect).length, rows.length) : null,
        leadPercent: rows.length >= MIN_SAMPLE ? pct(rows.filter((r) => r.leadSubmitted).length, rows.length) : null,
      };
    })
    .filter((row) => row.sessions > 0);
}

export interface PageSummary {
  path: string;
  views: number;
  measured: number;
  avgEngagedSeconds: number | null;
  avgScrollPercent: number | null;
  bouncePercent: number | null;
}

/** Merges the per-device rows into one row per path; averages are weighted by how many visits were measured. */
export function summarisePages(rows: readonly PageHealthRow[]): PageSummary[] {
  const byPath = new Map<string, PageHealthRow[]>();
  for (const row of rows) byPath.set(row.path, [...(byPath.get(row.path) ?? []), row]);
  return [...byPath.entries()]
    .map(([path, group]) => {
      const views = group.reduce((n, r) => n + r.views, 0);
      const measured = group.reduce((n, r) => n + r.measured, 0);
      const weighted = (pick: (r: PageHealthRow) => number | null) => {
        const total = group.reduce((n, r) => n + (pick(r) ?? 0) * r.measured, 0);
        return measured > 0 ? Math.round((total / measured) * 10) / 10 : null;
      };
      return {
        path,
        views,
        measured,
        avgEngagedSeconds: weighted((r) => r.avgEngagedSeconds),
        avgScrollPercent: weighted((r) => r.avgScrollPercent),
        bouncePercent: measured >= MIN_SAMPLE ? pct(group.reduce((n, r) => n + r.bounced, 0), measured) : null,
      };
    })
    .sort((a, b) => b.views - a.views);
}

// --- plain-language findings ----------------------------------------------------------------------

export type Severity = "fix" | "look" | "good" | "info";

export interface Finding {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Where in the admin to act on it. */
  href?: string;
}

export interface BehaviourReport {
  sessions: SessionFacts[];
  pages: PageHealthRow[];
  ctas: CtaRow[];
  /** True when the session list was capped (a very large range). */
  truncated: boolean;
}

const fmt = (value: number | null) => (value === null ? "n/a" : `${value}%`);

/**
 * The "what should I fix first" list. Every finding quotes real numbers and is only produced when the sample is large
 * enough; with too little data the only finding is that the data is still being collected.
 */
export function buildFindings(report: BehaviourReport): Finding[] {
  const { sessions } = report;
  const findings: Finding[] = [];

  if (sessions.length < MIN_SAMPLE) {
    return [
      {
        key: "collecting",
        severity: "info",
        title: "Still collecting data",
        detail: `${sessions.length} visitor ${sessions.length === 1 ? "session" : "sessions"} recorded in this period. Findings appear once there are at least ${MIN_SAMPLE}, so no conclusion is drawn from a handful of visits.`,
      },
    ];
  }

  const funnel = buildFunnel(sessions);

  // 1. The single biggest leak between two consecutive steps (only steps with enough people entering).
  let worst: { from: FunnelStep; to: FunnelStep } | null = null;
  for (let i = 1; i < funnel.length; i++) {
    const from = funnel[i - 1];
    const to = funnel[i];
    if (from.count < MIN_SAMPLE || to.continuedPercent === null) continue;
    if (!worst || (to.continuedPercent < (worst.to.continuedPercent ?? 100))) worst = { from, to };
  }
  if (worst && (worst.to.continuedPercent ?? 100) < 50) {
    findings.push({
      key: "biggest-leak",
      severity: "fix",
      title: `Biggest drop: "${worst.from.label}" to "${worst.to.label}"`,
      detail: `Only ${fmt(worst.to.continuedPercent)} of the ${worst.from.count} visitors who reached "${worst.from.label.toLowerCase()}" went on to "${worst.to.label.toLowerCase()}". This is the step where the most buyers are lost.`,
    });
  }

  // 2. Mobile versus desktop, only when both groups are big enough.
  const devices = buildDevices(sessions);
  const mobile = devices.find((d) => d.device === "mobile");
  const desktop = devices.find((d) => d.device === "desktop");
  if (mobile?.connectPercent != null && desktop?.connectPercent != null && desktop.connectPercent > 0 && mobile.connectPercent < desktop.connectPercent * 0.6) {
    findings.push({
      key: "mobile-gap",
      severity: "fix",
      title: "Phone visitors press Connect much less than desktop visitors",
      detail: `${fmt(mobile.connectPercent)} of ${mobile.sessions} phone visitors pressed Connect, against ${fmt(desktop.connectPercent)} of ${desktop.sessions} on desktop. Most buyers are on phones, so this gap costs the most leads.`,
    });
  } else if (mobile && desktop && mobile.sessions + desktop.sessions > 0 && mobile.sessions / (mobile.sessions + desktop.sessions) > 0.6) {
    findings.push({ key: "mobile-majority", severity: "info", title: "Most visitors are on phones", detail: `${Math.round((mobile.sessions / (mobile.sessions + desktop.sessions)) * 100)}% of visitors use a phone. Judge every change on a phone first.` });
  }

  // 3. Pages that lose people quickly.
  const pages = summarisePages(report.pages).filter((p) => p.bouncePercent !== null);
  for (const page of pages.filter((p) => (p.bouncePercent ?? 0) >= 50).slice(0, 2)) {
    findings.push({
      key: `bounce:${page.path}`,
      severity: "look",
      title: `Most visitors leave ${page.path} without reading it`,
      detail: `${fmt(page.bouncePercent)} of ${page.measured} visits left within 5 seconds, scrolled less than a quarter and pressed nothing. The top of this page is not earning attention.`,
    });
  }

  // 4. Developer pages: do people scroll far enough to see more than the top?
  const developerPages = summarisePages(report.pages.filter((p) => p.path.startsWith("/developers/")));
  const measuredDev = developerPages.reduce((n, p) => n + p.measured, 0);
  if (measuredDev >= MIN_SAMPLE) {
    const avgScroll = developerPages.reduce((n, p) => n + (p.avgScrollPercent ?? 0) * p.measured, 0) / measuredDev;
    if (avgScroll < 40) {
      findings.push({
        key: "dev-scroll",
        severity: "look",
        title: "Visitors rarely scroll down developer pages",
        detail: `On average they see only the top ${Math.round(avgScroll)}% of a developer page (${measuredDev} measured visits). Anything important, such as Connect or a video, belongs in the first screen.`,
      });
    }
  }

  // 5. Channels: a big source that produces nothing, and the best performer.
  const channels = buildChannels(sessions);
  const bigDud = channels.find((c) => (c.sharePercent ?? 0) >= 20 && c.sessions >= MIN_SAMPLE && c.leads === 0);
  if (bigDud) {
    findings.push({
      key: `channel-dud:${bigDud.channel}`,
      severity: "fix",
      title: `${bigDud.label} sends ${fmt(bigDud.sharePercent)} of visitors but no enquiries`,
      detail: `${bigDud.sessions} visitors came from ${bigDud.label} and none sent an enquiry. Check the landing page and the targeting for this source.`,
      href: "/admin/acquisition",
    });
  }
  // "Direct / unknown" is excluded: it is not a source you can put more effort into.
  const best = channels.filter((c) => c.channel !== "DIRECT_OR_UNKNOWN" && c.leadPercent !== null && c.leads > 0).sort((a, b) => (b.leadPercent ?? 0) - (a.leadPercent ?? 0))[0];
  if (best) {
    findings.push({
      key: `channel-best:${best.channel}`,
      severity: "good",
      title: `${best.label} is your best-converting source`,
      detail: `${fmt(best.leadPercent)} of its ${best.sessions} visitors sent an enquiry (${best.leads} ${best.leads === 1 ? "lead" : "leads"}). Put more effort here before widening elsewhere.`,
      href: "/admin/acquisition",
    });
  }

  // 6. Sticky bar earning its place.
  const sticky = report.ctas.filter((c) => c.ctaId === "connect_sticky").reduce((n, c) => n + c.clicks, 0);
  const main = report.ctas.filter((c) => c.ctaId === "connect_developer").reduce((n, c) => n + c.clicks, 0);
  if (sticky + main >= MIN_SAMPLE) {
    findings.push({
      key: "sticky",
      severity: sticky > 0 ? "good" : "info",
      title: sticky > 0 ? "The sticky Connect bar is being used" : "Nobody has used the sticky Connect bar",
      detail: `${sticky} of ${sticky + main} Connect presses on developer pages came from the phone sticky bar.`,
    });
  }

  if (findings.length === 0) {
    findings.push({ key: "steady", severity: "good", title: "Nothing stands out as broken", detail: `Across ${sessions.length} visitor sessions no step, device or page crosses the thresholds used here.` });
  }
  const order: Record<Severity, number> = { fix: 0, look: 1, good: 2, info: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
