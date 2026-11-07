/**
 * V4 start step, Task 26 (spec 2026-11-03 §4.1 "What is kept, and for how long"; plan Review Focus 1): THE SIGNED
 * REFERENCES. Before Start the lists, the menu, the check at Next and an AI-combined question live on the person's
 * page, signed so they cannot be altered. Each reference binds the person, the question line checked at Next, the
 * plan and the settings version; a combined question binds its context, its members and its own words. A forged or
 * foreign reference is INVALID; one whose question, plan or version moved is STALE where that is compared.
 *
 * Task 26b (read-d2, choose-d2; the owner's answer Q8 of 4 Nov, "Your rule, no time limit"): no reference has a
 * lifetime, so none is ever out of date by time. The question is not compared when it changed on step 2
 * (`questionLine: null`), nor the settings version after a site update (`settingsVersion: null`); the plan always is.
 * One merge request is one reading, under one version.
 */
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartListSchema, StartMenuSchema, type StartList, type StartMenu, type StartMergeRequest } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { questionLanguageReferenceKeyFrom } from "../../apps/api/src/question-language/reference.js";
import {
  newStartStepKey, newStartTryRef, signStartCheck, signStartCombine, signStartList, signStartMenu, startCanonicalJson, startDigTryRefOf,
  startMembersHash, startRefQuestionOf, startRefVersionOf, startStepKeyFrom, startTryRefOfCheck, verifyStartCheck, verifyStartCombine, verifyStartList,
  verifyStartMenu, verifyStartMergeRequest
} from "../../apps/api/src/start-step/signing.js";

const key = newStartStepKey();
const NOW = new Date("2026-11-03T10:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const THIRTY_DAYS = 30 * 86_400_000;
const QUESTION = "Should Romania build new nuclear plants?";
const OTHER_QUESTION = "Should Romania close its nuclear plants?";
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
/** One character of the signature changed. */
const flippedMac = (ref: string) => `${ref.slice(0, -2)}${ref.at(-2) === "A" ? "B" : "A"}${ref.at(-1)!}`;
/** One character of the payload changed. */
const flippedPayload = (ref: string) => `${ref[0] === "e" ? "f" : "e"}${ref.slice(1)}`;
/**
 * Task 26b: the fake system clock, from NOW. No sign or verify input takes a time any more, so a clock moved on is the
 * only way a lifetime could still show; each case that moves it shows none does.
 */
const clockAtNow = () => vi.useFakeTimers({ toFake: ["Date"], now: NOW });

afterEach(() => {
  vi.useRealTimers();
});

describe("the start step's signed references (spec 2026-11-03 §4.1)", () => {
  const listRef = signStartList(key, { ...BINDING, list: LIST1 });
  const verifyList = (over: Partial<Parameters<typeof verifyStartList>[1]> = {}) =>
    verifyStartList(key, { ...BINDING, signed: { list: LIST1, ref: listRef }, ...over });

  it("a list round trip: the page's signed list verifies and comes back as written", () => {
    expect(verifyList()).toEqual(LIST1);
    // Task 26b (the owner's answer Q8): no lifetime. In place of Task 26's "valid up to two hours to the millisecond",
    // the fake system clock moved 30 days on changes nothing.
    clockAtNow();
    vi.setSystemTime(later(THIRTY_DAYS));
    expect(verifyList()).toEqual(LIST1);
  });

  it("the format: base64url(payload).base64url(HMAC-SHA256(key, label + payload part)); the payload holds no words and no expiry", () => {
    const [payloadPart, macPart] = listRef.split(".");
    expect(Buffer.from(macPart!, "base64url")).toEqual(
      createHmac("sha256", key.bytes).update(`debateai:start-step-ref:v1\0${payloadPart!}`, "utf8").digest());
    expect(payloadOf(listRef)).toEqual({ v: 1, t: "LIST", o: sha("start-step-owner:owner:4444").slice(0, 32), q: sha(QUESTION),
      p: "premium", s: 31, h: sha(startCanonicalJson(LIST1)) });
    expect(Buffer.from(payloadPart!, "base64url").toString("utf8")).not.toContain("nuclear");
  });

  it.each([
    ["a changed viewpoint", () => verifyList({ signed: { list: { ...LIST1, viewpoints: [{ ...LIST1.viewpoints[0]!, question: "What does it cost?" },
      LIST1.viewpoints[1]!] }, ref: listRef } }), "START_PATHS_INVALID"],
    ["one flipped character of the signature", () => verifyList({ signed: { list: LIST1, ref: flippedMac(listRef) } }), "START_PATHS_INVALID"],
    ["one flipped character of the payload", () => verifyList({ signed: { list: LIST1, ref: flippedPayload(listRef) } }), "START_PATHS_INVALID"],
    ["another person's list", () => verifyList({ ownerScope: "owner:5555" }), "START_PATHS_INVALID"],
    ["a menu reference handed in as a list's", () => verifyList({ signed: { list: LIST1, ref: signStartMenu(key, { ...BINDING, menu: MENU }) } }),
      "START_PATHS_INVALID"],
    ["another server's key", () => verifyStartList(newStartStepKey(), { ...BINDING, signed: { list: LIST1, ref: listRef } }), "START_PATHS_INVALID"],
    ["garbage", () => verifyList({ signed: { list: LIST1, ref: "abc" } }), "START_PATHS_INVALID"],
    ["a changed question", () => verifyList({ questionLine: OTHER_QUESTION }), "START_PATHS_STALE"],
    ["another plan", () => verifyList({ planKey: "max" }), "START_PATHS_STALE"],
    ["another settings version", () => verifyList({ settingsVersion: 32 }), "START_PATHS_STALE"]
  ])("refuses %s", (_name, run, code) => {
    expect(codeOf(run)).toBe(code);
  });

  it("a list 30 days old verifies (Task 26b: no lifetime, the owner's answer Q8; Task 26 refused it past two hours)", () => {
    clockAtNow();
    const signed = { list: LIST2, ref: signStartList(key, { ...BINDING, list: LIST2 }) };
    vi.setSystemTime(later(THIRTY_DAYS));
    expect(verifyStartList(key, { ...BINDING, signed })).toEqual(LIST2);
  });

  it("a reference signed before Task 26b, its old expiry long past, still verifies: a stray `e` is ignored", () => {
    // A page left open over the release that brings Task 26b holds references Task 26 signed with an expiry (answer Q8:
    // a site update keeps the paths).
    const payloadPart = Buffer.from(JSON.stringify({ ...payloadOf(listRef), e: NOW.getTime() - 1 }), "utf8").toString("base64url");
    const old = `${payloadPart}.${createHmac("sha256", key.bytes).update(`debateai:start-step-ref:v1\0${payloadPart}`, "utf8").digest("base64url")}`;
    expect(verifyList({ signed: { list: LIST1, ref: old } })).toEqual(LIST1);
  });

  it("a settings version that moved is not compared when the check leaves it out (Task 26b, answer Q8: a site update keeps the paths)", () => {
    expect(codeOf(() => verifyList({ settingsVersion: 32 }))).toBe("START_PATHS_STALE");
    expect(verifyList({ settingsVersion: null })).toEqual(LIST1);
  });

  it("a question changed on step 2 is not compared when the check leaves it out (Task 26b, read-d2); the plan, the person and the content still are", () => {
    const otherRef = signStartList(key, { ...BINDING, questionLine: OTHER_QUESTION, list: LIST1 });
    expect(verifyList({ questionLine: null })).toEqual(LIST1);
    expect(verifyList({ questionLine: null, signed: { list: LIST1, ref: otherRef } })).toEqual(LIST1);
    expect(codeOf(() => verifyList({ questionLine: null, planKey: "max" }))).toBe("START_PATHS_STALE");
    expect(codeOf(() => verifyList({ questionLine: null, ownerScope: "owner:5555" }))).toBe("START_PATHS_INVALID");
    expect(codeOf(() => verifyList({ questionLine: null, signed: { list: LIST1, ref: flippedMac(listRef) } }))).toBe("START_PATHS_INVALID");
    expect(codeOf(() => verifyList({ questionLine: null, settingsVersion: null, planKey: "max" }))).toBe("START_PATHS_STALE");
  });

  it("refuses a reference of another kind even when it signs the very same content (the kind check alone)", () => {
    // Wave 2 review fix (Task 26): in every cross-kind case above the content hash differs too, so only this one shows the kind
    // check. A menu reference sealed over the list's own words matches the list's reference in all but its kind.
    const sameContentMenuRef = signStartMenu(key, { ...BINDING, menu: LIST1 as unknown as StartMenu });
    expect({ ...payloadOf(sameContentMenuRef), t: "LIST" }).toEqual(payloadOf(listRef));
    expect(codeOf(() => verifyList({ signed: { list: LIST1, ref: sameContentMenuRef } }))).toBe("START_PATHS_INVALID");
    const sameContentListRef = signStartList(key, { ...BINDING, list: MENU as unknown as StartList });
    expect(codeOf(() => verifyStartMenu(key, { ...BINDING, signed: { menu: MENU, ref: sameContentListRef } }))).toBe("START_PATHS_INVALID");
  });

  it("the question binds trimmed, so the page's spacing never makes a list stale", () => {
    expect(verifyList({ questionLine: `  ${QUESTION}\n` })).toEqual(LIST1);
  });

  it("a menu round trip, bound the same way", () => {
    const signed = { menu: MENU, ref: signStartMenu(key, { ...BINDING, menu: MENU }) };
    expect(verifyStartMenu(key, { ...BINDING, signed })).toEqual(MENU);
    expect(codeOf(() => verifyStartMenu(key, { ...BINDING, signed: { ...signed, menu: { ...MENU, revision: 2 } } }))).toBe("START_PATHS_INVALID");
    expect(codeOf(() => verifyStartMenu(key, { ...BINDING, signed, settingsVersion: 32 }))).toBe("START_PATHS_STALE");
    // Task 26b: neither the question nor the version compared.
    expect(verifyStartMenu(key, { ...BINDING, signed, questionLine: null, settingsVersion: null })).toEqual(MENU);
  });

  describe("the check at Next, after a language rewrite", () => {
    const checkRef = signStartCheck(key, { ...BINDING, questionLine: REWRITE, lock: LOCK, originalQuestionLine: ORIGINAL });
    const verifyCheck = (over: Partial<Parameters<typeof verifyStartCheck>[1]>) =>
      verifyStartCheck(key, { ...BINDING, questionLine: REWRITE, ref: checkRef, originalQuestionLine: undefined, ...over });

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

    it("verifies with neither the question nor the version compared (Task 26b: read-d2, answer Q8); the original's rule still holds", () => {
      const open = { questionLine: null, settingsVersion: null } as const;
      expect(verifyCheck(open)).toEqual({ ...LOCK, originalQuestionLine: null });
      expect(verifyCheck({ ...open, originalQuestionLine: ORIGINAL })).toEqual(LOCK);
      expect(codeOf(() => verifyCheck({ ...open, originalQuestionLine: null }))).toBe("START_PATHS_STALE");
      expect(codeOf(() => verifyCheck({ ...open, originalQuestionLine: "Ar trebui România să închidă centralele?" }))).toBe("START_PATHS_STALE");
      expect(codeOf(() => verifyCheck({ ...open, planKey: "max" }))).toBe("START_PATHS_STALE");
      expect(codeOf(() => verifyCheck({ ...open, ownerScope: "owner:5555" }))).toBe("START_PATHS_INVALID");
    });

    it("a check with no rewrite verifies with no original, and is stale with one", () => {
      const plain = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null });
      expect(verifyStartCheck(key, { ...BINDING, ref: plain, originalQuestionLine: null })).toEqual(PLAIN_LOCK);
      expect(codeOf(() => verifyStartCheck(key, { ...BINDING, ref: plain, originalQuestionLine: QUESTION }))).toBe("START_PATHS_STALE");
    });

    it("its payload carries the lock without the original, and no words of either line", () => {
      const payload = payloadOf(checkRef);
      expect(payload).toMatchObject({ v: 1, t: "CHECK", q: sha(REWRITE), r: sha(ORIGINAL) });
      expect(payload).not.toHaveProperty("e");
      expect(JSON.stringify(payload)).not.toContain("nuclear");
      expect(JSON.stringify(payload)).not.toContain("România");
      expect(codeOf(() => verifyStartList(key, { ...BINDING, questionLine: REWRITE, signed: { list: LIST1, ref: checkRef } })))
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
    const combineRef = signStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words });
    const verifyCombine = (over: Partial<Parameters<typeof verifyStartCombine>[1]>) =>
      verifyStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words, ref: combineRef, ...over });

    it("the members hash is order-free and changes with any member's words", () => {
      expect(startMembersHash([members[1], members[0]])).toBe(membersHash);
      expect(startMembersHash([members[0], { ...members[1], question: "I worry about waste." }])).not.toBe(membersHash);
    });

    it("its ref is bound to its own words, its members, its context and its person, and never goes out of date", () => {
      expect(verifyCombine({})).toBeUndefined();
      expect(codeOf(() => verifyCombine({ title: "Cost, and safety" }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ question: "Are new plants worth it?" }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ membersHash: startMembersHash([members[0], { ...members[1], question: "I worry about waste." }]) })))
        .toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ context: { kind: "MENU", menuId: "BBBBBBBBBBBBBBBBBBBBBB" } }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ context: { kind: "DIG", parentRunId: "4c7b1a64-8f2e-4d55-9a3b-0e6f2d1c9b77" } }))).toBe("START_PATHS_INVALID");
      expect(codeOf(() => verifyCombine({ ownerScope: "owner:5555" }))).toBe("START_PATHS_INVALID");
      // Task 26b (answer Q8), in place of Task 26's EXPIRED case: the fake system clock moved 30 days on changes nothing.
      clockAtNow();
      vi.setSystemTime(later(THIRTY_DAYS));
      expect(verifyCombine({})).toBeUndefined();
    });

    it("a combined question 30 days old verifies (Task 26b: no lifetime, the owner's answer Q8; Task 26 refused it past two hours)", () => {
      // Review fix (wave 3): the ref above is signed when the file loads, on the real clock, so the case above moves it less than
      // 30 days on (and not at all once the real date passes NOW + 30 days). This one is signed at NOW on the fake clock, as Task 26's
      // EXPIRED case signed at NOW, so it is always exactly 30 days old.
      clockAtNow();
      const ref = signStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words });
      vi.setSystemTime(later(THIRTY_DAYS));
      expect(verifyStartCombine(key, { ownerScope: BINDING.ownerScope, context, membersHash, ...words, ref })).toBeUndefined();
    });

    it("carries the context, the members hash and the words' hash, and no question, plan, version or expiry", () => {
      expect(payloadOf(combineRef)).toEqual({ v: 1, t: "COMBINE", o: sha("start-step-owner:owner:4444").slice(0, 32),
        c: startCanonicalJson(context), m: membersHash, h: sha(`${words.title}\0${words.question}`) });
    });
  });

  describe("the merge request", () => {
    const signedList = (list: StartList, settingsVersion: number = BINDING.settingsVersion) =>
      ({ list, ref: signStartList(key, { ...BINDING, settingsVersion, list }) });
    const signedMenu = (settingsVersion: number = BINDING.settingsVersion) =>
      ({ menu: MENU, ref: signStartMenu(key, { ...BINDING, settingsVersion, menu: MENU }) });
    const checkUnder = (settingsVersion: number) => signStartCheck(key, { ...BINDING, settingsVersion, lock: PLAIN_LOCK, originalQuestionLine: null });
    const request = (over: Partial<StartMergeRequest>): StartMergeRequest => ({
      question_line: QUESTION, check_ref: checkUnder(BINDING.settingsVersion), reading_level: "plain", lists: [signedList(LIST1)], ...over });
    // Task 26b: the merge takes no settings version; the reading's own is not compared with the active one (answer Q8).
    const verifyMerge = (over: Partial<StartMergeRequest>) => verifyStartMergeRequest(key,
      { ownerScope: BINDING.ownerScope, questionLine: QUESTION, planKey: BINDING.planKey, request: request(over) });

    it("verifies the check, every list and the prior menu, and names the reading's version", () => {
      expect(verifyMerge({ lists: [signedList(LIST1), signedList(LIST2)] }))
        .toEqual({ lock: PLAIN_LOCK, lists: [LIST1, LIST2], prior: null, readingVersion: 31 });
      expect(verifyMerge({ lists: [signedList(LIST2)], prior_menu: signedMenu() }))
        .toEqual({ lock: PLAIN_LOCK, lists: [LIST2], prior: MENU, readingVersion: 31 });
    });

    it("a reading under an older settings version verifies and names that version (Task 26b, answer Q8: the merge signs its menu with it)", () => {
      expect(verifyMerge({ check_ref: checkUnder(30), lists: [signedList(LIST1, 30), signedList(LIST2, 30)] }))
        .toEqual({ lock: PLAIN_LOCK, lists: [LIST1, LIST2], prior: null, readingVersion: 30 });
      expect(verifyMerge({ check_ref: checkUnder(30), lists: [signedList(LIST2, 30)], prior_menu: signedMenu(30) }))
        .toEqual({ lock: PLAIN_LOCK, lists: [LIST2], prior: MENU, readingVersion: 30 });
    });

    it.each([
      ["a list signed under 31 beside a check signed under 30", { check_ref: checkUnder(30), lists: [signedList(LIST1, 30), signedList(LIST2, 31)] }],
      ["a prior menu signed under 31 beside a check and a list signed under 30", { check_ref: checkUnder(30), lists: [signedList(LIST2, 30)],
        prior_menu: signedMenu(31) }]
    ])("is stale with %s: one merge is one reading (Task 26b)", (_name, over) => {
      expect(codeOf(() => verifyMerge(over))).toBe("START_PATHS_STALE");
    });

    it.each([
      ["a list number twice", { lists: [signedList(LIST1), signedList(LIST1)] }],
      ["a late list already merged into the prior menu", { lists: [signedList(LIST1)], prior_menu: signedMenu() }],
      ["a list signed for someone else", { lists: [{ list: LIST1, ref: signStartList(key, { ...BINDING, ownerScope: "owner:5555", list: LIST1 }) }] }]
    ])("refuses %s", (_name, over) => {
      expect(codeOf(() => verifyMerge(over))).toBe("START_PATHS_INVALID");
    });

    it("is stale when the check was for another question", () => {
      const other = signStartCheck(key, { ...BINDING, questionLine: OTHER_QUESTION, lock: PLAIN_LOCK, originalQuestionLine: null });
      expect(codeOf(() => verifyMerge({ check_ref: other }))).toBe("START_PATHS_STALE");
    });
  });

  describe("what a reference was read under (Task 26b: Start tells one reading from another without comparing the line)", () => {
    const checkRef = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null });
    const menuRef = signStartMenu(key, { ...BINDING, menu: MENU });
    const otherCheckRef = signStartCheck(key, { ...BINDING, questionLine: OTHER_QUESTION, lock: PLAIN_LOCK, originalQuestionLine: null });
    const otherListRef = signStartList(key, { ...BINDING, questionLine: OTHER_QUESTION, list: LIST1 });
    const combineRef = signStartCombine(key, { ownerScope: BINDING.ownerScope, context: { kind: "MENU", menuId: MENU.menu_id },
      membersHash: startMembersHash([]), title: "Cost", question: "What does it cost?" });

    it("startRefQuestionOf: one value for the check, a list and the menu of one reading, another for another reading", () => {
      expect(startRefQuestionOf(key, checkRef)).toBe(sha(QUESTION));
      expect(startRefQuestionOf(key, listRef)).toBe(startRefQuestionOf(key, checkRef));
      expect(startRefQuestionOf(key, menuRef)).toBe(startRefQuestionOf(key, checkRef));
      expect(startRefQuestionOf(key, otherListRef)).toBe(startRefQuestionOf(key, otherCheckRef));
      expect(startRefQuestionOf(key, otherCheckRef)).not.toBe(startRefQuestionOf(key, checkRef));
    });

    it("startRefQuestionOf: null, never a throw, for a tampered ref, a combine ref, another key's ref and any other string", () => {
      const others = [flippedMac(listRef), flippedPayload(listRef), combineRef, "x.y", "", "abc", signStartList(newStartStepKey(), { ...BINDING, list: LIST1 })];
      expect(others.map((ref) => startRefQuestionOf(key, ref))).toEqual(others.map(() => null));
    });

    it("startRefVersionOf: the settings version a ref was signed under; null for a tampered ref or any other string", () => {
      expect(startRefVersionOf(key, listRef)).toBe(31);
      expect(startRefVersionOf(key, checkRef)).toBe(31);
      expect(startRefVersionOf(key, signStartMenu(key, { ...BINDING, settingsVersion: 30, menu: MENU }))).toBe(30);
      const others = [flippedMac(listRef), flippedPayload(listRef), combineRef, "x.y", ""];
      expect(others.map((ref) => startRefVersionOf(key, ref))).toEqual(others.map(() => null));
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
    try { verifyList({ questionLine: OTHER_QUESTION }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TypedDomainError);
    expect((caught as TypedDomainError).message).toBe("START_PATHS_STALE");
  });
});

/*
 * Task 57c (the owner's 5 Nov answer Q20 A and its follow-up: a failed question gives back its path-list charge) and Task 57d (the owner's
 * 6 Nov answer, card "Privacy": "Random id"): THE TRY a call before Start is charged to. A random id minted once per reading, carried
 * inside the signed check, so the merge, a combine on its menu, the fit and Start read it back from the check; nothing made from the
 * question's words is ever a try (0165 stores it). A dig's combine is charged to its parent's try.
 */
describe("the try a call before Start is charged to (Tasks 57c, 57d)", () => {
  it("a new try is random: 64 lower-case hex characters, never the same twice", () => {
    const made = newStartTryRef();
    expect(made).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set(Array.from({ length: 64 }, () => newStartTryRef())).size).toBe(64);
  });

  it("the check carries its reading's try: the same words, person, plan and version read twice give two checks with two tries", () => {
    const [first, second] = [newStartTryRef(), newStartTryRef()];
    const one = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, tryRef: first });
    const two = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, tryRef: second });
    expect(startTryRefOfCheck(key, BINDING.ownerScope, one)).toBe(first);
    expect(startTryRefOfCheck(key, BINDING.ownerScope, two)).toBe(second);
    expect(second).not.toBe(first);
    // The member is the payload's last, and the check verifies as before.
    expect(Object.keys(payloadOf(one)).at(-1)).toBe("y");
    expect(verifyStartCheck(key, { ...BINDING, ref: one, originalQuestionLine: null })).toEqual(PLAIN_LOCK);
    // After an accepted rewrite: the reading's try, whichever line was read first.
    const rewritten = signStartCheck(key, { ...BINDING, questionLine: REWRITE, lock: LOCK, originalQuestionLine: ORIGINAL, tryRef: first });
    expect(startTryRefOfCheck(key, BINDING.ownerScope, rewritten)).toBe(first);
  });

  it("a try changed on the page breaks the check's signature: no try, and the check is INVALID", () => {
    const check = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, tryRef: newStartTryRef() });
    const payload = { ...payloadOf(check), y: newStartTryRef() };
    const forged = `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${check.split(".")[1]!}`;
    expect(startTryRefOfCheck(key, BINDING.ownerScope, forged)).toBeNull();
    expect(codeOf(() => verifyStartCheck(key, { ...BINDING, ref: forged, originalQuestionLine: null }))).toBe("START_PATHS_INVALID");
  });

  it("is none for a check that names no try, another person's check, another kind of reference, a forged one or another key's", () => {
    expect(startTryRefOfCheck(key, BINDING.ownerScope, signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null }))).toBeNull();
    const check = signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, tryRef: newStartTryRef() });
    expect(startTryRefOfCheck(key, "owner:5555", check)).toBeNull();
    expect(startTryRefOfCheck(key, BINDING.ownerScope, signStartList(key, { ...BINDING, list: LIST1 }))).toBeNull();
    expect(startTryRefOfCheck(key, BINDING.ownerScope, `${check.split(".")[0]!}.AAAA`)).toBeNull();
    expect(startTryRefOfCheck(newStartStepKey(), BINDING.ownerScope, check)).toBeNull();
  });

  it("a try of any other shape is never signed", () => {
    for (const tryRef of ["", "ab", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)]) {
      expect(() => signStartCheck(key, { ...BINDING, lock: PLAIN_LOCK, originalQuestionLine: null, tryRef }), tryRef).toThrow("START_TRY_REF_INVALID");
    }
  });

  it("a dig's combine is charged to its parent's try: one per person and parent, never a question's", () => {
    const parent = "5f0c2a8e-1b3d-4c6e-9a7b-2d4f6e8a0c1b";
    const made = startDigTryRefOf(key, { ownerScope: BINDING.ownerScope, parentRunId: parent });
    expect(made).toMatch(/^[0-9a-f]{64}$/u);
    expect(startDigTryRefOf(key, { ownerScope: BINDING.ownerScope, parentRunId: parent })).toBe(made);
    expect(startDigTryRefOf(key, { ownerScope: "owner:5555", parentRunId: parent })).not.toBe(made);
    expect(startDigTryRefOf(key, { ownerScope: BINDING.ownerScope, parentRunId: "6f0c2a8e-1b3d-4c6e-9a7b-2d4f6e8a0c1b" })).not.toBe(made);
  });

  // Task 57d: the source scan. Nothing makes a try from the words: no export does it, the try label keys the dig's parent only, and the
  // reader of a check's try hashes nothing.
  it("no try is made from the question's words anywhere (a source scan)", async () => {
    const signing = await import("../../apps/api/src/start-step/signing.js");
    expect(Object.keys(signing)).not.toContain("startTryRefOf");
    expect(Object.keys(signing)).toContain("newStartTryRef");
    const root = new URL("../../", import.meta.url);
    const sources = ["apps/api/src/", "packages/budget/src/", "packages/serve/src/"].flatMap((folder) =>
      (readdirSync(new URL(folder, root), { recursive: true }) as string[]).filter((name) => /\.tsx?$/u.test(name))
        .map((name) => [`${folder}${name}`, readFileSync(new URL(`${folder}${name}`, root), "utf8")] as const));
    expect(sources.length).toBeGreaterThan(20);
    for (const [name, text] of sources) {
      expect(text, name).not.toMatch(/\bstartTryRefOf\b(?!Check)/u);
      if (!name.endsWith("start-step/signing.ts")) expect(text, name).not.toContain("start-step-try");
    }
    const text = readFileSync(new URL("apps/api/src/start-step/signing.ts", root), "utf8");
    // The one keyed try: the dig's, of the person and the parent debate's id.
    expect([...text.matchAll(/\btryOf\(key, ([^\n;]+)\);/gu)].map((match) => match[1]!))
      .toEqual(["`${ownerOf(input.ownerScope)}\\0dig:${input.parentRunId}`"]);
    expect([...text.matchAll(/\btryOf\(/gu)]).toHaveLength(1);
    const at = text.indexOf("export function startTryRefOfCheck(");
    const reader = text.slice(at, text.indexOf("\n}\n", at));
    expect(reader).toContain("payload.o !== ownerOf(ownerScope)");
    expect(reader).not.toMatch(/tryOf|createHmac|questionOf|sha\(|\.q\b|\.r\b/u);
  });
});
