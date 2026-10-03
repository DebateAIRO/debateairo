/**
 * Paid plans S2 — admission with a VALID scorecard on the HOSTED path, the
 * person's room measured by the real room (B6a's `AskRoom.precheck` over the B3/B5
 * ledger): a person with room gets the best models, a person with a tiny room gets
 * ECONOMY models (and still starts, A5), a person with a FULL window waits and is
 * planned for the room at the instant the wait can first end (the window's reset
 * when their spend fills it; the next minute, with the room as measured, when only
 * their own live debate's hold does), a Free person is capped by the tier B8
 * decides, and the site's refusal is unchanged. With economy caps above a role's
 * BALANCED pick (Part 3's final review P3-I1), a person short on room starts on the
 * cheapest plan the site allows and a FULL window waits — never the site's refusal.
 * CI skips this directory: run it by hand.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AskRefusal,
  askModelPickerSettings,
  evaluateAskAdmission,
  personRoomOf,
  type AskMoneyPolicy,
  type PersonRoomInput,
  type RunCreationSettings
} from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { PostgresModelSpendStore } from "@debateai/budget";
import type { AskRequest, PlanTier } from "@debateai/contract";
import { EntitlementRepository, RunWaitRepository, migrate, type DiscoveredPanelMember } from "@debateai/db";
import { DEBATE_ROLES } from "@debateai/kernel";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { computeStructuralCeilingBasis, type BillingPlans } from "@debateai/register";
import { resolveBillingAsk, type AskBilling } from "../../apps/api/src/ask-billing.js";
import { AskRoom, nextWholeMinute, type RoomPreview } from "../../apps/api/src/ask-room.js";
import { economyCaps, testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";
import { createLegacyStoryRun } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
});

const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1, finalRetryAttempts: 1,
  branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5
});

// Two makers, a strong model (one call = 1000 micros) and a light one (20 micros) each.
// Two debaters at depth 1 make 30 calls, 24 of them while arguing:
//   BEST (tops) 30 000, 24 000 while arguing · ECONOMY (lites) 600, 480 while arguing.
const CANDIDATES = [
  testCandidate("oa-top", "OpenAI"), testCandidate("an-top", "Anthropic"),
  testCandidate("oa-lite", "OpenAI"), testCandidate("an-lite", "Anthropic")
];
const ENTRIES = [testEntry("oa-top", 95, 1), testEntry("an-top", 95, 1), testEntry("oa-lite", 70, 1), testEntry("an-lite", 70, 1)];
const SCORECARD = testScorecard(
  CANDIDATES,
  Object.fromEntries(DEBATE_ROLES.map((role) => [role, ENTRIES])),
  { diversityShare: 0, planStrengthCaps: { free: "ECONOMY" } }
);
const priceOf = (candidateId: string) => (candidateId.endsWith("-top") ? 1_000_000 : 20_000);
const TARGETS: readonly ProviderDiscoveryTarget[] = CANDIDATES.map((candidate) => Object.freeze({
  providerRef: `provider:${candidate.candidateId}`, maker: candidate.maker, baseUrl: "https://vendor.test/v1",
  model: candidate.modelId,
  inputPriceMicrosPerMillionTokens: priceOf(candidate.candidateId),
  outputPriceMicrosPerMillionTokens: priceOf(candidate.candidateId)
}));
const PANEL: readonly DiscoveredPanelMember[] = CANDIDATES.map((candidate) => Object.freeze({
  provider_ref: `provider:${candidate.candidateId}`, maker: candidate.maker, model_id: candidate.modelId,
  probe_evidence_ref: `probe:${candidate.candidateId}`, probed_at: "2026-10-01T00:00:00.000Z"
}));
const SITE: AskMoneyPolicy = Object.freeze({ perRunCeilingMicros: 250_000, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });

function plan(planId: "FREE" | "PLUS" | "PRO" | "MAX", monthlyCreditMicros: number) {
  const free = planId === "FREE";
  return Object.freeze({
    planId, tier: free ? "free" as const : "premium" as const, netPriceMicros: 0, monthlyCreditMicros,
    dayBasisPoints: free ? null : 2000, weekBasisPoints: free ? null : 5000, finishBasisPoints: 11000,
    // R-11: Free's fixed risk tier is "standard" (what /new sends today).
    fixedGauges: free ? Object.freeze({ riskTier: "standard" as const, compositionBudgetTier: "low" as const, depth: 2 }) : null
  });
}
const PLANS: BillingPlans = Object.freeze({
  currency: "USD",
  plans: Object.freeze([plan("FREE", 200_000), plan("PLUS", 5_000_000), plan("PRO", 20_000_000), plan("MAX", 150_000_000)]),
  sourceRef: "test:s2-plans"
});

/** What discovery and the scorecard offer: the two-tier world above unless a test names its own. */
type World = Readonly<{ scorecard: typeof SCORECARD; targets: readonly ProviderDiscoveryTarget[]; panel: readonly DiscoveredPanelMember[] }>;
const TWO_TIERS: World = Object.freeze({ scorecard: SCORECARD, targets: TARGETS, panel: PANEL });

function settings(site: AskMoneyPolicy = SITE, world: World = TWO_TIERS): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:s2",
    settlementWatchHandle: "watch:s2",
    resolveDiscoveredPanel: async () => world.panel,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    modelPicker: askModelPickerSettings({
      scorecard: Object.freeze({ state: "VALID" as const, scorecard: world.scorecard, sourceRef: "test:s2-scorecard" }),
      deploymentMode: "hosted",
      targets: world.targets,
      perRunCeilingMicros: site.perRunCeilingMicros,
      moneyPolicy: site,
      callTokenCeilings: { judge: 2048, synthesizer: 2048, evaluator: 2048 }
    })
  };
}

function ask(planTier: AskRequest["plan_tier"]): AskRequest {
  return {
    question_line: "Should a small town switch its streetlights to LED lamps?",
    risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:s2",
    composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s2 person room",
    as_of: "2026-10-01T00:00:00.000Z", steering_presets: [], plan_tier: planTier,
    steering_annotations: [], model_strength: "BEST"
  };
}

const entitlements = () => new EntitlementRepository(database.pool);
const spendStore = () => new PostgresModelSpendStore(database.pool);

/** A fresh owner on `planId`, anchored a minute ago, with `spentMicros` already charged to one earlier debate. */
async function owner(planId: "FREE" | "PLUS", spentMicros: number): Promise<string> {
  const ownerRef = randomUUID();
  const anchor = new Date(Date.now() - 60_000);
  const client = await database.pool.connect();
  try {
    await entitlements().append(client, {
      ownerRef, planId, periodAnchorAt: anchor,
      cause: planId === "FREE" ? "SIGNED_UP_FREE" : "SUBSCRIBED",
      effectiveAt: anchor,
      subscriptionId: planId === "FREE" ? null : randomUUID(),
      paidThrough: planId === "FREE" ? null : new Date(anchor.getTime() + 31 * 86_400_000),
      monthCreditOverrideMicros: null
    });
    if (spentMicros > 0) {
      const current = await entitlements().current(ownerRef, new Date());
      const runId = await createLegacyStoryRun(database.pool, `s2 earlier debate ${randomUUID()}`, `asker:${randomUUID()}`);
      await entitlements().recordRunChargeScope(client, {
        runId, ownerRef, planId, entitlementEventId: current.eventId, admittedAt: new Date()
      });
      await spendStore().recordSpend({
        spendId: randomUUID(), spendSource: "RUN", runId, providerRef: "provider:earlier",
        chargedOn: new Date().toISOString().slice(0, 10), chargeMicros: spentMicros,
        inputTokens: 1, outputTokens: 1, spendPhase: "BODY"
      });
    }
  } finally {
    client.release();
  }
  return ownerRef;
}

/**
 * One live debate of this owner, nothing spent yet, holding `heldMicros`: pinned to the owner's plan (B5's
 * `recordRunChargeScope`), with its hold (B3's `openHold`) and a READY first job, so the hold counts against
 * every one of the owner's windows (`readOwnerCountedHoldsMicros`) until that job is done.
 */
async function liveDebateHolding(ownerRef: string, heldMicros: number): Promise<string> {
  const runId = await createLegacyStoryRun(database.pool, `s2 live debate ${randomUUID()}`, `asker:${randomUUID()}`);
  const current = await entitlements().current(ownerRef, new Date());
  const client = await database.pool.connect();
  try {
    await entitlements().recordRunChargeScope(client, {
      runId, ownerRef, planId: current.planId, entitlementEventId: current.eventId, admittedAt: new Date()
    });
    await spendStore().openHold(client, { runId, heldMicros });
  } finally {
    client.release();
  }
  await new WorkItemRepository(database.pool).enqueue({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
  return runId;
}

/** B6a's room over the real ledger: the site's day far away, the person's windows from B5's entitlement. */
function realRoom(): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: spendStore(),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => 30_000 },
    personAllowance: new BillingPersonAllowanceSource({ entitlements: entitlements(), plans: PLANS, closeBasisPoints: 9500 }),
    entitlements: entitlements(),
    dailyCeilingMicros: 1_000_000_000_000,
    closeBasisPoints: 9500,
    waitingLinePerPerson: 1
  });
}

/** The room's unlocked first look at this owner's question, exactly as `#submitWithRoom` takes it. */
function previewOf(ownerRef: string, planTier: PlanTier = "premium"): Promise<RoomPreview> {
  return realRoom().precheck(Object.freeze({
    access: Object.freeze({ ownerRef, legacyAskerId: null }),
    settingsClass: Object.freeze({ planTier, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 })
  }));
}

async function roomOf(ownerRef: string): Promise<PersonRoomInput | null> {
  return personRoomOf(await previewOf(ownerRef));
}

const debaterModels = (panel: readonly DiscoveredPanelMember[]) => panel.map((entry) => entry.model_id).sort();

describe("S2 · the person's room on the picker path (hosted, VALID scorecard)", () => {
  it("gives a PLUS person with room the best models", async () => {
    const ref = await owner("PLUS", 0);
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), await roomOf(ref));
    expect(admitted.modelAssignment?.appliedStrength).toBe("BEST");
    expect(admitted.modelAssignment?.steppedDown).toBe(false);
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-top", "model-oa-top"]);
    expect(admitted.pickedHoldMicros).toBe(30_000);
    expect(admitted.personRoomTight).toBe(false);
  });

  it("gives a person with a small room ECONOMY models", async () => {
    // Today 990 000 of 1 000 000: a room of 10 000 — body 7 000, and the whole run held to the 10 000 itself.
    const ref = await owner("PLUS", 990_000);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("START");
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), personRoomOf(preview));
    expect(admitted.modelAssignment?.appliedStrength).toBe("ECONOMY");
    expect(admitted.modelAssignment?.steppedDown).toBe(true);
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-lite", "model-oa-lite"]);
    expect(admitted.personRoomTight).toBe(false);
  });

  it("starts a person whose room is below even ECONOMY at ECONOMY, never refused (A5)", async () => {
    // Today 999 700 of 1 000 000: a room of 300 — ECONOMY's 480 while arguing is over its body of 210.
    const ref = await owner("PLUS", 999_700);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("START");
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), personRoomOf(preview));
    expect(admitted.modelAssignment?.appliedStrength).toBe("ECONOMY");
    expect(admitted.personRoomTight).toBe(true);
    expect(admitted.pickedHoldMicros).toBe(600);
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-lite", "model-oa-lite"]);
  });

  it("lets a person with a FULL window wait, plans the question for the room it wakes to, and plans it for NOW too", async () => {
    const ref = await owner("PLUS", 1_000_000);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("WAIT");
    if (preview.admission.kind !== "WAIT") return;
    expect(preview.admission.worstScope).toBe("PERSON_DAY");
    // Full on SPEND: B6a looks again when the day resets, which is also the room's `waitsUntil`.
    expect(preview.waitReason).toEqual({ waitsFor: "PERSON", personRecheckAt: preview.admission.waitsUntil });
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), personRoomOf(preview));
    // The wake plan: the day window has reset by `personRecheckAt`.
    expect(admitted.modelAssignment?.appliedStrength).toBe("BEST");
    expect(admitted.personRoomTight).toBe(false);
    // The plan `#submitWithRoom` pins if the LOCKED decision starts it after all (the day still spent):
    // ECONOMY against the site's ceiling (A5), with its own hold and its own debaters.
    expect(admitted.ifStartsNow?.modelAssignment?.appliedStrength).toBe("ECONOMY");
    expect(admitted.ifStartsNow?.modelAssignment?.steppedDown).toBe(true);
    expect(admitted.ifStartsNow?.personRoomTight).toBe(true);
    expect(admitted.ifStartsNow?.pickedHoldMicros).toBe(600);
    expect(debaterModels(admitted.ifStartsNow!.discoveredPanel)).toEqual(["model-an-lite", "model-oa-lite"]);
  });

  it("plans a wait that only the person's own live debate causes for the next minute, never for the day's reset", async () => {
    // Today 550 000 spent of 1 000 000, and a live debate holding 550 000 more: the day is FULL on holds, not on
    // spend, so B6a looks again at the next whole minute (the live debate may end any time) — long before the day
    // resets. A wake plan sized for a whole new day (BEST) could start at that minute into what the live debate
    // left, past the owner's 110 % leeway; the plan is made for the room as measured instead.
    const ref = await owner("PLUS", 550_000);
    await liveDebateHolding(ref, 550_000);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("WAIT");
    if (preview.admission.kind !== "WAIT") return;
    expect(preview.admission.worstScope).toBe("PERSON_DAY");
    expect(preview.waitReason).toEqual({ waitsFor: "PERSON", personRecheckAt: nextWholeMinute(preview.now) });
    // Part 1b's final review (Important 1): such a wait is expected at the next tick and waits for the
    // person's own debates, so `waitsUntil` is that minute too; the day itself resets long after it.
    expect(preview.admission.waitsFor).toBe("OWN_DEBATES");
    expect(preview.admission.waitsUntil).toEqual(nextWholeMinute(preview.now));
    const day = preview.personUses.find((window) => window.scope === "PERSON_DAY");
    expect(nextWholeMinute(preview.now).getTime()).toBeLessThan(day!.resetsAt.getTime());
    const room = personRoomOf(preview);
    expect(room?.at).toEqual(nextWholeMinute(preview.now));
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), room);
    // Nothing is left of the day as measured (spend + the live hold), so the wake plan is ECONOMY as CLOSE (A5).
    expect(admitted.modelAssignment?.appliedStrength).toBe("ECONOMY");
    expect(admitted.modelAssignment?.appliedStrength).not.toBe("BEST");
    expect(admitted.modelAssignment?.steppedDown).toBe(true);
    expect(admitted.personRoomTight).toBe(true);
    expect(admitted.pickedHoldMicros).toBe(600);
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-lite", "model-oa-lite"]);
    // The plan for NOW is the same careful plan.
    expect(admitted.ifStartsNow?.modelAssignment?.appliedStrength).toBe("ECONOMY");
  });

  it("makes no second plan for a question that starts (only a WAIT preview has a NOW that differs)", async () => {
    const ref = await owner("PLUS", 0);
    const admitted = await evaluateAskAdmission(settings(), ask("premium"), await roomOf(ref));
    expect(admitted.ifStartsNow).toBeUndefined();
  });

  it("caps a FREE person at ECONOMY by the tier B8 decides, whatever the ask says", async () => {
    const ref = await owner("FREE", 0);
    const billing: AskBilling = Object.freeze({
      plans: PLANS,
      entitlements: entitlements(),
      coarseFit: Object.freeze({
        personAllowance: new BillingPersonAllowanceSource({ entitlements: entitlements(), plans: PLANS, closeBasisPoints: 9500 }),
        spend: spendStore(),
        estimator: { estimateMicros: async () => 30_000 }
      }),
      clock: () => new Date()
    });
    const resolved = await resolveBillingAsk(ask("premium"), ref, billing, new Date());
    expect(resolved.ask.plan_tier).toBe("free");
    const admitted = await evaluateAskAdmission(settings(), resolved.ask, personRoomOf(await previewOf(ref, "free")));
    expect(admitted.modelAssignment?.appliedStrength).toBe("ECONOMY");
    expect(admitted.modelAssignment?.steppedDown).toBe(false);
  });

  it("keeps the site's refusal when the site's own ceiling cannot hold ECONOMY — person or not", async () => {
    const tinySite: AskMoneyPolicy = Object.freeze({ perRunCeilingMicros: 500, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });
    const withoutPerson = await evaluateAskAdmission(settings(tinySite), ask("premium"), null).then(() => null, (error: unknown) => error);
    expect(withoutPerson).toBeInstanceOf(AskRefusal);
    expect(withoutPerson).toMatchObject({ code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL" });
    const ref = await owner("PLUS", 0);
    const withPerson = await evaluateAskAdmission(settings(tinySite), ask("premium"), await roomOf(ref)).then(() => null, (error: unknown) => error);
    expect(withPerson).toBeInstanceOf(AskRefusal);
    expect(withPerson).toMatchObject({ code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL" });
  });
});

/**
 * P3-I1 (controller's ruling, 3 October 2026): spec A5's "the debate starts at the cheapest choice" governs.
 * Three tiers per maker — top (1000 a call, q95), mid (300, q92) and lite (20, q70) — with every role's economy
 * cap at 1000 a call, above BALANCED's pick: ECONOMY is "the best model under that cap", the tops, so it is the
 * DEAREST plan here, not the cheapest. Two debaters at depth 1 make 30 calls, 24 while arguing:
 *   BEST tops 30 000 (24 000 arguing) · BALANCED mids 9000 (7200 arguing) · ECONOMY tops 30 000 (24 000 arguing).
 */
describe("P3-I1 · A5 starts at the cheapest choice when ECONOMY is not the cheapest plan (hosted, VALID scorecard)", () => {
  const candidates = [
    ...CANDIDATES,
    testCandidate("oa-mid", "OpenAI"), testCandidate("an-mid", "Anthropic")
  ];
  const entries = [...ENTRIES, testEntry("oa-mid", 92, 1), testEntry("an-mid", 92, 1)];
  const cap = Object.freeze({ moneyMicrosPerCall: 1000, secondsPerCall: 50 });
  const tierPrice = (candidateId: string) => (candidateId.endsWith("-mid") ? 300_000 : priceOf(candidateId));
  const world: World = Object.freeze({
    scorecard: testScorecard(
      candidates,
      Object.fromEntries(DEBATE_ROLES.map((role) => [role, entries])),
      { diversityShare: 0, planStrengthCaps: { free: "ECONOMY" }, economyCap: economyCaps(Object.fromEntries(DEBATE_ROLES.map((role) => [role, cap]))) }
    ),
    targets: candidates.map((candidate) => Object.freeze({
      providerRef: `provider:${candidate.candidateId}`, maker: candidate.maker, baseUrl: "https://vendor.test/v1",
      model: candidate.modelId,
      inputPriceMicrosPerMillionTokens: tierPrice(candidate.candidateId),
      outputPriceMicrosPerMillionTokens: tierPrice(candidate.candidateId)
    })),
    panel: candidates.map((candidate) => Object.freeze({
      provider_ref: `provider:${candidate.candidateId}`, maker: candidate.maker, model_id: candidate.modelId,
      probe_evidence_ref: `probe:${candidate.candidateId}`, probed_at: "2026-10-01T00:00:00.000Z"
    }))
  });
  // Site ceiling 20 000 (arguing 14 000, whole run 24 000): BALANCED fits it, ECONOMY and BEST do not.
  const site20k: AskMoneyPolicy = Object.freeze({ perRunCeilingMicros: 20_000, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });

  it("plans the site alone at BALANCED (the site allows BALANCED)", async () => {
    const admitted = await evaluateAskAdmission(settings(site20k, world), ask("premium"), null);
    expect(admitted.modelAssignment?.appliedStrength).toBe("BALANCED");
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-mid", "model-oa-mid"]);
  });

  it("STARTS a person short on room on the cheapest plan the site allows (BALANCED), never the site's refusal", async () => {
    // Today 995 000 of 1 000 000: a room of 5000 (arguing 3500) — no strength fits the person.
    const ref = await owner("PLUS", 995_000);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("START");
    const admitted = await evaluateAskAdmission(settings(site20k, world), ask("premium"), personRoomOf(preview));
    expect(admitted.modelAssignment?.appliedStrength).toBe("BALANCED");
    expect(admitted.modelAssignment?.steppedDown).toBe(true);
    expect(admitted.personRoomTight).toBe(true);
    expect(admitted.pickedHoldMicros).toBe(9000);
    expect(debaterModels(admitted.discoveredPanel)).toEqual(["model-an-mid", "model-oa-mid"]);
  });

  it("lets a person with a FULL window WAIT, and plans NOW on the cheapest plan the site allows — never a refusal", async () => {
    const ref = await owner("PLUS", 1_000_000);
    const preview = await previewOf(ref);
    expect(preview.admission.kind).toBe("WAIT");
    const admitted = await evaluateAskAdmission(settings(site20k, world), ask("premium"), personRoomOf(preview));
    // The wake plan (the day has reset): the person's room is large, and the site allows BALANCED.
    expect(admitted.modelAssignment?.appliedStrength).toBe("BALANCED");
    expect(admitted.personRoomTight).toBe(false);
    // The plan for NOW (a room of 0): A5 on the cheapest plan the site allows.
    expect(admitted.ifStartsNow?.modelAssignment?.appliedStrength).toBe("BALANCED");
    expect(admitted.ifStartsNow?.personRoomTight).toBe(true);
    expect(admitted.ifStartsNow?.pickedHoldMicros).toBe(9000);
  });

  it("starts a short person on BALANCED's 9000, not ECONOMY's 30 000, when the site allows every strength", async () => {
    const ref = await owner("PLUS", 995_000);
    const admitted = await evaluateAskAdmission(settings(SITE, world), ask("premium"), await roomOf(ref));
    expect(admitted.modelAssignment?.appliedStrength).toBe("BALANCED");
    expect(admitted.personRoomTight).toBe(true);
    expect(admitted.pickedHoldMicros).toBe(9000);
  });

  it("refuses only when no strength fits the site — the site's own refusal, person or not", async () => {
    // Site 5000 (arguing 3500): BALANCED's 7200 of arguing is over it, and so is every other strength.
    const smallSite: AskMoneyPolicy = Object.freeze({ perRunCeilingMicros: 5000, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });
    const withoutPerson = await evaluateAskAdmission(settings(smallSite, world), ask("premium"), null).then(() => null, (error: unknown) => error);
    expect(withoutPerson).toBeInstanceOf(AskRefusal);
    expect(withoutPerson).toMatchObject({ code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL" });
    const ref = await owner("PLUS", 995_000);
    const withPerson = await evaluateAskAdmission(settings(smallSite, world), ask("premium"), await roomOf(ref)).then(() => null, (error: unknown) => error);
    expect(withPerson).toBeInstanceOf(AskRefusal);
    expect(withPerson).toMatchObject({ code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL" });
  });
});
