"use client";

import { useState, useTransition } from "react";
import { submitTestimonialAction } from "@/app/_actions/testimonial-actions";
import { DISPLAY_MODES, DISPLAY_MODE_LABEL, type DisplayMode } from "@/lib/testimonials/model";

const FIELD = "mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The buyer's form. Honest feedback only: no required rating, no pre-selected score, no wording that asks for praise. */
export function TestimonialForm({ token, defaultName }: { token: string; defaultName: string | null }) {
  const [state, setState] = useState<"form" | "done">("form");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();
  const [permission, setPermission] = useState(false);

  if (state === "done") {
    return (
      <div role="status" className="rounded-xl border border-border p-6">
        <h2 className="font-serif text-2xl font-medium text-foreground">Thank you.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Your note has been received. Nothing is published unless you allowed it and it has been reviewed first.</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          setError(null);
          const res = await submitTestimonialAction(token, {
            name: data.get("name"),
            displayMode: data.get("displayMode"),
            city: data.get("city"),
            country: data.get("country"),
            helpedWith: data.get("helpedWith"),
            experience: data.get("experience"),
            project: data.get("project"),
            rating: data.get("rating"),
            permissionPublish: permission,
          });
          if (res.ok) setState("done");
          else setError({ message: res.error, field: res.field });
        });
      }}
      className="space-y-5"
    >
      <label className="block text-sm font-medium text-foreground">
        Your name
        <input name="name" defaultValue={defaultName ?? ""} maxLength={120} required autoComplete="name" aria-invalid={error?.field === "name"} className={FIELD} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          City
          <input name="city" maxLength={80} autoComplete="address-level2" className={FIELD} />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Country
          <input name="country" maxLength={80} autoComplete="country-name" className={FIELD} />
        </label>
      </div>
      <label className="block text-sm font-medium text-foreground">
        What did Developer Connects help you with?
        <input name="helpedWith" maxLength={500} className={FIELD} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        Project (optional)
        <input name="project" maxLength={120} className={FIELD} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        Your experience, in your own words
        <textarea name="experience" rows={6} maxLength={2000} required aria-invalid={error?.field === "experience"} className={`${FIELD} min-h-32 py-2`} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Honest feedback is what helps, whatever it says.</span>
      </label>
      <label className="block text-sm font-medium text-foreground">
        Rating (optional)
        <select name="rating" defaultValue="" className={FIELD}>
          <option value="">No rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} of 5
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium text-foreground">If this is published, how should your name appear?</legend>
        <select name="displayMode" defaultValue={"FIRST_NAME_LAST_INITIAL" satisfies DisplayMode} className={FIELD} aria-label="How your name appears">
          {DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {DISPLAY_MODE_LABEL[mode]}
            </option>
          ))}
        </select>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-foreground">
          <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-1 size-5 shrink-0" />
          <span>I give Developer Connects permission to publish my words on its website, shown as chosen above. I can ask for it to be removed at any time.</span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">If you leave this unticked, your note is kept privately and is never published.</p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-7 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-auto">
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
