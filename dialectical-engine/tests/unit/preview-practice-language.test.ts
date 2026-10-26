// The preview practice's question-language support (question-language spec 2026-10-13; P2L cross-plan amendments
// P2d-2..P2d-6 and controller ruling CR-3; plan 2026-10-12-debate-shape-phase2d Task 7b): the fixed cases, the lock as
// the site's decider computes it, the recorded readings, the verdict, the report lines, debate mode's two flags, the
// resubmission after an offer, the dry reading and the README's commands.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QuestionLanguageChoiceNeeded } from "@debateai/api";
import { SITE_LANGUAGE_CODES, type AskRequest } from "@debateai/contract";
import { questionLanguageOf } from "@debateai/kernel";
import { ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import { QuestionLanguageDecider, type QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import type { EldReading } from "../../apps/api/src/question-language/eld.js";
import { readQuestionLanguageReply, type FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import {
  PRACTICE_LANGUAGE_DRY_REWRITES,
  practiceDebateLanguageBlock,
  practiceDebateLanguageFromArgs,
  practiceDebateLanguageLines,
  practiceDebateSiteLanguage,
  practiceFastCheckRecord,
  practiceLanguageCaseRecord,
  practiceLanguageDryReading,
  practiceLanguageLines,
  practiceLanguageOutcome,
  practiceLanguageReport,
  practiceLanguageResubmission,
  practiceLanguageVerdict,
  practicePlannerDisagrees,
  practicePlannerLanguage,
  practiceSiteLanguageOfTag,
  type PracticeLanguageCaseRecord,
  type PracticePlannerRecord
} from "../../tools/preview-practice/practice-language.js";
import { PRACTICE_LANGUAGE_CASES, practiceDebateQuestion, type PracticeLanguageCase } from "../../tools/preview-practice/practice-questions.js";
import { PRACTICE_REPORT_SCHEMA, reportMarkdown } from "../../tools/preview-practice/practice-report.js";

const RO = { code: "ro", name: "Romanian" };
const EN = { code: "en", name: "English" };
const ID = { code: "id", name: "Indonesian" };
const SR_LATN = { code: "sr-Latn", name: "Serbian (Latin script)" };
// German: a site that is not always-ask, so eld may settle there. No practice case sits on it (controller ruling
// D-SETTLE: ro, en and id are always-ask by ruling L-KEEP), so eld's settling is shown here only (pre-flight PF-D20).
const DE = { code: "de", name: "German" };
const GERMAN = "Sollte Deutschland die Schuldenbremse lockern?";
// eld's reading carries one reading per clause (ruling L-MIX; pre-flight PF-D21); none here unless a test sets them.
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
const unsure: EldReading = { code: "ro", reliable: false, letters: 12, segments: [] };
const NO_READING: EldReading = { code: null, reliable: false, letters: 0, segments: [] };
const MAX = 8192;
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const caseOf = (id: string): PracticeLanguageCase => PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === id)!;
const MIX = caseOf("lang-ro-en-mix");
/** The lock's own language, as the kernel names it (sr-Latn from the question's letters). */
const lockOf = (entry: PracticeLanguageCase) => questionLanguageOf(entry.expectedLock.split("-")[0]!, entry.questionLine)!;
/** The reading each case expects from the fast check: one language, or the mix with its rewrite. */
const expectedReading = (entry: PracticeLanguageCase): FastCheckReading => entry.offerExpected
  ? { kind: "MIX", main: lockOf(entry), seen: [lockOf(entry), EN], proposed: REWRITE }
  : { kind: "ONE", main: lockOf(entry) };
const answered = (lock: string, named: string | null): PracticePlannerRecord => ({ status: "ANSWERED", code: null,
  model: "zai-org/GLM-5.3-Flash", questionLanguage: named, disagrees: practicePlannerDisagrees(lock, named) });
const recordOf = (entry: PracticeLanguageCase, eld: EldReading, fast: FastCheckReading, named?: string | null): PracticeLanguageCaseRecord => {
  const outcome = practiceLanguageOutcome(questionLanguageOf(entry.site)!, eld, fast, entry.questionLine, MAX, entry.fastCheck !== "OFF");
  return practiceLanguageCaseRecord({ entry, eld, fast, outcome, planner: answered(outcome.lock, named === undefined ? outcome.lock : named) });
};
/** Every case read as expected, eld unsure of each (so the fast reading decides, except where the fast check is off). */
const allRight = (): PracticeLanguageCaseRecord[] => PRACTICE_LANGUAGE_CASES.map((entry) => recordOf(entry, NO_READING, expectedReading(entry)));

describe("practice language: the fixed cases (P2L amendment P2d-3 word for word, the P2L final review's I3 and I1, then the stray-letter case)", () => {
  it("the ten cases, each with its site, the lock it must reach, whether it must be offered a rewrite and whether the fast check is off", () => {
    expect(PRACTICE_LANGUAGE_CASES.map((entry) => [entry.id, entry.site, entry.questionLine, entry.expectedLock, entry.offerExpected,
      entry.fastCheck ?? "ON"])).toEqual([
      ["lang-ro-plain", "ro", "Ar trebui sa renuntam la leu si sa trecem la euro?", "ro", false, "ON"],
      ["lang-ro-en-mix", "ro", "Ar trebui România să adopte euro, or should it wait until wages catch up?", "ro", true, "ON"],
      ["lang-en-on-ro", "ro", "Should Romania adopt the euro before 2030?", "en", false, "ON"],
      ["lang-short-code", "en", "Is `rm -rf /` ever safe in CI?", "en", false, "ON"],
      ["lang-sr-latn", "ro", "Da li bi Srbija trebalo da uvede evro?", "sr-Latn", false, "ON"],
      ["lang-id", "id", "Apakah Indonesia harus menaikkan pajak karbon?", "id", false, "ON"],
      ["lang-ro-borrowed", "ro", "Merită să lucrez la un startup de AI în loc de o corporație?", "ro", false, "ON"],
      ["lang-zh-short", "en", "人工智能会取代大多数工作吗？", "zh", false, "OFF"],
      ["lang-ku-arab", "ar", "ئایا دەبێت باجی کاربۆن زیاد بکرێت؟", "ku", false, "ON"],
      ["lang-en-hukou", "en", "Should China abolish the hukou household registration system to reduce inequality between cities and the countryside?",
        "en", false, "ON"]
    ]);
  });

  it("the stray-letter case is an English question about an East-Asian topic, in Latin letters only, debated on the English site", () => {
    // PR #194's rule refuses Chinese, Japanese and Korean letters in English replies, and is off when the question itself
    // holds such letters: a rewording that adds one (a gloss in the question) would leave the rule unmeasured.
    const hukou = caseOf("lang-en-hukou");
    const letters = hukou.questionLine.match(/\p{L}/gu) ?? [];
    expect(letters.length).toBeGreaterThan(0);
    expect(letters.filter((letter) => !/\p{Script=Latin}/u.test(letter))).toEqual([]);
    expect(practiceDebateQuestion("lang-en-hukou")).toEqual({ id: "lang-en-hukou", questionLine: hukou.questionLine });
    expect(practiceDebateSiteLanguage(practiceDebateQuestion("lang-en-hukou"), undefined)).toBe("en");
  });

  it("every site is a site language, every lock a language the kernel names, every id a practice debate question", () => {
    for (const entry of PRACTICE_LANGUAGE_CASES) {
      expect(SITE_LANGUAGE_CODES as readonly string[]).toContain(entry.site);
      expect(questionLanguageOf(entry.site), entry.id).not.toBeNull();
      expect(questionLanguageOf(entry.expectedLock.split("-")[0]!, entry.questionLine)?.code, entry.id).toBe(entry.expectedLock);
      expect(practiceDebateQuestion(entry.id)).toEqual({ id: entry.id, questionLine: entry.questionLine });
    }
    // The two added cases sit under eld's own floor (ELD_TUNING.minLetters), so eld is never sure of them, and at or
    // above the script reading's floor (12 letters): lang-zh-short's script decides with the fast check off (I3), and
    // lang-ku-arab, on a site that is not always-ask, is read by the fast check on any tuning (I1).
    for (const id of ["lang-zh-short", "lang-ku-arab"]) {
      const letters = caseOf(id).questionLine.match(/\p{L}/gu)?.length ?? 0;
      expect(letters, id).toBeGreaterThanOrEqual(12);
      expect(letters, id).toBeLessThan(ELD_TUNING.minLetters);
    }
  });
});

describe("practice language: the lock, exactly as the decider computes it", () => {
  it("the lock is computed exactly as the decider does, from recorded readings", () => {
    const mixReading: FastCheckReading = { kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE };
    const locked = (lock: string, source: string, fastNeeded: boolean) =>
      ({ lock, source, recordCode: source, offered: false, fastNeeded, proposedQuestion: null });
    // eld confident on the site's own language settles it, but only on a site that is not always-ask (German here,
    // controller ruling D-SETTLE); the fast reading (asked anyway in this mode) is not needed.
    expect(practiceLanguageOutcome(DE, sure("de"), { kind: "ONE", main: EN }, GERMAN, MAX)).toEqual(locked("de", "ELD_SITE", false));
    // Ruling L-MIX: two confident clauses in different languages keep eld from settling, even on German.
    const twoClauses: EldReading = { ...sure("de"), segments: [{ code: "de", reliable: true, letters: 20 }, { code: "en", reliable: true, letters: 20 }] };
    expect(practiceLanguageOutcome(DE, twoClauses, { kind: "ONE", main: DE }, GERMAN, MAX)).toEqual(locked("de", "FAST", true));
    // Ruling L-KEEP: ro, en and id are always-ask sites, so eld never settles there: lang-ro-plain on ro is FAST, never ELD_SITE.
    expect(practiceLanguageOutcome(RO, sure("ro"), { kind: "ONE", main: RO }, caseOf("lang-ro-plain").questionLine, MAX))
      .toEqual(locked("ro", "FAST", true));
    // eld reads another language: the fast reading decides (L5: another language than the site's, no offer).
    expect(practiceLanguageOutcome(RO, sure("en"), { kind: "ONE", main: EN }, caseOf("lang-en-on-ro").questionLine, MAX))
      .toEqual(locked("en", "FAST", true));
    // A real mix with a valid rewrite whose 409 body the contract accepts: the offer; either answer locks the main language.
    expect(practiceLanguageOutcome(RO, unsure, mixReading, MIX.questionLine, MAX))
      .toEqual({ lock: "ro", source: "OFFER", recordCode: "OFFER", offered: true, fastNeeded: true, proposedQuestion: REWRITE });
    // An offer whose body the contract refuses (here a language name over 64 bytes) is never made: the main language is
    // locked, exactly as the decider does it (pre-flight PF-D22).
    const longName = { code: "ro", name: "x".repeat(65) };
    expect(practiceLanguageOutcome(RO, unsure, { kind: "MIX", main: longName, seen: [longName, EN], proposed: REWRITE }, MIX.questionLine, MAX))
      .toEqual({ ...locked("ro", "FAST_MIX_NO_OFFER", true), recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED" });
    // The fast check down: a fallback (eld's confident reading, else the question's script, else the site).
    expect(practiceLanguageOutcome(RO, unsure, { kind: "DOWN", reason: "TIMEOUT" }, MIX.questionLine, MAX)).toEqual(locked("ro", "FALLBACK_SITE", true));
    expect(practiceLanguageOutcome(RO, sure("en"), { kind: "DOWN", reason: "TRANSPORT" }, caseOf("lang-en-on-ro").questionLine, MAX))
      .toEqual(locked("en", "FALLBACK_ELD", true));
    // A site language eld lacks is never settled by eld.
    expect(practiceLanguageOutcome(ID, sure("id"), { kind: "ONE", main: ID }, caseOf("lang-id").questionLine, MAX)).toEqual(locked("id", "FAST", true));
    // The fast check off (lang-zh-short, pre-flight PF-D25): its reading, asked anyway, is not used; a short Chinese
    // question is read by its script (P2L final review I3).
    expect(practiceLanguageOutcome(EN, NO_READING, { kind: "ONE", main: EN }, caseOf("lang-zh-short").questionLine, MAX, false))
      .toEqual(locked("zh", "LOCAL_ELD", false));
  });

  it("agrees with the API's own decider (QuestionLanguageDecider) on every reading the practice can record", async () => {
    // The practice computes the lock from recorded readings with the decider's pure pieces (decide.ts) and re-states only
    // the decider's own glue (the skip suffix, an offer body the contract refuses). This runs the REAL decider on the
    // same readings and asks for the same lock, source and record code, or the same offer (Task 7b, "prefer importing").
    const ask = (questionLine: string, site: string) => ({ question_line: questionLine, site_language: site } as unknown as AskRequest);
    const longName = { code: "ro", name: "x".repeat(65) };
    const grid: readonly (readonly [{ code: string; name: string }, EldReading, FastCheckReading, string, boolean])[] = [
      [DE, sure("de"), { kind: "ONE", main: EN }, GERMAN, true],
      [DE, { ...sure("de"), segments: [{ code: "de", reliable: true, letters: 20 }, { code: "en", reliable: true, letters: 20 }] },
        { kind: "ONE", main: DE }, GERMAN, true],
      ...PRACTICE_LANGUAGE_CASES.flatMap((entry) => [NO_READING, unsure, sure(entry.site)].map((eld) =>
        [questionLanguageOf(entry.site)!, eld, expectedReading(entry), entry.questionLine, entry.fastCheck !== "OFF"] as const)),
      [RO, unsure, { kind: "MIX", main: longName, seen: [longName, EN], proposed: REWRITE }, MIX.questionLine, true],
      [RO, unsure, { kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" }, MIX.questionLine, true],
      [RO, unsure, { kind: "MIX", main: RO, seen: [RO], proposed: REWRITE }, MIX.questionLine, true],
      [RO, unsure, { kind: "DOWN", reason: "TIMEOUT" }, MIX.questionLine, true],
      [RO, sure("en"), { kind: "DOWN", reason: "SKIPPED_DAY_POT" }, caseOf("lang-en-on-ro").questionLine, true],
      [RO, unsure, { kind: "DOWN", reason: "SPEND_RECORD_DOWN" }, MIX.questionLine, true],
      [EN, NO_READING, { kind: "ONE", main: EN }, caseOf("lang-zh-short").questionLine, false],
      [RO, NO_READING, { kind: "ONE", main: RO }, caseOf("lang-ro-plain").questionLine, false]
    ];
    for (const [site, eld, fast, questionLine, available] of grid) {
      const decider = new QuestionLanguageDecider({ eld: { read: () => eld, languages: () => [] },
        fastCheck: available ? { contractHash: "c", timeoutMs: 5_000, read: async () => fast } : null,
        key: newQuestionLanguageReferenceKey(), clock: () => new Date("2026-10-14T10:00:00.000Z"), maxQuestionBytes: MAX, fastCheckOffReason: "NO_GATE" });
      let real: Readonly<{ lock: string; source: string; recordCode: string; offered: boolean }>;
      try {
        const lock = await decider.decide({ ask: ask(questionLine, site.code), ownerScope: "owner:practice", fastCheckAllowed: true });
        real = { lock: lock.language.code, source: lock.source, recordCode: lock.recordCode, offered: false };
      } catch (error) {
        if (!(error instanceof QuestionLanguageChoiceNeeded)) throw error;
        real = { lock: error.offer.main_language.code, source: "OFFER", recordCode: "OFFER", offered: true };
      }
      const practice = practiceLanguageOutcome(site, eld, fast, questionLine, MAX, available);
      expect({ lock: practice.lock, source: practice.source, recordCode: practice.recordCode, offered: practice.offered },
        `${site.code} ${String(eld.code)} ${fast.kind} ${questionLine}`).toEqual(real);
    }
  });

  it("records the fast check's reading as read: outcome, main language, languages seen, real mix, rewrite", () => {
    const none = { reason: null, isRealMix: false, proposedQuestion: null, rewriteRefusal: null };
    expect(practiceFastCheckRecord({ kind: "ONE", main: EN })).toEqual({ ...none, outcome: "ONE", mainLanguage: "en", languagesSeen: ["en"] });
    expect(practiceFastCheckRecord({ kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE }))
      .toEqual({ ...none, outcome: "MIX", mainLanguage: "ro", languagesSeen: ["ro", "en"], isRealMix: true, proposedQuestion: REWRITE });
    // Ruling L-REWRITE: a real mix whose rewrite the reader discarded keeps the reader's code (pre-flight PF-D22).
    expect(practiceFastCheckRecord({ kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" }))
      .toEqual({ ...none, outcome: "MIX", mainLanguage: "ro", languagesSeen: ["ro", "en"], isRealMix: true, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" });
    expect(practiceFastCheckRecord({ kind: "DOWN", reason: "UNREADABLE" }))
      .toEqual({ ...none, outcome: "DOWN", reason: "UNREADABLE", mainLanguage: null, languagesSeen: [] });
  });
});

describe("practice language: the verdict (P2L amendment P2d-4, on the practice's own verdicts)", () => {
  it("every case locked as expected and the mix offered: PASS, exit 0", () => {
    expect(practiceLanguageVerdict(allRight(), [])).toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });

  it("a wrong lock or a mix that was not offered is FAIL", () => {
    const wrong = recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: RO });
    expect(practiceLanguageVerdict([wrong], [])).toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["LANGUAGE_WRONG_LOCK:lang-en-on-ro"] });
    // On its own site (ro, always-ask: ruling L-KEEP) the mix can miss its offer only on the fast check's side: here the
    // reader discarded its rewrite (ruling L-REWRITE). The reason carries the decider's record code (pre-flight PF-D22).
    const refused = recordOf(MIX, unsure, { kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:OTHER_LANGUAGE" });
    expect(refused).toMatchObject({ lock: "ro", lockSource: "FAST_MIX_NO_OFFER", recordCode: "FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:OTHER_LANGUAGE",
      offered: false, fastCheck: { outcome: "MIX", rewriteRefusal: "REWRITE_UNUSABLE:OTHER_LANGUAGE" } });
    expect(practiceLanguageVerdict([refused], [])).toEqual({ verdict: "FAIL", exitCode: 20,
      reasons: ["LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:OTHER_LANGUAGE"] });
    // eld settles a mixed question on a site that is not always-ask (German, built here: no practice case sits there,
    // controller ruling D-SETTLE): the right lock, but the person is never offered the rewrite (pre-flight PF-D20).
    const settled = recordOf({ ...MIX, id: "de-mix-settled", site: "de", expectedLock: "de" }, sure("de"),
      { kind: "MIX", main: DE, seen: [DE, EN], proposed: REWRITE });
    expect(settled).toMatchObject({ lock: "de", lockSource: "ELD_SITE", recordCode: "ELD_SITE", offered: false, fastNeeded: false,
      fastCheck: { outcome: "MIX" } });
    expect(practiceLanguageVerdict([settled], [])).toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["LANGUAGE_MIX_NOT_OFFERED:de-mix-settled:ELD_SITE"] });
  });

  it("a rewrite offered on a case that must not get one is FAIL (controller ruling D-NOOFFER: borrowed words never count, spec L4/L5)", () => {
    // The fast check reads the borrowed "startup" and "AI" as a real mix, with a usable rewrite: the lock is right (ro),
    // but the person would see the pop-up, which the case table says must not happen.
    const borrowed = recordOf(caseOf("lang-ro-borrowed"), unsure, { kind: "MIX", main: RO, seen: [RO, EN],
      proposed: "Merită să lucrez la o firmă nouă de inteligență artificială în loc de o corporație?" });
    expect(borrowed).toMatchObject({ lock: "ro", lockSource: "OFFER", offered: true, expected: { lock: "ro", offer: false } });
    expect(practiceLanguageVerdict([borrowed], [])).toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["LANGUAGE_UNEXPECTED_OFFER:lang-ro-borrowed"] });
    // The case's own expected reading (one language) still passes.
    expect(practiceLanguageVerdict([recordOf(caseOf("lang-ro-borrowed"), unsure, expectedReading(caseOf("lang-ro-borrowed")))], []))
      .toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });

  it("a fast check that was down makes the case NOT_PROVEN, even with the right lock", () => {
    const down = recordOf(caseOf("lang-ro-plain"), unsure, { kind: "DOWN", reason: "TIMEOUT" });
    expect(down).toMatchObject({ lock: "ro", lockSource: "FALLBACK_SITE" });
    expect(practiceLanguageVerdict([down], [])).toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["LANGUAGE_FAST_CHECK_DOWN:lang-ro-plain:TIMEOUT"] });
    expect(practiceLanguageVerdict([], [{ id: "lang-id", code: "PREVIEW_TEST_AUTHORITY_STOPPED" }]))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["LANGUAGE_CASE_NOT_RUN:lang-id:PREVIEW_TEST_AUTHORITY_STOPPED"] });
    // FAIL outranks NOT_PROVEN; the FAIL reasons come first.
    const wrong = recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: RO });
    expect(practiceLanguageVerdict([down, wrong], [])).toEqual({ verdict: "FAIL", exitCode: 20,
      reasons: ["LANGUAGE_WRONG_LOCK:lang-en-on-ro", "LANGUAGE_FAST_CHECK_DOWN:lang-ro-plain:TIMEOUT"] });
  });

  it("the planner's naming is recorded and never counts (CR-3: operator-only, never a condition mark)", () => {
    expect(practicePlannerDisagrees("en", "ro")).toBe(true);
    expect(practicePlannerDisagrees("sr-Latn", "sr")).toBe(false);
    expect(practicePlannerDisagrees("ro", null)).toBeNull();
    // Read the way the map stores it (pre-flight PF-D23): the primary subtag of a real ISO 639-1 code, else nothing.
    expect(practicePlannerLanguage("ro_RO")).toBe("ro");
    expect(practicePlannerLanguage("romanian")).toBeNull();
    expect(practicePlannerLanguage(undefined)).toBeNull();
    const records = allRight().map((record) => record.id !== "lang-en-on-ro" ? record
      : recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: EN }, "ro"));
    const failedPlanner = { ...records[0]!, planner: { status: "FAILED", code: "MAP_REPLY_UNREADABLE", model: "x", questionLanguage: null, disagrees: null } } as const;
    expect(records.find((record) => record.id === "lang-en-on-ro")!.planner).toMatchObject({ questionLanguage: "ro", disagrees: true });
    expect(practiceLanguageVerdict([failedPlanner, ...records.slice(1)], [])).toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });
});

describe("practice language: the report", () => {
  it("report.md: a line of codes per case, each rewrite beside the case's own question, the planner as operator-only", () => {
    const records = allRight();
    const report = practiceLanguageReport({ dry: false, startedAt: new Date("2026-10-13T10:00:00.000Z"), finishedAt: new Date("2026-10-13T10:01:00.000Z"),
      policySource: "START_VALUES", fastCheckModel: "claude-haiku-5-5", records, notRun: [], observer: new PracticeGateObserver() });
    expect(report).toMatchObject({ schema: PRACTICE_REPORT_SCHEMA, mode: "language", dry: false, verdict: "PASS", exitCode: 0, reasons: [],
      policy: { source: "START_VALUES", fastCheckModel: "claude-haiku-5-5" } });
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("# Preview practice (language): PASS");
    expect(markdown).toContain("| lang-ro-en-mix | ro | - no no | MIX ro (ro,en) | ro (OFFER) | yes | yes | ro, offer | PASS |");
    expect(markdown).toContain(`- lang-ro-en-mix (offered): original «${MIX.questionLine}»; rewrite «${REWRITE}»`);
    expect(markdown).toContain("The angle planner's own naming (recorded for the operator only; never counted, never a condition mark):");
    // A question that was not offered a rewrite is never shown.
    expect(markdown).not.toContain(caseOf("lang-en-on-ro").questionLine);
    // The language report keeps no "failures": the formats line pointing there is left out.
    expect(markdown).not.toContain("Wrong-format");
  });

  it("names a case that did not run, and why", () => {
    expect(practiceLanguageLines([], [{ id: "lang-id", code: "PREVIEW_TEST_AUTHORITY_STOPPED" }]).join("\n"))
      .toContain("- lang-id: not run (PREVIEW_TEST_AUTHORITY_STOPPED)");
  });
});

describe("practice language: debate mode's two flags, and the offer answered", () => {
  const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));

  it("reads --site-language and --language-choice in debate mode only, naming only the flag on a bad value", () => {
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--question": "ro" }))).toBeNull();
    // The default answer is KEEP_MINE ("keep"), as the P2L final review asks (controller ruling D-CHOICE).
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--site-language": "ro" }))).toEqual({ siteLanguage: "ro", choice: "keep" });
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--language-choice": "use" }))).toEqual({ siteLanguage: null, choice: "use" });
    for (const mode of ["formats", "openings", "language", "report"]) {
      expect(() => practiceDebateLanguageFromArgs(mode, flags({ "--site-language": "ro" })))
        .toThrow("PRACTICE_FLAG_VALUE_INVALID: --site-language (debate mode only)");
    }
    expect(() => practiceDebateLanguageFromArgs("debate", flags({ "--site-language": "xx" })))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --site-language \(one of the site's 35 languages\)$/u);
    expect(() => practiceDebateLanguageFromArgs("debate", flags({ "--language-choice": "edit" })))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --language-choice \(use or keep\)$/u);
    expect(parsePracticeArgs(["debate", "--site-language", "ro", "--language-choice", "keep"]).flags.size).toBe(2);
    expect(parsePracticeArgs(["language", "--dry", "--out", "/tmp/practice-language"]).mode).toBe("language");
  });

  it("the default site language is the question's own, when it is a site language; else English", () => {
    expect(practiceSiteLanguageOfTag("ro")).toBe("ro");
    expect(practiceSiteLanguageOfTag("ro-RO")).toBe("ro");
    expect(practiceSiteLanguageOfTag("und")).toBe("en");
    expect(practiceSiteLanguageOfTag("xx")).toBe("en");
  });

  it("answers the one-language offer as the site's pop-up does (P2L Task 9's choice)", () => {
    const request = { question_line: MIX.questionLine, site_language: "ro", depth_params: { depth: 1 } } as unknown as AskRequest;
    const offer = { check_ref: "a.b", proposed_question: REWRITE };
    expect(practiceLanguageResubmission(request, offer, "use")).toEqual({ ...request, question_line: REWRITE,
      question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: MIX.questionLine } });
    expect(practiceLanguageResubmission(request, offer, "keep")).toEqual({ ...request,
      question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } });
  });

  it("the debate's language block: why the lock was made, the language the run was stored with, the planner for the operator only", () => {
    const trace = { eld: { code: "ro", reliable: true, confident: false }, fast: { outcome: "MIX" as const, reason: null, main: "ro" }, contractHash: "c" };
    const offer = QuestionLanguageChoiceNeeded.from({ check_ref: "a.b", main_language: RO, languages_seen: [RO, EN], proposed_question: REWRITE }, trace);
    const kept: QuestionLanguageLock = { language: RO, source: "CHOICE", siteLanguage: "ro", rewriteAccepted: false, originalQuestionLine: null,
      trace: { eld: null, fast: null, contractHash: "c" }, recordCode: "CHOICE", localReason: null };
    // Pre-flight PF-D27: the record code, the local reason and the fast reading (a CHOICE lock has none of its own: the
    // offer's), and the language the run was stored with.
    expect(practiceDebateLanguageBlock({ siteLanguage: "ro", outcomes: [offer!, kept], choice: "KEEP_MINE",
      planner: { plannerLanguage: "ro", disagrees: false, detail: null }, storedLanguage: "ro" })).toEqual({ siteLanguage: "ro", offered: true,
      choice: "KEEP_MINE", lock: { code: "ro", source: "CHOICE", recordCode: "CHOICE", localReason: null, fast: { outcome: "MIX", reason: null, main: "ro" } },
      rewriteUsed: false, storedLanguage: "ro", plannerLanguage: "ro", plannerDisagrees: false });
    const local: QuestionLanguageLock = { ...kept, source: "LOCAL_SITE", recordCode: "LOCAL_SITE", localReason: "NO_GATE",
      trace: { eld: { code: null, reliable: false, confident: false }, fast: null, contractHash: null } };
    const lines = practiceDebateLanguageLines(practiceDebateLanguageBlock({ siteLanguage: "ro", outcomes: [local], choice: null, planner: null,
      storedLanguage: "ro" })).join("\n");
    expect(lines).toContain("- site language ro; lock ro (LOCAL_SITE, record LOCAL_SITE, no fast check: NO_GATE); stored on the run as ro");
    expect(lines).toContain("- one-language offer: not made; rewrite used: no");
  });
});

describe("practice language: --dry and the README", () => {
  it("the dry fast check answers each case's expected reading, readable by the real reply reader", () => {
    expect(Object.keys(PRACTICE_LANGUAGE_DRY_REWRITES)).toEqual(PRACTICE_LANGUAGE_CASES.filter((entry) => entry.offerExpected).map((entry) => entry.id));
    expect(readQuestionLanguageReply(practiceLanguageDryReading(MIX.questionLine), MIX.questionLine))
      .toEqual({ kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE });
    const serbian = caseOf("lang-sr-latn");
    expect(readQuestionLanguageReply(practiceLanguageDryReading(serbian.questionLine), serbian.questionLine)).toEqual({ kind: "ONE", main: SR_LATN });
    // Sorani in Arabic letters reads as Kurdish, "ku" (never "ckb", which is no ISO 639-1 code: P2L final review I1).
    const sorani = caseOf("lang-ku-arab");
    expect(readQuestionLanguageReply(practiceLanguageDryReading(sorani.questionLine), sorani.questionLine))
      .toEqual({ kind: "ONE", main: questionLanguageOf("ku")! });
    expect(readQuestionLanguageReply(practiceLanguageDryReading("Not a practice case?"), "Not a practice case?"))
      .toEqual({ kind: "DOWN", reason: "UNKNOWN_LANGUAGE" });
  });

  it("the README's language commands are real commands of this tool, and the planner stays operator-only", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const argvOf = (line: string): string[] => line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
      .map((word) => word.replace(/^"(.*)"$/u, "$1"));
    const language = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts language "));
    expect(language.length).toBeGreaterThanOrEqual(2);
    for (const line of language) {
      const args = parsePracticeArgs(argvOf(line));
      expect(args.mode).toBe("language");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        expect(["--out", "--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export", "--dry"]).toContain(flag);
      }
    }
    expect(language.some((line) => line.includes(" --dry "))).toBe(true);
    // Final review M-4: S-8's rerun after NOT_PROVEN goes into a NEW --out folder (the first one holds language.jsonl and
    // is refused); no two language commands share a folder.
    const outs = language.map((line) => parsePracticeArgs(argvOf(line)).flags.get("--out"));
    expect(outs).toContain("$P/language-report-2");
    expect(new Set(outs).size).toBe(outs.length);
    const mixDebate = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate ") && line.includes("--question lang-ro-en-mix"));
    expect(mixDebate).toHaveLength(1);
    const args = parsePracticeArgs(argvOf(mixDebate[0]!));
    // S-8's one full debate on the mix answers the pop-up with `use` on purpose, so the rewrite path runs once
    // (controller ruling D-CHOICE), and runs on this code's next register version (controller ruling D-BOTHNEXT).
    expect(practiceDebateLanguageFromArgs(args.mode, args.flags)).toEqual({ siteLanguage: "ro", choice: "use" });
    expect(args.switches.has("--register-next")).toBe(true);
    expect(args.flags.get("--shape-policy")).toBe("tools/preview-practice/shape-policy-start.json");
    expect(readme).toContain("The planner's naming is recorded for the operator only");
  });
});
