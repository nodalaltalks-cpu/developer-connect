/**
 * Which /team tabs a team member can open. The Founder decides per person.
 *
 * `tabAccess` on a member is NULL by default, which means "the standard tabs and nothing extra". Once the Founder saves
 * a selection it is an explicit list of tab keys. EXTRA tabs (things beyond a person's own work) are never on unless the
 * Founder ticks them. Framework-free: the pages, the menu and the Founder's settings card all read this one list.
 */

export interface TeamTab {
  key: string;
  label: string;
  href: string;
  /** What the Founder is told they are giving. */
  description: string;
}

/** The standard tabs: on for everyone until the Founder switches one off. */
export const STANDARD_TABS: readonly TeamTab[] = [
  { key: "leads", label: "My leads", href: "/team", description: "Their own leads and today's work" },
  { key: "queue", label: "Queue", href: "/team/queue", description: "Their calling queue" },
  { key: "dial", label: "Dial", href: "/team/dial", description: "Dial pad and the Cold Call form" },
  { key: "follow-ups", label: "Follow-ups", href: "/team/follow-ups", description: "Their follow-ups and missed leads" },
  { key: "visits", label: "Visits", href: "/team/visits", description: "Their site visits" },
  { key: "calls", label: "Calls", href: "/team/calls", description: "Their own call history" },
  { key: "performance", label: "My performance", href: "/team/performance", description: "Their own numbers: calls, follow-ups, visits, bookings" },
];

/** Extra access: off unless the Founder ticks it. Read-only. */
export const EXTRA_TABS: readonly TeamTab[] = [
  { key: "team-board", label: "Team board", href: "/team/team-board", description: "Every active employee's calls, follow-ups and open leads (no lead names, no revenue)" },
];

export const ALL_TABS: readonly TeamTab[] = [...STANDARD_TABS, ...EXTRA_TABS];
export const DEFAULT_TAB_KEYS: readonly string[] = STANDARD_TABS.map((t) => t.key);
const ALL_KEYS = new Set(ALL_TABS.map((t) => t.key));

/** The tabs this person can open: the standard set unless the Founder saved a selection. Unknown keys are ignored. */
export function tabsOf(member: { tabAccess?: readonly string[] | null }): string[] {
  if (!member.tabAccess) return [...DEFAULT_TAB_KEYS];
  return member.tabAccess.filter((key) => ALL_KEYS.has(key));
}

export function canUseTab(member: { tabAccess?: readonly string[] | null }, key: string): boolean {
  return tabsOf(member).includes(key);
}

/** Validates a selection from the Founder: known keys only, no duplicates, at least one tab. */
export function cleanTabs(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error("Choose the tabs.");
  const keys = [...new Set(input.filter((k): k is string => typeof k === "string"))];
  if (keys.some((k) => !ALL_KEYS.has(k))) throw new Error("One of those tabs does not exist.");
  if (keys.length === 0) throw new Error("Leave at least one tab on, or block the person instead.");
  return ALL_TABS.map((t) => t.key).filter((k) => keys.includes(k));
}
