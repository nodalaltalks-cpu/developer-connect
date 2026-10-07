"use client";

import { useState, useTransition } from "react";
import { createProjectAction, setProjectStatusAction, type ProjectActionResult } from "@/app/admin/_actions/lead-actions";

/** Adds a project to the inventory (Founder only - the action authorizes first). Unknown fields can stay blank: the matcher then says Unknown. */

const FIELD = "min-h-11 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectForm({ developers }: { developers: Array<{ id: string; name: string }> }) {
  const [developerId, setDeveloperId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [configurations, setConfigurations] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [currency, setCurrency] = useState<"INR" | "AED">("INR");
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[,\s]/g, "")));

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await createProjectAction({
        developerId,
        name,
        city,
        locality: locality || null,
        propertyType: propertyType || null,
        configurations: configurations.split(",").map((c) => c.trim()).filter(Boolean),
        priceMin: num(priceMin),
        priceMax: num(priceMax),
        currency: num(priceMin) === null && num(priceMax) === null ? null : currency,
      });
      setResult(res);
      if (res.ok) {
        setName("");
        setLocality("");
        setConfigurations("");
        setPriceMin("");
        setPriceMax("");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <label htmlFor="p-dev" className="block text-sm font-medium text-foreground">
          Developer
        </label>
        <select id="p-dev" value={developerId} onChange={(e) => setDeveloperId(e.target.value)} className={`${FIELD} mt-1.5`}>
          <option value="">Choose a developer</option>
          {developers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="p-name" className="block text-sm font-medium text-foreground">
          Project name
        </label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={`${FIELD} mt-1.5`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="p-city" className="block text-sm font-medium text-foreground">
            City
          </label>
          <input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="p-loc" className="block text-sm font-medium text-foreground">
            Locality (optional)
          </label>
          <input id="p-loc" value={locality} onChange={(e) => setLocality(e.target.value)} maxLength={80} className={`${FIELD} mt-1.5`} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="p-type" className="block text-sm font-medium text-foreground">
            Property type (optional)
          </label>
          <input id="p-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} maxLength={60} placeholder="e.g. Apartment" className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="p-conf" className="block text-sm font-medium text-foreground">
            Configurations (optional, comma separated)
          </label>
          <input id="p-conf" value={configurations} onChange={(e) => setConfigurations(e.target.value)} placeholder="e.g. 2 BHK, 3 BHK" className={`${FIELD} mt-1.5`} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="p-min" className="block text-sm font-medium text-foreground">
            Minimum price (optional)
          </label>
          <input id="p-min" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="p-max" className="block text-sm font-medium text-foreground">
            Maximum price (optional)
          </label>
          <input id="p-max" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className={`${FIELD} mt-1.5`} />
        </div>
        <div>
          <label htmlFor="p-cur" className="block text-sm font-medium text-foreground">
            Currency
          </label>
          <select id="p-cur" value={currency} onChange={(e) => setCurrency(e.target.value as "INR" | "AED")} className={`${FIELD} mt-1.5`}>
            <option value="INR">INR</option>
            <option value="AED">AED</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !developerId || !name.trim() || !city.trim()}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add project"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Project added.
        </p>
      )}
    </div>
  );
}

export function ProjectStatusButton({ projectId, status }: { projectId: string; status: "ACTIVE" | "INACTIVE" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setProjectStatusAction(projectId, status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
            setError(res.ok ? null : res.error);
          })
        }
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {status === "ACTIVE" ? "Deactivate" : "Activate"}
      </button>
      {error && <span role="alert" className="ml-2 text-xs text-red-700">{error}</span>}
    </>
  );
}
