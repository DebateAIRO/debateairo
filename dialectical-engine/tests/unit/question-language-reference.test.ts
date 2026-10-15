import { hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  newQuestionLanguageReferenceKey, questionLanguageReferenceKeyFrom, signQuestionLanguageReference, verifyQuestionLanguageChoice
} from "../../apps/api/src/question-language/reference.js";

const key = newQuestionLanguageReferenceKey();
const NOW = new Date("2026-10-13T10:00:00.000Z");
const ORIGINAL = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const ref = signQuestionLanguageReference(key, { ownerScope: "owner:a", site: "ro", questionLine: ORIGINAL, proposed: REWRITE, main: "ro", now: NOW });
const verify = (over: Partial<{ ownerScope: string; questionLine: string; choice: any; now: Date }>, k = key) =>
  verifyQuestionLanguageChoice(k, { ownerScope: "owner:a", questionLine: REWRITE, now: NOW,
    choice: { check_ref: ref, choice: "USE_REWRITE", original_question_line: ORIGINAL }, ...over });

describe("the check reference (question-language spec 2026-10-13: the server decides)", () => {
  it("accepts the server's own rewrite and the person's own wording, locking the checked language", () => {
    expect(verify({})).toEqual({ main: "ro", site: "ro", rewriteAccepted: true, originalQuestionLine: ORIGINAL });
    expect(verify({ questionLine: ORIGINAL, choice: { check_ref: ref, choice: "KEEP_MINE" } }))
      .toEqual({ main: "ro", site: "ro", rewriteAccepted: false, originalQuestionLine: null });
    expect(verify({ now: new Date(NOW.getTime() + 14 * 60_000) }).main).toBe("ro");
  });

  it.each([
    ["a rewrite the page made up", { questionLine: "Ar trebui România să adopte euro?" }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["the reference reused for another question", { questionLine: "Altă întrebare?", choice: { check_ref: ref, choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["a rewrite with another original", { choice: { check_ref: ref, choice: "USE_REWRITE", original_question_line: "x" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["a rewrite with no original", { choice: { check_ref: ref, choice: "USE_REWRITE" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["KEEP_MINE sent with the server's rewrite as the question", { choice: { check_ref: ref, choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["another person's reference", { ownerScope: "owner:b" }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["an expired reference", { now: new Date(NOW.getTime() + 15 * 60_000 + 1) }, "QUESTION_LANGUAGE_CHECK_EXPIRED"],
    ["garbage", { choice: { check_ref: "abc", choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["an empty reference", { choice: { check_ref: "", choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["a truncated reference", { choice: { check_ref: ref.slice(0, ref.length - 5), choice: "USE_REWRITE", original_question_line: ORIGINAL } }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["a reference with no signature", { choice: { check_ref: ref.split(".")[0]!, choice: "USE_REWRITE", original_question_line: ORIGINAL } }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["a reference with an extra part", { choice: { check_ref: `${ref}.x`, choice: "USE_REWRITE", original_question_line: ORIGINAL } }, "QUESTION_LANGUAGE_CHECK_INVALID"]
  ])("refuses %s", (_name, over, code) => {
    expect(() => verify(over as never)).toThrow(code);
  });

  it("every refusal is a typed domain error carrying its code (never a 500)", () => {
    let caught: unknown;
    try { verify({ choice: { check_ref: "not.a-token", choice: "KEEP_MINE" } }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TypedDomainError);
    expect((caught as TypedDomainError).code).toBe("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("refuses a made-up language: an edited payload fails the signature", () => {
    const [payload, mac] = ref.split(".");
    const edited = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    edited.m = "en";
    const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${mac!}`;
    expect(() => verify({ choice: { check_ref: forged, choice: "USE_REWRITE", original_question_line: ORIGINAL } })).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("refuses a forged signature: one changed signature byte, or a signature of the right length made up", () => {
    const [payload, mac] = ref.split(".");
    const bytes = Buffer.from(mac!, "base64url");
    bytes[0] = bytes[0]! ^ 1;
    const flipped = `${payload!}.${bytes.toString("base64url")}`;
    const madeUp = `${payload!}.${Buffer.alloc(32, 7).toString("base64url")}`;
    for (const forged of [flipped, madeUp]) {
      expect(() => verify({ choice: { check_ref: forged, choice: "USE_REWRITE", original_question_line: ORIGINAL } })).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
    }
  });

  it("a reference signed with another key is invalid, so the page checks again", () => {
    expect(() => verify({}, newQuestionLanguageReferenceKey())).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("CR-5: two API processes of one deployment derive the same key from the same root, and verify each other", () => {
    const root = Buffer.alloc(32, 9);
    const first = questionLanguageReferenceKeyFrom(root);
    const second = questionLanguageReferenceKeyFrom(Buffer.from(root));
    const shared = signQuestionLanguageReference(first, { ownerScope: "owner:a", site: "ro", questionLine: ORIGINAL, proposed: REWRITE, main: "ro", now: NOW });
    expect(verifyQuestionLanguageChoice(second, { ownerScope: "owner:a", questionLine: REWRITE, now: NOW,
      choice: { check_ref: shared, choice: "USE_REWRITE", original_question_line: ORIGINAL } }).main).toBe("ro");
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.bytes.equals(root)).toBe(false);
    expect(questionLanguageReferenceKeyFrom(Buffer.alloc(32, 8)).bytes.equals(first.bytes)).toBe(false);
    expect(() => verifyQuestionLanguageChoice(questionLanguageReferenceKeyFrom(Buffer.alloc(32, 8)), { ownerScope: "owner:a", questionLine: REWRITE, now: NOW,
      choice: { check_ref: shared, choice: "USE_REWRITE", original_question_line: ORIGINAL } })).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
    expect(() => questionLanguageReferenceKeyFrom(Buffer.alloc(16, 9))).toThrow("QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID");
  });

  it("CR-5: the key is HKDF-SHA-256 of the root under its own purpose label, never the social-auth flow key", () => {
    const root = Buffer.alloc(32, 9);
    const wanted = Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:question-language:v1"), Buffer.from("question-language-check-v1"), 32));
    const socialFlowKey = Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:social:v1"), Buffer.from("state-derived-nonce-and-pkce"), 32));
    expect(questionLanguageReferenceKeyFrom(root).bytes.equals(wanted)).toBe(true);
    expect(questionLanguageReferenceKeyFrom(root).bytes.equals(socialFlowKey)).toBe(false);
  });

  it("carries hashes and codes only, never question text", () => {
    const payload = Buffer.from(ref.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("România");
    expect(payload).not.toContain("owner:a");
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(["e", "m", "o", "p", "q", "s", "v"]);
  });
});
