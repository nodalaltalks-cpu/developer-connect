"use client";

import { useState, useTransition } from "react";

/**
 * A small inline status dropdown shared by /admin/reports and
 * /admin/contact — updates via the given Server Action and reflects the
 * saved value from ITS return, not an optimistic local guess, so a failed
 * save never silently shows the wrong status (same reasoning as
 * DeveloperEditForm elsewhere in this codebase).
 */
export function EngagementStatusSelect<S extends string>({
  id,
  status,
  options,
  action,
}: {
  id: string;
  status: S;
  options: readonly S[];
  action: (id: string, status: S) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: S) {
    setError(null);
    const previous = current;
    startTransition(async () => {
      const result = await action(id, next);
      if (result.ok) {
        setCurrent(next);
      } else {
        setCurrent(previous);
        setError(result.error ?? "Could not update status.");
      }
    });
  }

  return (
    <div>
      <select
        aria-label="Status"
        value={current}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value as S)}
        className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
