"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deletePostAction,
  revokePriceAction,
  setPostModeAction,
  verifyAvailabilityAction,
  verifyPriceAction,
} from "@/app/admin/_actions/social-automation-actions";
import { LIVE_CONFIRMATION } from "@/lib/social-automation/types";
import { BTN, FIELD, useAction } from "./ui";

const MODE_LABEL: Record<string, string> = { DISABLED: "Disabled", DRY_RUN: "Dry run", LIVE: "Live" };

/** Mode, price/availability verification and delete for one saved post. Verification stamps the server's time, never the browser's. */
export function PostControls({ id, mode, priceText, priceState, availabilityState, canVerifyAvailability }: { id: string; mode: string; priceText: string | null; priceState: string; availabilityState: string; canVerifyAvailability: boolean }) {
  const router = useRouter();
  const { pending, notice, run } = useAction();
  const [phrase, setPhrase] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold text-foreground">Controls</h2>
      {notice && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{notice.text}</p>
      )}

      <div className="mt-3">
        <p className="text-sm font-medium text-foreground">Mode: <span className="font-semibold">{MODE_LABEL[mode] ?? mode}</span></p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={pending || mode === "DISABLED"} onClick={() => run(() => setPostModeAction(id, "DISABLED"), "Disabled. This post is ignored.")} className={BTN}>Disable</button>
          <button type="button" disabled={pending || mode === "DRY_RUN"} onClick={() => run(() => setPostModeAction(id, "DRY_RUN"), "Dry run. Matching comments are recorded but nothing is sent.")} className={BTN}>Dry run</button>
        </div>
        {mode !== "LIVE" && (
          <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">Live sends real private messages and public replies to real people, once the global switch is also on. Type <strong>{LIVE_CONFIRMATION}</strong> to allow it for this post.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={phrase} onChange={(e) => setPhrase(e.target.value)} aria-label="Type the confirmation phrase" autoComplete="off" className={`${FIELD} max-w-[12rem]`} />
              <button type="button" disabled={pending || phrase !== LIVE_CONFIRMATION} onClick={() => run(() => setPostModeAction(id, "LIVE", phrase), "This post is Live.", () => setPhrase(""))} className={BTN}>Set Live</button>
            </div>
          </div>
        )}
        {mode === "LIVE" && <p className="mt-2 text-sm text-amber-900">This post is Live. Switch it to Dry run or Disabled at any time; the global switch stops everything at once.</p>}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Price: {priceState}</p>
        <p className="text-xs text-muted-foreground">Current price on the project: {priceText ?? "none on file"}. Verifying approves exactly this price for automatic messages.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={pending || !priceText} onClick={() => run(() => verifyPriceAction(id), "Price verified and approved for messages.")} className={BTN}>I have checked this price. Verify it.</button>
          <button type="button" disabled={pending} onClick={() => run(() => revokePriceAction(id), "Price approval withdrawn.")} className={BTN}>Withdraw approval</button>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Availability: {availabilityState}</p>
        <button type="button" disabled={pending || !canVerifyAvailability} onClick={() => run(() => verifyAvailabilityAction(id), "Availability verified.")} className={`${BTN} mt-2`}>I have checked availability. Verify it.</button>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {confirmDelete ? (
          <button type="button" disabled={pending} onClick={() => run(() => deletePostAction(id), "Post configuration deleted.", (r) => r.ok && router.push("/admin/social-automation"))} className={`${BTN} border-red-500 bg-red-50 text-red-700`}>Yes, delete this configuration</button>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className={BTN}>Delete configuration</button>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Recorded comments are kept.</p>
      </div>
    </section>
  );
}
