import { LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { normalizePhone } from "./phone.ts";
import type { LeadRepositories } from "./repository.ts";
import type { CreationMethod, LeadActor, LeadImportBatch, Lead } from "./types.ts";

/**
 * Self-generated leads: importing a CSV (an Excel sheet saved as CSV) and creating a lead by hand. Both record where the
 * lead came from — SELF_GENERATED, the creation method, who created it, and (for imports) the batch — so that
 * batch -> leads -> calls -> connected -> follow-ups -> bookings can always be followed. Neither creates a buyer
 * consent record: a self-generated lead has not asked to be contacted. (That is a legal question for the business, not
 * something this code decides; see the Phase 2 report.)
 *
 * Existing leads are never modified by an import: a number already in the system is counted as a duplicate.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1_000_000;
const MAX_NAME = 100;
const MAX_EMAIL = 254;

export interface ImportRowIssue {
  /** 1-based data row number (the header is row 0). */
  row: number;
  reason: string;
}

export interface ImportResult {
  batch: LeadImportBatch;
  /** Data rows in the file. */
  totalRows: number;
  /** Every valid, distinct lead in the file in file order - new AND already-existing - for building a calling batch. */
  leadIds: string[];
  created: number;
  duplicates: ImportRowIssue[];
  rejected: ImportRowIssue[];
}

/** A small RFC-4180 CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<"name" | "phone" | "email" | "source" | "campaign" | "notes", string[]> = {
  source: ["source", "lead source"],
  campaign: ["campaign", "campaign name"],
  notes: ["notes", "note", "remarks", "comment", "comments"],
  name: ["name", "full name", "fullname", "lead name", "customer name", "client name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact", "contact number", "whatsapp", "number"],
  email: ["email", "email address", "e-mail"],
};

function columnIndex(header: string[], field: keyof typeof HEADER_ALIASES): number {
  return header.findIndex((cell) => HEADER_ALIASES[field].includes(cell.trim().toLowerCase()));
}

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required to import leads.");
}

function cleanOptional(value: string | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Imports leads from CSV text. Founder only. One batch row records the file, who and when; each lead points to it. */
export async function importLeadsFromCsv(
  repos: LeadRepositories,
  csvText: string,
  meta: { name?: string; originalFilename?: string | null; campaign?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<ImportResult> {
  assertFounder(actor);
  if (typeof csvText !== "string" || csvText.trim() === "") throw new LeadValidationError("file", "The file is empty.");
  if (csvText.length > MAX_IMPORT_BYTES) throw new LeadValidationError("file", "The file is too large (max 1 MB). Split it and import in parts.");

  const rows = parseCsv(csvText);
  const header = rows[0] ?? [];
  const nameCol = columnIndex(header, "name");
  const phoneCol = columnIndex(header, "phone");
  const emailCol = columnIndex(header, "email");
  const sourceCol = columnIndex(header, "source");
  const campaignCol = columnIndex(header, "campaign");
  const notesCol = columnIndex(header, "notes");
  if (phoneCol === -1) throw new LeadValidationError("file", 'The first row must have headers, including a "phone" (or "mobile") column.');
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) throw new LeadValidationError("file", "The file has a header but no leads.");
  if (dataRows.length > MAX_IMPORT_ROWS) throw new LeadValidationError("file", `That is ${dataRows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);

  const batchName = cleanOptional(meta.name, 120) ?? cleanOptional(meta.originalFilename ?? undefined, 120) ?? `Import ${now.toISOString().slice(0, 10)}`;
  const campaign = cleanOptional(meta.campaign ?? undefined, 120);

  return repos.transaction(async (tx) => {
    const batch = await tx.importBatches.create({ name: batchName, originalFilename: cleanOptional(meta.originalFilename ?? undefined, 200), campaign, importedBy: actor.actorId, importedAt: now });
    const duplicates: ImportRowIssue[] = [];
    const rejected: ImportRowIssue[] = [];
    const seen = new Set<string>();
    const leadIds: string[] = [];
    let created = 0;

    for (const [index, cells] of dataRows.entries()) {
      const row = index + 1;
      const phone = normalizePhone(cells[phoneCol], "IN");
      if (!phone.ok) {
        rejected.push({ row, reason: phone.reason === "EMPTY" ? "No phone number" : "Not a valid phone number" });
        continue;
      }
      if (seen.has(phone.e164)) {
        duplicates.push({ row, reason: "Repeated in this file" });
        continue;
      }
      seen.add(phone.e164);

      const email = emailCol === -1 ? null : cleanOptional(cells[emailCol], MAX_EMAIL);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rejected.push({ row, reason: "Not a valid email address" });
        continue;
      }
      const { lead, created: isNew } = await tx.leads.upsertByPhone({
        phoneE164: phone.e164,
        name: nameCol === -1 ? null : cleanOptional(cells[nameCol], MAX_NAME),
        email: email ? email.toLowerCase() : null,
        contactPreference: "PHONE_CALL",
        developerId: null,
        sourceCta: null,
        sessionId: null,
        userId: null,
        // The lead SOURCE (where it came from) is kept apart from how it is called. A per-row source/campaign wins over the batch one.
        source: {
          sourceType: "SELF_GENERATED",
          sourceDetail: cleanOptional(sourceCol === -1 ? undefined : cells[sourceCol], 120) ?? cleanOptional(campaignCol === -1 ? undefined : cells[campaignCol], 120) ?? campaign ?? batchName,
          creationMethod: "CSV_IMPORT",
          importBatchId: batch.id,
          createdBy: actor.actorId,
        },
        now,
      });
      leadIds.push(lead.id);
      if (!isNew) {
        // Never overwritten: the existing lead is left exactly as it was.
        duplicates.push({ row, reason: "Already in the system" });
        continue;
      }
      const note = cleanOptional(notesCol === -1 ? undefined : cells[notesCol], 2000);
      if (note) {
        await tx.events.append({ leadId: lead.id, eventType: "NOTE_ADDED", actorType: "FOUNDER", actorId: actor.actorId, developerId: null, fromStatus: null, toStatus: null, payload: { note, via: "IMPORT" }, createdAt: now });
      }
      await tx.events.append({
        leadId: lead.id,
        eventType: "LEAD_CREATED",
        actorType: "FOUNDER",
        actorId: actor.actorId,
        developerId: null,
        fromStatus: null,
        toStatus: null,
        payload: { via: "IMPORT", batchId: batch.id },
        createdAt: now,
      });
      created += 1;
    }

    const finished = await tx.importBatches.finish(batch.id, { rowCount: dataRows.length, createdCount: created, duplicateCount: duplicates.length, rejectedCount: rejected.length });
    return { batch: finished, totalRows: dataRows.length, leadIds, created, duplicates, rejected };
  });
}

export const HAND_CREATED_METHODS: readonly CreationMethod[] = ["COLD_CALLING", "EMPLOYEE_CREATED", "FOUNDER_CREATED", "DIALER_GENERATED"];

/**
 * Creates one self-generated lead by hand. A team member's lead is theirs from the start; the Founder's goes to the
 * Founder queue. A number already in the system is never touched — the caller is told it exists, nothing more.
 */
export async function createSelfGeneratedLead(
  repos: LeadRepositories,
  input: { phone: string; name?: string | null; email?: string | null; creationMethod: CreationMethod; sourceDetail?: string | null },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<{ created: true; lead: Lead } | { created: false }> {
  if (!actor.actorId || (actor.actorType !== "FOUNDER" && actor.actorType !== "EMPLOYEE")) throw new UnauthorizedLeadActionError("A signed-in team member is required.");
  if (!(HAND_CREATED_METHODS as readonly string[]).includes(input.creationMethod)) throw new LeadValidationError("creationMethod", "That is not a way to add a lead by hand.");
  const method: CreationMethod = actor.actorType === "FOUNDER" && input.creationMethod === "EMPLOYEE_CREATED" ? "FOUNDER_CREATED" : actor.actorType === "EMPLOYEE" && input.creationMethod === "FOUNDER_CREATED" ? "EMPLOYEE_CREATED" : input.creationMethod;
  const phone = normalizePhone(input.phone, "IN");
  if (!phone.ok) throw new LeadValidationError("phone", phone.reason === "EMPTY" ? "Enter a phone number." : "Enter a valid phone number.");
  const email = cleanOptional(input.email ?? undefined, MAX_EMAIL);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LeadValidationError("email", "Enter a valid email address.");

  return repos.transaction(async (tx) => {
    const { lead, created } = await tx.leads.upsertByPhone({
      phoneE164: phone.e164,
      name: cleanOptional(input.name ?? undefined, MAX_NAME),
      email: email ? email.toLowerCase() : null,
      contactPreference: "PHONE_CALL",
      developerId: null,
      sourceCta: null,
      sessionId: null,
      userId: null,
      source: { sourceType: "SELF_GENERATED", sourceDetail: cleanOptional(input.sourceDetail ?? undefined, 120), creationMethod: method, importBatchId: null, createdBy: actor.actorId! },
      now,
    });
    // A number already in the system is never handed back: telling a team member WHICH lead it is would show them a
    // lead that may not be theirs. They learn only that it exists.
    if (!created) return { created: false };
    await tx.events.append({ leadId: lead.id, eventType: "LEAD_CREATED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { via: method }, createdAt: now });
    if (actor.actorType !== "EMPLOYEE") return { created: true, lead };
    await tx.events.append({ leadId: lead.id, eventType: "OWNER_CHANGED", actorType: actor.actorType, actorId: actor.actorId!, developerId: null, fromStatus: null, toStatus: null, payload: { from: null, to: actor.actorId!, via: "CREATED" }, createdAt: now });
    return { created: true, lead: await tx.leads.update(lead.id, { ownerId: actor.actorId!, lastActivityAt: now }, now) };
  });
}
