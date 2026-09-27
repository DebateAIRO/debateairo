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
 * A cross-exchange site uses one key; its marker is the pinned slot of the
 * member that wrote the root, so `:seat:runnerUp` is possible.
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

describe("A15 · fix round 1 — one marker at most, and only a real one at the end", () => {
  it.each(KEYS)("refuses to mark %s twice, whichever seats", (key) => {
    for (const first of CALL_SITE_SEATS) {
      for (const second of CALL_SITE_SEATS) {
        expect(() => seatCallSiteKey(seatCallSiteKey(key, first), second))
          .toThrowError(expect.objectContaining({ code: "CALL_SITE_SEAT_ALREADY_MARKED" }));
      }
    }
  });

  it("refuses the double suffix that would cost a root key its role", () => {
    expect(() => seatCallSiteKey("JUDGE:seat:main", "runnerUp"))
      .toThrowError(expect.objectContaining({ code: "CALL_SITE_SEAT_ALREADY_MARKED" }));
    expect(() => synthesisCallSiteKey({ role: "EVALUATOR", round: 1, seat: "main" })).not.toThrow();
  });

  // A panel key embeds its author's key, so `:seat:` can sit mid-string. Only a
  // TRAILING marker counts: mid-string, the key is bare and may still be marked.
  it.each([
    ["PANEL:JUDGE:seat:runnerUp:provider:x", "JUDGE"],
    ["PANEL:JUDGE:root:secondary:seat:main:provider:test-layer:secondary", "JUDGE"],
    [`JUDGE:review:${NODE}:seat:main:x`, "REVIEWER"]
  ] as const)("reads %s (':seat:' mid-string) as bare, and keeps its role when marked", (key, role) => {
    expect(seatOfCallSiteKey(key)).toBeNull();
    expect(seatBaseCallSiteKey(key)).toBe(key);
    expect(debateRoleFromCallSiteKey(key)).toBe(role);
    for (const seat of CALL_SITE_SEATS) {
      const marked = seatCallSiteKey(key, seat);
      expect(seatOfCallSiteKey(marked)).toBe(seat);
      expect(seatBaseCallSiteKey(marked)).toBe(key);
      expect(debateRoleFromCallSiteKey(marked)).toBe(role);
    }
  });

  it.each([
    "JUDGE:seat:backup",
    "JUDGE:seat:Main",
    "JUDGE:seat:RUNNERUP",
    "JUDGE:seat:",
    "JUDGE:root:secondary:seat:backup",
    "COMPOSER:SYNTHESIZER:INITIAL:1:seat:Main",
    "POST_COMPOSE_R9:EVALUATOR:1:seat:backup"
  ])("reads %s (not a seat this module names) as bare", (key) => {
    expect(seatOfCallSiteKey(key)).toBeNull();
    expect(seatBaseCallSiteKey(key)).toBe(key);
  });

  // The kernel's SEAT_SUFFIX and this module's CALL_SITE_SEATS must name the
  // SAME markers: the kernel's role of any key equals its role once the serve
  // package has stripped the marker. A kernel that also stripped `:seat:Main`
  // (or a serve side that accepted `:seat:backup`) would make a pair disagree.
  it.each([
    ...KEYS.flatMap(([key]) => [key, ...CALL_SITE_SEATS.map((seat) => seatCallSiteKey(key, seat))]),
    "JUDGE:seat:backup",
    "JUDGE:seat:Main",
    "JUDGE:root:secondary:seat:backup",
    "COMPOSER:SYNTHESIZER:INITIAL:1:seat:Main",
    "PANEL:JUDGE:seat:runnerUp:provider:x"
  ])("the kernel and the serve package agree on %s", (key) => {
    expect(debateRoleFromCallSiteKey(key)).toBe(debateRoleFromCallSiteKey(seatBaseCallSiteKey(key)));
  });

  it("an unrecognised marker is not stripped by the kernel either", () => {
    expect(debateRoleFromCallSiteKey("JUDGE:seat:backup")).toBeNull();
    expect(debateRoleFromCallSiteKey("JUDGE:seat:Main")).toBeNull();
    expect(debateRoleFromCallSiteKey("JUDGE:seat:main")).toBe("POSITION");
    expect(debateRoleFromCallSiteKey("JUDGE:seat:runnerUp")).toBe("POSITION");
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
