/**
 * The analytics vocabulary: ONE list of event names, ONE list of allowed parameters, and the cleaning rules every event passes
 * through before it can leave the browser for Google Analytics or Meta.
 *
 * Nothing personal is ever sent. A parameter is dropped unless its key is on the list, a value is dropped if it looks like an
 * email address, a phone number or a URL, and long text is cut. So a developer name or a city can travel; a buyer's details cannot.
 */

export const ANALYTICS_EVENTS = [
  "page_view",
  "search",
  "view_item_list",
  "select_item",
  "view_item",
  "generate_lead",
  "qualify_lead",
  "working_lead",
  "close_convert_lead",
  "login",
  "sign_up",
  "share",
  "contact",
  "whatsapp_click",
  "email_click",
  "advisor_click",
  "developer_view",
  "project_view",
  "save_project",
  "save_developer",
  "profile_completion",
  "site_visit_request",
  "booking",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ALLOWED_PARAMS = ["market", "region", "developer", "developer_slug", "project", "page_type", "cta", "channel", "location", "method", "source", "step", "item_list_name"] as const;
export type AnalyticsParams = Partial<Record<(typeof ALLOWED_PARAMS)[number], string | number>>;

const MAX_VALUE = 60;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(?:\+?\d[\s().-]*){8,}/;
const URL_LIKE = /https?:\/\/|www\./i;

export function isAnalyticsEvent(name: unknown): name is AnalyticsEventName {
  return typeof name === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

/** Returns only allowed, short, non-personal parameters. Never throws. */
export function cleanParams(input: Record<string, unknown> | undefined): AnalyticsParams {
  const out: AnalyticsParams = {};
  if (!input) return out;
  for (const key of ALLOWED_PARAMS) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "string") {
      const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
      if (text && !EMAIL.test(text) && !PHONE.test(text) && !URL_LIKE.test(text)) out[key] = text;
    }
  }
  return out;
}

/** The first-party click ids (data-cta) that are also analytics events. Anything not here is not sent to GA or Meta. */
export const CTA_EVENTS: Record<string, { event: AnalyticsEventName; channel?: string }> = {
  advisor_open: { event: "advisor_click" },
  advisor_whatsapp: { event: "whatsapp_click", channel: "whatsapp" },
  advisor_email: { event: "email_click", channel: "email" },
  advisor_call: { event: "contact", channel: "phone" },
  advisor_linkedin: { event: "contact", channel: "linkedin" },
  whatsapp_share: { event: "share", channel: "whatsapp" },
  email_share: { event: "share", channel: "email" },
  copy_link: { event: "share", channel: "copy_link" },
  native_share: { event: "share", channel: "native" },
  connect_developer: { event: "advisor_click", channel: "connect_form" },
  connect_card: { event: "advisor_click", channel: "connect_form" },
};

/** Meta standard events for ours. A name missing here is simply not sent to Meta. */
export const META_EVENT: Partial<Record<AnalyticsEventName, string>> = {
  page_view: "PageView",
  search: "Search",
  developer_view: "ViewContent",
  view_item: "ViewContent",
  project_view: "ViewContent",
  advisor_click: "Contact",
  whatsapp_click: "Contact",
  email_click: "Contact",
  contact: "Contact",
  generate_lead: "Lead",
  site_visit_request: "Schedule",
};

/** An id shared by the browser pixel and the server event so Meta counts one conversion once. */
export function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

/** The market of a path, for the `market` parameter. Only what the address already says. */
export function marketOfPath(pathname: string): "mumbai" | "dubai" | undefined {
  const p = pathname.toLowerCase();
  return p.includes("mumbai") ? "mumbai" : p.includes("dubai") ? "dubai" : undefined;
}

export function pageTypeOfPath(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/developers/")) return "developer";
  if (pathname === "/developers") return "directory";
  if (pathname.startsWith("/buy-direct-from-developer")) return "guide";
  if (pathname.startsWith("/advisor")) return "advisor";
  if (pathname.startsWith("/about")) return "about";
  if (pathname.startsWith("/contact")) return "contact";
  return "other";
}
