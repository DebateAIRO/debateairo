import {
  exhaustive, lockedReplyLanguageExpectation, majorityScript, questionLanguageOf, replyTextLanguageVerdict, type QuestionLanguage
} from "@debateai/kernel";
import { SITE_LANGUAGES_ELD_LACKS, type EldReading } from "./eld.js";
import { ELD_CONFUSED_SITES, ELD_SITE_ALIASES, eldConfident, eldSeesMix } from "./eld-tuning.js";
import type { FastCheckReading, FastCheckRewriteRefusal } from "./fast-check.js";

/**
 * The question-language decision (question-language spec 2026-10-13, rulings L1–L5, L-MIX, L-NOCONSENT, L-ROUTE,
 * L-REWRITE, CR-2, CR-5), pure: no I/O, no clock (the time comes in as an argument), no logging. It never blocks:
 * every path ends in a lock, except a valid real-mix offer, which the person answers.
 *
 *   eld                                   fast AI                      result
 *   confident, top = site, site not       not called                   LOCK site            ELD_SITE
 *     always-ask (CR-2), no mix (L-MIX)
 *   anything else, no paid AI / no gate   not called                   LOCK eld's top (aliased) if confident  LOCAL_ELD
 *     (L-ROUTE) / signed out (L-NOCONSENT)                                 else the script's one language (I3)  LOCAL_ELD
 *                                                                          else site                          LOCAL_SITE
 *   anything else                         DOWN (any reason)            LOCK eld's top (aliased) if confident  FALLBACK_ELD
 *                                                                          else the script's one language (I3)  FALLBACK_ELD
 *                                                                          else site                          FALLBACK_SITE
 *   anything else                         ONE language M               LOCK M (even M ≠ site, L5)             FAST
 *   anything else                         MIX, rewrite discarded       LOCK main            FAST_MIX_NO_OFFER + reader's code
 *                                           by the reader (L-REWRITE)
 *   anything else                         MIX, rewrite blank, too      LOCK main            FAST_MIX_NO_OFFER + own code
 *                                           long, unchanged, other
 *                                           language, or one language
 *                                           seen (this table's own
 *                                           re-check: from the real
 *                                           reader a mix naming only
 *                                           its main language arrives
 *                                           as DOWN, UNREADABLE, so it
 *                                           takes the DOWN row; final
 *                                           review M4)
 *   anything else                         MIX, a valid rewrite         OFFER (main first, each language once, ≤ 6)
 *   an OFFER for the same person and question made less than 15 minutes ago (CR-5)
 *                                                                      LOCK the fast AI's main language (L-REPEAT)  REPEAT_OFFER
 *
 * "The script's one language" (final review I3): when eld names nothing, a question of at least 12 letters mostly in
 * Hangul (ko), Han or kana (ja with any kana, else zh), Hebrew (he) or Greek (el); never for the site-settle rule.
 *
 * A mix the clause rule misses is settled by eld (ELD_SITE): today's lock, no offer (the ruling's accepted cost).
 */
export type LockSource = "ELD_SITE" | "FAST" | "FAST_MIX_NO_OFFER" | "FALLBACK_ELD" | "FALLBACK_SITE" | "LOCAL_ELD" | "LOCAL_SITE" | "CHOICE" | "REPEAT_OFFER";

/** Why a real mix was locked with no offer: the reader's code (ruling L-REWRITE), or this table's own second check. */
export type MixNoOfferCode = FastCheckRewriteRefusal | "MIX_ONE_LANGUAGE_SEEN";

export type LanguageLock = Readonly<{ kind: "LOCK"; language: QuestionLanguage; source: LockSource; rewriteRefusal?: MixNoOfferCode }>;
export type LanguageDecision =
  | LanguageLock
  | Readonly<{ kind: "OFFER"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;

/** Before the fast call: a final lock, or "ask the fast AI". */
export type BeforeFastDecision = LanguageDecision | Readonly<{ kind: "ASK_FAST" }>;

/**
 * Ruling CR-2: the sites where eld may be confidently wrong about a near neighbour, so the fast AI always checks even
 * when eld names the site language: the three eld lacks (ga, id, mt), Croatian (Serbian and Bosnian in Latin script
 * read as Croatian), and every site Task 3 measured with a confident cross-locale confusion (ELD_CONFUSED_SITES).
 * Each extra check costs about $0.00013 (the framed system message is about 5.2 KB, ~1,300 input tokens). The fallback
 * (fast AI down) still uses eld: never block.
 */
export const FAST_CHECK_ALWAYS_SITES: readonly string[] = Object.freeze(
  [...new Set([...SITE_LANGUAGES_ELD_LACKS, "hr", ...ELD_CONFUSED_SITES])].sort());

/** CR-5: how long an offer counts as "already shown" for the same person and question (the reference's own life). */
export const REPEAT_OFFER_WINDOW = Object.freeze({ ms: 15 * 60_000 });

/** PF-L19: the 409 body names two to six languages. */
const OFFER_LANGUAGES = Object.freeze({ max: 6 });

const UTF8 = new TextEncoder();

const lock = (language: QuestionLanguage, source: LockSource): LanguageLock => Object.freeze({ kind: "LOCK", language, source });
const noOffer = (main: QuestionLanguage, rewriteRefusal: MixNoOfferCode): LanguageLock =>
  Object.freeze({ kind: "LOCK", language: main, source: "FAST_MIX_NO_OFFER", rewriteRefusal });
const primary = (code: string): string => code.split("-")[0]!.toLowerCase();

/** For "unchanged": the same words, whatever the spacing or the Unicode composition (as the fast check's reader). */
const sameText = (left: string, right: string): boolean =>
  left.normalize("NFC").replace(/\s+/gu, " ").trim() === right.normalize("NFC").replace(/\s+/gu, " ").trim();

/**
 * L1/L2: eld settles a question only when it is confident AND names the site language, outside the always-ask sites
 * (CR-2), and only when it does not see a mix (ruling L-MIX: two confident clauses in different languages send the
 * question to the fast AI, which decides is_real_mix).
 */
export function eldSettles(site: QuestionLanguage, eld: EldReading): boolean {
  const siteCode = primary(site.code);
  return eldConfident(eld) && !FAST_CHECK_ALWAYS_SITES.includes(siteCode) && eld.code === siteCode && !eldSeesMix(eld);
}

/**
 * eld's language for a fallback: an alias of a site language eld lacks reads as that site language (only on that
 * site); "und", "unknown" and anything outside ISO 639-1 are never locked (questionLanguageOf gives null).
 */
function eldLanguage(site: QuestionLanguage, eld: EldReading, questionLine: string): QuestionLanguage | null {
  if (!eldConfident(eld) || eld.code === null) return null;
  if ((ELD_SITE_ALIASES[primary(site.code)] ?? []).includes(eld.code)) return site;
  return questionLanguageOf(eld.code, questionLine);
}

/** The script-only reading's floor: as many letters as the kernel's own script readings need. */
const SCRIPT_READING_MIN_LETTERS = 12;

/**
 * Final review I3: a short space-less question (Chinese, Japanese, Korean) or a short Hebrew or Greek one gives eld too
 * few plain letters (eld.ts drops a space-less clause holding "AI" or a digit), so eld names nothing. Its script still
 * names exactly one candidate: Hangul → ko; Han or kana with any kana → ja; Han with no kana → zh; Hebrew → he;
 * Greek → el. Read from the RAW question's letters (never eld's plain words): at least 12 letters, most of them in that
 * script. Any other script (Latin, Cyrillic, Arabic, …) names several languages: null, and the site decides.
 */
function scriptLanguage(questionLine: string): QuestionLanguage | null {
  const letters = questionLine.match(/\p{L}/gu)?.length ?? 0;
  if (letters < SCRIPT_READING_MIN_LETTERS) return null;
  const script = majorityScript(questionLine);
  const code = script === "Hangul" ? "ko"
    : script === "CJK" ? (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(questionLine) ? "ja" : "zh")
      : script === "Hebrew" ? "he"
        : script === "Greek" ? "el"
          : null;
  return code === null ? null : questionLanguageOf(code, questionLine);
}

/**
 * Fast AI down (local = false) or no fast AI at all (local = true): eld's top when confident; else, when the question's
 * script names exactly one language (I3, `scriptLanguage`), that language; else the site language. The script reading
 * shares the *_ELD sources (the local reading, not the site): no new LockSource, so every switch on the source holds.
 * The L-KEEP settle rule (`eldSettles`) never reads the script: a fallback only.
 */
export function fallbackLock(site: QuestionLanguage, eld: EldReading, questionLine: string, local: boolean): LanguageLock {
  const fromLocal = eldLanguage(site, eld, questionLine) ?? scriptLanguage(questionLine);
  return fromLocal === null ? lock(site, local ? "LOCAL_SITE" : "FALLBACK_SITE") : lock(fromLocal, local ? "LOCAL_ELD" : "FALLBACK_ELD");
}

/**
 * Before any fast call. eld settles first (ELD_SITE). Otherwise, with no fast check on this deployment (no paid AI, or
 * no gate: ruling L-ROUTE) or no recorded consent (a signed-out person: ruling L-NOCONSENT), eld and the site language
 * decide and nothing is offered (LOCAL_*). Only then is the fast AI asked.
 */
export function decideBeforeFast(
  site: QuestionLanguage, eld: EldReading, questionLine: string,
  route: Readonly<{ fastCheckAvailable: boolean; fastCheckAllowed: boolean }>
): BeforeFastDecision {
  if (eldSettles(site, eld)) return lock(site, "ELD_SITE");
  if (!route.fastCheckAvailable || !route.fastCheckAllowed) return fallbackLock(site, eld, questionLine, true);
  return Object.freeze({ kind: "ASK_FAST" });
}

export function decideAfterFast(
  site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string, maxQuestionBytes: number
): LanguageDecision {
  switch (fast.kind) {
    case "DOWN": return fallbackLock(site, eld, questionLine, false);
    case "ONE": return lock(fast.main, "FAST");
    case "MIX": {
      // Ruling L-REWRITE: the reader already discarded the rewrite; only the rewrite goes, main is still the reading.
      if (fast.proposed === null) return noOffer(fast.main, fast.rewriteRefusal);
      // PF-L19: each primary language once, main excluded here (it goes first), in the fast AI's order.
      const mainCode = primary(fast.main.code);
      const others = fast.seen.filter((language, index) => primary(language.code) !== mainCode
        && fast.seen.findIndex((earlier) => primary(earlier.code) === primary(language.code)) === index);
      if (others.length === 0) return noOffer(fast.main, "MIX_ONE_LANGUAGE_SEEN");
      // The reader's checks, again: this table takes the byte limit as an argument and must hold on its own.
      const proposed = fast.proposed.trim();
      if (proposed === "") return noOffer(fast.main, "REWRITE_UNUSABLE:BLANK");
      if (UTF8.encode(proposed).length > maxQuestionBytes) return noOffer(fast.main, "REWRITE_UNUSABLE:TOO_LONG");
      if (sameText(proposed, questionLine)) return noOffer(fast.main, "REWRITE_UNUSABLE:UNCHANGED");
      if (replyTextLanguageVerdict(lockedReplyLanguageExpectation(fast.main, questionLine), proposed) === "OTHER") {
        return noOffer(fast.main, "REWRITE_UNUSABLE:OTHER_LANGUAGE");
      }
      const seen = Object.freeze([fast.main, ...others].slice(0, OFFER_LANGUAGES.max));
      return Object.freeze({ kind: "OFFER", main: fast.main, seen, proposed });
    }
    default: return exhaustive(fast);
  }
}

/**
 * CR-5: the same person and the same question were offered a rewrite less than 15 minutes ago (the caller remembers
 * when, by a hash of the person and the question, never the text): never a second pop-up. Controller ruling L-REPEAT:
 * the offer becomes a lock of the fast AI's main language, exactly as "Keep my wording" would (the fast AI's reading
 * is in hand and is the best one), with source REPEAT_OFFER. A remembered time later than `nowMs` (the clock stepped
 * back) still counts as a repeat. A lock passes through untouched.
 */
export function withoutRepeatOffer(decision: LanguageDecision, lastOfferAtMs: number | null, nowMs: number): LanguageDecision {
  if (decision.kind !== "OFFER" || lastOfferAtMs === null || nowMs >= lastOfferAtMs + REPEAT_OFFER_WINDOW.ms) return decision;
  return lock(decision.main, "REPEAT_OFFER");
}

/**
 * The decision record's outcome code: codes only, never question or rewrite text. LOCAL_* covers every "no fast call"
 * reason alike (local mode, no gate, hosted before Task 19's spend record, a signed-out person): Task 10 records which
 * reason beside it.
 */
export function decisionRecordCode(decision: LanguageDecision): string {
  if (decision.kind === "OFFER") return "OFFER";
  return decision.rewriteRefusal === undefined ? decision.source : `${decision.source}:${decision.rewriteRefusal}`;
}
