import { useEffect, useRef } from "react";
import { buttonClassName } from "@/components/ui/button";
import type { GateCopy } from "@/lib/leads/gate/gate-copy";
import type { GateContactPreference } from "@/lib/leads/gate/gate-config";
import { PHONE_COUNTRIES, phoneCountryLabel } from "@/lib/phone-countries";
import type { GateState } from "@/lib/leads/gate/gate-flow";

/**
 * The assistance gate as a PURE view: it renders one GateState and reports
 * what the buyer did through callbacks. It imports nothing from the server,
 * so every state can be rendered (and tested) without a browser or a session.
 * The behaviour lives in assistance-gate.tsx.
 *
 * Mobile first: on a phone it is a bottom sheet (full width, rounded top,
 * capped at 92% of the viewport height and scrollable, padded for the home
 * indicator); from the `sm` breakpoint it becomes a centred dialog. Every
 * input is at least 16px (so iOS does not zoom) and every tap target is at
 * least 44px tall.
 */

const inputClass =
  "block min-h-12 rounded-md border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export interface AssistanceGateViewProps {
  state: GateState;
  copy: GateCopy;
  onEdit: (patch: Partial<GateState["form"]>) => void;
  onSubmit: () => void;
  onContinueReturning: () => void;
  onUseDifferentNumber: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** Stateless rendering of one gate state. */
export function AssistanceGateView({
  state,
  copy,
  onEdit,
  onSubmit,
  onContinueReturning,
  onUseDifferentNumber,
  onRetry,
  onClose,
}: AssistanceGateViewProps) {
  const submitting = state.phase === "submitting";
  const showForm =
    state.phase === "form" || (state.phase === "error" && state.lastAttempt !== "returning") || (submitting && state.lastAttempt !== "returning");
  const showReturning =
    state.phase === "returning" || (state.phase === "error" && state.lastAttempt === "returning") || (submitting && state.lastAttempt === "returning");
  const done = state.phase === "success";
  const phoneError = state.error?.field === "phone" || state.error?.code === "INVALID_PHONE";
  const nameError = state.error?.field === "name";
  const nameRef = useRef<HTMLInputElement>(null);
  // A number without a name: take the buyer to the name box, so the next thing they do is type it.
  useEffect(() => {
    if (nameError) {
      nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      nameRef.current?.focus({ preventScroll: true });
    }
  }, [nameError, state.error]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistance-gate-title"
        aria-busy={submitting || state.phase === "loading"}
        data-gate-phase={state.phase}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-background px-5 pt-5 shadow-xl sm:max-w-md sm:rounded-2xl sm:px-6 sm:pt-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label={copy.close}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <span aria-hidden="true">✕</span>
        </button>

        {state.phase === "loading" && (
          <>
            <h2 id="assistance-gate-title" className="pr-10 text-lg font-semibold text-foreground">
              {copy.title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">Just a moment…</p>
          </>
        )}

        {done && (
          <div role="status">
            <h2 id="assistance-gate-title" className="pr-10 text-lg font-semibold text-foreground">
              {copy.successTitle}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{copy.successBody}</p>
            <button type="button" onClick={onClose} className={buttonClassName("primary", "mt-5 w-full min-h-12 text-base")}>
              {copy.successClose}
            </button>
          </div>
        )}

        {(showForm || showReturning) && (
          <div>
            {showReturning ? (
              <>
                <h2 id="assistance-gate-title" className="pr-10 text-lg font-semibold text-foreground">
                  {copy.returningTitle}
                </h2>
                <p className="mt-3 text-sm text-foreground">
                  Continue as <span className="font-mono">{state.returning?.maskedPhone}</span>?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.returningBody}</p>
              </>
            ) : (
              <>
                <h2 id="assistance-gate-title" className="pr-10 text-lg font-semibold text-foreground">
                  {copy.title}
                </h2>
                <p className="mt-2 text-sm text-foreground">{copy.intro}</p>
              </>
            )}

            <ul className="mt-3 space-y-2 rounded-md border border-border border-l-4 border-l-gold bg-white p-4 text-sm leading-6 text-foreground">
              {copy.motivation.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-0.5 shrink-0 font-bold text-brass-700">
                    &#10003;
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {state.error && (
              <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <span className="font-medium">{state.error.code === "INVALID_PHONE" || state.error.code === "INVALID_INPUT" ? copy.validationTitle : copy.errorTitle}.</span>{" "}
                {state.error.message}
              </p>
            )}

            {showForm && (
              <form
                id="assistance-gate-form"
                className="mt-4 space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmit();
                }}
              >
                {/* Honeypot: invisible to people, tempting to scripts. Never labelled, never focusable. */}
                <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
                </div>

                <div>
                  <label htmlFor="gate-phone" className="block text-sm font-medium text-foreground">
                    {copy.phoneLabel}
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <select
                      aria-label={copy.countryLabel}
                      value={state.form.country}
                      disabled={submitting}
                      onChange={(event) => onEdit({ country: event.target.value })}
                      className={`${inputClass} w-36 shrink-0 truncate`}
                    >
                      {PHONE_COUNTRIES.map((country) => (
                        <option key={country.iso} value={country.iso}>
                          {phoneCountryLabel(country)}
                        </option>
                      ))}
                    </select>
                    <input
                      id="gate-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder={state.form.country === "IN" ? "98765 43210" : "Phone number"}
                      value={state.form.phone}
                      disabled={submitting}
                      aria-invalid={phoneError}
                      aria-describedby="gate-phone-help"
                      onChange={(event) => onEdit({ phone: event.target.value })}
                      className={`${inputClass} min-w-0 flex-1 !min-h-14 !border-2 !border-accent bg-white text-xl font-bold tracking-wide shadow-[0_0_0_4px_rgba(184,146,74,0.22)] placeholder:font-semibold`}
                    />
                  </div>
                  <p id="gate-phone-help" className="mt-1.5 text-xs text-muted-foreground">
                    {copy.phoneHelp}
                  </p>
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-foreground">{copy.preferenceLegend}</legend>
                  <div className="mt-1.5 grid gap-2">
                    {(
                      [
                        { value: "WHATSAPP", label: copy.preferenceWhatsApp, hint: copy.preferenceWhatsAppHint },
                        { value: "PHONE_CALL", label: copy.preferencePhone, hint: null },
                      ] as Array<{ value: GateContactPreference; label: string; hint: string | null }>
                    ).map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-base has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                      >
                        <input
                          type="radio"
                          name="contact-preference"
                          value={option.value}
                          checked={state.form.preference === option.value}
                          disabled={submitting}
                          onChange={() => onEdit({ preference: option.value })}
                          className="h-5 w-5 accent-[var(--accent)]"
                        />
                        <span className="flex-1 text-foreground">{option.label}</span>
                        {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="gate-name" className="block text-sm font-medium text-foreground">
                    {copy.nameLabel}
                  </label>
                  <input
                    ref={nameRef}
                    id="gate-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    aria-required="true"
                    aria-invalid={nameError}
                    placeholder="Your full name"
                    value={state.form.name}
                    disabled={submitting}
                    maxLength={100}
                    onChange={(event) => onEdit({ name: event.target.value })}
                    className={`${inputClass} mt-1.5 w-full ${nameError ? "border-2 border-red-600 ring-2 ring-red-200" : ""}`}
                  />
                </div>

                <p className="text-xs text-muted-foreground">{copy.consent}</p>
              </form>
            )}

            {/* The primary action is pinned to the bottom of the scrolling sheet so a buyer on a small phone never
                has to scroll to find it. It sits OUTSIDE the <form> (linked by the form attribute) so its sticky
                range is the whole sheet content, not just the form. Once the buyer scrolls to its natural place it
                releases, so it never hides the text below it. */}
            {showForm && (
              <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-background px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:-mx-6 sm:px-6">
                <button
                  type="submit"
                  form="assistance-gate-form"
                  disabled={submitting}
                  className={buttonClassName("primary", "w-full min-h-12 text-base")}
                >
                  {submitting ? copy.submitting : state.phase === "error" ? copy.retry : copy.submit}
                </button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">{copy.submitHint}</p>
              </div>
            )}

            {showReturning && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">{copy.consent}</p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={state.phase === "error" ? onRetry : onContinueReturning}
                  className={buttonClassName("primary", "w-full min-h-12 text-base")}
                >
                  {submitting ? copy.submitting : state.phase === "error" ? copy.retry : copy.returningContinue}
                </button>
                <button type="button" disabled={submitting} onClick={onUseDifferentNumber} className={buttonClassName("secondary", "w-full min-h-12")}>
                  {copy.useDifferentNumber}
                </button>
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              {copy.reassurance}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-hover underline">
                {copy.privacyLinkLabel}
              </a>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{copy.verifiedNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
