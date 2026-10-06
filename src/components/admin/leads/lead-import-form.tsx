"use client";

import { useState, useTransition } from "react";
import { importLeadsAction, type ImportLeadsResult } from "@/app/admin/_actions/lead-actions";

/**
 * Import self-generated leads from a CSV (an Excel sheet saved as "CSV"). The file is read in the browser and sent as
 * text to a Founder-only server action, which does all validation. Nothing is created until you press Import.
 */

const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LeadImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [result, setResult] = useState<ImportLeadsResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!file) return;
    setResult(null);
    startTransition(async () => {
      const text = await file.text();
      setResult(await importLeadsAction(text, name, campaign, file.name));
    });
  }

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor="import-file" className="block text-sm font-medium text-foreground">
          CSV file
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
          className={`${FIELD} mt-1.5 py-2`}
        />
        <p className="mt-1 text-xs text-muted-foreground">First row = headers. Needs a phone column (phone, mobile…); name and email are optional. Up to 500 rows.</p>
      </div>
      <div>
        <label htmlFor="import-name" className="block text-sm font-medium text-foreground">
          Batch name
        </label>
        <input id="import-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Thane cold list — Oct" className={`${FIELD} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="import-campaign" className="block text-sm font-medium text-foreground">
          Campaign (optional)
        </label>
        <input id="import-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={120} className={`${FIELD} mt-1.5`} />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!file || pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Importing…" : "Import leads"}
      </button>

      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">
            {result.created} {result.created === 1 ? "lead" : "leads"} imported into “{result.batchName}”.
          </p>
          <p>
            {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped · {result.rejected} row{result.rejected === 1 ? "" : "s"} rejected.
          </p>
          {result.rejectedRows.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.rejectedRows.map((r) => (
                <li key={r.row}>
                  Row {r.row}: {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
