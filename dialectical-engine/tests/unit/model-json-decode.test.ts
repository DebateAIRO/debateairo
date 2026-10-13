import { readFileSync, readdirSync } from "node:fs";
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

/**
 * R15 practice debate (2026-10-12, seq 644): MiMo-V2.6-Pro's story checker wrote its whole check out as prose, then its
 * verdict in a ```json fence at the very end, with straight quotes closing „…" quotations inside the objection. The
 * reply is the real one (our own practice text, no secret). TRAILING_OBJECT, the decode's last resort, reads it only
 * when the caller asks (`trailingObjectAccepted`) and its check accepts the object.
 */
describe("decodeModelJson — (vii) TRAILING_OBJECT, the one object that ends a reply opening with prose", () => {
  const R15_644 = fixture("mimo-checker-r15-644-reasoning-then-fenced-verdict.txt");
  const ANY = Object.freeze({ trailingObjectAccepted: () => true });
  const NONE = Object.freeze({ trailingObjectAccepted: () => false });
  const FENCE = "```";
  const tail = (text: string): string => text.slice(text.indexOf(FENCE));
  const verdictBody = (text: string): string => tail(text).slice(`${FENCE}json\n`.length, -`\n${FENCE}`.length);
  const prose = (text: string): string => text.slice(0, text.indexOf(FENCE));

  it("reads the real reply 644, its object only, with the straight quotes inside its texts escaped", () => {
    expect(decodeModelJson(R15_644, STOP).ok).toBe(false);
    const { value, repair } = accepted(decodeModelJson(R15_644, STOP, ANY));
    expect(repair).toBe("TRAILING_OBJECT");
    const verdict = value as { satisfied: boolean; objection: string };
    expect(verdict.satisfied).toBe(false);
    expect(verdict.objection.startsWith("1) The third reason in why cites P23")).toBe(true);
    expect(verdict.objection).toContain("„a dedicated source is easy to promise and easy to divert later\" is cited to P9");
    expect(verdict.objection.endsWith("make it a caveat, not a reason.")).toBe(true);
    expect(Object.keys(verdict)).toEqual(["satisfied", "objection"]);
  });

  it("is made only when asked, only when the check accepts it, and only for a reply that finished normally", () => {
    expect(decodeModelJson(R15_644, STOP, {}).ok).toBe(false);
    expect(decodeModelJson(R15_644, STOP, NONE).ok).toBe(false);
    expect(decodeModelJson(R15_644, LENGTH, ANY).ok).toBe(false);
    expect(decodeModelJson(R15_644, undefined, ANY).ok).toBe(false);
    expect(decodeModelJson(R15_644, { finishReason: null }, ANY).ok).toBe(false);
    expect(decodeModelJson(R15_644, { finishReason: "content_filter" }, ANY).ok).toBe(false);
    // A refusal keeps the strict parser's own error, exactly as before.
    expect(decodeModelJson(R15_644, STOP, NONE)).toEqual(decodeModelJson(R15_644, STOP));
    // The check sees the object the decode found.
    const seen: unknown[] = [];
    decodeModelJson(R15_644, STOP, { trailingObjectAccepted: (value) => { seen.push(value); return true; } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ satisfied: false });
  });

  it("reads the same object bare (no fence) at the end, and inside a plain fence", () => {
    expect(verdictBody(R15_644).startsWith("{")).toBe(true);
    expect(verdictBody(R15_644).endsWith("}")).toBe(true);
    const bare = `${prose(R15_644)}${verdictBody(R15_644)}`;
    expect(accepted(decodeModelJson(bare, STOP, ANY)).repair).toBe("TRAILING_OBJECT");
    const plainFence = `${prose(R15_644)}${FENCE}\n${verdictBody(R15_644)}\n${FENCE}\n`;
    expect(accepted(decodeModelJson(plainFence, STOP, ANY)).repair).toBe("TRAILING_OBJECT");
  });

  it.each([
    ["an object followed by more prose", (text: string) => `${text}\n\nOn reflection the verdict above is wrong; let me redo it.`],
    ["two objects in the one fence", (text: string) => `${prose(text)}${FENCE}json\n${verdictBody(text)}\n${verdictBody(text)}\n${FENCE}`],
    ["two fences, each with an object", (text: string) => `${prose(text)}${tail(text)}\n\nCorrected:\n${tail(text)}`],
    ["two bare objects at the end", (text: string) => `${prose(text)}${verdictBody(text)}\n${verdictBody(text)}`],
    ["an earlier draft object in the prose", (text: string) => `${prose(text)}Draft: ${verdictBody(text)}\nFinal:\n${tail(text)}`],
    ["an object missing its closing brace", (text: string) => `${prose(text)}${FENCE}json\n${verdictBody(text).slice(0, -1)}\n${FENCE}`],
    ["a fence tag other than json", (text: string) => `${prose(text)}${FENCE}jsonc\n${verdictBody(text)}\n${FENCE}`],
    ["an object that is not one JSON value even with its quotes escaped", (text: string) => text.replace("\"satisfied\": false,", "\"satisfied\": false")]
  ])("refuses %s", (_name, edit) => {
    const text = edit(R15_644);
    expect(text).not.toBe(R15_644);
    expect(decodeModelJson(text, STOP, ANY).ok).toBe(false);
  });

  it("a fence with no prose before it is not this repair's form: the earlier fence-body repair reads it, as before", () => {
    const fenceOnly = tail(R15_644);
    expect(decodeModelJson(fenceOnly, STOP, ANY)).toEqual(decodeModelJson(fenceOnly, STOP));
    expect(accepted(decodeModelJson(fenceOnly, STOP, ANY)).repair).toBe("INNER_QUOTE");
  });

  it("refuses the debate 2 checker reply whose later prose disowned its first object (seq 645), however it ended", () => {
    const disowned = readFileSync(new URL("../support/fixtures/judge-format-replies/mimo-checker-en-length-cut-object-then-thinking.txt", import.meta.url), "utf8");
    for (const ending of [LENGTH, STOP, undefined]) {
      const before = decodeModelJson(disowned, ending);
      const after = decodeModelJson(disowned, ending, ANY);
      expect(after).toEqual(before);
      expect(after.ok && after.repair === "TRAILING_OBJECT").toBe(false);
    }
    expect(decodeModelJson(disowned, LENGTH, ANY).ok).toBe(false);
  });

  it("never changes how a reply an earlier step reads is read: every real fixture decodes the same with it asked for", () => {
    let compared = 0;
    for (const dir of ["story-format-replies", "judge-format-replies", "writer-format-replies"]) {
      const base = new URL(`../support/fixtures/${dir}/`, import.meta.url);
      for (const name of readdirSync(base)) {
        const text = readFileSync(new URL(name, base), "utf8");
        for (const ending of [STOP, LENGTH, undefined]) {
          const before = decodeModelJson(text, ending);
          const after = decodeModelJson(text, ending, ANY);
          if (before.ok) expect(after, `${dir}/${name}`).toEqual(before);
          else if (after.ok) expect(`${dir}/${name}:${after.repair}`).toBe(`story-format-replies/mimo-checker-r15-644-reasoning-then-fenced-verdict.txt:TRAILING_OBJECT`);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(3 * 19);
  });
});
