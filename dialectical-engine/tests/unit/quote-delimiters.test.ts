// tests/unit/quote-delimiters.test.ts
import { describe, expect, it } from "vitest";
import { JUDGE_ANSWER_FORM, JUDGE_ARTIFACT_READING, classifyStructuredArtifact, judgeArtifactSchema } from "@debateai/judgement";
import { decodeModelJson, decodedRepairsOf, structureRepairKeepsWords, structureRepairTextsKeptAt } from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;
function decodedOk(text: string) {
  const decoded = decodeModelJson(text, STOP);
  if (!decoded.ok) throw new Error(`expected a decode: ${decoded.error}`);
  return decoded;
}

/**
 * Practice debate 2026-10-16 (R1b release): GLM-5.3-Flash wrote five long texts of a cross-exchange judge leg between
 * typographic quotes “…” instead of straight ones. Synthetic placeholder texts of the same shape: commas, apostrophes, a
 * colon, parentheses and one inner straight quote each.
 */
const TEXTS = Object.freeze({
  statement: "The council's plan (as drafted) holds: fares rise a little, but the \"fair share\" rule keeps the night buses running.",
  restatement: "The author says the plan works (in the main) because, as the council's note puts it: the \"fair share\" rule pays for it.",
  steelman: "At its strongest, the claim is this: a small rise, shared fairly (the \"fair share\" rule), keeps every route open, and that's the point.",
  critic: "The best counter: riders who can't pay more will leave, so the \"fair share\" rule (on its own) may shrink the very service it protects.",
  description: "No fatal flaw: the step from the council's figures to the \"fair share\" rule (its central link) is stated, not assumed."
});

/** The judge-shaped reply: the five texts between “…”, every other value straight-quoted. */
const GLM_JUDGE_REPLY = `{
  "statement": “${TEXTS.statement}”,
  "way_of_knowing": "REASONING",
  "locator": null,
  "restatement_text": “${TEXTS.restatement}”,
  "restatement_status": "PASS",
  "value_laden": true,
  "steelman": { "summary": “${TEXTS.steelman}”, "fidelity": 0.9 },
  "critic": { "summary": “${TEXTS.critic}”, "counterargumentStrength": 0.7, "basis": "PLAUSIBLE_COUNTER" },
  "evidence": { "quality": 0.6, "relevance": 0.8 },
  "context": { "fit": 0.9, "ambiguityFlags": [] },
  "fallacy": { "severity": 0.25, "fatalFlags": [], "description": “${TEXTS.description}” }
}`;

const JUDGE_VALUE = Object.freeze({
  statement: TEXTS.statement, way_of_knowing: "REASONING", locator: null, restatement_text: TEXTS.restatement,
  restatement_status: "PASS", value_laden: true,
  steelman: { summary: TEXTS.steelman, fidelity: 0.9 },
  critic: { summary: TEXTS.critic, counterargumentStrength: 0.7, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.8 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.25, fatalFlags: [], description: TEXTS.description }
});

describe("QUOTE_DELIMITERS_STRAIGHTENED: typographic quotes used as a value's delimiters are read as straight ones", () => {
  it("1. decodes the judge-shaped reply with five “…” texts, every text exactly as written", () => {
    expect(JSON.parse.bind(null, GLM_JUDGE_REPLY)).toThrow();
    const decoded = decodedOk(GLM_JUDGE_REPLY);
    expect(decodedRepairsOf(decoded)).toEqual(["QUOTE_DELIMITERS_STRAIGHTENED"]);
    expect(decoded.value).toEqual(JUDGE_VALUE);
    const value = decoded.value as typeof JUDGE_VALUE;
    expect(value.statement).toBe(TEXTS.statement);
    expect(value.restatement_text).toBe(TEXTS.restatement);
    expect(value.steelman.summary).toBe(TEXTS.steelman);
    expect(value.critic.summary).toBe(TEXTS.critic);
    expect(value.fallacy.description).toBe(TEXTS.description);
  });

  it("2. the judge's classifier accepts it in code, the repair named, the stray fallacy.description dropped by its fixer", () => {
    expect(classifyStructuredArtifact(GLM_JUDGE_REPLY, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING)).toEqual({
      parseStatus: "PARSED", parseError: null, jsonRepair: "QUOTE_DELIMITERS_STRAIGHTENED",
      jsonRepairs: ["QUOTE_DELIMITERS_STRAIGHTENED", "INNER_UNASKED_KEYS"] });
  });

  it("3. typographic quotes inside a straight-quoted text are its words: byte for byte, no repair named", () => {
    const text = "He wrote “quoted words”, then „other words“, and „more”: all of it (here) is the text.";
    const strict = decodedOk(JSON.stringify({ a: text, b: 1 }));
    expect(strict.repair).toBeNull();
    expect(strict.value).toEqual({ a: text, b: 1 });
    // Through the syntax pass (a trailing comma), the typographic quotes still stay as they are.
    const viaPass = decodedOk(`{"a": ${JSON.stringify(text)}, "list": ["x", ${JSON.stringify(text)}], "b": 1,}`);
    expect(decodedRepairsOf(viaPass)).toEqual(["TRAILING_COMMA"]);
    expect(viaPass.value).toEqual({ a: text, list: ["x", text], b: 1 });
  });

  it("4. a value opened with “ and never closed before , } or ] is not repaired: the decode fails as today", () => {
    expect(decodeModelJson("{\"a\": “never closed, \"b\": 1}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\"a\": “closed only” inside the text, \"b\": 1}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\"a\": “closed with a straight quote\", \"b\": 1}", STOP).ok).toBe(false);
  });

  it("5. German „…“ and mixed „…” values are straightened", () => {
    const decoded = decodedOk("{\"a\": „German style, with a comma“, \"b\": „mixed style: it's fine”}");
    expect(decoded.value).toEqual({ a: "German style, with a comma", b: "mixed style: it's fine" });
    expect(decodedRepairsOf(decoded)).toEqual(["QUOTE_DELIMITERS_STRAIGHTENED"]);
  });

  it("6. list items: [\"a\", “b, with a comma”, „c“] reads as three texts", () => {
    const decoded = decodedOk("{\"list\": [\"a\", “b, with a comma”, „c“]}");
    expect(decoded.value).toEqual({ list: ["a", "b, with a comma", "c"] });
    expect(decodedRepairsOf(decoded)).toEqual(["QUOTE_DELIMITERS_STRAIGHTENED"]);
    expect(decodedOk("{\"list\": [“first”,„second“ ]}").value).toEqual({ list: ["first", "second"] });
  });

  it("escapes a backslash and a raw line break inside such a value (RAW_LINE_BREAK named too)", () => {
    const decoded = decodedOk("{\"a\": “one \\ two\nthree \"four\"”}");
    expect(decoded.value).toEqual({ a: "one \\ two\nthree \"four\"" });
    expect(decodedRepairsOf(decoded)).toEqual(["RAW_LINE_BREAK", "QUOTE_DELIMITERS_STRAIGHTENED"]);
  });

  it("never repairs a key: a typographic quote at a key's place leaves the reply as today", () => {
    expect(decodeModelJson("{“a”: \"x\"}", STOP).ok).toBe(false);
    // Today INNER_QUOTE reads this one as one text (the quote after x cannot end it before a key-less “b”); it still does.
    const today = decodedOk("{\"a\": \"x\", “b”: \"y\"}");
    expect(decodedRepairsOf(today)).toEqual(["INNER_QUOTE"]);
    expect(today.value).toEqual({ a: "x\", “b”: \"y" });
  });

  it("7. the keep-words check accepts Haiku's straight copy of the reply on a cross-root judge leg", () => {
    const textsKept = structureRepairTextsKeptAt("JUDGE:cross-root:3->1", "served");
    expect(textsKept).toBe("place");
    const { description: _dropped, ...fallacy } = JUDGE_VALUE.fallacy;
    const haikuCopy = { ...JUDGE_VALUE, fallacy };
    expect(structureRepairKeepsWords(GLM_JUDGE_REPLY, haikuCopy, JUDGE_ANSWER_FORM, { textsKept })).toBe(true);
    // A copy that changed a word is still refused.
    const changed = { ...haikuCopy, critic: { ...haikuCopy.critic, summary: TEXTS.critic.replace("leave", "stay") } };
    expect(structureRepairKeepsWords(GLM_JUDGE_REPLY, changed, JUDGE_ANSWER_FORM, { textsKept })).toBe(false);
  });

  // CI-1b (model text is untrusted): an opening quote with no closing quote is looked for once, never again.
  it.each([
    ["100 000 unclosed “ list items", `{"list": [${"“x, ".repeat(100000)}]}`],
    ["100 000 unclosed „ list items, each with a “ that closes nothing", `{"list": [${"„x“y, ".repeat(100000)}]}`]
  ])("answers %s in linear time", (_name, text) => {
    const started = performance.now();
    expect(decodeModelJson(text, STOP).ok).toBe(false);
    expect(classifyStructuredArtifact(text, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING).parseStatus).toBe("PARSE_FAILED");
    expect(performance.now() - started).toBeLessThan(500);
  });
});
