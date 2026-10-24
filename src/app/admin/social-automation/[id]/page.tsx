import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { PostControls } from "@/components/social-automation/post-controls";
import { PostForm } from "@/components/social-automation/post-form";
import { formatDateTime } from "@/lib/leads/format";
import { getPost, getSettings, listProjects, recentUnlinkedPosts } from "@/lib/social-automation/db/postgres-automation";
import { formatProjectPrice } from "@/lib/social-automation/logic";
import { UUID } from "@/lib/social-automation/input";
import { describeAvailabilityState, describePriceState, previewTriggers, projectLabel, reasonText } from "@/lib/social-automation/view";

export const metadata = { title: "Automation post | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AutomationPostPage({ params }: PageProps<"/admin/social-automation/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const loaded = await Promise.all([getPost(id), getSettings(), listProjects()]).catch(() => null);
  if (loaded === null) {
    return <EmptyState title="Could not load this post" description="The database did not answer. Reload in a moment." />;
  }
  const [post, settings, projects] = loaded;
  if (!post) notFound();
  // A draft has no post ID yet: offer the posts that have already received comments, so linking is one tap, not a hunt for an ID.
  const unlinked = post.config.postId === null ? await recentUnlinkedPosts(post.config.platform).catch(() => []) : [];

  const { config, project, updatedAt } = post;
  const now = new Date();
  const options = projects.map((p) => ({ id: p.id, label: projectLabel(p) }));
  // The post's project may be inactive and so missing from the picker; keep it selectable so saving doesn't silently unlink it.
  if (project && !options.some((o) => o.id === project.id)) options.unshift({ id: project.id, label: `${projectLabel(project)} (inactive)` });
  const previews = previewTriggers(config, project, settings, now);

  return (
    <div className="space-y-6">
      <SectionHeading title={config.videoTitle} description={`Last updated ${formatDateTime(updatedAt)}. Saving changes never changes the mode.`} />
      <Link href="/admin/social-automation" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">← Comment-to-DM automation</Link>

      {config.postId === null && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Draft — not linked to a published post yet.</strong> Everything below is ready, but no comment can reach it. Once the reel is live, paste its post ID in the form below (or tap one of the posts that already received comments) and save. Then you can set it Live.
        </p>
      )}

      <PostControls
        id={config.id}
        mode={config.mode}
        priceText={project ? formatProjectPrice(project) : null}
        priceState={describePriceState(config, project, settings, now)}
        availabilityState={describeAvailabilityState(config, settings, now)}
        canVerifyAvailability={Boolean(config.availabilityText?.trim())}
      />

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">What each keyword would send right now</h2>
        <p className="mt-1 text-sm text-muted-foreground">Built from the same rules a real comment goes through. Nothing is sent from this screen.</p>
        <ul className="mt-3 space-y-3">
          {previews.map(({ keyword, decision }) => (
            <li key={keyword} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">{keyword}</p>
              {decision.action === "SEND" ? (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{decision.text}</p>
                  {decision.usedFallback && <p className="mt-1 text-xs text-amber-800">Safe fallback used — the full message could not be filled: {decision.reasons.map(reasonText).join("; ")}. This enquiry will also be flagged for your follow-up.</p>}
                </>
              ) : (
                <p className="mt-1 text-sm text-red-700">Would NOT send. Goes to your follow-up list: {decision.reasons.map(reasonText).join("; ")}.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <PostForm
        id={config.id}
        commonReply={{ sent: settings.defaultPublicReply, notSent: settings.defaultPublicReplyFallback }}
        unlinked={unlinked.map((u) => ({ postId: u.postId, comments: u.comments, sample: u.sample, lastAt: formatDateTime(u.lastAt) }))}
        projects={options}
        initial={{
          platform: config.platform,
          postId: config.postId ?? "",
          postUrl: config.postUrl ?? "",
          videoTitle: config.videoTitle,
          contentFormat: config.contentFormat,
          projectId: config.projectId ?? "",
          availabilityText: config.availabilityText ?? "",
          approvedDetails: config.approvedDetails ?? "",
          safeFallbackTemplate: config.safeFallbackTemplate ?? "",
          publicReplyTemplate: config.publicReplyTemplate ?? "",
          publicReplyFallbackTemplate: config.publicReplyFallbackTemplate ?? "",
          triggers: config.triggers,
        }}
      />
    </div>
  );
}
