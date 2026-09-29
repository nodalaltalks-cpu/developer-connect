"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { unlockTrashAction, getTrashForRangeAction } from "@/app/admin/_actions/trash-actions";
import { ContactTrashList } from "@/components/admin/contact-trash-list";
import { buttonClassName } from "@/components/ui/button";
import type { ContactSubmission } from "@/lib/engagement/types";

type Status = "locked" | "checking" | "unlocked";

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-muted-foreground"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * The Founder-only password gate for Trash. Trash's contents are never
 * fetched until the server accepts the password (see unlockTrashAction), so
 * they never reach the browser while locked. State lives only in this
 * component instance: leaving Trash and coming back mounts a fresh gate and
 * asks for the password again.
 *
 * Changing the Founder Dashboard's date range while unlocked re-fetches with
 * the short-lived token from the unlock, without re-prompting. If that token
 * has expired the gate locks again.
 */
export function TrashGate({ rangeKey }: { rangeKey: string }) {
  const [status, setStatus] = useState<Status>("locked");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const lastHandledRangeKeyRef = useRef(rangeKey);

  const lock = useCallback((note: string | null) => {
    tokenRef.current = null;
    setSubmissions([]);
    setPassword("");
    setMessage(note);
    setStatus("locked");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "checking" || !password) return;
    setStatus("checking");
    setMessage(null);
    try {
      const result = await unlockTrashAction(password, rangeKey);
      if (!result.ok) {
        setPassword("");
        setMessage(
          result.reason === "not-configured"
            ? "Trash password isn't configured on the server."
            : "Incorrect password.",
        );
        setStatus("locked");
        return;
      }
      tokenRef.current = result.token;
      setSubmissions(result.submissions);
      setPassword("");
      setStatus("unlocked");
    } catch {
      setMessage("Something went wrong. Please try again.");
      setStatus("locked");
    }
  }

  useEffect(() => {
    if (lastHandledRangeKeyRef.current === rangeKey) return;
    lastHandledRangeKeyRef.current = rangeKey;
    const token = tokenRef.current;
    if (!token) return;

    let cancelled = false;
    setIsRefreshing(true);
    getTrashForRangeAction(token, rangeKey)
      .then((result) => {
        if (!cancelled) setSubmissions(result.submissions);
      })
      .catch(() => {
        if (!cancelled) lock("Session expired. Enter the password again.");
      })
      .finally(() => {
        if (!cancelled) setIsRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeKey, lock]);

  if (status === "unlocked") {
    return (
      <div>
        {isRefreshing && (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            Updating for the selected range…
          </p>
        )}
        {/* ContactTrashList seeds its state from initialSubmissions only on
            mount; keying by rangeKey remounts it when a range change
            replaces `submissions`. */}
        <ContactTrashList key={rangeKey} initialSubmissions={submissions} />
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-8 py-16 text-center"
    >
      <LockIcon />
      <p className="text-sm font-medium text-foreground">Trash is locked</p>
      <p className="max-w-sm text-sm text-muted-foreground">Enter the Trash password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
        autoFocus
        aria-label="Trash password"
        aria-invalid={message ? true : undefined}
        className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      {message && (
        <p className="text-sm text-red-600" role="alert">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "checking" || !password}
        className={buttonClassName("primary", "mt-1")}
      >
        {status === "checking" ? "Checking…" : "Unlock Trash"}
      </button>
    </form>
  );
}
