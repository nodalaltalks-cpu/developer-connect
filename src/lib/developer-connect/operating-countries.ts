/**
 * The countries Developer Connects is currently building/covering its
 * developer directory in — deliberately separate from any query over the
 * VERIFIED developer dataset. A country belongs here the moment it's a
 * real operating market for this product, independent of how many (if
 * any) developers in it have been verified and published yet. This is
 * the single source of truth for the homepage's "Countries covered"
 * stat and the footer's country links, so both update together the
 * moment a country is legitimately added here — never a number that
 * needs to be separately edited in two places.
 *
 * `name` is the exact string stored in `developers.country` for that
 * market (case-sensitive at the display layer, matched case-
 * insensitively by the existing geography filter) — so a link built from
 * this list always lands on a working `/?country=` filter.
 */
export interface OperatingCountry {
  name: string;
}

export const OPERATING_COUNTRIES: readonly OperatingCountry[] = [
  { name: "India" },
  { name: "United Arab Emirates" },
];
