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
    ["a comma before a brace between two inner quotes", "{\"a\":\"say \"a,}\" b\",\"c\":[1,]}"],
    // Task 3 re-review: strict JSON on the cleaned text would split the text into an invented key ("k").
    ["a token after an inner quote, with a trailing comma in a later list", "{\"a\":\"he wrote \"<|im_end|>,\"k\":\" done\",\"b\":[1,]}"],
    ["a token after an inner quote, with a trailing comma at the end", "{\"a\":\"he wrote \"<|im_end|>,\"k\":\" done\",}"],
    ["a token after an inner quote, with the last brace missing", "{\"a\":\"he wrote \"<|im_end|>,\"k\":\" done\",\"b\":[1]"],
    // Round 3: a comma right after an inner quote, then a token, is not JSON grammar either.
    ["a comma and a token after an inner quote, with a trailing comma in a later list", "{\"a\":\"he said \",<|im_end|>\"k\":\" ok\",\"b\":[1,]}"],
    ["a comma and a spaced token after an inner quote, with a trailing comma at the end", "{\"a\":\"he said \", <|im_end|> \"k\":\" ok\",}"],
    // The accepted side effects: a token right after a string value, or after its comma, is left to the structure-repair
    // call (round 2 read the second as {a:"x", b:1}).
    ["a token right after a string value", "{\"a\":\"x\"<|im_end|>}"],
    ["a token right after a string value's comma", "{\"a\":\"x\",<|im_end|>\"b\":1}"],
    // Round 4: a quote then `,}` / `,]` is a certain end only when nothing but closers follows; otherwise TRAILING_COMMA
    // would close an inner object inside the AI's text and the text's own `{` would reopen one (an invented element).
    ["an inner quote, a comma and a brace inside a text, with a trailing comma in a later list",
      "{\"L\":[{\"a\":\"the log ended \",}, {\"id\":\"7 and stopped\"}],\"b\":[1,]}"],
    ["the short form of the same", "{\"L\":[{\"a\":\"P \",},{\"k\":\"Q\"}],\"b\":[1,]}"],
    ["the short form with the last brace missing", "{\"L\":[{\"a\":\"P \",},{\"k\":\"Q\"}],\"b\":[1]"],
    // The accepted side effect of round 4: a trailing comma after a string value mid-text goes to the structure-repair call.
    ["a trailing comma after a string value inside an inner object", "{\"o\":{\"a\":\"x\",},\"c\":1}"]
  ])("refuses %s rather than change its words", (_name, text) => {
    expect(decodeModelJson(text, STOP).ok).toBe(false);
    expect(modelJsonSyntaxRepair(text, STOP)).toBeNull();
    expect(parseStructuredArtifact(text, z.unknown(), STOP).kind).toBe("PARSE_FAILURE");
  });

  it("the judge never drops a split-off part of a text after a comma and a token (Task 3 re-review, round 3)", () => {
    const schema = z.object({ a: z.string(), b: z.array(z.number()) }).strict();
    const reply = "{\"a\":\"he said \",<|im_end|>\"k\":\" ok\",\"b\":[1,]}";
    expect(parseStructuredArtifact(reply, schema, STOP, { unaskedKeys: true }).kind).toBe("PARSE_FAILURE");
    // Control: without the trailing comma INNER_QUOTE alone reads the reply and keeps every word.
    expect(decodeModelJson("{\"a\":\"he said \",<|im_end|>\"k\":\" ok\",\"b\":[1]}", STOP)).toEqual({ ok: true,
      value: { a: "he said \",<|im_end|>\"k\":\" ok", b: [1] }, repair: "INNER_QUOTE" });
  });

  it("the judge never reads an inner quote, comma and brace as a closed object (Task 3 re-review, round 4)", () => {
    const schema = z.object({ L: z.array(z.record(z.string(), z.string())), b: z.array(z.number()) }).strict();
    expect(parseStructuredArtifact("{\"L\":[{\"a\":\"P \",},{\"k\":\"Q\"}],\"b\":[1,]}", schema, STOP).kind).toBe("PARSE_FAILURE");
    expect(parseStructuredArtifact("{\"L\":[{\"a\":\"P \",},{\"k\":\"Q\"}],\"b\":[1]", schema, STOP).kind).toBe("PARSE_FAILURE");
    // Controls: without the later trailing comma INNER_QUOTE alone reads the reply and keeps every word.
    expect(decodeModelJson("{\"L\":[{\"a\":\"the log ended \",}, {\"id\":\"7 and stopped\"}],\"b\":[1]}", STOP)).toEqual({ ok: true,
      value: { L: [{ a: "the log ended \",}, {\"id\":\"7 and stopped" }], b: [1] }, repair: "INNER_QUOTE" });
    const control = "{\"L\":[{\"a\":\"P \",},{\"k\":\"Q\"}],\"b\":[1]}";
    expect(decodeModelJson(control, STOP)).toEqual({ ok: true, value: { L: [{ a: "P \",},{\"k\":\"Q" }], b: [1] }, repair: "INNER_QUOTE" });
    expect(parseStructuredArtifact(control, schema, STOP)).toMatchObject({ kind: "PARSED", strategy: "INNER_QUOTE",
      value: { L: [{ a: "P \",},{\"k\":\"Q" }], b: [1] } });
  });

  it("still repairs a string end that is JSON grammar in the reply itself (round 3 whitelist)", () => {
    expect(decodedOk("{\"a\":\"x\" ,}").value).toEqual({ a: "x" });
    const moved = decodedOk("{\"severity\":0.2,\"description:\" \"none\",}");
    expect(moved.value).toEqual({ severity: 0.2, description: "none" });
    expect(decodedRepairsOf(moved)).toEqual(["TRAILING_COMMA", "KEY_COLON_MOVED"]);
    // Round 4: a quote then `,}` / `,]` with only closers after it (blanks between) is still a certain end.
    expect(decodedOk("{\"o\":{\"a\":\"x\",} }").value).toEqual({ o: { a: "x" } });
    expect(decodedOk("{\"o\":[\"x\",]}").value).toEqual({ o: ["x"] });
  });

  it("the judge never drops a split-off part of a text as an unasked key (Task 3 re-review)", () => {
    const schema = z.object({ a: z.string(), b: z.array(z.number()) }).strict();
    const reply = "{\"a\":\"he wrote \"<|im_end|>,\"k\":\" done\",\"b\":[1,]}";
    expect(parseStructuredArtifact(reply, schema, STOP, { unaskedKeys: true }).kind).toBe("PARSE_FAILURE");
    // Control: without the trailing comma INNER_QUOTE alone reads the reply and keeps every word.
    expect(decodeModelJson("{\"a\":\"he wrote \"<|im_end|>,\"k\":\" done\",\"b\":[1]}", STOP)).toEqual({ ok: true,
      value: { a: "he wrote \"<|im_end|>,\"k\":\" done", b: [1] }, repair: "INNER_QUOTE" });
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
