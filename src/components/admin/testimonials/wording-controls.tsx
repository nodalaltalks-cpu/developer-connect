"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordClientFeedbackAction, setTestimonialWordingAction } from "@/app/admin/_actions/testimonial-actions";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const FIELD = "mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Record feedback a real client gave another way (WhatsApp, email). Paste their words exactly. Give a name, title or company ONLY if the
 * client provided it and allowed it to be shown; leave anything they did not give blank and it stays anonymous.
 */
export function FeedbackEntryForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section aria-label="Record client feedback" className="rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">Record feedback a client gave you directly</h2>
      <p className="mt-1 text-sm text-muted-foreground">Paste their words exactly as they wrote or said them. You will choose what is published, and approve it, afterwards.</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          start(async () => {
            setError(null);
            setSaved(false);
            const res = await recordClientFeedbackAction({
              originalText: String(data.get("originalText") ?? ""),
              name: String(data.get("name") ?? ""),
              displayMode: String(data.get("displayMode") ?? "ANONYMOUS"),
              attributionDetail: String(data.get("attributionDetail") ?? ""),
              city: String(data.get("city") ?? ""),
              country: String(data.get("country") ?? ""),
              helpedWith: String(data.get("helpedWith") ?? ""),
              project: String(data.get("project") ?? ""),
              permissionPublish: permission,
            });
            if (res.ok) {
              form.reset();
              setPermission(false);
              setSaved(true);
              router.refresh();
            } else setError(res.error);
          });
        }}
      >
        <label className="block text-sm font-medium text-foreground">
          The client&apos;s own words
          <textarea name="originalText" rows={5} maxLength={2000} required className={`${FIELD} min-h-28 py-2`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Their name (only if given)
            <input name="name" maxLength={120} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Title or company (only if given and allowed)
            <input name="attributionDetail" maxLength={160} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            City (only if given)
            <input name="city" maxLength={80} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Country (only if given)
            <input name="country" maxLength={80} className={FIELD} />
          </label>
        </div>
        <label className="block text-sm font-medium text-foreground">
          What it was about (only if clear from their words)
          <input name="helpedWith" maxLength={500} className={FIELD} />
        </label>
        <input type="hidden" name="project" value="" />
        <label className="block text-sm font-medium text-foreground">
          How their name may appear
          <select name="displayMode" defaultValue="ANONYMOUS" className={FIELD}>
            <option value="ANONYMOUS">Anonymous</option>
            <option value="FIRST_NAME_ONLY">First name only</option>
            <option value="FIRST_NAME_LAST_INITIAL">First name and last initial</option>
            <option value="FULL_NAME">Full name</option>
          </select>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
          <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-1 size-5 shrink-0" />
          <span>The client agreed that this may be published, shown as chosen above.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-green-800">
            Saved. It is now under Received, waiting for you to choose the wording.
          </p>
        )}
        <button type="submit" disabled={pending} className={PRIMARY}>
          Save feedback
        </button>
      </form>
    </section>
  );
}

/** What gets published: the client's exact words, or a paraphrase you have confirmed is faithful (never shown in quotation marks). */
export function WordingEditor({ id, original, current, paraphrased }: { id: string; original: string; current: string | null; paraphrased: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"verbatim" | "paraphrase">(paraphrased ? "paraphrase" : "verbatim");
  const [text, setText] = useState(paraphrased && current ? current : "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className={BTN} onClick={() => setOpen(true)}>
        {current ? "Change published wording" : "Choose published wording"}
      </button>
    );
  }
  return (
    <div className="mt-2 w-full space-y-3 rounded-lg bg-muted p-3">
      <fieldset>
        <legend className="text-sm font-medium text-foreground">Publish</legend>
        <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input type="radio" name={`mode-${id}`} checked={mode === "verbatim"} onChange={() => setMode("verbatim")} className="size-5" />
          The client&apos;s own words, exactly as given
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input type="radio" name={`mode-${id}`} checked={mode === "paraphrase"} onChange={() => setMode("paraphrase")} className="size-5" />
          A faithful paraphrase I have written
        </label>
      </fieldset>
      {mode === "paraphrase" && (
        <>
          <label className="block text-sm font-medium text-foreground">
            Paraphrase (shown without quotation marks)
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className={`${FIELD} min-h-24 py-2`} />
          </label>
          <p className="text-xs text-muted-foreground">Keep the meaning and the strength of feeling. Add no fact, name, number or result that the client did not give. Original for reference: {original}</p>
          <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-5 shrink-0" />
            <span>I have checked that this paraphrase is faithful to what the client said and is not stronger than it.</span>
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className={PRIMARY}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await setTestimonialWordingAction(id, { text, paraphrased: mode === "paraphrase", confirmedFaithful: confirmed });
              if (res.ok) {
                setOpen(false);
                router.refresh();
              } else setError(res.error);
            })
          }
        >
          Save wording
        </button>
        <button type="button" className={BTN} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
