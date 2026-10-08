# Employee identity, approval and exit

## Identity
- The Founder is always **DC1 · Ambish Singh · Founder**. DC1 is not a `staff_members` row.
- Every employee gets a permanent ID `DC<number>` (DC2, DC3, ...) from a database sequence (`staff_employee_number_seq`).
  IDs are unique (DB unique index), immutable (DB trigger), never reused (sequence only moves forward; rows are never deleted
  — a trigger refuses `DELETE`), and are never typed in by anyone. If DC3 exits, the next person is DC4 or higher.
- Search accepts `dc2`, `DC2`, ` Dc2 ` (case-insensitive, canonical form `DC2`). Founder > Team > search opens `/admin/staff/DC2`.

## Authentication is not authorization
Signing in with Google (Clerk) proves who someone is. Access to `/team` and to any employee API exists only when ALL hold:
1. a `staff_members` row exists for them with `status = ACTIVE` (and `active = true`), and
2. the Founder approved that record, and
3. the row is linked to their Clerk user id — which happens at first sign-in, only when an email Clerk has **verified**
   for that user equals the approved email on the record (compared case-insensitively, exact match otherwise).

Unknown Google accounts, INVITED/pending, INACTIVE and EXITED people all see one message:
"Your Google account is not approved for Developer Connects access. Please contact the Founder." It never says which case applies.
The Founder is not routed through `/team` (they use `/admin`).

## Lifecycle (`status`)
`INVITED` (ID issued, no access) → Founder **approves** → first matching sign-in → `ACTIVE` ⇄ `INACTIVE` → `EXITED` (terminal).
Every transition is a row in the append-only `staff_events` log (`EMPLOYEE_INVITED/APPROVED/ACTIVATED/DEACTIVATED/REACTIVATED/EXITED`)
with Employee ID, actor, server timestamp and ids-only metadata.

## Exit
Exit never deletes. It ends access immediately, blocks new assignment/CRM actions/calls/follow-ups, and records time, the Founder as actor and
a structured reason (RESIGNED, TERMINATED, CONTRACT_ENDED, OTHER). Calls, leads, requirements, site visits, bookings, revenue attribution,
ownership history and audit logs stay attributed to the person and are displayed as "DC3 · Name (exited)". Open leads stay where they are until the
Founder reassigns them or uses "Return open leads to my queue" (each return is its own timeline event: DC3 owned → returned by Founder → DC5).
An exited person cannot be reactivated, even by direct SQL (guard trigger).

## Future company email (recommendation only — nothing is bought or configured)
Personal Gmail addresses work today because the Founder approves each exact address. When the business is ready, the recommended setup is a
company domain with Google Workspace so addresses look like `name@<company-domain>`, and employees sign in with Google using that address.
The model needs no code change: the Founder adds each company address as the employee's email, and access still depends on the approved record
plus Clerk-verified email. Moving an existing employee to a company address = Founder updates/invites the new email (a new invite creates a new ID;
keep the same person on their existing ID by editing the email on the record once that Founder action exists). Domain purchase, DNS and Workspace accounts are
the Founder's decisions and are deliberately not part of this change.
