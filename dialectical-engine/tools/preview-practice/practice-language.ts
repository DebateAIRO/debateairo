/**
 * Preview practice: the question language (question-language spec 2026-10-13; P2L cross-plan amendments P2d-2..P2d-6,
 * adjusted for controller ruling CR-3; plan 2026-10-12-debate-shape-phase2d Task 7b).
 *
 * Plain words: with the new shape on, the site locks each question's language before the debate starts (P2L). This
 * file lets the practice show how it will lock them, before the upload.
 *  - Mode "language" asks no debate and starts no database. For each fixed case (practice-questions.ts
 *    PRACTICE_LANGUAGE_CASES): eld's reading on this computer; the fast check through the Anthropic gate, ALWAYS asked
 *    here, so its reading is recorded even when eld settles the question (or the case is worked out with the fast
 *    check off, `fastCheck: "OFF"`); and one angle-planner call (MAP:angles)
 *    through the gate of the AI whose turn it is. The lock is computed exactly as the site's decider computes it
 *    (apps/api/src/question-language/decider.ts). Every finished case goes to <out>/language.jsonl at once (a SHA-256
 *    of the question, never its text), then report.json and report.md. --dry answers from a script: nothing is spent.
 *  - The pass bar (P2L amendment P2d-4): a wrong lock, or a real-mix case not offered a rewrite, is FAIL; a case whose
 *    fast check was down, so that its lock came from a fallback, is NOT_PROVEN; otherwise PASS. Whether a rewrite keeps
 *    the meaning is the owners' read: report.md shows the case's own question and the rewrite side by side.
 *  - The planner's own naming of the language, and any disagreement with the lock, is RECORDED only (CR-3: operator-
 *    only, never a condition mark) and never counts toward the verdict.
 *  - Debate mode: --site-language and --language-choice (the site's one-language pop-up, answered for the operator),
 *    and what the report says about the run's language.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ASK_QUESTION_MAX_BYTES, QuestionLanguageChoiceNeeded } from "@debateai/api";
import { SITE_LANGUAGE_CODES, type AskRequest } from "@debateai/contract";
import {
  detectArgumentLanguage, lockedReplyLanguageExpectation, questionLanguageOf, TypedDomainError, type QuestionLanguage
} from "@debateai/kernel";
import { MAP_CONTRACT_IDS, MapChoiceRepository, mapAnglesSpec, mapPrimarySubtag, mapPromptContractHash, mapProviderPieces } from "@debateai/map";
import {
  createPreviewGuardedFetch,
  PREVIEW_ANTHROPIC_MESSAGES_URL,
  readPromptFrame,
  type CallBound,
  type FramedMaterialField,
  type PreviewBudgetPort,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  parseQuestionLanguagePolicy,
  QUESTION_LANGUAGE_POLICY_ROW_KEY,
  questionLanguagePolicyStartValues,
  type QuestionLanguagePolicy
} from "@debateai/register";
import { assertQuestionLanguagePolicyBootable } from "../../apps/api/src/question-language/boot.js";
import { decideAfterFast, decideBeforeFast, decisionRecordCode, type LockSource } from "../../apps/api/src/question-language/decide.js";
import type { QuestionLanguageLock, QuestionLanguageTrace } from "../../apps/api/src/question-language/decider.js";
import { loadEldReader, type EldReader, type EldReading } from "../../apps/api/src/question-language/eld.js";
import { ELD_TUNING, eldConfident, eldSeesMix } from "../../apps/api/src/question-language/eld-tuning.js";
import { createFastCheck, QUESTION_LANGUAGE_CHECK_CONTRACT_ID, type FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { anthropicFastCheckTransport } from "../../apps/api/src/question-language/transport.js";
import { errorCodeOf, practiceJobGateway, practiceTurnOrder } from "./practice-formats.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import { openingsDryContent, openingsDryPacket, openingsDryVendorReply } from "./practice-openings-dry.js";
import { PRACTICE_LANGUAGE_CASES, type PracticeLanguageCase } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import type { PracticeRegisterExport } from "./practice-register-import.js";
import type { PracticeReport } from "./practice-report.js";
import { PracticeJsonlWriter } from "./practice-samples-log.js";
import { PracticeRefusal } from "./practice-settings.js";
import { PRACTICE_EXIT_CODES, type PracticeVerdict } from "./practice-verdict.js";

const primary = (code: string): string => code.split("-")[0]!.toLowerCase();
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const GATE_NAMES: readonly PracticeGateName[] = ["deepinfra", "anthropic"];
/** A failing eld is no reading (never block), exactly as the decider reads it (decider.ts NO_READING; pre-flight PF-D21). */
const NO_ELD_READING: EldReading = Object.freeze({ code: null, reliable: false, letters: 0, segments: Object.freeze([]) });
/**
 * The 409 body's check reference is the server's signature. Here nothing is signed or sent, so any well-formed
 * reference serves the body check (pre-flight PF-D22); the trace plays no part in it.
 */
const PRACTICE_OFFER_REF = "practice.unsigned";
const NO_TRACE: QuestionLanguageTrace = Object.freeze({ eld: null, fast: null, contractHash: null });
/** The register parser's refusal prefix; what follows it is only the place in the row (pre-flight PF-D24). */
const POLICY_INVALID_PREFIX = "QUESTION_LANGUAGE_POLICY_INVALID:";

/* ------------------------------------------------------------------ debate mode: the two flags */

export const PRACTICE_LANGUAGE_FLAGS = Object.freeze(["--site-language", "--language-choice"] as const);
/**
 * How the operator answers the site's one-language pop-up: keep the wording (KEEP_MINE, the default, as the P2L final
 * review asks; controller ruling D-CHOICE) or use the rewrite (USE_REWRITE: the debate argues the rewrite, while the
 * transcript keeps the case's own question line).
 */
export type PracticeLanguageChoice = "use" | "keep";
/** `siteLanguage` null: the question's own language (practiceSiteLanguageFor). */
export type PracticeDebateLanguage = Readonly<{ siteLanguage: string | null; choice: PracticeLanguageChoice }>;

/**
 * Debate mode's language flags: null when neither is given. Outside debate mode either is refused; a value outside its
 * list is refused naming only the flag, never the value. Read before anything starts.
 */
export function practiceDebateLanguageFromArgs(mode: string, flags: ReadonlyMap<string, string>): PracticeDebateLanguage | null {
  const given = PRACTICE_LANGUAGE_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const site = flags.get("--site-language");
  if (site !== undefined && !(SITE_LANGUAGE_CODES as readonly string[]).includes(site)) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--site-language (one of the site's 35 languages)");
  }
  const choice = flags.get("--language-choice") ?? "keep";
  if (choice !== "use" && choice !== "keep") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--language-choice (use or keep)");
  return Object.freeze({ siteLanguage: site ?? null, choice });
}

/** A language tag as a site language: its primary code when the site has it, else English. */
export function practiceSiteLanguageOfTag(tag: string): string {
  const code = primary(tag);
  return (SITE_LANGUAGE_CODES as readonly string[]).includes(code) ? code : "en";
}

/** The site language a practice debate is asked on by default: the question's own, as today's guesser reads it. */
export function practiceSiteLanguageFor(questionLine: string): string {
  return practiceSiteLanguageOfTag(detectArgumentLanguage(questionLine).tag);
}

/**
 * The site language a practice debate asks on: `--site-language` when given; else, for a language case asked by its
 * id, the case's own site (the one language mode asks it on, so the lock and the offer can be compared; final review
 * M-6); else the question's own language (practiceSiteLanguageFor).
 */
export function practiceDebateSiteLanguage(question: Readonly<{ id: string; questionLine: string }>, given: string | null | undefined): string {
  if (given !== null && given !== undefined) return given;
  return PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === question.id)?.site ?? practiceSiteLanguageFor(question.questionLine);
}

/** The same ask again after the one-language offer, exactly as the site's pop-up sends it (P2L Task 9). */
export function practiceLanguageResubmission(request: AskRequest, offer: Readonly<{ check_ref: string; proposed_question: string }>,
  choice: PracticeLanguageChoice): AskRequest {
  return (choice === "use"
    ? { ...request, question_line: offer.proposed_question,
      question_language_choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: request.question_line } }
    : { ...request, question_language_choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } }) as AskRequest;
}

/** Operator-only (CR-3): what the angle planner named, as the map stored it (P2L Task 15, inside core.map_choice). */
export type PracticeMapLanguage = Readonly<{ plannerLanguage: string | null; disagrees: boolean; detail: string | null }>;

/** Read through P2b's repository (decrypted with the run's key), before the throwaway database goes. Null: no map stored. */
export async function readPracticeMapLanguage(pool: Pool, runId: string): Promise<PracticeMapLanguage | null> {
  const result = await new MapChoiceRepository(pool).readMapResultForRun(runId);
  if (result === null) return null;
  const note = result.notes.find((entry) => entry.note === "LANGUAGE_PLANNER_DISAGREES");
  // A map stored before P2L Task 15 has no plannerLanguage (ruling L-MAPFORM): it reads as null (pre-flight PF-D23).
  return Object.freeze({ plannerLanguage: result.plannerLanguage ?? null, disagrees: note !== undefined, detail: note?.detail ?? null });
}

/** The debate report's `language` block: present only when the run had a debate-shape row (the decider ran). */
export type PracticeDebateLanguageBlock = Readonly<{
  siteLanguage: string;
  /** The ask answered with the one-language offer (a person would have seen the pop-up). */
  offered: boolean;
  /** How the offer was answered (--language-choice); null when there was none. */
  choice: "USE_REWRITE" | "KEEP_MINE" | null;
  /**
   * The decider's last lock, where it came from and why (pre-flight PF-D27): its record code (the source, with a
   * rewrite refusal or a refused offer body), the reason no fast check ran (LOCAL_* only), and the fast reading (a
   * CHOICE lock carries none of its own: then the offer's). Null when no lock was made (the ask was refused).
   */
  lock: Readonly<{ code: string; source: string; recordCode: string; localReason: string | null; fast: QuestionLanguageTrace["fast"] }> | null;
  rewriteUsed: boolean;
  /**
   * The language the run was stored with (core.run.argument_language_tag): the lock only when admission froze a shape
   * (ruling L-SHAPED-ONLY, apps/api/src/index.ts, `storedLanguageLock`), else today's guess. Null when no run was made.
   */
  storedLanguage: string | null;
  /** Operator-only (CR-3): the planner's naming and whether the map stored a LANGUAGE_PLANNER_DISAGREES note. */
  plannerLanguage: string | null;
  plannerDisagrees: boolean | null;
}>;

export function practiceDebateLanguageBlock(input: Readonly<{
  siteLanguage: string; outcomes: readonly (QuestionLanguageLock | QuestionLanguageChoiceNeeded)[];
  choice: "USE_REWRITE" | "KEEP_MINE" | null; planner: PracticeMapLanguage | null; storedLanguage: string | null;
}>): PracticeDebateLanguageBlock {
  const offers = input.outcomes.filter((outcome): outcome is QuestionLanguageChoiceNeeded => outcome instanceof QuestionLanguageChoiceNeeded);
  const locks = input.outcomes.filter((outcome): outcome is QuestionLanguageLock => !(outcome instanceof QuestionLanguageChoiceNeeded));
  const lock = locks.at(-1) ?? null;
  const offered = offers.length > 0;
  return Object.freeze({
    siteLanguage: input.siteLanguage,
    offered,
    choice: offered ? input.choice : null,
    lock: lock === null ? null : Object.freeze({ code: lock.language.code, source: lock.source, recordCode: lock.recordCode,
      localReason: lock.localReason, fast: lock.trace.fast ?? offers.at(-1)?.trace.fast ?? null }),
    rewriteUsed: lock?.rewriteAccepted ?? false,
    storedLanguage: input.storedLanguage,
    plannerLanguage: input.planner?.plannerLanguage ?? null,
    plannerDisagrees: input.planner === null ? null : input.planner.disagrees
  });
}

/** The debate's report.md paragraph: codes only. */
export function practiceDebateLanguageLines(block: PracticeDebateLanguageBlock): readonly string[] {
  const lock = block.lock === null ? "none" : `${block.lock.code} (${block.lock.source}, record ${block.lock.recordCode}`
    + `${block.lock.localReason === null ? "" : `, no fast check: ${block.lock.localReason}`})`;
  return ["Question language:", "",
    `- site language ${block.siteLanguage}; lock ${lock}; stored on the run as ${block.storedLanguage ?? "-"}`,
    `- one-language offer: ${block.offered ? `made, answered ${block.choice ?? "-"}` : "not made"}; rewrite used: ${block.rewriteUsed ? "yes" : "no"}`,
    `- the angle planner named: ${block.plannerLanguage ?? "nothing stored"}; disagreement note: `
      + `${block.plannerDisagrees === null ? "no map stored" : block.plannerDisagrees ? "yes" : "no"} `
      + "(recorded for the operator only, never a condition mark)",
    ""];
}

/* ------------------------------------------------------------------ mode "language": the pure parts */

export const PRACTICE_LANGUAGE_SCHEMA = "preview-practice-language-v1" as const;
export const PRACTICE_LANGUAGE_FILE = "language.jsonl" as const;

/** What the fast check said, as read by its own reader (P2L Task 5). */
export type PracticeFastCheckRecord = Readonly<{
  outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; mainLanguage: string | null; languagesSeen: readonly string[];
  isRealMix: boolean; proposedQuestion: string | null;
  /** Ruling L-REWRITE: why the reader discarded a real mix's rewrite (codes only); null otherwise (pre-flight PF-D22). */
  rewriteRefusal: string | null;
}>;

export function practiceFastCheckRecord(reading: FastCheckReading): PracticeFastCheckRecord {
  if (reading.kind === "DOWN") {
    return Object.freeze({ outcome: "DOWN", reason: reading.reason, mainLanguage: null, languagesSeen: Object.freeze([]), isRealMix: false,
      proposedQuestion: null, rewriteRefusal: null });
  }
  if (reading.kind === "ONE") {
    return Object.freeze({ outcome: "ONE", reason: null, mainLanguage: reading.main.code, languagesSeen: Object.freeze([reading.main.code]),
      isRealMix: false, proposedQuestion: null, rewriteRefusal: null });
  }
  return Object.freeze({ outcome: "MIX", reason: null, mainLanguage: reading.main.code,
    languagesSeen: Object.freeze(reading.seen.map((language) => language.code)), isRealMix: true, proposedQuestion: reading.proposed,
    rewriteRefusal: reading.proposed === null ? reading.rewriteRefusal : null });
}

/**
 * The lock and what led to it. `OFFER`: the person is offered the rewrite; either answer locks the main language.
 * `recordCode`: the decider's record code (decide.ts decisionRecordCode; "OFFER" for an offer).
 */
export type PracticeLanguageOutcome = Readonly<{
  lock: string; source: LockSource | "OFFER"; recordCode: string; offered: boolean; fastNeeded: boolean; proposedQuestion: string | null;
}>;

/**
 * The lock EXACTLY as the site's decider computes it (apps/api/src/question-language/decider.ts, `decide`; pre-flight
 * PF-D22), from recorded readings:
 *  - decideBeforeFast first: eld settles only off the always-ask sites (ruling L-KEEP), and with no fast check on the
 *    deployment (`fastCheckAvailable` false: a case marked `fastCheck: "OFF"`) eld, the question's script and the
 *    site decide (LOCAL_*);
 *  - else decideAfterFast on the fast reading, with the decider's own record code (and its skip suffix, hosted only);
 *  - an OFFER only when the contract's 409 body accepts it (QuestionLanguageChoiceNeeded.from), else the main
 *    language, FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED.
 * Not modelled, and never met here: the repeat-offer memory (CR-5; every case is a new question) and an ask without a
 * site language (L-POPUP-FIRST; every case has one). `fastNeeded`: whether the fast reading mattered. Pure.
 */
export function practiceLanguageOutcome(site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string,
  maxQuestionBytes: number, fastCheckAvailable = true): PracticeLanguageOutcome {
  const before = decideBeforeFast(site, eld, questionLine, { fastCheckAvailable, fastCheckAllowed: true });
  if (before.kind === "LOCK") {
    return Object.freeze({ lock: before.language.code, source: before.source, recordCode: decisionRecordCode(before), offered: false,
      fastNeeded: false, proposedQuestion: null });
  }
  if (before.kind === "OFFER") {
    // Impossible (decideBeforeFast never offers); the decider's own answer to it.
    return Object.freeze({ lock: site.code, source: "FALLBACK_SITE", recordCode: "DECISION_FALLBACK_SITE", offered: false, fastNeeded: false,
      proposedQuestion: null });
  }
  const decision = decideAfterFast(site, eld, fast, questionLine, maxQuestionBytes);
  if (decision.kind === "LOCK") {
    // As the decider: a check skipped on purpose says so beside the lock's own code (hosted only; never on the preview).
    // NV-47's owner-budget arm is unreachable here (the preview has no budget) but keeps the two mappings identical.
    const skipped = fast.kind !== "DOWN" ? null : fast.reason === "SKIPPED_DAY_POT" ? "FAST_CHECK_SKIPPED_DAY_POT"
      : fast.reason === "SPEND_RECORD_DOWN" ? "FAST_CHECK_SPEND_RECORD_DOWN"
      : fast.reason === "SKIPPED_OWNER_BUDGET" ? "FAST_CHECK_SKIPPED_OWNER_BUDGET" : null;
    return Object.freeze({ lock: decision.language.code, source: decision.source,
      recordCode: skipped === null ? decisionRecordCode(decision) : `${decisionRecordCode(decision)}:${skipped}`,
      offered: false, fastNeeded: true, proposedQuestion: null });
  }
  const needed = QuestionLanguageChoiceNeeded.from({ check_ref: PRACTICE_OFFER_REF,
    main_language: { code: decision.main.code, name: decision.main.name },
    languages_seen: decision.seen.map((language) => ({ code: language.code, name: language.name })),
    proposed_question: decision.proposed }, NO_TRACE);
  if (needed === null) {
    // As the decider (L-B64): the lock carries the language's own name, never the refused one.
    const language = questionLanguageOf(primary(decision.main.code), questionLine) ?? site;
    return Object.freeze({ lock: language.code, source: "FAST_MIX_NO_OFFER", recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED", offered: false,
      fastNeeded: true, proposedQuestion: null });
  }
  return Object.freeze({ lock: decision.main.code, source: "OFFER", recordCode: decisionRecordCode(decision), offered: true, fastNeeded: true,
    proposedQuestion: decision.proposed });
}

/** The angle planner's call, recorded only (CR-3). */
export type PracticePlannerRecord = Readonly<{
  status: "ANSWERED" | "FAILED" | "BUSY" | "NOT_SENT"; code: string | null; model: string | null;
  questionLanguage: string | null; disagrees: boolean | null;
}>;

/**
 * The planner's naming as the map stores it (packages/map orchestrator.ts `mapPlannerLanguage`; pre-flight PF-D23): the
 * primary subtag of an ISO 639-1 code ("ro_RO" → "ro"), else null ("romanian" is no code).
 */
export function practicePlannerLanguage(named: string | undefined): string | null {
  const subtag = named === undefined ? null : mapPrimarySubtag(named);
  return subtag !== null && questionLanguageOf(subtag) !== null ? subtag : null;
}

/** Whether the planner's naming differs from the lock, as the map's note compares them (sr-Latn and sr agree); null when it named none. */
export function practicePlannerDisagrees(lock: string, named: string | null): boolean | null {
  return named === null ? null : mapPrimarySubtag(named) !== mapPrimarySubtag(lock);
}

export type PracticeLanguageCaseRecord = Readonly<{
  id: string;
  siteLanguage: string;
  /** Never the question's text. */
  questionSha256: string;
  /** eld's reading; `seesMix`: two confident clauses in different languages (ruling L-MIX), which keep eld from settling. */
  eld: Readonly<{ code: string | null; reliable: boolean; letters: number; confident: boolean; seesMix: boolean }>;
  fastCheck: PracticeFastCheckRecord;
  lock: string;
  lockSource: LockSource | "OFFER";
  /** The decider's record code (pre-flight PF-D22): the source, with why a real mix was not offered. */
  recordCode: string;
  fastNeeded: boolean;
  offered: boolean;
  expected: Readonly<{ lock: string; offer: boolean }>;
  planner: PracticePlannerRecord;
}>;

export function practiceLanguageCaseRecord(input: Readonly<{ entry: PracticeLanguageCase; eld: EldReading; fast: FastCheckReading;
  outcome: PracticeLanguageOutcome; planner: PracticePlannerRecord }>): PracticeLanguageCaseRecord {
  const fastCheck = practiceFastCheckRecord(input.fast);
  return Object.freeze({
    id: input.entry.id,
    siteLanguage: input.entry.site,
    questionSha256: sha256(input.entry.questionLine),
    eld: Object.freeze({ code: input.eld.code, reliable: input.eld.reliable, letters: input.eld.letters, confident: eldConfident(input.eld),
      seesMix: eldSeesMix(input.eld) }),
    // The rewrite is reply text: capped and stripped of key shapes, as every reply the practice keeps.
    fastCheck: fastCheck.proposedQuestion === null ? fastCheck
      : Object.freeze({ ...fastCheck, proposedQuestion: reportableReplyText(fastCheck.proposedQuestion) }),
    lock: input.outcome.lock,
    lockSource: input.outcome.source,
    recordCode: input.outcome.recordCode,
    fastNeeded: input.outcome.fastNeeded,
    offered: input.outcome.offered,
    expected: Object.freeze({ lock: input.entry.expectedLock, offer: input.entry.offerExpected }),
    planner: input.planner
  });
}

export type PracticeLanguageNotRun = Readonly<{ id: string; code: string }>;

/**
 * One case against the pass bar (P2L amendment P2d-4). A lock from a fallback (the fast check down) proves nothing
 * about the check: NOT_PROVEN, whatever the lock. Else a wrong lock, a real mix with no offer, or an offer on a case
 * that must not get one (ruling D-NOOFFER), is FAIL; the no-offer reason carries the decider's record code, which says
 * why (pre-flight PF-D22). The planner never counts.
 */
export function practiceLanguageCaseVerdict(record: PracticeLanguageCaseRecord): Readonly<{ verdict: "PASS" | "FAIL" | "NOT_PROVEN"; reasons: readonly string[] }> {
  if (record.lockSource === "FALLBACK_ELD" || record.lockSource === "FALLBACK_SITE") {
    return Object.freeze({ verdict: "NOT_PROVEN", reasons: Object.freeze([`LANGUAGE_FAST_CHECK_DOWN:${record.id}:${record.fastCheck.reason ?? "UNKNOWN"}`]) });
  }
  const reasons = [
    ...(record.lock === record.expected.lock ? [] : [`LANGUAGE_WRONG_LOCK:${record.id}`]),
    ...(record.expected.offer && !record.offered ? [`LANGUAGE_MIX_NOT_OFFERED:${record.id}:${record.recordCode}`] : []),
    // Controller ruling D-NOOFFER: a rewrite offered where the case table says none is due (borrowed words never make a
    // mix, spec L4/L5) would pop up on the site for every such question: FAIL, whatever the lock.
    ...(!record.expected.offer && record.offered ? [`LANGUAGE_UNEXPECTED_OFFER:${record.id}`] : [])
  ];
  return Object.freeze({ verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons: Object.freeze(reasons) });
}

/** The run's verdict: any FAIL case fails it; else any case not proven (or not run) leaves it NOT_PROVEN; else PASS. */
export function practiceLanguageVerdict(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]):
  Readonly<{ verdict: PracticeVerdict; exitCode: number; reasons: readonly string[] }> {
  const each = records.map(practiceLanguageCaseVerdict);
  const failed = each.filter((entry) => entry.verdict === "FAIL").flatMap((entry) => entry.reasons);
  const notProven = [...each.filter((entry) => entry.verdict === "NOT_PROVEN").flatMap((entry) => entry.reasons),
    ...notRun.map((entry) => `LANGUAGE_CASE_NOT_RUN:${entry.id}:${entry.code}`)];
  const verdict: PracticeVerdict = failed.length > 0 ? "FAIL" : notProven.length > 0 ? "NOT_PROVEN" : "PASS";
  return Object.freeze({ verdict, exitCode: PRACTICE_EXIT_CODES[verdict], reasons: Object.freeze([...failed, ...notProven]) });
}

/** The report.md lines: codes per case; each rewrite beside the case's OWN fixed question (the owners' read); the planner. */
export function practiceLanguageLines(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]): readonly string[] {
  const yes = (value: boolean) => (value ? "yes" : "no");
  const lines = ["Question language cases (each lock computed exactly as the site's decider computes it):", "",
    "| Case | Site | eld (code, reliable, confident) | Fast check | Lock (record code) | Fast reading needed | Offer | Expected | Case verdict |",
    "|---|---|---|---|---|---|---|---|---|"];
  for (const record of records) {
    const fast = record.fastCheck.outcome === "DOWN" ? `DOWN ${record.fastCheck.reason ?? "-"}`
      : `${record.fastCheck.outcome} ${record.fastCheck.mainLanguage ?? "-"} (${record.fastCheck.languagesSeen.join(",")})`;
    lines.push(`| ${record.id} | ${record.siteLanguage} | ${record.eld.code ?? "-"} ${yes(record.eld.reliable)} ${yes(record.eld.confident)} | ${fast} | `
      + `${record.lock} (${record.recordCode}) | ${yes(record.fastNeeded)} | ${yes(record.offered)} | `
      + `${record.expected.lock}${record.expected.offer ? ", offer" : ""} | ${practiceLanguageCaseVerdict(record).verdict} |`);
  }
  lines.push("", ...notRun.map((entry) => `- ${entry.id}: not run (${entry.code})`), ...(notRun.length === 0 ? [] : [""]));
  const rewrites = records.filter((record) => record.fastCheck.proposedQuestion !== null);
  lines.push("Rewrites for the owners' read (does each keep the meaning?):", "",
    ...(rewrites.length === 0 ? ["- none"] : rewrites.map((record) => {
      const original = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === record.id)?.questionLine ?? "(not a practice case)";
      return `- ${record.id} (${record.offered ? "offered" : "not offered"}): original «${original}»; rewrite «${record.fastCheck.proposedQuestion ?? ""}»`;
    })), "");
  lines.push("The angle planner's own naming (recorded for the operator only; never counted, never a condition mark):", "",
    ...records.map((record) => `- ${record.id}: ${record.planner.status === "ANSWERED"
      ? `named ${record.planner.questionLanguage ?? "nothing"}, lock ${record.lock}, disagrees ${record.planner.disagrees === null ? "-" : yes(record.planner.disagrees)}`
      : `${record.planner.status} (${record.planner.code ?? "-"})`}`), "");
  return lines;
}

/** report.json for mode "language". */
export function practiceLanguageReport(input: Readonly<{ dry: boolean; startedAt: Date; finishedAt: Date;
  policySource: "REGISTER_EXPORT" | "START_VALUES"; fastCheckModel: string; records: readonly PracticeLanguageCaseRecord[];
  notRun: readonly PracticeLanguageNotRun[]; observer: PracticeGateObserver }>): PracticeReport {
  return Object.freeze({
    // practice-report.ts PRACTICE_REPORT_SCHEMA (written out here so the two files do not import each other; a test pins it)
    schema: "preview-practice-report-v1",
    mode: "language",
    dry: input.dry,
    ...practiceLanguageVerdict(input.records, input.notRun),
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    policy: Object.freeze({ source: input.policySource, fastCheckModel: input.fastCheckModel }),
    cases: input.records,
    notRun: input.notRun,
    gates: Object.fromEntries(GATE_NAMES.map((gate) => [gate, input.observer.summary(gate)]))
  });
}

/* ------------------------------------------------------------------ mode "language": the run */

export type PracticeLanguagePolicyChoice = Readonly<{ policy: QuestionLanguagePolicy; source: "REGISTER_EXPORT" | "START_VALUES" }>;

/**
 * The fast check's settings and the owners' instruction: the export's LAST version's questionLanguagePolicy row when it
 * holds one (`--register-export`), else the code's start values. A row with the fast check switched off is refused:
 * this mode exists to record its reading.
 */
export function practiceLanguagePolicy(document: PracticeRegisterExport | null): PracticeLanguagePolicyChoice {
  const last = document?.versions.at(-1);
  const row = document === null || last === undefined ? undefined
    : document.rows.find((entry) => entry.register_version === last.register_version && entry.row_key === QUESTION_LANGUAGE_POLICY_ROW_KEY);
  let choice: PracticeLanguagePolicyChoice;
  if (row === undefined) {
    choice = { policy: questionLanguagePolicyStartValues(), source: "START_VALUES" };
  } else {
    try { choice = { policy: parseQuestionLanguagePolicy(JSON.parse(row.value_json)), source: "REGISTER_EXPORT" }; } catch (error) {
      // Only the place in the row (the parser's zod path, `$.fastCheck.model` for example; `$` for a row that is not
      // JSON), never its content (Global Constraints; pre-flight PF-D24).
      const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
        ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
      throw new PracticeRefusal("PRACTICE_LANGUAGE_POLICY_INVALID", `questionLanguagePolicy ${path}`);
    }
  }
  if (choice.policy.fastCheck === null) {
    throw new PracticeRefusal("PRACTICE_LANGUAGE_FAST_CHECK_OFF", "the questionLanguagePolicy row has no fast check");
  }
  return Object.freeze(choice);
}

export type PracticeLanguageRunInput = Readonly<{
  config: PreviewProviderTestConfig;
  targets: readonly ProviderDiscoveryTarget[];
  /** The watched gate ports. */
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  policy: QuestionLanguagePolicy;
  /** The judge organ's bound (the map's calls use it, as openings does for MAP:angles). */
  bound: CallBound;
  /** Test seam; default: all nine. */
  cases?: readonly PracticeLanguageCase[];
  /** Test seam; default: loadEldReader(ELD_TUNING.database), as the API loads it. */
  eld?: EldReader;
  sleep?: (milliseconds: number) => Promise<void>;
  progress?: (line: string) => void;
  shouldStop?: () => boolean;
  onCase?: (record: PracticeLanguageCaseRecord) => void;
  onNotRun?: (entry: PracticeLanguageNotRun) => void;
}>;

/** Every case in turn: eld, the fast check (always), the lock as the decider computes it, one planner call. */
async function runPracticeLanguage(input: PracticeLanguageRunInput): Promise<Readonly<{
  records: readonly PracticeLanguageCaseRecord[]; notRun: readonly PracticeLanguageNotRun[];
}>> {
  const settings = input.policy.fastCheck;
  if (settings === null) throw new PracticeRefusal("PRACTICE_LANGUAGE_FAST_CHECK_OFF");
  const seats = practiceTurnOrder(input.targets);
  if (seats.length === 0) throw new PracticeRefusal("PRACTICE_LANGUAGE_NO_AI");
  const guardedFetch = createPreviewGuardedFetch(input.ports);
  // The API's own boot refusal for the row (apps/api/src/question-language/boot.ts; pre-flight PF-D24): an owners' text
  // holding a frame token, or a fast-check model or effort the Anthropic gate has not reviewed, is refused here once, by
  // the API's code and with its code, before anything is sent (never nine DOWN cases read as NOT_PROVEN).
  try { assertQuestionLanguagePolicyBootable(input.policy, { kind: "PREVIEW", fetch: guardedFetch }); } catch (error) {
    if (error instanceof TypedDomainError) throw new PracticeRefusal(error.code);
    throw error;
  }
  // The fast check exactly as the API composes it on the preview (P2L Task 12): the Anthropic gate, no key here.
  const fastCheck = createFastCheck({
    transport: anthropicFastCheckTransport({ fetch: guardedFetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings }),
    instruction: input.policy.instruction, timeoutMs: settings.timeoutMs });
  const eld = input.eld ?? await loadEldReader(ELD_TUNING.database);
  const runId = randomUUID();

  /** One angle-planner call on the case's question, in the locked language, through the gateway a formats job uses. */
  const plannerCall = async (entry: PracticeLanguageCase, lock: string, target: ProviderDiscoveryTarget): Promise<PracticePlannerRecord> => {
    const locked = questionLanguageOf(primary(lock), entry.questionLine);
    if (locked === null) {
      return Object.freeze({ status: "NOT_SENT", code: "PRACTICE_LANGUAGE_LOCK_UNNAMED", model: null, questionLanguage: null, disagrees: null });
    }
    const pieces = mapProviderPieces(mapAnglesSpec({ questionLine: entry.questionLine, languageName: locked.name, languageTag: locked.code,
      replyLanguage: lockedReplyLanguageExpectation(locked, entry.questionLine) }));
    const job = practiceJobGateway({ target, config: input.config, guardedFetch, ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
    try {
      const response = await job.gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: "MAP:angles", role: "JUDGE", lane: "served",
        bound: input.bound, contractHash: mapPromptContractHash(), providerRef: target.providerRef, packet: pieces.framed.packet,
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket });
      // As the map stores it (pre-flight PF-D23): the primary subtag of a real ISO 639-1 code, else nothing.
      const named = practicePlannerLanguage(pieces.readAccepted(response.content).question_language);
      return Object.freeze({ status: "ANSWERED", code: null, model: target.model, questionLanguage: named, disagrees: practicePlannerDisagrees(lock, named) });
    } catch (error) {
      return Object.freeze({ status: job.endedBusy() ? "BUSY" : "FAILED", code: errorCodeOf(error), model: target.model, questionLanguage: null, disagrees: null });
    }
  };

  const records: PracticeLanguageCaseRecord[] = [];
  const notRun: PracticeLanguageNotRun[] = [];
  for (const [index, entry] of (input.cases ?? PRACTICE_LANGUAGE_CASES).entries()) {
    const stop = GATE_NAMES.map((gate) => input.observer.stopped(gate)).find((gateStop) => gateStop !== null) ?? null;
    if (stop !== null || input.shouldStop?.() === true) {
      const skipped = Object.freeze({ id: entry.id, code: stop?.reason ?? "PRACTICE_INTERRUPTED" });
      notRun.push(skipped);
      input.onNotRun?.(skipped);
      continue;
    }
    const site = questionLanguageOf(entry.site);
    if (site === null) throw new PracticeRefusal("PRACTICE_LANGUAGE_CASE_INVALID", entry.id);
    // eld exactly as the decider reads it: a failing eld is no reading (decider.ts `#read`; pre-flight PF-D21).
    let reading: EldReading;
    try { reading = eld.read(entry.questionLine); } catch { reading = NO_ELD_READING; }
    // ALWAYS asked in this mode (P2L amendment P2d-2), so its reading is recorded even when eld settles the question, and
    // even for a case worked out with the fast check off (`fastCheck: "OFF"`), whose lock never uses it.
    const fast = await fastCheck.read(entry.questionLine, site);
    const outcome = practiceLanguageOutcome(site, reading, fast, entry.questionLine, ASK_QUESTION_MAX_BYTES, entry.fastCheck !== "OFF");
    // The AIs take turns as the planner, one case each, so each AI's naming shows up.
    const planner = await plannerCall(entry, outcome.lock, seats[index % seats.length]!);
    const record = practiceLanguageCaseRecord({ entry, eld: reading, fast, outcome, planner });
    records.push(record);
    input.onCase?.(record);
    input.progress?.(`${entry.id}: lock ${record.lock} (${record.lockSource}), fast check ${record.fastCheck.outcome}, planner ${planner.status}`);
  }
  return Object.freeze({ records: Object.freeze(records), notRun: Object.freeze(notRun) });
}

/** The mode: language.jsonl opened before the first call (a folder that holds one is refused), the run, the report. */
export async function runPracticeLanguageMode(input: PracticeLanguageRunInput & Readonly<{ folder: string; dry: boolean;
  policySource: "REGISTER_EXPORT" | "START_VALUES"; startedAt: Date }>): Promise<PracticeReport> {
  let log: PracticeJsonlWriter;
  try { log = PracticeJsonlWriter.create(input.folder, PRACTICE_LANGUAGE_FILE, "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE"); } catch (error) {
    if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE") {
      throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE", "use a new --out folder");
    }
    throw error;
  }
  const cases = input.cases ?? PRACTICE_LANGUAGE_CASES;
  const fastCheckModel = input.policy.fastCheck?.model ?? "none";
  try {
    log.append({ kind: "start", schema: PRACTICE_LANGUAGE_SCHEMA, dry: input.dry, startedAt: input.startedAt.toISOString(),
      cases: cases.map((entry) => ({ id: entry.id, site: entry.site, questionSha256: sha256(entry.questionLine) })),
      policySource: input.policySource, fastCheckModel });
    const { records, notRun } = await runPracticeLanguage({ ...input, cases,
      onCase: (record) => log.append({ kind: "case", case: record }),
      onNotRun: (entry) => log.append({ kind: "not-run", ...entry }) });
    const finishedAt = new Date();
    log.append({ kind: "end", finishedAt: finishedAt.toISOString() });
    return practiceLanguageReport({ dry: input.dry, startedAt: input.startedAt, finishedAt, policySource: input.policySource,
      fastCheckModel, records, notRun, observer: input.observer });
  } finally {
    log.close();
  }
}

/* ------------------------------------------------------------------ mode "language" --dry: the script */

/** The rewrite the dry script proposes for each case that expects an offer (P2L's own example rewrite). */
export const PRACTICE_LANGUAGE_DRY_REWRITES: Readonly<Record<string, string>> = Object.freeze({
  "lang-ro-en-mix": "Ar trebui România să adopte euro sau să aștepte până cresc salariile?"
});

/** The dry fast check's reply (P2L Task 5 answer form): the case's expected reading; an unknown question is "unknown". */
export function practiceLanguageDryReading(questionLine: string): string {
  const entry = PRACTICE_LANGUAGE_CASES.find((candidate) => candidate.questionLine === questionLine);
  if (entry === undefined) return JSON.stringify({ main_language: "unknown", languages_seen: [], is_real_mix: false, proposed_question: null });
  const main = primary(entry.expectedLock);
  const rewrite = entry.offerExpected ? PRACTICE_LANGUAGE_DRY_REWRITES[entry.id] ?? null : null;
  return JSON.stringify(rewrite === null
    ? { main_language: main, languages_seen: [main], is_real_mix: false, proposed_question: null }
    : { main_language: main, languages_seen: [main, "en"], is_real_mix: true, proposed_question: rewrite });
}

/** The dry planner: the openings dry script's angles, naming the locked language first (so no disagreement). */
function practiceLanguageDryAngles(fields: readonly FramedMaterialField[], serial: number): string {
  const locked = fields.find((field) => field.name === "question_language")?.content;
  const code = locked === undefined ? null : (JSON.parse(locked) as { code?: unknown }).code;
  const angles = JSON.parse(openingsDryContent({ contractId: MAP_CONTRACT_IDS.angles, fields, serial, slip: false })) as object;
  return JSON.stringify({ question_language: typeof code === "string" ? primary(code) : "en", ...angles });
}

/**
 * The two scripted gate ports for `language --dry`: the fast check answered from the case table, MAP:angles from the
 * openings dry script. No socket is opened and nothing is spent. The angles step has no language check (packages/map
 * replies.ts `mapAnglesCheck` reads only ids and kinds), so the script's Romanian or English angles pass for every case.
 */
export function practiceLanguageDryPorts(): Readonly<{ ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }> }> {
  let served = 0;
  const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => Object.freeze({
    async execute(request: Parameters<PreviewBudgetPort["execute"]>[0]) {
      served += 1;
      const { model, packet } = openingsDryPacket(request.requestBody);
      const frame = readPromptFrame(packet);
      const content = frame.contractId === QUESTION_LANGUAGE_CHECK_CONTRACT_ID
        ? practiceLanguageDryReading(frame.fields.find((field) => field.name === "question_line")?.content ?? "")
        : practiceLanguageDryAngles(frame.fields, served);
      return { status: 200, body: openingsDryVendorReply(provider, model, content, served) };
    }
  });
  return Object.freeze({ ports: Object.freeze({ deepinfra: port("deepinfra"), anthropic: port("anthropic") }) });
}
