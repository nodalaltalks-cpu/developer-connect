"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { toBusinessLocalInput } from "@/lib/leads/format";

/**
 * A date-and-time field that ALWAYS shows which day it is. The phone's own picker shows only numbers, so a Saturday looked like any
 * other day. This opens a calendar (weekday names on top, weekends tinted, today ringed), the next seven days as one-tap day cards
 * ("Tue 13"), and time slots. The value is the same "YYYY-MM-DDTHH:mm" India wall-clock string as before, and the line under the
 * field spells the choice out ("Saturday, 10 October 2026 · 10:00 AM") with a Weekend tag.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRID_HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

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
  const text = `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]} ${year} · ${pad(h12)}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
  return { text, weekend: weekday === 0 || weekday === 6 };
}

/** Add days to a "YYYY-MM-DD" calendar date. Pure (UTC arithmetic, no time zone). */
export function addDaysTo(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The calendar grid for a month, Monday first: leading blanks, then 1..n. Pure. */
export function monthGrid(year: number, month: number): Array<number | null> {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const SLOTS: string[] = [];
for (let h = 8; h <= 21; h += 1) for (const mm of [0, 30]) if (!(h === 21 && mm === 30)) SLOTS.push(`${pad(h)}:${pad(mm)}`);
const slotLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};

export function WhenInput({ value, onChange, className, id, min, ariaLabel }: { value: string; onChange: (value: string) => void; className?: string; id?: string; min?: string; ariaLabel?: string }) {
  const described = describeWhen(value);
  const today = toBusinessLocalInput(new Date()).slice(0, 10);
  const minDate = min && /^\d{4}-\d{2}-\d{2}/.test(min) ? min.slice(0, 10) : null;
  const minTime = min && /T\d{2}:\d{2}/.test(min) ? min.slice(11, 16) : null;

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [view, setView] = useState<{ y: number; m: number }>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });

  function openSheet() {
    const d = value.length >= 16 ? value.slice(0, 10) : "";
    setDate(d);
    setTime(value.length >= 16 ? value.slice(11, 16) : "");
    const base = d || today;
    setView({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });
    setOpen(true);
  }

  const dayDisabled = (d: string) => (minDate !== null && d < minDate) || false;
  const slotDisabled = (t: string) => date !== "" && minDate !== null && date === minDate && minTime !== null && t < minTime;
  const next7 = Array.from({ length: 7 }, (_, i) => addDaysTo(today, i)).filter((d) => !dayDisabled(d));
  const ready = date !== "" && time !== "" && !slotDisabled(time);

  function confirm() {
    if (!ready) return;
    onChange(`${date}T${time}`);
    setOpen(false);
  }

  const cells = monthGrid(view.y, view.m);
  const shiftMonth = (delta: number) => setView((v) => {
    const t = new Date(Date.UTC(v.y, v.m - 1 + delta, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
  });

  return (
    <>
      <button type="button" id={id} aria-label={ariaLabel} aria-haspopup="dialog" onClick={openSheet} className={`${className ?? ""} flex items-center justify-between gap-2 text-left`}>
        <span className={described ? "text-foreground" : "text-muted-foreground"}>{described ? `${WEEKDAYS_SHORT[weekdayOf(value.slice(0, 10))]}, ${Number(value.slice(8, 10))} ${MONTHS_SHORT[Number(value.slice(5, 7)) - 1]} · ${described.text.split(" · ")[1]}` : "Tap to choose day and time"}</span>
        <span aria-hidden="true" className="text-lg">📅</span>
      </button>
      <p aria-live="polite" className={`mt-1.5 text-base font-semibold ${described ? "text-foreground" : "text-muted-foreground"}`}>
        {described ? described.text : "Choose a date and time"}
        {described && <span className="font-normal text-muted-foreground"> (India time)</span>}
        {described?.weekend && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Weekend</span>}
      </p>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose day and time">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Next 7 days</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {next7.map((d, i) => {
                const wd = weekdayOf(d);
                const weekend = wd === 0 || wd === 6;
                const on = date === d;
                return (
                  <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={on} className={`flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-center ${on ? "border-accent bg-accent text-accent-foreground" : weekend ? "border-amber-400 bg-amber-50 text-foreground" : "border-border bg-background text-foreground"}`}>
                    <span className="text-xs font-semibold">{i === 0 ? "Today" : i === 1 ? "Tmrw" : WEEKDAYS_SHORT[wd]}</span>
                    <span className="text-lg font-extrabold leading-tight">{Number(d.slice(8, 10))}</span>
                    <span className="text-[10px] leading-none">{i < 2 ? WEEKDAYS_SHORT[wd] : MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="flex size-11 items-center justify-center rounded-full border border-border text-lg hover:bg-muted">‹</button>
              <p className="text-base font-bold text-foreground">{MONTHS[view.m - 1]} {view.y}</p>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="flex size-11 items-center justify-center rounded-full border border-border text-lg hover:bg-muted">›</button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${MONTHS[view.m - 1]} ${view.y}`}>
              {GRID_HEAD.map((h) => (
                <span key={h} className={`py-1 text-xs font-bold ${h === "Sat" || h === "Sun" ? "text-amber-700" : "text-muted-foreground"}`}>{h}</span>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <span key={`b${i}`} />;
                const d = ymd(view.y, view.m, day);
                const wd = weekdayOf(d);
                const weekend = wd === 0 || wd === 6;
                const off = dayDisabled(d);
                const on = date === d;
                return (
                  <button key={d} type="button" disabled={off} onClick={() => setDate(d)} aria-pressed={on} aria-label={`${WEEKDAYS[wd]} ${day} ${MONTHS[view.m - 1]}`} className={`flex min-h-11 items-center justify-center rounded-lg text-base ${on ? "bg-accent font-bold text-accent-foreground" : weekend ? "bg-amber-50 text-foreground" : "text-foreground"} ${d === today && !on ? "ring-2 ring-accent" : ""} ${off ? "opacity-30" : "hover:bg-muted"}`}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Time</p>
            <div className="grid grid-cols-3 gap-2">
              {SLOTS.map((t) => {
                const off = slotDisabled(t);
                const on = time === t;
                return (
                  <button key={t} type="button" disabled={off} onClick={() => setTime(t)} aria-pressed={on} className={`min-h-11 rounded-lg border text-sm font-medium ${on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-foreground"} ${off ? "opacity-30" : "hover:bg-muted"}`}>
                    {slotLabel(t)}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="min-h-6 text-sm font-semibold text-foreground">{date && time ? describeWhen(`${date}T${time}`)?.text : "Pick a day and a time"}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="min-h-12 rounded-lg border border-border px-4 text-base font-medium text-foreground hover:bg-muted">Clear</button>
            <button type="button" disabled={!ready} onClick={confirm} className="min-h-12 flex-1 rounded-lg bg-accent px-4 text-base font-bold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">Set</button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
