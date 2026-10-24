"use client";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Persistent bottom action. The editor also saves on its own shortly after each change; this button is the second way, for anyone
 * who wants to save right now. Same saveProfileFieldsAction either way. Respects mobile safe-area insets so it never sits under
 * a device's home-indicator area.
 */
export function SaveStatusBar({ state, onSave }: { state: SaveState; onSave: () => void }) {
  const label =
    state === "saving" ? "Saving…" : state === "saved" ? "✓ Saved" : state === "error" ? "Try again" : "Save details";

  const disabled = state === "idle" || state === "saving" || state === "saved";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto max-w-2xl px-4 py-3">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="flex min-h-12 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {label}
        </button>
        {state === "error" && <p className="mt-1.5 text-center text-xs text-red-700">That didn&apos;t save. Check your connection and try again.</p>}
        {state === "dirty" && <p className="mt-1.5 text-center text-xs text-muted-foreground">Saves automatically, or tap now.</p>}
      </div>
    </div>
  );
}
