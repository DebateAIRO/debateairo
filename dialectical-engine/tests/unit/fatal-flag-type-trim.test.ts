import { describe, expect, it } from "vitest";
import { judgeAssessmentSchema } from "@debateai/judgement";

/**
 * NV-35 (security audit run 3). `normaliseFatalFlagType` trimmed the folded type's edge "_"/"-" with a global regex
 * whose second alternative is an end-anchored run, and it cut to 64 characters only afterwards. On a long interior
 * "-"/"_" run every start position rescans the run (CodeQL js/polynomial-redos), so the time is quadratic in a string the
 * judge model writes. The edge trim is now an index loop; the result must be exactly what the regex gave.
 */
const FATAL_FLAG_TYPE_SHAPE = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const FATAL_FLAG_TYPE_MAX_CHARS = 64;
const OLD_EDGE_TRIM_SOURCE = "^[_-]+|[_-]+$";

/** A verbatim copy of `normaliseFatalFlagType` as it was before NV-35: the reference for the exact result. */
function referenceNormalise(raw: string): string {
  const folded = raw.trim().normalize("NFKD").replace(/\p{M}/gu, "");
  const identifier = folded.replace(/[^A-Za-z0-9_-]+/gu, "_").replace(/^[_-]+|[_-]+$/gu, "");
  if (identifier === "") return "";
  const lettered = FATAL_FLAG_TYPE_SHAPE.test(identifier) ? identifier : `flag_${identifier}`;
  return lettered.slice(0, FATAL_FLAG_TYPE_MAX_CHARS).replace(/_+$/u, "");
}

type ReplaceCall = { readonly source: string; readonly length: number };

/** Records the source and input length of every regex replace that `run` makes, then restores the original. */
function recordRegexReplaces<T>(run: () => T): { readonly result: T; readonly calls: readonly ReplaceCall[] } {
  const calls: ReplaceCall[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, Symbol.replace);
  const original: unknown = RegExp.prototype[Symbol.replace];
  if (descriptor === undefined || typeof original !== "function") throw new TypeError("RegExp.prototype[Symbol.replace] is missing");
  Object.defineProperty(RegExp.prototype, Symbol.replace, {
    configurable: true,
    writable: true,
    value: function recordedReplace(this: RegExp, input: unknown, ...rest: unknown[]): unknown {
      calls.push({ source: this.source, length: String(input).length });
      return Reflect.apply(original, this, [input, ...rest]);
    }
  });
  try {
    return { result: run(), calls };
  } finally {
    Object.defineProperty(RegExp.prototype, Symbol.replace, descriptor);
  }
}

function assessment(type: string): unknown {
  return {
    steelman: { summary: "s", fidelity: 0.5 },
    critic: { summary: "c", counterargumentStrength: 0.5, basis: "REAL_ATTACK" },
    evidence: { quality: 0.5, relevance: 0.5 },
    context: { fit: 0.5, ambiguityFlags: [] },
    fallacy: { severity: 0.5, fatalFlags: [{ type, severity: 0.5, description: "d" }] }
  };
}

const endAnchoredRun = (call: ReplaceCall): boolean => /[+*]\$/u.test(call.source);
const LONG_INTERIOR_RUN = `a${"-".repeat(2_000)}b`;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("NV-35 — a judge's fatal-flag type is folded without a quadratic edge trim", () => {
  it("no end-anchored run regex reads more than 64 characters of a fatal-flag type", () => {
    const { result: parsed, calls } = recordRegexReplaces(() => judgeAssessmentSchema.safeParse(assessment(LONG_INTERIOR_RUN)));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.fallacy.fatalFlags[0]?.type).toBe(`a${"-".repeat(63)}`);
    // Control: the recorder saw this function's fold.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.source === "[^A-Za-z0-9_-]+")).toBe(true);
    expect(calls.filter((call) => endAnchoredRun(call) && call.length > FATAL_FLAG_TYPE_MAX_CHARS)).toEqual([]);
    expect(calls.map((call) => call.source)).not.toContain(OLD_EDGE_TRIM_SOURCE);
  });

  it("the recorder sees the old edge trim's long end-anchored read (positive control)", () => {
    const { result, calls } = recordRegexReplaces(() => referenceNormalise(LONG_INTERIOR_RUN));
    expect(result).toBe(`a${"-".repeat(63)}`);
    expect(calls.filter((call) => endAnchoredRun(call) && call.length > FATAL_FLAG_TYPE_MAX_CHARS)).toEqual([
      { source: OLD_EDGE_TRIM_SOURCE, length: LONG_INTERIOR_RUN.length }
    ]);
  });

  it("folds every type exactly as the old regex trim did", () => {
    const alphabet = ["a", "Z", "9", "_", "-", " ", ".", "(", "é", "ș", "\u{301}", "ß", "—", "İ"] as const;
    const next = mulberry32(0x35);
    const cases: string[] = [
      "", "   ", "___", "-_-", "__ad hominem__", "9 lives", "false dichotomy", `a${"_".repeat(70)}`,
      `${"_".repeat(70)}b`, "x".repeat(80), `ab${"-".repeat(100)}`
    ];
    for (let index = 0; index < 2_000; index += 1) {
      const length = Math.floor(next() * 91);
      let text = "";
      for (let at = 0; at < length; at += 1) text += alphabet[Math.floor(next() * alphabet.length)] ?? "";
      cases.push(text);
    }
    const mismatches: { readonly input: string; readonly expected: string; readonly actual: string | null }[] = [];
    for (const input of cases) {
      const expected = referenceNormalise(input);
      const parsed = judgeAssessmentSchema.safeParse(assessment(input));
      const actual = parsed.success ? (parsed.data.fallacy.fatalFlags[0]?.type ?? null) : null;
      if (expected === "" ? parsed.success : actual !== expected) mismatches.push({ input, expected, actual });
    }
    expect(mismatches).toEqual([]);
  });
});
