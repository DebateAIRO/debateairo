import { describe, expect, it } from "vitest";
import { CatalogLocaleCodeSchema } from "@debateai/contract/locale";
import { questionLanguageOf } from "@debateai/kernel";
import {
  FAST_CHECK_ALWAYS_SITES, REPEAT_OFFER_WINDOW, decideAfterFast, decideBeforeFast, decisionRecordCode, eldSettles, fallbackLock,
  withoutRepeatOffer, type LanguageDecision
} from "../../apps/api/src/question-language/decide.js";
import { ELD_CONFUSED_SITES, ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { EldReading } from "../../apps/api/src/question-language/eld.js";
import { readQuestionLanguageReply, type FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";

const L = (code: string, name: string) => ({ code, name });
const RO = L("ro", "Romanian"), EN = L("en", "English"), ID = L("id", "Indonesian"), CA = L("ca", "Catalan"), HR = L("hr", "Croatian");
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
const unsure: EldReading = { code: "ro", reliable: false, letters: 12, segments: [] };
const clause = (code: string, letters = ELD_TUNING.segmentMinLetters + 5) => ({ code, reliable: true, letters });
// Pre-flight PF-L20: Task 3 may put ro or en among the always-ask sites, so the "eld settles" cases use the first site
// (alphabetically) that eld may settle, never a hard-coded one.
const SETTLING_CODE = [...CatalogLocaleCodeSchema.options].sort().find((code) => !FAST_CHECK_ALWAYS_SITES.includes(code));
const SITE = questionLanguageOf(SETTLING_CODE ?? "en")!;
const OTHER = SITE.code === "en" ? "ro" : "en";
const MAX = 8192;
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const mix = (proposed: string, seen = [RO, EN]): FastCheckReading => ({ kind: "MIX", main: RO, seen, proposed });
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const MINUTE = 60_000;
const ON = { fastCheckAvailable: true, fastCheckAllowed: true } as const;

describe("the question-language decision table (question-language spec 2026-10-13)", () => {
  it("same language: eld confident and equal to the site settles it, no fast call", () => {
    expect(SETTLING_CODE, "every site always asks the fast AI: report the measured list to the controller").toBeDefined();
    expect(eldSettles(SITE, sure(SITE.code))).toBe(true);
    expect(eldSettles(SITE, sure(OTHER))).toBe(false);
    expect(eldSettles(SITE, { ...unsure, code: SITE.code })).toBe(false);
    expect(eldSettles(SITE, { code: SITE.code, reliable: true, letters: ELD_TUNING.minLetters - 1, segments: [] })).toBe(false);
    expect(decideBeforeFast(SITE, sure(SITE.code), "q", ON)).toEqual({ kind: "LOCK", language: SITE, source: "ELD_SITE" });
  });

  it("eld unsure or disagreeing: the fast AI is asked", () => {
    expect(decideBeforeFast(SITE, sure(OTHER), "q", ON)).toEqual({ kind: "ASK_FAST" });
    expect(decideBeforeFast(SITE, { ...unsure, code: SITE.code }, "q", ON)).toEqual({ kind: "ASK_FAST" });
    expect(decideBeforeFast(SITE, { code: null, reliable: false, letters: 0, segments: [] }, "q", ON)).toEqual({ kind: "ASK_FAST" });
  });

  it("ruling L-MIX: when eld sees a mix it never settles, even on the site language; a short, unsure or same-language clause is no mix", () => {
    const mixed: EldReading = { ...sure(SITE.code), segments: [clause(SITE.code), clause(OTHER)] };
    expect(eldSettles(SITE, mixed)).toBe(false);
    expect(decideBeforeFast(SITE, mixed, "q", ON)).toEqual({ kind: "ASK_FAST" });
    // Borrowed words through the clause rule: a clause too short, or unsure, or in the same language is no mix.
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), clause(OTHER, ELD_TUNING.segmentMinLetters - 1)] })).toBe(true);
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), { ...clause(OTHER), reliable: false }] })).toBe(true);
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), clause(SITE.code)] })).toBe(true);
    // The fast AI then decides: one language is locked (FAST), a real mix is offered, a DOWN check falls back to eld's whole reading.
    expect(decideAfterFast(SITE, mixed, { kind: "ONE", main: SITE }, "q", MAX)).toEqual({ kind: "LOCK", language: SITE, source: "FAST" });
    expect(decideAfterFast(SITE, mixed, { kind: "DOWN", reason: "TIMEOUT" }, "q", MAX)).toEqual({ kind: "LOCK", language: SITE, source: "FALLBACK_ELD" });
    // No paid AI: the site language, never an offer.
    expect(fallbackLock(SITE, mixed, "q", true)).toEqual({ kind: "LOCK", language: SITE, source: "LOCAL_ELD" });
  });

  it("a mix the clause rule misses: eld settles, today's lock, no offer (the ruling's accepted cost)", () => {
    const missed: EldReading = { ...sure(SITE.code), segments: [clause(SITE.code), clause(OTHER, ELD_TUNING.segmentMinLetters - 1)] };
    expect(decideBeforeFast(SITE, missed, MIX_Q, ON)).toEqual({ kind: "LOCK", language: SITE, source: "ELD_SITE" });
  });

  it("a site language eld lacks is never settled by eld, not even through an alias", () => {
    expect(eldSettles(ID, sure("ms"))).toBe(false);
    expect(eldSettles(ID, sure("id"))).toBe(false);
  });

  it("CR-2: the always-ask sites are ga, id, mt, hr and every measured confused site; eld never settles them", () => {
    expect(FAST_CHECK_ALWAYS_SITES).toEqual([...new Set(["ga", "hr", "id", "mt", ...ELD_CONFUSED_SITES])].sort());
    expect(Object.isFrozen(FAST_CHECK_ALWAYS_SITES)).toBe(true);
    expect(eldSettles(HR, sure("hr"))).toBe(false);
    for (const site of FAST_CHECK_ALWAYS_SITES) {
      expect(eldSettles(L(site, site), sure(site)), site).toBe(false);
      expect(decideBeforeFast(L(site, site), sure(site), "q", ON), site).toEqual({ kind: "ASK_FAST" });
    }
  });

  it("another language wholly (L5): the fast AI's one language is locked, no offer", () => {
    expect(decideAfterFast(RO, sure("en"), { kind: "ONE", main: EN }, "Should Romania adopt the euro before 2030?", MAX))
      .toEqual({ kind: "LOCK", language: EN, source: "FAST" });
  });

  it("a language outside our 35: the fast AI's lock and eld's fallback both keep it", () => {
    const SW = questionLanguageOf("sw")!;
    expect(decideAfterFast(RO, unsure, { kind: "ONE", main: SW }, "Je, Tanzania inapaswa kupandisha kodi ya kaboni?", MAX))
      .toEqual({ kind: "LOCK", language: SW, source: "FAST" });
    expect(fallbackLock(RO, sure("tl"), "Dapat bang taasan ng Pilipinas ang buwis sa carbon sa susunod na taon?", false))
      .toEqual({ kind: "LOCK", language: questionLanguageOf("tl")!, source: "FALLBACK_ELD" });
  });

  it("und, unknown and codes outside ISO 639-1 are never locked: the site language instead", () => {
    for (const code of ["und", "unknown", "xx", "zz-Latn"]) {
      expect(fallbackLock(RO, sure(code), "q", false), code).toEqual({ kind: "LOCK", language: RO, source: "FALLBACK_SITE" });
      expect(fallbackLock(RO, sure(code), "q", true), code).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_SITE" });
    }
    expect(fallbackLock(RO, { code: null, reliable: true, letters: 90, segments: [] }, "q", false))
      .toEqual({ kind: "LOCK", language: RO, source: "FALLBACK_SITE" });
  });

  it("script subtags: a two-script language takes the question's own script", () => {
    const cyrillic = "Да ли Србија треба да уведе порез на угљеник следеће године?";
    const latin = "Da li Srbija treba da uvede porez na ugljenik sledeće godine?";
    expect(fallbackLock(RO, sure("sr"), cyrillic, false)).toEqual({ kind: "LOCK", language: { code: "sr-Cyrl", name: "Serbian (Cyrillic script)" }, source: "FALLBACK_ELD" });
    expect(fallbackLock(RO, sure("sr"), latin, true)).toEqual({ kind: "LOCK", language: { code: "sr-Latn", name: "Serbian (Latin script)" }, source: "LOCAL_ELD" });
  });

  it("a real mix: an offer with the rewrite in the main language", () => {
    expect(decideAfterFast(RO, unsure, mix(REWRITE), MIX_Q, MAX)).toEqual({ kind: "OFFER", main: RO, seen: [RO, EN], proposed: REWRITE });
  });

  it("PF-L19: the offer names main first, each language once, at most six", () => {
    const named = ["en", "fr", "de", "es", "it", "pt"].map((code) => questionLanguageOf(code)!);
    const decision = decideAfterFast(RO, unsure, mix(REWRITE, [...named, EN, RO]), MIX_Q, MAX);
    expect(decision.kind).toBe("OFFER");
    expect(decision.kind === "OFFER" ? decision.seen.map((language) => language.code) : []).toEqual(["ro", "en", "fr", "de", "es", "it"]);
    // Six seen languages that leave out main: main is put first and the sixth is dropped.
    const without = decideAfterFast(RO, unsure, mix(REWRITE, named), MIX_Q, MAX);
    expect(without.kind === "OFFER" ? without.seen.map((language) => language.code) : []).toEqual(["ro", "en", "fr", "de", "es", "it"]);
    // The same primary language twice (two scripts or a region) counts once.
    const twice = decideAfterFast(RO, unsure, mix(REWRITE, [RO, EN, L("en-GB", "English"), L("ro-MD", "Romanian")]), MIX_Q, MAX);
    expect(twice.kind === "OFFER" ? twice.seen.map((language) => language.code) : []).toEqual(["ro", "en"]);
  });

  it("borrowed words only: the fast AI says one language, locked, no offer", () => {
    expect(decideAfterFast(RO, unsure, { kind: "ONE", main: RO }, "Merită să lucrez la un startup de AI în loc de o corporație?", MAX))
      .toEqual({ kind: "LOCK", language: RO, source: "FAST" });
  });

  it.each([
    ["an empty rewrite", mix(" "), "REWRITE_UNUSABLE:BLANK"],
    ["a rewrite equal to the question", mix(MIX_Q), "REWRITE_UNUSABLE:UNCHANGED"],
    ["a rewrite equal to the question but for spacing", mix(`  ${MIX_Q.replace(" ", "   ")} `), "REWRITE_UNUSABLE:UNCHANGED"],
    ["a rewrite too long", mix("a".repeat(MAX + 1)), "REWRITE_UNUSABLE:TOO_LONG"],
    ["a rewrite not in the main language", mix("Should Romania adopt the euro or wait until wages catch up with the rest of Europe?"), "REWRITE_UNUSABLE:OTHER_LANGUAGE"],
    ["one language seen", mix(REWRITE, [RO]), "MIX_ONE_LANGUAGE_SEEN"],
    ["the main language seen twice and nothing else", mix(REWRITE, [RO, L("ro-MD", "Romanian")]), "MIX_ONE_LANGUAGE_SEEN"]
  ])("a mix with %s locks the main language, offers nothing and records why", (_name, fast, why) => {
    expect(decideAfterFast(RO, unsure, fast, MIX_Q, MAX)).toEqual({ kind: "LOCK", language: RO, source: "FAST_MIX_NO_OFFER", rewriteRefusal: why });
  });

  it("ruling L-REWRITE (Task 5): a mix whose rewrite the reader already discarded locks main with the reader's code", () => {
    for (const refusal of ["REWRITE_UNUSABLE:BLANK", "REWRITE_UNUSABLE:TOO_LONG", "REWRITE_UNUSABLE:UNCHANGED", "REWRITE_UNUSABLE:OTHER_LANGUAGE"] as const) {
      const fast: FastCheckReading = { kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: refusal };
      expect(decideAfterFast(RO, sure("en"), fast, MIX_Q, MAX), refusal)
        .toEqual({ kind: "LOCK", language: RO, source: "FAST_MIX_NO_OFFER", rewriteRefusal: refusal });
    }
  });

  it("eld unsure and the fast AI down: the site language, never a block", () => {
    for (const reason of ["TIMEOUT", "TRANSPORT", "UNREADABLE", "UNKNOWN_LANGUAGE"] as const) {
      expect(decideAfterFast(RO, unsure, { kind: "DOWN", reason }, MIX_Q, MAX)).toEqual({ kind: "LOCK", language: RO, source: "FALLBACK_SITE" });
    }
  });

  it("eld confident on another language and the fast AI down: eld's language", () => {
    expect(decideAfterFast(RO, sure("en"), { kind: "DOWN", reason: "TIMEOUT" }, "Should Romania adopt the euro before 2030?", MAX))
      .toEqual({ kind: "LOCK", language: EN, source: "FALLBACK_ELD" });
    expect(decideAfterFast(RO, sure("ca"), { kind: "DOWN", reason: "TIMEOUT" }, "Hauria Barcelona de limitar els pisos turístics?", MAX))
      .toEqual({ kind: "LOCK", language: CA, source: "FALLBACK_ELD" });
  });

  it("a language eld lacks with the fast AI down: eld's near neighbour reads as the site", () => {
    expect(decideAfterFast(ID, sure("ms"), { kind: "DOWN", reason: "TIMEOUT" }, "Apakah Indonesia harus menaikkan pajak karbon tahun depan?", MAX))
      .toEqual({ kind: "LOCK", language: ID, source: "FALLBACK_ELD" });
    // The alias belongs to the site that lacks the language only: on another site, ms stays Malay.
    expect(fallbackLock(RO, sure("ms"), "Adakah Malaysia patut menaikkan cukai karbon tahun depan?", false))
      .toEqual({ kind: "LOCK", language: questionLanguageOf("ms")!, source: "FALLBACK_ELD" });
  });

  it("local mode (no paid AI): eld or the site language, never an offer", () => {
    expect(fallbackLock(RO, unsure, MIX_Q, true)).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_SITE" });
    expect(fallbackLock(RO, sure("en"), "Should Romania adopt the euro before 2030?", true)).toEqual({ kind: "LOCK", language: EN, source: "LOCAL_ELD" });
    // Ruling L-ROUTE: no gate means the fast check is off; the decision before the fast call is then final.
    const off = { fastCheckAvailable: false, fastCheckAllowed: true } as const;
    expect(decideBeforeFast(RO, unsure, MIX_Q, off)).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_SITE" });
    expect(decideBeforeFast(RO, sure("en"), "Should Romania adopt the euro before 2030?", off)).toEqual({ kind: "LOCK", language: EN, source: "LOCAL_ELD" });
    expect(decideBeforeFast(SITE, sure(SITE.code), "q", off)).toEqual({ kind: "LOCK", language: SITE, source: "ELD_SITE" });
  });

  it("ruling L-NOCONSENT: a signed-out person never reaches the fast AI; eld and the site language decide, no offer", () => {
    const signedOut = { fastCheckAvailable: true, fastCheckAllowed: false } as const;
    const mixed: EldReading = { ...sure("ro"), segments: [clause("ro"), clause("en")] };
    expect(decideBeforeFast(RO, mixed, MIX_Q, signedOut)).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_ELD" });
    expect(decideBeforeFast(RO, unsure, MIX_Q, signedOut)).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_SITE" });
    expect(decideBeforeFast(RO, sure("en"), "Should Romania adopt the euro before 2030?", signedOut)).toEqual({ kind: "LOCK", language: EN, source: "LOCAL_ELD" });
    expect(decideBeforeFast(ID, sure("ms"), "Apakah Indonesia harus menaikkan pajak karbon tahun depan?", signedOut))
      .toEqual({ kind: "LOCK", language: ID, source: "LOCAL_ELD" });
    expect(decideBeforeFast(SITE, sure(SITE.code), "q", signedOut)).toEqual({ kind: "LOCK", language: SITE, source: "ELD_SITE" });
  });

  it("CR-5 + ruling L-REPEAT: a second offer for the same person and question within 15 minutes locks the fast AI's main language, never a second pop-up", () => {
    expect(REPEAT_OFFER_WINDOW.ms).toBe(15 * MINUTE);
    const offer = decideAfterFast(RO, unsure, mix(REWRITE), MIX_Q, MAX);
    expect(offer.kind).toBe("OFFER");
    expect(withoutRepeatOffer(offer, null, NOW)).toBe(offer);
    expect(withoutRepeatOffer(offer, NOW - 14 * MINUTE, NOW)).toEqual({ kind: "LOCK", language: RO, source: "REPEAT_OFFER" });
    expect(withoutRepeatOffer(offer, NOW - 15 * MINUTE, NOW)).toBe(offer);
    expect(withoutRepeatOffer(offer, NOW - 30 * MINUTE, NOW)).toBe(offer);
    // A mostly-English question on the ro site: the fast AI's main language (en) is locked, as "Keep my wording" would,
    // not eld's reading and not the site language.
    const EN_MIX_Q = "Should Romania adopt the euro now, sau ar trebui să aștepte creșterea salariilor?";
    const mostlyEnglish = decideAfterFast(RO, unsure,
      { kind: "MIX", main: EN, seen: [EN, RO], proposed: "Should Romania adopt the euro now, or should it wait until wages grow?" }, EN_MIX_Q, MAX);
    expect(mostlyEnglish.kind).toBe("OFFER");
    expect(withoutRepeatOffer(mostlyEnglish, NOW - MINUTE, NOW)).toEqual({ kind: "LOCK", language: EN, source: "REPEAT_OFFER" });
    // A remembered offer from "the future" (a clock step back) is still a repeat: never two pop-ups.
    expect(withoutRepeatOffer(offer, NOW + MINUTE, NOW)).toEqual({ kind: "LOCK", language: RO, source: "REPEAT_OFFER" });
    // A lock is never touched.
    const lock = decideAfterFast(RO, unsure, { kind: "ONE", main: EN }, MIX_Q, MAX);
    expect(withoutRepeatOffer(lock, NOW - MINUTE, NOW)).toBe(lock);
  });

  it("Tasks 5 and 7 together: the fast check's reader output feeds the table", () => {
    const reply = (main: string, seen: readonly string[], isMix: boolean, proposed: string | null): string =>
      JSON.stringify({ main_language: main, languages_seen: seen, is_real_mix: isMix, proposed_question: proposed });
    const decide = (text: string, eld: EldReading = unsure) => decideAfterFast(RO, eld, readQuestionLanguageReply(text, MIX_Q), MIX_Q, MAX);
    // One language.
    expect(decide(reply("en", ["en"], false, null))).toEqual({ kind: "LOCK", language: EN, source: "FAST" });
    // A real mix with a usable rewrite: the offer.
    expect(decide(reply("ro", ["ro", "en"], true, REWRITE))).toEqual({ kind: "OFFER", main: RO, seen: [RO, EN], proposed: REWRITE });
    // A real mix whose rewrite the reader discards: main locked, the reader's code recorded.
    const unchanged = decide(reply("ro", ["ro", "en"], true, MIX_Q));
    expect(unchanged).toEqual({ kind: "LOCK", language: RO, source: "FAST_MIX_NO_OFFER", rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" });
    expect(decisionRecordCode(unchanged)).toBe("FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:UNCHANGED");
    expect(decide(reply("ro", ["ro", "en"], true, "Should Romania adopt the euro or wait until wages catch up with the rest of Europe?")))
      .toEqual({ kind: "LOCK", language: RO, source: "FAST_MIX_NO_OFFER", rewriteRefusal: "REWRITE_UNUSABLE:OTHER_LANGUAGE" });
    // A DOWN reply: the fallback (the site with eld unsure, eld's confident top otherwise).
    expect(decide("not json at all")).toEqual({ kind: "LOCK", language: RO, source: "FALLBACK_SITE" });
    expect(decide(reply("unknown", [], false, null), sure("en"))).toEqual({ kind: "LOCK", language: EN, source: "FALLBACK_ELD" });
  });

  it("every outcome carries a code for the decision record, never question text", () => {
    const secretQuestion = "Ar trebui Zâmbetel-Secret să adopte euro, or should it wait until wages catch up?";
    const secretRewrite = "Ar trebui Zâmbetel-Secret să adopte euro sau să aștepte până cresc salariile?";
    const secretMix: FastCheckReading = { kind: "MIX", main: RO, seen: [RO, EN], proposed: secretRewrite };
    const outcomes: readonly (readonly [LanguageDecision, string])[] = [
      [decideAfterFast(SITE, sure(SITE.code), { kind: "ONE", main: SITE }, secretQuestion, MAX), "FAST"],
      [decideAfterFast(RO, unsure, secretMix, secretQuestion, MAX), "OFFER"],
      [decideAfterFast(RO, unsure, mix(" "), secretQuestion, MAX), "FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:BLANK"],
      [decideAfterFast(RO, unsure, mix(REWRITE, [RO]), secretQuestion, MAX), "FAST_MIX_NO_OFFER:MIX_ONE_LANGUAGE_SEEN"],
      [decideAfterFast(RO, unsure, { kind: "DOWN", reason: "TIMEOUT" }, secretQuestion, MAX), "FALLBACK_SITE"],
      [decideAfterFast(RO, sure("en"), { kind: "DOWN", reason: "TRANSPORT" }, secretQuestion, MAX), "FALLBACK_ELD"],
      [fallbackLock(RO, unsure, secretQuestion, true), "LOCAL_SITE"],
      [fallbackLock(RO, sure("en"), secretQuestion, true), "LOCAL_ELD"],
      [withoutRepeatOffer(decideAfterFast(RO, unsure, secretMix, secretQuestion, MAX), NOW, NOW), "REPEAT_OFFER"]
    ];
    const before = decideBeforeFast(SITE, sure(SITE.code), secretQuestion, ON);
    expect(before.kind).toBe("LOCK");
    if (before.kind !== "ASK_FAST") expect(decisionRecordCode(before)).toBe("ELD_SITE");
    for (const [decision, code] of outcomes) {
      expect(decisionRecordCode(decision)).toBe(code);
      expect(decisionRecordCode(decision)).toMatch(/^[A-Z_:]+$/u);
    }
  });

  it("the decisions are frozen values", () => {
    expect(Object.isFrozen(decideAfterFast(RO, unsure, { kind: "ONE", main: EN }, MIX_Q, MAX))).toBe(true);
    const offer = decideAfterFast(RO, unsure, mix(REWRITE), MIX_Q, MAX);
    expect(Object.isFrozen(offer)).toBe(true);
    expect(offer.kind === "OFFER" && Object.isFrozen(offer.seen)).toBe(true);
  });
});
