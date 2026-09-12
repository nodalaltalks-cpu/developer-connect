"use client";

import { useState } from "react";
import { buttonClassName } from "@/components/ui/button";
import { DeveloperEditForm } from "./developer-edit-form";
import type { Developer } from "@/lib/developer-connect/types";

/**
 * Collapsed-by-default wrapper around the existing DeveloperEditForm, for
 * the developer detail page. The verification review page still embeds
 * DeveloperEditForm directly (always visible there — that page IS the
 * review screen), so this doesn't change that usage; it only adds a
 * second, collapsible entry point for an already-published developer,
 * where the edit form shouldn't compete with the verified/published
 * status for attention.
 */
export function DeveloperEditToggle({
  developer,
  onSaved,
}: {
  developer: Developer;
  /** Forwarded to DeveloperEditForm — see its own doc comment. */
  onSaved?: (developer: Developer) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName("secondary")}>
        Edit developer
      </button>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        You&apos;re editing an already verified &amp; published developer. Saving records the change and queues
        it as unpublished — the public page keeps showing today&apos;s published information until you
        explicitly Republish.
      </p>
      <DeveloperEditForm developer={developer} onCancel={() => setOpen(false)} onSaved={onSaved} />
    </div>
  );
}
