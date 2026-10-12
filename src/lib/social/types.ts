export const VIDEO_PLATFORMS = ["INSTAGRAM", "YOUTUBE"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];
export const VIDEO_ORIENTATIONS = ["VERTICAL", "HORIZONTAL"] as const;
export type VideoOrientation = (typeof VIDEO_ORIENTATIONS)[number];

export interface SocialVideo {
  id: string;
  title: string;
  platform: VideoPlatform;
  orientation: VideoOrientation;
  /** Where a click goes: the post on Instagram or the video on YouTube. */
  permalinkUrl: string;
  /** A muted preview clip that plays on its own; without one the poster is shown. */
  mediaUrl: string | null;
  posterUrl: string | null;
  /** The content pillar, so the analytics can say which TYPE of content works. */
  topic: string | null;
  sortOrder: number;
  active: boolean;
}

export type SocialVideoInput = Omit<SocialVideo, "id">;

export const SOCIAL_EVENT_KINDS = ["video_impression", "video_play", "video_click", "carousel_swipe", "link_click", "form_started", "form_submitted"] as const;
export type SocialEventKind = (typeof SOCIAL_EVENT_KINDS)[number];

/** A social event after validation: only allow-listed values, no free text. */
export interface ValidSocialEvent {
  kind: SocialEventKind;
  platform?: VideoPlatform;
  contentId?: string;
  linkKey?: string;
  watchMs?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerHost?: string;
}

export interface SocialSummary {
  videos: Array<{ id: string; title: string; platform: string; orientation: string; topic: string | null; viewers: number; plays: number; clicks: number; avgWatchMs: number }>;
  links: Array<{ key: string; clicks: number }>;
  sources: Array<{ source: string; visitors: number; clicks: number; enquiries: number }>;
  hours: Array<{ hour: number; clicks: number; plays: number }>;
  devices: Array<{ device: string; visitors: number }>;
  funnel: { sawVideo: number; clicked: number; startedForm: number; submittedForm: number };
  enquiriesByFoundVia: Array<{ howFound: string; enquiries: number }>;
  topics: Array<{ topic: string; plays: number; clicks: number }>;
}
