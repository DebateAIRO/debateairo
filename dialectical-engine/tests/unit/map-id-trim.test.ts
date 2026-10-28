import { describe, expect, it } from "vitest";
import { MAP_LIMITS, mapMergeSalvage } from "@debateai/map";

/**
 * NV-36 (security audit run 3). `normalisedMapId` trimmed the folded id's edge "-" with a global regex whose second
 * alternative is an end-anchored run, and it cut to `MAP_LIMITS.idMaxChars` only afterwards. On a long interior "-" run
 * every start position rescans the run (CodeQL js/polynomial-redos), so the time is quadratic in an id the map model
 * writes. The edge trim is now an index loop; the id must be exactly what the regex gave.
 */

/** A verbatim copy of `normalisedMapId` as it was before NV-36: the reference for the exact result. */
function referenceMapId(id: string): string {
  const normalised = id.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, MAP_LIMITS.idMaxChars);
  return normalised === "" ? id : normalised;
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

function mergeReply(keyPointId: string): unknown {
  return { key_points: [{ key_point_id: keyPointId, claim: "x", member_item_ids: ["p1"] }], answers: [] };
}

/** The salvaged reply's first key point id (the salvage's value is `unknown`). */
function firstKeyPointId(value: unknown): unknown {
  return (value as { readonly key_points: readonly { readonly key_point_id: unknown }[] }).key_points[0]?.key_point_id;
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

describe("NV-36 — a map id is normalised without a quadratic edge trim", () => {
  it("no end-anchored run regex reads more than idMaxChars of a map id", () => {
    const { result: salvaged, calls } = recordRegexReplaces(() => mapMergeSalvage.decoded(mergeReply(LONG_INTERIOR_RUN)));
    expect(salvaged.repairs).toContain("MAP_IDS_NORMALISED");
    expect(firstKeyPointId(salvaged.value)).toBe(`a${"-".repeat(23)}`);
    // Control: the recorder saw this function's fold.
    expect(calls.some((call) => call.source === "[^a-z0-9-]+")).toBe(true);
    expect(calls.filter((call) => endAnchoredRun(call) && call.length > MAP_LIMITS.idMaxChars)).toEqual([]);
  });

  it("positive control: the old chain is caught by the same recorder", () => {
    const { result, calls } = recordRegexReplaces(() => referenceMapId(LONG_INTERIOR_RUN));
    expect(result).toBe(`a${"-".repeat(23)}`);
    expect(calls.some((call) => endAnchoredRun(call) && call.length > MAP_LIMITS.idMaxChars)).toBe(true);
  });

  it("gives exactly the old id for every input, and notes MAP_IDS_NORMALISED exactly when the id changes", () => {
    const alphabet = ["a", "K", "7", "-", "_", " ", ".", "ț", "ß", "\u{301}", "?", "İ", "—"];
    const random = mulberry32(0x36);
    const ids: string[] = [
      "???", "---", "-kp-1-", "KP_1", "specific-CEE-comparatie", `a${"-".repeat(100)}b`, `${"-".repeat(30)}x`, "x".repeat(40)
    ];
    for (let index = 0; index < 2_000; index += 1) {
      const length = Math.floor(random() * 81);
      let id = "";
      for (let at = 0; at < length; at += 1) id += alphabet[Math.floor(random() * alphabet.length)] ?? "";
      ids.push(id);
    }
    for (const id of ids) {
      const expected = referenceMapId(id);
      const salvaged = mapMergeSalvage.decoded(mergeReply(id));
      expect(firstKeyPointId(salvaged.value), JSON.stringify(id)).toBe(expected);
      expect(salvaged.repairs.includes("MAP_IDS_NORMALISED"), JSON.stringify(id)).toBe(expected !== id);
    }
  });
});
