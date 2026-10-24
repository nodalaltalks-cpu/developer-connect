"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { PROFILE_SECTIONS, PROFILE_FIELD_CONFIG } from "@/lib/profile/field-config";
import type { ProfileCompletion } from "@/lib/profile/types";
import { shouldCelebrate } from "@/lib/profile/celebration";
import { isProfileVerified } from "@/lib/profile/verification";
import { saveProfileFieldsAction } from "@/app/_actions/profile-actions";
import { ProfileCompletionSummary } from "@/components/profile-completion-summary";
import { ProfileSectionAccordion } from "./profile-section-accordion";
import { ProfileTimeline } from "./profile-timeline";
import { SaveStatusBar } from "./sticky-save-bar";
import { CompletionCelebration } from "./completion-celebration";

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
  emailVerified,
}: {
  initialData: Record<string, unknown>;
  initialCompletion: ProfileCompletion;
  /** From a notification's deep link (?section=...) — opens and scrolls to that section on load. */
  requestedSectionId?: string;
  /** The account's own Clerk email-verification status — see lib/profile/account-signals.ts. Never re-derived here. */
  emailVerified: boolean;
}) {
  const [draftData, setDraftData] = useState(initialData);
  const [savedData, setSavedData] = useState(initialData);
  const [completion, setCompletion] = useState(initialCompletion);
  const [celebration, setCelebration] = useState<{ sectionTitle: string; percentage: number } | null>(null);
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

  const draftRef = useRef(draftData);
  const stateRef = useRef<SaveState>("idle");
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<() => void>(() => {});
  const setSaveStateTracked = useCallback((next: SaveState) => {
    stateRef.current = next;
    setSaveState(next);
  }, []);

  useEffect(() => {
    if (requestedSectionValid) {
      requestAnimationFrame(() => scrollToSection(requestedSectionValid));
      return;
    }
    // No deep link: show the personal greeting for a moment, then take them straight to the first
    // section still to do (it is already open). Skipped if they have started scrolling themselves.
    const target = firstIncompleteSectionId(initialCompletion);
    if (!target) return;
    const timer = setTimeout(() => {
      if (window.scrollY < 40) scrollToSection(target);
    }, 1400);
    return () => clearTimeout(timer);
    // Only ever run once, for the link the user actually followed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the tab or app with a change still waiting: save it now instead of losing it.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") handleSaveRef.current();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      const next = { ...draftRef.current, [key]: value };
      draftRef.current = next;
      setDraftData(next);
      setSaveStateTracked("dirty");
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      // Saved on its own shortly after the last change; there is no Save button to remember.
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
      autosaveRef.current = setTimeout(() => handleSaveRef.current(), 800);
    },
    [setSaveStateTracked],
  );

  function handleOpenSection(sectionId: string) {
    setOpenSectionId((prev) => (prev === sectionId ? null : sectionId));
  }

  function handleWhatsLeftClick(sectionId: string) {
    setOpenSectionId(sectionId);
    // Let the accordion actually expand before scrolling to it.
    requestAnimationFrame(() => scrollToSection(sectionId));
  }

  function handleSave() {
    if (stateRef.current !== "dirty" && stateRef.current !== "error") return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    const snapshot = draftRef.current;
    setSaveStateTracked("saving");
    startTransition(async () => {
      try {
        const result = await saveProfileFieldsAction(snapshot);
        // The ONE decision behind both the inline banner and the full
        // celebration overlay — see celebration.ts for exactly what
        // "genuinely completed" means (a real incomplete->complete
        // transition AND a real percentage increase, never re-saving an
        // already-complete section or a same-render wash).
        const celebrationResult = shouldCelebrate(completion, result.completion);

        setCompletion(result.completion);
        setSavedData(snapshot);
        // Something was typed while this save was in flight: save again rather than call it done.
        if (draftRef.current !== snapshot) {
          setSaveStateTracked("dirty");
          autosaveRef.current = setTimeout(() => handleSaveRef.current(), 300);
          return;
        }
        setSaveStateTracked("saved");

        if (celebrationResult.show) {
          setJustCompletedMessage(
            `${celebrationResult.sectionTitle} added — your profile is now ${celebrationResult.percentage}% complete.`,
          );
          setCelebration({
            sectionTitle: celebrationResult.sectionTitle!,
            percentage: celebrationResult.percentage!,
          });
        } else {
          setJustCompletedMessage(null);
        }

        savedTimeoutRef.current = setTimeout(() => {
          setSaveStateTracked("idle");
          setJustCompletedMessage(null);
        }, 3500);
      } catch {
        setSaveStateTracked("error");
      }
    });
  }
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  const incompleteSections = PROFILE_SECTIONS.filter((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  const nextSection = incompleteSections[0] ?? null;
  const verified = isProfileVerified(completion, emailVerified);

  return (
    <div className="pb-24">
      <div className="rounded-lg border border-border bg-muted p-6">
        {incompleteSections.length > 0 ? (
          <ProfileTimeline completion={completion} onJump={handleWhatsLeftClick} />
        ) : (
          <ProfileCompletionSummary completion={completion} verified={verified} />
        )}
      </div>

      <div aria-live="polite" role="status">
        {justCompletedMessage && (
          <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm font-medium text-accent-hover">
            ✓ {justCompletedMessage}
          </p>
        )}
      </div>

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
          : "Saving your changes automatically…"}
      </p>

      <SaveStatusBar state={saveState} onSave={handleSave} />

      {celebration && (
        <CompletionCelebration
          sectionTitle={celebration.sectionTitle}
          percentage={celebration.percentage}
          nextSectionTitle={nextSection?.title ?? null}
          onContinue={() => {
            setCelebration(null);
            if (nextSection) handleWhatsLeftClick(nextSection.id);
          }}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
