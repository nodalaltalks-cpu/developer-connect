"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
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
  requestedSectionId,
}: {
  initialData: Record<string, unknown>;
  initialCompletion: ProfileCompletion;
  /** From a notification's deep link (?section=...) — opens and scrolls to that section on load. */
  requestedSectionId?: string;
}) {
  const [draftData, setDraftData] = useState(initialData);
  const [savedData, setSavedData] = useState(initialData);
  const [completion, setCompletion] = useState(initialCompletion);
  const requestedSectionValid =
    requestedSectionId && PROFILE_SECTIONS.some((s) => s.id === requestedSectionId)
      ? requestedSectionId
      : null;
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    requestedSectionValid ?? firstIncompleteSectionId(initialCompletion),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [justCompletedMessage, setJustCompletedMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (requestedSectionValid) {
      requestAnimationFrame(() => scrollToSection(requestedSectionValid));
    }
    // Only ever run once, for the link the user actually followed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const sectionsJustCompleted = result.completion.sections.filter((after) => {
          if (!after.complete) return false;
          const before = completion.sections.find((s) => s.sectionId === after.sectionId);
          return before && !before.complete;
        });

        setCompletion(result.completion);
        setSavedData(draftData);
        setSaveState("saved");

        if (sectionsJustCompleted.length > 0 && result.completion.percentage !== null) {
          setJustCompletedMessage(
            `${sectionsJustCompleted[0].title} added — your profile is now ${result.completion.percentage}% complete.`,
          );
        } else {
          setJustCompletedMessage(null);
        }

        savedTimeoutRef.current = setTimeout(() => {
          setSaveState("idle");
          setJustCompletedMessage(null);
        }, 3500);
      } catch {
        setSaveState("error");
      }
    });
  }

  const incompleteSections = PROFILE_SECTIONS.filter((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  const nextSection = incompleteSections[0] ?? null;

  return (
    <div className="pb-24">
      <div className="rounded-lg border border-border bg-muted p-6">
        <ProfileCompletionSummary completion={completion} />
      </div>

      <div aria-live="polite" role="status">
        {justCompletedMessage && (
          <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm font-medium text-accent-hover">
            ✓ {justCompletedMessage}
          </p>
        )}
      </div>

      {nextSection && (
        <div className="mt-6 rounded-lg border border-accent-soft bg-accent-soft/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-hover">
            Your next step
          </p>
          <p className="mt-1 font-medium text-foreground">Start with {nextSection.title}.</p>
          {nextSection.whyItMatters && (
            <p className="mt-1 text-sm text-muted-foreground">{nextSection.whyItMatters}</p>
          )}
          <button
            type="button"
            onClick={() => handleWhatsLeftClick(nextSection.id)}
            className="mt-3 min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            Complete next step
          </button>
        </div>
      )}

      {incompleteSections.length > 0 && (
        <div className="mt-6 rounded-lg border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s left
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {incompleteSections.length} detail{incompleteSections.length === 1 ? "" : "s"} left
          </p>
          <ul className="mt-3 space-y-1">
            {incompleteSections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => handleWhatsLeftClick(section.id)}
                  className="flex min-h-11 w-full items-center gap-2 py-1 text-left text-sm text-accent-hover hover:underline"
                >
                  <span aria-hidden="true">○</span>
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
