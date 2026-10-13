"use client";

import Link from "next/link";
import { useState } from "react";
import { QuickLeadForm } from "@/components/team/quick-lead-form";

/** The short lead form as its own screen (add a lead without calling, or add details to a number): saved state with the next steps. */
export function QuickLeadScreen({ leadId = null, askPhone = false, initialPhone = "" }: { leadId?: string | null; askPhone?: boolean; initialPhone?: string }) {
  const [savedId, setSavedId] = useState<string | null>(null);
  if (savedId) {
    return (
      <div className="rounded-2xl border border-border p-5 text-center">
        <p aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-full bg-whatsapp text-2xl text-white">✓</p>
        <p className="mt-3 text-lg font-bold text-foreground">Lead saved</p>
        <p className="mt-1 text-sm text-muted-foreground">It is in your leads, with your comment and next step.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href={`/team/leads/${savedId}`} className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 text-base font-semibold text-accent-foreground hover:bg-accent-hover">
            View lead
          </Link>
          <Link href="/team/dial" className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-base font-medium text-foreground hover:bg-muted">
            Back to the dial pad
          </Link>
        </div>
      </div>
    );
  }
  return <QuickLeadForm leadId={leadId} askPhone={askPhone} initialPhone={initialPhone} onSaved={(s) => setSavedId(s.leadId)} />;
}
