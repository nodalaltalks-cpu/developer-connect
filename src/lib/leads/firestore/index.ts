import { randomUUID } from "node:crypto";
import { directCtx, type FsCtx } from "../../firestore/tx.ts";
import { toTs } from "../../firestore/convert.ts";
import type { LeadRepositories } from "../repository.ts";
import type { Lead, LeadEvent } from "../types.ts";
import { decode, makeFs } from "./base.ts";
import {
  buildBookingRepository,
  buildConsentRepository,
  buildEventRepository,
  buildFollowUpRepository,
  buildLeadRepository,
  buildRequirementRepository,
  buildTouchRepository,
} from "./core.ts";
import {
  buildAutomationActionRepository,
  buildAutomationSettingsRepository,
  buildCallingBatchRepository,
  buildCallRepository,
  buildCampaignRepository,
  buildImportBatchRepository,
  buildProjectRepository,
  buildShortlistRepository,
  buildSiteVisitRepository,
  buildSpendRepository,
} from "./sales.ts";

export interface FirestoreLeadOptions {
  /** Prefix for every collection name. Empty in production; a random value gives a test its own empty store. */
  namespace?: string;
  /** Test hook: developer names to return instead of reading the `developers` collection. */
  developerNames?: Record<string, string>;
}

/**
 * The Firestore implementation of LeadRepositories: the same contract the in-memory and PostgreSQL adapters satisfy.
 * `transaction` runs the work inside one Firestore transaction (reads first, writes buffered and committed together).
 */
export function buildFirestoreLeadRepositories(ctx: FsCtx, options: FirestoreLeadOptions = {}): LeadRepositories {
  const fs = makeFs(ctx, options.namespace ?? "");
  return {
    leads: buildLeadRepository(fs, options.developerNames ?? null),
    events: buildEventRepository(fs),
    touches: buildTouchRepository(fs),
    consents: buildConsentRepository(fs),
    bookings: buildBookingRepository(fs),
    requirements: buildRequirementRepository(fs),
    followUps: buildFollowUpRepository(fs),
    calls: buildCallRepository(fs),
    callingBatches: buildCallingBatchRepository(fs),
    projects: buildProjectRepository(fs),
    shortlist: buildShortlistRepository(fs),
    siteVisits: buildSiteVisitRepository(fs),
    campaigns: buildCampaignRepository(fs),
    spend: buildSpendRepository(fs),
    automationActions: buildAutomationActionRepository(fs),
    automationSettings: buildAutomationSettingsRepository(fs),
    importBatches: buildImportBatchRepository(fs),
    transaction: (work) => ctx.run((inner) => work(buildFirestoreLeadRepositories(inner, options))),
  };
}

export function createFirestoreLeadRepositories(options: FirestoreLeadOptions = {}): LeadRepositories {
  return buildFirestoreLeadRepositories(directCtx(), options);
}

/**
 * The Firestore repositories plus the two helpers the in-memory repository exposes to tests. Used by the conformance
 * suite (see memory-repository.ts, LEADS_TEST_BACKEND=firestore); never by the app.
 */
export function createFirestoreLeadRepositoriesForTests(developerNames: Record<string, string> = {}) {
  const namespace = `t${randomUUID().slice(0, 8)}_`;
  const ctx = directCtx();
  const repos = createFirestoreLeadRepositories({ namespace, developerNames });
  const fs = makeFs(ctx, namespace);

  // A test may replace a method on the repositories it was handed (to simulate a failure part-way through a capture).
  // The transaction hands the work freshly built repositories, so carry such replacements over to them.
  type Methods = Record<string, Record<string, unknown>>;
  const outer = repos as unknown as Methods;
  const pristine: Methods = Object.fromEntries(Object.entries(outer).filter(([, v]) => typeof v === "object").map(([k, v]) => [k, { ...v }]));
  repos.transaction = (work) =>
    ctx.run((inner) => {
      const built = buildFirestoreLeadRepositories(inner, { namespace, developerNames }) as unknown as Methods;
      for (const [group, methods] of Object.entries(pristine)) {
        for (const [name, original] of Object.entries(methods)) {
          if (outer[group][name] !== original) built[group][name] = outer[group][name];
        }
      }
      return work(built as unknown as LeadRepositories);
    });

  return Object.assign(repos, {
    /** Records a page view the way the analytics sink does, scoped to this test's own namespace. */
    recordPageView: async (userId: string, at: Date) => {
      await ctx.db.collection(`${namespace}analyticsEvents`).doc(randomUUID()).create({ eventName: "page_viewed", occurredAt: toTs(at), sessionId: "test", anonymousUserId: null, userId, developerId: null, payload: {} });
    },
    snapshot: async (): Promise<{ leads: Lead[]; events: LeadEvent[] }> => {
      const [leads, events] = await Promise.all([ctx.find(fs.col("leads"), { where: [] }), ctx.find(fs.col("leadEvents"), { where: [], orderBy: [["_seq", "asc"]] })]);
      return { leads: leads.map((v) => decode<Lead>(v)), events: events.map((v) => decode<LeadEvent>(v)) };
    },
  });
}
