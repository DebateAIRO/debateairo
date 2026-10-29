import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyStructuredArtifact } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway, buildFramedPrompt, buildFramedRepairPrompt, createPreviewGuardedFetch,
  parsePreviewProviderTestConfig, previewTargetGatewayControls, readPromptFrame, schemaFailureLocator, withPreviewProviderCallPolicy,
  type ModelReplyFacts, type PreviewBudgetExecution, type ProviderCallRequest, type ProviderCostEnvelopeSeam,
  type ProviderGateway, type ProviderLedgerInput, type RawArtifactInput
} from "@debateai/providers";

/**
 * R22 (owner ruling 2026-10-29, "Allow 3 sends") — A JUDGE CALL ON THE TEST SITE MAY SEND THREE TIMES, SO THE OWNER'S
 * FULL RE-ASK RUNS.
 *
 * The owner's slip-recovery order is: code salvage → the short follow-up → ONE full re-ask → keep the debate alive. On
 * the test site every structured step is routed (LG-A, L33: at most 2 POSTs in all), so a judge call got the original
 * and the patch follow-up only, and the full re-ask never ran. R21's run 3714be1b is the shape: MiMo's cross-exchange
 * `JUDGE:cross-root:0->3` was refused on its original (class CONTENT) and on its patch (class CONTENT), and the call
 * ended there. Now a judge call whose second POST was the patch may send a third, the full re-ask, still inside the
 * step's sealed lifetime bound of three (the counting gateway's `remaining`), and every POST passes the money checks
 * before it is sent. Every other step keeps L33's two: the answer writer and checker, the map, the story.
 */

const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-r22-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [MIMO], premium_model_ids: [MIMO]
}))!;

type Step = { content: string };
/** The preview's own DeepInfra wire, as the LG-A gateway tests build it: every body is one the gate accepts. */
function harness(script: Step[]) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    const next = script.shift();
    if (next === undefined) return { status: 599, body: JSON.stringify({ error: "script_exhausted" }) };
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: MIMO,
      choices: [{ message: { content: next.content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: "https://api.deepinfra.com/v1/openai", model: MIMO, maker: "Xiaomi", fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    ...previewTargetGatewayControls(CONFIG, { model: MIMO })
  });
  const gateway: ProviderGateway = withPreviewProviderCallPolicy(native, CONFIG, { model: MIMO }, { sleep: async () => undefined });
  return { gateway, executions, artifacts, ledger };
}

const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
const framed = buildFramedPrompt({ contract: { contractId: "test.r22.v1", instruction: "Answer the question in one sentence.",
  answerForm: "Return only JSON {\"answer\": string, \"score\": number}." }, material: [{ name: "question", content: "Is it so?" }] });
/** A routed structured call (withStructureRepair marks it), as the test site sends every debate step. */
function routed(callSiteKey: string, role: ProviderCallRequest["role"], change: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return { runId: "run:3714be1b", subjectItemId: "node:r22", callSiteKey, role, lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:r22", providerRef: "preview:mimo-v2-6-pro",
    packet: framed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    structureRepairRouted: true, ...change };
}
const CROSS = "JUDGE:cross-root:0->3";
/** MiMo's two refused replies, both class CONTENT: a member missing, then a patch whose value is still wrong. */
const ORIGINAL_REFUSED = { content: "{\"answer\": \"It is so\"}" };
const PATCH_REFUSED = { content: "{\"score\": \"high\"}" };
const WHOLE = { content: "{\"answer\": \"It is so\", \"score\": 0.5}" };
const lastBlock = (execution: PreviewBudgetExecution) =>
  readPromptFrame({ messages: (JSON.parse(execution.requestBody) as { messages: never }).messages }).fields;

describe("R22 · a judge call whose patch did not do gets the owner's one full re-ask, as its third send", () => {
  it("recovers the R21 shape: ORIGINAL and PATCH refused, the FULL re-ask accepted", async () => {
    const { gateway, executions, artifacts, ledger } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    const result = await gateway.call(routed(CROSS, "JUDGE"));
    expect(result.repairForm).toBe("FULL");
    expect(JSON.parse(result.content)).toEqual({ answer: "It is so", score: 0.5 });
    expect(executions).toHaveLength(3);
    expect(artifacts.map((artifact) => [artifact.replyForm, artifact.replyFailureClass]))
      .toEqual([["ORIGINAL", "CONTENT"], ["PATCH", "CONTENT"], ["FULL", null]]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "OK"]);
    // The full re-ask describes the FIRST reply's refusal, as the unrouted loop's re-ask after a patch always did.
    expect(lastBlock(executions[2]!).map((field) => field.name)).toContain("machine_rejection_code");
    expect(lastBlock(executions[2]!).map((field) => field.name)).not.toContain("machine_reply_form");
  });

  it("ends as the gateway's content refusal naming the THIRD attempt when the re-ask is refused too (then R22's halt or backup)", async () => {
    const { gateway, executions, ledger } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, PATCH_REFUSED]);
    const failure = await gateway.call(routed(CROSS, "JUDGE")).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 3, lastLedgerEntryRef: ledger[2]!.attemptId });
    expect(executions).toHaveLength(3);
  });

  it.each([
    ["root 0's position", "JUDGE"],
    ["another root", "JUDGE:root:1"],
    ["a support/attack reply", "JUDGE:defender:root0:r1:p0"],
    ["a review", "JUDGE:review:node-1"],
    ["a panel judge", "PANEL:JUDGE:cross-root:0->3:preview:mimo-v2-6-pro"],
    ["a neutral comparing judge (engine 2)", "VERDICT:judge:1"]
  ] as const)("applies to every judge call: %s", async (_label, callSiteKey) => {
    const { gateway, executions } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    await expect(gateway.call(routed(callSiteKey, "JUDGE"))).resolves.toMatchObject({ repairForm: "FULL" });
    expect(executions).toHaveLength(3);
  });
});

describe("R22 · the third send never escapes a limit", () => {
  it("is only the re-ask after a PATCH: a judge call whose second send was already a full re-ask gets no third", async () => {
    let first = true;
    // A refusal no member of which can be named: no patch, the full re-ask is the second send.
    const unnameable = routed(CROSS, "JUDGE", { classifyContent: (content: string, reply?: ModelReplyFacts) => {
      if (!first) return classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} });
      first = false;
      return { parseStatus: "SCHEMA_FAILED" as const, parseError: JSON.stringify([{ path: [], message: "custom" }]) };
    } });
    const { gateway, executions, artifacts } = harness([WHOLE, PATCH_REFUSED, WHOLE]);
    await expect(gateway.call(unnameable)).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.replyForm)).toEqual(["ORIGINAL", "FULL"]);
  });

  it("stays inside the step's lifetime bound: with two attempts left on the ledger, two sends", async () => {
    // The counting gateway hands down what is left of the sealed three (`remaining`); one was spent before.
    const { gateway, executions } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    await expect(gateway.call(routed(CROSS, "JUDGE", { bound: { maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600_000 } })))
      .rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
  });

  it("asks the run's attempt ceiling and the money envelope before the third send, and sends nothing when they refuse", async () => {
    const asked: string[] = [];
    const costEnvelope: ProviderCostEnvelopeSeam = {
      assertCallAllowed: () => { asked.push("money"); },
      recordCall: () => undefined,
      assertUsageReported: () => undefined
    };
    let attemptChecks = 0;
    const assertAttemptAllowed = (): void => {
      attemptChecks += 1;
      asked.push("attempts");
      // The run's own spend stop, raised before the third send: it travels untouched (the arguing then stops, and the
      // run goes on to its answer with what it has — a started debate always finishes).
      if (attemptChecks === 3) throw new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts");
    };
    const { gateway, executions, ledger } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    await expect(gateway.call(routed(CROSS, "JUDGE", { assertAttemptAllowed, costEnvelope })))
      .rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
    expect(executions).toHaveLength(2);
    expect(ledger).toHaveLength(2);
    expect(asked).toEqual(["attempts", "money", "attempts", "money", "attempts"]);
  });

  it("reserves the third send with the money envelope like the first two when it is allowed", async () => {
    const projections: number[] = [];
    const costEnvelope: ProviderCostEnvelopeSeam = {
      assertCallAllowed: (projection) => { projections.push(projection.completionTokenCeiling); },
      recordCall: () => undefined,
      assertUsageReported: () => undefined
    };
    const { gateway, executions } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    await gateway.call(routed(CROSS, "JUDGE", { costEnvelope }));
    expect(executions).toHaveLength(3);
    expect(projections).toHaveLength(3);
  });
});

describe("R22 · every other step keeps L33's two sends", () => {
  it.each([
    ["the answer writer", "COMPOSER:SYNTHESIZER:1", "SYNTHESIZER"],
    ["the answer checker", "POST_COMPOSE_R9:EVALUATOR:1", "EVALUATOR"],
    ["a map step (a JUDGE-role call that is not a judge call)", "MAP:merge", "JUDGE"]
  ] as const)("%s: a patch that does not do ends the call after two sends", async (_label, callSiteKey, role) => {
    const { gateway, executions } = harness([ORIGINAL_REFUSED, PATCH_REFUSED, WHOLE]);
    await expect(gateway.call(routed(callSiteKey, role))).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
  });

  it("the preview's call policy marks judge calls only, and keeps every call's own allowance as it was", async () => {
    const seen: ProviderCallRequest[] = [];
    const recording: ProviderGateway = { call: async (request) => { seen.push(request); throw new Error("recorded"); } };
    const policy = withPreviewProviderCallPolicy(recording, CONFIG, { model: MIMO }, { sleep: async () => undefined });
    const forwarded = async (request: ProviderCallRequest) => {
      await policy.call(request).catch(() => undefined);
      return seen.at(-1)!;
    };
    for (const key of ["JUDGE", CROSS, "JUDGE:review:node-1", "PANEL:JUDGE:root:0:preview:x", "VERDICT:judge:2"]) {
      expect(await forwarded(routed(key, "JUDGE"))).toMatchObject({ fullReAskAfterPatch: true, maxAttemptsThisCall: 2 });
    }
    for (const [key, role] of [["COMPOSER:SYNTHESIZER:1", "SYNTHESIZER"], ["POST_COMPOSE_R9:EVALUATOR:1", "EVALUATOR"], ["MAP:merge", "JUDGE"]] as const) {
      const request = await forwarded(routed(key, role));
      expect(request.fullReAskAfterPatch).toBeUndefined();
      expect(request.maxAttemptsThisCall).toBe(2);
    }
    // The third send is the policy's alone: a caller that asks for it is refused before anything is sent.
    const before = seen.length;
    await expect(Promise.resolve().then(() => policy.call(routed("MAP:merge", "JUDGE", { fullReAskAfterPatch: true }))))
      .rejects.toMatchObject({ code: "PREVIEW_CALL_TIER_INVALID" });
    expect(seen).toHaveLength(before);
    // A judge call without a repair packet has no repair try at all: one send, unmarked.
    const { buildRepairPacket: _repair, ...withoutRepair } = routed(CROSS, "JUDGE");
    const bare = await forwarded(withoutRepair);
    expect(bare.fullReAskAfterPatch).toBeUndefined();
    expect(bare.maxAttemptsThisCall).toBe(1);
  });
});
