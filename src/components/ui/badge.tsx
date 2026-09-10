import { HTMLAttributes } from "react";

export function Badge({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-accent-soft px-3 py-1 text-xs font-medium text-accent-hover ${className}`}
      {...props}
    />
  );
}
