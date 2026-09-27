import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, debateRoleFromCallSiteKey, type DebateRole } from "@debateai/kernel";
import {
  CALL_SITE_SEATS,
  acceptedSynthesisCallSiteKeys,
  seatBaseCallSiteKey,
  seatCallSiteKey,
  seatOfCallSiteKey,
  synthesisCallSiteKey
} from "@debateai/serve";

/**
 * Model scorecard A15 — a run with a pinned assignment records every model
 * call under `<key>:seat:<main|runnerUp>`. The marker is a SUFFIX so every
 * prefix reader keeps matching; this file proves that against the readers
 * themselves (0049's SQL is read from the migration, not restated).
 *
 * The cross-exchange rows go through BOTH seats only to prove these functions
 * and readers are seat-blind. A cross-exchange author site has no runner-up
 * (DR-184-v5 bills it no backup; its seat is built with `runnerUp: null`), so
 * a recorded cross-exchange key only ever ends in `:seat:main`.
 */
const NODE = "0f4d7c1e-2b8a-4c3d-9e5f-a1b2c3d4e5f6";
const INVOCATION = "11111111-2222-4333-8444-555555555555";
const KEYS: readonly (readonly [string, DebateRole])[] = [
  ["JUDGE", "POSITION"],
  ["JUDGE:root:secondary", "POSITION"],
  ["JUDGE:root:2", "POSITION"],
  ["JUDGE:defender:root0:r1:p0", "SUPPORT_ATTACK"],
  ["JUDGE:critic:root1:r2:p5", "SUPPORT_ATTACK"],
  ["JUDGE:cross-root:0->1", "CROSS_EXCHANGE"],
  ["PANEL:root:provider:test-layer", "JUDGE"],
  ["PANEL:JUDGE:root:secondary:provider:test-layer:secondary", "JUDGE"],
  [`JUDGE:review:${NODE}`, "REVIEWER"],
  [`JUDGE:review:catch-up:${INVOCATION}:${NODE}`, "REVIEWER"],
  ["COMPOSER:SYNTHESIZER:INITIAL:1", "ANSWER_WRITER"],
  ["COMPOSER:SYNTHESIZER:RETRY:2", "ANSWER_WRITER"],
  ["POST_COMPOSE_R9:EVALUATOR:3", "ANSWER_CHECKER"]
];

/** SQL LIKE as an anchored RegExp (`%` any run, `_` any one character). */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/%/gu, ".*").replace(/_/gu, ".");
  return new RegExp(`^${escaped}$`, "u");
}

describe("A15 · the seat marker", () => {
  it("names both seats and nothing else", () => {
    expect(CALL_SITE_SEATS).toEqual(["main", "runnerUp"]);
  });

  it.each(KEYS)("round-trips %s through both seats", (key) => {
    expect(seatOfCallSiteKey(key)).toBeNull();
    expect(seatBaseCallSiteKey(key)).toBe(key);
    for (const seat of CALL_SITE_SEATS) {
      const marked = seatCallSiteKey(key, seat);
      expect(marked).toBe(`${key}:seat:${seat}`);
      expect(seatOfCallSiteKey(marked)).toBe(seat);
      expect(seatBaseCallSiteKey(marked)).toBe(key);
    }
  });

  it("covers every debate role in the key catalogue", () => {
    expect(new Set(KEYS.map(([, role]) => role))).toEqual(new Set(DEBATE_ROLES));
  });

  it.each(KEYS)("keeps the kernel's role for %s whatever the seat", (key, role) => {
    expect(debateRoleFromCallSiteKey(key)).toBe(role);
    for (const seat of CALL_SITE_SEATS) expect(debateRoleFromCallSiteKey(seatCallSiteKey(key, seat))).toBe(role);
  });
});

describe("A15 · the synthesis key builder learns the seat, and the role stays a predicate", () => {
  it("appends the marker only when a seat is named", () => {
    expect(synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 })).toBe("COMPOSER:SYNTHESIZER:INITIAL:1");
    expect(synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "RETRY", round: 2, seat: "runnerUp" }))
      .toBe("COMPOSER:SYNTHESIZER:RETRY:2:seat:runnerUp");
    expect(synthesisCallSiteKey({ role: "EVALUATOR", round: 3, seat: "main" })).toBe("POST_COMPOSE_R9:EVALUATOR:3:seat:main");
  });

  it("accepts a round's bare key and its two seat forms, never the other role's", () => {
    const writer = acceptedSynthesisCallSiteKeys({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 });
    const checker = acceptedSynthesisCallSiteKeys({ role: "EVALUATOR", round: 1 });
    expect(writer).toEqual([
      "COMPOSER:SYNTHESIZER:INITIAL:1",
      "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main",
      "COMPOSER:SYNTHESIZER:INITIAL:1:seat:runnerUp"
    ]);
    expect(checker).toEqual([
      "POST_COMPOSE_R9:EVALUATOR:1",
      "POST_COMPOSE_R9:EVALUATOR:1:seat:main",
      "POST_COMPOSE_R9:EVALUATOR:1:seat:runnerUp"
    ]);
    expect(writer.some((key) => checker.includes(key))).toBe(false);
    // A seat named on the binding does not widen what is accepted.
    expect(acceptedSynthesisCallSiteKeys({ role: "EVALUATOR", round: 1, seat: "runnerUp" })).toEqual(checker);
  });
});

describe("A15 · every prefix consumer still matches a seat-marked key", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../../migrations/0049_terminal_recorded_facts.sql", import.meta.url)),
    "utf8"
  );
  const likes = [...migration.matchAll(/call_site_key LIKE '([^']+)'/gu)].map((match) => match[1]!);

  it("reads 0049's own LIKE patterns", () => {
    expect(likes).toEqual(["COMPOSER:%", "CONFORMANCE:%", "POST_COMPOSE_R9:%"]);
  });

  it("counts a seat-marked writer as composer_calls and a seat-marked checker as r9_calls", () => {
    for (const seat of CALL_SITE_SEATS) {
      const writer = synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1, seat });
      const checker = synthesisCallSiteKey({ role: "EVALUATOR", round: 1, seat });
      expect(likeToRegExp("COMPOSER:%").test(writer)).toBe(true);
      expect(likeToRegExp("POST_COMPOSE_R9:%").test(checker)).toBe(true);
      expect(likeToRegExp("COMPOSER:%").test(checker)).toBe(false);
      expect(likeToRegExp("POST_COMPOSE_R9:%").test(writer)).toBe(false);
    }
  });

  it("does NOT count a seat-marked root under 0049's exact judge_calls key (documented: no predicate reads it)", () => {
    expect(migration).toContain("entry.call_site_key='JUDGE'");
    expect(seatCallSiteKey("JUDGE", "main")).not.toBe("JUDGE");
    const terminal = readFileSync(fileURLToPath(new URL("../../packages/battery/src/terminal.ts", import.meta.url)), "utf8");
    // judge_calls is read into the facts and consumed by no predicate.
    expect(terminal.split("judgeCallCount").length - 1).toBe(2);
  });

  it.each([
    ["JUDGE:%:root%:r%", "JUDGE:defender:root0:r1:p0"],
    ["JUDGE:%:root%:r1:p%", "JUDGE:critic:root1:r1:p3"],
    ["JUDGE:cross-root:%", "JUDGE:cross-root:1->0"],
    ["JUDGE:review:%", `JUDGE:review:${NODE}`],
    ["PANEL:%", "PANEL:root:provider:test-layer"],
    ["JUDGE:%", "JUDGE:root:secondary"]
  ] as const)("%s still matches %s under both seats", (pattern, key) => {
    for (const seat of CALL_SITE_SEATS) expect(likeToRegExp(pattern).test(seatCallSiteKey(key, seat))).toBe(true);
  });
});
