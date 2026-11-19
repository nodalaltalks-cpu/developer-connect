/**
 * Records the shape of every Firestore query a process runs, so firestore.indexes.json can be generated from what the
 * app and its tests actually do instead of from memory. The emulator does not enforce indexes, but real Firestore does.
 *
 *   node --require ./scripts/record-firestore-queries.cjs <anything that runs queries>
 *
 * Appends one JSON line per distinct query shape to $FIRESTORE_QUERY_LOG (default: firestore-queries.log in the
 * temp directory). `scripts/build-firestore-indexes.cjs` turns that log into the composite-index list.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Query } = require("@google-cloud/firestore");

const logFile = process.env.FIRESTORE_QUERY_LOG || path.join(os.tmpdir(), "firestore-queries.log");
const seen = new Set();
const original = Query.prototype.toProto;

Query.prototype.toProto = function toProto(...args) {
  const request = original.apply(this, args);
  try {
    const q = request.structuredQuery;
    if (q) {
      const fields = [];
      const walk = (filter) => {
        if (!filter) return;
        if (filter.compositeFilter) filter.compositeFilter.filters.forEach(walk);
        else if (filter.fieldFilter) fields.push({ field: filter.fieldFilter.field.fieldPath, op: filter.fieldFilter.op });
        else if (filter.unaryFilter) fields.push({ field: filter.unaryFilter.field.fieldPath, op: filter.unaryFilter.op === "IS_NULL" || filter.unaryFilter.op === "IS_NAN" ? "EQUAL" : "NOT_EQUAL" });
      };
      walk(q.where);
      const shape = {
        collection: q.from[0].collectionId,
        filters: fields,
        orderBy: (q.orderBy || []).map((o) => ({ field: o.field.fieldPath, direction: o.direction || "ASCENDING" })),
      };
      const key = JSON.stringify(shape);
      if (!seen.has(key)) {
        seen.add(key);
        fs.appendFileSync(logFile, key + "\n");
      }
    }
  } catch {
    // Recording must never break the process it observes.
  }
  return request;
};
