"use client";

import { useState, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { addEvidenceAction } from "@/app/admin/_actions/candidate-actions";
import type { EvidenceType } from "@/lib/developer-connect/types";

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

const EVIDENCE_TYPES: EvidenceType[] = [
  "REGULATORY_FILING_REFERENCE",
  "MANUAL_CONFIRMATION",
  "LEGAL_NAME_MATCH",
  "CORPORATE_IDENTITY_MATCH",
  "DOMAIN_OWNERSHIP_SIGNAL",
  "SSL_DOMAIN_CONSISTENCY",
  "OFFICIAL_CONTACT_INFO",
  "OFFICIAL_SOCIAL_BACKLINK",
  "BRANDING_MATCH",
  "OTHER",
];

/**
 * Attaches supporting evidence to a candidate via the existing
 * addEvidence() service, through the founder-gated addEvidenceAction.
 * Evidence informs a verification decision; it never makes one — nothing
 * here can move a candidate's status.
 */
export function EvidenceIntakeForm({ candidateId }: { candidateId: string }) {
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("REGULATORY_FILING_REFERENCE");
  const [detail, setDetail] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const outcome = await addEvidenceAction({
        candidateId,
        evidenceType,
        detail,
        sourceUrl: sourceUrl || undefined,
      });
      if (outcome.ok) {
        setDetail("");
        setSourceUrl("");
        router.refresh();
      } else {
        setError(outcome.error ?? "Could not add evidence. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Evidence supports a verification decision — it does not automatically verify the website.
      </p>
      <div>
        <label className={labelClassName} htmlFor="evidenceType">
          Evidence type
        </label>
        <select
          id="evidenceType"
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
          className={inputClassName}
        >
          {EVIDENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClassName} htmlFor="detail">
          Detail
        </label>
        <textarea
          id="detail"
          required
          rows={2}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className={inputClassName}
          placeholder="What did you check, and what did it show?"
        />
      </div>
      <div>
        <label className={labelClassName} htmlFor="sourceUrl">
          Source URL <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className={inputClassName}
          placeholder="https://www.mca.gov.in/... or a RERA filing link"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isPending} className={buttonClassName("secondary")}>
        {isPending ? "Adding…" : "Add evidence"}
      </button>
    </form>
  );
}
