import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";

/**
 * The check reference (question-language spec 2026-10-13, "The server decides"; plan decision D2). It is a stateless
 * signed token. It binds the person, the question, the server's own rewrite and the checked language. It never
 * carries a language or text the page could choose. Ruling CR-5: the API's key is derived from its existing
 * blind-index key, so every API process of one deployment shares it and a restart keeps references valid.
 */
export type QuestionLanguageReferenceKey = Readonly<{ bytes: Buffer }>;
export type QuestionLanguageChoice = Readonly<{ check_ref: string; choice: "USE_REWRITE" | "KEEP_MINE"; original_question_line?: string }>;
export type VerifiedChoice = Readonly<{ main: string; site: string; rewriteAccepted: boolean; originalQuestionLine: string | null }>;

type Payload = Readonly<{ v: 1; o: string; s: string; q: string; p: string; m: string; e: number }>;

const sha = (text: string): string => createHash("sha256").update(text.trim(), "utf8").digest("hex");
const ownerOf = (scope: string): string => sha(`question-language-owner:${scope}`).slice(0, 32);
const lifetimeMs = (): number => 15 * 60_000;
const refuse = (code: "QUESTION_LANGUAGE_CHECK_INVALID" | "QUESTION_LANGUAGE_CHECK_EXPIRED" | "QUESTION_LANGUAGE_CHOICE_MISMATCH"): never => {
  throw new TypedDomainError(code, code);
};
const mac = (key: QuestionLanguageReferenceKey, payloadPart: string): Buffer =>
  createHmac("sha256", key.bytes).update(`debateai:question-language-ref:v1\0${payloadPart}`, "utf8").digest();

/**
 * CR-5: HKDF-SHA-256 over a server secret the API already loads (the blind-index key, as SocialAuthService derives its
 * flow key), with this purpose's own salt and label, so the root is never itself the HMAC key and no other purpose's
 * key equals this one.
 */
export function questionLanguageReferenceKeyFrom(root: Uint8Array): QuestionLanguageReferenceKey {
  if (root.byteLength < 32) throw new TypedDomainError("QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID", "QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID");
  return Object.freeze({ bytes: Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:question-language:v1"),
    Buffer.from("question-language-check-v1"), 32)) });
}

/** A per-process key: the practice tool (one process) and tests only. */
export function newQuestionLanguageReferenceKey(): QuestionLanguageReferenceKey {
  return Object.freeze({ bytes: randomBytes(32) });
}

export function signQuestionLanguageReference(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; site: string; questionLine: string; proposed: string; main: string; now: Date;
}>): string {
  const payload: Payload = { v: 1, o: ownerOf(input.ownerScope), s: input.site, q: sha(input.questionLine), p: sha(input.proposed),
    m: input.main, e: input.now.getTime() + lifetimeMs() };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadPart}.${mac(key, payloadPart).toString("base64url")}`;
}

function payloadOf(key: QuestionLanguageReferenceKey, ref: unknown): Payload {
  if (typeof ref !== "string") return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  const parts = ref.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  const given = Buffer.from(parts[1]!, "base64url");
  const wanted = mac(key, parts[0]!);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  try {
    const value = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")) as Payload;
    if (value.v !== 1 || typeof value.o !== "string" || typeof value.s !== "string" || typeof value.q !== "string"
      || typeof value.p !== "string" || typeof value.m !== "string" || typeof value.e !== "number") {
      return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
    }
    return value;
  } catch {
    return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  }
}

export function verifyQuestionLanguageChoice(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; questionLine: string; choice: QuestionLanguageChoice; now: Date;
}>): VerifiedChoice {
  const payload = payloadOf(key, input.choice.check_ref);
  if (payload.o !== ownerOf(input.ownerScope)) return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  if (input.now.getTime() > payload.e) return refuse("QUESTION_LANGUAGE_CHECK_EXPIRED");
  if (input.choice.choice === "KEEP_MINE") {
    if (sha(input.questionLine) !== payload.q) return refuse("QUESTION_LANGUAGE_CHOICE_MISMATCH");
    return Object.freeze({ main: payload.m, site: payload.s, rewriteAccepted: false, originalQuestionLine: null });
  }
  const original = input.choice.original_question_line;
  if (typeof original !== "string" || sha(original) !== payload.q || sha(input.questionLine) !== payload.p) {
    return refuse("QUESTION_LANGUAGE_CHOICE_MISMATCH");
  }
  return Object.freeze({ main: payload.m, site: payload.s, rewriteAccepted: true, originalQuestionLine: original.trim() });
}
