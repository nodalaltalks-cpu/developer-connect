"use client";

import { useState, useTransition, FormEvent } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import {
  submitCandidateAction,
  type SubmitCandidateActionResult,
} from "@/app/admin/_actions/candidate-actions";
import type { DiscoverySource } from "@/lib/developer-connect/types";

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

/** AGENT_CRAWL is deliberately excluded — this form is for a founder's own manual intake. */
const DISCOVERY_SOURCES: { value: DiscoverySource; label: string }[] = [
  { value: "MANUAL_SUBMISSION", label: "Manual submission" },
  { value: "SEARCH_ENGINE", label: "Found via search engine" },
  { value: "REGULATORY_FILING", label: "Found via a regulatory filing" },
  { value: "OTHER", label: "Other" },
];

export function CandidateIntakeForm({ developerId }: { developerId: string }) {
  const [url, setUrl] = useState("");
  const [discoverySource, setDiscoverySource] = useState<DiscoverySource>("MANUAL_SUBMISSION");
  const [result, setResult] = useState<SubmitCandidateActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await submitCandidateAction({ developerId, url, discoverySource });
      setResult(outcome);
      if (outcome.ok) {
        setUrl("");
      }
    });
  }

  if (result?.ok && result.candidate) {
    const candidate = result.candidate;
    return (
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">Candidate added: {candidate.canonicalDomain}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: <span className="font-medium">{candidate.verificationStatus}</span>
          {candidate.verificationStatus === "REJECTED"
            ? " — automatically rejected. This domain is on the known-portal/aggregator/social-platform denylist, not treated as an official site."
            : " — this is not verified. Add evidence, then review and decide on the verification screen."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={`/admin/verification/${candidate.id}`} className={buttonClassName("primary")}>
            Go to verification review
          </Link>
          <button type="button" onClick={() => setResult(null)} className={buttonClassName("secondary")}>
            Add another candidate
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClassName} htmlFor="url">
          Website URL
        </label>
        <input
          id="url"
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputClassName}
          placeholder="https://www.example.com"
        />
      </div>

      <div>
        <label className={labelClassName} htmlFor="discoverySource">
          How was this found?
        </label>
        <select
          id="discoverySource"
          value={discoverySource}
          onChange={(e) => setDiscoverySource(e.target.value as DiscoverySource)}
          className={inputClassName}
        >
          {DISCOVERY_SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Adding a candidate does <span className="font-medium">not</span> mean the website is
        verified. Known property portals, brokers, and social platforms are automatically
        rejected; everything else waits for a founder&apos;s explicit decision.
      </p>

      {result && !result.ok && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <button type="submit" disabled={isPending} className={buttonClassName("primary")}>
        {isPending ? "Submitting…" : "Submit candidate"}
      </button>
    </form>
  );
}
