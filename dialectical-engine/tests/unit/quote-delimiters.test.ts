// tests/unit/quote-delimiters.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  JUDGE_ANSWER_FORM, JUDGE_ARTIFACT_READING, classifyStructuredArtifact, judgeArtifactSchema, parseStructuredArtifact
} from "@debateai/judgement";
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

  // Fix round 1 (review, 2026-10-16): the first closing quote followed by , } ] may belong to a LATER value. A value that
  // would swallow keys, list items, numbers, objects or straight texts is never read: the decode fails as today.
  it.each([
    ["a straight closer, then a later value's closer (key b swallowed)", "{\"a\": “x\", \"b\": “y”}"],
    ["Romanian „ with a straight closer, then a later „…”", "{\"a\": „Planul e bun\", \"b\": „Altceva”, \"c\": 1}"],
    ["three list items read as two", "{\"flags\": [\"a\", “b\", “c”]}"],
    ["a number and true/false swallowed", "{\"a\": “x\", \"n\": 3, \"ok\": true, \"b\": “y”}"],
    ["an object swallowed", "{\"a\": “x\", \"o\": {\"k\": 1}, \"b\": “y”}"],
    ["the closer inside a later straight text", "{\"a\": “x\", \"b\": \"y ”, \"c\": \"z\"}"],
    ["a typographic key swallowed", "{\"a\": „x, “k”: “y”}"],
    ["the closer belongs to a later value", "{\"a\": “one, \"b\": “two”}"],
    ["the closer belongs to a later list item", "{\"a\": [“one, “two”]}"]
  ])("4. %s: not repaired", (_name, text) => {
    expect(decodeModelJson(text, STOP).ok).toBe(false);
    expect(classifyStructuredArtifact(text, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING).parseStatus).toBe("PARSE_FAILED");
  });

  it("a “ value holding another “ before its closer (an unbalanced nested quote) is not repaired; „…„…\"…” still is", () => {
    expect(decodeModelJson("{\"a\": “He said “yes”, \"b\": “no”}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\"a\": “He called it “the plan”, and left”, \"b\": 1}", STOP).ok).toBe(false);
    const romanian = decodedOk("{\"a\": „El a spus „da\" și a plecat”, \"b\": 1}");
    expect(romanian.value).toEqual({ a: "El a spus „da\" și a plecat", b: 1 });
    expect(decodedRepairsOf(romanian)).toEqual(["QUOTE_DELIMITERS_STRAIGHTENED"]);
    const german = decodedOk("{\"a\": „Er sagte “ja” und ging“, \"b\": 1}");
    expect(german.value).toEqual({ a: "Er sagte “ja” und ging", b: 1 });
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

  // Fix round 1: a straight list item before a typographic one may also be read as ONE text whose inner quotes INNER_QUOTE
  // escapes (when a later straight quote can end it). Alone, INNER_QUOTE reads it so, first, as today. Beside an unrelated
  // typographic member it is REFUSED (the structure call keeps every word), never read as three items: the code cannot
  // tell which reading the AI meant, and the list must not read differently because of another member.
  it("6b. [\"he said: \", “quoted”, \"rest\"] is one text alone (today) and refused beside another typographic member", () => {
    const alone = decodedOk("{\"list\": [\"he said: \", “quoted”, \"rest\"]}");
    expect(decodedRepairsOf(alone)).toEqual(["INNER_QUOTE"]);
    expect(alone.value).toEqual({ list: ["he said: \", “quoted”, \"rest"] });
    expect(decodeModelJson("{\"x\": “top”, \"list\": [\"he said: \", “quoted”, \"rest\"]}", STOP).ok).toBe(false);
  });

  it("escapes a backslash and a raw line break inside such a value (RAW_LINE_BREAK named too)", () => {
    const decoded = decodedOk("{\"a\": “one \\ two\nthree \"four\"”}");
    expect(decoded.value).toEqual({ a: "one \\ two\nthree \"four\"" });
    expect(decodedRepairsOf(decoded)).toEqual(["RAW_LINE_BREAK", "QUOTE_DELIMITERS_STRAIGHTENED"]);
  });

  it("never repairs a key: a typographic quote at a key's place leaves the reply as today", () => {
    expect(decodeModelJson("{“a”: \"x\"}", STOP).ok).toBe(false);
    // KNOWN WRONG READING, pinned as "no worse than today", not as desired behaviour: INNER_QUOTE (tried before the syntax
    // pass) reads this as one text `x", “b”: "y` because the quote after x cannot end a value before a key-less “b”. This
    // fix does not touch INNER_QUOTE, so it reads the same as before it.
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

/**
 * Fix round 2 (practice debate 2026-10-16, the real GLM reply): the reply opened with an echoed fence line and a blank
 * line before its JSON. OUTERMOST_OBJECT reads prose before an object, but the syntax pass read only a reply that opens
 * with `{`, so the two never combined. Now (fix round 3, one rule for both readers), for a reply that does not open with
 * `{`, the syntax pass reads the one object of a reply shaped "prose with no brace, the object, optional prose with no
 * brace": the text from its first `{` to its last `}`, decoded whole, with no bracket repair.
 */
describe("QUOTE_DELIMITERS_STRAIGHTENED fix rounds 2-3: the syntax pass reads the one object after prose", () => {
  const FENCE_LINE = "#|DEBATEAI-FENCE-0123456789abcdef0123456789abcdef|#\n\n";
  const { description: _dropped, ...fallacyWithout } = JUDGE_VALUE.fallacy;
  const ASKED_VALUE = { ...JUDGE_VALUE, fallacy: fallacyWithout };

  it("(1) a judge-shaped reply after a fence-like line, five “…” texts: decoded and PARSED, OUTERMOST_OBJECT named first", () => {
    const reply = `${FENCE_LINE}${GLM_JUDGE_REPLY}`;
    const decoded = decodedOk(reply);
    expect(decodedRepairsOf(decoded)).toEqual(["OUTERMOST_OBJECT", "QUOTE_DELIMITERS_STRAIGHTENED"]);
    expect(decoded.value).toEqual(JUDGE_VALUE);
    expect(classifyStructuredArtifact(reply, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING)).toEqual({
      parseStatus: "PARSED", parseError: null, jsonRepair: "OUTERMOST_OBJECT",
      jsonRepairs: ["OUTERMOST_OBJECT", "QUOTE_DELIMITERS_STRAIGHTENED", "INNER_UNASKED_KEYS"] });
    const textsKept = structureRepairTextsKeptAt("JUDGE:cross-root:3->1", "served");
    expect(structureRepairKeepsWords(reply, ASKED_VALUE, JUDGE_ANSWER_FORM, { textsKept })).toBe(true);
  });

  it("(2) prose before a JSON with a trailing comma: OUTERMOST_OBJECT + TRAILING_COMMA, in the decode and the judge", () => {
    const decoded = decodedOk("Here is my answer:\n{\"a\": \"x\", \"b\": [1, 2,],}");
    expect(decodedRepairsOf(decoded)).toEqual(["OUTERMOST_OBJECT", "TRAILING_COMMA"]);
    expect(decoded.value).toEqual({ a: "x", b: [1, 2] });
    const judged = `Here is my answer:\n${JSON.stringify(ASKED_VALUE).replace(/\}$/u, ",}")}`;
    expect(classifyStructuredArtifact(judged, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING)).toEqual({
      parseStatus: "PARSED", parseError: null, jsonRepair: "OUTERMOST_OBJECT", jsonRepairs: ["OUTERMOST_OBJECT", "TRAILING_COMMA"] });
  });

  it("(3) prose before a JSON that a round-1 guard refuses stays refused", () => {
    for (const json of ["{\"a\": “x\", \"b\": “y”}", "{\"flags\": [\"a\", “b\", “c”]}", "{\"a\": “He said “yes”, \"b\": “no”}"]) {
      const reply = `${FENCE_LINE}${json}`;
      expect(decodeModelJson(reply, STOP).ok, json).toBe(false);
      expect(classifyStructuredArtifact(reply, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING).parseStatus, json).toBe("PARSE_FAILED");
    }
    // A reply cut off at its token ceiling is still never repaired.
    expect(decodeModelJson(`${FENCE_LINE}${GLM_JUDGE_REPLY}`, { finishReason: "length" }).ok).toBe(false);
  });

  // Fix round 3 (review 2026-10-16): after prose the object is NOT chosen by the brace-span scanner (it reads only straight
  // quotes, so an odd straight quote inside a typographic text cuts it in the wrong place). Only one shape is read: prose
  // with no brace, ONE object, optional prose with no brace; that object is decoded WHOLE, with no bracket repair.
  // The reviewer's two inputs: round 2 read a CUT piece (a member dropped, or only the last member). Under round 3's rule
  // the whole object is decoded, so both now read the TRUE object, never a piece, in both readers.
  it.each([
    ["a „…\" inside “…” (round 2 dropped the last member)",
      "Here is my answer:\n{\"intro\": “He said „yes\" loudly”, \"details\": {\"note\": “Then „no\" quietly”, \"n\": 1}, \"last\": “end”}",
      { intro: "He said „yes\" loudly", details: { note: "Then „no\" quietly", n: 1 }, last: "end" }],
    ["an inch mark 5\" inside “…” (round 2 read only the last member)",
      "Answer:\n{\"tags\": [\"one\", \"two\"], \"detail\": {\"note\": “a 5\" screen”, \"inner\": {\"q\": \"a \\\"b\\\" c\"}}, \"last\": {\"t\": “final”}}",
      { tags: ["one", "two"], detail: { note: "a 5\" screen", inner: { q: "a \"b\" c" } }, last: { t: "final" } }]
  ])("(3) round 3: %s: read whole, the true object, never a cut piece", (_name, reply, truth) => {
    const decoded = decodedOk(reply);
    expect(decoded.value).toEqual(truth);
    expect(decodedRepairsOf(decoded)).toEqual(["OUTERMOST_OBJECT", "QUOTE_DELIMITERS_STRAIGHTENED"]);
    const judged = parseStructuredArtifact(reply, z.record(z.string(), z.unknown()), STOP);
    expect(judged).toMatchObject({ kind: "PARSED", strategy: "SYNTAX_REPAIRED", value: truth });
  });

  it("(3) round 3: a Romanian „da\" inside “…” after a fence line now decodes, whole", () => {
    const decoded = decodedOk(`${FENCE_LINE}{"a": “El a spus „da" și a plecat”, "b": 1}`);
    expect(decoded.value).toEqual({ a: "El a spus „da\" și a plecat", b: 1 });
    expect(decodedRepairsOf(decoded)).toEqual(["OUTERMOST_OBJECT", "QUOTE_DELIMITERS_STRAIGHTENED"]);
  });

  it("(3) round 3: prose with no brace may follow the object; a brace in the prose before or after means no syntax pass", () => {
    expect(decodedOk("Answer:\n{\"a\": “y”}\nThat is all.").value).toEqual({ a: "y" });
    // Today, straight, OUTERMOST_OBJECT keeps its own rule (the last object that decodes): untouched.
    expect(decodeModelJson("Draft {\"k\": 1} then:\n{\"a\": \"y\"}", STOP)).toEqual({ ok: true, value: { a: "y" }, repair: "OUTERMOST_OBJECT" });
    for (const reply of ["Draft {note} then:\n{\"a\": “y”}", "Draft {\"a\": “first”} then:\n{\"a\": “second”}",
      "Answer:\n{\"a\": “y”}\nNote {x}.", "Answer: } {\"a\": “y”}"]) {
      expect(decodeModelJson(reply, STOP).ok, reply).toBe(false);
    }
    // A later object that decodes strictly is OUTERMOST_OBJECT's own reading (the last that decodes), tried before the pass.
    expect(decodeModelJson("Answer:\n{\"a\": “y”}\n{\"a\": 2}", STOP)).toEqual({ ok: true, value: { a: 2 }, repair: "OUTERMOST_OBJECT" });
    const judged = `Draft {note} then:\n${GLM_JUDGE_REPLY}`;
    expect(classifyStructuredArtifact(judged, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING).parseStatus).toBe("PARSE_FAILED");
    // A reply that opens with `{` is read whole, as before: prose after the object is not dropped by the syntax pass.
    expect(decodeModelJson("{\"a\": “y”} and a note", STOP).ok).toBe(false);
  });

  it("(3) round 3: after prose no bracket repair is made (the object must decode whole)", () => {
    expect(decodeModelJson("Answer:\n{\"a\": [1, 2}", STOP).ok).toBe(false);
    expect(decodeModelJson("Answer:\n{\"a\": “x”, \"b\": [1, 2}", STOP).ok).toBe(false);
    // The same objects opening the reply keep today's bracket repairs.
    expect(decodedRepairsOf(decodedOk("{\"a\": “x”, \"b\": [1, 2}"))).toEqual(["BRACKET_INSERTED", "QUOTE_DELIMITERS_STRAIGHTENED"]);
  });

  // CI-1b: the object after prose is one slice, read once: linear in the reply.
  it.each([
    ["prose and 100 000 spans that never decode", `note ${"{\"a\": “x}".repeat(100000)}`],
    ["prose and 100 000 spans each missing one bracket", `note ${"{\"a\": [1, 2, 3, 4}".repeat(100000)}`]
  ])("answers %s in linear time", (_name, text) => {
    const started = performance.now();
    decodeModelJson(text, STOP);
    classifyStructuredArtifact(text, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
