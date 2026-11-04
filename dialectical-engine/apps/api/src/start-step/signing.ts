import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import {
  START_PATHS_EXPIRED, START_PATHS_INVALID, START_PATHS_STALE, startListNosOfMenu, type SignedStartList, type SignedStartMenu,
  type StartCombineMember, type StartList, type StartMenu, type StartMergeRequest
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { START_STEP_TIMING } from "@debateai/map";
import type { DebateShapePlanKey } from "@debateai/register";
import type { QuestionLanguageLock } from "../question-language/decider.js";

/**
 * V4 start step, Task 26 (spec 2026-11-03 §4.1 "What is kept, and for how long"; plan Review Focus 1): THE SIGNED
 * REFERENCES. Before Start the lists, the menu, the check at Next and an AI-combined question live on the person's page,
 * not in browser storage and not on the server, signed so they cannot be altered, for two hours
 * (START_STEP_TIMING.signedLifetimeMs). Each is a stateless token, `base64url(payload).base64url(HMAC-SHA256(key,
 * "debateai:start-step-ref:v1\0" + payload part))`, as the question-language check reference (reference.ts) is.
 *
 * The payload binds the person (a hash of the owner scope), the question line checked at Next (its hash, trimmed), the
 * plan and the settings version, the expiry, and a hash of what it signs (`h`). It never carries words: the page reads it
 * and holds the words beside it. The check also carries the language lock, less its original line, and a hash of that
 * original (`r`, null when there was no rewrite). A combined question binds its context (the menu or the dig), its
 * members' hash and its own title and question, and no question, plan or version: it can be reused across a page's
 * "Read it again".
 *
 * Refusals, each a TypedDomainError whose message is its code: a reference that does not parse, carries a wrong
 * signature, is of another kind, signs other content or another person is START_PATHS_INVALID; one past its two hours is
 * START_PATHS_EXPIRED; one whose question, plan, version or original line moved is START_PATHS_STALE (the page offers
 * "Read it again"). Signatures are compared in constant time.
 */
export type StartStepKey = Readonly<{ bytes: Buffer }>;
/** What every list, menu and check is bound to (a combined question binds the owner only). */
export type StartRefBinding = Readonly<{ ownerScope: string; questionLine: string; planKey: DebateShapePlanKey; settingsVersion: number }>;
/** Where a combined question was asked: on the menu before Start, or over a dig's picks. */
export type StartCombineContext = Readonly<{ kind: "MENU"; menuId: string } | { kind: "DIG"; parentRunId: string }>;

type Kind = "CHECK" | "LIST" | "MENU" | "COMBINE";
type LockWithoutOriginal = Omit<QuestionLanguageLock, "originalQuestionLine">;
type BoundPayload = Readonly<{ v: 1; t: "CHECK" | "LIST" | "MENU"; o: string; q: string; p: string; s: number; e: number; h: string }>;
type CheckPayload = BoundPayload & Readonly<{ l: LockWithoutOriginal; r: string | null }>;
type CombinePayload = Readonly<{ v: 1; t: "COMBINE"; o: string; c: string; m: string; h: string; e: number }>;
type Payload = BoundPayload | CheckPayload | CombinePayload;

type RefusalCode = typeof START_PATHS_INVALID | typeof START_PATHS_EXPIRED | typeof START_PATHS_STALE;
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

function bound(t: BoundPayload["t"], b: StartRefBinding & Readonly<{ now: Date }>, h: string): BoundPayload {
  return { v: 1, t, o: ownerOf(b.ownerScope), q: questionOf(b.questionLine), p: b.planKey, s: b.settingsVersion,
    e: b.now.getTime() + START_STEP_TIMING.signedLifetimeMs, h };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/** The payload of a reference of `kind` this key signed, or START_PATHS_INVALID. */
function opened(key: StartStepKey, ref: unknown, kind: Kind): Payload {
  if (typeof ref !== "string") return refuse(START_PATHS_INVALID);
  const parts = ref.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return refuse(START_PATHS_INVALID);
  const given = Buffer.from(parts[1]!, "base64url");
  const wanted = mac(key, parts[0]!);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return refuse(START_PATHS_INVALID);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
  } catch {
    return refuse(START_PATHS_INVALID);
  }
  if (!isRecord(value) || value.v !== 1 || value.t !== kind || !isText(value.o) || !isText(value.h) || !isWhole(value.e)) {
    return refuse(START_PATHS_INVALID);
  }
  if (kind === "COMBINE") {
    if (!isText(value.c) || !isText(value.m)) return refuse(START_PATHS_INVALID);
  } else if (!isText(value.q) || !isText(value.p) || !isWhole(value.s)) {
    return refuse(START_PATHS_INVALID);
  } else if (kind === "CHECK" && (!isRecord(value.l) || !(value.r === null || isText(value.r)))) {
    return refuse(START_PATHS_INVALID);
  }
  return value as Payload;
}

/** The checks of a list, menu or check, in order: content and owner (INVALID), the time (EXPIRED), then question, plan and version (STALE). */
function assertBound(payload: BoundPayload, h: string, b: StartRefBinding & Readonly<{ now: Date }>): void {
  if (payload.h !== h || payload.o !== ownerOf(b.ownerScope)) refuse(START_PATHS_INVALID);
  if (b.now.getTime() > payload.e) refuse(START_PATHS_EXPIRED);
  if (payload.q !== questionOf(b.questionLine) || payload.p !== b.planKey || payload.s !== b.settingsVersion) refuse(START_PATHS_STALE);
}

/** The check at Next: the language lock the lists were written under, bound to the line checked and (after a rewrite) its original. */
export function signStartCheck(key: StartStepKey, b: StartRefBinding & Readonly<{
  lock: QuestionLanguageLock; originalQuestionLine: string | null; now: Date;
}>): string {
  const { originalQuestionLine: _original, ...lock } = b.lock;
  void _original;
  const payload: CheckPayload = { ...bound("CHECK", b, contentHash(lock)), l: lock,
    r: b.originalQuestionLine === null ? null : questionOf(b.originalQuestionLine) };
  return seal(key, payload);
}

/**
 * The lock signed at Next. `originalQuestionLine`: the ask's original line (a string), none (null), or undefined to skip
 * the original's check (a merge, a combine or a fit carries no original); the lock then names no original. A given
 * original must be the one signed (null for none), else START_PATHS_STALE.
 */
export function verifyStartCheck(key: StartStepKey, b: StartRefBinding & Readonly<{
  ref: string; originalQuestionLine: string | null | undefined; now: Date;
}>): QuestionLanguageLock {
  const payload = opened(key, b.ref, "CHECK") as CheckPayload;
  assertBound(payload, contentHash(payload.l), b);
  const original = b.originalQuestionLine;
  if (original !== undefined && (original === null ? null : questionOf(original)) !== payload.r) return refuse(START_PATHS_STALE);
  return Object.freeze({ ...payload.l, originalQuestionLine: original === undefined || original === null ? null : original.trim() });
}

export function signStartList(key: StartStepKey, b: StartRefBinding & Readonly<{ list: StartList; now: Date }>): string {
  return seal(key, bound("LIST", b, contentHash(b.list)));
}

export function verifyStartList(key: StartStepKey, b: StartRefBinding & Readonly<{ signed: SignedStartList; now: Date }>): StartList {
  assertBound(opened(key, b.signed.ref, "LIST") as BoundPayload, contentHash(b.signed.list), b);
  return b.signed.list;
}

export function signStartMenu(key: StartStepKey, b: StartRefBinding & Readonly<{ menu: StartMenu; now: Date }>): string {
  return seal(key, bound("MENU", b, contentHash(b.menu)));
}

export function verifyStartMenu(key: StartStepKey, b: StartRefBinding & Readonly<{ signed: SignedStartMenu; now: Date }>): StartMenu {
  assertBound(opened(key, b.signed.ref, "MENU") as BoundPayload, contentHash(b.signed.menu), b);
  return b.signed.menu;
}

const combineWords = (title: string, question: string): string => sha(`${title}\0${question}`);

/** A combined question, bound to its context, its members and its own words (Task 33 reads it as AI_COMBINED). */
export function signStartCombine(key: StartStepKey, b: Readonly<{
  ownerScope: string; context: StartCombineContext; membersHash: string; title: string; question: string; now: Date;
}>): string {
  const payload: CombinePayload = { v: 1, t: "COMBINE", o: ownerOf(b.ownerScope), c: startCanonicalJson(b.context), m: b.membersHash,
    h: combineWords(b.title, b.question), e: b.now.getTime() + START_STEP_TIMING.signedLifetimeMs };
  return seal(key, payload);
}

export function verifyStartCombine(key: StartStepKey, b: Readonly<{
  ownerScope: string; context: StartCombineContext; membersHash: string; title: string; question: string; ref: string; now: Date;
}>): void {
  const payload = opened(key, b.ref, "COMBINE") as CombinePayload;
  if (payload.c !== startCanonicalJson(b.context) || payload.m !== b.membersHash || payload.h !== combineWords(b.title, b.question)) {
    refuse(START_PATHS_INVALID);
  }
  if (payload.o !== ownerOf(b.ownerScope)) refuse(START_PATHS_INVALID);
  if (b.now.getTime() > payload.e) refuse(START_PATHS_EXPIRED);
}

/**
 * A merge's request: its check (no original: the merge carries none), every list, and the menu so far. A list number
 * sent twice, or a late list the prior menu already holds, is START_PATHS_INVALID.
 */
export function verifyStartMergeRequest(key: StartStepKey, input: StartRefBinding & Readonly<{ request: StartMergeRequest; now: Date }>): Readonly<{
  lock: QuestionLanguageLock; lists: readonly StartList[]; prior: StartMenu | null;
}> {
  const binding = { ownerScope: input.ownerScope, questionLine: input.questionLine, planKey: input.planKey, settingsVersion: input.settingsVersion, now: input.now };
  const lock = verifyStartCheck(key, { ...binding, ref: input.request.check_ref, originalQuestionLine: undefined });
  const lists = input.request.lists.map((signed) => verifyStartList(key, { ...binding, signed }));
  const numbers = lists.map((list) => list.list_no);
  if (new Set(numbers).size !== numbers.length) refuse(START_PATHS_INVALID);
  const prior = input.request.prior_menu === undefined ? null : verifyStartMenu(key, { ...binding, signed: input.request.prior_menu });
  if (prior !== null) {
    const held = new Set(startListNosOfMenu(prior));
    if (numbers.some((no) => held.has(no))) refuse(START_PATHS_INVALID);
  }
  return Object.freeze({ lock, lists: Object.freeze(lists), prior });
}
