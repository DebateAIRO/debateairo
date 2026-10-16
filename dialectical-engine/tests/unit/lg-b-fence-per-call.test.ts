/**
 * Owner answer 3 (2026-10-15): "The same prompt fence/canary is kept for the 2 tries of one call; every new call gets a
 * fresh one." LG-B Task 8 pins it at the gateway (the full re-ask, the patch follow-up, the length retry), at the
 * preview's unbilled resend, and across calls; and pins L30's order: what changes between tries rides after the stable
 * material. The security review (Task 9) reads these pins.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  OpenAICompatibleProviderGateway, PreviewUnbilledRefusal, buildFramedPatchPrompt, buildFramedPrompt, buildFramedRepairPrompt,
  parsePreviewProviderTestConfig, readPromptFrame, schemaFailureLocator, withPreviewProviderCallPolicy, withStructureRepair,
  type PromptPacket, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import { buildStoryMaterial, toCheckerPromptMaterial, toStoryPromptMaterial, type StoryRunSnapshot } from "@debateai/story";
import type { StoryBody } from "@debateai/contract";
// Pre-flight PF-B3.13 / PF-B3.14: LG-A's routed paths and the runner's cost fallback.
import { classifyStructuredArtifact } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";
import { callServeRoleWithFallback, type ServeRoleMaker } from "../../apps/runner/src/index.js";

const CONTRACT = Object.freeze({ contractId: "fixture.fence.v1", instruction: "Answer the synthetic question.", answerForm: "Return {verdict}." });
const MATERIAL = [{ name: "question_line", content: "Synthetic question; no personal data." }] as const;
const VERDICT = z.object({ verdict: z.string() }).strict();
const classify = (content: string) => {
  let value: unknown;
  try { value = JSON.parse(content); } catch { return { parseStatus: "PARSE_FAILED" as const, parseError: "not json" }; }
  const checked = VERDICT.safeParse(value);
  return checked.success ? { parseStatus: "PARSED" as const, parseError: null } : { parseStatus: "SCHEMA_FAILED" as const, parseError: JSON.stringify(checked.error.issues) };
};

type Reply = Readonly<{ content: string; finish?: string }>;
function harness(script: Reply[]) {
  const sent: PromptPacket[] = [];
  const fetchImplementation = (async (_url: string, init?: RequestInit) => {
    sent.push({ messages: (JSON.parse(String(init?.body)) as PromptPacket).messages });
    const reply = script.shift() ?? { content: "{\"verdict\":\"ok\"}" };
    return new Response(JSON.stringify({ id: "fixture", model: "synthetic/model",
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish ?? "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new OpenAICompatibleProviderGateway({ endpoint: "https://relay.example/v1", model: "synthetic/model", maker: "Synthetic",
    fetchImplementation, persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async (entry) => entry.attemptId,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { gateway, sent };
}
function call(repairFromNewFrame = false): ProviderCallRequest {
  const framed = buildFramedPrompt({ contract: CONTRACT, material: MATERIAL });
  return { runId: "run:synthetic", subjectItemId: "node", callSiteKey: "JUDGE:critic:n", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 5000 }, contractHash: "c", providerRef: "relay:synthetic", packet: framed.packet,
    classifyContent: classify,
    // The negative control: a repair built on a NEW frame, which the owner's rule forbids.
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(repairFromNewFrame ? buildFramedPrompt({ contract: CONTRACT, material: MATERIAL }) : framed,
      schemaFailureLocator(rejected)) };
}
const frames = (packets: readonly PromptPacket[]) => packets.map((packet) => {
  const frame = readPromptFrame(packet);
  return `${frame.fence}|${frame.canary}`;
});

describe("one call keeps its fence and canary on every try", () => {
  it("every POST of one call carries the first POST's fence and canary: the full re-ask", async () => {
    const { gateway, sent } = harness([{ content: "not json" }, { content: "{\"verdict\":\"ok\"}" }]);
    await gateway.call(call());
    expect(sent).toHaveLength(2);
    expect(new Set(frames(sent)).size).toBe(1);
  });

  it("the patch follow-up and the full re-ask after it", async () => {
    const { gateway, sent } = harness([{ content: "{\"verdict\":1}" }, { content: "{\"other\":1}" }, { content: "{\"verdict\":\"ok\"}" }]);
    await gateway.call(call());
    expect(sent).toHaveLength(3);
    expect(sent[1]!.messages.some((message) => message.role === "assistant")).toBe(true);
    expect(new Set(frames(sent)).size).toBe(1);
  });

  it("the length retry re-sends the very first packet", async () => {
    const { gateway, sent } = harness([{ content: "{\"verdict\":\"cut", finish: "length" }, { content: "{\"verdict\":\"ok\"}" }]);
    await gateway.call(call());
    expect(JSON.stringify(sent[1])).toBe(JSON.stringify(sent[0]));
  });

  it("a repair built on a new frame would fail this very check (negative control)", async () => {
    const { gateway, sent } = harness([{ content: "not json" }, { content: "{\"verdict\":\"ok\"}" }]);
    await gateway.call(call(true));
    expect(new Set(frames(sent)).size).toBe(2);
  });

  it("the preview's unbilled resend sends the same packet object again", async () => {
    const seen: ProviderCallRequest[] = [];
    const inner: ProviderGateway = { call: async (request) => {
      seen.push(request);
      if (seen.length === 1) throw new PreviewUnbilledRefusal();
      return { rawArtifactRef: "a", ledgerEntryRef: "l", content: "{}", provider: "openai-compatible-http", model: "zai-org/GLM-5.3-Flash",
        maker: "Z.AI", modelVersion: "zai-org/GLM-5.3-Flash" } satisfies ProviderCallResult;
    } };
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "lg-b-fence-fixture",
      free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
      premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"] }))!;
    const policy = withPreviewProviderCallPolicy(inner, config, { model: "zai-org/GLM-5.3-Flash" }, { sleep: async () => undefined });
    const request = { ...call(), classifyContent: undefined, buildRepairPacket: undefined } as unknown as ProviderCallRequest;
    await policy.call(request);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.packet).toBe(seen[0]!.packet);
  });
});

describe("every new call gets a fresh fence", () => {
  it("two calls of the same step get different fences and canaries", () => {
    const [first, second] = [buildFramedPrompt({ contract: CONTRACT, material: MATERIAL }), buildFramedPrompt({ contract: CONTRACT, material: MATERIAL })];
    expect(first.fence).not.toBe(second.fence);
    expect(first.canary).not.toBe(second.canary);
  });

  it("a patch never carries a reply that holds the call's fence", () => {
    const framed = buildFramedPrompt({ contract: CONTRACT, material: MATERIAL });
    expect(() => buildFramedPatchPrompt(framed.packet, `{"verdict":"${framed.fence}"}`, { code: "SCHEMA_FAILED", paths: ["verdict"] }))
      .toThrow(expect.objectContaining({ code: "PROMPT_PATCH_NOT_APPLICABLE" }));
  });
});

describe("LG-A's routed paths (pre-flight PF-B3.14; owner answer 3, second clause: the structure-repair call is a new call)", () => {
  const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
  const routedFramed = () => buildFramedPrompt({ contract: { contractId: "fixture.fence.lg-a.v1",
    instruction: "Answer the synthetic question in one sentence.", answerForm: "Return only JSON {\"answer\": string, \"score\": number}." },
    material: MATERIAL });
  const routedCall = (framed: ReturnType<typeof buildFramedPrompt>, routed: boolean): ProviderCallRequest => ({ runId: "run:synthetic",
    subjectItemId: "node", callSiteKey: "JUDGE", role: "JUDGE", lane: "served", bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 },
    contractHash: "c", providerRef: "preview:fixture-a", packet: framed.packet, modelRole: "POSITION",
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    ...(routed ? { structureRepairRouted: true } : {}) });
  const posted = (executions: readonly { requestBody: string }[]): PromptPacket[] =>
    executions.map((execution) => ({ messages: (JSON.parse(execution.requestBody) as PromptPacket).messages }));

  it("the structure-repair call carries a fence and canary of its own, never the original call's", async () => {
    const framed = routedFramed();
    const original = previewGlmHarness([{ content: "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}" }]);
    const repair = scriptedRepairGateway("{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}");
    await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway,
      bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } }).call(routedCall(framed, false));
    expect([original.executions.length, repair.requests.length]).toEqual([1, 1]);
    // Control: the original POST carries the step's own frame, so the comparison below reads real frames.
    expect(frames(posted(original.executions))).toEqual([`${framed.fence}|${framed.canary}`]);
    const repairFrame = readPromptFrame(repair.requests[0]!.packet);
    expect(repairFrame.fence).not.toBe(framed.fence);
    expect(repairFrame.canary).not.toBe(framed.canary);
  });

  it("a routed call's PATCH with a plain-word reason and its full re-ask keep the first POST's fence", async () => {
    const patched = routedFramed();
    const patch = previewGlmHarness([{ content: "{\"answer\": \"It is so\"}" }, { content: "{\"score\": 0.4}" }]);
    expect((await patch.gateway.call(routedCall(patched, true))).repairForm).toBe("PATCH");
    const reasked = routedFramed();
    const reask = previewGlmHarness([{ content: "" }, { content: "{\"answer\": \"It is so\", \"score\": 0.5}" }]);
    expect((await reask.gateway.call(routedCall(reasked, true))).repairForm).toBe("FULL");
    for (const [framed, run] of [[patched, patch], [reasked, reask]] as const) {
      const own = `${framed.fence}|${framed.canary}`;
      expect(frames(posted(run.executions))).toEqual([own, own]);
    }
  });
});

describe("an accepted residual (controller ruling PF-B3.13): the runner's cost fallback", () => {
  it("a cost fallback re-sends the planned call's packet unchanged", async () => {
    const seen: { providerRef: string; request: ProviderCallRequest }[] = [];
    const maker = (providerRef: string, refusesMoney: boolean): ServeRoleMaker => Object.freeze({ providerRef, provider: {
      call: async (request: ProviderCallRequest) => {
        seen.push({ providerRef, request });
        if (refusesMoney) throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "synthetic: does not fit");
        return { rawArtifactRef: `artifact:${providerRef}`, content: "{}" } as unknown as ProviderCallResult;
      } } });
    const planned = maker("provider:planned", true);
    await callServeRoleWithFallback({ planned, claimEligible: [planned, maker("provider:cheaper", false)], prices: new Map(), preferNot: null,
      request: call(), call: (target, request) => target.provider.call(request) });
    expect(seen.map((entry) => entry.providerRef)).toEqual(["provider:planned", "provider:cheaper"]);
    // Known and accepted (PF-B3.13): the next maker gets the SAME packet, so the same fence and canary. The fence is a
    // delimiter, not a secret, and no reply text is in this packet; minting one per maker needs a runner + providers hook
    // outside LG-B. The security review (Task 9) and the owner report name it. Should this ever fail, the residual is
    // gone: update Task 9's brief and the owner report, never this assertion's meaning.
    expect(seen[1]!.request.packet).toBe(seen[0]!.request.packet);
    expect(new Set(frames(seen.map((entry) => entry.request.packet))).size).toBe(1);
  });
});

describe("L30: what changes between tries rides after the stable material", () => {
  const snapshot: StoryRunSnapshot = {
    runId: "run:fence", workItemId: "work:fence", answerId: "answer:fence", answerVersion: 1,
    questionLine: "Should the city fund the tram extension?", argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: { label: "CONTESTED", rung: 4, trigger: "MID_BAND", winner_node_id: "position:a", winner_strength: 0.6,
      runner_up_node_id: "position:b", runner_up_strength: 0.4, margin: 0.2, disagreement: 0.08,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }, confidence_band: "MEDIUM", marks: [] },
    servedStatement: ["The debate leans towards funding the extension."],
    nodes: [
      { nodeId: "position:a", isPosition: true, claim: "The city should fund it.", wayOfKnowing: "REASONING", baseScore: 0.5,
        finalStrength: 0.6, excludedReason: null, authorModel: "model:alpha", panelDispersion: 0.1, criticSummary: null },
      { nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", wayOfKnowing: "REASONING", baseScore: 0.5,
        finalStrength: 0.4, excludedReason: null, authorModel: "model:beta", panelDispersion: 0.1, criticSummary: null }
    ],
    arrows: [], sensitivity: [], setAside: []
  };
  it("the storyteller's prior objection and the checker's candidate story are the last fields", () => {
    const built = buildStoryMaterial({ snapshot, enrichment: new Map(), budgetBytes: 40_000, shapeIds: new Set(["general"]) });
    if (built.kind !== "OK") throw new Error(`the fixture material must fit, got ${built.kind}`);
    expect(toStoryPromptMaterial(built.material, "The story overstates the margin.").at(-1)!.name).toBe("prior_objection");
    expect(toCheckerPromptMaterial(built.material, { shape_id: "general" } as unknown as StoryBody).at(-1)!.name).toBe("candidate_story");
    // Negative control: without an objection nothing varying is there, and the last field is the stable material's own.
    expect(toStoryPromptMaterial(built.material, null).at(-1)!.name).not.toBe("prior_objection");
  });
});
