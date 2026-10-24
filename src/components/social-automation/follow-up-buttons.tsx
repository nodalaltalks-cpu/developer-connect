"use client";

import { setFollowUpAction } from "@/app/admin/_actions/social-automation-actions";
import { BTN, useAction } from "./ui";

/** Marks an enquiry that needs a personal reply as handled or dismissed. */
export function FollowUpButtons({ eventId }: { eventId: string }) {
  const { pending, notice, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => setFollowUpAction(eventId, "DONE"), "Marked done.")} className={BTN}>Done</button>
      <button type="button" disabled={pending} onClick={() => run(() => setFollowUpAction(eventId, "DISMISSED"), "Dismissed.")} className={BTN}>Dismiss</button>
      {notice?.tone === "error" && <span role="status" className="text-xs text-red-700">{notice.text}</span>}
    </span>
  );
}
