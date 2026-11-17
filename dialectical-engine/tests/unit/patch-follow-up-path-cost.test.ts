import { describe, expect, it } from "vitest";
import { isPatchPath, schemaFailurePaths } from "@debateai/providers";
import { isPatchPathList } from "../../packages/providers/src/prompt-frame.js";

/**
 * NV-37 (security audit run 3): `schemaFailurePaths` read a refusal's paths with an all-pairs dedupe and an all-pairs
 * outermost filter BEFORE the 8-path cap, so a refused reply naming d distinct paths cost O(d²) synchronous work on
 * the runner loop that 8 debates share. The map merge arrays have no maximum, and every `{}` element yields three
 * distinct paths. The fix is exact: a Set for the dedupe and each path's at most seven dot-prefixes looked up in it.
 *
 * No wall-clock assertion (the test host is heavily loaded): the step count below is the proxy. It counts every
 * `String.prototype.startsWith` call and weights `Array.prototype.includes`, `some` and `indexOf` by `this.length`,
 * so a later quadratic rewrite through any of them is seen too.
 */
function countPairwiseWork<T>(run: () => T): { result: T; steps: number } {
  let steps = 0;
  const startsWith = String.prototype.startsWith;
  const includes = Array.prototype.includes;
  const some = Array.prototype.some;
  const indexOf = Array.prototype.indexOf;
  const weighted = (original: (...args: never[]) => unknown) =>
    function (this: readonly unknown[], ...args: unknown[]): never {
      steps += this.length;
      return Reflect.apply(original, this, args) as never;
    };
  String.prototype.startsWith = function (this: string, ...args: Parameters<string["startsWith"]>): boolean {
    steps += 1;
    return Reflect.apply(startsWith, this, args) as boolean;
  };
  Array.prototype.includes = weighted(includes);
  Array.prototype.some = weighted(some);
  Array.prototype.indexOf = weighted(indexOf);
  try {
    const result = run();
    return { result, steps };
  } finally {
    String.prototype.startsWith = startsWith;
    Array.prototype.includes = includes;
    Array.prototype.some = some;
    Array.prototype.indexOf = indexOf;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A verbatim copy of `schemaFailurePaths` before NV-37: the reference the exact-semantics check compares against. */
function referencePaths(parseError: string): readonly string[] | null {
  let raw: (readonly unknown[])[];
  try {
    const issues = JSON.parse(parseError) as unknown;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    raw = [];
    for (const issue of issues) {
      const path = isPlainObject(issue) ? issue.path : undefined;
      if (!Array.isArray(path)) return null;
      raw.push(path);
    }
  } catch {
    const text = parseError.trim();
    if (!/^[A-Za-z_]+@[A-Za-z0-9_.$]{1,200}(?:,[A-Za-z_]+@[A-Za-z0-9_.$]{1,200})*$/u.test(text)) return null;
    raw = text.split(",").map((entry) => {
      const path = entry.slice(entry.indexOf("@") + 1);
      return path === "$" ? [] : path.split(".");
    });
  }
  const paths: string[] = [];
  for (const segments of raw) {
    if (segments.length === 0) return null;
    const path = segments.map((segment) => String(segment)).join(".");
    if (!segments.every((segment) => typeof segment === "string" || (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0))
      || !isPatchPath(path)) return null;
    if (!paths.includes(path)) paths.push(path);
  }
  const outermost = paths.filter((path) => !paths.some((other) => other !== path && path.startsWith(`${other}.`)));
  return isPatchPathList(outermost) ? Object.freeze(outermost) : null;
}

/** The map merge's worst shape: one issue per `{}` element's member, every path a distinct leaf. */
const LONG_REFUSAL = JSON.stringify(Array.from({ length: 2_000 }, (_, index) => ({
  code: "invalid_type",
  path: ["key_points", index, "claim"],
  message: "SCHEMA_FAILED"
})));

describe("NV-37: patch follow-up path extraction cost", () => {
  it("path extraction does linear work for a long refusal", () => {
    const { result, steps } = countPairwiseWork(() => schemaFailurePaths(LONG_REFUSAL));
    expect(result).toBeNull();
    expect(steps).toBeLessThanOrEqual(16 * 2_000);
  });

  it("the step counter sees the quadratic work of the pre-fix extraction (positive control)", () => {
    const { result, steps } = countPairwiseWork(() => referencePaths(LONG_REFUSAL));
    expect(result).toBeNull();
    expect(steps).toBeGreaterThanOrEqual((2_000 * 1_999) / 2);
  });
});

/** mulberry32: a small seeded PRNG, so the generated refusals are the same on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Segments include plain string prefixes of each other ("a"/"aa"/"ab") and one JSON segment holding a dot ("a.b"). */
const ALPHABET: readonly (string | number)[] = ["a", "b", "c", "0", "1", "x_y", 0, 1, "ab", "aa", "a.b"];
const BAD_SEGMENTS: readonly (string | number)[] = ["__proto__", "a-b", -1, 1.5, "z".repeat(41)];

type GeneratedIssue = { readonly kind: "path"; readonly path: readonly (string | number)[] } | { readonly kind: "no-array" } | { readonly kind: "no-object" };

function generateRefusal(random: () => number): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const count = 1 + Math.floor(random() * 14);
  const issues: GeneratedIssue[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = random();
    const existing = issues.filter((issue): issue is Extract<GeneratedIssue, { kind: "path" }> => issue.kind === "path");
    let issue: GeneratedIssue;
    if (roll < 0.01) issue = { kind: "path", path: [] };
    else if (roll < 0.015) issue = { kind: "no-array" };
    else if (roll < 0.02) issue = { kind: "no-object" };
    else if (roll < 0.035) {
      const path = Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(ALPHABET));
      path[Math.floor(random() * path.length)] = pick(BAD_SEGMENTS);
      issue = { kind: "path", path };
    } else if (roll < 0.25 && existing.length > 0) {
      issue = { kind: "path", path: [...pick(existing).path] };
    } else if (roll < 0.5 && existing.some((candidate) => candidate.path.length > 1)) {
      const longer = pick(existing.filter((candidate) => candidate.path.length > 1));
      issue = { kind: "path", path: longer.path.slice(0, 1 + Math.floor(random() * (longer.path.length - 1))) };
    } else {
      issue = { kind: "path", path: Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(ALPHABET)) };
    }
    // An ancestor or a duplicate lands before or after the issue it was drawn from.
    issues.splice(Math.floor(random() * (issues.length + 1)), 0, issue);
  }
  if (random() < 0.5) {
    return JSON.stringify(issues.map((issue) => issue.kind === "path"
      ? { code: "invalid_type", path: issue.path, message: "x" }
      : issue.kind === "no-array" ? { code: "invalid_type", path: "a", message: "x" } : "invalid_type"));
  }
  return issues.map((issue) => issue.kind === "path"
    ? `invalid_type@${issue.path.length === 0 ? "$" : issue.path.map(String).join(".")}`
    : issue.kind === "no-array" ? "invalid_type@" : "invalid_type").join(",");
}

describe("NV-37: the linear extraction returns exactly what the pre-fix one did", () => {
  it.each([
    ["20 paths under a, then a (why there is no early null at the 9th distinct path)", JSON.stringify([
      ...Array.from({ length: 20 }, (_, index) => ({ code: "invalid_type", path: ["a", index], message: "x" })),
      { code: "invalid_type", path: ["a"], message: "x" }
    ]), ["a"]],
    ["9 distinct top-level paths", JSON.stringify(Array.from({ length: 9 }, (_, index) => ({ path: [`k${String(index)}`] }))), null],
    ["a descendant before its ancestor, and a repeat", "invalid_type@criteria.restatement,invalid_type@criteria,invalid_type@criteria", ["criteria"]]
  ])("%s", (_name, parseError, expected) => {
    expect(referencePaths(parseError)).toEqual(expected);
    expect(schemaFailurePaths(parseError)).toEqual(expected);
  });

  it("agrees with the reference on 3,000 seeded refusals", () => {
    const random = mulberry32(0x37);
    let nonNull = 0;
    let multiPath = 0;
    for (let index = 0; index < 3_000; index += 1) {
      const parseError = generateRefusal(random);
      const expected = referencePaths(parseError);
      expect(schemaFailurePaths(parseError), parseError).toEqual(expected);
      if (expected !== null) nonNull += 1;
      if (expected !== null && expected.length > 1) multiPath += 1;
    }
    // The generator reaches the interesting cases, not only nulls.
    expect(nonNull).toBeGreaterThan(1_000);
    expect(multiPath).toBeGreaterThan(500);
  });
});
