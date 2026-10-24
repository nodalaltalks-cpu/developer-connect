import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutomationActionResult } from "@/app/admin/_actions/social-automation-actions";

export const FIELD = "min-h-12 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const AREA = "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const BTN = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";
export const PRIMARY = "inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60";

export type Notice = { tone: "ok" | "error"; text: string } | null;

/** Runs a Server Action, shows its outcome and refreshes the page data. Shared by the automation screens. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  function run(job: () => Promise<AutomationActionResult>, okText: string, after?: (result: AutomationActionResult) => void) {
    setNotice(null);
    start(async () => {
      const result = await job().catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      if (result.ok) {
        setNotice({ tone: "ok", text: okText });
        router.refresh();
      } else setNotice({ tone: "error", text: result.error });
      after?.(result);
    });
  }
  return { pending, notice, run };
}
