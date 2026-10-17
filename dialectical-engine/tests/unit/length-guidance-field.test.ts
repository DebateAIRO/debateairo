import { describe, expect, it } from "vitest";
import {
  LENGTH_ALLOWANCE_LIMITS, LENGTH_FIELD, LENGTH_GUIDANCE_START, LENGTH_SENTENCE_ANSWER_CHECKER, LENGTH_SENTENCE_PARTS,
  LENGTH_SENTENCE_WRITING, guidedAllowanceTokens, lengthCharacterLanguageOf, lengthGuidanceField, lengthGuidancePartsField,
  lengthGuidanceText, lengthGuideForBounds
} from "@debateai/kernel";

const CPW = LENGTH_GUIDANCE_START.charactersPerWord;

describe("the length field (spec §3.2, ruling L2)", () => {
  it("names words for every language except zh, ja and th", () => {
    for (const tag of [null, "ro", "en-GB", "und", "zho", "", "Chinese"]) {
      expect(lengthGuidanceText(250, tag, CPW), String(tag)).toBe("about 250 words");
    }
  });

  it("names characters for zh, ja and th, by the tag's primary subtag", () => {
    expect(lengthGuidanceText(700, "zh", CPW)).toBe("about 1120 characters");
    expect(lengthGuidanceText(700, "zh-Hant", CPW)).toBe("about 1120 characters");
    expect(lengthGuidanceText(700, "ZH", CPW)).toBe("about 1120 characters");
    expect(lengthGuidanceText(700, "zh_CN", CPW)).toBe("about 1120 characters");
    expect(lengthGuidanceText(700, "ja-JP", CPW)).toBe("about 1400 characters");
    expect(lengthGuidanceText(35, "th", CPW)).toBe("about 175 characters");
    expect(lengthCharacterLanguageOf("ja")).toBe("ja");
    expect(lengthCharacterLanguageOf(undefined)).toBeNull();
  });

  it("refuses a target that is not a positive whole number", () => {
    for (const words of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => lengthGuidanceText(words, null, CPW), String(words)).toThrowError(new TypeError("LENGTH_FIELD_INVALID"));
    }
    expect(() => lengthGuidanceText(10, "zh", { zh: 0, ja: 2, th: 5 })).toThrowError(new TypeError("LENGTH_FIELD_INVALID"));
  });

  it("builds the one-target field and the parts field", () => {
    expect(lengthGuidanceField(120, null, CPW)).toEqual({ name: LENGTH_FIELD, content: "about 120 words" });
    expect(lengthGuidancePartsField([{ key: "claim", words: 35 }, { key: "why_it_matters", words: 35 }], "ro", CPW).content)
      .toBe("claim: about 35 words\nwhy_it_matters: about 35 words");
    for (const parts of [[], [{ key: "Claim", words: 35 }], [{ key: "claim", words: 35 }, { key: "claim", words: 20 }]]) {
      expect(() => lengthGuidancePartsField(parts, null, CPW), JSON.stringify(parts)).toThrowError(new TypeError("LENGTH_FIELD_INVALID"));
    }
  });

  it("the sentences carry no number, and the bound guide makes the longest field any row can", () => {
    for (const sentence of [LENGTH_SENTENCE_WRITING, LENGTH_SENTENCE_PARTS, LENGTH_SENTENCE_ANSWER_CHECKER]) {
      expect(sentence).not.toMatch(/\d/u);
    }
    const bound = lengthGuideForBounds();
    expect(lengthGuidanceText(bound.words, bound.languageCode, bound.charactersPerWord)).toBe("about 50000 characters");
  });
});

describe("the allowance (spec §3.3, rulings L4, L8)", () => {
  const cap = LENGTH_ALLOWANCE_LIMITS.capTokens;
  it("is the guided sum when larger than today's, today's otherwise, the raise clamped to the cap and a slow ceiling", () => {
    expect(cap).toBe(32768);
    expect(guidedAllowanceTokens({ todayTokens: 8192, thinkingRoomTokens: 6144, answerRoomTokens: 3000, capTokens: cap })).toBe(9144);
    expect(guidedAllowanceTokens({ todayTokens: 8192, thinkingRoomTokens: 2048, answerRoomTokens: 1800, capTokens: cap })).toBe(8192);
    expect(guidedAllowanceTokens({ todayTokens: 8192, thinkingRoomTokens: 16384, answerRoomTokens: 18000, capTokens: cap })).toBe(32768);
    expect(guidedAllowanceTokens({ todayTokens: 8192, thinkingRoomTokens: 16384, answerRoomTokens: 18000, capTokens: cap,
      slowCeilingTokens: 16384 })).toBe(16384);
  });

  it("never lowers today's bound, even one above the cap", () => {
    expect(guidedAllowanceTokens({ todayTokens: 65536, thinkingRoomTokens: 1, answerRoomTokens: 1, capTokens: cap })).toBe(65536);
  });

  it("refuses a nonsense input", () => {
    for (const input of [
      { todayTokens: 0, thinkingRoomTokens: 1, answerRoomTokens: 1, capTokens: cap },
      { todayTokens: 1, thinkingRoomTokens: -1, answerRoomTokens: 1, capTokens: cap },
      { todayTokens: 1, thinkingRoomTokens: 1, answerRoomTokens: 1.5, capTokens: cap },
      { todayTokens: 1, thinkingRoomTokens: 1, answerRoomTokens: 1, capTokens: cap, slowCeilingTokens: 0 }
    ]) {
      expect(() => guidedAllowanceTokens(input), JSON.stringify(input)).toThrowError(new TypeError("LENGTH_ALLOWANCE_INPUT_INVALID"));
    }
  });
});
