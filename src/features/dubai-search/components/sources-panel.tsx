import { PLANNED_SOURCES, SOURCES } from "../lib/sources.ts";

/** An honest statement of what is and is not connected. Nothing here claims a live integration. */
export function SourcesPanel() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Searched in this build</h3>
        <ul className="mt-3 space-y-2 text-sm text-neutral-700">
          {SOURCES.map((s) => (
            <li key={s.id}>
              <span className="font-medium text-neutral-900">{s.name}</span>: {s.kind === "demo" ? "made-up demonstration data, not a real website." : s.description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Real websites: not connected</h3>
        <p className="mt-1 text-sm text-neutral-600">No real property website is integrated or tested yet. Public access does not by itself give permission to copy or republish listings, so none is collected.</p>
        <ul className="mt-3 space-y-2 text-sm text-neutral-700">
          {PLANNED_SOURCES.map((s) => (
            <li key={s.name}>
              <span className="font-medium text-neutral-900">{s.name}</span> <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{s.status}</span>
              <span className="block text-neutral-600">{s.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
