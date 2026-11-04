/**
 * V4 start step, Task 26 (spec 2026-11-03 §4.1 "What is kept, and for how long"; plan Review Focus 1): THE SIGNED
 * REFERENCES. Before Start the lists, the menu, the check at Next and an AI-combined question live on the person's
 * page, signed so they cannot be altered, for two hours. Each reference binds the person, the question line checked
 * at Next, the plan and the settings version; a combined question binds its context, its members and its own words.
 * A forged or foreign reference is INVALID, an old one EXPIRED, one whose question, plan or version moved STALE.
 */
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StartListSchema, StartMenuSchema, type StartList, type StartMenu, type StartMergeRequest } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { questionLanguageReferenceKeyFrom } from "../../apps/api/src/question-language/reference.js";
import {
  newStartStepKey, signStartCheck, signStartCombine, signStartList, signStartMenu, startCanonicalJson, startMembersHash, startStepKeyFrom,
  verifyStartCheck, verifyStartCombine, verifyStartList, verifyStartMenu, verifyStartMergeRequest
} from "../../apps/api/src/start-step/signing.js";

const key = newStartStepKey();
const NOW = new Date("2026-11-03T10:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const QUESTION = "Should Romania build new nuclear plants?";
const BINDING = { ownerScope: "owner:4444", questionLine: QUESTION, planKey: "premium", settingsVersion: 31 } as const;

const ANGLES = [{ angle_id: "g1", kind: "PRACTICAL", label: "What it costs" }, { angle_id: "g2", kind: "ASKER_WORRY", label: "Safety" }] as const;
const listOf = (listNo: number): StartList => StartListSchema.parse({
  list_no: listNo, angles: ANGLES,
  viewpoints: [
    { viewpoint_id: `pt${listNo}1`, title: "Whole-system costs", question: "What does the whole power system cost with new plants?",
      why: "The plant price is not the whole bill.", angle_id: "g1" },
    { viewpoint_id: `pt${listNo}2`, title: "Earthquake risk", question: "How safe are plants near the Vrancea fault?",
      why: "The person may live near one.", angle_id: "g2" }
  ]
});
const LIST1 = listOf(1);
const LIST2 = listOf(2);
const MENU: StartMenu = StartMenuSchema.parse({
  menu_id: "AAAAAAAAAAAAAAAAAAAAAA", revision: 1, language: { code: "en", name: "English" }, angles: ANGLES,
  viewpoints: LIST1.viewpoints.map((one) => ({ ...one, repeat_ids: [] })), repeats: [],
  paths: LIST1.viewpoints.map((one, index) => ({ path_ref: `kp0${index + 1}`, title: one.title, question: one.question,
    viewpoint_ids: [one.viewpoint_id], put_together: false, is_new: false })),
  cards: [], suggestions: []
});

const ORIGINAL = "Ar trebui România to build new nuclear plants?";
const REWRITE = "Should Romania build new nuclear plants?";
const LOCK: QuestionLanguageLock = Object.freeze({
  language: Object.freeze({ code: "en", name: "English" }), source: "CHOICE", siteLanguage: "en", rewriteAccepted: true,
  originalQuestionLine: ORIGINAL, trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "CHOICE_USE_REWRITE", localReason: null
});
const PLAIN_LOCK: QuestionLanguageLock = Object.freeze({ ...LOCK, source: "ELD_SITE", rewriteAccepted: false, originalQuestionLine: null, recordCode: "ELD_SITE" });

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const payloadOf = (ref: string) => JSON.parse(Buffer.from(ref.split(".")[0]!, "base64url").toString("utf8")) as Record<string, unknown>;
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { return error instanceof TypedDomainError ? error.code : `UNTYPED:${String(error)}`; }
  return "NO_THROW";
};

describe("the start step's signed references (spec 2026-11-03 §4.1)", () => {
  const listRef = signStartList(key, { ...BINDING, list: LIST1, now: NOW });
  const verifyList = (over: Partial<Parameters<typeof verifyStartList>[1]> = {}) =>
    verifyStartList(key, { ...BINDING, signed: { list: LIST1, ref: listRef }, now: NOW, ...over });

  it("a list round trip: the page's signed list verifies and comes back as written", () => {
    expect(verifyList()).toEqual(LIST1);
    // Valid up to two hours to the millisecond (START_STEP_TIMING.signedLifetimeMs).
    expect(verifyList({ now: later(7_200_000) })).toEqual(LIST1);
  });

  it("the format: base64url(payload).base64url(HMAC-SHA256(key, label + payload part)); the payload holds no words", () => {
    const [payloadPart, macPart] = listRef.split(".");
    expect(Buffer.from(macPart!, "base64url")).toEqual(
      createHmac("sha256", key.bytes).update(`debateai:start-step-ref:v1\0${payloadPart!}`, "utf8").digest());
    expect(payloadOf(listRef)).toEqual({ v: 1, t: "LIST", o: sha("start-step-owner:owner:4444").slice(0, 32), q: sha(QUESTION),
      p: "premium", s: 31, e: NOW.getTime() + 7_200_000, h: sha(startCanonicalJson(LIST1)) });
    expect(Buffer.from(payloadPart!, "base64url").toString("utf8")).not.toContain("nuclear");
  });

  it.each([
    ["a changed viewpoint", () => verifyList({ signed: { list: { ...LIST1, viewpoints: [{ ...LIST1.viewpoints[0]!, question: "What does it cost?" },
      LIST1.viewpoints[1]!] }, ref: listRef } }), "START_PATHS_INVALID"],
    ["one flipped character of the signature", () => verifyList({ signed: { list: LIST1,
      ref: `${listRef.slice(0, -2)}${listRef.at(-2) === "A" ? "B" : "A"}${listRef.at(-1)!}` } }), "START_PATHS_INVALID"],
    ["one flipped character of the payload", () => verifyList({ signed: { list: LIST1, ref: `${listRef[0] === "e" ? "f" : "e"}${listRef.slice(1)}` } }),
      "START_PATHS_INVALID"],
    ["another person's list", () => verifyList({ ownerScope: "owner:5555" }), "START_PATHS_INVALID"],
    ["a menu reference handed in as a list's", () => verifyList({ signed: { list: LIST1, ref: signStartMenu(key, { ...BINDING, menu: MENU, now: NOW }) } }),
      "START_PATHS_INVALID"],
    ["another server's key", () => verifyStartList(newStartStepKey(), { ...BINDING, signed: { list: LIST1, ref: listRef }, now: NOW }), "START_PATHS_INVALID"],
    ["garbage", () => verifyList({ signed: { list: LIST1, ref: "abc" } }), "START_PATHS_INVALID"],
    ["a list past two hours", () => verifyList({ now: later(7_200_001) }), "START_PATHS_EXPIRED"],
    ["a changed question", () => verifyList({ questionLine: "Should Romania close its nuclear plants?" }), "START_PATHS_STALE"],
    ["another plan", () => verifyList({ planKey: "max" }), "START_PATHS_STALE"],
    ["another settings version", () => verifyList({ settingsVersion: 32 }), "START_PATHS_STALE"]
  ])("refuses %s", (_name, run, code) => {
    expect(codeOf(run)).toBe(code);
  });

  it("the question binds trimmed, so the page's spacing never makes a list stale", () => {
    expect(verifyList({ questionLine: `  ${QUESTION}\n` })).toEqual(LIST1);
  });

  it("a menu round trip, bound the same way", () => {
    const signed = { menu: MENU, ref: signStartMenu(key, { ...BINDING, menu: MENU, now: NOW }) };
    expect(verifyStartMenu(key, { ...BINDING, signed, now: NOW })).toEqual(MENU);
    expect(codeOf(() => verifyStartMenu(key, { ...BINDING, signed: { ...signed, menu: { ...MENU, revision: 2 } }, now: NOW }))).toBe("START_PATHS_INVALID");
    expect(codeOf(() => verifyStartMenu(key, { ...BINDING, signed, settingsVersion: 32, now: NOW }))).toBe("START_PATHS_STALE");
  });

  describe("the check at Next, after a language rewrite", () => {
    const checkRef = signStartCheck(key, { ...BINDING, questionLine: REWRITE, lock: LOCK, originalQuestionLine: ORIGINAL, now: NOW });
    const verifyCheck = (over: Partial<Parameters<typeof verifyStartCheck>[1]>) =>
      verifyStartCheck(key, { ...BINDING, questionLine: REWRITE, ref: checkRef, originalQuestionLine: undefined, now: NOW, ...over });

    it("verifies with the rewritten line; no original given skips the original's check", () => {
      expect(verifyCheck({})).toEqual({ ...LOCK, originalQuestionLine: null });
    });

    it("verifies with the original given and equal, and hands back the whole lock", () => {
      expect(verifyCheck({ originalQuestionLine: ORIGINAL })).toEqual(LOCK);
      expect(verifyCheck({ originalQuestionLine: ` ${ORIGINAL} ` })).toMatchObject({ rewriteAccepted: true, originalQuestionLine: ORIGINAL });
    });

    it.each([
      ["the original line as the question", { questionLine: ORIGINAL }],
      ["another original", { originalQuestionLine: "Ar trebui România să închidă centralele?" }],
      ["no original for a rewrite", { originalQuestionLine: null }]
    ])("is stale with %s", (_name, over) => {
      expect(codeOf(() => verifyCheck(over))).toBe("START_PATHS_STALE");
    });

    it("a check with no rewrite verifies with no original, and is stale with one", () => {
      const plain = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, now: NOW });
      expect(verifyStartCheck(key, { ...BINDING, ref: plain, originalQuestionLine: null, now: NOW })).toEqual(PLAIN_LOCK);
      expect(codeOf(() => verifyStartCheck(key, { ...BINDING, ref: plain, originalQuestionLine: QUESTION, now: NOW }))).toBe("START_PATHS_STALE");
    });

    it("its payload carries the lock without the original, and no words of either line", () => {
      const payload = payloadOf(checkRef);
      expect(payload).toMatchObject({ v: 1, t: "CHECK", q: sha(REWRITE), r: sha(ORIGINAL) });
      expect(JSON.stringify(payload)).not.toContain("nuclear");
      expect(JSON.stringify(payload)).not.toContain("România");
      expect(codeOf(() => verifyStartList(key, { ...BINDING, questionLine: REWRITE, signed: { list: LIST1, ref: checkRef }, now: NOW })))
        .toBe("START_PATHS_INVALID");
    });
  });

  describe("an AI-combined question", () => {
    const members = [
      { viewpoint_id: "pt11", pick_no: null, title: "Whole-system costs", question: "What does the whole power system cost with new plants?" },
      { viewpoint_id: null, pick_no: null, title: null, question: "I worry about earthquakes near the plants." }
    ] as const;
    const context = { kind: "MENU", menuId: "AAAAAAAAAAAAAAAAAAAAAA" } as const;
    const words = { title: "Cost and safety", question: "Are new plants worth their cost and their earthquake risk?" };
    const membersHash = startMembersHash(members);
    const combineRef = signStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words, now: NOW });
    const verifyCombine = (over: Partial<Parameters<typeof verifyStartCombine>[1]>) =>
      verifyStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words, ref: combineRef, now: NOW, ...over });

    it("the members hash is order-free and changes with any member's words", () => {
      expect(startMembersHash([members[1], members[0]])).toBe(membersHash);
      expect(startMembersHash([members[0], { ...members[1], question: "I worry about waste." }])).not.toBe(membersHash);
    });

    it("its ref is bound to its own words, its members, its context and its person", () => {
      expect(verifyCombine({})).toBeUndefined();
      expect(codeOf(() => verifyCombine({ title: "Cost, and safety" }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ question: "Are new plants worth it?" }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ membersHash: startMembersHash([members[0], { ...members[1], question: "I worry about waste." }]) })))
        .toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ context: { kind: "MENU", menuId: "BBBBBBBBBBBBBBBBBBBBBB" } }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ context: { kind: "DIG", parentRunId: "4c7b1a64-8f2e-4d55-9a3b-0e6f2d1c9b77" } }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ ownerScope: "owner:5555" }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ now: later(7_200_001) }))).toBe("START_PATHS_EXPIRED");
    });

    it("carries the context, the members hash and the words' hash, and no question, plan or version", () => {
      expect(payloadOf(combineRef)).toEqual({ v: 1, t: "COMBINE", o: sha("start-step-owner:owner:4444").slice(0, 32),
        c: startCanonicalJson(context), m: membersHash, h: sha(`${words.title}\0${words.question}`), e: NOW.getTime() + 7_200_000 });
    });
  });

  describe("the merge request", () => {
    const signedList = (list: StartList) => ({ list, ref: signStartList(key, { ...BINDING, list, now: NOW }) });
    const request = (over: Partial<StartMergeRequest>): StartMergeRequest => ({
      question_line: QUESTION, check_ref: signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, now: NOW }),
      reading_level: "plain", lists: [signedList(LIST1)], ...over });
    const verifyMerge = (over: Partial<StartMergeRequest>) => verifyStartMergeRequest(key, { ...BINDING, request: request(over), now: NOW });

    it("verifies the check, every list and the prior menu", () => {
      expect(verifyMerge({ lists: [signedList(LIST1), signedList(LIST2)] })).toEqual({ lock: PLAIN_LOCK, lists: [LIST1, LIST2], prior: null });
      const prior = { menu: MENU, ref: signStartMenu(key, { ...BINDING, menu: MENU, now: NOW }) };
      expect(verifyMerge({ lists: [signedList(LIST2)], prior_menu: prior })).toEqual({ lock: PLAIN_LOCK, lists: [LIST2], prior: MENU });
    });

    it.each([
      ["a list number twice", { lists: [signedList(LIST1), signedList(LIST1)] }],
      ["a late list already merged into the prior menu", { lists: [signedList(LIST1)],
        prior_menu: { menu: MENU, ref: signStartMenu(key, { ...BINDING, menu: MENU, now: NOW }) } }],
      ["a list signed for someone else", { lists: [{ list: LIST1, ref: signStartList(key, { ...BINDING, ownerScope: "owner:5555", list: LIST1, now: NOW }) }] }]
    ])("refuses %s", (_name, over) => {
      expect(codeOf(() => verifyMerge(over))).toBe("START_PATHS_INVALID");
    });

    it("is stale when the check was for another question", () => {
      const other = signStartCheck(key, { ...BINDING, questionLine: "Should Romania close its nuclear plants?", lock: PLAIN_LOCK, originalQuestionLine: null, now: NOW });
      expect(codeOf(() => verifyMerge({ check_ref: other }))).toBe("START_PATHS_STALE");
    });
  });

  it("its own key: HKDF over the root with its own salt and label, never the question-language key; a short root is refused", () => {
    const root = Buffer.alloc(32, 7);
    const own = startStepKeyFrom(root);
    expect(own.bytes).toEqual(Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:start-step:v1"), Buffer.from("start-step-ref-v1"), 32)));
    expect(own.bytes.equals(questionLanguageReferenceKeyFrom(root).bytes)).toBe(false);
    expect(own.bytes.equals(root)).toBe(false);
    expect(codeOf(() => startStepKeyFrom(Buffer.alloc(31, 7)))).toBe("START_STEP_KEY_ROOT_INVALID");
  });

  it("canonical JSON: keys sorted at every depth, arrays in order, no spaces", () => {
    expect(startCanonicalJson({ b: 1, a: [{ d: "x", c: null }, 2], e: undefined })).toBe('{"a":[{"c":null,"d":"x"},2],"b":1}');
    expect(codeOf(() => startCanonicalJson({ a: Number.NaN }))).not.toBe("NO_THROW");
  });

  it("every refusal is a typed error whose message is its code (never the words)", () => {
    let caught: unknown;
    try { verifyList({ questionLine: "Should Romania close its nuclear plants?" }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TypedDomainError);
    expect((caught as TypedDomainError).message).toBe("START_PATHS_STALE");
  });
});
