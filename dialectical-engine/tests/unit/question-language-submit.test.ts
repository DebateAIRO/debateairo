/**
 * Question language (spec 2026-10-13), Task 11: the ask.
 *
 *  - with the debate shape row in force, the language is decided as the FIRST step of submit (after the route's crisis,
 *    consent, team, limiter and country checks; before billing, admission and any lock — plan decision D1);
 *  - the lock is the run's tag and name in BOTH startRun calls (today's path and the room's), and its record joins the
 *    stored ask contract as one member (D3);
 *  - the row absent: today's guesser, today's four ask-contract keys, the decider never asked;
 *  - an offer ends the request as a strict 409 body and touches neither the person's allowance nor money (CR-1);
 *  - a signed-out (legacy) person is decided without the fast AI (ruling L-NOCONSENT);
 *  - a stale or forged choice is a 409 with its code.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskRefusal, PostgresAskApplication, buildApi, type AskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import {
  PLAN_TIER_ROSTERS, QUESTION_LANGUAGE_CHOICE_NEEDED, QuestionLanguageChoiceNeededSchema, type AskRequest, type Session
} from "@debateai/contract";
import { RunCostSubstitutionRepository, RunRepository } from "@debateai/db";
import { TypedDomainError, detectArgumentLanguage } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues, type PlanId
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomPort, RoomDecision } from "../../apps/api/src/ask-room.js";
import {
  QuestionLanguageChoiceNeeded, type QuestionLanguageLock, type QuestionLanguagePort
} from "../../apps/api/src/question-language/decider.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

// stubPool, PANEL, CEILING_TERMS, serverSession, serverPrincipal, fixtureApplication, billingFor: as debate-shape-submit.test.ts.
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-10-13T12:00:00.000Z");
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

const serverSession: Session = {
  session_id: "33333333-3333-4333-8333-333333333333", asker_id: `owner:${OWNER_REF}`, caller_scope: "ASKER",
  ownership_provenance: "server_session", provisional_identity_model: false
};
const serverPrincipal = { kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF };

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const PANEL = [...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium].map((modelId, index) => Object.freeze({
  provider_ref: `provider:${index}`, maker: `maker:${index}`, model_id: modelId,
  probe_evidence_ref: `probe:${index}`, probed_at: "2026-10-13T00:00:00.000Z"
}));

function billingFor(planId: PlanId) {
  const estimateMicros = vi.fn(async (_settings: unknown) => 1_000);
  const billing: AskBilling = Object.freeze({
    plans,
    entitlements: { current: vi.fn(async () => ({ planId, eventId: EVENT_ID })) },
    coarseFit: Object.freeze({
      personAllowance: { read: async () => [] },
      spend: { readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0 },
      estimator: { estimateMicros }
    }),
    clock: () => NOW
  });
  return { billing, estimateMicros };
}

function fixtureApplication(
  submit: AskApplication["submit"] = async () => ({ run_ref: RUN_ID, status: "QUEUED" as const })
): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit,
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const Q = "Ar trebui România să adopte euro?";
const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "medium", depth_params: { depth: 2 }, decision_scope: "question language submit",
  as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
const LOCK: QuestionLanguageLock = Object.freeze({ language: { code: "ro", name: "Romanian" }, source: "ELD_SITE", siteLanguage: "ro",
  rewriteAccepted: false, originalQuestionLine: null, trace: { eld: { code: "ro", reliable: true, confident: true }, fast: null, contractHash: null },
  recordCode: "ELD_SITE", localReason: null });
const OFFER = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Ar trebui România să adopte euro sau să aștepte?" };

const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const ROOM_TX = Object.freeze({ query: vi.fn() }) as unknown as PoolClient;
const startingRoom: AskRoomPort = {
  precheck: async () => ({ admission: START, estimateMicros: 1_000, now: NOW, personUses: [],
    waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) }),
  decide: async (_question, apply) => apply({ admission: START, estimateMicros: 1_000, now: NOW, tx: ROOM_TX }),
  enterWait: async () => undefined,
  openStart: async () => undefined,
  expectedStart: async () => null
};

function arrangeWith(input: Readonly<{ policy: boolean; port?: QuestionLanguagePort; billing?: AskBilling; room?: AskRoomPort;
  openAdmissionLock?: () => unknown; resolveDiscoveredPanel?: () => Promise<typeof PANEL> }>) {
  const started: Array<Parameters<RunRepository["startRun"]>[0]> = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (run) => { started.push(run); return RUN_ID; });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue("22222222-2222-4222-8222-222222222222");
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockResolvedValue("22222222-2222-4222-8222-222222222222");
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  vi.spyOn(RunCostSubstitutionRepository.prototype, "record").mockResolvedValue("substitution:language");
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "language-submit", settlementWatchHandle: "language-submit",
    resolveDiscoveredPanel: input.resolveDiscoveredPanel ?? (async () => PANEL),
    ...(input.billing === undefined ? {} : { billing: input.billing }),
    ...(input.room === undefined ? {} : { room: input.room }),
    ...(input.openAdmissionLock === undefined ? {} : { previewBudgetGate: { openAdmissionLock: input.openAdmissionLock } as never }),
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned, ...(shape === null ? {} : { shape }) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    ...(input.policy ? { debateShapePolicy: debateShapePolicyStartValues() } : {}),
    ...(input.port === undefined ? {} : { questionLanguage: input.port })
  };
  const application = new PostgresAskApplication(stubPool(), { dispatch: vi.fn(async () => undefined) }, settings,
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  return { application, started };
}

const TODAYS_ASK_CONTRACT_KEYS = ["decision_scope", "steering_presets", "steering_annotations", "critic_unavailable_cap"];

afterEach(() => { vi.restoreAllMocks(); });

describe("submit with the question-language step (question-language spec 2026-10-13)", () => {
  it("the row absent: the decider is never asked, the guesser decides, the ask contract is today's four keys", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: false, port: { decide } });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).not.toHaveBeenCalled();
    expect(started[0]).toMatchObject({ argumentLanguageTag: detectArgumentLanguage(Q).tag, argumentLanguageName: detectArgumentLanguage(Q).nameEn });
    expect(Object.keys(started[0]!.askContract!)).toEqual(TODAYS_ASK_CONTRACT_KEYS);
  });

  it("the row present but no decider composed: today's guesser and today's four keys (one half is today's path)", async () => {
    const { application, started } = arrangeWith({ policy: true });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(started[0]).toMatchObject({ argumentLanguageTag: detectArgumentLanguage(Q).tag, argumentLanguageName: detectArgumentLanguage(Q).nameEn });
    expect(Object.keys(started[0]!.askContract!)).toEqual(TODAYS_ASK_CONTRACT_KEYS);
  });

  it("the row present: the lock's code and name are the run's, and the record joins the ask contract", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: true, port: { decide } });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).toHaveBeenCalledWith({ ask: expect.objectContaining({ question_line: Q, site_language: "ro" }), ownerScope: `owner:${serverPrincipal.ownerRef}`,
      fastCheckAllowed: true });
    expect(started[0]).toMatchObject({ argumentLanguageTag: "ro", argumentLanguageName: "Romanian" });
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE", site_language: "ro", rewrite_accepted: false } });
    expect(Object.keys(started[0]!.askContract!)).toEqual([...TODAYS_ASK_CONTRACT_KEYS, "question_language"]);
  });

  it("the row present, the room's path: the second startRun carries the same lock and record", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: true, port: { decide }, room: startingRoom });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ argumentLanguageTag: "ro", argumentLanguageName: "Romanian" });
    expect(Object.keys(started[0]!.askContract!)).toEqual([...TODAYS_ASK_CONTRACT_KEYS, "question_language"]);
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE" } });
  });

  it("an accepted rewrite: the original question is kept only inside the stored ask contract", async () => {
    const rewritten: QuestionLanguageLock = Object.freeze({ ...LOCK, source: "CHOICE", recordCode: "CHOICE", rewriteAccepted: true,
      originalQuestionLine: "Ar trebui România să adopte the euro?", trace: { eld: null, fast: null, contractHash: "hash" } });
    const { application, started } = arrangeWith({ policy: true, port: { decide: async () => rewritten } });
    await application.submit(ask({ question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE",
      original_question_line: "Ar trebui România să adopte the euro?" } }), serverSession, serverPrincipal);
    expect(started[0]!.questionLine).toBe(Q);
    expect(started[0]!.askContract).toMatchObject({ question_language: { source: "CHOICE", rewrite_accepted: true,
      original_question_line: "Ar trebui România să adopte the euro?" } });
  });

  it("CR-1: an offer starts no run and touches neither the person's allowance nor money", async () => {
    // Pre-flight PF-L31: billing on, so each spy watches a port the request would otherwise reach.
    const { billing, estimateMicros } = billingFor("FREE");
    const allowanceRead = vi.spyOn(billing.coarseFit.personAllowance, "read");
    const spentRead = vi.spyOn(billing.coarseFit.spend, "readOwnerSpentMicros");
    const openAdmissionLock = vi.fn();
    const resolveDiscoveredPanel = vi.fn(async () => PANEL);
    const { application, started } = arrangeWith({ policy: true, billing, openAdmissionLock, resolveDiscoveredPanel,
      port: { decide: async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); } } });
    await expect(application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(started).toEqual([]);
    expect(billing.entitlements.current).not.toHaveBeenCalled();
    expect(estimateMicros).not.toHaveBeenCalled();
    expect(allowanceRead).not.toHaveBeenCalled();
    expect(spentRead).not.toHaveBeenCalled();
    expect(resolveDiscoveredPanel).not.toHaveBeenCalled();
    expect(openAdmissionLock).not.toHaveBeenCalled();
  });

  it("CR-1 control: the same arrangement with a lock reaches billing (the spies above watch live ports)", async () => {
    const { billing } = billingFor("FREE");
    const { application, started } = arrangeWith({ policy: true, billing, port: { decide: async () => LOCK } });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(billing.entitlements.current).toHaveBeenCalled();
    expect(started).toHaveLength(1);
  });

  it("a refused choice is an ask refusal with its code, and no run starts", async () => {
    const { application, started } = arrangeWith({ policy: true,
      port: { decide: async () => { throw new TypedDomainError("QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHECK_EXPIRED"); } } });
    const refused = application.submit(ask({ question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } }), serverSession, serverPrincipal);
    await expect(refused).rejects.toBeInstanceOf(AskRefusal);
    await expect(refused).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_CHECK_EXPIRED" });
    expect(started).toEqual([]);
  });

  it("ruling L-NOCONSENT: a signed-out (legacy) person is decided without the fast AI", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application } = arrangeWith({ policy: true, port: { decide } });
    const legacySession = { ...serverSession, ownership_provenance: "legacy" as never, asker_id: "asker-legacy-1" };
    await application.submit(ask({ site_language: "ro" }), legacySession, { kind: "legacy", legacyAskerId: "asker-legacy-1" });
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ ownerScope: "legacy:asker-legacy-1", fastCheckAllowed: false }));
  });

  it("the route answers the offer as a strict 409 body, and a stale or forged choice as 409 with its code", async () => {
    const identity = testHttpIdentity("language");
    const sessions = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "given" as const, recordSensitiveDataConsent: async () => "given" as const };
    const offering = buildApi({ application: fixtureApplication(async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); }),
      sessions, allowedOrigin: TEST_APP_ORIGIN });
    const offered = await offering.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask({ site_language: "ro" }) });
    expect(offered.statusCode).toBe(409);
    expect(offered.json()).toEqual({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER });
    expect(QuestionLanguageChoiceNeededSchema.safeParse(offered.json()).success).toBe(true);
    await offering.close();
    for (const code of ["QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHOICE_MISMATCH"]) {
      const refusing = buildApi({ application: fixtureApplication(async () => { throw new AskRefusal(new TypedDomainError(code, code)); }),
        sessions, allowedOrigin: TEST_APP_ORIGIN });
      const refused = await refusing.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: ask({ question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } }) });
      expect(refused.statusCode, code).toBe(409);
      expect(refused.json()).toMatchObject({ error: code });
      expect(refused.headers["retry-after"], code).toBeUndefined();
      await refusing.close();
    }
  });

  it("a choice that names its own language is malformed (400), and a person without consent never reaches submit", async () => {
    const identity = testHttpIdentity("language-consent");
    const submit = vi.fn(async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }));
    const noConsent = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "required" as const, recordSensitiveDataConsent: async () => "given" as const };
    const api = buildApi({ application: fixtureApplication(submit), sessions: noConsent, allowedOrigin: TEST_APP_ORIGIN });
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask() })).statusCode).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    await api.close();
    const consented = { ...noConsent, readSensitiveDataConsent: async () => "given" as const };
    const api2 = buildApi({ application: fixtureApplication(submit), sessions: consented, allowedOrigin: TEST_APP_ORIGIN });
    const malformed = await api2.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
      payload: ask({ question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE", language: "en" } as never }) });
    expect(malformed.statusCode).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    await api2.close();
  });
});
