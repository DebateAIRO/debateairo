// tests/unit/r2-split-contract.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AnswerFloorSchema,
  AnswerSchema,
  AnswerSummarySchema,
  PublicDebateSchema,
  PublicDebateSummarySchema,
  StoryVerdictBasisSchema,
  VERDICT_STATES,
  VerdictStateSchema
} from "@debateai/contract";
import { SERVE_DISCLOSURE_FLOOR_STATES } from "@debateai/db";
import { STORY_ENGINE_TOKENS } from "@debateai/story";

/**
 * Engine redesign R2b, Task B4 (owner ruling E8; INTERFACE §9.6): the verdict state grows by SPLIT ("no majority among
 * the comparing judges", shown as "Contested"). A closed public vocabulary only grows: every old stored value still
 * parses, and every site reads ONE schema, so the four states cannot drift apart again.
 */
describe("the verdict state: one schema, closed at four", () => {
  it("names the four states in order, frozen", () => {
    expect(VERDICT_STATES).toEqual(["SUPPORTED", "CONTESTED", "UNSUPPORTED", "SPLIT"]);
    expect(Object.isFrozen(VERDICT_STATES)).toBe(true);
    expect(VerdictStateSchema.options).toEqual([...VERDICT_STATES]);
  });

  it("is the very schema every contract site reads", () => {
    expect(AnswerSchema.shape.verdict_state.unwrap()).toBe(VerdictStateSchema);
    expect(AnswerSummarySchema.shape.verdict_state.unwrap()).toBe(VerdictStateSchema);
    expect(PublicDebateSummarySchema.shape.verdict.unwrap()).toBe(VerdictStateSchema);
    expect(PublicDebateSummarySchema.shape.floor_verdict.unwrap()).toBe(VerdictStateSchema);
    expect(PublicDebateSchema.shape.answer.shape.verdict.unwrap()).toBe(VerdictStateSchema);
    expect(AnswerFloorSchema.shape.verdict_state).toBe(VerdictStateSchema);
    expect(StoryVerdictBasisSchema.shape.label).toBe(VerdictStateSchema);
  });

  it("accepts SPLIT and every old state, and still refuses anything else", () => {
    for (const state of [...VERDICT_STATES]) expect([state, VerdictStateSchema.safeParse(state).success]).toEqual([state, true]);
    for (const bad of ["SPLITTED", "contested", "", "CLEAR"]) expect(VerdictStateSchema.safeParse(bad).success).toBe(false);
  });

  it("lets the story basis carry rung 5, never 6", () => {
    expect(StoryVerdictBasisSchema.shape.rung.safeParse(5).success).toBe(true);
    expect(StoryVerdictBasisSchema.shape.rung.safeParse(6).success).toBe(false);
  });

  it("grows the database's floor list and the story's code tokens with it", () => {
    expect(SERVE_DISCLOSURE_FLOOR_STATES).toEqual(["SUPPORTED", "CONTESTED", "UNSUPPORTED", "SPLIT"]);
    expect(STORY_ENGINE_TOKENS).toContain("SPLIT");
  });

  it("leaves no other spelling of the closed list in the contract package", async () => {
    for (const file of ["index.ts", "disclosure.ts", "client.ts", "story.ts"]) {
      const source = await readFile(new URL(`../../packages/contract/src/${file}`, import.meta.url), "utf8");
      expect([file, source.includes("\"SUPPORTED\", \"CONTESTED\", \"UNSUPPORTED\"")]).toEqual([file, false]);
      expect([file, source.includes("\"SUPPORTED\" | \"CONTESTED\" | \"UNSUPPORTED\"")]).toEqual([file, false]);
    }
  });
});
