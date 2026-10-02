import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RUN_LEVEL_SPEND_STOP_CODES, TypedDomainError, isRunLevelSpendStop } from "@debateai/kernel";
import { PROVIDER_COST_ENVELOPE_REFUSAL_CODES } from "@debateai/providers";
import { SERVE_DISCLOSURE_BODY_STOPS, SERVE_DISCLOSURE_SERVE_STOPS } from "@debateai/db";
import { AnswerWritingStopSchema, ArguingStopSchema } from "@debateai/contract";
import { CostEnvelopeGuard, type RunOwnerSpendReader } from "@debateai/budget";
import {
  ENVELOPE_STOP_CODES,
  ENVELOPE_STOP_REASONS,
  FIRST_POSITION_CALL_SITE_KEY,
  envelopeStopKind,
  expansionPhaseStop,
  firstCallCeilingFailure,
  panelSpendStop,
  plansUnresolvedPersonAllowance,
  providerCallSharedWall,
  reviewFailureOutcome,
  serveLoopStopOf
} from "../../apps/runner/src/index.js";

/**
 * B9b (budget spec §2.9, paid-plans spec §2.4.1) — A PERSON'S ALLOWANCE STOPS THE ARGUING, NEVER THE DEBATE.
 * Its own stop kind (ALLOWANCE) and its own reason, so the operator is never sent to lift the wrong limit
 * (ruling R-C); a stop in every run-body phase; never the first call's failure, because the first position's
 * own call is never walled.
 */
const PERSON = () => new TypedDomainError("PERSON_ALLOWANCE_REACHED", "x");

describe("B9b · the person's allowance is a stop kind of its own", () => {
  it("maps to ALLOWANCE and lifts as itself", () => {
    expect(envelopeStopKind(PERSON())).toBe("ALLOWANCE");
    expect(ENVELOPE_STOP_CODES.PERSON_ALLOWANCE_REACHED).toBe("ALLOWANCE");
    expect(ENVELOPE_STOP_REASONS.ALLOWANCE).toBe("PERSON_ALLOWANCE_REACHED");
  });

  it("stops authoring, expansion, reviewing and the first root's panel instead of failing the run", () => {
    expect(expansionPhaseStop(PERSON())).toBe("ALLOWANCE");
    expect(reviewFailureOutcome(PERSON())).toEqual({ kind: "BUDGET_STOP", stop: "ALLOWANCE" });
    expect(panelSpendStop(PERSON(), "AUTHOR_ONLY")).toBe("ALLOWANCE");
    expect(panelSpendStop(PERSON(), "TRAVEL")).toBeNull();
  });

  it("is never the first call's ceiling failure, nor is the site's day", () => {
    expect(firstCallCeilingFailure(PERSON())).toBeNull();
    expect(firstCallCeilingFailure(new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "x"))).toBeNull();
  });

  it("travels untouched through the panel and the gateway's retry loop", () => {
    expect(RUN_LEVEL_SPEND_STOP_CODES).toContain("PERSON_ALLOWANCE_REACHED");
    expect(isRunLevelSpendStop(PERSON())).toBe(true);
    expect(PROVIDER_COST_ENVELOPE_REFUSAL_CODES).toContain("PERSON_ALLOWANCE_REACHED");
  });

  it("names a serve stop, and the owner's disclosure row and read can carry it", () => {
    expect(serveLoopStopOf(PERSON())).toBe("ALLOWANCE");
    expect(SERVE_DISCLOSURE_BODY_STOPS).toContain("ALLOWANCE");
    expect(SERVE_DISCLOSURE_SERVE_STOPS).toContain("ALLOWANCE");
    expect(ArguingStopSchema.parse("ALLOWANCE")).toBe("ALLOWANCE");
    expect(AnswerWritingStopSchema.parse("ALLOWANCE")).toBe("ALLOWANCE");
  });
});

describe("B9b · which calls the shared wall measures", () => {
  it.each([
    ["the first position's own call", { role: "JUDGE", lane: "served", callSiteKey: FIRST_POSITION_CALL_SITE_KEY }, "EXEMPT"],
    ["the first root's panel seat", { role: "JUDGE", lane: "served", callSiteKey: "PANEL:root:provider:b" }, "APPLY"],
    ["the secondary root", { role: "JUDGE", lane: "served", callSiteKey: "JUDGE:root:secondary" }, "APPLY"],
    ["an expansion leg", { role: "JUDGE", lane: "served", callSiteKey: "JUDGE:critic:root0:r1:p0" }, "APPLY"],
    ["a review", { role: "JUDGE", lane: "served", callSiteKey: "JUDGE:review:node-1" }, "APPLY"],
    ["the answer-writer", { role: "SYNTHESIZER", lane: "served", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" }, "EXEMPT"],
    ["the answer's checker", { role: "EVALUATOR", lane: "served", callSiteKey: "POST_COMPOSE_R9:EVALUATOR:1" }, "EXEMPT"],
    ["the story", { role: "SYNTHESIZER", lane: "story", callSiteKey: "STORY:STORYTELLER:1" }, "EXEMPT"],
    ["the evaluator add-on", { role: "JUDGE", lane: "evaluator", callSiteKey: "evaluator.grade-judge-output.v1" }, "EXEMPT"]
  ] as const)("%s → %s", (_name, request, expected) => {
    expect(providerCallSharedWall(request)).toBe(expected);
  });

  it("is the primary root author's own call site", () => {
    expect(FIRST_POSITION_CALL_SITE_KEY).toBe("JUDGE");
  });
});

describe("B9b · the shipped runner builds the wall from exactly what A20 allows it to read", () => {
  it("reads the costEnvelopePolicy band and the billingPlans row and the owner's windows, never billingPolicy", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    // The band's one reader (B1), never the members re-derived here. The band switches only the site-day half.
    expect(main).toContain("const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);");
    expect(main).toContain("finishBasisPoints: envelopeBand === null ? null : envelopeBand.finishBasisPoints");
    expect(main).toContain("closeBasisPoints: envelopeBand === null ? 10_000 : envelopeBand.closeBasisPoints");
    // The plans are read whenever hosted, band or no band, so the person half never depends on the band (R-19).
    expect(main).toContain("const billingPlans = costEnvelopePolicy === null ? null : await readBillingPlans(pool, environment.REGISTER_VERSION)");
    expect(main).toContain("owners: modelSpendStore");
    expect(main).not.toContain("readBillingPolicy");
    expect(main).not.toContain("assertBillingReady");
    // No SQL of its own over billing's schema: the owner comes through the spend store.
    expect(main).not.toMatch(/(?:FROM|JOIN|INTO|UPDATE)\s+billing\./iu);
  });

  it("hands the guard the wall it built, so a hosted run is walled mid-run and not only by its own ceiling", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    // One guard, and this slice is its construction (the same cut tests/unit/m7-story-margin.test.ts makes).
    expect(main.split("new CostEnvelopeGuard(")).toHaveLength(2);
    const guard = main.slice(main.indexOf("new CostEnvelopeGuard({"), main.indexOf("const providerTopology"));
    expect(guard).toContain("store: modelSpendStore,");
    expect(guard).toContain("...(sharedWallTerms === null ? {} : { sharedWall: sharedWallTerms })");
    // The wall is built whenever hosted: its switch is the policy row, never the band.
    expect(main).toContain("const sharedWallTerms = costEnvelopePolicy === null");
    expect(main).not.toContain("const sharedWallTerms = envelopeBand === null");
  });

  it("fails the person wall closed when the register version sealed no billingPlans, and says so once at boot", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("? plansUnresolvedPersonAllowance()");
    expect(main).toContain("if (costEnvelopePolicy !== null && billingPlans === null) {");
    expect(main).toContain('console.warn(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));');
    // The open source (no person windows at all) is never what a missing plans row falls back to.
    expect(main).not.toContain("NO_PERSON_ALLOWANCE");
  });

  it("takes the allowance source from billing-core, over the read-only port that never writes (R-1, R-12)", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain('import { BillingPersonAllowanceSource } from "@debateai/billing-core";');
    expect(main).toContain("new BillingPersonAllowanceSource({");
    expect(main).toContain("entitlements: new EntitlementRepository(pool).readOnlyPort(),");
    // The full repository (whose `current` lazily appends a Free sign-up) is never handed to the runner's source.
    expect(main).not.toMatch(/entitlements:\s*new EntitlementRepository\(pool\)\s*[,}]/u);
    expect(main).not.toMatch(/import\s*\{[^}]*BillingPersonAllowanceSource[^}]*\}\s*from\s*"@debateai\/db"/u);
    const manifest = JSON.parse(await readFile(new URL("../../apps/runner/package.json", import.meta.url), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies["@debateai/billing-core"]).toBe("workspace:*");
  });
});

describe("B9b · the person wall fails closed when the runner cannot read the plans (ruling R-19)", () => {
  // B6 writes a charge scope only when hosted billing is on, so a run that HAS one was admitted and charged
  // against windows. A runner whose register version lacks billingPlans, or lacks the band too (a mismatched
  // REGISTER_VERSION, a staggered restart), must not then argue unbounded by the person's allowance.
  const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
  const owners = (ownerRef: string | null): RunOwnerSpendReader => ({
    readRunChargeOwnerRef: async () => ownerRef,
    readOwnerSpentMicros: async () => 0
  });
  const decide = (ownerRef: string | null, finishBasisPoints: number | null = 11_500): Promise<string> => new CostEnvelopeGuard({
    store: {
      recordSpend: async () => undefined,
      readRunSpentMicros: async () => 0,
      readRunStorySpentMicros: async () => 0,
      readDaySpentMicros: async () => 0,
      admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
    },
    policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000 },
    sharedWall: { finishBasisPoints, persons: plansUnresolvedPersonAllowance(), owners: owners(ownerRef) }
  }).providerSeam({ runId: "run-b9b", price: PRICE, requireReportedUsage: true, phase: "BODY" })
    .assertCallAllowed({ requestBytes: 800, completionTokenCeiling: 64 })
    .then(() => "ADMITTED", (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED"));

  it("refuses every walled call of a run billing pinned an owner on, as that person's allowance", async () => {
    expect(await decide("owner-b9b")).toBe("PERSON_ALLOWANCE_REACHED");
  });

  it("never touches a run with no charge scope", async () => {
    expect(await decide(null)).toBe("ADMITTED");
  });

  it("still fails closed when the runner's register version has no band either (no site-day wall)", async () => {
    // The wall the shipped runner builds on a version without the band: finishBasisPoints null, no plans.
    expect(await decide("owner-b9b", null)).toBe("PERSON_ALLOWANCE_REACHED");
    expect(await decide(null, null)).toBe("ADMITTED");
  });
});
