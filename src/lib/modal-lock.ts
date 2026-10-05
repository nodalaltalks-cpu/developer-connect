/**
 * A tiny shared lock so two modals can never be on screen at once — in
 * particular the assistance gate and the sign-in prompt (LoginConversionPrompt).
 *
 * Priority: the gate is something the visitor explicitly asked for ("Visit
 * official website"), while the sign-in prompt is a nudge we chose to show. So:
 *  - the sign-in prompt NEVER opens over the gate (acquireModal is refused);
 *  - the gate PRE-EMPTS the sign-in prompt (preemptModal asks it to close, then
 *    takes the lock), so pressing the button is never a silent dead end.
 *
 * Kept framework-free and parameterised on its store so it is unit-testable;
 * in the browser the store is `globalThis`, so every bundle shares one lock.
 */

interface LockStore {
  __dcModalHolder?: string | null;
  __dcModalClosers?: Record<string, (() => void) | undefined>;
}

const defaultStore = globalThis as unknown as LockStore;

/** Tries to take the lock for `id`. Returns false (and changes nothing) when another modal holds it. Re-acquiring your own lock succeeds. */
export function acquireModal(id: string, store: LockStore = defaultStore): boolean {
  const holder = store.__dcModalHolder ?? null;
  if (holder !== null && holder !== id) return false;
  store.__dcModalHolder = id;
  return true;
}

/**
 * Takes the lock for `id` even if another modal holds it: the holder is asked
 * to close (via the closer it registered) and the lock moves to `id`. Always
 * succeeds. Use only for something the visitor explicitly requested.
 */
export function preemptModal(id: string, store: LockStore = defaultStore): void {
  const holder = store.__dcModalHolder ?? null;
  if (holder !== null && holder !== id) store.__dcModalClosers?.[holder]?.();
  store.__dcModalHolder = id;
}

/** Registers how to close modal `id` on request. Returns an unregister function. */
export function registerModalCloser(id: string, closer: () => void, store: LockStore = defaultStore): () => void {
  const closers = (store.__dcModalClosers ??= {});
  closers[id] = closer;
  return () => {
    if (closers[id] === closer) delete closers[id];
  };
}

/** Releases the lock — only if `id` holds it, so one modal can never release another's. */
export function releaseModal(id: string, store: LockStore = defaultStore): void {
  if ((store.__dcModalHolder ?? null) === id) store.__dcModalHolder = null;
}

/** True when some modal other than `exceptId` currently holds the lock. */
export function isOtherModalOpen(exceptId?: string, store: LockStore = defaultStore): boolean {
  const holder = store.__dcModalHolder ?? null;
  return holder !== null && holder !== exceptId;
}

export const MODAL_IDS = { assistanceGate: "assistance-gate", loginPrompt: "login-prompt" } as const;
