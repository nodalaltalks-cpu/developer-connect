"use client";

import { useState } from "react";
import type { ProfileFieldConfig } from "@/lib/profile/types";
import { formatIndianAmount, parseIndianAmount } from "@/lib/profile/amount-format";

const inputClassName =
  "mt-1.5 w-full min-h-11 rounded-md border border-border px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

interface RangeValue {
  min?: number;
  max?: number;
}

/**
 * Renders the right input for a field's configured type. This is the only
 * place a field's `value`/`onChange` shape is interpreted — field-config.ts
 * defines WHAT the fields are, this defines HOW each type is edited.
 */
export function ProfileFieldInput({
  field,
  value,
  onChange,
}: {
  field: ProfileFieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <TextField field={field} value={typeof value === "string" ? value : ""} onChange={onChange} />
      );

    case "date":
      return (
        <div>
          <label className={labelClassName}>{field.label}</label>
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
          />
          {field.helperText && <p className="mt-1 text-xs text-muted-foreground">{field.helperText}</p>}
        </div>
      );

    case "select":
      return (
        <div>
          <label className={labelClassName}>{field.label}</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {field.options?.map((option) => (
              <Chip key={option.value} selected={value === option.value} onClick={() => onChange(option.value)}>
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          <label className={labelClassName}>{field.label}</label>
          {field.helperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
          <div className="mt-1.5 flex flex-wrap gap-2">
            {field.options?.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <Chip
                  key={option.value}
                  selected={isSelected}
                  onClick={() =>
                    onChange(
                      isSelected
                        ? selected.filter((v) => v !== option.value)
                        : [...selected, option.value],
                    )
                  }
                >
                  {option.label}
                  {option.description && (
                    <span className="sr-only"> — {option.description}</span>
                  )}
                </Chip>
              );
            })}
          </div>
          {field.options?.some((o) => o.description) && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {field.options
                .filter((o) => selected.includes(o.value) && o.description)
                .map((o) => (
                  <li key={o.value}>
                    <span className="font-medium text-foreground">{o.label}:</span> {o.description}
                  </li>
                ))}
            </ul>
          )}
        </div>
      );
    }

    case "boolean":
      return (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>
            <span className="text-sm font-medium text-foreground">{field.label}</span>
            {field.helperText && (
              <span className="block text-xs text-muted-foreground">{field.helperText}</span>
            )}
          </span>
        </label>
      );

    case "range": {
      const range = (value ?? {}) as RangeValue;
      return (
        <div>
          <label className={labelClassName}>{field.label}</label>
          {field.helperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
          <div className="mt-1.5 flex items-center gap-3">
            <AmountInput
              placeholder="Min · e.g. 75 Lakh"
              amount={range.min}
              onCommit={(min) => onChange({ ...range, min })}
            />
            <span className="text-muted-foreground">to</span>
            <AmountInput
              placeholder="Max · e.g. 1.2 Cr"
              amount={range.max}
              onCommit={(max) => onChange({ ...range, max })}
            />
          </div>
        </div>
      );
    }

    case "location-multiselect":
      return <LocationMultiselect field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;

    default:
      return null;
  }
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: ProfileFieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={labelClassName}>{field.label}</label>
      <input
        type="text"
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      />
      {field.helperText && <p className="mt-1 text-xs text-muted-foreground">{field.helperText}</p>}
    </div>
  );
}

/**
 * A single Budget min/max input the user can genuinely TYPE into — "50
 * Lakh", "1.2 Cr", or a plain "5000000" all work (see amount-format.ts).
 * The underlying model is still a plain number (`RangeValue.min`/`.max`,
 * unchanged) — this component only owns the text the person is CURRENTLY
 * typing, which can legitimately be unparseable mid-keystroke ("1.2 C").
 *
 * `onCommit` only ever fires with a real parsed number or `undefined`
 * (an intentionally cleared field) — never a malformed value. While the
 * typed text doesn't parse, the field shows a validation hint and simply
 * doesn't call `onCommit` yet; nothing bad gets written to the profile
 * just because a keystroke briefly leaves the text in a partial state.
 */
function AmountInput({
  placeholder,
  amount,
  onCommit,
}: {
  placeholder: string;
  amount: number | undefined;
  onCommit: (amount: number | undefined) => void;
}) {
  // Seeded once from the initial saved value; deliberately NOT kept in
  // sync via a useEffect keyed on `amount` afterwards — `amount` changes
  // as an immediate, same-render consequence of this component's own
  // onCommit below, and reformatting the draft from THAT (e.g. "50000"
  // silently becoming "50,000" while the user is still typing more
  // digits after it) would fight the very typing this field exists to
  // support. Reformatting only happens deliberately, on blur.
  const [draft, setDraft] = useState(amount !== undefined ? formatIndianAmount(amount) : "");
  const [invalid, setInvalid] = useState(false);

  function handleChange(text: string) {
    setDraft(text);
    if (text.trim() === "") {
      setInvalid(false);
      onCommit(undefined);
      return;
    }
    const parsed = parseIndianAmount(text);
    if (parsed !== null) {
      setInvalid(false);
      onCommit(parsed);
    } else {
      // Don't touch the committed model yet — just flag it so the user
      // gets a hint while still mid-typing a valid amount.
      setInvalid(true);
    }
  }

  function handleBlur() {
    // On leaving the field, reformat to the last genuinely committed
    // value — clears any leftover unparseable text rather than leaving it
    // stuck on screen looking saved when it never was.
    setDraft(amount !== undefined ? formatIndianAmount(amount) : "");
    setInvalid(false);
  }

  // A quiet "= 1.2 Cr" readout once the typed amount is large enough that
  // the friendly form isn't just the same digits back — e.g. someone who
  // typed "5000000" sees confirmation it means 50 Lakh, but someone who
  // already typed "75 Lakh" doesn't see a redundant repeat of it.
  const preview = amount !== undefined && !invalid ? formatIndianAmount(amount) : null;
  const showPreview = preview !== null && preview !== draft.trim();

  return (
    <div className="min-w-0 flex-1">
      <input
        type="text"
        inputMode="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        aria-invalid={invalid}
        className={`${inputClassName} ${invalid ? "border-red-500" : ""}`}
      />
      {invalid ? (
        <p className="mt-1 text-xs text-red-600">Try an amount like &quot;75 Lakh&quot; or &quot;1.2 Cr&quot;.</p>
      ) : (
        showPreview && <p className="mt-1 text-xs text-muted-foreground">= ₹{preview}</p>
      )}
    </div>
  );
}

function LocationMultiselect({
  field,
  value,
  onChange,
}: {
  field: ProfileFieldConfig;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addLocation(name: string) {
    const trimmed = name.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div>
      <label className={labelClassName}>{field.label}</label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={field.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLocation(draft);
            }
          }}
          className={`${inputClassName} mt-0`}
        />
        <button
          type="button"
          onClick={() => addLocation(draft)}
          className="min-h-11 shrink-0 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Add
        </button>
      </div>

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((location) => (
            <span
              key={location}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm text-accent-hover"
            >
              {location}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== location))}
                aria-label={`Remove ${location}`}
                className="text-accent-hover/70 hover:text-accent-hover"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {field.options && field.options.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-muted-foreground">Or pick from covered localities</p>
          <div className="mt-1.5 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {field.options.map((option) => {
              const isSelected = value.includes(option.label);
              return (
                <Chip key={option.value} selected={isSelected} onClick={() => (isSelected ? onChange(value.filter((v) => v !== option.label)) : addLocation(option.label))}>
                  {option.label}
                </Chip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
