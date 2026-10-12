import Link from "next/link";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { VideoManager } from "@/components/social/video-manager";
import { listAllVideos } from "@/lib/social/db/postgres-social";

export const metadata = { title: "Landing-page videos | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SocialVideosPage() {
  const videos = await listAllVideos().catch(() => null);
  return (
    <div>
      <SectionHeading title="Landing-page videos" description="The videos visitors can swipe through near the bottom of the home page. Mix vertical Reels and horizontal long-form. Tapping one opens your post." />
      <Link href="/admin/social" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
        ← Social analytics
      </Link>
      {videos === null ? <EmptyState title="Could not load the videos" description="The database did not answer, or the latest database update has not been applied. Reload in a moment." /> : <VideoManager videos={videos} />}
    </div>
  );
}
