import { listActiveVideos } from "@/lib/social/db/postgres-social";
import { SOCIAL_LINKS } from "@/lib/social/links";
import { VideoStrip } from "./video-strip";

/** Server wrapper: fetches the Founder's active videos. A database problem simply hides the section; it never breaks the page. */
export async function SocialVideoSection() {
  const videos = await listActiveVideos().catch(() => []);
  const instagram = SOCIAL_LINKS.find((l) => l.key === "instagram")?.url ?? null;
  return <VideoStrip videos={videos} followUrl={instagram} />;
}
