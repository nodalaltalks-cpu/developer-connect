import { formatEnumLabel } from "@/lib/leads/format";
import type { LeadStatus, LeadTemperature } from "@/lib/leads/types";

/** Restrained palette, same as the Contact screens: no gradients, colour only where it carries meaning. */
const TEMPERATURE_CLASS: Record<LeadTemperature, string> = {
  HOT: "bg-red-50 text-red-700",
  WARM: "bg-amber-50 text-amber-700",
  COLD: "bg-accent-soft text-accent-hover",
};

export function TemperatureBadge({ temperature }: { temperature: LeadTemperature | null }) {
  if (!temperature) {
    return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Not rated</span>;
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TEMPERATURE_CLASS[temperature]}`}>{formatEnumLabel(temperature)}</span>
  );
}

const STATUS_CLASS: Partial<Record<LeadStatus, string>> = {
  NEW: "bg-accent-soft text-accent-hover",
  BOOKED: "bg-green-50 text-green-700",
  CLOSED: "bg-muted text-muted-foreground",
  LOST: "bg-muted text-muted-foreground",
  NOT_INTERESTED: "bg-muted text-muted-foreground",
  UNQUALIFIED: "bg-muted text-muted-foreground",
  WRONG_NUMBER: "bg-muted text-muted-foreground",
  DUPLICATE: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-muted text-foreground"}`}>
      {formatEnumLabel(status)}
    </span>
  );
}
