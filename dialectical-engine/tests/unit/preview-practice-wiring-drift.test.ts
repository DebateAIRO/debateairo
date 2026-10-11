// The preview practice tool mirrors two process entry points it cannot call: the runner's preview wiring
// (apps/runner/src/main.ts) and the API's preview ask settings (apps/api/src/main.ts). This test reads both sides and
// fails when the settings main.ts hands WalkingSkeletonRunner / PostgresAskApplication and the settings the practice
// hands them stop matching, so the practice can never silently test a different composition than the one shipped.
// A control proves the reader sees a missing key.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

/** Removes comments (line comments only where `//` starts a comment, not inside a string). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").split("\n").map((line) => {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
      if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

/** The text of the balanced group that opens at `open` (inclusive), skipping strings. */
function group(source: string, open: number): string {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (pairs[char] !== undefined) stack.push(pairs[char]!);
    else if (char === "}" || char === ")" || char === "]") {
      if (stack.pop() !== char) throw new Error("unbalanced source");
      if (stack.length === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error("unterminated group");
}

/**
 * The keys an object literal sets: its own top-level keys, plus the keys of every object a top-level conditional
 * spread `...(cond ? { a } : { b })` may add.
 */
export function objectKeys(objectText: string): Set<string> {
  const keys = new Set<string>();
  const body = objectText.slice(1, -1);
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quote !== null) { if (char === "\\") index += 1; else if (char === quote) quote = null; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (depth === 0 && body.startsWith("...(", index)) {
      const spread = group(body, index + 3);
      const inner = spread.slice(1, -1);
      let innerDepth = 0;
      for (let at = 0; at < inner.length; at += 1) {
        const c = inner[at]!;
        if (c === "{" && innerDepth === 0) { const object = group(inner, at); for (const key of objectKeys(object)) keys.add(key); at += object.length - 1; continue; }
        if (c === "(" || c === "[" || c === "{") innerDepth += 1;
        if (c === ")" || c === "]" || c === "}") innerDepth -= 1;
      }
      index += 3 + spread.length - 1;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") { depth += 1; continue; }
    if (char === "}" || char === ")" || char === "]") { depth -= 1; continue; }
    if (depth === 0) {
      // A key (`name:`), a shorthand property (`name,` or the last `name`) or a method (`name(...) {`).
      const match = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?::|,|$|\()/u.exec(body.slice(index));
      const before = index === 0 ? "," : body.slice(0, index).trimEnd().at(-1);
      if (match !== null && (before === "," || before === "{" || before === undefined)) {
        keys.add(match[1]!);
        index += match[0].length - (match[0].endsWith("(") ? 2 : 1);
      }
    }
  }
  return keys;
}

function objectAfter(source: string, anchor: string): Set<string> {
  const clean = withoutComments(source);
  const at = clean.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  return objectKeys(group(clean, clean.indexOf("{", at + anchor.length - 1)));
}

const RUNNER_MAIN = read("apps/runner/src/main.ts");
const PRACTICE_RUNNER = read("tools/preview-practice/practice-runner-composition.ts");
const API_MAIN = read("apps/api/src/main.ts");
const PRACTICE_ASK = read("tools/preview-practice/practice-ask-composition.ts");

/** Settings only a hosted (money-metered, billing) deployment passes; the preview is local mode. */
const HOSTED_ONLY_ASK_KEYS = new Set(["room", "waitingLine", "assertDailyCostEnvelope", "billing"]);

describe("the practice runs the shipped composition (drift guard)", () => {
  it("hands WalkingSkeletonRunner exactly the settings apps/runner/src/main.ts hands it", () => {
    const shipped = objectAfter(RUNNER_MAIN, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    const practice = objectAfter(PRACTICE_RUNNER, "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {");
    expect(shipped.size).toBeGreaterThan(30);
    expect([...practice].sort()).toEqual([...shipped].sort());
  });

  it("hands PostgresAskApplication every preview setting apps/api/src/main.ts hands it", () => {
    const shipped = objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {");
    const practice = objectAfter(PRACTICE_ASK, "const runSettings: RunCreationSettings = {");
    expect(shipped.has("previewBudgetGate")).toBe(true);
    expect([...practice].sort()).toEqual([...shipped].filter((key) => !HOSTED_ONLY_ASK_KEYS.has(key)).sort());
  });

  it("the gateway is wrapped by the preview call policy on both sides, over the guarded fetch", () => {
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      expect(source).toContain("withPreviewProviderCallPolicy(gateway, previewConfig, target");
      expect(source).toContain("...previewTargetGatewayControls(previewConfig, target)");
      expect(source).toContain("...providerTargetGatewayControls(target)");
      expect(source).toContain("createPreviewGuardedFetch(");
    }
    for (const source of [API_MAIN, PRACTICE_ASK]) {
      expect(source).toMatch(/probeControlsFor: previewProbeControls, fetchImplementation: previewFetch!?, previewRound: true/u);
      expect(source).toContain("readPreviewBudgetGateSettings(pool,");
    }
  });

  it("control: the reader sees a key that is missing", () => {
    const shipped = objectKeys("{ a: 1, ...(x ? {} : { b: 2, c: { d: 3 } }), e: f(g, { h: 1 }), m(n: string) { return { o: n }; }, i }");
    expect([...shipped].sort()).toEqual(["a", "b", "c", "e", "i", "m"]);
    // And on the real files: the practice without one of its settings no longer matches main.ts.
    const anchor = "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {";
    const trimmed = objectAfter(PRACTICE_RUNNER.replace("bodyCostFallback: false,", ""), anchor);
    expect(trimmed.has("bodyCostFallback")).toBe(false);
    expect(objectAfter(RUNNER_MAIN, anchor).has("bodyCostFallback")).toBe(true);
    expect(objectAfter(API_MAIN, "new PostgresAskApplication(pool, dispatcher, {").has("resolveRisk")).toBe(true);
    expect(objectKeys("{ resolveRisk(a: string, b: string) { return { c: a }; } }")).toEqual(new Set(["resolveRisk"]));
  });
});
