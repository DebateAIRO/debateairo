import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Judge,
  classifyStructuredArtifact,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nodeReviewArtifactSchema,
  parseStructuredArtifact
} from "@debateai/judgement";
import {
  OpenAICompatibleProviderGateway,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  previewTargetGatewayControls,
  readPromptFrame,
  schemaFailureLocator,
  withPreviewProviderCallPolicy,
  PreviewVendorRefusedUnbilled,
  type PreviewBudgetExecution,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import {
  classifyEvaluatorContent,
  classifySynthesisRoleContent,
  parseComposerOutput,
  parseEvaluatorOutput
} from "@debateai/runner";

/**
 * All-steps format robustness (2026-10-12). The preview's practice run (formats mode, every other fix in) still lost
 * steps to format slips: MiMo closed a Romanian „…" quote with a straight quote in a judge attack and in a review
 * (PARSE_FAILED), left a required boolean out of a judge position (SCHEMA_FAILED), and two writers named a node id in
 * their prose (a content refusal). On the preview each of those calls had ONE POST, so the gateway's repair never ran
 * and the runner handed the step to another maker. The fixtures under tests/support/fixtures/judge-format-replies are
 * those real replies: our own practice text, no secret.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
const STOP = Object.freeze({ finishReason: "stop" });
const LENGTH = Object.freeze({ finishReason: "length" });

describe("1. every structured step reads a reply with the story's tolerant repairs", () => {
  it("the real MiMo judge attack (ro): „evident corectă\" closed with a straight quote is read as escaped", () => {
    const reply = fixture("mimo-judge-attack-ro-straight-quote.txt");
    expect(() => JSON.parse(reply)).toThrow();
    const parsed = parseStructuredArtifact(reply, judgeArtifactSchema);
    expect(parsed).toMatchObject({ kind: "PARSED", strategy: "INNER_QUOTE" });
    if (parsed.kind !== "PARSED") throw new Error("unreachable");
    expect(parsed.value.statement).toContain("nu este „evident corectă\", ci o alegere");
    expect(classifyStructuredArtifact(reply, judgeArtifactSchema)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
  });

  it("the real MiMo review (ro): „poate lăsa fără bani\" inside a reasons entry is read as escaped", () => {
    const reply = fixture("mimo-review-ro-straight-quote.txt");
    expect(() => JSON.parse(reply)).toThrow();
    const parsed = parseStructuredArtifact(reply, nodeReviewArtifactSchema(2));
    expect(parsed).toMatchObject({ kind: "PARSED", strategy: "INNER_QUOTE" });
    if (parsed.kind !== "PARSED") throw new Error("unreachable");
    expect(parsed.value.reasons).toHaveLength(4);
    expect(parsed.value.reasons[1]).toContain("„poate lăsa fără bani\" marchează");
    expect(parsed.value.edge_bearings).toEqual([0.75, 0.85]);
  });

  it("the schema stays exactly as strict: the real MiMo position without value_laden is still refused", () => {
    const reply = fixture("mimo-judge-position-ro-no-value-laden.txt");
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, STOP)).toEqual({ kind: "SCHEMA_FAILURE", message: "invalid_type@value_laden" });
    // A repaired reading never relaxes the schema either: the same quote repair on a review with too few bearings.
    expect(parseStructuredArtifact(fixture("mimo-review-ro-straight-quote.txt"), nodeReviewArtifactSchema(1)))
      .toMatchObject({ kind: "SCHEMA_FAILURE" });
  });

  it("closing brackets only for a reply that finished normally; never for one cut off or of unknown ending", () => {
    const whole = fixture("mimo-review-ro-straight-quote.txt").replace("„poate lăsa fără bani\"", "„poate lăsa fără bani”");
    expect(parseStructuredArtifact(whole, nodeReviewArtifactSchema(2))).toMatchObject({ kind: "PARSED", strategy: "RAW" });
    const cut = whole.slice(0, -1);
    expect(parseStructuredArtifact(cut, nodeReviewArtifactSchema(2), STOP)).toMatchObject({ kind: "PARSED", strategy: "CLOSING_BRACKETS" });
    expect(classifyStructuredArtifact(cut, nodeReviewArtifactSchema(2), STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CLOSING_BRACKETS" });
    expect(parseStructuredArtifact(cut, nodeReviewArtifactSchema(2), LENGTH)).toMatchObject({ kind: "PARSE_FAILURE" });
    expect(parseStructuredArtifact(cut, nodeReviewArtifactSchema(2))).toMatchObject({ kind: "PARSE_FAILURE" });
  });

  it("the judge's own three strategies keep their names and repair codes; a clean reply records no repair", () => {
    const assessment = JSON.stringify({ steelman: { summary: "s", fidelity: 0.5 },
      critic: { summary: "c", counterargumentStrength: 0.5, basis: "PLAUSIBLE_COUNTER" },
      evidence: { quality: 0.5, relevance: 0.5 }, context: { fit: 0.5, ambiguityFlags: [] },
      fallacy: { severity: 0.1, fatalFlags: [] } });
    expect(classifyStructuredArtifact(assessment, judgeAssessmentSchema)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(classifyStructuredArtifact(`\`\`\`json\n${assessment}\n\`\`\``, judgeAssessmentSchema))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE" });
    expect(classifyStructuredArtifact(`Here it is: ${assessment}`, judgeAssessmentSchema))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "OUTERMOST_OBJECT" });
  });

  it("the answer writer's and checker's classifiers make the same repairs and record them", () => {
    const verdict = "{\"satisfied\": false, \"objection\": \"The draft calls the plan „cheap\" without a figure.\", \"criteria\": "
      + "{\"fairness_to_losers\": true, \"statement_label_agreement\": true, \"no_overstatement\": false, \"restatement\": true, \"citation_tracing\": true}}";
    expect(classifyEvaluatorContent(verdict)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    expect(parseEvaluatorOutput(verdict).objection).toContain("„cheap\" without");
    const cut = verdict.replace("„cheap\"", "„cheap”").slice(0, -2);
    expect(classifyEvaluatorContent(cut, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CLOSING_BRACKETS" });
    expect(classifyEvaluatorContent(cut, LENGTH)).toMatchObject({ parseStatus: "PARSE_FAILED" });
    expect(() => parseEvaluatorOutput(cut)).toThrow(expect.objectContaining({ code: "EVALUATOR_CONTRACT_ERROR" }));
    expect(parseEvaluatorOutput(cut, STOP).satisfied).toBe(false);
    const draft = "{\"segments\":[{\"segment_id\":\"seg-1\",\"text\":\"The plan is „cheap\" only on paper.\",\"node_refs\":[],\"served_number_refs\":[]}]}";
    expect(classifySynthesisRoleContent("SYNTHESIZER", draft)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    expect(parseComposerOutput(draft).segments[0]!.text).toBe("The plan is „cheap\" only on paper.");
  });

  it("the judge reads its accepted reply exactly as its classifier did (the gateway said how it ended)", async () => {
    const cut = fixture("mimo-review-ro-straight-quote.txt").replace("„poate lăsa fără bani\"", "„poate lăsa fără bani”").slice(0, -1);
    const classifying = (finishReason: string | null): ProviderGateway => ({
      call: async (request) => {
        const classified = request.classifyContent!(cut, { finishReason });
        if (classified.parseStatus !== "PARSED") throw Object.assign(new Error("refused"), { code: "REFUSED_IN_TEST" });
        return { content: cut, rawArtifactRef: "artifact:t", ledgerEntryRef: "ledger:t", provider: "openai-compatible-http",
          model: "m", maker: "x", modelVersion: "m" };
      }
    });
    const review = (gateway: ProviderGateway) => new Judge(gateway).review({ runId: "run:t", subjectItemId: "node:t",
      callSiteKey: "JUDGE:review:t", questionLine: "Should buses be free?", argumentLanguageName: "Romanian",
      statement: "Fares fund frequency.", authorMaker: "other", providerRef: "preview:t", contractHash: "contract:t",
      bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 },
      edges: [{ edgeId: "e1", targetStatement: "a", polarity: "support" }, { edgeId: "e2", targetStatement: "b", polarity: "attack" }] });
    const reviewed = await review(classifying("stop"));
    expect(reviewed.parseStrategy).toBe("CLOSING_BRACKETS");
    expect(reviewed.edgeMeasurements.map((edge) => edge.bearing)).toEqual([0.75, 0.85]);
    await expect(review(classifying("length"))).rejects.toMatchObject({ code: "REFUSED_IN_TEST" });
  });
});

const MODEL = "zai-org/GLM-5.3-Flash";
const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-all-steps-repair-fixture"
}))!;
const COOLDOWN_MS = 60_000;

function servedRequest(role: "JUDGE" | "SYNTHESIZER" | "EVALUATOR", callSiteKey: string): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "fixture.structured.v1", instruction: "Judge the synthetic statement.", answerForm: "Return one JSON object." },
    material: [{ name: "statement", content: "Synthetic school phone policy; no personal data." }]
  });
  return {
    runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey, role, lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:synthetic", providerRef: "preview:fixture-a",
    packet: framed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, nodeReviewArtifactSchema(0), reply),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
}
const RESULT: ProviderCallResult = { content: "{}", rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
  provider: "openai-compatible-http", model: MODEL, maker: "Z.AI", modelVersion: MODEL };
async function forwarded(request: ProviderCallRequest): Promise<ProviderCallRequest> {
  let received: ProviderCallRequest | undefined;
  await withPreviewProviderCallPolicy({ call: async (effective) => { received = effective; return RESULT; } }, CONFIG, { model: MODEL }).call(request);
  if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
  return received;
}

type Script = Array<{ content: string; finish?: string } | { refuse: true } | { status: number }>;
function harness(script: Script) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const slept: number[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    const next = script.shift() ?? { status: 599 };
    // The gate's proven-unbilled refusal, as its port raises it (createPreviewBudgetRpcPorts): nothing was billed.
    if ("refuse" in next) throw new PreviewVendorRefusedUnbilled();
    if ("status" in next) return { status: next.status, body: JSON.stringify({ error: "vendor_error" }) };
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: MODEL,
      choices: [{ message: { content: next.content }, finish_reason: next.finish ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model: MODEL, maker: "Z.AI",
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    ...previewTargetGatewayControls(CONFIG, { model: MODEL })
  });
  const gateway = withPreviewProviderCallPolicy(native, CONFIG, { model: MODEL }, { sleep: async (ms) => { slept.push(ms); } });
  return { gateway, executions, artifacts, ledger, slept };
}

describe("2. on the preview every structured step gets the story's one repair try", () => {
  it.each([
    ["an author leg", "JUDGE", "JUDGE"], ["a critic leg", "JUDGE", "JUDGE:critic:root0:r2:p0"], ["a cross-root leg", "JUDGE", "JUDGE:cross-root:0->1"],
    ["a panel seat", "JUDGE", "PANEL:root:preview:fixture-a"], ["a review", "JUDGE", "JUDGE:review:node"],
    ["the answer writer", "SYNTHESIZER", "COMPOSER:SYNTHESIZER:INITIAL:1"], ["the answer checker", "EVALUATOR", "POST_COMPOSE_R9:EVALUATOR:1"]
  ] as const)("%s may send a second POST, only to repair a refused reply", async (_name, role, callSiteKey) => {
    const effective = await forwarded(servedRequest(role, callSiteKey));
    expect(effective.maxAttemptsThisCall).toBe(2);
    expect(effective.retryOnlyAfterContentRejection).toBe(true);
    expect(effective.attemptScope).toBe("actor");
    // The sealed lifetime bound passes through: the counting gateway reads the allowance off the ledger.
    expect(effective.bound.maxAttempts).toBe(3);
  });

  const oneAttempt: ReadonlyArray<readonly [string, () => ProviderCallRequest]> = [
    ["a call without its own content check", () => { const { classifyContent: _drop, ...rest } = servedRequest("JUDGE", "JUDGE"); return rest; }],
    ["a call without a repair packet", () => { const { buildRepairPacket: _drop, ...rest } = servedRequest("JUDGE", "JUDGE"); return rest; }],
    ["a sealed bound of one", () => ({ ...servedRequest("JUDGE", "JUDGE"), bound: { maxAttempts: 1, tokenCeiling: 2048, deadlineMs: 5000 } })],
    ["the evaluator add-on lane", () => ({ ...servedRequest("JUDGE", "evaluator.grade-judge-output.v1"), lane: "evaluator" })],
    ["a classifier role", () => ({ ...servedRequest("JUDGE", "JUDGE"), role: "CLASSIFIER" })]
  ];
  it.each(oneAttempt)("%s keeps one POST per call", async (_name, make) => {
    const effective = await forwarded(make());
    expect(effective.maxAttemptsThisCall).toBe(1);
    expect(effective.retryOnlyAfterContentRejection).toBeUndefined();
  });

  // Patch follow-up (owner design, 2026-10-12): the second POST of this call is now the short follow-up (the model's own
  // answer back, only the failing path asked for), so the fixed reply is the patch; the full re-ask is covered in
  // tests/unit/patch-follow-up-gateway.test.ts.
  it("the real MiMo position without value_laden, then a fixed reply: PARSED on the second POST of the same call", async () => {
    const first = fixture("mimo-judge-position-ro-no-value-laden.txt");
    const fixed = JSON.stringify({ value_laden: true });
    const { gateway, executions, artifacts, ledger, slept } = harness([{ content: first }, { content: fixed }]);
    const judged = await new Judge(gateway).judge({ runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE",
      questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?", argumentLanguageName: "Romanian",
      providerRef: "preview:fixture-a", contractHash: "contract:synthetic", leg: { kind: "primary-root" },
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 } });
    expect(judged.valueLaden).toBe(true);
    expect(executions).toHaveLength(2);
    expect(slept).toEqual([]);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "PARSED"]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "OK"]);
    // The follow-up names the issue by its machine path only; the model's words go back only as its own turn.
    const messages = JSON.parse(executions[1]!.requestBody).messages as { role: string; content: string }[];
    const repaired = readPromptFrame({ messages: messages as never });
    expect(repaired.fields.slice(-3)).toEqual([
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_paths", content: "value_laden" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages.filter((message) => message.content.includes("gratuitatea pe liniile centrale de autobuz nu este"))
      .map((message) => message.role)).toEqual(["assistant"]);
  });

  it("two refused replies end the call as a content refusal after two POSTs (the runner's fallback takes it from there)", async () => {
    const first = fixture("mimo-judge-position-ro-no-value-laden.txt");
    const { gateway, executions, ledger } = harness([{ content: first }, { content: first }]);
    await expect(gateway.call(servedRequest("JUDGE", "JUDGE"))).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 2 });
    expect(executions).toHaveLength(2);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED"]);
  });

  it("an unbilled refusal still gets ONE POST, then the one 60-second resend (never a second POST inside the call)", async () => {
    const answer = JSON.stringify({ outcome: "agree", reasons: ["ok"], edge_bearings: [] });
    const { gateway, executions, ledger, slept } = harness([{ refuse: true }, { content: answer }]);
    const result = await gateway.call(servedRequest("JUDGE", "JUDGE:review:node"));
    expect(result.content).toBe(answer);
    expect(executions).toHaveLength(2);
    expect(slept).toEqual([COOLDOWN_MS]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["REFUSED", "OK"]);
  });

  it("an unbilled refusal twice: one POST each, one resend, then the failure goes to the runner", async () => {
    const { gateway, executions, ledger, slept } = harness([{ refuse: true }, { refuse: true }]);
    await expect(gateway.call(servedRequest("JUDGE", "JUDGE"))).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(executions).toHaveLength(2);
    expect(slept).toEqual([COOLDOWN_MS]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["REFUSED", "REFUSED"]);
  });

  it("a billed transport failure still ends the call after its one POST", async () => {
    const { gateway, executions, ledger, slept } = harness([{ status: 500 }, { content: "{}" }]);
    await expect(gateway.call(servedRequest("EVALUATOR", "POST_COMPOSE_R9:EVALUATOR:1"))).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(executions).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED"]);
  });

  it("a refused reply, then a transport failure: two POSTs, and the call fails as a transport failure", async () => {
    const { gateway, executions, ledger } = harness([{ content: "not json" }, { status: 500 }, { content: "{}" }]);
    await expect(gateway.call(servedRequest("JUDGE", "JUDGE"))).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(executions).toHaveLength(2);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED"]);
  });
});
