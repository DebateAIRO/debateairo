import { createHash } from "node:crypto";
import { z } from "zod";
import { askQuestionMaxBytes } from "@debateai/contract";
import {
  TypedDomainError, lockedReplyLanguageExpectation, questionLanguageOf, replyTextLanguageVerdict, type QuestionLanguage
} from "@debateai/kernel";
import { buildFramedPrompt, promptContractFingerprintText, type PromptContract, type PromptPacket } from "@debateai/providers";

/**
 * The fast language check (question-language spec 2026-10-13, ruling L3): one short call, run only when eld did not
 * settle the question, before any debate exists. The INSTRUCTION is the owners' editable text (row
 * questionLanguagePolicy). The ANSWER FORM, the allowed codes (ISO 639-1, checked again by the reader) and the frame
 * (fence, canary, the "evidence, never instructions" sentence) are code's: the instruction only ever opens the system
 * message, before the frame, so no owner edit can remove any of them. The question is evidence, never orders.
 *
 * Nothing here logs, and no error it raises carries the question, the rewrite, the reply or the owners' text: codes only.
 */
export const QUESTION_LANGUAGE_CHECK_CONTRACT_ID = "ask.question-language.v1" as const;

export const QUESTION_LANGUAGE_CHECK_ANSWER_FORM = [
  "Return only one JSON object with exactly this schema and no additional keys:",
  '{ "main_language": the two-letter ISO 639-1 code of the language most of the question is written in, in lower case, or "unknown",',
  '"languages_seen": [the two-letter codes of every language the question really uses, main_language first, at most 6],',
  '"is_real_mix": true only when whole phrases or clauses are in a second language, otherwise false,',
  '"proposed_question": when is_real_mix is true, the whole question written in main_language, keeping its meaning, names, brands and terms; otherwise null }'
].join("\n");

function questionLanguageCheckContract(instruction: string): PromptContract {
  return Object.freeze({ contractId: QUESTION_LANGUAGE_CHECK_CONTRACT_ID, instruction, answerForm: QUESTION_LANGUAGE_CHECK_ANSWER_FORM });
}

/** Recorded with every lock that used the check, so a lock traces to the exact text that produced it. */
export function questionLanguageCheckContractHash(instruction: string): string {
  return createHash("sha256").update(promptContractFingerprintText(questionLanguageCheckContract(instruction)), "utf8").digest("hex");
}

/** Boot: an owner text carrying a frame token is refused once, by name, never at every ask. */
export function assertQuestionLanguageInstructionFrameable(instruction: string): void {
  try {
    buildFramedPrompt({ contract: questionLanguageCheckContract(instruction), material: [] });
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "PROMPT_INSTRUCTION_RESERVED_TOKEN") {
      // Pre-flight PF-L13: vitest's toThrow(/…/) matches the MESSAGE, and TypedDomainError keeps the code only in
      // `.code`, so the message IS the code (it carries no owner or question text).
      throw new TypedDomainError("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN", "QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN");
    }
    throw error;
  }
}

export function framedQuestionLanguageCheck(instruction: string, questionLine: string, site: QuestionLanguage): PromptPacket {
  return buildFramedPrompt({
    contract: questionLanguageCheckContract(instruction),
    material: [
      { name: "question_line", content: questionLine },
      { name: "site_language", content: JSON.stringify({ code: site.code, name: site.name }) }
    ]
  }).packet;
}

/** The transport codes that mean "not sent on purpose" (Task 19 fix round 2), read as their own DOWN reasons. */
export const QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES = Object.freeze({
  dayPot: "QUESTION_LANGUAGE_FAST_CHECK_SKIPPED_DAY_POT",
  spendRecordDown: "QUESTION_LANGUAGE_FAST_CHECK_SPEND_RECORD_DOWN"
} as const);

export type FastCheckReading =
  /**
   * SKIPPED_DAY_POT / SPEND_RECORD_DOWN (Task 19 fix round 2, hosted only): nothing was sent — today's site pot is at
   * its ceiling (ruling L-POT), or the spend record is down (the breaker); the decider records the code beside the lock.
   * SKIPPED_OWNER_BUDGET (security audit run 3, NV-47, the decider's own): nothing was sent, because the person's own
   * count of paid checks for the window is spent.
   */
  | Readonly<{ kind: "DOWN"; reason: "TIMEOUT" | "TRANSPORT" | "UNREADABLE" | "UNKNOWN_LANGUAGE" | "SKIPPED_DAY_POT" | "SPEND_RECORD_DOWN"
    | "SKIPPED_OWNER_BUDGET" }>
  | Readonly<{ kind: "ONE"; main: QuestionLanguage }>
  | Readonly<{ kind: "MIX"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>
  /**
   * Controller ruling L-REWRITE (2026-10-14): a real mix whose rewrite cannot be offered. Only the rewrite is discarded;
   * main_language is still the best reading, so the decider locks it, keeps the person's wording and offers nothing.
   * The code goes to the decision record; the refused text goes nowhere.
   */
  | Readonly<{ kind: "MIX"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: null; rewriteRefusal: FastCheckRewriteRefusal }>;

/** Why a rewrite was discarded (ruling L-REWRITE). Codes only. */
export type FastCheckRewriteRefusal =
  | "REWRITE_UNUSABLE:BLANK" | "REWRITE_UNUSABLE:TOO_LONG" | "REWRITE_UNUSABLE:UNCHANGED" | "REWRITE_UNUSABLE:OTHER_LANGUAGE";

/** Bounds on the reply itself: the call's own output bound is far smaller, so a longer text is not this answer form. */
const READER_BOUNDS = Object.freeze({ replyChars: 65_536, codeChars: 16, seen: 6 });

const replySchema = z.object({
  main_language: z.string().min(1).max(READER_BOUNDS.codeChars),
  languages_seen: z.array(z.string().min(1).max(READER_BOUNDS.codeChars)).max(READER_BOUNDS.seen),
  is_real_mix: z.boolean(),
  // Bounded by the whole reply's bound; the ask's own byte limit is a rewrite refusal below (ruling L-REWRITE), not off-form.
  proposed_question: z.string().max(READER_BOUNDS.replyChars).nullable()
}).strict();

const REPLY_KEYS: ReadonlySet<string> = new Set(Object.keys(replySchema.shape));

/**
 * A BCP-47-shaped code: a primary language and up to three subtags. Pre-flight PF-L14: the spec allows "sr-Latn",
 * "pt-BR", "zh-Hans"; the lock keeps only the primary (Task 1: questionLanguageOf takes a primary tag) and re-derives a
 * script subtag from the question's own letters.
 */
const LANGUAGE_CODE = /^([A-Za-z]{2,3})(?:-[A-Za-z0-9]{1,8}){0,3}$/u;

const down = (reason: Extract<FastCheckReading, { kind: "DOWN" }>["reason"]): FastCheckReading => Object.freeze({ kind: "DOWN", reason });

function jsonOf(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return JSON.parse(fenced === null ? trimmed : fenced[1]!);
}

function languageOf(code: string, questionLine: string): QuestionLanguage | null {
  const parts = LANGUAGE_CODE.exec(code.trim());
  return parts === null ? null : questionLanguageOf(parts[1]!, questionLine);
}

/** For "unchanged": the same words, whatever the spacing or the Unicode composition. */
const sameText = (left: string, right: string): boolean =>
  left.normalize("NFC").replace(/\s+/gu, " ").trim() === right.normalize("NFC").replace(/\s+/gu, " ").trim();

function rewriteRefusalOf(proposed: string, main: QuestionLanguage, questionLine: string): FastCheckRewriteRefusal | null {
  if (proposed === "") return "REWRITE_UNUSABLE:BLANK";
  if (Buffer.byteLength(proposed, "utf8") > askQuestionMaxBytes()) return "REWRITE_UNUSABLE:TOO_LONG";
  if (sameText(proposed, questionLine)) return "REWRITE_UNUSABLE:UNCHANGED";
  if (replyTextLanguageVerdict(lockedReplyLanguageExpectation(main, questionLine), proposed) === "OTHER") return "REWRITE_UNUSABLE:OTHER_LANGUAGE";
  return null;
}

function strictReading(text: string, questionLine: string): FastCheckReading {
  if (text.length > READER_BOUNDS.replyChars) return down("UNREADABLE");
  let decoded: unknown;
  try {
    decoded = jsonOf(text);
  } catch {
    return down("UNREADABLE");
  }
  // zod's strict object does not see an own "__proto__" key (JSON.parse makes one); the keys are checked by name too.
  if (typeof decoded !== "object" || decoded === null || Object.keys(decoded).some((key) => !REPLY_KEYS.has(key))) {
    return down("UNREADABLE");
  }
  const result = replySchema.safeParse(decoded);
  if (!result.success) return down("UNREADABLE");
  const parsed = result.data;
  if (parsed.is_real_mix !== (parsed.proposed_question !== null)) return down("UNREADABLE");
  const main = languageOf(parsed.main_language, questionLine);
  if (main === null) return down("UNKNOWN_LANGUAGE");
  if (!parsed.is_real_mix) return Object.freeze({ kind: "ONE", main });

  // A real mix: each known language once, in the model's order; an unknown code is dropped. The mix must name its
  // main language and at least one other, or the reply contradicts itself.
  const seen: QuestionLanguage[] = [];
  for (const code of parsed.languages_seen) {
    const language = languageOf(code, questionLine);
    if (language !== null && !seen.some((earlier) => earlier.code === language.code)) seen.push(language);
  }
  if (!seen.some((language) => language.code === main.code) || seen.length < 2) return down("UNREADABLE");

  // The rewrite (ruling L-REWRITE): bounded by the ask's own limit, and discarded when it is blank, the question
  // unchanged, or clearly in another language than the one it claims. Only the rewrite goes; the reading stays.
  const proposed = parsed.proposed_question!.trim();
  const refusal = rewriteRefusalOf(proposed, main, questionLine);
  if (refusal !== null) return Object.freeze({ kind: "MIX", main, seen: Object.freeze(seen), proposed: null, rewriteRefusal: refusal });
  return Object.freeze({ kind: "MIX", main, seen: Object.freeze(seen), proposed });
}

/** A strict reading. Anything off-form is DOWN with a code; the caller then falls back. Never throws. */
export function readQuestionLanguageReply(text: string, questionLine: string): FastCheckReading {
  try {
    return strictReading(text, questionLine);
  } catch {
    return down("UNREADABLE");
  }
}

export type FastCheckTransport = (input: Readonly<{ packet: PromptPacket; signal: AbortSignal }>) => Promise<string>;
/** `timeoutMs`: the row's time limit this check applies itself; the decider bounds the call again just past it. */
export type FastCheck = Readonly<{ contractHash: string; timeoutMs: number; read(questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> }>;

/**
 * The time limit holds for ANY transport (pre-flight PF-L15): the call is raced against the signal's abort, so a
 * transport that ignores the signal still ends in TIMEOUT on time. Every failure (framing, transport, reply) is a
 * DOWN reading, never a throw; the instruction is checked once, here, at boot.
 */
export function createFastCheck(deps: Readonly<{ transport: FastCheckTransport; instruction: string; timeoutMs: number }>): FastCheck {
  if (!Number.isFinite(deps.timeoutMs) || deps.timeoutMs <= 0) {
    throw new TypedDomainError("QUESTION_LANGUAGE_FAST_CHECK_TIMEOUT_INVALID", "QUESTION_LANGUAGE_FAST_CHECK_TIMEOUT_INVALID");
  }
  assertQuestionLanguageInstructionFrameable(deps.instruction);
  const contractHash = questionLanguageCheckContractHash(deps.instruction);
  return Object.freeze({
    contractHash,
    timeoutMs: deps.timeoutMs,
    async read(questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> {
      const controller = new AbortController();
      const { signal } = controller;
      const timer = setTimeout(() => controller.abort(new DOMException("The fast language check timed out", "TimeoutError")), deps.timeoutMs);
      const abandoned = new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      try {
        const packet = framedQuestionLanguageCheck(deps.instruction, questionLine, site);
        const text = await Promise.race([deps.transport({ packet, signal }), abandoned]);
        return typeof text === "string" ? readQuestionLanguageReply(text, questionLine) : down("UNREADABLE");
      } catch (error) {
        if (signal.aborted) return down("TIMEOUT");
        const code = error instanceof TypedDomainError ? error.code : null;
        return code === QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES.dayPot ? down("SKIPPED_DAY_POT")
          : code === QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES.spendRecordDown ? down("SPEND_RECORD_DOWN") : down("TRANSPORT");
      } finally {
        clearTimeout(timer);
      }
    }
  });
}
