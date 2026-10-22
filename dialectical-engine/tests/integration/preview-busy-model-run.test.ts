// A busy model never blocks a preview debate: the RUNNER's proof (spec
// docs/superpowers/specs/2026-10-11-preview-busy-model-design.md, "Must be proven by tests", Runner and Claim probe).
// On 2026-10-11 DeepInfra answered 429 to GLM-5.3-Flash continuously. After the fix the ask admits the four models
// that answered and pins the four rotated roles among them (spec §3); this file is what happens next: the REAL
// WalkingSkeletonRunner, on a migrated embedded PostgreSQL, drives that four-maker debate at depth 2 to a served
// answer and a verdict story, and never sends GLM a byte although GLM stays configured (both reviewed GLM refs are
// targets, exactly as on the preview, and the sealed v11 writer ref preview:fixture-a is GLM).
// The providers are composed as apps/runner/src/main.ts composes them on the preview: the six reviewed targets, the
// topology's first target as primary, each gateway = withPreviewProviderCallPolicy(createPostgresProviderGateway(…
// over createPreviewGuardedFetch …), …, { busy })) with ONE busy coordinator, the attempt counter and the call scheduler
// (tests/support/preview-debate-harness.ts), both claim probes through observeClaimTimeTarget. The two gates are real RPC
// ports (createPreviewBudgetRpcPort) over unix-socket stubs that answer vendor-shaped replies by the request's
// contract, so the 409 mapping, the body checks and the Anthropic wire are the shipped ones. Only the 60-second
// waits are injected. Integration suites are skipped by the CI gate: run this file by hand before merging.
//
// JSON mode (spec "Check the JSON-mode needs"; owner, 2026-10-12): GLM is the only reviewed row with jsonObject true
// (packages/providers/src/preview-models.ts; MiMo's JSON mode was tried and withdrawn the same day). The story calls ask for JSON mode themselves
// (packages/story/src/writer.ts, preferredResponseFormat "json_object"); no debate step asks for it (asking on every
// structured served step was tried and withdrawn the same day: GLM in JSON mode answered a judging call with "{}").
// The gateway adds response_format only on the story lane AND for a gateway built with
// supportsJsonObjectResponse, which providerTargetGatewayControls sets only for a jsonObject row; the guarded fetch
// refuses response_format on any other row (packages/providers/src/preview-test.ts, deepInfraBodyAccepted). So here,
// without GLM, no request carries JSON mode; every story call goes out WITHOUT it, and the
// story's reader is a strict JSON.parse
// (packages/story/src/validate.ts:262-270),
// with the storyteller's one repair turn (story bound maxAttempts 2) as the only fallback. The doubles
// (tests/support/preview-gate-stubs.ts) answer bare JSON, so this file proves the plumbing, not that a real model answers bare JSON without JSON mode.
//
// Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, "Tests" T1 and T2): the
// second describe replays the live incident of run b53b9a9e on the same harness. Five makers at depth 2 with the
// incident's rotation pin; GLM (and in T1 Qwen) refuses every call after claim as a gate-proven unbilled 429; in T1
// the DeepInfra gate halts after its 4th unbilled release (409 PREVIEW_TEST_AUTHORITY_STOPPED, /remaining "halted").
// Both expect the run to be served all the same. They were written red first, against 8b3201d75.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { PreviewModelCooling, PREVIEW_PROVIDER_REF_MODELS } from "@debateai/providers";
import { ServeRepository } from "@debateai/serve";
import { StoryRepository } from "@debateai/story";
import type { RotatedRoles } from "@debateai/scorecard";
import { DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { GATE_ANSWERS_REACHING_VENDOR, STUB_COOL_OFF_RETRY_AFTER_SECONDS } from "../support/preview-gate-stubs.js";
import {
  DEEPSEEK,
  FIVE_MAKER_REFS,
  GLM,
  HAIKU,
  INCIDENT_PIN,
  MIMO,
  PANEL_REFS,
  POLICY,
  QWEN,
  RUN_RESILIENCE,
  SEALED_WRITER_REF,
  UNBILLED_RESEND_MS,
  previewDebateHarness,
  rotationPick
} from "../support/preview-debate-harness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  await Promise.all(stubClosers.splice(0).map((close) => close()));
});
afterAll(async () => database?.stop());

/**
 * The runner composed as apps/runner/src/main.ts composes it on the preview, over the two gates' doubles
 * (tests/support/preview-debate-harness.ts, shared with tests/integration/parallel-calls-debate.test.ts): the busy
 * coordinator, the attempt counter and the call scheduler included, the scheduler here with the register's
 * `callConcurrencyPolicy` row ABSENT (one call at a time per debate), as on every register that never published it.
 */
const {
  startGates, fixtureSettings, previewRunner, admittedRun, modelCalls, completedRun, disclosureOf, bodyFactsOf, servedAnswer
} = previewDebateHarness({ pool: () => database.pool, stubClosers });

describe("a preview debate admitted without busy GLM runs to an answer and a story (spec 2026-10-11 busy model)", () => {
  it("four makers, depth 2: the pinned writer's [409, OK] claim probe keeps it, and GLM is never sent a byte", async () => {
    const debate = await admittedRun("run");
    const writerModel = debate.rotated.answerWriter.modelId;
    const gates = await startGates({ [writerModel]: ["UNBILLED", "OK"] });
    const composed = await previewRunner(gates, "resend");
    const startedAt = new Date();
    const result = await composed.runner.executeWorkItem(debate.workItemId);
    if (result.kind !== "COMPLETED") throw new Error(`expected a completed run, got ${result.kind}`);

    // GLM is configured (both reviewed refs are targets; the topology's primary is GLM) but never called or probed.
    expect(composed.topology.primary.providerRef).toBe(SEALED_WRITER_REF);
    expect(gates.requests.filter((request) => request.model === GLM)).toEqual([]);
    expect(gates.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);

    // The claim probe (spec §2): one 60-second resend for the writer's unbilled refusal and nothing else; the four
    // members claim-eligible, each recorded HEALTHY; no member dropped, so no CLAIM_PANEL_REVISED disclosure.
    expect(composed.probeSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.callSleeps).toEqual([]);
    expect(composed.holdWaits).toEqual([]);
    const probes = gates.requests.filter((request) => request.kind === "PROBE").map((request) => request.model);
    expect([...probes].sort()).toEqual([...PANEL_REFS.map((ref) => PREVIEW_PROVIDER_REF_MODELS[ref]!), writerModel].sort());
    const probeRows = await database.pool.query<{ provider_ref: string; state: string; failure_code: string | null }>(
      `SELECT provider_ref, state, failure_code FROM core.provider_probe WHERE probed_at >= $1 ORDER BY provider_ref`, [startedAt]);
    expect(probeRows.rows).toEqual([...PANEL_REFS].sort().map((provider_ref) => ({ provider_ref, state: "HEALTHY", failure_code: null })));

    // A served answer, written by the pin's writer and checked by the pin's checker, with no revised-panel mark.
    const answer = await new ServeRepository(database.pool).readAnswerProjection(result.answerId, debate.askerId);
    expect(answer).not.toBeNull();
    expect(JSON.stringify(answer?.condition_mark_records ?? [])).not.toContain("CLAIM_PANEL_REVISED");
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.outcome !== "OK")).toEqual([]);
    expect(new Set(calls.map((call) => call.actor_ref))).toEqual(new Set(PANEL_REFS));
    const actorOf = (key: string) => calls.filter((call) => call.call_site_key === key).map((call) => call.actor_ref);
    expect(actorOf("COMPOSER:SYNTHESIZER:INITIAL:1")).toEqual([debate.rotated.answerWriter.providerRef]);
    expect(actorOf("POST_COMPOSE_R9:EVALUATOR:1")).toEqual([debate.rotated.answerChecker.providerRef]);
    // All four debated: one root position each, the pin's opener first (opener rotation); and depth 2 was really
    // argued, with second-round legs under every root.
    const roots = ["JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:root:3"].map((key) => actorOf(key));
    expect(roots[0]).toEqual([debate.rotated.opener.providerRef]);
    expect(new Set(roots.flat())).toEqual(new Set(PANEL_REFS));
    for (const root of [0, 1, 2, 3]) {
      expect(calls.some((call) => new RegExp(`^JUDGE:(?:defender|critic):root${String(root)}:r2:`, "u").test(call.call_site_key))).toBe(true);
    }

    // The verdict story, READY, told and checked by the pin's pair.
    const stored = await new StoryRepository(database.pool).readForAnswer({
      answerId: result.answerId, answerVersion: null, ownership: { legacyAskerId: debate.askerId }
    });
    expect(stored).toMatchObject({ outcome: "READY", failureCode: null });
    expect(calls.filter((call) => call.call_site_key.startsWith("STORY:")).map((call) => [call.call_site_key, call.actor_ref])).toEqual([
      ["STORY:STORYTELLER:1", debate.rotated.storyteller.providerRef],
      ["STORY:CHECKER:1", debate.rotated.storyChecker.providerRef]
    ]);
    expect(gates.requests.filter((request) => request.kind === "STORYTELLER").map((request) => request.model))
      .toEqual([debate.rotated.storyteller.modelId]);
    expect(gates.requests.filter((request) => request.kind === "STORY_CHECKER").map((request) => request.model))
      .toEqual([debate.rotated.storyChecker.modelId]);

    // JSON mode (header comment): no request for a row without jsonObject ever carried response_format, and without
    // GLM no row in this run has it (MiMo's requests went out with its sampling and without JSON mode).
    expect(gates.requests.filter((request) => Object.hasOwn(request.body, "response_format"))).toEqual([]);
    expect(gates.requests.some((request) => request.model === MIMO && request.kind !== "PROBE")).toBe(true);
  });

  it("control: the claim probe before the fix (one probe, no resend) loses the pinned writer and J24 refuses the run", async () => {
    // Without this, a scenario whose writer never met the refusal would pass the test above for the wrong reason.
    const debate = await admittedRun("control");
    const gates = await startGates({ [debate.rotated.answerWriter.modelId]: ["UNBILLED", "OK"] });
    const composed = await previewRunner(gates, "single");
    await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({
      code: "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM",
      message: expect.stringContaining(`pinned SYNTHESIZER role ref ${debate.rotated.answerWriter.providerRef} was absent at claim (PROVIDER_PROBE_UNBILLED_REFUSAL)`)
    });
    expect(composed.probeSleeps).toEqual([]);
    expect(gates.requests.filter((request) => request.kind !== "PROBE")).toEqual([]);
    expect(gates.requests.filter((request) => request.model === GLM)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ run resilience (spec 2026-10-12, T1 and T2) */

const HAIKU_REF = "preview:claude-haiku-5-5";
const WRITER_KEY = "COMPOSER:SYNTHESIZER:INITIAL:1";
const CHECKER_KEY = "POST_COMPOSE_R9:EVALUATOR:1";
/** GLM's root: last in the incident pin's position order (INCIDENT_PIN), so root index 4. */
const GLM_ROOT_KEY = "JUDGE:root:4";
/** GLM's entry in the run-time panel disclosure (spec (d) "Disclosure"), inside the RUN_PANEL_REVISED list. */
const GLM_SAT_OUT = /RUN_PANEL_REVISED:(?:[^,;\s]+,)*preview:fixture-a=PROVIDER_BUSY(?:[,;\s]|$)/u;

describe("a preview debate survives a busy model and a halted gate (spec 2026-10-12 run resilience, T1 and T2)", () => {
  it("T1, the incident replay: GLM and Qwen busy, the DeepInfra gate halts at its 4th unbilled release, and the answer is still served", async () => {
    // N = 4, from the run's call order (apps/runner/src/index.ts). Root 0 is the opener DeepSeek's (`JUDGE`,
    // :5961-5990). Then root 0's panel (`PANEL:root`, :6019-6031): the judge seats in the pin's position order without
    // the author (runNodePanel, :5455-5521; the cap of panel size - 1 = 4 calls every other seat), asked one at a
    // time (runJudgePanel, packages/judgement/src/s04.ts:442): MiMo, Qwen, Haiku, GLM. Qwen's assessment is refused,
    // resent after the 60-second wait and refused again (unbilled releases 1 and 2); GLM's the same (3 and 4). So the
    // gate halts on GLM's resend inside root 0's panel: just when each busy model has had its one call ending in
    // unbilled refusals (R-a), and before any later call could ask either again. The incident's halt came at the 20th
    // release only because the run kept asking both. The next DeepInfra call (MiMo's root 1, `JUDGE:root:secondary`,
    // :6355-6370) is the first one the gate answers STOPPED; on 8b3201d75 that is a MONEY phase stop, and serve then
    // walks GLM, MiMo, Qwen (three STOPPED hops, three FAILED rows at the writer's key) and is refused
    // CALL_BUDGET_EXHAUSTED before it reaches Haiku (spec "Incident" step 3): the control below.
    const debate = await admittedRun("incident", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM, QWEN], deepInfraHaltAt: 4 });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    // The scenario really replayed the incident: the DeepInfra gate reached its ceiling and halted.
    expect(gates.halt.unbilledReleases).toBe(4);
    expect(gates.halt.haltedAt).not.toBeNull();

    // A SERVED answer (serve_state COMPOSED or RECOMPOSED_ONCE, never the components-only floor) and a READY story.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });

    // The work item never failed (no CALL_BUDGET_EXHAUSTED), and no reason anywhere is money.
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(records.filter((record) => record.mark === "ENVELOPE_EXHAUSTED")).toEqual([]);
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    expect(await disclosureOf(result.answerId)).toEqual({
      fallback_reason: null, writer_fallback_reason: "ROLE_UNAVAILABLE", checker_fallback_reason: "ROLE_UNAVAILABLE"
    });

    // GLM's root dropped, and disclosed in the existing CRITIQUE-UNAVAILABLE record (spec (d) "Disclosure", R-b).
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY && call.outcome === "OK")).toEqual([]);
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);
    // Review 2026-10-12, test gap (a): the disclosure pinned to the byte, derived from what the run did. A model whose
    // calls the vendor refused unbilled (two UNBILLED answers: the call and its resend) is PROVIDER_BUSY — Qwen and
    // GLM, in root 0's panel; every other DeepInfra member of the panel sat out when MiMo's root 1 met the halted gate
    // (STOPPED, /remaining "halted"): PROVIDER_GATE_UNAVAILABLE. Haiku, behind the other gate, never sat out. The list
    // follows the run's configured makers, the panel's order (GLM by its writer ref first).
    const vendorBusyModels = new Set(gates.requests.filter((request) => request.kind !== "PROBE" && request.answer === "UNBILLED")
      .map((request) => request.model));
    expect([...vendorBusyModels].sort()).toEqual([GLM, QWEN].sort());
    const derived = `RUN_PANEL_REVISED:${FIVE_MAKER_REFS.filter((ref) => ref !== HAIKU_REF)
      .map((ref) => `${ref}=${vendorBusyModels.has(PREVIEW_PROVIDER_REF_MODELS[ref]!) ? "PROVIDER_BUSY" : "PROVIDER_GATE_UNAVAILABLE"}`).join(",")}`;
    const T1_RUN_PANEL_REVISED = "RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY,preview:deepseek-v4-1-flash=PROVIDER_GATE_UNAVAILABLE,"
      + "preview:mimo-v2-6-pro=PROVIDER_GATE_UNAVAILABLE,preview:qwen-3-8-flash=PROVIDER_BUSY";
    expect(derived).toBe(T1_RUN_PANEL_REVISED);
    // Nobody was absent at claim, so the CRITIQUE-UNAVAILABLE reason is the run-time revision alone.
    expect(revised!.reason).toBe(T1_RUN_PANEL_REVISED);

    // Test gap (b): fewer than 2 members were left to argue (after the halt only Haiku could still be asked), so the
    // arguing ended as a non-money stop: one authored root (the opener DeepSeek's), served on the members-sat-out
    // footing with a SINGLE-LINEAGE record naming the members that sat out; the owner's row has no spend stop and
    // counts the points left without a review (a number; null on a run that reviewed what it could).
    expect(calls.filter((call) => /^JUDGE(?::root:(?:secondary|\d+))?$/u.test(call.call_site_key) && call.outcome === "OK")
      .map((call) => [call.call_site_key, call.actor_ref])).toEqual([["JUDGE", "preview:deepseek-v4-1-flash"]]);
    expect(answer!.condition_marks).toContain("SINGLE-LINEAGE");
    expect(records.filter((record) => record.mark === "SINGLE-LINEAGE")).toEqual([expect.objectContaining({
      mark: "SINGLE-LINEAGE", scope: "answer", reason: T1_RUN_PANEL_REVISED, lift_path: "RESTORE_PINNED_PROVIDER_AND_RUN_AGAIN"
    })]);
    const body = await bodyFactsOf(result.answerId);
    // The one point the arguing left without a review is that root itself: no reviewer of another maker was left.
    expect(body).toEqual({ body_stop: null, points_without_review: 1 });

    // Zero DeepInfra requests after the halt: none arrives after the one the gate first answered STOPPED; and that
    // STOPPED was read back as a halted gate through its /remaining.
    expect(gates.halt.firstStoppedAt).not.toBeNull();
    expect(gates.requests.slice(gates.halt.firstStoppedAt! + 1).filter((request) => request.provider === "deepinfra")
      .map((request) => `${request.model} ${request.kind} ${request.answer}`)).toEqual([]);
    expect(gates.remainingReads).toContainEqual({ provider: "deepinfra", state: "halted" });

    // The answer writer and checker moved to Haiku, the one maker behind a gate that still serves.
    const okActors = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK").map((call) => call.actor_ref);
    expect(okActors(WRITER_KEY)).toEqual([HAIKU_REF]);
    expect(okActors(CHECKER_KEY)).toEqual([HAIKU_REF]);

    // No 10-minute holds (R-a: unbilled-only failures get no cooldown).
    expect(composed.holdWaits).toEqual([]);
  });

  it("T2: GLM refuses every call after claim with no halt; one call (POST + its one resend), then GLM sits out and the run is served", async () => {
    // GLM's first call is its seat on root 0's panel (see T1's call order): refused, resent after the 60-second wait,
    // refused again. From then on GLM sits out (spec (d), R-a): no later panel seat, no root of its own (root 4 is
    // dropped), no writer or storyteller call. Only GLM is scripted to refuse, so the one 60-second wait is GLM's.
    const debate = await admittedRun("busy-glm", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    // Exactly one GLM call after claim: two POSTs, both refused unbilled; then none. The gate never halted.
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")
      .map((request) => [request.kind, request.answer])).toEqual([["PANEL", "UNBILLED"], ["PANEL", "UNBILLED"]]);
    expect(gates.halt.haltedAt).toBeNull();
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);

    // Served, with a READY story; the work item never failed, so never MAKER_POSITION_UNAVAILABLE.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("MAKER_POSITION_UNAVAILABLE");

    // GLM's root dropped, disclosed as a run-time panel revision.
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY && call.outcome === "OK")).toEqual([]);
    expect(calls.filter((call) => call.outcome === "OK" && PREVIEW_PROVIDER_REF_MODELS[call.actor_ref] === GLM)).toEqual([]);
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);

    // The writer role moved off GLM for an unavailable role, not for money.
    const writers = calls.filter((call) => call.call_site_key === WRITER_KEY && call.outcome === "OK").map((call) => call.actor_ref);
    expect(writers).toHaveLength(1);
    expect(PREVIEW_PROVIDER_REF_MODELS[writers[0]!]).not.toBe(GLM);
    expect(await disclosureOf(result.answerId)).toMatchObject({ fallback_reason: null, writer_fallback_reason: "ROLE_UNAVAILABLE" });
  });

  it("side-by-side §9: GLM's row is gone from the gate (MODEL_NOT_ALLOWED); GLM sits out after one POST and the run is served", async () => {
    // Side-by-side spec §9 (D6): during an upload the gate's GO may no longer serve a model an older release's debate
    // still asks for. The gate refuses it MODEL_NOT_ALLOWED before reserving or sending anything, and the app reads that
    // as the model sitting out (PreviewModelNotServed), never as the run's money ceiling. As in T2, GLM's first call
    // after claim is its seat on root 0's panel: its one POST is refused and GLM sits out at once (R5, final review: no
    // 60-second resend, the GO will not serve it again within the minute).
    const debate = await admittedRun("not-served-glm", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [] }, (request) =>
      request.model === GLM && request.kind !== "PROBE" ? { gateRefuses: "MODEL_NOT_ALLOWED" } : null);
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    // Exactly one GLM call after claim (one POST, refused by the gate, no resend), then none; the gate never halted.
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")
      .map((request) => [request.kind, request.answer])).toEqual([["PANEL", "GATE_REFUSED"]]);
    expect(gates.halt.haltedAt).toBeNull();
    expect(composed.callSleeps).toEqual([]);
    expect(composed.holdWaits).toEqual([]);

    // Served; GLM's sit-out disclosed as a run-time panel revision for a busy model.
    const { answer, workItem } = await servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);

    // Never money: no record, no body stop and no ledger row names the run's money ceiling.
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(await bodyFactsOf(result.answerId)).toMatchObject({ body_stop: null });
    const moneyRows = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry entry
        WHERE entry.run_id=$1 AND row_to_json(entry)::text LIKE '%RUN_COST_ENVELOPE_MONEY_REACHED%'`, [debate.runId]);
    expect(moneyRows.rows[0]!.count).toBe("0");
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => PREVIEW_PROVIDER_REF_MODELS[call.actor_ref] === GLM).map((call) => call.outcome))
      .toEqual(["REFUSED"]);
  });

  it("gate v4: GLM busy, the gate cools GLM off after its two unbilled refusals; GLM sits out after ONE call and the run is served", async () => {
    // Gate v4 (preview_budget_authority.py note_unbilled_refusal): after two vendor-unbilled refusals in a row for one
    // model, the gate lets that model cool off and refuses its calls MODEL_COOLING without contacting the vendor; the
    // gate itself never halts on them any more. GLM's one call (its seat on root 0's panel, T2) is the two refusals
    // that start the cool-off: the POST and its one 60-second resend. Then the runner sits GLM out, so no GLM request
    // reaches the vendor again, and any that reached the gate would be answered MODEL_COOLING.
    const debate = await admittedRun("cooling-glm", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM], coolOffAfter: 2 });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    // Two GLM requests reached the vendor after claim (the call and its resend), both refused unbilled; the gate then
    // cooled GLM off, and nothing for GLM reached the vendor after them. Any later GLM request was answered COOLING.
    const glm = gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE");
    expect(glm.slice(0, 2).map((request) => [request.kind, request.answer])).toEqual([["PANEL", "UNBILLED"], ["PANEL", "UNBILLED"]]);
    expect(glm.slice(2).filter((request) => GATE_ANSWERS_REACHING_VENDOR.has(request.answer))).toEqual([]);
    expect(glm.slice(2).every((request) => request.answer === "COOLING")).toBe(true);
    expect(gates.cooling.get(GLM)).toBe(2);
    expect([...gates.cooling.keys()]).toEqual([GLM]);
    expect(gates.halt.haltedAt).toBeNull();
    // One 60-second wait (GLM's resend), no 10-minute holds.
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);
    // Other models were never cooled off and never refused.
    expect(gates.requests.filter((request) => request.model !== GLM).map((request) => request.answer)
      .filter((answer) => answer !== "OK")).toEqual([]);

    // Served, with a READY story; never a money reason, never CALL_BUDGET_EXHAUSTED.
    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised, `condition mark records: ${recordsText}`).toBeDefined();
    expect(revised!.reason, `condition mark records: ${recordsText}`).toMatch(GLM_SAT_OUT);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.outcome === "OK" && PREVIEW_PROVIDER_REF_MODELS[call.actor_ref] === GLM)).toEqual([]);

    // The gate's cool-off is live: one more GLM call now is refused MODEL_COOLING before the vendor is asked, and the
    // app reads it as the busy model it is (PreviewModelCooling), not as money.
    const before = gates.requests.length;
    const refusal: unknown = await gates.deepinfraPort.execute({
      operationId: randomUUID(), requestBody: JSON.stringify({ model: GLM }), requestSha256: "0".repeat(64), reservedUsd: "0.010000000"
    }).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PreviewModelCooling);
    expect((refusal as PreviewModelCooling).retryAfterSeconds).toBe(STUB_COOL_OFF_RETRY_AFTER_SECONDS);
    expect(gates.requests.slice(before).map((request) => [request.model, request.answer])).toEqual([[GLM, "COOLING"]]);
  });

  it("gate v4: the halted DeepInfra gate says AUTHORITY_HALTED; the T1 replay is served the same, without asking /remaining", async () => {
    // T1's scenario with gate v4's own word for a halted gate: every DeepInfra /complete after the halt is refused
    // AUTHORITY_HALTED, which the app reads as an unavailable gate at once (no /remaining read, no resend).
    const debate = await admittedRun("incident-halted", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({}, { unbilled: [GLM, QWEN], deepInfraHaltAt: 4, deepInfraHaltedAnswer: "AUTHORITY_HALTED" });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    expect(gates.halt.unbilledReleases).toBe(4);
    expect(gates.halt.firstStoppedAt).not.toBeNull();
    expect(gates.requests[gates.halt.firstStoppedAt!]!.answer).toBe("HALTED");
    expect(gates.requests.filter((request) => request.answer === "STOPPED")).toEqual([]);
    // Zero DeepInfra requests after the first AUTHORITY_HALTED, and no /remaining read was needed to tell.
    expect(gates.requests.slice(gates.halt.firstStoppedAt! + 1).filter((request) => request.provider === "deepinfra")
      .map((request) => `${request.model} ${request.kind} ${request.answer}`)).toEqual([]);
    expect(gates.remainingReads.filter((read) => read.provider === "deepinfra")).toEqual([]);

    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(recordsText).not.toContain("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(recordsText).not.toContain("CALL_BUDGET_EXHAUSTED");
    expect(answer!.condition_marks).not.toContain("ENVELOPE_EXHAUSTED");
    // The same disclosure as T1, to the byte: GLM and Qwen busy, the other DeepInfra members behind an unavailable gate.
    const revised = records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE" && record.reason.includes("RUN_PANEL_REVISED:"));
    expect(revised?.reason, `condition mark records: ${recordsText}`).toBe("RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY,"
      + "preview:deepseek-v4-1-flash=PROVIDER_GATE_UNAVAILABLE,preview:mimo-v2-6-pro=PROVIDER_GATE_UNAVAILABLE,preview:qwen-3-8-flash=PROVIDER_BUSY");
    const calls = await modelCalls(debate.runId);
    const okActors = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK").map((call) => call.actor_ref);
    expect(okActors(WRITER_KEY)).toEqual([HAIKU_REF]);
    expect(okActors(CHECKER_KEY)).toEqual([HAIKU_REF]);
    expect(composed.holdWaits).toEqual([]);
  });

  /**
   * Spec (d): "Serve must accept a gap in the middle of the root set. Prove it." The incident's GLM is the LAST root, so
   * T2 drops root 4; here GLM sits in the middle of the position order and its root 2 is the gap. Everything around it
   * is argued in full: the other four roots, their second-round legs, the cross-root exchanges among them, and the
   * answer is served from the four.
   */
  it("a gap in the middle of the root set: GLM busy as root 2, the other four roots argued and the answer served", async () => {
    const pin: RotatedRoles = Object.freeze({ ...INCIDENT_PIN, eligibleModelIds: Object.freeze([DEEPSEEK, MIMO, GLM, QWEN, HAIKU]) });
    const debate = await admittedRun("gap", { panelRefs: FIVE_MAKER_REFS, pin });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    const { answer, story, workItem } = await servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(story).toMatchObject({ outcome: "READY", failureCode: null });
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.holdWaits).toEqual([]);
    const calls = await modelCalls(debate.runId);
    const ok = (key: string) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK");
    // Roots 0, 1, 3 and 4 written; root 2 (GLM's) never asked.
    for (const key of ["JUDGE", "JUDGE:root:secondary", "JUDGE:root:3", "JUDGE:root:4"]) expect(ok(key), key).toHaveLength(1);
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:2")).toEqual([]);
    // Nothing planned beneath the gap. The legs GLM's seat would author elsewhere (seat (root + round) % 5 = 2: root
    // 0's round 2, root 1's round 1 and so its round 2) take the existing EXPANSION_HALTED path (spec (d)) without a
    // call; every other leg is argued, depth 2 included.
    const argued = (root: number, round: number) => calls.some((call) => call.outcome === "OK"
      && new RegExp(`^JUDGE:(?:defender|critic):root${String(root)}:r${String(round)}:`, "u").test(call.call_site_key));
    for (const [root, round] of [[0, 1], [3, 1], [3, 2], [4, 1], [4, 2]] as const) {
      expect(argued(root, round), `root ${String(root)} round ${String(round)}`).toBe(true);
    }
    expect(calls.filter((call) => /^JUDGE:(?:defender|critic):root2:/u.test(call.call_site_key))).toEqual([]);
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")).toHaveLength(2);
    expect(answer!.condition_marks).toContain("UNAUTHORED-BRANCH-HALTED");
    // The cross-root exchanges among the four, none to or from the gap.
    expect(calls.filter((call) => /^JUDGE:cross-root:(?:2->|\d+->2$)/u.test(call.call_site_key))).toEqual([]);
    expect(ok("JUDGE:cross-root:0->1")).toHaveLength(1);
    expect(ok("JUDGE:cross-root:4->3")).toHaveLength(1);
    const records = answer!.condition_mark_records;
    const recordsText = JSON.stringify(records.map((record) => [record.mark, record.reason]));
    expect(records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE")?.reason, recordsText).toMatch(GLM_SAT_OUT);
    // Four positions authored, so the answer names the unserved ones (no single-lineage step-down).
    expect(answer!.condition_marks).toContain("UNSERVED-MAKER-POSITION");
    expect(answer!.condition_marks).not.toContain("SINGLE-LINEAGE");
  });

  it("a busy opener: GLM opens and is refused; the next member opens root 0 at once, and GLM's seat becomes the dropped root", async () => {
    const pin: RotatedRoles = Object.freeze({
      ...INCIDENT_PIN, opener: rotationPick(SEALED_WRITER_REF), eligibleModelIds: Object.freeze([GLM, DEEPSEEK, MIMO, QWEN, HAIKU])
    });
    const debate = await admittedRun("opener", { panelRefs: FIVE_MAKER_REFS, pin });
    const gates = await startGates({}, { unbilled: [GLM] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);

    // GLM's one call is root 0 itself (POST + its one resend); no ten-minute hold before DeepSeek opens.
    expect(gates.requests.filter((request) => request.model === GLM && request.kind !== "PROBE")
      .map((request) => [request.kind, request.answer])).toEqual([["JUDGE", "UNBILLED"], ["JUDGE", "UNBILLED"]]);
    expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
    expect(composed.holdWaits).toEqual([]);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === "JUDGE").map((call) => [call.actor_ref, call.outcome])).toEqual([
      [SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "REFUSED"], ["preview:deepseek-v4-1-flash", "OK"]
    ]);
    // The seats traded roots: root 1 (where GLM's seat went) is the gap; MiMo, Qwen and Haiku keep roots 2-4.
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:secondary")).toEqual([]);
    for (const key of ["JUDGE:root:2", "JUDGE:root:3", "JUDGE:root:4"]) {
      expect(calls.filter((call) => call.call_site_key === key && call.outcome === "OK"), key).toHaveLength(1);
    }
    const { answer, workItem } = await servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(answer!.condition_mark_records.find((record) => record.mark === "CRITIQUE-UNAVAILABLE")?.reason).toMatch(GLM_SAT_OUT);
  });
  /**
   * Review amendment R-d (orchestrator, 2026-10-12): only a VENDOR's gate-proven unbilled refusal makes a model sit
   * out. The gate's own unbilled refusals — its slots were full (CONCURRENCY_LIMIT_REACHED), or it never reached the
   * vendor (PROVIDER_NOT_REACHED) — are still REFUSED rows, never counted, with the one 60-second resend; but the
   * model is not busy, so it never sits out and the runner keeps today's ten-minute hold and final retry.
   */
  it.each(["CONCURRENCY_LIMIT_REACHED", "PROVIDER_NOT_REACHED"] as const)(
    "R-d: GLM's own root refused twice by the gate itself (%s): no sit-out, the hold happens, the final retry is sent and authors it",
    async (code) => {
      const debate = await admittedRun(`gate-own-${code}`, { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
      // GLM's first JUDGE request is its own root (root 4; its earlier asks are panel seats, PANEL): the call and its
      // one resend are refused by the gate itself; everything after is answered.
      let refused = 0;
      const gates = await startGates({}, { unbilled: [] }, (request) => {
        if (request.model !== GLM || request.kind !== "JUDGE" || refused >= 2) return null;
        refused += 1;
        return { gateRefuses: code };
      });
      const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
      const result = await completedRun(composed, debate, gates);

      expect(gates.requests.filter((request) => request.model === GLM && request.kind === "JUDGE").slice(0, 3)
        .map((request) => request.answer)).toEqual(["GATE_REFUSED", "GATE_REFUSED", "OK"]);
      // The one 60-second resend inside the call, then the runner's ten-minute hold, then its final retry.
      expect(composed.callSleeps).toEqual([UNBILLED_RESEND_MS]);
      expect(composed.holdWaits).toEqual([DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms]);
      const calls = await modelCalls(debate.runId);
      expect(calls.filter((call) => call.call_site_key === GLM_ROOT_KEY).map((call) => [call.actor_ref, call.outcome]))
        .toEqual([[SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "REFUSED"], [SEALED_WRITER_REF, "OK"]]);
      // GLM never sat out: it keeps writing (the pinned writer) and nothing discloses a run-time panel revision.
      expect(calls.filter((call) => call.call_site_key === WRITER_KEY && call.outcome === "OK").map((call) => call.actor_ref))
        .toEqual([SEALED_WRITER_REF]);
      const { answer, workItem } = await servedAnswer(debate, result.answerId);
      expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
      expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
      expect(JSON.stringify(answer!.condition_mark_records)).not.toContain("RUN_PANEL_REVISED");
      expect(gates.halt.unbilledReleases).toBe(0);
    }
  );

  /**
   * Review 2026-10-12, test gap (e): the merged CRITIQUE-UNAVAILABLE record (R-b). With nobody sitting out, its reason
   * is today's to the byte — the claim-time revision alone; with a member that sat out too, the two join with "|".
   * MiMo is absent at claim (its probe and the probe's one resend refused unbilled), so the panel shrinks to four.
   */
  it("nobody sat out: the CRITIQUE-UNAVAILABLE reason is the claim-time revision alone, byte for byte", async () => {
    const debate = await admittedRun("claim-only", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({ [MIMO]: ["UNBILLED", "UNBILLED"] }, { unbilled: [] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);
    const { answer } = await servedAnswer(debate, result.answerId);
    const critique = answer!.condition_mark_records.filter((record) => record.mark === "CRITIQUE-UNAVAILABLE");
    expect(critique.map((record) => record.reason)).toEqual(["CLAIM_PANEL_REVISED:preview:mimo-v2-6-pro=PROVIDER_PROBE_UNBILLED_REFUSAL"]);
    expect(composed.holdWaits).toEqual([]);
  });

  it("a claim-time revision and a member that sat out: one record, CLAIM_PANEL_REVISED|RUN_PANEL_REVISED", async () => {
    const debate = await admittedRun("claim-and-run", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const gates = await startGates({ [MIMO]: ["UNBILLED", "UNBILLED"] }, { unbilled: [GLM] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);
    const { answer } = await servedAnswer(debate, result.answerId);
    const critique = answer!.condition_mark_records.filter((record) => record.mark === "CRITIQUE-UNAVAILABLE");
    expect(critique.map((record) => record.reason)).toEqual([
      "CLAIM_PANEL_REVISED:preview:mimo-v2-6-pro=PROVIDER_PROBE_UNBILLED_REFUSAL|RUN_PANEL_REVISED:preview:fixture-a=PROVIDER_BUSY"
    ]);
    expect(answer!.condition_marks.filter((mark) => mark === "CRITIQUE-UNAVAILABLE")).toHaveLength(1);
  });

  /**
   * Review 2026-10-12, test gap (c): the runner's re-claim check reads each maker's own attempts on the preview
   * (fix (b), `byActor`). Before the run is claimed, root 2's site (Qwen's, key JUDGE:root:2) already holds the judge
   * contract's whole allowance — the sealed bound plus the final retry — in FAILED rows, but written by two OTHER
   * makers, two each, as fallback hops would leave them. Read per site (hosted and local) that site is spent at claim;
   * read per maker nobody is, so Qwen is asked and authors root 2.
   */
  it("fix (b): the re-claim check counts per maker, so other makers' FAILED rows at a root's site never spend it", async () => {
    const debate = await admittedRun("reclaim-per-maker", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN });
    const allowance = POLICY.bounds.JUDGE.maxAttempts + DEVELOPMENT_RUN_DEATH_POLICY.final_retry_attempts;
    const others = ["preview:mimo-v2-6-pro", HAIKU_REF];
    const ledger = new LedgerRepository(database.pool);
    for (let index = 0; index < allowance; index += 1) {
      await ledger.append({
        runId: debate.runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE:root:2",
        subjectItemId: debate.workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED", actorRef: others[index % 2]!,
        inputHash: "input:preview-reclaim-per-maker", contractHash: fixtureSettings().judgeContractHash, rawArtifactRef: null,
        startedAt: new Date(), finishedAt: new Date()
      });
    }
    // The site holds the whole allowance across makers, and less than it for any one maker.
    expect(await ledger.findExhaustedModelAttempt({
      runId: debate.runId, workItemId: debate.workItemId, contractHash: fixtureSettings().judgeContractHash, maxAttempts: allowance
    })).toMatchObject({ callSiteKey: "JUDGE:root:2", outcome: "FAILED" });
    const gates = await startGates({}, { unbilled: [] });
    const composed = await previewRunner(gates, "resend", { resilience: RUN_RESILIENCE });
    const result = await completedRun(composed, debate, gates);
    const calls = await modelCalls(debate.runId);
    expect(calls.filter((call) => call.call_site_key === "JUDGE:root:2" && call.outcome === "OK").map((call) => call.actor_ref))
      .toEqual(["preview:qwen-3-8-flash"]);
    const { workItem } = await servedAnswer(debate, result.answerId);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.holdWaits).toEqual([]);
  });
});
