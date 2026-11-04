// tests/unit/start-step-registries.test.ts
// V4 start step, Task 23 (spec 2026-11-03 §4.1): the step before Start's calls in the shared registries: their thinking step (the lowest
// level unless the owner's table names the step), their practice family and step, and the re-check of a stored reply by its own form.
import { describe, expect, it } from "vitest";
import {
  START_CALL_SITE_PREFIX, START_CALL_SITES, START_SEAT_REUSE_SUFFIX, START_STEP_HAIKU_MODEL, startListCallSiteKey
} from "@debateai/map";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS, PREVIEW_THINKING_STEPS, parsePreviewThinkingLevels, previewModelRow, previewTargetJsonRow, previewThinkingLevelFor,
  previewThinkingStepOf
} from "@debateai/providers";
import { callFamilyOf, practiceStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";

const GLM = "zai-org/GLM-5.3-Flash";
const KEYS = ["START:angles", "START:list:2", "START:merge", "START:merge-late", "START:combine", "START:fit"];

describe("the start step's names", () => {
  it("are built by code", () => {
    expect(START_CALL_SITE_PREFIX).toBe("START:");
    expect([START_CALL_SITES.angles, startListCallSiteKey(2), START_CALL_SITES.merge, START_CALL_SITES.mergeLate, START_CALL_SITES.combine,
      START_CALL_SITES.fit]).toEqual(KEYS);
    expect(KEYS.every((key) => key.startsWith(START_CALL_SITE_PREFIX))).toBe(true);
    expect(START_STEP_HAIKU_MODEL).toBe("claude-haiku-5-5");
    expect(previewModelRow(START_STEP_HAIKU_MODEL)).not.toBeNull();
    expect(START_SEAT_REUSE_SUFFIX).toBe("#2");
  });
});

describe("the thinking step", () => {
  it("every start call is the start_step, the last step of the table", () => {
    expect(PREVIEW_THINKING_STEPS.at(-1)).toBe("start_step");
    expect(previewThinkingStepOf({ callSiteKey: "START:list:3" })).toBe("start_step");
    for (const key of KEYS) expect(previewThinkingStepOf({ callSiteKey: key }), key).toBe("start_step");
    // The debate map's own calls keep their step.
    expect(previewThinkingStepOf({ callSiteKey: "MAP:list:3" })).toBe("opening");
  });

  it("runs at each AI's lowest level, unless the owner's table names the step", () => {
    const glm = previewModelRow(GLM)!;
    expect(previewThinkingLevelFor(undefined, glm, "start_step")).toBe(glm.effortsByStrength.at(-1));
    for (const ref of PREVIEW_REVIEWED_PROVIDER_REFS) {
      const row = previewModelRow(previewTargetJsonRow(ref).model)!;
      expect(previewThinkingLevelFor(undefined, row, "start_step"), row.model).toBe(row.effortsByStrength.at(-1));
      // The AI's usual level does not raise it; the owner's step override does.
      expect(previewThinkingLevelFor({ [row.model]: { level: row.effortsByStrength[0]! } }, row, "start_step"), row.model)
        .toBe(row.effortsByStrength.at(-1));
      expect(previewThinkingLevelFor({ [row.model]: { steps: { start_step: row.effortsByStrength[0]! } } }, row, "start_step"), row.model)
        .toBe(row.effortsByStrength[0]);
    }
    expect(parsePreviewThinkingLevels({ [GLM]: { steps: { start_step: "high" } } })).toEqual({ [GLM]: { steps: { start_step: "high" } } });
  });
});

describe("the practice's report", () => {
  it("names every start call by the START family, at the start step", () => {
    expect(KEYS.map(callFamilyOf)).toEqual(Array(6).fill("START"));
    for (const key of KEYS) expect(practiceStepOf(key), key).toBe("start");
  });

  it("re-checks a stored reply by the call's own form", () => {
    expect(recheckReply("START:fit", "{\"fits\":null}")).toEqual({ family: "START", issues: [] });
    expect(recheckReply("START:combine", JSON.stringify({ title: "Winter supply", question: "Would the winter supply hold?" })))
      .toEqual({ family: "START", issues: [] });
    expect(recheckReply("START:list:4", JSON.stringify({ paths: [{ angle_id: "g1", title: "Winter supply", question: "Would the winter supply hold?",
      why: "It decides the answer." }] }))).toEqual({ family: "START", issues: [] });
    for (const key of KEYS) {
      const refused = recheckReply(key, "{\"nothing\":1}").issues;
      expect(refused.length, key).toBeGreaterThan(0);
      expect(refused, key).not.toContain("UNMAPPED");
    }
    expect(recheckReply("START:unknown", "{}")).toEqual({ family: "START", issues: ["UNMAPPED"] });
  });
});
