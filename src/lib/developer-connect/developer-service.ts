import type { DeveloperRepository, DeveloperConnectRepositories } from "./repository.ts";
import { makeUniqueSlug, slugify } from "./slug.ts";
import type { Actor, Developer, DeveloperEditableField, DeveloperMetadataPatch } from "./types.ts";
import { NotFoundError } from "./errors.ts";

export interface CreateDeveloperInput {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

export async function createDeveloper(
  developers: DeveloperRepository,
  input: CreateDeveloperInput,
): Promise<Developer> {
  const legalName = input.legalName.trim();
  const displayName = input.displayName.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const country = input.country.trim();

  if (!legalName || !displayName || !city || !state || !country) {
    throw new Error("legalName, displayName, city, state, and country are required");
  }

  const slug = await makeUniqueSlug(displayName, (candidate) => developers.slugExists(candidate));

  return developers.create({
    legalName,
    displayName,
    slug,
    city,
    state,
    country,
    headquartersLocation: input.headquartersLocation?.trim() || undefined,
  });
}

export interface UpdateDeveloperInput {
  legalName: string;
  displayName: string;
  city: string;
  state: string;
  country: string;
  headquartersLocation?: string;
}

/** Field key -> the human-readable label recorded in DeveloperEditEvent.fieldName. */
const EDITABLE_FIELD_LABELS: Record<DeveloperEditableField, string> = {
  legalName: "Legal name",
  displayName: "Display name",
  city: "City",
  state: "State",
  country: "Country",
  headquartersLocation: "Headquarters location",
};

const EDITABLE_FIELDS = Object.keys(EDITABLE_FIELD_LABELS) as DeveloperEditableField[];

function fieldOf(developer: Developer, field: DeveloperEditableField): string | null {
  return developer[field] ?? null;
}

/**
 * What the Founder should see and edit from: the published value for
 * every field, overridden by whatever is in pendingChanges. This is
 * deliberately NOT just the published columns — if an earlier Save
 * already queued an unpublished headquarters change, a second edit must
 * build on top of that pending value, not silently revert to the still-
 * published one (see the "multiple edits before republish" requirement).
 * Used both to pre-populate the edit form and, inside updateDeveloper,
 * to compute each edit's own previous->new diff for history.
 */
export function effectiveDeveloperFields(developer: Developer): Record<DeveloperEditableField, string | null> {
  const effective = {} as Record<DeveloperEditableField, string | null>;
  for (const field of EDITABLE_FIELDS) {
    effective[field] = developer.pendingChanges?.[field] ?? fieldOf(developer, field);
  }
  return effective;
}

/**
 * Founder edits to an existing developer record's core fields. Reuses the
 * same required-field validation and trimming as createDeveloper — no new
 * validation rules, no slug regeneration (the slug is left untouched even
 * if displayName changes, since it's a stable public identifier, not a
 * derived display value).
 *
 * Every field that actually changed FROM WHAT THE FOUNDER WAS EDITING
 * (the effective value — see effectiveDeveloperFields) is recorded as its
 * own immutable DeveloperEditEvent, in the same transaction as the write.
 *
 * Where it writes depends on whether this developer is currently
 * published (has a VERIFIED website candidate):
 *   - NOT published: nothing public depends on these columns yet, so this
 *     writes straight through to the published columns, exactly as
 *     before this feature existed.
 *   - Published: writing straight through would let a Save silently
 *     change what the public page shows (the bug this task exists to
 *     fix). Instead this computes a new pendingChanges patch — only the
 *     fields that differ from the PUBLISHED value, so an edit that
 *     matches what's already published is correctly not "pending"
 *     anything — and never touches the published columns at all.
 *     Nothing changes publicly until republishDeveloper() is called.
 */
export async function updateDeveloper(
  repos: DeveloperConnectRepositories,
  id: string,
  input: UpdateDeveloperInput,
  actor: Actor,
): Promise<Developer> {
  const legalName = input.legalName.trim();
  const displayName = input.displayName.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const country = input.country.trim();
  const headquartersLocation = input.headquartersLocation?.trim() || undefined;

  if (!legalName || !displayName || !city || !state || !country) {
    throw new Error("legalName, displayName, city, state, and country are required");
  }

  const proposed: Record<DeveloperEditableField, string | null> = {
    legalName,
    displayName,
    city,
    state,
    country,
    headquartersLocation: headquartersLocation ?? null,
  };

  return repos.runInTransaction(async (txRepos) => {
    const before = await txRepos.developers.getById(id);
    if (!before) {
      throw new NotFoundError(`Developer ${id} not found`);
    }

    const effective = effectiveDeveloperFields(before);
    for (const field of EDITABLE_FIELDS) {
      if (effective[field] !== proposed[field]) {
        await txRepos.developerEditEvents.append({
          developerId: id,
          eventType: "FIELD_CHANGE",
          fieldName: EDITABLE_FIELD_LABELS[field],
          previousValue: effective[field],
          newValue: proposed[field],
          actorType: actor.actorType,
          actorId: actor.actorId,
        });
      }
    }

    const verified = await txRepos.candidates.getVerifiedForDeveloper(id);
    if (!verified) {
      // Not published yet — no public boundary to protect. Behaves
      // exactly as it did before pendingChanges existed.
      //
      // Uses proposed.headquartersLocation (already null-coalesced), NOT
      // the raw `headquartersLocation` local (string | undefined), which
      // is `undefined` whenever the founder clears the field. Passing
      // `undefined` here used to reach the repository's patch and, for
      // the real Postgres/Drizzle backend, silently DROPPED the column
      // from the generated UPDATE statement instead of clearing it —
      // Drizzle's `.set()` omits any key whose value is `undefined`
      // rather than setting it to NULL. The founder would see "Changes
      // saved" and the field would immediately show the old, never-
      // actually-cleared value once re-populated from the (unchanged)
      // returned row. `null` is the only value that reliably clears an
      // optional column through `.set()`.
      return txRepos.developers.update(id, {
        legalName,
        displayName,
        city,
        state,
        country,
        headquartersLocation: proposed.headquartersLocation,
      });
    }

    // Published: build the new pending patch relative to the PUBLISHED
    // values (not the effective ones) — a field edited back to exactly
    // what's already published is not a pending change. A cleared
    // optional field (headquartersLocation) is stored as an explicit ""
    // rather than being omitted — omitting the key means "unchanged",
    // which would silently drop a real "clear this field" edit.
    const newPending: DeveloperMetadataPatch = {};
    for (const field of EDITABLE_FIELDS) {
      const publishedValue = fieldOf(before, field);
      if (publishedValue !== proposed[field]) {
        newPending[field] = proposed[field] ?? "";
      }
    }
    const pendingChanges = Object.keys(newPending).length > 0 ? newPending : null;
    return txRepos.developers.setPendingChanges(id, pendingChanges);
  });
}

/**
 * Makes a published developer's pending metadata changes live: one
 * atomic update (see DeveloperRepository.publishPendingChanges) merges
 * the pending patch onto the published columns and clears it, so the
 * public page is never caught showing a mix of old and new values.
 * Records a single REPUBLISHED history event — the per-field detail was
 * already captured when each change was saved.
 */
export async function republishDeveloper(
  repos: DeveloperConnectRepositories,
  id: string,
  actor: Actor,
): Promise<Developer> {
  return repos.runInTransaction(async (txRepos) => {
    const after = await txRepos.developers.publishPendingChanges(id);
    await txRepos.developerEditEvents.append({
      developerId: id,
      eventType: "REPUBLISHED",
      fieldName: null,
      previousValue: null,
      newValue: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    return after;
  });
}

/**
 * Discards a published developer's pending metadata changes without
 * ever touching the published columns — the Founder changed their mind
 * before republishing. Cheap and safe: setPendingChanges(id, null) is
 * the exact same primitive updateDeveloper already uses to clear an
 * edit that was reverted back to its published value.
 */
export async function discardPendingChanges(
  repos: DeveloperConnectRepositories,
  id: string,
  actor: Actor,
): Promise<Developer> {
  return repos.runInTransaction(async (txRepos) => {
    const before = await txRepos.developers.getById(id);
    if (!before) {
      throw new NotFoundError(`Developer ${id} not found`);
    }
    if (!before.pendingChanges) {
      throw new Error("There are no unpublished changes to discard.");
    }
    const after = await txRepos.developers.setPendingChanges(id, null);
    await txRepos.developerEditEvents.append({
      developerId: id,
      eventType: "DISCARDED",
      fieldName: null,
      previousValue: null,
      newValue: null,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    return after;
  });
}

/**
 * Deterministic, non-fuzzy duplicate check for Founder-driven intake: an
 * existing developer whose display name or legal name normalizes (via the
 * same `slugify` used for slug generation — lowercased, diacritics and
 * punctuation stripped, whitespace collapsed) to the same value as the
 * proposed one.
 *
 * LIMITATION, by design: this only catches exact-normalized-name matches
 * ("Lodha Group" vs "lodha   group" vs "Lodha, Group"). It will NOT catch
 * two differently-worded names for the same real company ("Lodha Group"
 * vs "Lodha Developers Pvt Ltd") — that requires human judgment, not an
 * automated check, so this deliberately does not attempt fuzzy matching.
 *
 * Does not itself block anything — `createDeveloper`'s existing contract
 * and tests (two developers may share a display name, distinguished only
 * by slug suffix) are left untouched. Callers that want to block on a
 * likely duplicate (the Founder intake Server Action) must call this
 * first and decide what to do with the result themselves.
 */
export async function findLikelyDuplicateDeveloper(
  developers: DeveloperRepository,
  input: { legalName: string; displayName: string },
): Promise<Developer | null> {
  const displaySlug = slugify(input.displayName.trim());
  const legalSlug = slugify(input.legalName.trim());

  // displayName duplicates: a developer's slug is always derived from its
  // displayName (see makeUniqueSlug above), so this reuses the existing
  // slug lookup directly — no new repository surface needed.
  if (displaySlug) {
    const byDisplayName = await developers.getBySlug(displaySlug);
    if (byDisplayName) return byDisplayName;
  }

  // legalName duplicates: legalName isn't reflected in the slug, so it's
  // compared directly (normalized the same way) against every existing
  // developer. Fine at this scale — the first 15-20 developers — and
  // still a small, transparent, deterministic check, not a search index.
  if (legalSlug) {
    const all = await developers.list();
    const byLegalName = all.find((d) => slugify(d.legalName) === legalSlug);
    if (byLegalName) return byLegalName;
  }

  return null;
}
