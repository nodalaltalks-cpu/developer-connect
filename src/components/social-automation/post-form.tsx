"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePostAction } from "@/app/admin/_actions/social-automation-actions";
import { DEFAULT_PUBLIC_REPLY } from "@/lib/social-automation/logic";
import { AREA, FIELD, PRIMARY, BTN, useAction } from "./ui";

export interface ProjectOption {
  id: string;
  label: string;
}

export interface PostFormValues {
  platform: string;
  postId: string;
  postUrl: string;
  videoTitle: string;
  contentFormat: string;
  projectId: string;
  availabilityText: string;
  approvedDetails: string;
  safeFallbackTemplate: string;
  publicReplyTemplate: string;
  publicReplyFallbackTemplate: string;
  triggers: Array<{ keyword: string; intent: string; dmTemplate: string }>;
}

const INTENT_LABEL: Record<string, string> = { PRICE: "Price", LOCATION: "Location", DETAILS: "Details", BROCHURE: "Brochure", VISIT: "Visit", AVAILABILITY: "Availability", OTHER: "Other" };

/** Editable starting points, not fixed responses: every one can be changed or removed. */
const EXAMPLES: Record<string, { keyword: string; intent: string; dmTemplate: string }> = {
  PRICE: { keyword: "PRICE", intent: "PRICE", dmTemplate: "Hi! Thanks for your interest in [Property Name] in [Location]. The asking price currently listed is [Verified Price]. Would you like more details?" },
  LOCATION: { keyword: "LOCATION", intent: "LOCATION", dmTemplate: "Hi! Thanks for your interest in [Property Name]. It is located in [Verified Location]. Let me know if you'd like to know more." },
  DETAILS: { keyword: "DETAILS", intent: "DETAILS", dmTemplate: "Hi! Thanks for enquiring about [Property Name]. Here are the details I can confirm: [Approved Details]. What else would you like to know?" },
  VISIT: { keyword: "VISIT", intent: "VISIT", dmTemplate: "Hi! Thanks for your interest in [Property Name]. I can help you check the available viewing arrangements. What day would suit you?" },
};

export const EMPTY_POST: PostFormValues = {
  platform: "INSTAGRAM",
  postId: "",
  postUrl: "",
  videoTitle: "",
  contentFormat: "REEL",
  projectId: "",
  availabilityText: "",
  approvedDetails: "",
  safeFallbackTemplate: "Hi! Thanks for your interest in [Property Name] in [Location]. I'll personally get back to you with the details shortly.",
  publicReplyTemplate: "",
  publicReplyFallbackTemplate: "",
  triggers: [EXAMPLES.PRICE],
};

/** Create or edit one post's configuration. Saving never changes the mode: a new post is Dry run. */
export function PostForm({
  id,
  initial,
  projects,
  commonReply,
  unlinked,
}: {
  id: string | null;
  initial: PostFormValues;
  projects: ProjectOption[];
  /** The common public replies from the settings, shown as the wording used when this post does not write its own. */
  commonReply: { sent: string | null; notSent: string | null };
  /** Posts that already received comments but have no configuration: tap one to link it. */
  unlinked: Array<{ postId: string; comments: number; sample: string | null; lastAt: string }>;
}) {
  const router = useRouter();
  const { pending, notice, run } = useAction();
  const [form, setForm] = useState<PostFormValues>(initial);
  const set = <K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setTrigger = (index: number, patch: Partial<PostFormValues["triggers"][number]>) => set("triggers", form.triggers.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => savePostAction(id, { ...form, projectId: form.projectId || null }),
          id ? "Saved." : form.postId.trim() ? "Post added in Dry run. Nothing will be sent until you set it Live." : "Draft saved. Link the published post after you upload the reel.",
          (result) => {
            if (result.ok && !id && result.id) router.push(`/admin/social-automation/${result.id}`);
          },
        );
      }}
    >
      {notice && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{notice.text}</p>
      )}

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">The post</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Platform
            <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={`${FIELD} mt-1`}>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Content format
            <select value={form.contentFormat} onChange={(e) => set("contentFormat", e.target.value)} className={`${FIELD} mt-1`}>
              <option value="REEL">Reel</option>
              <option value="POST">Post</option>
              <option value="VIDEO">Video</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Post ID (leave empty until the reel is published)
            <input value={form.postId} onChange={(e) => set("postId", e.target.value)} maxLength={100} autoComplete="off" className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Post link
            <input type="url" inputMode="url" placeholder="https://www.instagram.com/reel/…" value={form.postUrl} onChange={(e) => set("postUrl", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground sm:col-span-2">
            Video title
            <input required value={form.videoTitle} onChange={(e) => set("videoTitle", e.target.value)} maxLength={120} className={`${FIELD} mt-1`} />
          </label>
        </div>
        {form.postId.trim() === "" && (
          <p className="mt-3 text-sm text-muted-foreground">
            Saved as a <strong>draft</strong>: it can be fully set up now but receives nothing until you link the published post.
          </p>
        )}
        {form.postId.trim() === "" && unlinked.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-foreground">Posts that already received comments — is yours one of these?</p>
            <ul className="mt-2 space-y-2">
              {unlinked.map((u) => (
                <li key={u.postId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    <span className="font-mono">{u.postId}</span> · {u.comments} comment{u.comments === 1 ? "" : "s"} · last {u.lastAt}
                    {u.sample ? <> · &ldquo;{u.sample.slice(0, 60)}&rdquo;</> : null}
                  </span>
                  <button type="button" className={BTN} onClick={() => set("postId", u.postId)}>Use this post</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">The property</h2>
        <p className="mt-1 text-sm text-muted-foreground">Name, location and price come from your Projects list, so they are never typed twice. Changing the project clears the price and availability verification.</p>
        <label className="mt-3 block text-sm font-medium text-foreground">
          Project
          <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={`${FIELD} mt-1`}>
            <option value="">— choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium text-foreground">
          Availability you can currently confirm (optional)
          <input value={form.availabilityText} onChange={(e) => set("availabilityText", e.target.value)} maxLength={200} placeholder="e.g. 2 and 3 BHK units available" className={`${FIELD} mt-1`} />
        </label>
        <label className="mt-3 block text-sm font-medium text-foreground">
          Approved details (only facts you can confirm)
          <textarea value={form.approvedDetails} onChange={(e) => set("approvedDetails", e.target.value)} maxLength={800} rows={3} className={`${AREA} mt-1`} />
        </label>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">Triggers and private messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A comment containing the keyword as a whole word sends that message. You can use [Property Name], [Location], [Verified Price], [Availability] and [Approved Details]. If a fact is missing or out of date the message is not sent with a gap: your safe fallback is used, or the comment goes to your follow-up list.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.keys(EXAMPLES).map((key) => (
            <button key={key} type="button" className={BTN} disabled={form.triggers.some((t) => t.keyword === key) || form.triggers.length >= 12} onClick={() => set("triggers", [...form.triggers, EXAMPLES[key]])}>
              + {key} example
            </button>
          ))}
          <button type="button" className={BTN} disabled={form.triggers.length >= 12} onClick={() => set("triggers", [...form.triggers, { keyword: "", intent: "OTHER", dmTemplate: "" }])}>
            + Blank trigger
          </button>
        </div>
        <ul className="mt-4 space-y-4">
          {form.triggers.map((t, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  Keyword
                  <input value={t.keyword} onChange={(e) => setTrigger(i, { keyword: e.target.value.toUpperCase() })} maxLength={30} autoComplete="off" className={`${FIELD} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  They are asking for
                  <select value={t.intent} onChange={(e) => setTrigger(i, { intent: e.target.value })} className={`${FIELD} mt-1`}>
                    {Object.entries(INTENT_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-sm font-medium text-foreground">
                Private message
                <textarea value={t.dmTemplate} onChange={(e) => setTrigger(i, { dmTemplate: e.target.value })} maxLength={900} rows={3} className={`${AREA} mt-1`} />
              </label>
              <button type="button" className={`${BTN} mt-2`} disabled={form.triggers.length <= 1} onClick={() => set("triggers", form.triggers.filter((_, j) => j !== i))}>
                Remove this trigger
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-4 block text-sm font-medium text-foreground">
          Safe fallback message (uses only [Property Name] and [Location])
          <textarea value={form.safeFallbackTemplate} onChange={(e) => set("safeFallbackTemplate", e.target.value)} maxLength={900} rows={2} className={`${AREA} mt-1`} />
        </label>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">Public comment reply</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leave these empty to use your common reply (set once on the main automation page). Write something here only if this post needs different wording.</p>
        <label className="mt-3 block text-sm font-medium text-foreground">
          When the private message was sent
          <textarea value={form.publicReplyTemplate} onChange={(e) => set("publicReplyTemplate", e.target.value)} maxLength={300} rows={2} placeholder={commonReply.sent ?? DEFAULT_PUBLIC_REPLY} className={`${AREA} mt-1`} />
        </label>
        <label className="mt-3 block text-sm font-medium text-foreground">
          When it could not be sent (must not mention a DM; leave empty for no public reply)
          <textarea value={form.publicReplyFallbackTemplate} onChange={(e) => set("publicReplyFallbackTemplate", e.target.value)} maxLength={300} rows={2} placeholder={commonReply.notSent ?? "(no public reply will be posted)"} className={`${AREA} mt-1`} />
        </label>
      </section>

      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Saving…" : id ? "Save changes" : form.postId.trim() ? "Add post (Dry run)" : "Save as draft"}
      </button>
    </form>
  );
}
