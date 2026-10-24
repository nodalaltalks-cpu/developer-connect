"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getMyEnquiriesAction, rateEnquiryAction, type EnquiryView } from "@/app/_actions/enquiry-history-actions";
import { COMMENT_MAX, STAR_LABELS } from "@/lib/enquiries/types";

/**
 * "Your enquiries": every time this signed-in buyer reached out (connected with a developer, sent the enquiry form, contacted an
 * advisor), with the day and time, and a 1-to-5 star rating with an optional "what could we do better?" comment on each. It is the
 * buyer's own record; the Founder sees the ratings on the dashboard and is notified the moment one arrives.
 *
 * It re-checks every 15 seconds while the tab is visible, so a new enquiry shows up without a reload, and it never replaces a
 * rating box the person is in the middle of writing.
 */

const POLL_MS = 15_000;

function formatWhen(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) });
}

/** Server and first paint use India time (so they match); after mount the time switches to the visitor's own clock. */
function When({ iso }: { iso: string }) {
  const [text, setText] = useState(() => `${formatWhen(iso, "Asia/Kolkata")} IST`);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the visitor's time zone is only known in the browser
    setText(formatWhen(iso));
  }, [iso]);
  return (
    <time dateTime={iso} className="text-xs text-muted-foreground">
      {text}
    </time>
  );
}

function Star({ filled, size = 22 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={filled ? "text-gold" : "text-field-border"}>
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StaticStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} size={18} />
      ))}
    </span>
  );
}

function RatingForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: EnquiryView;
  onSaved: (next: EnquiryView) => void;
  onCancel: () => void;
}) {
  const [stars, setStars] = useState(entry.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(entry.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = hover || stars;

  function submit() {
    if (stars < 1) {
      setError("Tap a star to rate.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rateEnquiryAction(entry.id, stars, comment);
      if (result.ok) onSaved(result.entry);
      else setError(result.message);
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-4">
      <p id={`rate-${entry.id}`} className="text-sm font-semibold text-foreground">
        How was our service?
      </p>
      <div role="radiogroup" aria-labelledby={`rate-${entry.id}`} className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${STAR_LABELS[n]}`}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            className="flex size-11 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star filled={n <= shown} size={30} />
          </button>
        ))}
        <span className="ml-2 min-w-20 text-sm font-medium text-foreground" aria-live="polite">
          {shown ? STAR_LABELS[shown] : ""}
        </span>
      </div>
      <label htmlFor={`comment-${entry.id}`} className="mt-3 block text-sm font-medium text-foreground">
        What could we do better? <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        id={`comment-${entry.id}`}
        value={comment}
        maxLength={COMMENT_MAX}
        rows={3}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us in your own words. Ambish reads every one."
        className="mt-1.5 block w-full rounded-md border border-field-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="mt-1 text-right text-xs text-muted-foreground">
        {comment.length}/{COMMENT_MAX}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {pending ? "Saving…" : entry.rating ? "Update rating" : "Send rating"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border px-5 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EnquiryHistory({ initial }: { initial: EnquiryView[] }) {
  const [items, setItems] = useState<EnquiryView[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const openRef = useRef<string | null>(null);
  useEffect(() => {
    openRef.current = openId;
  }, [openId]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || openRef.current) return;
    try {
      setItems(await getMyEnquiriesAction());
    } catch {
      // keep what is on screen
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const ratedCount = items.filter((e) => e.rating !== null).length;

  return (
    <section aria-labelledby="enquiries-heading" className="mb-8 rounded-xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="enquiries-heading" className="font-serif text-2xl font-medium text-foreground">
          Your enquiries
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {items.length === 0 ? "None yet" : `${items.length} ${items.length === 1 ? "enquiry" : "enquiries"} · ${ratedCount} rated`}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length === 0 ? "Connect with a developer and it shows here, ready to rate." : "Rate each one. It goes straight to the founder."}
      </p>

      {thanks && (
        <p role="status" className="mt-4 rounded-md border border-border border-l-4 border-l-gold bg-background px-4 py-3 text-sm text-foreground">
          {thanks}
        </p>
      )}

      {items.length === 0 ? null : (
        <ul className="mt-5 divide-y divide-border">
          {items.map((entry) => (
            <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{entry.title}</p>
                  {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
                  <When iso={entry.createdAt} />
                </div>
                {openId !== entry.id && (
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    {entry.rating !== null ? (
                      <>
                        <StaticStars value={entry.rating} />
                        <button
                          type="button"
                          onClick={() => {
                            setThanks(null);
                            setOpenId(entry.id);
                          }}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline"
                        >
                          Change rating
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setThanks(null);
                          setOpenId(entry.id);
                        }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-brass-700/60 bg-background px-4 text-sm font-semibold text-accent-hover hover:border-gold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Star filled={false} size={18} /> Rate this
                      </button>
                    )}
                  </div>
                )}
              </div>
              {entry.rating !== null && entry.comment && openId !== entry.id && (
                <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">&ldquo;{entry.comment}&rdquo;</p>
              )}
              {openId === entry.id && (
                <RatingForm
                  entry={entry}
                  onCancel={() => setOpenId(null)}
                  onSaved={(next) => {
                    setItems((current) => current.map((e) => (e.id === next.id ? next : e)));
                    setOpenId(null);
                    setThanks("Thank you. Your rating has gone straight to the founder, and it helps us get better.");
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
