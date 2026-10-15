/**
 * An instant phone alert for a new enquiry, for the one rule that decides whether ad money turns into a conversation: reach
 * the buyer within minutes. The in-app bell only rings while the workspace is open; this reaches a phone that is locked.
 *
 * Off unless BOTH TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set, so deploying this changes nothing by itself.
 *
 * PRIVACY: the message never contains a name, number or answer. It carries only the channel, the campaign tag and a link to
 * the lead inside the (login-protected) workspace, so no buyer data leaves our systems. Best effort and silent: a failure here
 * never affects the buyer or the saved lead.
 */

export interface InstantAlertConfig {
  token: string;
  chatId: string;
}

export function instantAlertConfigFromEnv(env: Record<string, string | undefined> = process.env): InstantAlertConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(token)) return null;
  if (!chatId || !/^-?\d{5,20}$/.test(chatId)) return null;
  return { token, chatId };
}

export interface InstantAlertInfo {
  leadId: string;
  /** True for a brand-new lead; false when an existing lead enquired again. */
  created: boolean;
  /** Channel name such as "GOOGLE", "META", "WEBSITE". Plain label, no personal data. */
  channel: string;
  campaign?: string | null;
  landingPath?: string | null;
}

const SAFE = /[^A-Za-z0-9 _./:-]/g;
const clean = (value: string | null | undefined, max: number) => (value ?? "").replace(SAFE, "").trim().slice(0, max);

/** The alert text: where it came from and a link. Never personal data. */
export function buildInstantAlertText(info: InstantAlertInfo, siteUrl = "https://developerconnects.com"): string {
  const lines = [
    info.created ? "NEW ENQUIRY: call now" : "Repeat enquiry: call now",
    `Source: ${clean(info.channel, 30) || "Website"}`,
    ...(info.campaign ? [`Campaign: ${clean(info.campaign, 80)}`] : []),
    ...(info.landingPath ? [`Page: ${clean(info.landingPath, 80)}`] : []),
    `${siteUrl}/admin/leads/${encodeURIComponent(info.leadId)}`,
  ];
  return lines.join("\n");
}

export async function sendInstantAlert(
  info: InstantAlertInfo,
  options: { config?: InstantAlertConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const config = options.config === undefined ? instantAlertConfigFromEnv() : options.config;
  if (!config) return false;
  try {
    const response = await (options.fetchImpl ?? fetch)(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: buildInstantAlertText(info), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
