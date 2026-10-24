import Link from "next/link";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { EMPTY_POST, PostForm } from "@/components/social-automation/post-form";
import { getSettings, listProjects } from "@/lib/social-automation/db/postgres-automation";
import { projectLabel } from "@/lib/social-automation/view";

export const metadata = { title: "Add a post | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewAutomationPostPage() {
  const [projects, settings] = await Promise.all([listProjects(), getSettings()]).then(([p, s]) => [p, s] as const).catch(() => [null, null] as const);
  return (
    <div>
      <SectionHeading title="Add a post" description="Set it up before you post the reel: leave the post ID empty and link it after publishing. It starts in Dry run: matching comments are recorded, nothing is sent to anyone." />
      <Link href="/admin/social-automation" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">← Comment-to-DM automation</Link>
      {projects === null || settings === null ? <EmptyState title="Could not load your projects" description="Reload in a moment." /> : <PostForm id={null} initial={EMPTY_POST} commonReply={{ sent: settings.defaultPublicReply, notSent: settings.defaultPublicReplyFallback }} unlinked={[]} projects={projects.map((p) => ({ id: p.id, label: projectLabel(p) }))} />}
    </div>
  );
}
