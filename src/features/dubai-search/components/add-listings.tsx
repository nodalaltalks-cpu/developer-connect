"use client";

import { useState } from "react";
import { buildUserListing, CSV_COLUMNS, CSV_EXAMPLE, MAX_CSV_BYTES, parseListingsCsv, type ManualInput } from "../lib/csv.ts";
import type { Listing } from "../lib/types.ts";
import { BTN, BTN_QUIET, FIELD, LABEL } from "./ui.ts";

const EMPTY: ManualInput = { url: "", title: "", community: "Jumeirah Village Circle", building: "", unit: "", floor: "", purpose: "buy", propertyType: "apartment", bedrooms: "", bathrooms: "", areaSqft: "", priceAed: "", completion: "", furnished: "", permitNumber: "" };

/**
 * Two permitted, free ways to bring in advertisements: a link you add by hand (we never fetch the page; you type what it says), and a
 * CSV of listings you are allowed to use. Both stay in this browser only.
 */
export function AddListings({ onAdd }: { onAdd: (listings: Listing[], how: "url" | "csv") => void }) {
  const [form, setForm] = useState<ManualInput>(EMPTY);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [csvMessage, setCsvMessage] = useState<{ ok: boolean; text: string[] } | null>(null);
  const set = (patch: Partial<ManualInput>) => setForm((cur) => ({ ...cur, ...patch }));

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const built = buildUserListing(form, "user-url", undefined, `${Date.now()}`, now);
    if (!built.ok) return setMessage({ ok: false, text: built.error });
    onAdd([built.listing], "url");
    setForm({ ...EMPTY, community: form.community });
    setMessage({ ok: true, text: "Added. Search the Links you added source to see it." });
  }

  function importCsv() {
    const result = parseListingsCsv(csvText, new Date().toISOString());
    if (result.listings.length > 0) onAdd(result.listings, "csv");
    setCsvMessage({ ok: result.listings.length > 0, text: [`${result.listings.length} listing${result.listings.length === 1 ? "" : "s"} imported.`, ...result.errors.slice(0, 6)] });
    if (result.listings.length > 0) setCsvText("");
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) return setCsvMessage({ ok: false, text: [`That file is too large (limit ${MAX_CSV_BYTES / 1000} KB).`] });
    setCsvText(await file.text());
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={submitLink} className="space-y-3">
        <h3 className="text-base font-semibold text-neutral-900">Add an advertisement link</h3>
        <p className="text-sm text-neutral-600">Paste the link, then type what the advertisement says. We do not open or copy the page. Photos and contact details are never copied.</p>
        <label className="block"><span className={LABEL}>Link to the advertisement</span><input className={`${FIELD} mt-1`} inputMode="url" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></label>
        <label className="block"><span className={LABEL}>Title</span><input className={`${FIELD} mt-1`} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="2-bedroom apartment" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={LABEL}>Community</span><input className={`${FIELD} mt-1`} value={form.community} onChange={(e) => set({ community: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Building</span><input className={`${FIELD} mt-1`} value={form.building} onChange={(e) => set({ building: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Buy or rent</span><select className={`${FIELD} mt-1`} value={form.purpose} onChange={(e) => set({ purpose: e.target.value })}><option value="buy">Buy</option><option value="rent">Rent</option></select></label>
          <label className="block"><span className={LABEL}>Bedrooms (0 = studio)</span><input className={`${FIELD} mt-1`} inputMode="numeric" value={form.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Price (AED)</span><input className={`${FIELD} mt-1`} inputMode="numeric" value={form.priceAed} onChange={(e) => set({ priceAed: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Area (sq ft)</span><input className={`${FIELD} mt-1`} inputMode="numeric" value={form.areaSqft} onChange={(e) => set({ areaSqft: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Floor</span><input className={`${FIELD} mt-1`} inputMode="numeric" value={form.floor} onChange={(e) => set({ floor: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Unit (if shown)</span><input className={`${FIELD} mt-1`} value={form.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
        </div>
        <button type="submit" className={BTN}>Add to my search</button>
        {message && <p role="status" className={`text-sm ${message.ok ? "text-emerald-800" : "text-red-700"}`}>{message.text}</p>}
      </form>

      <div className="space-y-3">
        <h3 className="text-base font-semibold text-neutral-900">Import a CSV file</h3>
        <p className="text-sm text-neutral-600">For listings you are authorised to use, for example a file an agency shared with you. Required columns: {CSV_COLUMNS.required.join(", ")}. Optional: {CSV_COLUMNS.optional.join(", ")}.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void readFile(e.target.files?.[0])} className="block w-full text-sm" aria-label="Choose a CSV file" />
        <label className="block"><span className={LABEL}>Or paste the CSV text</span><textarea className={`${FIELD} mt-1 min-h-32 py-2 font-mono text-sm`} value={csvText} onChange={(e) => setCsvText(e.target.value)} /></label>
        <label className="flex items-start gap-3 text-sm text-neutral-800">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-neutral-900" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} />
          I confirm I have permission to use this data.
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} disabled={!allowed || csvText.trim() === ""} onClick={importCsv}>Import</button>
          <button type="button" className={BTN_QUIET} onClick={() => setCsvText(CSV_EXAMPLE)}>Fill with an example</button>
        </div>
        {csvMessage && (
          <ul role="status" className={`space-y-1 text-sm ${csvMessage.ok ? "text-emerald-800" : "text-red-700"}`}>
            {csvMessage.text.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
