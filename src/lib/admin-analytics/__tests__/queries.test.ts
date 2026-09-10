import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTestDatabase } from "../../developer-connect/db/test-db-guard.ts";

/**
 * Smoke tests for the founder-dashboard metrics layer: every query must
 * run without error against a real (here, near-empty) database and
 * return well-formed, non-fabricated results — zeros and nulls, not
 * placeholder numbers. Skipped unless TEST_DATABASE_URL is set.
 */
test(
  "admin-analytics: every metrics query runs cleanly and returns honest zero/null values on a fresh database",
  { skip: !hasTestDatabase },
  async () => {
    const {
      getExecutiveOverview,
      getSearchIntelligence,
      getHighPriorityVerificationOpportunities,
      getDeveloperIntelligence,
      getVerificationOperations,
      getDataQuality,
      getAuditLog,
      getAiReadiness,
      getUserAndProfileIntelligence,
    } = await import("../queries.ts");

    const overview = await getExecutiveOverview();
    assert.ok(overview.developersTracked >= 0);
    assert.ok(Array.isArray(overview.funnel) && overview.funnel.length === 4);
    assert.equal(overview.funnel[0].conversionFromPrevious, null);
    // Rates are always {numerator, denominator, percent} — never a bare number.
    assert.ok("numerator" in overview.mobileShare && "denominator" in overview.mobileShare);
    assert.ok("numerator" in overview.northStarConversion);
    // Comparisons always carry both period values and an explicit sufficient-data flag.
    assert.ok("sufficientData" in overview.searchVolumeComparison);
    assert.ok("sufficientData" in overview.officialWebsiteClicksComparison);

    const search = await getSearchIntelligence();
    assert.ok(Array.isArray(search.topQueries));
    assert.ok(Array.isArray(search.highDemandUnverified));

    const opportunities = await getHighPriorityVerificationOpportunities();
    assert.ok(Array.isArray(opportunities));
    for (const opportunity of opportunities) {
      assert.ok(["NOT_INDEXED", "INDEXED_UNVERIFIED", "INDEXED_VERIFIED"].includes(opportunity.status));
    }

    const developers = await getDeveloperIntelligence();
    assert.ok(Array.isArray(developers));
    for (const developer of developers) {
      assert.ok("numerator" in developer.ctr && "denominator" in developer.ctr);
      assert.ok(typeof developer.searchResultClicks === "number");
    }

    const ops = await getVerificationOperations();
    assert.ok(ops.discovered >= 0);

    const quality = await getDataQuality();
    assert.ok(quality.developersWithoutVerifiedWebsite >= 0);

    const auditLog = await getAuditLog();
    assert.ok(Array.isArray(auditLog));

    const { PROFILE_FIELD_CONFIG } = await import("../../profile/field-config.ts");

    const readiness = await getAiReadiness();
    assert.equal(readiness.profileFieldsConfigured, PROFILE_FIELD_CONFIG.length);

    const userIntel = await getUserAndProfileIntelligence();
    assert.equal(userIntel.profileFieldsConfigured, PROFILE_FIELD_CONFIG.length);
    assert.ok(Array.isArray(userIntel.completionDistribution));
    assert.ok(Array.isArray(userIntel.sectionCompletion));
  },
);
