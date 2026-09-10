import type { HealthStatus } from "@/lib/platform-health/types";

const STATUS_CONFIG: Record<HealthStatus, { icon: string; label: string; textClass: string }> = {
  HEALTHY: { icon: "🟢", label: "Everything looks good", textClass: "text-green-700" },
  NEEDS_ATTENTION: { icon: "🟡", label: "Something needs attention", textClass: "text-amber-700" },
  ACTION_REQUIRED: { icon: "🔴", label: "Action required", textClass: "text-red-700" },
  NOT_MEASURED: { icon: "⚪", label: "Not currently measured", textClass: "text-muted-foreground" },
};

export function PlatformHealthStatusBadge({
  status,
  size = "md",
}: {
  status: HealthStatus;
  size?: "sm" | "md";
}) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${config.textClass} ${
        size === "md" ? "text-lg" : "text-sm"
      }`}
    >
      <span aria-hidden>{config.icon}</span>
      {config.label}
    </span>
  );
}

export function statusLabel(status: HealthStatus): string {
  return STATUS_CONFIG[status].label;
}

export function statusIcon(status: HealthStatus): string {
  return STATUS_CONFIG[status].icon;
}
