import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeModelJson, type ModelJsonDecoded } from "@debateai/providers";

/**
 * Story format robustness (2026-10-12): the tolerant decode the two story sites use. In order it accepts
 * (i) strict JSON, (ii) the body of one code fence, (iii) the last complete top-level object when prose
 * stands around it, (iv) a straight double quote inside a string VALUE that cannot be the string's end
 * read as an escaped one, (v) only for a reply that finished normally, the closing brackets missing at
 * the very end. Nothing else is ever repaired, and a reply cut off at its token ceiling is never repaired.
 * The replies under tests/support/fixtures/story-format-replies are real preview replies (practice run
 * 2026-10-12, formats mode): our own practice text, no secret.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`../support/fixtures/story-format-replies/${name}`, import.meta.url), "utf8");
const STOP = Object.freeze({ finishReason: "stop" });
const LENGTH = Object.freeze({ finishReason: "length" });

function accepted(result: ModelJsonDecoded): { value: unknown; repair: string | null } {
  if (!result.ok) throw new Error(`expected a decoded value, got ${result.error}`);
  return { value: result.value, repair: result.repair };
}

describe("decodeModelJson — what it accepts, in order", () => {
  it("(i) strict JSON needs no repair", () => {
    expect(decodeModelJson("{\"a\":1}")).toEqual({ ok: true, value: { a: 1 }, repair: null });
    expect(decodeModelJson("  {\"a\":[1,2]}\n", STOP)).toEqual({ ok: true, value: { a: [1, 2] }, repair: null });
  });

  it("(ii) the body of one code fence", () => {
    expect(accepted(decodeModelJson("```json\n{\"a\":1}\n```"))).toEqual({ value: { a: 1 }, repair: "CODE_FENCE" });
    expect(accepted(decodeModelJson("```\n{\"a\":1}\n```", STOP))).toEqual({ value: { a: 1 }, repair: "CODE_FENCE" });
  });

  it("(iii) the real DeepSeek checker reply: its reasoning in prose, then the JSON verdict", () => {
    const reply = fixture("deepseek-checker-en-prose-then-json.txt");
    expect(() => JSON.parse(reply)).toThrow();
    const { value, repair } = accepted(decodeModelJson(reply, STOP));
    expect(repair).toBe("OUTERMOST_OBJECT");
    expect(value).toMatchObject({ satisfied: false });
    expect(Object.keys(value as object)).toEqual(["satisfied", "objection"]);
  });

  it("(iii) picks the LAST complete top-level object, the whole of it, reading strings as strings", () => {
    expect(accepted(decodeModelJson("First {\"a\":1}, then {\"b\":{\"c\":2}}."))).toEqual({ value: { b: { c: 2 } }, repair: "OUTERMOST_OBJECT" });
    // A brace inside a string does not end the object; prose braces that are not JSON are skipped.
    expect(accepted(decodeModelJson("Verdict: {\"a\":\"} and {\"} — see {this}."))).toEqual({ value: { a: "} and {" }, repair: "OUTERMOST_OBJECT" });
    // Never a nested object on its own: the inner object belongs to the outer one.
    expect(accepted(decodeModelJson("x {\"outer\":{\"inner\":1}} y"))).toEqual({ value: { outer: { inner: 1 } }, repair: "OUTERMOST_OBJECT" });
  });

  it("(iii) a reply that itself opens with an object keeps that object: only the prose after it is dropped", () => {
    expect(accepted(decodeModelJson("{\"a\":1}\nThat is my verdict."))).toEqual({ value: { a: 1 }, repair: "OUTERMOST_OBJECT" });
    // Its own object, even when it cannot be read: a member object found further on is never taken instead.
    expect(decodeModelJson("{\"o\": \"x\" y, \"c\": {\"k\": true}}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\"o\": \"x\" y\" } {\"k\": true}").ok).toBe(false);
  });

  it("(iv) the real MiMo checker reply: a Romanian quote opened with „ and closed with a straight quote", () => {
    const reply = fixture("mimo-checker-ro-straight-quote.txt");
    expect(() => JSON.parse(reply)).toThrow(/after property value/u);
    const { value, repair } = accepted(decodeModelJson(reply, STOP));
    expect(repair).toBe("INNER_QUOTE");
    const verdict = value as { satisfied: boolean; objection: string; criteria: Record<string, boolean> };
    expect(verdict.satisfied).toBe(false);
    expect(verdict.objection).toContain("Titlul „The position held up, with one open question.\" prezintă");
    expect(verdict.objection).toContain("„Our reading.\", „The verdict.\" și „What would change it.\", fără");
    expect(verdict.objection.endsWith("română.")).toBe(true);
    expect(Object.keys(verdict.criteria)).toHaveLength(8);
  });

  it("(iv) a straight quote that can end the value still ends it, and a key is never repaired", () => {
    expect(accepted(decodeModelJson("{\"o\": \"the headline \"Held up\" overstates\", \"n\": 1}"))).toEqual({
      value: { o: "the headline \"Held up\" overstates", n: 1 }, repair: "INNER_QUOTE"
    });
    expect(accepted(decodeModelJson("{\"o\": [\"say \"no\" here\", \"b\"]}"))).toEqual({ value: { o: ["say \"no\" here", "b"] }, repair: "INNER_QUOTE" });
    expect(decodeModelJson("{\"a\"b\": 1}", STOP).ok).toBe(false);
  });

  it("(v) the real DeepSeek storyteller reply: one brace short at the end, finished normally", () => {
    const reply = fixture("deepseek-storyteller-ro-missing-brace.txt");
    expect(() => JSON.parse(reply)).toThrow();
    const { value, repair } = accepted(decodeModelJson(reply, STOP));
    expect(repair).toBe("CLOSING_BRACKETS");
    // The brace it left out was the one closing "long", before "reviewer_note": closing at the END decodes it,
    // with reviewer_note inside long, and the schema check (never this decode) refuses that shape.
    expect(Object.keys(value as object)).toEqual(["shape_id", "short", "why", "long"]);
    expect(Object.keys((value as { long: object }).long)).toEqual(["sections", "reviewer_note"]);
    // The Anthropic wire's normal ends are normal too.
    expect(accepted(decodeModelJson("{\"a\":[1,{\"b\":2", { finishReason: "end_turn" }))).toEqual({ value: { a: [1, { b: 2 }] }, repair: "CLOSING_BRACKETS" });
  });
});

describe("decodeModelJson — what it never repairs", () => {
  it("(v) never without a normal finish: unknown, cut off at the ceiling, or any other reason", () => {
    const reply = fixture("deepseek-storyteller-ro-missing-brace.txt");
    expect(decodeModelJson(reply).ok).toBe(false);
    expect(decodeModelJson(reply, { finishReason: null }).ok).toBe(false);
    expect(decodeModelJson(reply, LENGTH).ok).toBe(false);
    expect(decodeModelJson(reply, { finishReason: "content_filter" }).ok).toBe(false);
  });

  it("a reply cut off at its token ceiling is not repaired at all, even where a complete object stands in it", () => {
    expect(decodeModelJson("Let me answer. {\"a\":1}", LENGTH).ok).toBe(false);
    expect(decodeModelJson("```json\n{\"a\":1}\n```", LENGTH).ok).toBe(false);
    expect(decodeModelJson("{\"o\": \"a \"b\" c\"}", LENGTH).ok).toBe(false);
    // Strict JSON is still JSON.
    expect(decodeModelJson("{\"a\":1}", LENGTH)).toEqual({ ok: true, value: { a: 1 }, repair: null });
  });

  it.each([
    ["single quotes", "{'a': 1}"],
    ["a trailing comma", "{\"a\": 1,}"],
    ["a missing comma between members", "{\"a\": 1 \"b\": 2}"],
    ["a comment", "{\"a\": 1 // note\n}"],
    ["an unquoted key", "{a: 1}"],
    ["a raw line break inside a string", "{\"a\": \"one\ntwo\"}"],
    ["a string still open at the end", "{\"a\": \"abc"],
    ["a mismatched closer", "{\"a\": [1}"],
    ["a dangling member at the end", "{\"a\": 1, \"b\":"],
    ["prose only", "I could not write the verdict."],
    ["an empty reply", ""]
  ])("refuses %s, whatever the finish", (_name, text) => {
    const result = decodeModelJson(text, STOP);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.error).toBe("string");
  });

  it("names the strict parser's own error when nothing decodes", () => {
    const text = "I need to think. No JSON here.";
    let strict = "";
    try { JSON.parse(text); } catch (error) { strict = (error as Error).message; }
    expect(decodeModelJson(text, STOP)).toEqual({ ok: false, error: strict });
  });

  it("a value that is not an object is never taken out of prose", () => {
    expect(decodeModelJson("The answer is [1, 2].", STOP).ok).toBe(false);
  });
});
