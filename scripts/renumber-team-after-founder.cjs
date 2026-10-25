#!/usr/bin/env node
/**
 * ONE-OFF, FOUNDER-RUN. Run it yourself; nothing in the app calls it.
 *
 * Situation: the Founder's own calling-workspace record took DC2, so the first real employee is DC3.
 * Goal: the Founder is DC1 only, and the first employee is DC2.
 *
 * What --apply does, in ONE transaction (all or nothing):
 *   1. Deletes the Founder's self-enrolled workspace record (DC2) and its 3 lifecycle events.
 *   2. Renames DC3 -> DC2 (the record and its events).
 *   3. Resets the counter so the next employee is DC3.
 * To do that it must switch off two safeguards (staff_members_guard, staff_events_append_only) for the length of the
 * transaction; both are switched back on before COMMIT and the script verifies it.
 *
 * It REFUSES (changes nothing) unless every assumption holds: exactly two team records; DC2 is self-enrolled by the
 * Founder; DC3 is a different person; neither owns a lead or appears on any lead event, call, follow-up, site visit or
 * calling batch; the counter is at 3. Without --apply it only reports (a dry run).
 *
 * Usage (from the project folder):
 *   node --env-file=.env.local scripts/renumber-team-after-founder.cjs            # dry run
 *   node --env-file=.env.local scripts/renumber-team-after-founder.cjs --apply    # does it
 * Take a Neon backup or branch first. A JSON copy of the two records is also written to your temp folder.
 */
const { Client } = require("pg");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APPLY = process.argv.includes("--apply");

// [table, column] pairs that can hold a person's sign-in id from the sales system.
const REFERENCES = [
  ["leads", "owner_id"],
  ["lead_events", "actor_id"],
  ["lead_follow_ups", "owner_id"],
  ["lead_follow_ups", "completed_by"],
  ["lead_calls", "staff_user_id"],
  ["site_visits", "staff_user_id"],
  ["calling_batches", "assigned_to"],
];

function fail(message) {
  console.error("REFUSED:", message);
  console.error("Nothing was changed.");
  process.exit(1);
}

(async () => {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL_UNPOOLED is not set (run with --env-file=.env.local).");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN");
    const members = (await c.query("select * from staff_members order by substr(employee_id,3)::int for update")).rows;
    if (members.length !== 2) fail(`expected exactly 2 team records, found ${members.length}.`);
    const [a, b] = members;
    if (a.employee_id !== "DC2" || b.employee_id !== "DC3") fail(`expected DC2 and DC3, found ${a.employee_id} and ${b.employee_id}.`);
    if (a.user_id.startsWith("invited:") || a.user_id !== a.created_by) fail("DC2 is not a record the Founder enrolled for themselves.");
    const selfEnrol = (await c.query("select 1 from staff_events where staff_id = $1 and payload->>'via' = 'FOUNDER_SELF_ENROLLED' limit 1", [a.id])).rowCount;
    if (!selfEnrol) fail("DC2 has no 'founder self-enrolled' event.");
    if (b.user_id === a.user_id) fail("DC3 is the same sign-in as DC2.");
    if (b.status === "EXITED") fail("DC3 has exited.");

    for (const m of [a, b]) {
      for (const [table, column] of REFERENCES) {
        const n = Number((await c.query(`select count(*) n from ${table} where ${column} = $1`, [m.user_id])).rows[0].n);
        if (n > 0) fail(`${m.employee_id} appears in ${table}.${column} (${n} rows). Renumbering would orphan that history.`);
      }
    }
    const seq = (await c.query("select last_value from staff_employee_number_seq")).rows[0];
    if (Number(seq.last_value) !== 3) fail(`the employee counter is at ${seq.last_value}, expected 3.`);

    const events = (await c.query("select * from staff_events where staff_id = any($1) order by occurred_at", [[a.id, b.id]])).rows;
    console.log("Checks passed.");
    console.log(`  DELETE  ${a.employee_id} (${a.display_name}) and its ${events.filter((e) => e.staff_id === a.id).length} lifecycle events`);
    console.log(`  RENAME  ${b.employee_id} (${b.display_name}) -> DC2, with its ${events.filter((e) => e.staff_id === b.id).length} lifecycle event(s)`);
    console.log("  RESET   counter so the next employee is DC3");

    if (!APPLY) {
      await c.query("ROLLBACK");
      console.log("\nDRY RUN: nothing changed. Re-run with --apply to do it.");
      return;
    }

    const backup = path.join(os.tmpdir(), `team-backup-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify({ members, events }, null, 2));
    console.log(`\nBackup of both records written to: ${backup}`);

    await c.query("ALTER TABLE staff_members DISABLE TRIGGER staff_members_guard");
    await c.query("ALTER TABLE staff_events DISABLE TRIGGER staff_events_append_only");
    await c.query("delete from staff_events where staff_id = $1", [a.id]);
    await c.query("delete from staff_members where id = $1", [a.id]);
    await c.query("update staff_members set employee_id = 'DC2' where id = $1", [b.id]);
    await c.query("update staff_events set employee_id = 'DC2' where staff_id = $1", [b.id]);
    await c.query("ALTER TABLE staff_members ENABLE TRIGGER staff_members_guard");
    await c.query("ALTER TABLE staff_events ENABLE TRIGGER staff_events_append_only");
    await c.query("select setval('staff_employee_number_seq', 2, true)");

    const left = (await c.query("select employee_id from staff_members")).rows.map((r) => r.employee_id);
    const trig = (await c.query("select tgname, tgenabled from pg_trigger where tgname in ('staff_members_guard','staff_events_append_only')")).rows;
    if (left.length !== 1 || left[0] !== "DC2") throw new Error(`unexpected result: ${left.join(",")}`);
    if (trig.length !== 2 || trig.some((t) => t.tgenabled !== "O")) throw new Error("a safeguard trigger is not enabled again");
    await c.query("COMMIT");
    console.log("DONE. Team records now: DC2. Safeguards are back on. The next employee will be DC3.");
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("ERROR, rolled back, nothing changed:", error.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
