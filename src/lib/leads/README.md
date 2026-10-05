# Lead system (Revenue OS, Phases 1–3)

Private lead data for the property-assistance gate: leads, an immutable event
timeline, attribution touches, consent records and bookings. Nothing here is
ever shown on a public page, and none of it is copied into analytics.

## Environment variables

| Variable | Purpose | Required? | Where it is read |
|---|---|---|---|
| `LEAD_COOKIE_SECRET` | Signing key for the `dc_lead` cookie that lets a returning buyer continue with one tap ("Continue as +91 ••••••223?") instead of retyping their number. The cookie holds only a lead id and an expiry, signed with this key (HMAC-SHA256). | **Optional.** Without it the gate works normally; every buyer simply sees the full form and the one-tap convenience is off. It never falls back to an unsigned cookie. **Recommended for production** (set a long random value, 32+ characters). | `src/app/_actions/lead-gate-actions.ts` — `verifyLeadToken(…, process.env.LEAD_COOKIE_SECRET, …)` in `buildGate()` and `signLeadToken(…, process.env.LEAD_COOKIE_SECRET, …)` in `rememberLead()`; the signing/verification code is `src/lib/leads/gate/lead-cookie.ts`. |
| `LEAD_GATE_MODE` | Operator switch for the assistance gate. **Leave it unset in production.** | **Do not set on production.** Unset means `required`. `off` is honoured only outside Vercel production (`VERCEL_ENV !== "production"`), e.g. a preview deployment without the lead tables. | `src/lib/leads/gate/gate-config.ts` — `getGateMode()`, called from `src/app/developers/[slug]/page.tsx` and `src/app/_actions/lead-gate-actions.ts`. |

Existing variables the lead system also uses (already configured for the rest of
the product): `DATABASE_URL` (via `src/lib/developer-connect/db/client.ts`) and
the Clerk keys (signed-in user id on a lead, when the buyer happens to be signed in).

## Launch blockers (do not collect real production leads until all are closed)

1. **Production Clerk instance.** Production still runs on a Clerk *development*
   instance. Move to a production instance first.
2. **Migrations `0013`, `0014`, `0015` applied to production — before the code is
   deployed.** Otherwise every "Visit official website" press would show the
   retry error (by design the gate never silently lets a buyer through).
3. **Legal review:** the consent wording (`src/lib/leads/consent.ts`), the
   mandatory phone/WhatsApp collection, property-agent registration/licensing,
   and the "may receive payment" disclosure (About, Disclaimer, FAQ).
4. **A way to see new leads** (the Stage 4 founder CRM), so a captured lead is
   never left unseen.

## Real-device test checklist (before launch)

Chrome Android, Safari iPhone (if available), desktop Chrome. On each, check:

- the gate opens from the developer page and from a directory card
- the phone field (numeric keyboard, autofill, no zoom on focus)
- WhatsApp is preselected; switching to Phone call changes the consent wording
- the consent sentence is visible beside the button
- a successful submission saves and opens the official website
- new-tab behaviour: the site opens in a NEW tab and the gate shows "saved"
- popup blocking: with popups blocked the gate shows the "Continue to official
  website" link instead, and the details are still saved
- retry after failure (e.g. switch the device to airplane mode, submit, then
  go back online and press "Try again"): the website is NOT opened until a save succeeds
- returning visitor: "Welcome back — Continue as +91 ••••••XYZ?" appears on the
  next visit and one tap continues
- "Use a different number" returns to the full form

## Layout

- `phone.ts`, `consent.ts`, `attribution*.ts`, `redaction.ts`, `format.ts` — pure helpers
- `lead-service.ts` — every change to a lead (each writes an immutable event)
- `today-queue.ts`, `queue-config.ts` — the founder's explainable "where to spend the next hour" rules
- `gate/` — the buyer-facing gate: copy, state machine, server core, cookie token
- `repository.ts`, `memory-repository.ts`, `db/` — storage contracts and adapters

## Founder CRM (Stage 4)

Founder-only screens at `/admin/leads` (inbox + "needs attention") and
`/admin/leads/[id]` (detail, actions, timeline). Private data: every page calls
`requireFounder()` itself, every action calls `requireFounderForAction()` first
(`src/app/admin/_actions/lead-actions.ts`), and the service refuses a
non-founder actor a second time.

- `lead-views.ts` — the list views (new/hot/warm/cold/overdue/due today/qualified/all) and
  dashboard counts, defined once as pure rules. The Postgres adapter implements the same
  rules in SQL; `db/__tests__/founder-crm.integration.test.ts` asserts the two agree.
  "Today" is the founder's calendar day in `FOUNDER_TIME_ZONE` (`queue-config.ts`).
- `lead-reads.ts` — bounded read models (page of leads, attention list, lead detail). One
  batched summary query and one batched developer-name query per page; no per-row queries.
- `timeline.ts` — plain-words rendering of events.
- **Temperature** (HOT/WARM/COLD, nullable = not rated) is separate from status; every change
  is a `TEMPERATURE_CHANGED` event with the previous value. Migration `0016`.
- **Owner** changes are recorded (`OWNER_CHANGED`); there is no staff UI or permission model yet.
- **Calls / WhatsApp**: the Call and WhatsApp buttons are plain `tel:` / `wa.me` links. Nothing is
  logged by opening them — the founder taps an outcome (connected, no answer, busy, failed,
  wrong number / sent, replied) and one `CONTACT_LOGGED` event is written.
- The Today queue is unchanged and is reused as the "needs attention" view.

Not built yet (by design): site-visit records, project-level interest, new-lead notification,
staff roles, imports, dialer, finance views.
