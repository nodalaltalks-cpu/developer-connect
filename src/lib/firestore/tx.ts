import { Timestamp, type CollectionReference, type DocumentData, type DocumentReference, type Firestore, type Query, type Transaction } from "firebase-admin/firestore";
import { getFirestoreDb } from "./client.ts";

/**
 * One handle every Firestore adapter uses, so the same repository code runs both outside a transaction (writes
 * happen immediately) and inside one (writes are buffered and committed together).
 *
 * WHY BUFFERED: Firestore transactions require every read to happen before any write, but the existing service layer
 * interleaves them freely (read a lead, write an event, read it back...), exactly as a SQL transaction allows. Inside
 * `run`, reads go to the real transaction and writes are held in memory; reads of a document written earlier in the
 * same transaction see that write (read-your-writes); everything is flushed at the end. If another request changes a
 * document this one read, Firestore retries the whole callback, so callbacks must be free of outside side effects
 * (they already are: notifications and the like are sent after commit).
 *
 * LIMITS (by design, documented in docs/firestore-migration-plan.md):
 *  - Updates must use top-level keys and plain values (no FieldValue sentinels) so reads can overlay them.
 *  - `query` results show earlier in-transaction writes to documents that already matched, but a document that only
 *    starts matching because of an in-transaction write is not returned. Services needing that read it by id.
 *  - At most 500 writes per transaction.
 */
export interface DocView {
  id: string;
  ref: DocumentReference;
  exists: boolean;
  data(): DocumentData | undefined;
}

export interface FsCtx {
  readonly db: Firestore;
  /** True inside `run`: reads then bypass any in-process caches, so a transaction only ever sees consistent data. */
  readonly inTx: boolean;
  get(ref: DocumentReference): Promise<DocView>;
  /** Existing documents only. */
  query(q: Query): Promise<DocView[]>;
  /**
   * Like `query`, but described by a plain spec so that, inside a transaction, documents written EARLIER IN THE SAME
   * transaction are also taken into account (a created document that matches is returned; an updated one is
   * re-tested against the filter; a deleted one is dropped). Use this for any read that can follow a write.
   */
  find(col: CollectionReference, spec: QuerySpec): Promise<DocView[]>;
  /** How many documents match. Outside a transaction this is a cheap aggregation query that downloads nothing. */
  count(col: CollectionReference, where?: Where[]): Promise<number>;
  create(ref: DocumentReference, data: DocumentData): Promise<void>;
  set(ref: DocumentReference, data: DocumentData): Promise<void>;
  update(ref: DocumentReference, patch: DocumentData): Promise<void>;
  delete(ref: DocumentReference): Promise<void>;
  /** Runs `work` atomically. Already inside a transaction it simply joins it. */
  run<T>(work: (ctx: FsCtx) => Promise<T>): Promise<T>;
}


export type WhereOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";
export type Where = [field: string, op: WhereOp, value: unknown];
export interface QuerySpec {
  where?: Where[];
  orderBy?: Array<[field: string, direction: "asc" | "desc"]>;
  limit?: number;
}

function buildQuery(col: CollectionReference, spec: QuerySpec): Query {
  let q: Query = col;
  for (const [field, op, value] of spec.where ?? []) q = q.where(field, op, value);
  for (const [field, dir] of spec.orderBy ?? []) q = q.orderBy(field, dir);
  if (spec.limit !== undefined) q = q.limit(spec.limit);
  return q;
}

/** Timestamps and Dates compare by instant; everything else as is. */
function norm(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
}

function fieldOf(data: DocumentData, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** The same filter semantics Firestore applies: a document lacking the field matches nothing. */
function matches(data: DocumentData, where: Where[] | undefined): boolean {
  for (const [field, op, expected] of where ?? []) {
    const raw = fieldOf(data, field);
    if (raw === undefined) return false;
    const v = norm(raw);
    const e = norm(expected);
    switch (op) {
      case "==":
        if (v !== e) return false;
        break;
      case "!=":
        if (v === e) return false;
        break;
      case "<":
        if (v === null || e === null || !((v as number) < (e as number))) return false;
        break;
      case "<=":
        if (v === null || e === null || !((v as number) <= (e as number))) return false;
        break;
      case ">":
        if (v === null || e === null || !((v as number) > (e as number))) return false;
        break;
      case ">=":
        if (v === null || e === null || !((v as number) >= (e as number))) return false;
        break;
      case "in":
        if (!(expected as unknown[]).some((x) => norm(x) === v)) return false;
        break;
      case "array-contains":
        if (!Array.isArray(raw) || !raw.some((x) => norm(x) === e)) return false;
        break;
    }
  }
  return true;
}

function comparator(orderBy: QuerySpec["orderBy"]): (a: DocView, b: DocView) => number {
  const order = orderBy ?? [];
  return (a, b) => {
    for (const [field, dir] of order) {
      const x = norm(fieldOf(a.data() ?? {}, field)) as number | string | null | undefined;
      const y = norm(fieldOf(b.data() ?? {}, field)) as number | string | null | undefined;
      if (x === y) continue;
      const c = x == null ? -1 : y == null ? 1 : x < y ? -1 : 1;
      return dir === "asc" ? c : -c;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

type Op = { kind: "create" | "set" | "update" | "delete"; data?: DocumentData };

function view(ref: DocumentReference, data: DocumentData | undefined): DocView {
  return { id: ref.id, ref, exists: data !== undefined, data: () => data };
}

function apply(base: DocumentData | undefined, op: Op): DocumentData | undefined {
  switch (op.kind) {
    case "delete":
      return undefined;
    case "create":
    case "set":
      return op.data;
    case "update":
      if (base === undefined) throw new Error("Cannot update a document that does not exist.");
      return { ...base, ...op.data };
  }
}

export function directCtx(db: Firestore = getFirestoreDb()): FsCtx {
  const ctx: FsCtx = {
    db,
    inTx: false,
    async get(ref) {
      const s = await ref.get();
      return view(ref, s.exists ? s.data() : undefined);
    },
    async query(q) {
      return (await q.get()).docs.map((d) => view(d.ref, d.data()));
    },
    async find(col, spec) {
      return (await buildQuery(col, spec).get()).docs.map((d) => view(d.ref, d.data()));
    },
    async count(col, where) {
      return (await buildQuery(col, { where }).count().get()).data().count;
    },
    async create(ref, data) {
      await ref.create(data);
    },
    async set(ref, data) {
      await ref.set(data);
    },
    async update(ref, patch) {
      await ref.update(patch);
    },
    async delete(ref) {
      await ref.delete();
    },
    run(work) {
      return runInTransaction(work, db);
    },
  };
  return ctx;
}

function txCtx(db: Firestore, tx: Transaction): FsCtx {
  const buffer = new Map<string, { ref: DocumentReference; ops: Op[] }>();
  const note = (ref: DocumentReference, op: Op) => {
    const entry = buffer.get(ref.path) ?? { ref, ops: [] };
    entry.ops.push(op);
    buffer.set(ref.path, entry);
  };
  const overlay = (ref: DocumentReference, base: DocumentData | undefined): DocumentData | undefined => {
    let cur = base;
    for (const op of buffer.get(ref.path)?.ops ?? []) cur = apply(cur, op);
    return cur;
  };

  const ctx: FsCtx = {
    db,
    inTx: true,
    async get(ref) {
      const s = await tx.get(ref);
      return view(ref, overlay(ref, s.exists ? s.data() : undefined));
    },
    async query(q) {
      const snap = await tx.get(q);
      const out: DocView[] = [];
      for (const d of snap.docs) {
        const merged = overlay(d.ref, d.data());
        if (merged !== undefined) out.push(view(d.ref, merged));
      }
      return out;
    },
    async find(col, spec) {
      const snap = await tx.get(buildQuery(col, spec));
      const found = new Map<string, DocView>();
      for (const d of snap.docs) {
        const merged = overlay(d.ref, d.data());
        if (merged !== undefined && matches(merged, spec.where)) found.set(d.ref.path, view(d.ref, merged));
      }
      // Documents this transaction wrote may match although the stored copy does not (or did not exist at all).
      const prefix = `${col.path}/`;
      for (const [path, entry] of buffer) {
        if (!path.startsWith(prefix) || found.has(path) || path.slice(prefix.length).includes("/")) continue;
        const stored = await tx.get(entry.ref);
        const merged = overlay(entry.ref, stored.exists ? stored.data() : undefined);
        if (merged !== undefined && matches(merged, spec.where)) found.set(path, view(entry.ref, merged));
      }
      const rows = [...found.values()].sort(comparator(spec.orderBy));
      return spec.limit === undefined ? rows : rows.slice(0, spec.limit);
    },
    async count(col, where) {
      return (await ctx.find(col, { where })).length;
    },
    async create(ref, data) {
      note(ref, { kind: "create", data });
    },
    async set(ref, data) {
      note(ref, { kind: "set", data });
    },
    async update(ref, patch) {
      note(ref, { kind: "update", data: patch });
    },
    async delete(ref) {
      note(ref, { kind: "delete" });
    },
    run: (work) => work(ctx),
  };

  // The flush is attached to the context so `runBuffered` below can call it after the callback returns.
  (ctx as FsCtx & { flush: () => void }).flush = () => {
    for (const { ref, ops } of buffer.values()) {
      const firstWhole = ops.findIndex((o) => o.kind !== "update");
      if (firstWhole === -1) {
        // Only patches: apply them to the stored document as one update.
        tx.update(ref, ops.reduce<DocumentData>((acc, o) => ({ ...acc, ...o.data }), {}));
        continue;
      }
      // A create/set/delete replaces whatever was stored, so anything before it no longer matters.
      let finalData: DocumentData | undefined;
      for (const o of ops.slice(firstWhole)) finalData = apply(finalData, o);
      if (finalData === undefined) tx.delete(ref);
      else if (ops[firstWhole].kind === "create") tx.create(ref, finalData);
      else tx.set(ref, finalData);
    }
  };
  return ctx;
}

const ABORTED = 10;

/** Contention between transactions on the same documents (the server gives up waiting for a lock): safe to run again. */
function isContention(error: unknown): boolean {
  const e = error as { code?: number | string; message?: string };
  // "Transaction is invalid or closed" is what later reads of a transaction the server already aborted report.
  return e?.code === ABORTED || e?.code === "aborted" || /lock timeout|too much contention|ABORTED|Transaction is invalid or closed/i.test(e?.message ?? "");
}

/**
 * Runs `work` inside a Firestore transaction with buffered writes (see the note at the top of this file). Firestore
 * already retries the callback when a document it read changed; on top of that, a transaction that could not even get
 * its lock (many requests racing for the same lead) is retried here with a short random back-off, which is what lets
 * 25 simultaneous captures of one phone number settle into exactly one lead.
 */
export async function runInTransaction<T>(work: (ctx: FsCtx) => Promise<T>, db: Firestore = getFirestoreDb()): Promise<T> {
  const MAX_ATTEMPTS = 12;
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.runTransaction(async (tx) => {
        const ctx = txCtx(db, tx) as FsCtx & { flush: () => void };
        const result = await work(ctx);
        ctx.flush();
        return result;
      });
    } catch (error) {
      if (!isContention(error) || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75 * attempt));
    }
  }
}
