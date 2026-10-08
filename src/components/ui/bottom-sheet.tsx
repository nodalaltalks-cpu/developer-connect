"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A bottom sheet on phones, a centred dialog from `sm` up. Built on the native <dialog>: the browser traps focus inside,
 * Esc closes it, and the page behind cannot be tabbed into. On top of that:
 *
 *  - SAFE AREAS: bottom padding includes env(safe-area-inset-bottom) so nothing hides under the home indicator.
 *  - KEYBOARD: the sheet is capped at 90dvh (dynamic viewport, so it shrinks when the on-screen keyboard opens) and
 *    scrolls inside, so a focused field and the primary action stay reachable.
 *  - BACK BUTTON: opening pushes a history entry, so the device/browser Back button closes the sheet instead of leaving
 *    the page; closing with the X, the backdrop or Esc removes that entry again.
 *  - REDUCED MOTION: the slide-in only runs when the user has not asked for less motion.
 */

export function BottomSheet({ open, onClose, title, children, describedBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; describedBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pushed = useRef(false);

  const finish = useCallback(() => {
    // Remove the history entry we added, unless Back already did.
    if (pushed.current) {
      pushed.current = false;
      history.back();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      history.pushState({ sheet: titleId }, "");
      pushed.current = true;
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, titleId]);

  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      // The Back button was pressed: our entry is already gone.
      pushed.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      onClick={(e) => {
        if (e.target === ref.current) finish(); // a tap on the backdrop
      }}
      className="fixed inset-0 m-0 mt-auto h-auto max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40 motion-safe:animate-[sheet-in_180ms_ease-out] sm:m-auto sm:max-h-[85dvh] sm:max-w-md sm:rounded-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
        <h2 id={titleId} className="min-w-0 truncate text-base font-semibold tracking-tight">
          {title}
        </h2>
        <button type="button" onClick={finish} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl leading-none text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
    </dialog>
  );
}
