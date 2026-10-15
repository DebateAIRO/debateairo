// tests/unit/lg-a-judge-fixer.test.ts
import { describe, expect, it } from "vitest";
import {
  JUDGE_ARTIFACT_READING, REVIEW_ARTIFACT_READING, classifyStructuredArtifact, judgeAssessmentSchema, parseStructuredArtifact
} from "@debateai/judgement";

const STOP = { finishReason: "stop" } as const;
const ASSESSMENT = {
  steelman: { summary: "The strongest form of the claim holds.", fidelity: 0.8 },
  critic: { summary: "The best counter is weak.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.7 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
};
/** GLM-5.3-Flash's panel slip, 44 tries on 2026-10-14 (unrecognized_keys@evidence, unrecognized_keys@fallacy). */
const GLM_PANEL = JSON.stringify({ ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, quality_note: "two sources" },
  fallacy: { ...ASSESSMENT.fallacy, description: "none found" } });

describe("LG-A: the judge's panel, legs and review read every reply through the fixer", () => {
  it("both reading constants turn the fixer on", () => {
    expect(JUDGE_ARTIFACT_READING.fixer).toEqual({});
    expect(REVIEW_ARTIFACT_READING.fixer).toEqual({});
  });

  it("GLM's panel reply is accepted with its notes dropped, and the re-read gives the same value", () => {
    expect(classifyStructuredArtifact(GLM_PANEL, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
    const read = parseStructuredArtifact(GLM_PANEL, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING);
    expect(read).toEqual({ kind: "PARSED", strategy: "STRUCTURE_FIXED", value: ASSESSMENT, repairs: ["INNER_UNASKED_KEYS"] });
  });

  it("names the decode's repair and the fixer's, in order, when both were needed", () => {
    const fenced = `\`\`\`json\n${GLM_PANEL}\n\`\`\``;
    expect(classifyStructuredArtifact(fenced, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING)).toEqual({
      parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE", jsonRepairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"] });
  });

  it("without the fixer the reply is refused exactly as before; a missing score is refused with it", () => {
    expect(classifyStructuredArtifact(GLM_PANEL, judgeAssessmentSchema, STOP, {}))
      .toEqual({ parseStatus: "SCHEMA_FAILED", parseError: "unrecognized_keys@evidence,unrecognized_keys@fallacy" });
    const noScore = JSON.stringify({ ...ASSESSMENT, steelman: { summary: "x" }, evidence: { ...ASSESSMENT.evidence, note: "y" } });
    expect(classifyStructuredArtifact(noScore, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING).parseStatus).toBe("SCHEMA_FAILED");
  });

  // (pre-flight PF-A8, L34) the syntax pass's repair and a shape repair after it are both named, the decode's first.
  it("a trailing comma and a root key never asked for: TRAILING_COMMA then UNASKED_KEYS", () => {
    const sent = JSON.stringify({ ...ASSESSMENT, notes: "x" }).replace(/\}$/u, ",}");
    expect(classifyStructuredArtifact(sent, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING)).toEqual({
      parseStatus: "PARSED", parseError: null, jsonRepair: "TRAILING_COMMA", jsonRepairs: ["TRAILING_COMMA", "UNASKED_KEYS"] });
    expect(parseStructuredArtifact(sent, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING))
      .toEqual({ kind: "PARSED", strategy: "UNASKED_KEYS", value: ASSESSMENT, repairs: ["TRAILING_COMMA", "UNASKED_KEYS"] });
  });
});
