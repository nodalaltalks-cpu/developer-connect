"use client";

import type { ProfileFieldConfig, ProfileSection, ProfileSectionCompletion } from "@/lib/profile/types";
import { ProfileFieldInput } from "./profile-field-input";

function StatusBadge({ status }: { status: ProfileSectionCompletion | undefined }) {
  if (!status || status.totalFields === 0) return null;
  if (status.complete) {
    return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">✓ Done</span>;
  }
  if (status.completedFields === 0) {
    return <span className="rounded-full border border-accent px-2.5 py-1 text-xs font-bold text-accent-hover">Start · {status.totalFields} quick</span>;
  }
  const left = status.totalFields - status.completedFields;
  const pct = Math.round((status.completedFields / status.totalFields) * 100);
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
        {status.completedFields}/{status.totalFields} · {left} to go
      </span>
      <span aria-hidden="true" className="h-1 w-16 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-accent" style={{ width: pct + "%" }} />
      </span>
    </span>
  );
}

export function ProfileSectionAccordion({
  section,
  fields,
  status,
  isOpen,
  onToggle,
  data,
  onFieldChange,
}: {
  section: ProfileSection;
  fields: ProfileFieldConfig[];
  status: ProfileSectionCompletion | undefined;
  isOpen: boolean;
  onToggle: () => void;
  data: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  const privacyNote = fields.find((f) => f.privacyNote)?.privacyNote;

  return (
    <div id={`section-${section.id}`} className="scroll-mt-24 rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-sm font-semibold text-foreground">{section.title}</span>
        <span className="flex items-center gap-3">
          <StatusBadge status={status} />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-border px-4 py-5">
          {section.whyItMatters && (
            <p className="text-sm text-muted-foreground">{section.whyItMatters}</p>
          )}
          {section.helperText && <p className="text-sm text-muted-foreground">{section.helperText}</p>}
          {privacyNote && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{privacyNote}</p>
          )}
          {fields.map((field) => (
            <ProfileFieldInput
              key={field.key}
              field={field}
              value={data[field.key]}
              onChange={(value) => onFieldChange(field.key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
