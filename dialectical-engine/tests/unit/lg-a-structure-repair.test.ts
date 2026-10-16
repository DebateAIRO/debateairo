// tests/unit/lg-a-structure-repair.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Judge, classifyStructuredArtifact } from "@debateai/judgement";
import { STORYTELLER_ANSWER_FORM } from "@debateai/story";
import { TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError, STRUCTURE_REPAIR_CONTRACT_HASH, buildFramedPrompt, buildFramedRepairPrompt, framedAnswerForm,
  previewThinkingStepOf, readPromptFrame, schemaFailureLocator, structureRepairKeepsWords, withStructureRepair,
  type ProviderCallRequest
} from "@debateai/providers";
import { GLM, HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";

const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
const FORM = "Return only JSON {\"answer\": string, \"score\": number}.";
const framed = buildFramedPrompt({ contract: { contractId: "test.lg-a.v1", instruction: "Answer the question in one sentence.", answerForm: FORM },
  material: [{ name: "question", content: "Is it so?" }] });
function request(extra: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return { runId: "run:lg-a", subjectItemId: "node:lg-a", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:lg-a", providerRef: "preview:fixture-a",
    packet: framed.packet, modelRole: "POSITION",
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)), ...extra };
}
const BROKEN = "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}";
const COPY = "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}";
const route = (reply: string | Error) => {
  const repair = scriptedRepairGateway(reply);
  return { ...repair, route: { providerRef: HAIKU_REF, gateway: repair.gateway, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } } };
};

describe("LG-A framedAnswerForm: the step's own answer form, read back from its frame", () => {
  it("reads a one-line form and the storyteller's many-line form exactly", () => {
    expect(framedAnswerForm(framed.packet)).toBe(FORM);
    const story = buildFramedPrompt({ contract: { contractId: "story.storyteller.v3", instruction: "Tell it.", answerForm: STORYTELLER_ANSWER_FORM },
      material: [{ name: "points", content: "[]" }] });
    expect(framedAnswerForm(story.packet)).toBe(STORYTELLER_ANSWER_FORM);
  });
});

describe("LG-A structureRepairKeepsWords (deviation 4)", () => {
  const broken = "{\"answer\": \"The plan holds because fares cover costs\" \"score\": 0.5, \"ok\": true, \"note\": \"a stray remark from the model\"}";
  it("accepts a copy that only moves, wraps and drops form", () => {
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.5, ok: true })).toBe(true);
    expect(structureRepairKeepsWords("{\"note\": [\"First text here.\", \"Second text here.\"]}",
      { note: { text: "First text here.\n\nSecond text here.", node_refs: [] } })).toBe(true);
  });
  it("refuses a changed word, an invented or changed number, an added true, and a lost text", () => {
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover the costs", score: 0.5, ok: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.9, ok: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.5, ok: true, sure: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds", score: 0.5, ok: true })).toBe(false);
  });
  // Task 4 carry: `replyFailureClassOf` classes an object where a number belongs as STRUCTURE, so the repair call faces
  // wrapped scores. Unwrapping the AI's own number is form; a score the broken reply never gave is invented.
  it("unwraps a wrapped score, and refuses a score or a verdict the broken reply never gave", () => {
    const answer = "The plan holds because fares cover costs";
    expect(structureRepairKeepsWords(`{"answer": "${answer}", "fidelity": {"value": 0.7}}`, { answer, fidelity: 0.7 })).toBe(true);
    expect(structureRepairKeepsWords(`{"answer": "${answer}", "fidelity": {"value": "high"}}`, { answer, fidelity: 0.7 })).toBe(false);
    expect(structureRepairKeepsWords(`{"answer": "${answer}"}`, { answer, fidelity: 0.5 })).toBe(false);
    expect(structureRepairKeepsWords(`{"objection": "${answer}"}`, { objection: answer, satisfied: false })).toBe(false);
  });
  it("keeps a short id or label only as whole words of the broken reply", () => {
    const broken = "{\"answer\": \"The fares fall below the costs\" \"refs\": [\"node-1\"], \"fit\": \"strong\"}";
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-1"], fit: "strong" })).toBe(true);
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-1"], fit: "low" })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-12"], fit: "strong" })).toBe(false);
  });
});

describe("LG-A withStructureRepair (L32)", () => {
  it("is the gateway itself with no route, and refuses a route it cannot use", () => {
    const { gateway } = previewGlmHarness([]);
    expect(withStructureRepair(gateway, null)).toBe(gateway);
    expect(() => withStructureRepair(gateway, { providerRef: " ", gateway, bound: { tokenCeiling: 1, deadlineMs: 1 } }))
      .toThrow("STRUCTURE_REPAIR_ROUTE_INVALID");
  });

  it("sends ONE structure-repair call, word for word, and keeps the original AI as the author", async () => {
    const original = previewGlmHarness([{ content: BROKEN }]);
    const repair = route(COPY);
    const result = await withStructureRepair(original.gateway, repair.route).call(request());
    expect(result).toMatchObject({ content: COPY, repairForm: "STRUCTURE", repairAttempts: 1, maker: "Z.AI", model: GLM,
      rawArtifactRef: original.artifacts[0]!.artifactId, ledgerEntryRef: original.ledger[0]!.attemptId });
    expect(original.executions).toHaveLength(1);
    const sent = repair.requests[0]!;
    expect(repair.requests).toHaveLength(1);
    expect(sent).toMatchObject({ callSiteKey: "REPAIR:STRUCTURE:JUDGE", role: "JUDGE", lane: "served", runId: "run:lg-a",
      subjectItemId: "node:lg-a", providerRef: HAIKU_REF, contractHash: STRUCTURE_REPAIR_CONTRACT_HASH,
      bound: { maxAttempts: 3, tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    for (const absent of ["thinkingLevel", "repairThinkingLevel", "buildRepairPacket", "modelRole", "structureRepairRouted", "preferredResponseFormat"] as const) {
      expect(sent[absent]).toBeUndefined();
    }
    const frame = readPromptFrame(sent.packet);
    expect(frame.contractId).toBe("repair.structure.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["answer_form", "broken_reply", "machine_rejection_code", "machine_rejection_path"]);
    expect(frame.fields[0]!.content).toBe(FORM);
    expect(frame.fields[1]!.content).toBe(BROKEN);
  });

  it("refuses a repair that changes a word or a number: the call ends as today, with the original's facts", async () => {
    for (const changed of ["{\"answer\": \"It is so, by the city's figures\", \"score\": 0.5}", "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.9}"]) {
      const original = previewGlmHarness([{ content: BROKEN }]);
      // The error is awaited first: the original's artifact exists only once the call has run.
      const error = await withStructureRepair(original.gateway, route(changed).route).call(request()).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 1, lastRawArtifactRef: original.artifacts[0]!.artifactId });
    }
  });

  it("refuses a repair that turns a wrapped non-number into an invented score (Task 4 carry)", async () => {
    const wrapped = "{\"answer\": \"It is so, by the city's own figures\", \"score\": {\"value\": \"high\"}}";
    const original = previewGlmHarness([{ content: wrapped }]);
    const repair = route("{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.7}");
    const error = await withStructureRepair(original.gateway, repair.route).call(request()).catch((caught: unknown) => caught);
    expect(repair.requests).toHaveLength(1);
    expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 1, lastRawArtifactRef: original.artifacts[0]!.artifactId });
    expect(original.executions).toHaveLength(1);
  });

  it("a repair call that fails leaves today's refusal; a money stop passes through as itself", async () => {
    const failed = previewGlmHarness([{ content: BROKEN }]);
    await expect(withStructureRepair(failed.gateway, route(new ProviderCallFailedError(new Error("busy"), 1, "FAILED", "ledger:x")).route)
      .call(request())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED" });
    const money = previewGlmHarness([{ content: BROKEN }]);
    await expect(withStructureRepair(money.gateway, route(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "spent")).route)
      .call(request())).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  // Ruling R9 (pre-flight PF-A48): the run's attempt ceiling, raised unwrapped by the repair gateway's `assertAttemptAllowed`
  // before it sends (`@debateai/budget` assertModelAttemptAllowed), is the run's own stop: it passes through as itself.
  it("the run's attempt ceiling on the repair call passes through as itself, not as a content refusal", async () => {
    const ceiling = new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "the next call would be attempt 41 of a SERVE ceiling of 40");
    const original = previewGlmHarness([{ content: BROKEN }]);
    const error = await withStructureRepair(original.gateway, route(ceiling).route).call(request()).catch((caught: unknown) => caught);
    expect(error).toBe(ceiling);
    expect(original.executions).toHaveLength(1);
  });

  it("does not route the dormant evaluator lane or a call with no content check", async () => {
    const inner: ProviderCallRequest[] = [];
    const recording = { call: async (sent: ProviderCallRequest) => { inner.push(sent); throw new Error("stop here"); } };
    const wrapped = withStructureRepair(recording, route(COPY).route);
    await expect(wrapped.call(request({ lane: "evaluator" }))).rejects.toThrow("stop here");
    const { classifyContent: _none, ...unchecked } = request();
    await expect(wrapped.call(unchecked)).rejects.toThrow("stop here");
    await expect(wrapped.call(request())).rejects.toThrow("stop here");
    expect(inner.map((sent) => sent.structureRepairRouted)).toEqual([undefined, undefined, true]);
  });

  it("a repair call's own attempt is recorded with reply form STRUCTURE (L34)", async () => {
    const repairModel = previewGlmHarness([{ content: COPY }]);
    await repairModel.gateway.call(request({ callSiteKey: "REPAIR:STRUCTURE:JUDGE" }));
    expect(repairModel.artifacts.map((artifact) => artifact.replyForm)).toEqual(["STRUCTURE"]);
    const plain = previewGlmHarness([{ content: COPY }]);
    await plain.gateway.call(request());
    expect(plain.artifacts.map((artifact) => artifact.replyForm)).toEqual(["ORIGINAL"]);
  });

  it("the preview runs a repair call at the repair model's slip_fix level", () => {
    expect(previewThinkingStepOf({ callSiteKey: "REPAIR:STRUCTURE:JUDGE:cross-root:0->1", lane: "served" })).toBe("slip_fix");
    expect(previewThinkingStepOf({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", lane: "story" })).toBe("slip_fix");
  });
});

describe("LG-A: a judge's position repaired in structure keeps its author (Review Focus 3)", () => {
  const fixture = (name: string) => readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
  const raw = JSON.parse(fixture("mimo-judge-position-ro-no-value-laden.txt").replace(/^```json\n/u, "").replace(/\n```$/u, "")) as Record<string, unknown>;
  const whole = JSON.stringify({ ...raw, value_laden: false });
  const broken = whole.replace("},\"critic\"", "} \"critic\"");

  it("the judge's provenance is the original AI's own artifact; the statement is its own words", async () => {
    expect(broken).not.toBe(whole);
    const original = previewGlmHarness([{ content: broken }]);
    const repair = route(whole);
    const judged = await new Judge(withStructureRepair(original.gateway, repair.route)).judge({
      runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE",
      questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?", argumentLanguageName: "Romanian",
      providerRef: "preview:fixture-a", contractHash: "contract:synthetic", leg: { kind: "primary-root" as const },
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 } });
    expect(judged.provenanceRef).toBe(original.artifacts[0]!.artifactId);
    expect(judged.statement).toBe((raw.statement as string).trim());
    expect(repair.requests).toHaveLength(1);
  });
});
