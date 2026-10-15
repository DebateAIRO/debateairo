// tests/unit/lg-a-syntax-repairs.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeModelJson, decodedRepairsOf, modelJsonSyntaxRepair } from "@debateai/providers";
import { classifyStructuredArtifact, parseStructuredArtifact, parsedStructuredRepairs } from "@debateai/judgement";

const STOP = { finishReason: "stop" } as const;
const LENGTH = { finishReason: "length" } as const;
function decodedOk(text: string, reply: { finishReason: string } | undefined = STOP) {
  const decoded = decodeModelJson(text, reply);
  if (!decoded.ok) throw new Error(`expected a decode: ${decoded.error}`);
  return decoded;
}

/** LG-A (spec 2026-10-15, L31; structured-outputs-findings §3 "Broken JSON", 10 tries on 2026-10-14). */
describe("LG-A decode: the syntax pass, tried after every repair before it", () => {
  it("drops a trailing comma (GLM)", () => {
    const decoded = decodedOk("{\"a\":[1,2,],\"b\":\"x\",}");
    expect(decoded.value).toEqual({ a: [1, 2], b: "x" });
    expect(decodedRepairsOf(decoded)).toEqual(["TRAILING_COMMA"]);
  });

  it("escapes a raw line break inside a text", () => {
    const decoded = decodedOk("{\"text\":\"line one\nline two\"}");
    expect(decoded.value).toEqual({ text: "line one\nline two" });
    expect(decodedRepairsOf(decoded)).toEqual(["RAW_LINE_BREAK"]);
  });

  it("drops a leaked model token outside the texts, never inside one", () => {
    // Pre-flight PF-A7 (ruling R2): the token follows a number. After a string value INNER_QUOTE reads the reply first.
    const decoded = decodedOk("{\"a\":1,<|code_suffix|>\"b\":\"keep <|this|> text\"}");
    expect(decoded.value).toEqual({ a: 1, b: "keep <|this|> text" });
    expect(decodedRepairsOf(decoded)).toEqual(["MODEL_TOKEN_DROPPED"]);
  });

  it("drops a comma that a leaked model token separates from the closing brace (Task 3 review)", () => {
    const decoded = decodedOk("{\"a\":1,<|im_end|>}");
    expect(decoded.value).toEqual({ a: 1 });
    expect(decodedRepairsOf(decoded)).toEqual(["TRAILING_COMMA", "MODEL_TOKEN_DROPPED"]);
  });

  it("names the code fence too when the pass reads a fence's body (L34, Task 3 review)", () => {
    const decoded = decodedOk("```json\n{\"a\":1,}\n```");
    expect(decoded.value).toEqual({ a: 1 });
    expect(decodedRepairsOf(decoded)).toEqual(["CODE_FENCE", "TRAILING_COMMA"]);
    expect(decoded.repair).toBe("CODE_FENCE");
  });

  it("reads a key written with its colon inside the quotes", () => {
    const decoded = decodedOk("{\"severity\":0.2,\"description:\" \"none\"}");
    expect(decoded.value).toEqual({ severity: 0.2, description: "none" });
    expect(decodedRepairsOf(decoded)).toEqual(["KEY_COLON_MOVED"]);
  });

  it("names every repair once, in the list's fixed order", () => {
    const decoded = decodedOk("{\"text\":\"a\nb\",\"list\":[1,],\"c\":\"d\",}");
    expect(decodedRepairsOf(decoded)).toEqual(["TRAILING_COMMA", "RAW_LINE_BREAK"]);
    expect(decoded.repair).toBe("TRAILING_COMMA");
  });

  it("inserts the one missing } where only one place fits (MiMo's long story, 2026-10-14)", () => {
    const broken = "{\"sections\":[{\"title\":\"A\",\"paragraphs\":[\"x\"],{\"title\":\"B\",\"paragraphs\":[\"y\"]}],\"n\":1}";
    expect(() => JSON.parse(broken)).toThrow();
    const decoded = decodedOk(broken);
    expect(decoded.value).toEqual({ sections: [{ title: "A", paragraphs: ["x"] }, { title: "B", paragraphs: ["y"] }], n: 1 });
    expect(decodedRepairsOf(decoded)).toEqual(["BRACKET_INSERTED"]);
  });

  it("inserts a list's missing ] before the key that follows it", () => {
    const decoded = decodedOk("{\"reasons\":[\"a\",\"b\",\"short\":{\"h\":\"x\"}}");
    expect(decoded.value).toEqual({ reasons: ["a", "b"], short: { h: "x" } });
    expect(decodedRepairsOf(decoded)).toEqual(["BRACKET_INSERTED"]);
  });

  it("never repairs a reply cut off at its token ceiling; never inserts a bracket when the ending is unknown", () => {
    expect(decodeModelJson("{\"a\":[1,2,],\"b\":\"x\",}", LENGTH).ok).toBe(false);
    expect(modelJsonSyntaxRepair("{\"a\":[1,2,],\"b\":\"x\",}", LENGTH)).toBeNull();
    expect(decodeModelJson("{\"sections\":[{\"title\":\"A\",\"paragraphs\":[\"x\"],{\"title\":\"B\",\"paragraphs\":[\"y\"]}],\"n\":1}").ok).toBe(false);
  });

  it("reads every reply an earlier repair reads exactly as before (control)", () => {
    expect(decodeModelJson("```json\n{\"a\":1}\n```", STOP)).toEqual({ ok: true, value: { a: 1 }, repair: "CODE_FENCE" });
    expect(decodeModelJson("Here: {\"a\":1} done", STOP)).toEqual({ ok: true, value: { a: 1 }, repair: "OUTERMOST_OBJECT" });
    expect(decodeModelJson("{\"a\":\"„x\" y\"}", STOP)).toEqual({ ok: true, value: { a: "„x\" y" }, repair: "INNER_QUOTE" });
    expect(decodeModelJson("{\"a\":[1,2]", STOP)).toEqual({ ok: true, value: { a: [1, 2] }, repair: "CLOSING_BRACKETS" });
    expect(decodeModelJson("I cannot answer that.", STOP).ok).toBe(false);
    expect(decodeModelJson("{'a': 1}", STOP).ok).toBe(false);
  });

  it("the judge's reading takes the same pass last and names its repairs", () => {
    const schema = z.object({ a: z.string(), b: z.array(z.number()) }).strict();
    const result = parseStructuredArtifact("{\"a\":\"x\",\"b\":[1,],}", schema, STOP);
    expect(result).toMatchObject({ kind: "PARSED", strategy: "SYNTAX_REPAIRED", value: { a: "x", b: [1] } });
    if (result.kind !== "PARSED") throw new Error("parsed");
    expect(parsedStructuredRepairs(result)).toEqual(["TRAILING_COMMA"]);
    // Old strategies keep their exact results (no `repairs` member).
    expect(parseStructuredArtifact("{\"a\":\"x\",\"b\":[1]}", schema, STOP)).toEqual({ kind: "PARSED", strategy: "RAW", value: { a: "x", b: [1] } });
  });

  it("a syntax repair then a shape repair names both, in order (pre-flight PF-A8, L34)", () => {
    const schema = z.object({ a: z.string(), b: z.array(z.number()) }).strict();
    const reply = "{\"a\":\"x\",\"b\":[1,],\"note\":\"y\"}";
    expect(parseStructuredArtifact(reply, schema, STOP, { unaskedKeys: true })).toEqual({ kind: "PARSED", strategy: "UNASKED_KEYS",
      value: { a: "x", b: [1] }, repairs: ["TRAILING_COMMA", "UNASKED_KEYS"] });
    expect(classifyStructuredArtifact(reply, schema, STOP, { unaskedKeys: true })).toEqual({ parseStatus: "PARSED", parseError: null,
      jsonRepair: "TRAILING_COMMA", jsonRepairs: ["TRAILING_COMMA", "UNASKED_KEYS"] });
  });
});

/**
 * Task 3 review: a straight quote inside a text makes the pass read part of that text as outside it, where a dropped
 * comma, token or colon would change the AI's words. After such a repair INNER_QUOTE is never tried on the cleaned
 * text; the reply is refused and left to the structure-repair call, which keeps every word.
 */
describe("LG-A decode: the syntax pass never changes a word", () => {
  it.each([
    ["a leaked token between two inner quotes", "{\"a\":\"he wrote \"<|im_end|>\" here\",}"],
    ["a trailing comma between two inner quotes", "{\"a\":\"he typed \"[1, 2,]\" in the box\",\"b\":[3,]}"],
    ["a comma before a brace between two inner quotes", "{\"a\":\"say \"a,}\" b\",\"c\":[1,]}"]
  ])("refuses %s rather than change its words", (_name, text) => {
    expect(decodeModelJson(text, STOP).ok).toBe(false);
    expect(modelJsonSyntaxRepair(text, STOP)).toBeNull();
    expect(parseStructuredArtifact(text, z.unknown(), STOP).kind).toBe("PARSE_FAILURE");
  });
});

/** CI-1b (model text is untrusted): the syntax pass is linear; an unbounded search for `|>` made unclosed `<|` quadratic. */
describe("LG-A decode: the syntax pass answers in linear time", () => {
  const WITHIN_MS = 500;
  it.each([
    ["100 000 unclosed model-token openers", `{${"<|".repeat(100000)}}`],
    ["100 000 unclosed openers with a letter, closed once at the end", `{"a":1,${"<|a".repeat(100000)}|>}`]
  ])("answers %s inside the bound", (_name, text) => {
    const started = performance.now();
    expect(decodeModelJson(text, STOP).ok).toBe(false);
    expect(parseStructuredArtifact(text, z.unknown(), STOP).kind).toBe("PARSE_FAILURE");
    expect(performance.now() - started).toBeLessThan(WITHIN_MS);
  });
});
