import { VIDEO_ORIENTATIONS, VIDEO_PLATFORMS, type SocialVideoInput, type VideoOrientation, type VideoPlatform } from "./types.ts";

/**
 * Validates a video the Founder adds. The permalink must really be on the platform it claims (so the landing page can only ever
 * send visitors to Instagram or YouTube), and the preview clip and thumbnail must be https links or a file under /social/ on this
 * site. Nothing else is accepted: no other host, no javascript: or data: address.
 */

export type VideoValidation = { ok: true; value: SocialVideoInput } | { ok: false; field: string; message: string };

const HOSTS: Record<VideoPlatform, RegExp> = {
  INSTAGRAM: /^(www\.)?instagram\.com$/i,
  YOUTUBE: /^((www|m)\.)?youtube\.com$|^youtu\.be$/i,
};

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** An https link, or a path to a file the site itself serves under /social/. */
function mediaRef(value: string, extensions: RegExp): string | null {
  const v = value.trim();
  if (v.startsWith("/social/") && !v.includes("..") && !v.includes("//") && extensions.test(v)) return v;
  const url = httpsUrl(v);
  return url && extensions.test(url.pathname) ? url.toString() : null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateVideoInput(raw: Record<string, unknown>): VideoValidation {
  const title = text(raw.title, 100);
  if (title.length < 2) return { ok: false, field: "title", message: "Give the video a title." };
  if (!(VIDEO_PLATFORMS as readonly string[]).includes(String(raw.platform))) return { ok: false, field: "platform", message: "Choose Instagram or YouTube." };
  if (!(VIDEO_ORIENTATIONS as readonly string[]).includes(String(raw.orientation))) return { ok: false, field: "orientation", message: "Choose vertical or horizontal." };
  const platform = raw.platform as VideoPlatform;
  const orientation = raw.orientation as VideoOrientation;

  const link = httpsUrl(text(raw.permalinkUrl, 500));
  if (!link || !HOSTS[platform].test(link.hostname)) return { ok: false, field: "permalinkUrl", message: `Paste the ${platform === "INSTAGRAM" ? "Instagram" : "YouTube"} link to this video (it must start with https://).` };

  const mediaText = text(raw.mediaUrl, 500);
  const posterText = text(raw.posterUrl, 500);
  const mediaUrl = mediaText ? mediaRef(mediaText, /\.(mp4|webm|mov)$/i) : null;
  if (mediaText && !mediaUrl) return { ok: false, field: "mediaUrl", message: "The preview clip must be an https link or a file in /social/ ending in .mp4, .webm or .mov." };
  const posterUrl = posterText ? mediaRef(posterText, /\.(jpe?g|png|webp)$/i) : null;
  if (posterText && !posterUrl) return { ok: false, field: "posterUrl", message: "The thumbnail must be an https link or a file in /social/ ending in .jpg, .png or .webp." };

  const sort = Number(raw.sortOrder ?? 0);
  return {
    ok: true,
    value: {
      title,
      platform,
      orientation,
      permalinkUrl: link.toString(),
      mediaUrl,
      posterUrl,
      topic: text(raw.topic, 40) || null,
      sortOrder: Number.isInteger(sort) && sort >= 0 && sort <= 9999 ? sort : 0,
      active: raw.active === undefined ? true : raw.active === true || raw.active === "true" || raw.active === "on",
    },
  };
}
