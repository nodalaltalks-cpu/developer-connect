"use client";

/**
 * Country code for a typed phone number. India (+91) and UAE (+971) are the two one-tap choices; "Other country" lets the person
 * type any code (for example 44 or 1). The server re-validates the whole number, so this only builds the "+code" prefix.
 */

export type CountryKey = "IN" | "AE" | "OTHER";
export interface CountrySelection {
  key: CountryKey;
  /** Digits only, for "OTHER". */
  custom: string;
}

export const DEFAULT_COUNTRY: CountrySelection = { key: "IN", custom: "" };

export function dialCode(sel: CountrySelection): string {
  return sel.key === "IN" ? "+91" : sel.key === "AE" ? "+971" : `+${sel.custom}`;
}

/** The fewest digits that can be a real number in that country (the server is the real judge). */
export function minDigits(sel: CountrySelection): number {
  return sel.key === "IN" ? 10 : sel.key === "AE" ? 8 : 6;
}

export function maxDigits(sel: CountrySelection): number {
  return sel.key === "OTHER" ? 14 : 12;
}

/** True once the code is usable: always for India and UAE; for another country once at least one digit is typed. */
export function countryReady(sel: CountrySelection): boolean {
  return sel.key !== "OTHER" || sel.custom.length >= 1;
}

const SELECT = "min-h-11 w-full rounded-md border border-border bg-background px-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function CountryCodeField({ value, onChange, disabled = false, id }: { value: CountrySelection; onChange: (next: CountrySelection) => void; disabled?: boolean; id?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className={value.key === "OTHER" ? "w-28" : "w-32"}>
        <select id={id} aria-label="Country code" value={value.key} disabled={disabled} onChange={(e) => onChange({ key: (e.target.value as CountryKey) || "IN", custom: value.custom })} className={SELECT}>
          <option value="IN">India +91</option>
          <option value="AE">UAE +971</option>
          <option value="OTHER">Other country…</option>
        </select>
      </div>
      {value.key === "OTHER" && (
        <label className="flex min-h-11 w-20 items-center gap-1 rounded-md border border-border bg-background px-2 text-base text-foreground focus-within:ring-2 focus-within:ring-ring">
          <span aria-hidden="true">+</span>
          <input aria-label="Country dialling code" inputMode="numeric" autoComplete="off" placeholder="44" maxLength={4} disabled={disabled} value={value.custom} onChange={(e) => onChange({ key: "OTHER", custom: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="w-full min-w-0 bg-transparent outline-none" />
        </label>
      )}
    </div>
  );
}
