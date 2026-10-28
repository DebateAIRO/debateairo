import { createHash } from "node:crypto";
import { QUESTION_LANGUAGE_CHOICE_NEEDED, QuestionLanguageOfferSchema, type AskRequest, type QuestionLanguageOffer } from "@debateai/contract";
import { TypedDomainError, detectArgumentLanguage, questionLanguageOf, type QuestionLanguage } from "@debateai/kernel";
import {
  REPEAT_OFFER_WINDOW, decideAfterFast, decideBeforeFast, decisionRecordCode, withoutRepeatOffer, type LanguageDecision, type LockSource
} from "./decide.js";
import type { EldReader, EldReading } from "./eld.js";
import { eldConfident } from "./eld-tuning.js";
import type { FastCheck, FastCheckReading } from "./fast-check.js";
import { signQuestionLanguageReference, verifyQuestionLanguageChoice, type QuestionLanguageReferenceKey } from "./reference.js";

/**
 * Question language at "Start debate" (question-language spec 2026-10-13). This is the FIRST step of submit, but only
 * with the debate shape row. It turns the ask into a lock, or into an offer the person answers.
 *
 *   ask ─┬─ question_language_choice ──► verify the server's signed reference (Task 8) ──► LOCK "CHOICE" (or a refusal)
 *        └─ otherwise: eld reads the question (a failing eld is "no reading")
 *             └─ decideBeforeFast (Task 7): ELD_SITE, or LOCAL_* when there is no fast check (L-ROUTE) or no
 *                recorded consent (L-NOCONSENT), or "ask the fast AI"
 *                  └─ the fast check (Task 5; its time limit is the row's, inside createFastCheck; any throw = DOWN)
 *                       └─ decideAfterFast ─► withoutRepeatOffer (CR-5, L-REPEAT) ─► LOCK, or an OFFER that the
 *                          contract's 409 body must accept (PF-L19: else LOCK the main language) ─► thrown
 *                          QuestionLanguageChoiceNeeded — only to a client that sent site_language (L-POPUP-FIRST:
 *                          one that did not cannot show the pop-up, so it gets the main-language lock instead)
 *
 * It never blocks the person: every failure ends in a lock. It logs nothing, and no error it raises carries the
 * question, the rewrite or the reply: codes and hashes only. It holds no lock (mutex, row or admission) while it
 * waits for the fast AI; the only state is the in-process repeat-offer memory below.
 * NV-47: right before each paid check it asks the person's own count of paid checks (`fastCheckBudget`); spent, or a
 * budget that throws, sends nothing and reads DOWN SKIPPED_OWNER_BUDGET (the fallback lock, never a block).
 */
export type QuestionLanguageTrace = Readonly<{
  eld: Readonly<{ code: string | null; reliable: boolean; confident: boolean }> | null;
  fast: Readonly<{ outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; main: string | null }> | null;
  contractHash: string | null;
}>;

/**
 * Why no fast check ran (progress NOTE for Task 10: the reason beside every LOCAL_* code). SIGNED_OUT is the person's
 * (ruling L-NOCONSENT); the others are the deployment's, stated at composition (Task 12): local mode, a preview with
 * no Anthropic gate (L-ROUTE), hosted before 0118's run-less spend record exists (Task 19), hosted with no Anthropic
 * support target to take the key from (Task 19), the row's fast check switched off.
 * NO_FAST_CHECK: the composition stated no reason.
 */
export type QuestionLanguageLocalReason =
  | "SIGNED_OUT" | "LOCAL_MODE" | "NO_GATE" | "HOSTED_BEFORE_SPEND_RECORD" | "NO_HOSTED_KEY" | "POLICY_OFF" | "NO_FAST_CHECK";
export type QuestionLanguageFastCheckOffReason = Exclude<QuestionLanguageLocalReason, "SIGNED_OUT" | "NO_FAST_CHECK">;

/**
 * `recordCode` is decide.ts's `decisionRecordCode` (with the reader's rewrite refusal, ruling L-REWRITE), or this
 * file's own code for an offer the contract refused; `localReason` is set exactly when `source` is LOCAL_*.
 */
export type QuestionLanguageLock = Readonly<{ language: QuestionLanguage; source: LockSource; siteLanguage: string;
  rewriteAccepted: boolean; originalQuestionLine: string | null; trace: QuestionLanguageTrace;
  recordCode: string; localReason: QuestionLanguageLocalReason | null }>;

/**
 * A real-mix offer, thrown to end the request with a 409. It validates its own body against the contract's 409 schema
 * (PF-L19), so no port or double can hand the route a body whose parse would throw a 500: a body the contract refuses
 * is the typed QUESTION_LANGUAGE_OFFER_INVALID instead (`from` answers null, for the decider's lock). `offer` and
 * `trace` are NON-enumerable, so logging the error or JSON.stringify of it never prints the rewrite; the message and
 * `code` are the code alone.
 */
export class QuestionLanguageChoiceNeeded extends Error {
  readonly code = QUESTION_LANGUAGE_CHOICE_NEEDED;
  declare readonly offer: QuestionLanguageOffer;
  declare readonly trace: QuestionLanguageTrace;
  constructor(offer: unknown, trace: QuestionLanguageTrace) {
    super(QUESTION_LANGUAGE_CHOICE_NEEDED);
    const parsed = QuestionLanguageOfferSchema.safeParse(offer);
    if (!parsed.success) throw new TypedDomainError("QUESTION_LANGUAGE_OFFER_INVALID", "QUESTION_LANGUAGE_OFFER_INVALID");
    this.name = "QuestionLanguageChoiceNeeded";
    const body: QuestionLanguageOffer = Object.freeze({ ...parsed.data,
      main_language: Object.freeze({ ...parsed.data.main_language }),
      languages_seen: Object.freeze(parsed.data.languages_seen.map((language) => Object.freeze({ ...language }))) as QuestionLanguageOffer["languages_seen"] });
    Object.defineProperty(this, "offer", { value: body, enumerable: false, writable: false, configurable: false });
    Object.defineProperty(this, "trace", { value: Object.freeze({ ...trace }), enumerable: false, writable: false, configurable: false });
  }

  /** The offer, or null when the contract would refuse its body (the caller then locks instead: never a block). */
  static from(offer: unknown, trace: QuestionLanguageTrace): QuestionLanguageChoiceNeeded | null {
    return QuestionLanguageOfferSchema.safeParse(offer).success ? new QuestionLanguageChoiceNeeded(offer, trace) : null;
  }
}

/**
 * `fastCheckAllowed` (ruling L-NOCONSENT): the route records sensitive-data consent only for signed-in people, so a
 * signed-out (legacy) person's question never reaches the fast AI: eld and the site language decide, no offer.
 */
export type QuestionLanguagePort = Readonly<{ decide(input: Readonly<{ ask: AskRequest; ownerScope: string; fastCheckAllowed: boolean }>): Promise<QuestionLanguageLock> }>;

/**
 * The owner scope the check reference binds (Task 8) and the repeat-offer memory keys on. For a signed-in person it is
 * `owner:<ownerRef>`, the same string as `session.asker_id` inside submit; never the route's bare ownerRef.
 */
export function ownerScopeOf(principal: Readonly<{ kind: "server"; ownerRef: string } | { kind: "legacy"; legacyAskerId: string }>): string {
  return principal.kind === "server" ? `owner:${principal.ownerRef}` : `legacy:${principal.legacyAskerId}`;
}

/** CR-5: at most this many offers are remembered (oldest dropped first); each for REPEAT_OFFER_WINDOW only. */
const OFFER_MEMORY = Object.freeze({ entries: 10_000 });

/**
 * The decider's own bound on the fast call: the row's limit (FastCheck.timeoutMs, which createFastCheck applies
 * itself) plus a margin, so a port that ignores its own limit can never hold the request. A FastCheck naming no
 * usable limit is bounded by the row's largest (register question-language-policy: 1,000..15,000 ms).
 */
const FAST_CALL_BOUND = Object.freeze({ marginMs: 1_000, rowMaxMs: 15_000 });

/** A failing eld is no reading (never block): the fast AI, or the site language, decides. */
const NO_READING: EldReading = Object.freeze({ code: null, reliable: false, letters: 0, segments: Object.freeze([]) });

const fastTrace = (reading: FastCheckReading): QuestionLanguageTrace["fast"] => reading.kind === "DOWN"
  ? Object.freeze({ outcome: "DOWN", reason: reading.reason, main: null })
  : Object.freeze({ outcome: reading.kind, reason: null, main: reading.main.code });

const primary = (code: string): string => code.split("-")[0]!;

const refusal = (code: "QUESTION_LANGUAGE_CHECK_INVALID" | "QUESTION_LANGUAGE_DECISION_INVALID"): TypedDomainError =>
  new TypedDomainError(code, code);

/** CR-5: the memory's key. A hash of the person's scope and the question, never the text itself. */
const offerKeyOf = (ownerScope: string, questionLine: string): string =>
  createHash("sha256").update(`debateai:question-language-offer:v1\0${ownerScope}\0${questionLine.trim()}`, "utf8").digest("hex");

export class QuestionLanguageDecider implements QuestionLanguagePort {
  /** CR-5: when each offer was made, by offerKeyOf (insertion order = age); bounded in size and in time. */
  readonly #offered = new Map<string, number>();
  readonly #deps: Readonly<{ eld: EldReader; fastCheck: FastCheck | null; key: QuestionLanguageReferenceKey;
    clock: () => Date; maxQuestionBytes: number; onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void;
    fastCheckOffReason?: QuestionLanguageFastCheckOffReason; repeatOfferMemoryEntries?: number;
    fastCheckBudget?: (ownerScope: string) => boolean }>;
  readonly #memoryEntries: number;

  /**
   * `onDecided` receives the lock (with the original question of an accepted rewrite) or the offer: wire it only to
   * practice (P2d), never to a logger. `fastCheckOffReason`: why `fastCheck` is null on this deployment (Task 12).
   * `repeatOfferMemoryEntries`: the memory's size bound (default 10,000; tests pass a small one).
   * `fastCheckBudget` (NV-47): asked once right before a paid check, with the owner scope; false, or a throw, means
   * skipped (no call). Absent = no per-person bound (the preview, tests).
   */
  constructor(deps: Readonly<{ eld: EldReader; fastCheck: FastCheck | null; key: QuestionLanguageReferenceKey;
    clock: () => Date; maxQuestionBytes: number; onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void;
    fastCheckOffReason?: QuestionLanguageFastCheckOffReason; repeatOfferMemoryEntries?: number;
    fastCheckBudget?: (ownerScope: string) => boolean }>) {
    const entries = deps.repeatOfferMemoryEntries ?? OFFER_MEMORY.entries;
    if (!Number.isInteger(entries) || entries < 1) throw refusal("QUESTION_LANGUAGE_DECISION_INVALID");
    this.#deps = deps;
    this.#memoryEntries = entries;
  }

  async decide(input: Readonly<{ ask: AskRequest; ownerScope: string; fastCheckAllowed: boolean }>): Promise<QuestionLanguageLock> {
    const questionLine = input.ask.question_line;
    const choice = input.ask.question_language_choice;
    if (choice !== undefined) return this.#chosen(input.ownerScope, questionLine, choice);

    const site = questionLanguageOf(input.ask.site_language ?? "en") ?? questionLanguageOf("en")!;
    const reading = this.#read(questionLine);
    const eld = Object.freeze({ code: reading.code, reliable: reading.reliable, confident: eldConfident(reading) });
    const fastCheck = this.#deps.fastCheck;
    const before = decideBeforeFast(site, reading, questionLine,
      { fastCheckAvailable: fastCheck !== null, fastCheckAllowed: input.fastCheckAllowed });
    if (before.kind === "OFFER") {
      // Impossible (decideBeforeFast never offers), but never a block: the site language, by its own record code.
      return this.#done(Object.freeze({ language: site, source: "FALLBACK_SITE", siteLanguage: site.code, rewriteAccepted: false,
        originalQuestionLine: null, trace: Object.freeze({ eld, fast: null, contractHash: null }), recordCode: "DECISION_FALLBACK_SITE",
        localReason: null }));
    }
    if (before.kind === "LOCK") {
      const localReason: QuestionLanguageLocalReason | null = before.source !== "LOCAL_ELD" && before.source !== "LOCAL_SITE" ? null
        : fastCheck === null ? this.#deps.fastCheckOffReason ?? "NO_FAST_CHECK" : "SIGNED_OUT";
      return this.#lock(site, before, Object.freeze({ eld, fast: null, contractHash: null }), localReason);
    }
    // L-ROUTE: only reached with a fast check on this deployment. No lock is held while it runs.
    // NV-47: the person's own count of paid checks, asked once here (the only path to #fast); spent = nothing is sent.
    const fast = this.#budgetAllows(input.ownerScope) ? await this.#fast(fastCheck!, questionLine, site)
      : Object.freeze({ kind: "DOWN" as const, reason: "SKIPPED_OWNER_BUDGET" as const });
    const trace = Object.freeze({ eld, fast: fastTrace(fast), contractHash: fastCheck!.contractHash });
    const offerKey = offerKeyOf(input.ownerScope, questionLine);
    const nowMs = this.#deps.clock().getTime();
    const decision = withoutRepeatOffer(decideAfterFast(site, reading, fast, questionLine, this.#deps.maxQuestionBytes),
      this.#lastOfferAt(offerKey, nowMs), nowMs);
    if (decision.kind === "LOCK") {
      // Task 19 fix round 2: a check skipped on purpose (the site pot at its ceiling, or the spend record down) says so
      // beside the lock's own code, so the record tells a skip from a vendor failure. NV-47: and the person's budget spent.
      const skipped = fast.kind !== "DOWN" ? null : fast.reason === "SKIPPED_DAY_POT" ? "FAST_CHECK_SKIPPED_DAY_POT"
        : fast.reason === "SPEND_RECORD_DOWN" ? "FAST_CHECK_SPEND_RECORD_DOWN"
        : fast.reason === "SKIPPED_OWNER_BUDGET" ? "FAST_CHECK_SKIPPED_OWNER_BUDGET" : null;
      return this.#lock(site, decision, trace, null, skipped);
    }
    // Ruling L-POPUP-FIRST (final review I5b): an ask with no site_language comes from a client that cannot show the
    // pop-up (practice, today's page), so a real mix is never thrown at it: the fast AI's main language is locked, as
    // the table's own FAST_MIX_NO_OFFER does. Nothing was shown, so nothing is signed or remembered as shown.
    if (input.ask.site_language === undefined) {
      return this.#done(Object.freeze({ language: decision.main, source: "FAST_MIX_NO_OFFER", siteLanguage: site.code,
        rewriteAccepted: false, originalQuestionLine: null, trace, recordCode: "FAST_MIX_NO_OFFER:NO_SITE_LANGUAGE", localReason: null }));
    }

    const checkRef = signQuestionLanguageReference(this.#deps.key, { ownerScope: input.ownerScope, site: site.code, questionLine,
      proposed: decision.proposed, main: decision.main.code, now: new Date(nowMs) });
    // PF-L19: the offer must be a body the 409 can carry (the route parses it; a failure there would be a 500, a
    // block). One the contract refuses is never sent and never remembered as shown: the main language is locked.
    const needed = QuestionLanguageChoiceNeeded.from({ check_ref: checkRef,
      main_language: { code: decision.main.code, name: decision.main.name },
      languages_seen: decision.seen.map((language) => ({ code: language.code, name: language.name })),
      proposed_question: decision.proposed }, trace);
    if (needed === null) {
      // L-B64: the lock carries the language's own English name, never the refused one.
      const language = questionLanguageOf(primary(decision.main.code), questionLine) ?? site;
      return this.#done(Object.freeze({ language, source: "FAST_MIX_NO_OFFER", siteLanguage: site.code, rewriteAccepted: false,
        originalQuestionLine: null, trace, recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED", localReason: null }));
    }
    this.#remember(offerKey, nowMs);
    this.#deps.onDecided?.(needed);
    throw needed;
  }

  /** The person's answer to an offer: only what the server signed (Task 8); a refusal is a TypedDomainError. */
  #chosen(ownerScope: string, questionLine: string, sent: NonNullable<AskRequest["question_language_choice"]>): QuestionLanguageLock {
    const choice = Object.freeze({ check_ref: sent.check_ref, choice: sent.choice,
      ...(sent.original_question_line === undefined ? {} : { original_question_line: sent.original_question_line }) });
    const verified = verifyQuestionLanguageChoice(this.#deps.key, { ownerScope, questionLine, choice, now: this.#deps.clock() });
    const language = questionLanguageOf(primary(verified.main), questionLine);
    if (language === null) throw refusal("QUESTION_LANGUAGE_CHECK_INVALID");
    return this.#done(Object.freeze({ language, source: "CHOICE", siteLanguage: verified.site, rewriteAccepted: verified.rewriteAccepted,
      originalQuestionLine: verified.originalQuestionLine,
      trace: Object.freeze({ eld: null, fast: null, contractHash: this.#deps.fastCheck?.contractHash ?? null }),
      recordCode: "CHOICE", localReason: null }));
  }

  #read(questionLine: string): EldReading {
    try {
      return this.#deps.eld.read(questionLine);
    } catch {
      return NO_READING;
    }
  }

  /** NV-47: no budget = no per-person bound; a budget that answers anything but true, or throws, is a skip. */
  #budgetAllows(ownerScope: string): boolean {
    const budget = this.#deps.fastCheckBudget;
    if (budget === undefined) return true;
    try {
      return budget(ownerScope) === true;
    } catch {
      return false;
    }
  }

  /**
   * Never blocks: createFastCheck never throws and applies the row's limit, but any FastCheck that throws is DOWN
   * (TRANSPORT), and one still pending just past the row's limit is DOWN (TIMEOUT): the table's fallback either way.
   */
  async #fast(fastCheck: FastCheck, questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> {
    const rowMs = Number.isFinite(fastCheck.timeoutMs) && fastCheck.timeoutMs > 0 ? fastCheck.timeoutMs : FAST_CALL_BOUND.rowMaxMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<FastCheckReading>((resolve) => {
      timer = setTimeout(() => resolve(Object.freeze({ kind: "DOWN", reason: "TIMEOUT" })), rowMs + FAST_CALL_BOUND.marginMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => fastCheck.read(questionLine, site)), expired]);
    } catch {
      return Object.freeze({ kind: "DOWN", reason: "TRANSPORT" });
    } finally {
      clearTimeout(timer);
    }
  }

  #lock(site: QuestionLanguage, decision: Extract<LanguageDecision, { kind: "LOCK" }>, trace: QuestionLanguageTrace,
    localReason: QuestionLanguageLocalReason | null, skipped: string | null = null): QuestionLanguageLock {
    const recordCode = skipped === null ? decisionRecordCode(decision) : `${decisionRecordCode(decision)}:${skipped}`;
    return this.#done(Object.freeze({ language: decision.language, source: decision.source, siteLanguage: site.code, rewriteAccepted: false,
      originalQuestionLine: null, trace, recordCode, localReason }));
  }

  /** CR-5: drops entries older than the window (oldest first), then answers when this key was last offered. */
  #lastOfferAt(offerKey: string, nowMs: number): number | null {
    for (const [key, at] of this.#offered) {
      if (nowMs < at + REPEAT_OFFER_WINDOW.ms) break;
      this.#offered.delete(key);
    }
    return this.#offered.get(offerKey) ?? null;
  }

  #remember(offerKey: string, nowMs: number): void {
    this.#offered.delete(offerKey);
    this.#offered.set(offerKey, nowMs);
    while (this.#offered.size > this.#memoryEntries) this.#offered.delete(this.#offered.keys().next().value!);
  }

  #done(lock: QuestionLanguageLock): QuestionLanguageLock {
    this.#deps.onDecided?.(lock);
    return lock;
  }
}

/** The run's tag and name: the lock's, or today's guesser when there is no lock (today's shape, byte for byte). */
export function runLanguageOf(lock: QuestionLanguageLock | null, questionLine: string): Readonly<{ tag: string; nameEn: string }> {
  if (lock === null) {
    const detected = detectArgumentLanguage(questionLine);
    return Object.freeze({ tag: detected.tag, nameEn: detected.nameEn });
  }
  return Object.freeze({ tag: lock.language.code, nameEn: lock.language.name });
}

/**
 * The run's stored ask contract gains ONE member with the row (plan decision D3). It is encrypted with the run's
 * content for every signed-in person. Codes and hashes only, plus the original question when a rewrite was used.
 * `record_code` appears only when it says more than `source` (a rewrite refusal, a refused offer body);
 * `local_reason` only beside a LOCAL_* source.
 */
export function questionLanguageAskContractMember(lock: QuestionLanguageLock | null): Readonly<Record<string, unknown>> {
  if (lock === null) return Object.freeze({});
  return Object.freeze({ question_language: Object.freeze({
    code: lock.language.code, name: lock.language.name, source: lock.source, site_language: lock.siteLanguage,
    rewrite_accepted: lock.rewriteAccepted,
    ...(lock.recordCode === lock.source ? {} : { record_code: lock.recordCode }),
    ...(lock.localReason === null ? {} : { local_reason: lock.localReason }),
    ...(lock.originalQuestionLine === null ? {} : { original_question_line: lock.originalQuestionLine }),
    ...(lock.trace.eld === null ? {} : { eld: lock.trace.eld }),
    ...(lock.trace.fast === null ? {} : { fast: lock.trace.fast }),
    ...(lock.trace.contractHash === null ? {} : { contract_hash: lock.trace.contractHash })
  }) });
}
