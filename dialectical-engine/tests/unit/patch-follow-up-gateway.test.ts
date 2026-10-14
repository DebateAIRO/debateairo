import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Judge, classifyStructuredArtifact, judgeArtifactSchema } from "@debateai/judgement";
import {
  OpenAICompatibleProviderGateway,
  PreviewVendorRefusedUnbilled,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewTargetGatewayControls,
  previewTargetJsonRow,
  providerTargetGatewayControls,
  readPromptFrame,
  schemaFailureLocator,
  withPreviewProviderCallPolicy,
  type PreviewBudgetExecution,
  type ProviderCallRequest,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { classifyCheckerContent } from "@debateai/story";

/**
 * PATCH FOLLOW-UP through the gateway (owner design, 2026-10-12), on the preview's own wire: the guarded fetch and its
 * gate ports, so every body below is one the DeepInfra or the Anthropic gate accepts. A refused reply that decoded to
 * an object gets the short follow-up first (the first call's messages byte for byte, the model's own answer as its
 * turn, only the failing paths); a patch that does not do gets the step's full re-ask if the call still has a POST; on
 * the preview a call whose SECOND POST was a patch may send a third, within the sealed bound.
 */
const fixture = (folder: string, name: string): string =>
  readFileSync(new URL(`../support/fixtures/${folder}/${name}`, import.meta.url), "utf8");
const POSITION_SLIP = fixture("judge-format-replies", "mimo-judge-position-ro-no-value-laden.txt");
const CHECKER_SLIP = fixture("story-format-replies", "deepseek-checker-ro-no-criteria.txt");
const CRITERIA = { faithful_to_material: true, agrees_with_label: false, fair_to_losing_paths: true, no_overstatement: false,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true };

const GLM = "zai-org/GLM-5.3-Flash";
const HAIKU = "claude-haiku-5-5";
const HAIKU_REF = "preview:claude-haiku-5-5";
const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-patch-follow-up-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, HAIKU]
}))!;
const COOLDOWN_MS = 60_000;

type Step = { content: string } | { refuse: true };
function deepInfraHarness(script: Step[]) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const slept: number[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    const next = script.shift();
    if (next === undefined) return { status: 599, body: JSON.stringify({ error: "script_exhausted" }) };
    if ("refuse" in next) throw new PreviewVendorRefusedUnbilled();
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: GLM,
      choices: [{ message: { content: next.content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 8 } } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model: GLM, maker: "Z.AI",
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    // GLM's reviewed row allows JSON mode (providerTargetGatewayControls gives the runner's gateway this capability);
    // only its story calls ask for it.
    supportsJsonObjectResponse: true,
    ...previewTargetGatewayControls(CONFIG, { model: GLM })
  });
  const gateway = withPreviewProviderCallPolicy(native, CONFIG, { model: GLM }, { sleep: async (ms) => { slept.push(ms); } });
  return { native, gateway, executions, artifacts, ledger, slept };
}

const bodyOf = (execution: PreviewBudgetExecution) => JSON.parse(execution.requestBody) as { messages: { role: string; content: string }[] };

function judgeInput(maxAttempts = 3) {
  return { runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE",
    questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?", argumentLanguageName: "Romanian",
    providerRef: "preview:fixture-a", contractHash: "contract:synthetic", leg: { kind: "primary-root" as const },
    bound: { maxAttempts, tokenCeiling: 8192, deadlineMs: 600_000 } };
}
/** The first reply without its fence, with value_laden set: what a full re-ask that worked returns. */
function fixedPosition(valueLaden: boolean): string {
  const body = JSON.parse(POSITION_SLIP.replace(/^```json\n/u, "").replace(/\n```$/u, "")) as Record<string, unknown>;
  return JSON.stringify({ ...body, value_laden: valueLaden });
}

describe("the short follow-up on the preview's DeepInfra wire", () => {
  it("the real MiMo position without value_laden: one patch POST, {\"value_laden\": false} merged and accepted", async () => {
    const { gateway, executions, artifacts, ledger, slept } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    const judged = await new Judge(gateway).judge(judgeInput());
    expect(judged.valueLaden).toBe(false);
    expect(judged.statement).toContain("gratuitatea pe liniile centrale de autobuz nu este");
    expect(executions).toHaveLength(2);
    expect(slept).toEqual([]);
    // The follow-up is the first call's messages byte for byte, then the model's own answer, then the machine block.
    const [first, second] = [bodyOf(executions[0]!), bodyOf(executions[1]!)];
    expect(second.messages.slice(0, 2)).toEqual(first.messages);
    expect(JSON.stringify(second.messages).startsWith(JSON.stringify(first.messages).slice(0, -1))).toBe(true);
    expect(second.messages[2]).toEqual({ role: "assistant", content: POSITION_SLIP });
    expect(second.messages).toHaveLength(4);
    expect(readPromptFrame({ messages: second.messages as never }).fields.slice(-3)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_paths", content: "value_laden" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    // Each attempt keeps the vendor's own bytes; the accepted parse is the merged answer's.
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    expect(JSON.parse(artifacts[1]!.rawText).choices[0].message.content).toBe("{\"value_laden\": false}");
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "OK"]);
    expect(judged.provenanceRef).toBe(artifacts[1]!.artifactId);
  });

  it("the call hands back the merged answer, which the step's own classifier accepted", async () => {
    const request = positionRequest();
    const { gateway } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "{\"value_laden\": true}" }]);
    const result = await gateway.call(request);
    expect(result.repairForm).toBe("PATCH");
    expect(result.repairAttempts).toBe(1);
    expect(JSON.parse(result.content)).toMatchObject({ value_laden: true });
    expect(classifyStructuredArtifact(result.content, judgeArtifactSchema)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("owner ruling 2026-10-12: a whole answer sent back to the patch request is checked as a whole answer and accepted on the patch POST when it passes", async () => {
    const { gateway, executions, artifacts, ledger } = deepInfraHarness([{ content: POSITION_SLIP }, { content: fixedPosition(true) }]);
    const result = await gateway.call(positionRequest());
    expect(executions).toHaveLength(2);
    expect(result.repairForm).toBe("PATCH");
    expect(result.repairAttempts).toBe(1);
    // The reply itself is the answer: nothing is merged into the first reply.
    expect(result.content).toBe(fixedPosition(true));
    expect(artifacts.map((artifact) => [artifact.parseStatus, artifact.parseError])).toEqual([
      ["SCHEMA_FAILED", "invalid_type@value_laden"], ["PARSED", null]
    ]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "OK"]);
  });

  it("a whole answer sent back to the patch request that still fails the step's check is refused as a patch; the full re-ask is the third POST and is accepted", async () => {
    const { gateway, executions, artifacts, ledger } = deepInfraHarness([
      { content: POSITION_SLIP }, { content: POSITION_SLIP }, { content: fixedPosition(true) }
    ]);
    const result = await gateway.call(positionRequest());
    expect(executions).toHaveLength(3);
    expect(result.repairForm).toBe("FULL");
    expect(result.repairAttempts).toBe(2);
    expect(JSON.parse(result.content)).toMatchObject({ value_laden: true });
    // The full re-ask is today's repair packet for the FIRST reply: the original messages + one code-and-path block.
    const [first, third] = [bodyOf(executions[0]!), bodyOf(executions[2]!)];
    expect(third.messages.slice(0, 2)).toEqual(first.messages);
    expect(third.messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
    expect(readPromptFrame({ messages: third.messages as never }).fields.slice(-2)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_path", content: "value_laden" }
    ]);
    expect(artifacts.map((artifact) => [artifact.parseStatus, artifact.parseError])).toEqual([
      ["SCHEMA_FAILED", "invalid_type@value_laden"], ["SCHEMA_FAILED", "PATCH_KEY_NOT_REQUESTED@$"], ["PARSED", null]
    ]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "OK"]);
  });

  it("a patch whose merge fails the step's own check goes to the full re-ask too", async () => {
    const { gateway, executions, artifacts } = deepInfraHarness([
      { content: POSITION_SLIP }, { content: "{\"value_laden\": \"no\"}" }, { content: fixedPosition(false) }
    ]);
    const result = await gateway.call(positionRequest());
    expect(executions).toHaveLength(3);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "SCHEMA_FAILED", "PARSED"]);
    expect(JSON.parse(result.content)).toMatchObject({ value_laden: false });
  });

  it("first reply, patch and full re-ask all refused: the call ends after three POSTs (the runner's fallback takes it)", async () => {
    const { gateway, executions, ledger } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "{}" }, { content: POSITION_SLIP }]);
    await expect(gateway.call(positionRequest())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 3 });
    expect(executions).toHaveLength(3);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
  });

  it("a reply with no decodable object is re-asked in full at once, and keeps two POSTs", async () => {
    const { gateway, executions } = deepInfraHarness([{ content: "I think the answer is yes." }, { content: "still prose" }, { content: fixedPosition(true) }]);
    await expect(gateway.call(positionRequest())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
    expect(bodyOf(executions[1]!).messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
  });

  it("within the sealed bound: with two POSTs left for this maker, the patch is the last one", async () => {
    const { gateway, executions } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "{}" }, { content: fixedPosition(true) }]);
    await expect(gateway.call({ ...positionRequest(), bound: { maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600_000 } }))
      .rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
  });

  it("a patch that cannot be merged as the call's last POST changes nothing: the call's refusal is still the first reply's", async () => {
    // The steps read the refusal's code (the runner's writer: a citation code ends the round with no draft, never a
    // FAILED run). A patch reply that was not merged left the first reply standing, so its refusal is the call's; each
    // try's own record keeps its own code.
    const unmergeable = [
      [POSITION_SLIP, "SCHEMA_FAILED", "PATCH_KEY_NOT_REQUESTED@$"],
      ["{}", "SCHEMA_FAILED", "PATCH_EMPTY@$"],
      ["I cannot add that.", "PARSE_FAILED", "PATCH_NOT_AN_OBJECT@$"]
    ] as const;
    for (const [patchReply, patchStatus, patchError] of unmergeable) {
      const { gateway, executions, artifacts } = deepInfraHarness([{ content: POSITION_SLIP }, { content: patchReply }]);
      const refusal: unknown = await gateway.call({ ...positionRequest(), bound: { maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600_000 } })
        .then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({
        code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2,
        lastParseStatus: "SCHEMA_FAILED", lastParseError: "invalid_type@value_laden", lastRawArtifactRef: artifacts[0]!.artifactId
      });
      expect(executions).toHaveLength(2);
      expect(artifacts.map((artifact) => [artifact.parseStatus, artifact.parseError])).toEqual([
        ["SCHEMA_FAILED", "invalid_type@value_laden"], [patchStatus, patchError]
      ]);
    }
  });

  it("a patch that was merged but still fails the step's check, as the call's last POST: the call's refusal is the merged answer's", async () => {
    const { gateway, artifacts } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "{\"value_laden\": \"no\"}" }]);
    const refusal: unknown = await gateway.call({ ...positionRequest(), bound: { maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600_000 } })
      .then(() => null, (error: unknown) => error);
    expect(artifacts).toHaveLength(2);
    expect(refusal).toMatchObject({
      code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2,
      lastParseStatus: "SCHEMA_FAILED", lastParseError: artifacts[1]!.parseError, lastRawArtifactRef: artifacts[1]!.artifactId
    });
  });

  it("a judging call never asks for JSON mode, on GLM either: not the first POST, the patch or the full re-ask", async () => {
    // 2026-10-12: JSON mode on the debate steps was tried and withdrawn the same day (GLM answered a judging call with
    // "{}" in JSON mode); only the story calls ask for it.
    const { gateway, executions } = deepInfraHarness([
      { content: POSITION_SLIP }, { content: POSITION_SLIP }, { content: fixedPosition(true) }
    ]);
    await gateway.call(positionRequest());
    expect(executions).toHaveLength(3);
    for (const execution of executions) expect(Object.hasOwn(JSON.parse(execution.requestBody), "response_format")).toBe(false);
  });

  it("an unbilled refusal of the patch POST ends the call; the one 60-second resend starts again from the original packet", async () => {
    const { gateway, executions, ledger, slept } = deepInfraHarness([{ content: POSITION_SLIP }, { refuse: true }, { content: fixedPosition(true) }]);
    const result = await gateway.call(positionRequest());
    expect(slept).toEqual([COOLDOWN_MS]);
    expect(executions).toHaveLength(3);
    expect(bodyOf(executions[2]!).messages).toEqual(bodyOf(executions[0]!).messages);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "REFUSED", "OK"]);
    expect(result.repairAttempts).toBe(0);
    expect(result.repairForm).toBeUndefined();
  });
});

describe("the story checker's sealed bound of two: the patch only, then the call fails", () => {
  const checkerRequest = (): ProviderCallRequest => {
    const framed = buildFramedPrompt({ contract: { contractId: "story.checker.v3", instruction: "Check the story.", answerForm: "Return one JSON object." },
      material: [{ name: "story", content: "Synthetic story." }] });
    return { runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: "STORY:CHECKER:1", role: "EVALUATOR", lane: "story",
      preferredResponseFormat: "json_object", bound: { maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 600_000 },
      contractHash: "contract:synthetic", providerRef: "preview:fixture-a", packet: framed.packet,
      classifyContent: classifyCheckerContent,
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) };
  };

  it("the real DeepSeek verdict without criteria is fixed by the patch POST", async () => {
    const { gateway, executions } = deepInfraHarness([{ content: CHECKER_SLIP }, { content: JSON.stringify({ criteria: CRITERIA }) }]);
    const result = await gateway.call(checkerRequest());
    expect(executions).toHaveLength(2);
    expect(JSON.parse(result.content)).toMatchObject({ satisfied: false, criteria: CRITERIA });
    expect(result.repairForm).toBe("PATCH");
  });

  it("the patch POST carries the first POST's JSON mode, after the first call's messages byte for byte", async () => {
    const { gateway, executions } = deepInfraHarness([{ content: CHECKER_SLIP }, { content: JSON.stringify({ criteria: CRITERIA }) }]);
    await gateway.call(checkerRequest());
    expect(executions).toHaveLength(2);
    for (const execution of executions) {
      expect(execution.requestBody.endsWith(',"response_format":{"type":"json_object"}}')).toBe(true);
    }
    const first = executions[0]!.requestBody;
    expect(executions[1]!.requestBody.startsWith(first.slice(0, first.lastIndexOf('],"response_format"')))).toBe(true);
  });

  it("practice 2026-10-14: an objection over its cap gets a patch POST that states the cap, and a reply within it is accepted", async () => {
    // The real R15 verdict, its objection one character past checker v3's 4000.
    const tooLong = JSON.stringify({ ...JSON.parse(fixture("story-format-replies", "mimo-checker-r15-646-long-objection.txt")) as object,
      objection: "x".repeat(4001) });
    const { gateway, executions } = deepInfraHarness([{ content: tooLong }, { content: JSON.stringify({ objection: "x".repeat(3990) }) }]);
    const result = await gateway.call(checkerRequest());
    expect(executions).toHaveLength(2);
    expect(readPromptFrame({ messages: bodyOf(executions[1]!).messages as never }).fields.slice(-4)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_paths", content: "objection" },
      { name: "machine_rejection_limits", content: "objection: at most 4000 characters" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    expect(result.repairForm).toBe("PATCH");
    expect((JSON.parse(result.content) as { objection: string }).objection).toHaveLength(3990);
  });

  it("a patch that does not do ends the call after two POSTs (no third)", async () => {
    const { gateway, executions } = deepInfraHarness([{ content: CHECKER_SLIP }, { content: "{\"criteria\": true}" }, { content: CHECKER_SLIP }]);
    await expect(gateway.call(checkerRequest())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
  });
});

describe("hosted and local: the same loop, the bound is the only limit", () => {
  it("a slip, a patch that does not do, then the full re-ask, within the bound of three", async () => {
    const { native, executions } = deepInfraHarness([{ content: POSITION_SLIP }, { content: "[]" }, { content: fixedPosition(false) }]);
    const result = await native.call({ ...positionRequest(), thinkingLevel: "high" });
    expect(executions).toHaveLength(3);
    expect(result.repairForm).toBe("FULL");
  });
});

describe("the Anthropic gate accepts the follow-up shape: user, the model's own text as assistant, user", () => {
  it("Haiku at effort high: the patch body passes the gate's body check and is accepted", async () => {
    const executions: PreviewBudgetExecution[] = [];
    const replies = [POSITION_SLIP, "{\"value_laden\": true}"];
    const target = parseProviderDiscoveryTargets(JSON.stringify([previewTargetJsonRow(HAIKU_REF)]),
      [{ providerRef: HAIKU_REF, maker: previewModelRow(HAIKU)!.maker, adapterKind: previewModelRow(HAIKU)!.adapterKind }])[0]!;
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(CONFIG, target),
      fetchImplementation: createPreviewGuardedFetch({ anthropic: { execute: async (input) => {
        executions.push(input);
        return { status: 200, body: JSON.stringify({ id: `msg_${executions.length}`, type: "message", role: "assistant", model: HAIKU,
          content: [{ type: "thinking", thinking: "private", signature: "sig" }, { type: "text", text: replies[executions.length - 1] }],
          stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0 } }) };
      } } }),
      persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const gateway = withPreviewProviderCallPolicy(native, CONFIG, target);
    const result = await gateway.call({ ...positionRequest(), providerRef: HAIKU_REF });
    expect(executions).toHaveLength(2);
    const second = JSON.parse(executions[1]!.requestBody) as { system: unknown; messages: { role: string; content: string }[]; output_config: unknown };
    expect(second.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    // Only the answer's text goes back, never its thinking; the gate's rule (text turns, alternating) holds.
    expect(second.messages[1]!.content).toBe(POSITION_SLIP);
    expect(second.output_config).toEqual({ effort: "high" });
    // The cached system prefix (and its per-call tail) is resent byte for byte.
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(JSON.parse(executions[0]!.requestBody).system));
    expect(JSON.parse(result.content)).toMatchObject({ value_laden: true });
  });
});

function positionRequest(): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "judge.position.fixture.v1", instruction: "Author your position on the question under debate.", answerForm: "Return one JSON object." },
    material: [{ name: "question_line", content: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?" }]
  });
  return {
    runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:synthetic", providerRef: "preview:fixture-a",
    packet: framed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, judgeArtifactSchema, reply),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
}
