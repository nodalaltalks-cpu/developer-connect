/**
 * Turns the query log written by record-firestore-queries.cjs into firestore.indexes.json.
 *
 *   node scripts/build-firestore-indexes.cjs <query-log> [firestore.indexes.json]
 *
 * Firestore's rules (simplified to what this app uses):
 *  - a query on ONE field needs no composite index;
 *  - equality / `in` filters on several fields, with no ordering and no range, are served by merging single-field indexes;
 *  - anything else that involves two or more fields needs a composite index: equality fields first (ascending), then the
 *    range field, then the ordering fields in the order given. `array-contains` is its own index mode.
 * The result is a safe superset of what is required: an unneeded index costs a little storage, a missing one fails a page.
 */
const fs = require("node:fs");

const [logPath, outPath = "firestore.indexes.json"] = process.argv.slice(2);
if (!logPath) {
  console.error("usage: node scripts/build-firestore-indexes.cjs <query-log> [firestore.indexes.json]");
  process.exit(1);
}

const EQUALITY = new Set(["EQUAL", "IN"]);
const RANGE = new Set(["LESS_THAN", "LESS_THAN_OR_EQUAL", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "NOT_EQUAL", "NOT_IN"]);

const indexes = new Map();
const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
for (const line of lines) {
  const parsed = JSON.parse(line);
  // Conformance tests give every repository its own collection-name prefix ("t1a2b3c4d_leads"); the index belongs to the real name.
  const collection = parsed.collection.replace(/^t[0-9a-f]{8}_/, "");
  const { filters, orderBy } = parsed;
  const equality = [...new Set(filters.filter((f) => EQUALITY.has(f.op)).map((f) => f.field))].sort();
  const arrays = [...new Set(filters.filter((f) => f.op === "ARRAY_CONTAINS").map((f) => f.field))].sort();
  const ranges = [...new Set(filters.filter((f) => RANGE.has(f.op)).map((f) => f.field))];
  // The implicit tie-break on document name carries no information; keep it only when explicitly descending.
  const orders = orderBy.filter((o) => !(o.field === "__name__" && o.direction === "ASCENDING"));

  const fields = [];
  const add = (fieldPath, mode) => {
    if (!fields.some((f) => f.fieldPath === fieldPath && (f.order || f.arrayConfig) === mode)) fields.push(mode === "CONTAINS" ? { fieldPath, arrayConfig: "CONTAINS" } : { fieldPath, order: mode });
  };
  for (const a of arrays) add(a, "CONTAINS");
  for (const e of equality) add(e, "ASCENDING");
  for (const r of ranges) if (!orders.some((o) => o.field === r)) add(r, "ASCENDING");
  for (const o of orders) add(o.field, o.direction);

  const distinct = new Set(fields.map((f) => f.fieldPath));
  const onlyEqualities = ranges.length === 0 && orders.length === 0 && arrays.length === 0;
  if (distinct.size < 2 || onlyEqualities) continue;
  const key = collection + "|" + fields.map((f) => `${f.fieldPath}:${f.order || f.arrayConfig}`).join(",");
  indexes.set(key, { collectionGroup: collection, queryScope: "COLLECTION", fields });
}

const out = { indexes: [...indexes.values()].sort((a, b) => a.collectionGroup.localeCompare(b.collectionGroup) || JSON.stringify(a.fields).localeCompare(JSON.stringify(b.fields))), fieldOverrides: [] };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${lines.length} distinct query shapes -> ${out.indexes.length} composite indexes written to ${outPath}`);
