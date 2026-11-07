import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import {
  START_PATHS_INVALID, START_PATHS_STALE, startListNosOfMenu, type SignedStartList, type SignedStartMenu,
  type StartCombineMember, type StartList, type StartMenu, type StartMergeRequest
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { DebateShapePlanKey } from "@debateai/register";
import type { QuestionLanguageLock } from "../question-language/decider.js";

/**
 * V4 start step, Task 26 (spec 2026-11-03 §4.1 "What is kept, and for how long"; plan Review Focus 1): THE SIGNED
 * REFERENCES. Before Start the lists, the menu, the check at Next and an AI-combined question live on the person's page,
 * not in browser storage and not on the server, signed so they cannot be altered. Each is a stateless token,
 * `base64url(payload).base64url(HMAC-SHA256(key, "debateai:start-step-ref:v1\0" + payload part))`, as the
 * question-language check reference (reference.ts) is.
 *
 * The payload binds the person (a hash of the owner scope), the question line checked at Next (its hash, trimmed), the
 * plan and the settings version, and a hash of what it signs (`h`). It never carries words: the page reads it and holds
 * the words beside it. The check also carries the language lock, less its original line, and a hash of that original
 * (`r`, null when there was no rewrite), and (Task 57d) its reading's try (`y`, last; none in a check signed without one).
 * A combined question binds its context (the menu or the dig), its members' hash and its own title and question, and no
 * question, plan or version.
 *
 * Task 26b: no reference has a lifetime, and none carries an expiry (one Task 26 wrote is ignored). The owner's answer
 * Q8 of 4 Nov ("Your rule, no time limit"): suggestions never go out of date by time, and a site update keeps the paths,
 * so the settings version is compared only when the caller gives one. read-d2 and choose-d2: the person may change the
 * question on step 2 and nothing is read again, so the question is compared only when the caller gives one; the refs
 * still carry both, and startRefQuestionOf and startRefVersionOf tell one reading from another.
 *
 * Refusals, each a TypedDomainError whose message is its code: a reference that does not parse, carries a wrong
 * signature, is of another kind, signs other content or another person is START_PATHS_INVALID; one whose plan moved, or
 * whose question, version or original line moved where it is compared, is START_PATHS_STALE. Signatures are compared in
 * constant time.
 */
export type StartStepKey = Readonly<{ bytes: Buffer }>;
/** What every list, menu and check is SIGNED with (a combined question binds the owner only). */
export type StartRefBinding = Readonly<{ ownerScope: string; questionLine: string; planKey: DebateShapePlanKey; settingsVersion: number }>;
/**
 * What is COMPARED when a list, menu or check is verified. `questionLine` null: the question is not compared (it changed
 * on step 2, read-d2). `settingsVersion` null: the version is not compared (the site was updated since Next, answer Q8).
 * The owner, the kind, the content and the signature are always checked, and the plan is always compared.
 */
export type StartRefCheck = Readonly<{ ownerScope: string; questionLine: string | null; planKey: DebateShapePlanKey; settingsVersion: number | null }>;
/** Where a combined question was asked: on the menu before Start, or over a dig's picks. */
export type StartCombineContext = Readonly<{ kind: "MENU"; menuId: string } | { kind: "DIG"; parentRunId: string }>;

type Kind = "CHECK" | "LIST" | "MENU" | "COMBINE";
type LockWithoutOriginal = Omit<QuestionLanguageLock, "originalQuestionLine">;
type BoundPayload = Readonly<{ v: 1; t: "CHECK" | "LIST" | "MENU"; o: string; q: string; p: string; s: number; h: string }>;
type CheckPayload = BoundPayload & Readonly<{ l: LockWithoutOriginal; r: string | null; y?: string }>;
type CombinePayload = Readonly<{ v: 1; t: "COMBINE"; o: string; c: string; m: string; h: string }>;
type Payload = BoundPayload | CheckPayload | CombinePayload;

type RefusalCode = typeof START_PATHS_INVALID | typeof START_PATHS_STALE;
const refuse = (code: RefusalCode): never => {
  throw new TypedDomainError(code, code);
};
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const ownerOf = (scope: string): string => sha(`start-step-owner:${scope}`).slice(0, 32);
const questionOf = (line: string): string => sha(line.trim());
const mac = (key: StartStepKey, payloadPart: string): Buffer =>
  createHmac("sha256", key.bytes).update(`debateai:start-step-ref:v1\0${payloadPart}`, "utf8").digest();

/**
 * HKDF-SHA-256 over a server secret the API already loads (the blind-index key, as the question-language key is), with
 * this purpose's own salt and label, so the root is never itself the HMAC key and no other purpose's key equals this one.
 */
export function startStepKeyFrom(root: Uint8Array): StartStepKey {
  if (root.byteLength < 32) throw new TypedDomainError("START_STEP_KEY_ROOT_INVALID", "START_STEP_KEY_ROOT_INVALID");
  return Object.freeze({ bytes: Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:start-step:v1"), Buffer.from("start-step-ref-v1"), 32)) });
}

/** A per-process key: the practice tool (one process) and tests only. */
export function newStartStepKey(): StartStepKey {
  return Object.freeze({ bytes: randomBytes(32) });
}

/**
 * JSON with every object's keys sorted (UTF-16 code unit order) at every depth, arrays in order, no spaces; members
 * that are undefined are left out, as JSON.stringify leaves them. Plain data only: anything else is a TypeError.
 */
export function startCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("START_CANONICAL_JSON_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : startCanonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).filter((name) => record[name] !== undefined).sort();
    return `{${keys.map((name) => `${JSON.stringify(name)}:${startCanonicalJson(record[name])}`).join(",")}}`;
  }
  throw new TypeError("START_CANONICAL_JSON_INVALID");
}

const contentHash = (value: unknown): string => sha(startCanonicalJson(value));

/** The members of a combined question, as one hash whatever their order: sorted by (viewpoint id, pick number, question). */
export function startMembersHash(members: readonly StartCombineMember[]): string {
  const sorted = [...members].sort((a, b) => compare(a.viewpoint_id ?? "", b.viewpoint_id ?? "")
    || (a.pick_no ?? 0) - (b.pick_no ?? 0) || compare(a.question, b.question));
  return contentHash(sorted.map((member) => ({ viewpoint_id: member.viewpoint_id, pick_no: member.pick_no, title: member.title, question: member.question })));
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function seal(key: StartStepKey, payload: Payload): string {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadPart}.${mac(key, payloadPart).toString("base64url")}`;
}

function bound(t: BoundPayload["t"], b: StartRefBinding, h: string): BoundPayload {
  return { v: 1, t, o: ownerOf(b.ownerScope), q: questionOf(b.questionLine), p: b.planKey, s: b.settingsVersion, h };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
/** A try's shape: 64 lower-case hex characters (0164's). */
const isTry = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The payload of a well-formed reference this key signed, of whatever kind, or null; never throws. */
function payloadOf(key: StartStepKey, ref: unknown): Payload | null {
  if (typeof ref !== "string") return null;
  const parts = ref.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return null;
  const given = Buffer.from(parts[1]!, "base64url");
  const wanted = mac(key, parts[0]!);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // Task 26b: no `e` is required; one a Task 26 reference carries is ignored.
  if (!isRecord(value) || value.v !== 1 || !isText(value.o) || !isText(value.h)) return null;
  if (value.t === "COMBINE") return isText(value.c) && isText(value.m) ? value as Payload : null;
  if (value.t !== "CHECK" && value.t !== "LIST" && value.t !== "MENU") return null;
  if (!isText(value.q) || !isText(value.p) || !isWhole(value.s)) return null;
  if (value.t === "CHECK" && (!isRecord(value.l) || !(value.r === null || isText(value.r)) || !(value.y === undefined || isTry(value.y)))) return null;
  return value as Payload;
}

/** The payload of a reference of `kind` this key signed, or START_PATHS_INVALID. */
function opened(key: StartStepKey, ref: unknown, kind: Kind): Payload {
  const payload = payloadOf(key, ref);
  return payload !== null && payload.t === kind ? payload : refuse(START_PATHS_INVALID);
}

/**
 * The checks of a list, menu or check, in order: content and owner (INVALID), then the plan, and the question and the
 * version where they are compared (STALE). Nothing expires.
 */
function assertBound(payload: BoundPayload, h: string, c: StartRefCheck): void {
  if (payload.h !== h || payload.o !== ownerOf(c.ownerScope)) refuse(START_PATHS_INVALID);
  if (payload.p !== c.planKey) refuse(START_PATHS_STALE);
  if (c.questionLine !== null && payload.q !== questionOf(c.questionLine)) refuse(START_PATHS_STALE);
  if (c.settingsVersion !== null && payload.s !== c.settingsVersion) refuse(START_PATHS_STALE);
}

/**
 * The check at Next: the language lock the lists were written under, bound to the line checked and (after a rewrite) its original.
 * Task 57d: `tryRef`, the reading's try (newStartTryRef), rides inside it as its last member, so every later call of the reading and its
 * Start name the same try; one of any other shape is never signed (a TypeError, START_TRY_REF_INVALID).
 */
export function signStartCheck(key: StartStepKey, b: StartRefBinding & Readonly<{
  lock: QuestionLanguageLock; originalQuestionLine: string | null; tryRef?: string;
}>): string {
  if (b.tryRef !== undefined && !isTry(b.tryRef)) throw new TypeError("START_TRY_REF_INVALID");
  const { originalQuestionLine: _original, ...lock } = b.lock;
  void _original;
  const payload: CheckPayload = { ...bound("CHECK", b, contentHash(lock)), l: lock,
    r: b.originalQuestionLine === null ? null : questionOf(b.originalQuestionLine), ...(b.tryRef === undefined ? {} : { y: b.tryRef }) };
  return seal(key, payload);
}

/**
 * The lock signed at Next. `originalQuestionLine`: the ask's original line (a string), none (null), or undefined to skip
 * the original's check (a merge, a combine or a fit carries no original); the lock then names no original. A given
 * original must be the one signed (null for none), else START_PATHS_STALE, whether or not the question is compared.
 */
export function verifyStartCheck(key: StartStepKey, b: StartRefCheck & Readonly<{
  ref: string; originalQuestionLine: string | null | undefined;
}>): QuestionLanguageLock {
  const payload = opened(key, b.ref, "CHECK") as CheckPayload;
  assertBound(payload, contentHash(payload.l), b);
  const original = b.originalQuestionLine;
  if (original !== undefined && (original === null ? null : questionOf(original)) !== payload.r) return refuse(START_PATHS_STALE);
  return Object.freeze({ ...payload.l, originalQuestionLine: original === undefined || original === null ? null : original.trim() });
}

export function signStartList(key: StartStepKey, b: StartRefBinding & Readonly<{ list: StartList }>): string {
  return seal(key, bound("LIST", b, contentHash(b.list)));
}

export function verifyStartList(key: StartStepKey, b: StartRefCheck & Readonly<{ signed: SignedStartList }>): StartList {
  assertBound(opened(key, b.signed.ref, "LIST") as BoundPayload, contentHash(b.signed.list), b);
  return b.signed.list;
}

export function signStartMenu(key: StartStepKey, b: StartRefBinding & Readonly<{ menu: StartMenu }>): string {
  return seal(key, bound("MENU", b, contentHash(b.menu)));
}

export function verifyStartMenu(key: StartStepKey, b: StartRefCheck & Readonly<{ signed: SignedStartMenu }>): StartMenu {
  assertBound(opened(key, b.signed.ref, "MENU") as BoundPayload, contentHash(b.signed.menu), b);
  return b.signed.menu;
}

/**
 * The question hash (`q`, sha256 of the trimmed line) a well-formed check, list or menu reference this key signed
 * carries: equal for every reference of one reading. Null for a combined question's reference, a tampered one or any
 * other string; never throws.
 */
export function startRefQuestionOf(key: StartStepKey, ref: string): string | null {
  const payload = payloadOf(key, ref);
  return payload === null || payload.t === "COMBINE" ? null : payload.q;
}

/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §5): the question hash (`q`) a check, list or menu reference carries for
 * `line` (sha256 of the trimmed line), so a saved reading's line is shown to be the one its references were signed for.
 */
export function startQuestionHashOf(line: string): string {
  return questionOf(line);
}

/** The settings version (`s`) such a reference was signed under; null for any other string, as startRefQuestionOf. */
export function startRefVersionOf(key: StartStepKey, ref: string): number | null {
  const payload = payloadOf(key, ref);
  return payload === null || payload.t === "COMBINE" ? null : payload.s;
}

/*
 * V4 start step, Task 57c (the owner's 5 Nov answer Q20 A and its follow-up: a failed question gives back its path-list charge): THE TRY a
 * call before Start is charged to, so Start can give the try's charges to its debate and 0164 gives them back if it fails. Task 57d (the
 * owner's 6 Nov answer, card "Privacy": "Random id"): one reading's try is a random id, minted once when the reading's planner starts (the
 * same words from the same person within the ten minutes share that planner, so they are the same reading and share its try), carried
 * inside the signed check, and read back from it by the merge, a combine on its menu, the fit and Start. Nothing made from the question's
 * words is ever a try, so 0164 stores no fingerprint of a question. A combine over a dig's picks is charged to the dig's parent instead.
 * 64 lower-case hex characters (0164's shape).
 */
const tryOf = (key: StartStepKey, part: string): string =>
  createHmac("sha256", key.bytes).update(`debateai:start-step-try:v1\0${part}`, "utf8").digest("hex");

/** A new reading's try: 32 random bytes, never made from anything the person wrote. */
export function newStartTryRef(): string {
  return randomBytes(32).toString("hex");
}

/** The try a check this key signed for this person carries; null for a check that names none, another person's, or any other string. */
export function startTryRefOfCheck(key: StartStepKey, ownerScope: string, ref: string): string | null {
  const payload = payloadOf(key, ref);
  if (payload === null || payload.t !== "CHECK" || payload.o !== ownerOf(ownerScope)) return null;
  return (payload as CheckPayload).y ?? null;
}

/** The try a combine over a dig's picks is charged to: the person's dig of that parent debate. */
export function startDigTryRefOf(key: StartStepKey, input: Readonly<{ ownerScope: string; parentRunId: string }>): string {
  return tryOf(key, `${ownerOf(input.ownerScope)}\0dig:${input.parentRunId}`);
}

const combineWords = (title: string, question: string): string => sha(`${title}\0${question}`);

/** A combined question, bound to its context, its members and its own words (Task 33 reads it as AI_COMBINED). */
export function signStartCombine(key: StartStepKey, b: Readonly<{
  ownerScope: string; context: StartCombineContext; membersHash: string; title: string; question: string;
}>): string {
  const payload: CombinePayload = { v: 1, t: "COMBINE", o: ownerOf(b.ownerScope), c: startCanonicalJson(b.context), m: b.membersHash,
    h: combineWords(b.title, b.question) };
  return seal(key, payload);
}

export function verifyStartCombine(key: StartStepKey, b: Readonly<{
  ownerScope: string; context: StartCombineContext; membersHash: string; title: string; question: string; ref: string;
}>): void {
  const payload = opened(key, b.ref, "COMBINE") as CombinePayload;
  if (payload.c !== startCanonicalJson(b.context) || payload.m !== b.membersHash || payload.h !== combineWords(b.title, b.question)) {
    refuse(START_PATHS_INVALID);
  }
  if (payload.o !== ownerOf(b.ownerScope)) refuse(START_PATHS_INVALID);
}

/**
 * A merge's request: its check (no original: the merge carries none), every list, and the menu so far. Every pre-Start
 * call sends the line read at Next, so the question is compared; the settings version is not compared with the active
 * one (answer Q8), but every list and the prior menu must carry the check's (one reading), else START_PATHS_STALE.
 * `readingVersion` is the check's version, which the merge signs its menu with. A list number sent twice, or a late list
 * the prior menu already holds, is START_PATHS_INVALID.
 */
export function verifyStartMergeRequest(key: StartStepKey, input: Readonly<{
  ownerScope: string; questionLine: string; planKey: DebateShapePlanKey; request: StartMergeRequest;
}>): Readonly<{ lock: QuestionLanguageLock; lists: readonly StartList[]; prior: StartMenu | null; readingVersion: number }> {
  const check: StartRefCheck = { ownerScope: input.ownerScope, questionLine: input.questionLine, planKey: input.planKey, settingsVersion: null };
  const lock = verifyStartCheck(key, { ...check, ref: input.request.check_ref, originalQuestionLine: undefined });
  const lists = input.request.lists.map((signed) => verifyStartList(key, { ...check, signed }));
  const prior = input.request.prior_menu === undefined ? null : verifyStartMenu(key, { ...check, signed: input.request.prior_menu });
  const readingVersion = startRefVersionOf(key, input.request.check_ref) ?? refuse(START_PATHS_INVALID);
  const refs = [...input.request.lists.map((signed) => signed.ref), ...(input.request.prior_menu === undefined ? [] : [input.request.prior_menu.ref])];
  if (refs.some((ref) => startRefVersionOf(key, ref) !== readingVersion)) refuse(START_PATHS_STALE);
  const numbers = lists.map((list) => list.list_no);
  if (new Set(numbers).size !== numbers.length) refuse(START_PATHS_INVALID);
  if (prior !== null) {
    const held = new Set(startListNosOfMenu(prior));
    if (numbers.some((no) => held.has(no))) refuse(START_PATHS_INVALID);
  }
  return Object.freeze({ lock, lists: Object.freeze(lists), prior, readingVersion });
}
