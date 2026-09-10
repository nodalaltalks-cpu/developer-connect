import type { ReactNode } from "react";
import { statusIcon } from "./platform-health-status-badge";
import type { HealthStatus } from "@/lib/platform-health/types";

export function PlatformHealthCategoryCard({
  title,
  status,
  summary,
  detail,
  facts,
  children,
}: {
  title: string;
  status: HealthStatus;
  summary: string;
  detail: string;
  facts?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-base font-medium text-foreground">
        <span aria-hidden className="mr-1.5">
          {statusIcon(status)}
        </span>
        {summary}
      </p>
      {facts && <div className="mt-3 space-y-1 text-sm text-muted-foreground">{facts}</div>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent-hover">
          View technical details
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        {children}
      </details>
    </div>
  );
}
