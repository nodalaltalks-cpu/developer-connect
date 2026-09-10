"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { PROFILE_SECTIONS, PROFILE_FIELD_CONFIG } from "@/lib/profile/field-config";
import type { ProfileCompletion } from "@/lib/profile/types";
import { saveProfileFieldsAction } from "@/app/_actions/profile-actions";
import { ProfileCompletionSummary } from "@/components/profile-completion-summary";
import { ProfileSectionAccordion } from "./profile-section-accordion";
import { StickySaveBar } from "./sticky-save-bar";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function firstIncompleteSectionId(completion: ProfileCompletion): string | null {
  const incomplete = PROFILE_SECTIONS.find((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  return incomplete?.id ?? null;
}

function scrollToSection(sectionId: string) {
  document
    .getElementById(`section-${sectionId}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ProfileEditor({
  initialData,
  initialCompletion,
}: {
  initialData: Record<string, unknown>;
  initialCompletion: ProfileCompletion;
}) {
  const [draftData, setDraftData] = useState(initialData);
  const [savedData, setSavedData] = useState(initialData);
  const [completion, setCompletion] = useState(initialCompletion);
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    firstIncompleteSectionId(initialCompletion),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setDraftData((prev) => ({ ...prev, [key]: value }));
    setSaveState("dirty");
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
  }, []);

  function handleOpenSection(sectionId: string) {
    setOpenSectionId((prev) => (prev === sectionId ? null : sectionId));
  }

  function handleWhatsLeftClick(sectionId: string) {
    setOpenSectionId(sectionId);
    // Let the accordion actually expand before scrolling to it.
    requestAnimationFrame(() => scrollToSection(sectionId));
  }

  function handleSave() {
    if (saveState !== "dirty" && saveState !== "error") return;
    setSaveState("saving");
    startTransition(async () => {
      try {
        const result = await saveProfileFieldsAction(draftData);
        setCompletion(result.completion);
        setSavedData(draftData);
        setSaveState("saved");
        savedTimeoutRef.current = setTimeout(() => setSaveState("idle"), 2500);
      } catch {
        setSaveState("error");
      }
    });
  }

  const incompleteSections = PROFILE_SECTIONS.filter((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });

  return (
    <div className="pb-24">
      <div className="rounded-lg border border-border bg-muted p-6">
        <ProfileCompletionSummary completion={completion} />
      </div>

      {incompleteSections.length > 0 && (
        <div className="mt-6 rounded-lg border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s left
          </p>
          <ul className="mt-3 space-y-1">
            {incompleteSections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => handleWhatsLeftClick(section.id)}
                  className="min-h-11 py-1 text-left text-sm text-accent-hover hover:underline"
                >
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {PROFILE_SECTIONS.map((section) => (
          <ProfileSectionAccordion
            key={section.id}
            section={section}
            fields={PROFILE_FIELD_CONFIG.filter((f) => f.section === section.id)}
            status={completion.sections.find((s) => s.sectionId === section.id)}
            isOpen={openSectionId === section.id}
            onToggle={() => handleOpenSection(section.id)}
            data={draftData}
            onFieldChange={handleFieldChange}
          />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {JSON.stringify(draftData) === JSON.stringify(savedData)
          ? "Everything here is saved."
          : "You have unsaved changes."}
      </p>

      <StickySaveBar state={saveState} onSave={handleSave} />
    </div>
  );
}
