"use client";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Where the profile's autosave shows what it is doing. There is no Save button: the editor saves on its own through the same
 * saveProfileFieldsAction as before. The only control is "Try again", shown when a save failed. Respects mobile safe-area
 * insets so it never sits under a device's home-indicator area.
 */
export function SaveStatusBar({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-3 text-sm">
        {state === "error" ? (
          <>
            <span className="text-red-700">That didn&apos;t save. Check your connection.</span>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-10 rounded-md bg-accent px-4 font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              Try again
            </button>
          </>
        ) : (
          <span className="font-medium text-muted-foreground">{state === "saved" ? "✓ Saved" : "Saving…"}</span>
        )}
      </div>
    </div>
  );
}
