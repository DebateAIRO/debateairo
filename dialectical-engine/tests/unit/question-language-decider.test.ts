import { describe, expect, it, vi } from "vitest";
import { detectArgumentLanguage, TypedDomainError } from "@debateai/kernel";
import type { AskRequest } from "@debateai/contract";
import {
  QuestionLanguageChoiceNeeded, QuestionLanguageDecider, ownerScopeOf, questionLanguageAskContractMember, runLanguageOf,
  type QuestionLanguageLock
} from "../../apps/api/src/question-language/decider.js";
import type { EldReader, EldReading } from "../../apps/api/src/question-language/eld.js";
import { ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { FastCheck, FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { FAST_CHECK_ALWAYS_SITES } from "../../apps/api/src/question-language/decide.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { QUESTION_LANGUAGE_CHOICE_NEEDED, SITE_LANGUAGE_CODES } from "@debateai/contract";
import { inspect } from "node:util";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const askOf = (question_line: string, extra: Partial<AskRequest> = {}) => ({ question_line, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s",
  as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra }) as AskRequest;
const eldSaying = (reading: EldReading): EldReader => ({ read: () => reading, languages: () => [] });
const fastSaying = (reading: FastCheckReading) => {
  const read = vi.fn(async () => reading);
  return { check: { contractHash: "c".repeat(64), timeoutMs: 5_000, read } as FastCheck, read };
};
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
// Pre-flight PF-L20: the "eld settles" case uses a site eld may settle (Task 3 may make ro or en always-ask).
const SETTLING = [...SITE_LANGUAGE_CODES].sort().find((code) => !FAST_CHECK_ALWAYS_SITES.includes(code))!;
const deciderWith = (eld: EldReader, fastCheck: FastCheck | null, key = newQuestionLanguageReferenceKey()) =>
  new QuestionLanguageDecider({ eld, fastCheck, key, clock: () => NOW, maxQuestionBytes: 8192 });
const UNSURE_RO: EldReading = { code: "ro", reliable: false, letters: 30, segments: [] };
const RO_EN_MIX: FastCheckReading = { kind: "MIX", main: { code: "ro", name: "Romanian" },
  seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE };

describe("the question-language decider (question-language spec 2026-10-13)", () => {
  it("eld settles the site language: locked with no fast call", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure(SETTLING)), fast.check).decide({ ask: askOf("A question in the site's language?",
      { site_language: SETTLING as never }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: SETTLING }, source: "ELD_SITE", siteLanguage: SETTLING, rewriteAccepted: false,
      originalQuestionLine: null, trace: { eld: { code: SETTLING, reliable: true, confident: true }, fast: null, contractHash: null } });
    expect(fast.read).not.toHaveBeenCalled();
  });

  it("no site language sent (an older client): English is the proposal", async () => {
    const lock = await deciderWith(eldSaying(sure("en")), null).decide({ ask: askOf("Should cities price congestion?"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "en" }, siteLanguage: "en",
      source: FAST_CHECK_ALWAYS_SITES.includes("en") ? "LOCAL_ELD" : "ELD_SITE" });
  });

  it("ruling L-NOCONSENT: a signed-out person never reaches the fast AI — eld or the site language, never an offer", async () => {
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const lock = await deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "legacy:asker-1", fastCheckAllowed: false });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "LOCAL_SITE", trace: { fast: null } });
    expect(fast.read).not.toHaveBeenCalled();
  });

  it("PF-L19: an offer the contract would refuse is never sent; the main language is locked instead", async () => {
    // A name longer than the 409 body's 64 characters: the decision table offers, the contract would refuse the body.
    const long = { code: "ro", name: "R".repeat(65) };
    const fast = fastSaying({ kind: "MIX", main: long, seen: [long, { code: "en", name: "English" }], proposed: REWRITE });
    const lock = await deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true }).catch((error: unknown) => error);
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "FAST_MIX_NO_OFFER" });
  });

  it("a real mix: an offer whose reference the same person can answer with the server's rewrite", async () => {
    const key = newQuestionLanguageReferenceKey();
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const decider = deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check, key);
    const offered = await decider.decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true }).catch((error: unknown) => error);
    expect(offered).toBeInstanceOf(QuestionLanguageChoiceNeeded);
    const offer = (offered as QuestionLanguageChoiceNeeded).offer;
    expect(offer).toMatchObject({ main_language: { code: "ro", name: "Romanian" }, proposed_question: REWRITE,
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }] });
    const used = await decider.decide({ ask: askOf(REWRITE, { site_language: "ro",
      question_language_choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: MIX_Q } }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(used).toMatchObject({ language: { code: "ro" }, source: "CHOICE", rewriteAccepted: true, originalQuestionLine: MIX_Q });
    expect(fast.read).toHaveBeenCalledTimes(1);
    await expect(decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } }),
      ownerScope: "owner:b", fastCheckAllowed: true })).rejects.toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("CR-5: a second offer for the same person and question within 15 minutes is the fallback lock, never a second pop-up", async () => {
    let now = NOW;
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const decider = new QuestionLanguageDecider({ eld: eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fastCheck: fast.check,
      key: newQuestionLanguageReferenceKey(), clock: () => now, maxQuestionBytes: 8192 });
    const ask = { ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true };
    await expect(decider.decide(ask)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    now = new Date(NOW.getTime() + 14 * 60_000);
    expect(await decider.decide(ask)).toMatchObject({ language: { code: "ro" }, source: "REPEAT_OFFER", rewriteAccepted: false });
    await expect(decider.decide({ ...ask, ownerScope: "owner:b", fastCheckAllowed: true })).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    now = new Date(NOW.getTime() + 30 * 60_000);
    await expect(decider.decide(ask)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
  });

  it("no paid AI (local): eld or the site language, no offer even for a mix", async () => {
    const lock = await deciderWith(eldSaying({ code: null, reliable: false, letters: 0, segments: [] }), null)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "LOCAL_SITE" });
  });

  it("the record holds codes and hashes, and the original question only when a rewrite was accepted", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure("en")), fast.check).decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(questionLanguageAskContractMember(lock)).toEqual({ question_language: {
      code: "en", name: "English", source: "FAST", site_language: "ro", rewrite_accepted: false,
      eld: { code: "en", reliable: true, confident: true }, fast: { outcome: "ONE", reason: null, main: "en" }, contract_hash: "c".repeat(64) } });
    expect(questionLanguageAskContractMember(null)).toEqual({});
  });

  it("runLanguageOf: the lock's code and name, or today's guesser without a lock", () => {
    expect(runLanguageOf(null, "Should cities price congestion?")).toEqual({
      tag: detectArgumentLanguage("Should cities price congestion?").tag, nameEn: detectArgumentLanguage("Should cities price congestion?").nameEn });
  });

  it("a choice sent with no reference the server made is refused, never locked", async () => {
    const decider = deciderWith(eldSaying(sure("ro")), null);
    const refused = await decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: "aa.bb", choice: "KEEP_MINE" } }), ownerScope: "owner:a", fastCheckAllowed: true })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TypedDomainError);
    expect((refused as TypedDomainError).code).toBe("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  // ---- Binding notes for Task 10 (progress ledger 2026-10-14) ----

  it("records decisionRecordCode, including the reader's rewrite refusal (ruling L-REWRITE)", async () => {
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }],
      proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" });
    const lock = await deciderWith(eldSaying(UNSURE_RO), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "FAST_MIX_NO_OFFER", recordCode: "FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:UNCHANGED", localReason: null });
    expect(questionLanguageAskContractMember(lock)).toMatchObject({ question_language: {
      source: "FAST_MIX_NO_OFFER", record_code: "FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:UNCHANGED" } });
    expect(questionLanguageAskContractMember(lock).question_language).not.toHaveProperty("local_reason");
  });

  it("an offer the contract refuses is recorded by its own code", async () => {
    const long = { code: "ro", name: "R".repeat(65) };
    const fast = fastSaying({ kind: "MIX", main: long, seen: [long, { code: "en", name: "English" }], proposed: REWRITE });
    const lock = await deciderWith(eldSaying(UNSURE_RO), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    // The lock carries the language's own English name (L-B64), never the refused one.
    expect(lock).toMatchObject({ language: { code: "ro", name: "Romanian" }, recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED" });
  });

  it("records the reason beside every LOCAL_* code: signed out, or the deployment's stated reason", async () => {
    const signedOut = await deciderWith(eldSaying(UNSURE_RO), fastSaying(RO_EN_MIX).check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "legacy:x", fastCheckAllowed: false });
    expect(signedOut).toMatchObject({ source: "LOCAL_SITE", recordCode: "LOCAL_SITE", localReason: "SIGNED_OUT" });
    expect(questionLanguageAskContractMember(signedOut)).toMatchObject({ question_language: { source: "LOCAL_SITE", local_reason: "SIGNED_OUT" } });
    expect(questionLanguageAskContractMember(signedOut).question_language).not.toHaveProperty("record_code");

    const unstated = await deciderWith(eldSaying(sure("en")), null)
      .decide({ ask: askOf("Should cities price congestion?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(unstated).toMatchObject({ language: { code: "en" }, source: "LOCAL_ELD", localReason: "NO_FAST_CHECK" });

    for (const reason of ["LOCAL_MODE", "NO_GATE", "HOSTED_BEFORE_SPEND_RECORD", "NO_HOSTED_KEY", "POLICY_OFF"] as const) {
      const stated = await new QuestionLanguageDecider({ eld: eldSaying(UNSURE_RO), fastCheck: null, key: newQuestionLanguageReferenceKey(),
        clock: () => NOW, maxQuestionBytes: 8192, fastCheckOffReason: reason })
        .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "legacy:x", fastCheckAllowed: false });
      // The deployment's reason wins: no person, signed in or not, could have reached a fast check here.
      expect(stated).toMatchObject({ source: "LOCAL_SITE", localReason: reason });
    }
  });

  it("never blocks: a fast check that throws is the fallback (DOWN), and an eld that throws is no reading", async () => {
    const read = vi.fn(async () => { throw new Error(`boom ${MIX_Q}`); });
    const lock = await deciderWith(eldSaying(sure("en")), { contractHash: "c".repeat(64), timeoutMs: 5_000, read } as FastCheck)
      .decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "en" }, source: "FALLBACK_ELD", trace: { fast: { outcome: "DOWN", reason: "TRANSPORT", main: null } } });

    const brokenEld: EldReader = { read: () => { throw new Error("eld"); }, languages: () => [] };
    const down = fastSaying({ kind: "DOWN", reason: "TIMEOUT" });
    const fallback = await deciderWith(brokenEld, down.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(fallback).toMatchObject({ language: { code: "ro" }, source: "FALLBACK_SITE",
      trace: { eld: { code: null, reliable: false, confident: false }, fast: { outcome: "DOWN", reason: "TIMEOUT" } } });
  });

  it("ruling L-REPEAT: the repeat locks the fast AI's main language, even when eld and the site say otherwise", async () => {
    let now = NOW;
    const deMix: FastCheckReading = { kind: "MIX", main: { code: "de", name: "German" }, seen: [{ code: "de", name: "German" }, { code: "en", name: "English" }],
      proposed: "Sollte Rumänien den Euro einführen oder warten, bis die Löhne aufholen?" };
    const decider = new QuestionLanguageDecider({ eld: eldSaying(sure("en")), fastCheck: fastSaying(deMix).check,
      key: newQuestionLanguageReferenceKey(), clock: () => now, maxQuestionBytes: 8192 });
    const ask = { ask: askOf("Sollte Rumänien den Euro einführen, or should it wait until wages catch up?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true };
    await expect(decider.decide(ask)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    now = new Date(NOW.getTime() - 60_000); // the clock stepped back: still a repeat
    expect(await decider.decide(ask)).toMatchObject({ language: { code: "de" }, source: "REPEAT_OFFER", recordCode: "REPEAT_OFFER" });
  });

  it("the repeat-offer memory is bounded in size: the oldest entry goes first", async () => {
    const fast = fastSaying(RO_EN_MIX);
    const decider = new QuestionLanguageDecider({ eld: eldSaying(UNSURE_RO), fastCheck: fast.check, key: newQuestionLanguageReferenceKey(),
      clock: () => NOW, maxQuestionBytes: 8192, repeatOfferMemoryEntries: 2 });
    const askFor = (scope: string) => ({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: scope, fastCheckAllowed: true });
    for (const scope of ["owner:1", "owner:2", "owner:3"]) await expect(decider.decide(askFor(scope))).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(await decider.decide(askFor("owner:3"))).toMatchObject({ source: "REPEAT_OFFER" });
    // owner:1 was dropped to keep two entries: offered again (never a block either way).
    await expect(decider.decide(askFor("owner:1"))).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
  });

  it("an offer the contract refused is not remembered as shown: the same question is not a repeat", async () => {
    const long = { code: "ro", name: "R".repeat(65) };
    const decider = deciderWith(eldSaying(UNSURE_RO), fastSaying({ kind: "MIX", main: long, seen: [long, { code: "en", name: "English" }], proposed: REWRITE }).check);
    const ask = { ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true };
    expect(await decider.decide(ask)).toMatchObject({ source: "FAST_MIX_NO_OFFER" });
    expect(await decider.decide(ask)).toMatchObject({ source: "FAST_MIX_NO_OFFER" });
  });

  it("no question text in any error, offer trace or lock record (codes and hashes only)", async () => {
    const outcomes: Array<QuestionLanguageLock | QuestionLanguageChoiceNeeded> = [];
    const decider = new QuestionLanguageDecider({ eld: eldSaying(UNSURE_RO), fastCheck: fastSaying(RO_EN_MIX).check, key: newQuestionLanguageReferenceKey(),
      clock: () => NOW, maxQuestionBytes: 8192, onDecided: (outcome) => outcomes.push(outcome) });
    const needed = await decider.decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true })
      .catch((error: unknown) => error) as QuestionLanguageChoiceNeeded;
    expect(needed.message).toBe("QUESTION_LANGUAGE_CHOICE_NEEDED");
    expect(JSON.stringify(needed.trace)).not.toContain("euro");
    expect(needed.offer.check_ref).not.toContain("euro");
    const refused = await decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: needed.offer.check_ref, choice: "KEEP_MINE" } }),
      ownerScope: "owner:b", fastCheckAllowed: true }).catch((error: unknown) => error) as Error;
    expect(refused.message).not.toContain("euro");
    const kept = await decider.decide({ ask: askOf(MIX_Q, { site_language: "ro", question_language_choice: { check_ref: needed.offer.check_ref, choice: "KEEP_MINE" } }),
      ownerScope: "owner:a", fastCheckAllowed: true });
    expect(kept).toMatchObject({ language: { code: "ro" }, source: "CHOICE", rewriteAccepted: false, originalQuestionLine: null });
    expect(JSON.stringify(questionLanguageAskContractMember(kept))).not.toContain("euro");
    expect(outcomes.map((outcome) => outcome instanceof QuestionLanguageChoiceNeeded ? "OFFER" : outcome.source)).toEqual(["OFFER", "CHOICE"]);
  });

  // Final review I5(b), ruling L-POPUP-FIRST: a client that sends no site_language (practice, today's page) cannot show
  // the pop-up, so a real mix is never thrown at it: the fast AI's main language is locked, by its own record code.
  it("ruling L-POPUP-FIRST: no site_language and a real mix locks the fast AI's main language, never an offer", async () => {
    const outcomes: Array<QuestionLanguageLock | QuestionLanguageChoiceNeeded> = [];
    const fast = fastSaying(RO_EN_MIX);
    const decider = new QuestionLanguageDecider({ eld: eldSaying(UNSURE_RO), fastCheck: fast.check, key: newQuestionLanguageReferenceKey(),
      clock: () => NOW, maxQuestionBytes: 8192, onDecided: (outcome) => outcomes.push(outcome) });
    const ask = { ask: askOf(MIX_Q), ownerScope: "owner:a", fastCheckAllowed: true };
    const lock = await decider.decide(ask);
    expect(lock).toMatchObject({ language: { code: "ro", name: "Romanian" }, source: "FAST_MIX_NO_OFFER", siteLanguage: "en",
      rewriteAccepted: false, originalQuestionLine: null, recordCode: "FAST_MIX_NO_OFFER:NO_SITE_LANGUAGE", localReason: null,
      trace: { fast: { outcome: "MIX", main: "ro" } } });
    expect(fast.read).toHaveBeenCalledTimes(1);
    expect(questionLanguageAskContractMember(lock)).toMatchObject({ question_language: { source: "FAST_MIX_NO_OFFER",
      record_code: "FAST_MIX_NO_OFFER:NO_SITE_LANGUAGE" } });
    expect(outcomes.map((outcome) => outcome instanceof QuestionLanguageChoiceNeeded ? "OFFER" : outcome.source)).toEqual(["FAST_MIX_NO_OFFER"]);
    // Nothing was shown, so nothing is remembered as shown: the same person's page that CAN show the pop-up still gets it.
    await expect(decider.decide({ ...ask, ask: askOf(MIX_Q, { site_language: "ro" }) })).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
  });

  it("ruling L-POPUP-FIRST: with a site_language the same real mix is still the 409 offer", async () => {
    await expect(deciderWith(eldSaying(UNSURE_RO), fastSaying(RO_EN_MIX).check)
      .decide({ ask: askOf(MIX_Q, { site_language: "en" }), ownerScope: "owner:a", fastCheckAllowed: true }))
      .rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
  });

  it("ownerScopeOf: owner:<ownerRef> for a signed-in person, legacy:<id> otherwise", () => {
    expect(ownerScopeOf({ kind: "server", ownerRef: "o-1" })).toBe("owner:o-1");
    expect(ownerScopeOf({ kind: "legacy", legacyAskerId: "a-1" })).toBe("legacy:a-1");
  });

  // ---- Hardening round (Tasks 10+11 review) ----

  it("the offer error validates its own body: a body the contract refuses is a typed refusal, never a 500 later", () => {
    const trace = { eld: null, fast: null, contractHash: null };
    const bad = { check_ref: "a.b", main_language: { code: "ro", name: "R".repeat(65) },
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: REWRITE };
    const thrown = (() => { try { return new QuestionLanguageChoiceNeeded(bad, trace); } catch (error) { return error; } })();
    expect(thrown).toBeInstanceOf(TypedDomainError);
    expect((thrown as TypedDomainError).code).toBe("QUESTION_LANGUAGE_OFFER_INVALID");
    expect((thrown as Error).message).not.toContain("Ar trebui");
    expect(QuestionLanguageChoiceNeeded.from(bad, trace)).toBeNull();
    expect(QuestionLanguageChoiceNeeded.from({ ...bad, extra: 1 }, trace)).toBeNull();
    expect(() => new QuestionLanguageChoiceNeeded({ ...bad, main_language: { code: "ro", name: "Romanian" }, languages_seen: [{ code: "ro", name: "Romanian" }] }, trace))
      .toThrow("QUESTION_LANGUAGE_OFFER_INVALID");
  });

  it("the offer error carries its code, and logging or JSON of it never prints the rewrite (offer and trace are not enumerable)", () => {
    const good = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: REWRITE };
    const needed = QuestionLanguageChoiceNeeded.from(good, { eld: null, fast: null, contractHash: "h" })!;
    expect(needed).toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(needed.code).toBe(QUESTION_LANGUAGE_CHOICE_NEEDED);
    expect(needed.message).toBe(QUESTION_LANGUAGE_CHOICE_NEEDED);
    expect(needed.offer).toEqual(good);
    expect(needed.trace).toEqual({ eld: null, fast: null, contractHash: "h" });
    expect(Object.keys(needed)).not.toContain("offer");
    expect(Object.keys(needed)).not.toContain("trace");
    expect(JSON.stringify(needed)).not.toContain("salariile");
    expect(inspect(needed)).not.toContain("salariile");
    // Final review M14: the other ways an error reaches a log line.
    expect(String(needed)).not.toContain("salariile");
    expect(needed.stack ?? "").not.toContain("salariile");
    expect(JSON.stringify({ ...needed })).not.toContain("salariile");
    expect(Object.values({ ...needed }).join(" ")).not.toContain("salariile");
    expect(Object.isFrozen(needed.offer) && Object.isFrozen(needed.offer.languages_seen)).toBe(true);
  });

  it("never blocks: a fast check that never answers is the fallback just past the row's limit (row + 1 s)", async () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn(() => new Promise<FastCheckReading>(() => undefined));
      const pending = deciderWith(eldSaying(sure("en")), { contractHash: "c".repeat(64), timeoutMs: 2_000, read })
        .decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
      let settled: QuestionLanguageLock | undefined;
      void pending.then((lock) => { settled = lock; });
      await vi.advanceTimersByTimeAsync(2_999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toMatchObject({ language: { code: "en" }, source: "FALLBACK_ELD", trace: { fast: { outcome: "DOWN", reason: "TIMEOUT" } } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an answered fast check leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const lock = await deciderWith(eldSaying(sure("en")), fastSaying({ kind: "ONE", main: { code: "en", name: "English" } }).check)
        .decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
      expect(lock).toMatchObject({ source: "FAST" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the impossible offer before the fast call is the site lock (DECISION_FALLBACK_SITE), never a throw", async () => {
    vi.resetModules();
    vi.doMock("../../apps/api/src/question-language/decide.js", async (original) => ({
      ...(await original<typeof import("../../apps/api/src/question-language/decide.js")>()),
      decideBeforeFast: () => ({ kind: "OFFER", main: { code: "en", name: "English" }, seen: [], proposed: "x" })
    }));
    try {
      const { QuestionLanguageDecider: Mocked } = await import("../../apps/api/src/question-language/decider.js");
      const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
      const lock = await new Mocked({ eld: eldSaying(sure("en")), fastCheck: fast.check, key: newQuestionLanguageReferenceKey(), clock: () => NOW,
        maxQuestionBytes: 8192 }).decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
      expect(lock).toMatchObject({ language: { code: "ro" }, source: "FALLBACK_SITE", recordCode: "DECISION_FALLBACK_SITE", localReason: null });
      expect(fast.read).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("../../apps/api/src/question-language/decide.js");
      vi.resetModules();
    }
  });

  it("runLanguageOf with a lock: the lock's code (script subtag kept) and English name", () => {
    const lock = { language: { code: "sr-Latn", name: "Serbian (Latin script)" } } as QuestionLanguageLock;
    expect(runLanguageOf(lock, "anything")).toEqual({ tag: "sr-Latn", nameEn: "Serbian (Latin script)" });
  });
});

// Security audit run 3, NV-47: the decider asks the person's own count of paid checks once, right before a paid check,
// and only on the ASK_FAST branch. "red:" fails on the source before NV-47; "guard:" passes before and after.
describe("NV-47 the owner's fast-check budget", () => {
  const budgeted = (eld: EldReader, fastCheck: FastCheck, fastCheckBudget: (ownerScope: string) => boolean,
    key = newQuestionLanguageReferenceKey()) =>
    new QuestionLanguageDecider({ eld, fastCheck, key, clock: () => NOW, maxQuestionBytes: 8192, fastCheckBudget });
  const RO_ONE: FastCheckReading = { kind: "ONE", main: { code: "ro", name: "Romanian" } };

  it("red: a spent budget sends no paid check; the fallback lock carries the skip beside its own code", async () => {
    const fast = fastSaying(RO_ONE);
    const lock = await budgeted(eldSaying(UNSURE_RO), fast.check, () => false)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(fast.read).not.toHaveBeenCalled();
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "FALLBACK_SITE", localReason: null });
    expect(lock.recordCode).toBe(`${lock.source}:FAST_CHECK_SKIPPED_OWNER_BUDGET`);
    expect(lock.trace.fast).toEqual({ outcome: "DOWN", reason: "SKIPPED_OWNER_BUDGET", main: null });
    expect(questionLanguageAskContractMember(lock)).toMatchObject({ question_language: {
      record_code: "FALLBACK_SITE:FAST_CHECK_SKIPPED_OWNER_BUDGET" } });
  });

  it("red: on the always-check sites (en and ro) a confident same-language ask IS a paid check, so the budget is asked once", async () => {
    // The premise: eld never settles on these sites (CR-2), so every signed-in ask there reaches ASK_FAST.
    expect(FAST_CHECK_ALWAYS_SITES).toEqual(expect.arrayContaining(["en", "ro"]));
    const cases = [
      ["ro", askOf("Ar trebui orașele să taxeze traficul?", { site_language: "ro" })],
      ["en", askOf("Should cities price congestion?", { site_language: "en" })],
      // No site_language: read as en.
      ["en", askOf("Should cities price congestion?")]
    ] as const;
    for (const [code, ask] of cases) {
      const fast = fastSaying({ kind: "ONE", main: { code, name: code === "ro" ? "Romanian" : "English" } });
      const budget = vi.fn((_ownerScope: string) => true);
      const lock = await budgeted(eldSaying(sure(code)), fast.check, budget).decide({ ask, ownerScope: "owner:nv47", fastCheckAllowed: true });
      expect(budget, code).toHaveBeenCalledTimes(1);
      expect(budget, code).toHaveBeenCalledWith("owner:nv47");
      expect(fast.read, code).toHaveBeenCalledTimes(1);
      expect(lock, code).toMatchObject({ language: { code }, source: "FAST", recordCode: "FAST" });
    }
  });

  it("red: a budget that throws is a skip, never a block: no call, the same suffix, and decide resolves", async () => {
    const fast = fastSaying(RO_ONE);
    const decided = budgeted(eldSaying(UNSURE_RO), fast.check, () => { throw new TypeError("ADMISSION_SCOPE_UNKNOWN:languageChecks"); })
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    await expect(decided).resolves.toMatchObject({ source: "FALLBACK_SITE" });
    const lock = await decided;
    expect(fast.read).not.toHaveBeenCalled();
    expect(lock.recordCode).toBe(`${lock.source}:FAST_CHECK_SKIPPED_OWNER_BUDGET`);
    expect(lock.trace.fast).toEqual({ outcome: "DOWN", reason: "SKIPPED_OWNER_BUDGET", main: null });
  });

  it("guard: the budget is never asked when no paid check is due (eld settles, a choice, a signed-out person)", async () => {
    const budget = vi.fn((_ownerScope: string) => true);
    // eld settles on a site outside the always-check list (PF-L20's SETTLING).
    const settling = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    expect(await budgeted(eldSaying(sure(SETTLING)), settling.check, budget).decide({ ask: askOf("A question in the site's language?",
      { site_language: SETTLING as never }), ownerScope: "owner:a", fastCheckAllowed: true })).toMatchObject({ source: "ELD_SITE" });
    expect(settling.read).not.toHaveBeenCalled();
    // The choice path: an answer to a real offer (signed by the same key) locks CHOICE with no paid check.
    const key = newQuestionLanguageReferenceKey();
    const offered = await deciderWith(eldSaying(UNSURE_RO), fastSaying(RO_EN_MIX).check, key)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true }).catch((error: unknown) => error);
    expect(offered).toBeInstanceOf(QuestionLanguageChoiceNeeded);
    const choosing = fastSaying(RO_ONE);
    const chooser = budgeted(eldSaying(UNSURE_RO), choosing.check, budget, key);
    expect(await chooser.decide({ ask: askOf(MIX_Q, { site_language: "ro", question_language_choice: {
      check_ref: (offered as QuestionLanguageChoiceNeeded).offer.check_ref, choice: "KEEP_MINE" } }), ownerScope: "owner:a", fastCheckAllowed: true }))
      .toMatchObject({ source: "CHOICE" });
    // An unsigned reference is the expected refusal, still with no paid check and no budget asked.
    await expect(chooser.decide({ ask: askOf(MIX_Q, { site_language: "ro", question_language_choice: { check_ref: "aa.bb", choice: "KEEP_MINE" } }),
      ownerScope: "owner:a", fastCheckAllowed: true })).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_CHECK_INVALID" });
    expect(choosing.read).not.toHaveBeenCalled();
    // A signed-out person never reaches the fast AI (L-NOCONSENT).
    const signedOut = fastSaying(RO_ONE);
    expect(await budgeted(eldSaying(UNSURE_RO), signedOut.check, budget)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "legacy:x", fastCheckAllowed: false })).toMatchObject({ source: "LOCAL_SITE" });
    expect(signedOut.read).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
  });
});
