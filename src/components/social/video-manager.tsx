"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addVideoAction, deleteVideoAction, setVideoActiveAction, setVideoOrderAction } from "@/app/admin/_actions/social-actions";
import type { SocialVideo } from "@/lib/social/types";

const FIELD = "min-h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";
const TOPICS = ["Market update", "Project walkthrough", "Investor tip", "Buyer mistake", "Client story", "Dubai vs Mumbai", "Q&A"];

/** Founder: add a video (paste its Instagram or YouTube link and a preview clip), reorder, hide or remove it. */
export function VideoManager({ videos }: { videos: SocialVideo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", platform: "INSTAGRAM", orientation: "VERTICAL", permalinkUrl: "", mediaUrl: "", posterUrl: "", topic: "", sortOrder: "0" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function run(job: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setMessage(null);
    start(async () => {
      const result = await job().catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      if (result.ok) {
        setMessage({ tone: "ok", text: okText });
        router.refresh();
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <div>
      {message && (
        <p role="status" className={`mb-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      <form
        className="rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addVideoAction({ ...form, sortOrder: Number(form.sortOrder) || 0, active: true }), "Video added. It is now on the landing page.");
          setForm((f) => ({ ...f, title: "", permalinkUrl: "", mediaUrl: "", posterUrl: "" }));
        }}
      >
        <h2 className="text-lg font-semibold text-foreground">Add a video</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground sm:col-span-2">
            Title (shown on the card)
            <input required value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={100} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Where it lives
            <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={`${FIELD} mt-1`}>
              <option value="INSTAGRAM">Instagram</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Shape
            <select value={form.orientation} onChange={(e) => set("orientation", e.target.value)} className={`${FIELD} mt-1`}>
              <option value="VERTICAL">Vertical (Reel / Short)</option>
              <option value="HORIZONTAL">Horizontal (long-form)</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground sm:col-span-2">
            Link to the post or video (visitors land here when they tap)
            <input required type="url" inputMode="url" placeholder="https://www.instagram.com/reel/…" value={form.permalinkUrl} onChange={(e) => set("permalinkUrl", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground sm:col-span-2">
            Preview clip that plays by itself (optional)
            <input placeholder="https://… .mp4  or  /social/my-reel.mp4" value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground sm:col-span-2">
            Thumbnail picture (optional)
            <input placeholder="https://… .jpg  or  /social/my-reel.jpg" value={form.posterUrl} onChange={(e) => set("posterUrl", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Content type (so analytics can compare types)
            <input list="social-topics" value={form.topic} onChange={(e) => set("topic", e.target.value)} maxLength={40} className={`${FIELD} mt-1`} />
            <datalist id="social-topics">
              {TOPICS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Position (0 = first)
            <input type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
        </div>
        <button type="submit" disabled={pending} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
          {pending ? "Saving…" : "Add to landing page"}
        </button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Instagram does not let a website play a Reel by itself, so the card plays a short muted preview clip of your own and the tap opens the real post. Export the clip (about 10 to 20 seconds, under 8 MB) and either paste a link to it or send the file to be placed in /social/.
        </p>
      </form>

      <h2 className="mt-8 text-lg font-semibold text-foreground">On the landing page ({videos.filter((v) => v.active).length} showing, {videos.length} in total)</h2>
      {videos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No videos yet. The section stays hidden until you add one.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {videos.map((v) => (
            <li key={v.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${v.active ? "border-border" : "border-dashed border-border opacity-70"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                <p className="text-xs text-muted-foreground">
                  {v.platform === "INSTAGRAM" ? "Instagram" : "YouTube"} · {v.orientation === "VERTICAL" ? "vertical" : "horizontal"} · {v.topic ?? "no content type"} · {v.mediaUrl ? "plays a preview" : "thumbnail only"}
                </p>
              </div>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Position
                <input type="number" min={0} max={9999} defaultValue={v.sortOrder} disabled={pending} onBlur={(e) => Number(e.target.value) !== v.sortOrder && run(() => setVideoOrderAction(v.id, Number(e.target.value)), "Order updated.")} className="min-h-11 w-20 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
              </label>
              <button type="button" disabled={pending} onClick={() => run(() => setVideoActiveAction(v.id, !v.active), v.active ? "Hidden from the landing page." : "Showing on the landing page.")} className={BTN}>
                {v.active ? "Hide" : "Show"}
              </button>
              {confirming === v.id ? (
                <button type="button" disabled={pending} onClick={() => { setConfirming(null); run(() => deleteVideoAction(v.id), "Video removed."); }} className={`${BTN} border-red-500 bg-red-50 text-red-700`}>
                  Yes, delete it
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => setConfirming(v.id)} className={BTN}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
