import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Judge,
  classifyStructuredArtifact,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nestedFieldsPlan,
  nodeReviewArtifactSchema,
  parseStructuredArtifact
} from "@debateai/judgement";
import type { ProviderGateway } from "@debateai/providers";

/**
 * Judge nested fields (2026-10-12). MiMo-V2.6-Pro in JSON mode answered the judge's author legs with the two scored
 * members FLATTENED: `"steelman": "<summary>"` plus a root `"fidelity"`, and `"critic": "<summary>"` plus root
 * `"counterargumentStrength"` and `"basis"`, instead of nesting them. Everything else in those replies is valid. The
 * fixtures are the two real refused replies from the preview practice run (formats mode, JUDGE_CROSS in Romanian and
 * JUDGE_POSITION in English): our own practice text, no secret.
 *
 * The one shape repair (NESTED_FIELDS) is tried only after a decoded object fails the schema, only where the judge's
 * author legs and the panel ask for it, nests exactly the members the schema itself names, and the result must pass the full schema.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
const CROSS = "mimo-judge-cross-ro-flattened-nested.txt";
const POSITION = "mimo-judge-position-en-flattened-nested.txt";
const NESTED = Object.freeze({ nestedFields: true });
const FLATTENED_ISSUES = "invalid_type@steelman,invalid_type@critic,unrecognized_keys@$";

const edited = (name: string, edit: (value: Record<string, unknown>) => void): string => {
  const value = JSON.parse(fixture(name)) as Record<string, unknown>;
  edit(value);
  return JSON.stringify(value);
};

describe("the plan comes from the schema itself", () => {
  it("the judge artifact nests steelman {summary, fidelity} and critic {summary, counterargumentStrength, basis}; nothing else", () => {
    expect(nestedFieldsPlan(judgeArtifactSchema)).toEqual([
      { member: "steelman", text: "summary", lifted: ["fidelity"] },
      { member: "critic", text: "summary", lifted: ["counterargumentStrength", "basis"] }
    ]);
  });
});

describe("the two real MiMo replies", () => {
  for (const name of [CROSS, POSITION]) {
    it(`${name}: refused as before without the repair; accepted with NESTED_FIELDS on the judge's reading`, () => {
      const reply = fixture(name);
      const raw = JSON.parse(reply) as Record<string, unknown>;
      expect(typeof raw.steelman).toBe("string");
      expect(typeof raw.critic).toBe("string");
      expect(parseStructuredArtifact(reply, judgeArtifactSchema)).toEqual({ kind: "SCHEMA_FAILURE", message: FLATTENED_ISSUES });

      const parsed = parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED);
      expect(parsed).toMatchObject({ kind: "PARSED", strategy: "NESTED_FIELDS" });
      if (parsed.kind !== "PARSED") throw new Error("unreachable");
      expect(parsed.value.steelman).toEqual({ summary: (raw.steelman as string).trim(), fidelity: raw.fidelity });
      expect(parsed.value.critic).toEqual({
        summary: (raw.critic as string).trim(), counterargumentStrength: raw.counterargumentStrength, basis: raw.basis
      });
      expect(parsed.value.statement).toBe((raw.statement as string).trim());
      expect(Object.keys(parsed.value)).not.toContain("fidelity");
      expect(classifyStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED))
        .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "NESTED_FIELDS" });
      // A re-read of the same accepted content gives the same repaired object (the judge re-reads result.content).
      expect(parseStructuredArtifact(reply, judgeArtifactSchema, { finishReason: "stop" }, NESTED)).toEqual(parsed);
    });
  }

  it("the judge's author leg accepts the real reply and hands on the nested assessment", async () => {
    const reply = fixture(POSITION);
    const raw = JSON.parse(reply) as Record<string, unknown>;
    const classified: unknown[] = [];
    const gateway: ProviderGateway = {
      call: async (request) => {
        const classification = request.classifyContent!(reply, { finishReason: "stop" });
        classified.push(classification);
        if (classification.parseStatus !== "PARSED") throw Object.assign(new Error("refused"), { code: "REFUSED_IN_TEST" });
        return { content: reply, rawArtifactRef: "artifact:t", ledgerEntryRef: "ledger:t", provider: "openai-compatible-http",
          model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "xiaomi", modelVersion: "m" };
      }
    };
    const judged = await new Judge(gateway).judge({ runId: "run:t", subjectItemId: "node:t", callSiteKey: "JUDGE",
      questionLine: "Should a mid-sized city make its central bus lines free?", argumentLanguageName: "English",
      providerRef: "preview:t", contractHash: "contract:t", leg: { kind: "primary-root" },
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 } });
    expect(classified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "NESTED_FIELDS" }]);
    expect(judged.parseStrategy).toBe("NESTED_FIELDS");
    expect(judged.assessment.steelman).toEqual({ summary: (raw.steelman as string).trim(), fidelity: 0.85 });
    expect(judged.assessment.critic).toEqual({ summary: (raw.critic as string).trim(), counterargumentStrength: 0.7, basis: "PLAUSIBLE_COUNTER" });
  });
});

describe("the repair never relaxes anything", () => {
  it("steelman a string without a root fidelity is still refused", () => {
    const reply = edited(CROSS, (value) => { delete value.fidelity; });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toMatchObject({ kind: "SCHEMA_FAILURE" });
    expect(classifyStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toMatchObject({ parseStatus: "SCHEMA_FAILED" });
  });

  it("critic a string with only part of its members at the root is still refused", () => {
    const reply = edited(POSITION, (value) => { delete value.basis; });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toMatchObject({ kind: "SCHEMA_FAILURE" });
  });

  it("an extra unrelated root key is still refused (only the moved keys leave the root)", () => {
    const reply = edited(POSITION, (value) => { value.confidence = 0.8; });
    const parsed = parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED);
    expect(parsed).toEqual({ kind: "SCHEMA_FAILURE", message: FLATTENED_ISSUES });
  });

  it("a moved value still meets the full schema: a fidelity out of range is refused, never clamped", () => {
    const reply = edited(CROSS, (value) => { value.fidelity = 1.5; });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toMatchObject({ kind: "SCHEMA_FAILURE" });
  });

  it("a root fidelity beside a steelman that is already an object is never moved", () => {
    const reply = edited(CROSS, (value) => {
      value.steelman = { summary: value.steelman, fidelity: 0.9 };
      value.critic = { summary: value.critic, counterargumentStrength: value.counterargumentStrength, basis: value.basis };
      delete value.counterargumentStrength;
      delete value.basis;
    });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED))
      .toEqual({ kind: "SCHEMA_FAILURE", message: "unrecognized_keys@$" });
  });

  it("a correct reply is untouched: no repair code", () => {
    const reply = edited(CROSS, (value) => {
      value.steelman = { summary: value.steelman, fidelity: value.fidelity };
      value.critic = { summary: value.critic, counterargumentStrength: value.counterargumentStrength, basis: value.basis };
      delete value.fidelity;
      delete value.counterargumentStrength;
      delete value.basis;
    });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toMatchObject({ kind: "PARSED", strategy: "RAW" });
    expect(classifyStructuredArtifact(reply, judgeArtifactSchema, undefined, NESTED)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("the panel reads the same way: a flattened assessment is accepted as NESTED_FIELDS", async () => {
    const reply = fixture(POSITION);
    const raw = JSON.parse(reply) as Record<string, unknown>;
    const flattened = edited(POSITION, (value) => {
      for (const key of ["statement", "way_of_knowing", "locator", "restatement_text", "restatement_status", "value_laden"]) delete value[key];
    });
    expect(nestedFieldsPlan(judgeAssessmentSchema)).toEqual(nestedFieldsPlan(judgeArtifactSchema));
    expect(parseStructuredArtifact(flattened, judgeAssessmentSchema)).toEqual({ kind: "SCHEMA_FAILURE", message: FLATTENED_ISSUES });
    const panelClassified: unknown[] = [];
    const panel = (content: string): ProviderGateway => ({
      call: async (request) => {
        const classification = request.classifyContent!(content, { finishReason: "stop" });
        panelClassified.push(classification);
        if (classification.parseStatus !== "PARSED") throw Object.assign(new Error("refused"), { code: "REFUSED_IN_TEST" });
        return { content, rawArtifactRef: "artifact:p", ledgerEntryRef: "ledger:p", provider: "openai-compatible-http",
          model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "xiaomi", modelVersion: "m" };
      }
    });
    const assess = (content: string) => new Judge(panel(content)).assess({ runId: "run:t", subjectItemId: "node:t",
      callSiteKey: "JUDGE:panel:t", questionLine: "Should buses be free?", argumentLanguageName: "English",
      statement: "Fares fund frequency.", authorMaker: "other", providerRef: "preview:t", contractHash: "contract:t",
      bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 } });
    const assessed = await assess(flattened);
    expect(panelClassified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "NESTED_FIELDS" }]);
    expect(assessed.parseStrategy).toBe("NESTED_FIELDS");
    expect(assessed.assessment.steelman).toEqual({ summary: (raw.steelman as string).trim(), fidelity: 0.85 });
    expect(assessed.assessment.critic).toEqual({ summary: (raw.critic as string).trim(), counterargumentStrength: 0.7, basis: "PLAUSIBLE_COUNTER" });
  });

  it("the panel still refuses the partial and extra-key cases", async () => {
    const strip = (value: Record<string, unknown>): void => {
      for (const key of ["statement", "way_of_knowing", "locator", "restatement_text", "restatement_status", "value_laden"]) delete value[key];
    };
    const noFidelity = edited(POSITION, (value) => { strip(value); delete value.fidelity; });
    const partialCritic = edited(POSITION, (value) => { strip(value); delete value.basis; });
    const extraKey = edited(POSITION, (value) => { strip(value); value.confidence = 0.8; });
    for (const reply of [noFidelity, partialCritic, extraKey]) {
      expect(parseStructuredArtifact(reply, judgeAssessmentSchema, undefined, NESTED)).toMatchObject({ kind: "SCHEMA_FAILURE" });
      const refusing: ProviderGateway = {
        call: async (request) => {
          const classification = request.classifyContent!(reply, { finishReason: "stop" });
          expect(classification.parseStatus).toBe("SCHEMA_FAILED");
          throw Object.assign(new Error("refused"), { code: "REFUSED_IN_TEST" });
        }
      };
      await expect(new Judge(refusing).assess({ runId: "run:t", subjectItemId: "node:t", callSiteKey: "JUDGE:panel:t",
        questionLine: "Should buses be free?", argumentLanguageName: "English", statement: "Fares fund frequency.", authorMaker: "other",
        providerRef: "preview:t", contractHash: "contract:t", bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 } }))
        .rejects.toThrow();
    }
    expect(parseStructuredArtifact(extraKey, judgeAssessmentSchema, undefined, NESTED)).toEqual({ kind: "SCHEMA_FAILURE", message: FLATTENED_ISSUES });
  });

  it("the review never nests: its schema gives no plan", () => {
    expect(nestedFieldsPlan(nodeReviewArtifactSchema(2))).toEqual([]);
  });
});
