import Link from "next/link";
import type { ReactNode } from "react";

/** A figure. With `href` the whole tile is a link to the list it counts, so one tap shows exactly those records. */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  /** "green" marks something new that needs picking up. */
  tone?: "green";
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const colour = tone === "green" ? "border-green-400 bg-green-50" : "border-border";
  if (!href) return <div className={`rounded-lg border p-4 ${colour}`}>{body}</div>;
  return (
    <Link href={href} className={`block rounded-lg border p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${colour}`}>
      {body}
    </Link>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}
