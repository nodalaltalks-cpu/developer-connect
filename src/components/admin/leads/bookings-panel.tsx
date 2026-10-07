"use client";

import { useState, useTransition } from "react";
import { createBookingAction, recordCommissionReceivedAction, type FinanceActionResult } from "@/app/admin/_actions/finance-actions";
import { formatDateTimeFull, formatEnumLabel, formatMoneyExact as formatMoney } from "@/lib/leads/format";
import type { LeadCurrency } from "@/lib/leads/types";

/**
 * Bookings on the Founder's lead page: the revenue ground truth. Record a booking (value and the commission expected,
 * in INR or AED - never converted) and, later, the commission actually received. Founder-only: the actions authorize
 * the Founder first and the services check again.
 */

export interface BookingRowView {
  id: string;
  projectName: string | null;
  currency: LeadCurrency;
  bookingValue: number;
  commissionExpected: number;
  commissionReceived: number;
  commissionReceivedAt: string | null;
  status: "BOOKED" | "CANCELLED";
}

const FIELD = "min-h-11 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[,\s]/g, "")));

function ReceivedForm({ leadId, booking }: { leadId: string; booking: BookingRowView }) {
  const [value, setValue] = useState(String(booking.commissionReceived));
  const [result, setResult] = useState<FinanceActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 grid grid-cols-1 gap-2">
      <label className="text-xs font-medium text-foreground" htmlFor={`rcv-${booking.id}`}>
        Commission received so far ({booking.currency})
      </label>
      <div className="flex gap-2">
        <input id={`rcv-${booking.id}`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={`${FIELD} flex-1`} />
        <button type="button" className={`${BTN} shrink-0`} disabled={pending} onClick={() => startTransition(async () => setResult(await recordCommissionReceivedAction(leadId, booking.id, num(value))))}>
          Save
        </button>
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-xs text-red-700">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <p role="status" className="text-xs text-green-700">
          Saved.
        </p>
      )}
    </div>
  );
}

export function BookingsPanel({ leadId, bookings, projects }: { leadId: string; bookings: BookingRowView[]; projects: Array<{ id: string; label: string }> }) {
  const [currency, setCurrency] = useState<LeadCurrency>("INR");
  const [value, setValue] = useState("");
  const [expected, setExpected] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [result, setResult] = useState<FinanceActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="bookings-heading" className="rounded-lg border border-border p-4">
      <h2 id="bookings-heading" className="text-sm font-semibold text-foreground">
        Bookings and commission
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No bookings recorded.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                {b.projectName ?? "Booking"} — {formatMoney(b.bookingValue, b.currency)} · {formatEnumLabel(b.status)}
              </p>
              <p className="text-xs text-muted-foreground">
                Commission expected {formatMoney(b.commissionExpected, b.currency)} · received {formatMoney(b.commissionReceived, b.currency)}
                {b.commissionReceivedAt ? ` (last ${formatDateTimeFull(new Date(b.commissionReceivedAt))})` : ""} · outstanding {formatMoney(Math.max(0, b.commissionExpected - b.commissionReceived), b.currency)}
              </p>
              {b.status === "BOOKED" && <ReceivedForm leadId={leadId} booking={b} />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Record a booking</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <label htmlFor="bk-cur" className="text-xs text-foreground">
              Currency
            </label>
            <select id="bk-cur" value={currency} onChange={(e) => setCurrency(e.target.value as LeadCurrency)} className={FIELD}>
              <option value="INR">INR</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <div className="col-span-2 min-w-0">
            <label htmlFor="bk-val" className="text-xs text-foreground">
              Booking value
            </label>
            <input id="bk-val" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={FIELD} />
          </div>
        </div>
        <label htmlFor="bk-exp" className="text-xs text-foreground">
          Commission expected (same currency)
        </label>
        <input id="bk-exp" inputMode="numeric" value={expected} onChange={(e) => setExpected(e.target.value)} className={FIELD} />
        <label htmlFor="bk-proj" className="text-xs text-foreground">
          Project
        </label>
        <select id="bk-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD}>
          <option value="">Not in the project list</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {!projectId && <input aria-label="Project name" placeholder="Project name (optional)" value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={120} className={FIELD} />}
        <button
          type="button"
          className={BTN}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await createBookingAction(leadId, { currency, bookingValue: num(value), commissionExpected: expected.trim() === "" ? 0 : num(expected), projectId: projectId || null, projectName: projectName || null });
              setResult(res);
              if (res.ok) {
                setValue("");
                setExpected("");
              }
            })
          }
        >
          {pending ? "Saving…" : "Record booking"}
        </button>
        {result && !result.ok && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {result.error}
          </p>
        )}
        {result && result.ok && (
          <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
            Booking recorded.
          </p>
        )}
      </div>
    </section>
  );
}
