"use client";

/**
 * A date-and-time input that ALWAYS says which day it is. The phone's own picker shows only the numbers, so a Saturday or
 * a Sunday looked the same as any other day. The line under the field spells it out ("Saturday, 10 October 2026 · 10:00 AM")
 * and warns when the day is a weekend. The value is the same "YYYY-MM-DDTHH:mm" India wall-clock string as before.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-10T10:00" → "Saturday, 10 October 2026 · 10:00 AM", or null when it is not a complete date and time. Pure. */
export function describeWhen(value: string): { text: string; weekend: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  // The wall-clock date is already the business-zone date: build it in UTC so no time zone can shift the weekday.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== month - 1) return null;
  const weekday = date.getUTCDay();
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const text = `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]} ${year} · ${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  return { text, weekend: weekday === 0 || weekday === 6 };
}

export function WhenInput({ value, onChange, className, id, min, ariaLabel }: { value: string; onChange: (value: string) => void; className?: string; id?: string; min?: string; ariaLabel?: string }) {
  const described = describeWhen(value);
  return (
    <>
      <input id={id} type="datetime-local" aria-label={ariaLabel} value={value} min={min} onChange={(e) => onChange(e.target.value)} className={className} />
      <p aria-live="polite" className={`mt-1.5 text-base font-semibold ${described ? "text-foreground" : "text-muted-foreground"}`}>
        {described ? described.text : "Choose a date and time"}
        {described && <span className="font-normal text-muted-foreground"> (India time)</span>}
        {described?.weekend && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Weekend</span>}
      </p>
    </>
  );
}
