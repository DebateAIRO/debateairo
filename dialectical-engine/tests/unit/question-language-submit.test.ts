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
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import { LivenessRepository } from "@debateai/liveness";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues, type PlanId
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { PersonWindow } from "@debateai/budget";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomPort, RoomDecision } from "../../apps/api/src/ask-room.js";
import {
  QuestionLanguageChoiceNeeded, type QuestionLanguageLock, type QuestionLanguagePort
} from "../../apps/api/src/question-language/decider.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { questionCheckPass } from "../support/questionCheckPass.js";

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

// Final review M14: a premium person with one roomy window, so the coarse fit reads the allowance, the spend and the
// estimate (a free ask or no window returns before any of them, and the CR-1 spies would watch nothing).
const ROOMY_WINDOW: PersonWindow = Object.freeze({ scope: "PERSON_MONTH", limitMicros: 1_000_000_000,
  periodStart: new Date("2026-10-01T00:00:00.000Z"), resetsAt: new Date("2026-11-01T00:00:00.000Z"),
  finishBasisPoints: 11_000, closeBasisPoints: 9_500 });

function billingFor(planId: PlanId, windows: readonly PersonWindow[] = []) {
  const estimateMicros = vi.fn(async (_settings: unknown) => 1_000);
  const billing: AskBilling = Object.freeze({
    plans,
    entitlements: { current: vi.fn(async () => ({ planId, eventId: EVENT_ID })) },
    coarseFit: Object.freeze({
      personAllowance: { read: async () => windows },
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
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const Q = "Ar trebui România să adopte euro?";
const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "medium", depth_params: { depth: 2 }, decision_scope: "question language submit",
  as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
// Final review I7: a lock the guesser can never produce for Q (Q reads as Romanian), so a startRun call site that drops
// the lock for today's guesser turns these tests red.
const LOCK: QuestionLanguageLock = Object.freeze({ language: { code: "sr-Latn", name: "Serbian (Latin script)" }, source: "ELD_SITE", siteLanguage: "ro",
  rewriteAccepted: false, originalQuestionLine: null, trace: { eld: { code: "sr", reliable: true, confident: true }, fast: null, contractHash: null },
  recordCode: "ELD_SITE", localReason: null });
// Final review I2 (ruling L-SHAPED-ONLY): one maker, so admission mints no shape receipt (resolveDebateShape needs two).
const ONE_MAKER_PANEL = PANEL.map((seat) => Object.freeze({ ...seat, maker: "maker:0" as const }));
const OFFER = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Ar trebui România să adopte euro sau să aștepte?" };

const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const ROOM_TX = Object.freeze({ query: vi.fn() }) as unknown as PoolClient;
// A fresh room per test, so a test can spy on its decide (final review I7: the room's path is proven taken).
const startingRoom = (): AskRoomPort => ({
  precheck: async () => ({ admission: START, estimateMicros: 1_000, now: NOW, personUses: [],
    waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) }),
  decide: async (_question, apply) => apply({ admission: START, estimateMicros: 1_000, now: NOW, tx: ROOM_TX }),
  enterWait: async () => undefined,
  openStart: async () => undefined,
  expectedStart: async () => null
});

function arrangeWith(input: Readonly<{ policy: boolean; port?: QuestionLanguagePort; billing?: AskBilling; room?: AskRoomPort;
  openAdmissionLock?: () => unknown; resolveDiscoveredPanel?: () => Promise<typeof PANEL>; extra?: Partial<RunCreationSettings> }>) {
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
    ...(input.port === undefined ? {} : { questionLanguage: input.port }),
    ...input.extra
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
    expect(detectArgumentLanguage(Q).tag).not.toBe(LOCK.language.code);
    expect(started[0]!.envelopeBasis.shape).toBeDefined();
    expect(started[0]).toMatchObject({ argumentLanguageTag: "sr-Latn", argumentLanguageName: "Serbian (Latin script)" });
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "sr-Latn", source: "ELD_SITE", site_language: "ro", rewrite_accepted: false } });
    expect(Object.keys(started[0]!.askContract!)).toEqual([...TODAYS_ASK_CONTRACT_KEYS, "question_language"]);
  });

  it("the row present, the room's path: the second startRun carries the same lock and record", async () => {
    const decide = vi.fn(async () => LOCK);
    const room = startingRoom();
    const roomDecide = vi.spyOn(room, "decide");
    const { application, started } = arrangeWith({ policy: true, port: { decide }, room });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(roomDecide).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(1);
    expect(started[0]!.envelopeBasis.shape).toBeDefined();
    expect(started[0]).toMatchObject({ argumentLanguageTag: "sr-Latn", argumentLanguageName: "Serbian (Latin script)" });
    expect(Object.keys(started[0]!.askContract!)).toEqual([...TODAYS_ASK_CONTRACT_KEYS, "question_language"]);
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "sr-Latn", source: "ELD_SITE" } });
  });

  // Final review I2, ruling L-SHAPED-ONLY: the lock is stored only when admission minted a shape receipt. A one-maker
  // run has none, so the runner argues it with today's directive and today's reply check: it must store today's guess.
  it("ruling L-SHAPED-ONLY: one maker (no shape minted) stores today's guess and today's four keys, on both startRun paths", async () => {
    for (const room of [undefined, startingRoom()]) {
      const path = room === undefined ? "today's path" : "the room's path";
      const roomDecide = room === undefined ? undefined : vi.spyOn(room, "decide");
      const decide = vi.fn(async () => LOCK);
      const { application, started } = arrangeWith({ policy: true, port: { decide }, resolveDiscoveredPanel: async () => ONE_MAKER_PANEL,
        ...(room === undefined ? {} : { room }) });
      await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
      expect(decide, path).toHaveBeenCalledTimes(1);
      if (roomDecide !== undefined) expect(roomDecide, path).toHaveBeenCalledTimes(1);
      expect(started, path).toHaveLength(1);
      expect(started[0]!.envelopeBasis.shape, path).toBeUndefined();
      expect(started[0], path).toMatchObject({ argumentLanguageTag: detectArgumentLanguage(Q).tag, argumentLanguageName: detectArgumentLanguage(Q).nameEn });
      expect(Object.keys(started[0]!.askContract!), path).toEqual(TODAYS_ASK_CONTRACT_KEYS);
      vi.restoreAllMocks();
    }
  });

  it("ruling L-SHAPED-ONLY: an accepted rewrite on a run with no shape keeps the rewrite as the question and stores no original", async () => {
    const original = "Ar trebui România să adopte the euro?";
    const rewritten: QuestionLanguageLock = Object.freeze({ ...LOCK, source: "CHOICE", recordCode: "CHOICE", rewriteAccepted: true,
      originalQuestionLine: original, trace: { eld: null, fast: null, contractHash: "hash" } });
    const { application, started } = arrangeWith({ policy: true, port: { decide: async () => rewritten }, resolveDiscoveredPanel: async () => ONE_MAKER_PANEL });
    await application.submit(ask({ question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: original } }),
      serverSession, serverPrincipal);
    expect(started[0]!.questionLine).toBe(Q);
    expect(started[0]!.envelopeBasis.shape).toBeUndefined();
    expect(started[0]).toMatchObject({ argumentLanguageTag: detectArgumentLanguage(Q).tag, argumentLanguageName: detectArgumentLanguage(Q).nameEn });
    expect(Object.keys(started[0]!.askContract!)).toEqual(TODAYS_ASK_CONTRACT_KEYS);
    expect(JSON.stringify(started[0]!.askContract)).not.toContain("the euro");
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

  // Pre-flight PF-L31: billing on, so each spy watches a port the request would otherwise reach. Final review M14: a
  // premium person with a window, and the control below proves every spy is reached when the decider locks instead.
  const arrangeCr1 = (port: QuestionLanguagePort) => {
    const { billing, estimateMicros } = billingFor("PRO", [ROOMY_WINDOW]);
    const spies = { entitlements: billing.entitlements.current as ReturnType<typeof vi.fn>, estimateMicros,
      allowanceRead: vi.spyOn(billing.coarseFit.personAllowance, "read"),
      spentRead: vi.spyOn(billing.coarseFit.spend, "readOwnerSpentMicros"),
      resolveDiscoveredPanel: vi.fn(async () => PANEL) };
    const { application, started } = arrangeWith({ policy: true, billing, resolveDiscoveredPanel: spies.resolveDiscoveredPanel, port });
    return { application, started, spies };
  };

  it("CR-1: an offer starts no run and touches neither the person's allowance nor money", async () => {
    const { application, started, spies } = arrangeCr1({
      decide: async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); } });
    await expect(application.submit(ask({ site_language: "ro", plan_tier: "premium" }), serverSession, serverPrincipal))
      .rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(started).toEqual([]);
    for (const [name, spy] of Object.entries(spies)) expect(spy, name).not.toHaveBeenCalled();
  });

  it("CR-1 control: the same arrangement with a lock reaches every port the offer test watches", async () => {
    const { application, started, spies } = arrangeCr1({ decide: async () => LOCK });
    await application.submit(ask({ site_language: "ro", plan_tier: "premium" }), serverSession, serverPrincipal);
    for (const [name, spy] of Object.entries(spies)) expect(spy, name).toHaveBeenCalled();
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

  // Hardening round (Tasks 10+11 review): the decider is asked only after the checks today's submit makes first.
  it("the decider is never asked when the session does not match the principal", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: true, port: { decide } });
    await expect(application.submit(ask({ site_language: "ro" }), { ...serverSession, asker_id: "owner:someone-else" }, serverPrincipal))
      .rejects.toMatchObject({ code: "RUN_PRINCIPAL_SESSION_MISMATCH" });
    expect(decide).not.toHaveBeenCalled();
    expect(started).toEqual([]);
  });

  it("the decider is never asked when the preview's team check refuses the person", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: true, port: { decide },
      extra: { previewProviderTestConfig: PREVIEW, previewTeamUserIds: ["77777777-7777-4777-8777-777777777777"] } });
    await expect(application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal))
      .rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(decide).not.toHaveBeenCalled();
    expect(started).toEqual([]);
  });

  it("with the row and a decider, an unknown plan tier is today's ASK_PLAN_TIER_INVALID and the decider is never asked", async () => {
    for (const room of [undefined, startingRoom()]) {
      const decide = vi.fn(async () => LOCK);
      const { application, started } = arrangeWith({ policy: true, port: { decide }, ...(room === undefined ? {} : { room }) });
      await expect(application.submit(ask({ site_language: "ro", plan_tier: "gold" as never }), serverSession, serverPrincipal))
        .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_INVALID" });
      expect(decide, room === undefined ? "today's path" : "the room's path").not.toHaveBeenCalled();
      expect(started).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  it("the route answers the offer as a strict 409 body, and a stale or forged choice as 409 with its code", async () => {
    const identity = testHttpIdentity("language");
    const sessions = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "given" as const, recordSensitiveDataConsent: async () => "given" as const };
    const offering = buildApi({ application: fixtureApplication(async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); }),
      questionCheck: questionCheckPass, sessions, allowedOrigin: TEST_APP_ORIGIN });
    const offered = await offering.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask({ site_language: "ro" }) });
    expect(offered.statusCode).toBe(409);
    expect(offered.json()).toEqual({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER });
    expect(QuestionLanguageChoiceNeededSchema.safeParse(offered.json()).success).toBe(true);
    await offering.close();
    for (const code of ["QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHOICE_MISMATCH"]) {
      const refusing = buildApi({ application: fixtureApplication(async () => { throw new AskRefusal(new TypedDomainError(code, code)); }),
        questionCheck: questionCheckPass, sessions, allowedOrigin: TEST_APP_ORIGIN });
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
