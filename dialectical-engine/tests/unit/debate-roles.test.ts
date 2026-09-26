import { describe, expect, it } from "vitest";
import {
  DEBATE_ROLES,
  MODEL_STRENGTHS,
  THINKING_LEVEL_DEFAULT_ONLY,
  debateRoleFromCallSiteKey,
  isDebateRole,
  type DebateRole
} from "@debateai/kernel";

/**
 * Model-scorecard vocabulary. Every key below is a shape a shipped builder produces today
 * (apps/runner/src/index.ts, packages/serve/src/synthesis.ts), plus Task P4's
 * `:seat:<main|runnerUp>` suffix, which must never change the role.
 */
const KEYS: readonly { readonly key: string; readonly role: DebateRole | null }[] = [
  { key: "JUDGE", role: "POSITION" },
  { key: "JUDGE:root:secondary", role: "POSITION" },
  { key: "JUDGE:root:2", role: "POSITION" },
  { key: "JUDGE:defender:root0:r0:p0", role: "SUPPORT_ATTACK" },
  { key: "JUDGE:critic:root1:r2:p3", role: "SUPPORT_ATTACK" },
  { key: "JUDGE:cross-root:0->1", role: "CROSS_EXCHANGE" },
  { key: "PANEL:root:provider:test-layer", role: "JUDGE" },
  { key: "PANEL:JUDGE:root:secondary:provider:test-layer:secondary", role: "JUDGE" },
  { key: "PANEL:JUDGE:critic:root0:r1:p0:provider:x", role: "JUDGE" },
  { key: "JUDGE:review:11111111-1111-4111-8111-111111111111", role: "REVIEWER" },
  { key: "JUDGE:review:catch-up:invocation-1:11111111-1111-4111-8111-111111111111", role: "REVIEWER" },
  { key: "COMPOSER:SYNTHESIZER:INITIAL:1", role: "ANSWER_WRITER" },
  { key: "COMPOSER:SYNTHESIZER:RETRY:2", role: "ANSWER_WRITER" },
  { key: "POST_COMPOSE_R9:EVALUATOR:1", role: "ANSWER_CHECKER" },
  { key: "JUDGE:seat:main", role: "POSITION" },
  { key: "JUDGE:root:secondary:seat:runnerUp", role: "POSITION" },
  { key: "JUDGE:cross-root:1->0:seat:runnerUp", role: "CROSS_EXCHANGE" },
  { key: "JUDGE:review:11111111-1111-4111-8111-111111111111:seat:main", role: "REVIEWER" },
  { key: "COMPOSER:SYNTHESIZER:INITIAL:1:seat:runnerUp", role: "ANSWER_WRITER" },
  { key: "POST_COMPOSE_R9:EVALUATOR:2:seat:main", role: "ANSWER_CHECKER" },
  { key: "PANEL:JUDGE:seat:runnerUp:provider:x", role: "JUDGE" },
  { key: "STOPPING:round:1", role: null },
  { key: "SYNTHESIZER:provider:x", role: null },
  { key: "evaluator.panel.member", role: null },
  { key: "JUDGE:unknown-leg", role: null },
  { key: "JUDGEMENT", role: null },
  { key: "judge", role: null },
  { key: "COMPOSER:CONFORMANCE:1", role: null },
  { key: "", role: null }
];

describe("model-scorecard vocabulary, minted once in the kernel", () => {
  it("lists the seven debate roles and the three strengths in their ruled order", () => {
    expect(DEBATE_ROLES).toEqual([
      "POSITION", "SUPPORT_ATTACK", "CROSS_EXCHANGE", "JUDGE", "REVIEWER", "ANSWER_WRITER", "ANSWER_CHECKER"
    ]);
    expect(MODEL_STRENGTHS).toEqual(["ECONOMY", "BALANCED", "BEST"]);
    expect(THINKING_LEVEL_DEFAULT_ONLY).toBe("DEFAULT_ONLY");
  });

  it("recognises a debate role and nothing else", () => {
    for (const role of DEBATE_ROLES) expect(isDebateRole(role)).toBe(true);
    for (const value of ["judge", "EVALUATOR", "SYNTHESIZER", "", null, undefined, 7, { role: "JUDGE" }]) {
      expect(isDebateRole(value), String(value)).toBe(false);
    }
  });

  it.each(KEYS)("reads the role of '$key' as $role", ({ key, role }) => {
    expect(debateRoleFromCallSiteKey(key)).toBe(role);
  });

  it("is exercised for every role by at least one real key", () => {
    expect(new Set(KEYS.map((row) => row.role).filter((role) => role !== null))).toEqual(new Set(DEBATE_ROLES));
  });
});
