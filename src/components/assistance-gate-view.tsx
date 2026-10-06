import { buttonClassName } from "@/components/ui/button";
import type { GateCopy } from "@/lib/leads/gate/gate-copy";
import type { GateContactPreference, GatePhoneCountry } from "@/lib/leads/gate/gate-config";
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

const COUNTRY_OPTIONS: Array<{ value: GatePhoneCountry; label: string }> = [
  { value: "IN", label: "India +91" },
  { value: "AE", label: "UAE +971" },
];

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

            <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{copy.transparency}</p>

            {state.error && (
              <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <span className="font-medium">{state.error.code === "INVALID_PHONE" || state.error.code === "INVALID_INPUT" ? copy.validationTitle : copy.errorTitle}.</span>{" "}
                {state.error.message}
              </p>
            )}

            {showForm && (
              <form
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
                      onChange={(event) => onEdit({ country: event.target.value as GatePhoneCountry })}
                      className={`${inputClass} w-32 shrink-0`}
                    >
                      {COUNTRY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      id="gate-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      value={state.form.phone}
                      disabled={submitting}
                      aria-invalid={phoneError}
                      aria-describedby="gate-phone-help"
                      onChange={(event) => onEdit({ phone: event.target.value })}
                      className={`${inputClass} min-w-0 flex-1`}
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
                    id="gate-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={state.form.name}
                    disabled={submitting}
                    maxLength={100}
                    onChange={(event) => onEdit({ name: event.target.value })}
                    className={`${inputClass} mt-1.5 w-full`}
                  />
                </div>

                <p className="text-xs text-muted-foreground">{copy.consent}</p>

                <div>
                  <button type="submit" disabled={submitting} className={buttonClassName("primary", "w-full min-h-12 text-base")}>
                    {submitting ? copy.submitting : state.phase === "error" ? copy.retry : copy.submit}
                  </button>
                  <p className="mt-1.5 text-center text-xs text-muted-foreground">{copy.submitHint}</p>
                </div>
              </form>
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
