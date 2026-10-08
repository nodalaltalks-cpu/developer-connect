"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * One comment box for everything done on a lead page. Whatever you press next (an outcome, a qualification, a follow-up done, moved or
 * set) is saved together with this comment, with the date, time and day. Without a comment those buttons refuse and nothing changes.
 * Components outside a lead page (the dial pad, the calling queue) have no provider and show their own comment field instead.
 */

interface CommentState {
  comment: string;
  setComment: (value: string) => void;
  /** Called after an update succeeded: the comment has been saved with it. */
  clear: () => void;
}

const CommentCtx = createContext<CommentState | null>(null);

export function InteractionCommentProvider({ children }: { children: ReactNode }) {
  const [comment, setComment] = useState("");
  const clear = useCallback(() => setComment(""), []);
  const value = useMemo(() => ({ comment, setComment, clear }), [comment, clear]);
  return <CommentCtx.Provider value={value}>{children}</CommentCtx.Provider>;
}

/** The shared comment, or null when there is no provider above (then the caller shows its own field). */
export function useInteractionComment(): CommentState | null {
  return useContext(CommentCtx);
}

const FIELD = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CommentBox({ label = "Comment on this interaction", help = "Required. Saved with the date, time and day. The lead is not updated without it." }: { label?: string; help?: string }) {
  const state = useInteractionComment();
  if (!state) return null;
  return (
    <div className="rounded-xl border border-accent/40 bg-accent-soft/50 p-3">
      <label className="block text-sm font-semibold text-foreground">
        {label} <span className="font-normal text-red-700">(required)</span>
        <textarea value={state.comment} onChange={(e) => state.setComment(e.target.value)} rows={3} maxLength={2000} placeholder="What was said, what the client wants, what happens next" className={FIELD} />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
