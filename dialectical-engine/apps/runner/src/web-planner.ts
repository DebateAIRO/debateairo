import { TypedDomainError, withQuestionLanguageField, type QuestionLanguage } from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  rememberingAcceptedReply,
  schemaFailureLocator,
  ProviderContentUnacceptedError,
  type CallBound,
  type ContentClassification,
  type FramedPrompt,
  type ModelReplyFacts,
  type ProviderGateway
} from "@debateai/providers";
import {
  WEB_PLAN_CALL_SITE_KEY,
  WEB_PLANNER_V2_PROMPT_CONTRACT,
  WEB_REPLY_SEARCHES_INVALID,
  classifyStructuredArtifact,
  parseStructuredArtifact,
  webPlannerV2MaterialFields,
  webPlannerV2ReplyIssues,
  webPlannerV2ReplySchema,
  type WebMode,
  type WebPlannerPoint,
  type WebPlannerV2Reply,
  type WebReplyIssue
} from "@debateai/judgement";
import {
  freezeWebQuerySet,
  localSearchTarget,
  type FrozenWebQuerySet,
  type PlannedWebPath,
  type PlannedWebSearch,
  type WebPace
} from "@debateai/evidence";
import type { PlanId } from "@debateai/register";

/**
 * THE WEB PLANNER (web search plan 2026-10-30, task W2-3; design PERPLEXITY-DESIGN.md §3.1; the owner's answers of
 * 30 Oct override the plan).
 *
 * Plain words: once the map's paths are fixed, ONE cheap AI reads every path with its points for and against (and what
 * each rests on) and decides, per path, whether looking things up on the web would help. For a path that needs it, it
 * writes 2 English searches (one for, one against) and, when information from the question's own country would help,
 * 2 more in the question's language for that country (owner Q10: 4 in all). It may plan none at all: a path that turns
 * on values or on the person's own situation needs no search, and the page then says why.
 *
 * - The wording is the sealed `web.plan.v2` (item 1 and the approved local sentence); `country` is sent only when the
 *   question's step-2 place gave a code, and that code always wins over the planner's (`webPlannerCountry`).
 * - Free never searches (owner, 30 Oct) and the web on/off setting (owner Q16) can turn it off: either way NO call is
 *   made and nothing is charged.
 * - A slip follows the owner's slip-recovery order (2026-10-12): (1) code reads the reply as it is — the tolerant JSON
 *   decode, then `salvageWebPlannerReply` fixes what needs no AI (a local pair with no country to search in, half a
 *   local pair, a pace on a path with no search, a country other than the given one); (2) the gateway's smallest
 *   follow-up asks only for the entries still wrong (the issues name `answers.<n>`); (3) a full re-ask only for an
 *   unusable reply. If the planner still fails, a planner of another company is tried; if every one fails, the debate
 *   goes on without the web (FAILED, nothing searched, nothing charged for searches).
 * - Code then applies the search rules (W1-2, `freezeWebQuerySet`): dates and instruction words removed, a search with
 *   personal data or first-person words held back with its partner, the look-back date from the pace word.
 * - The search cap (owner, 30 Oct): every web path gets all 4 searches; Quick look allows 20 a debate, Thorough twice
 *   that. The map has at most 4 paths, so the cap never cuts a plan today; if it ever would, the local pairs of the
 *   last paths are dropped first and every web path keeps its English pair.
 * - Thinking: the call runs at the owner's `web_planner` step level from the line-up's thinking table (the plan sets
 *   it low); the preview's call policy picks it by the `WEB:plan` call-site key, never this code.
 * - Same input, same bytes: the material, the answer ids (`a1`…) and the call-site keys are worked out by code, so a
 *   resumed run sends a byte-identical prompt and its recorded reply is replayed for free.
 */

/* ----------------------------------------------------------------- the numbers */

/** Owner Q10: 2 English searches per web path, plus 2 local ones when local information helps. */
export const WEB_SEARCHES_PER_PATH_MAX = 4 as const;
/**
 * The most searches one debate may send (owner, 30 Oct: "raise the cap so every web path gets all 4 searches; Quick:
 * 4 per path, so up to 20 at 5 paths; Thorough twice that"). Moves into the web settings row when it exists.
 */
export const WEB_PLAN_SEARCH_CAP_BY_MODE = Object.freeze({ quick: 20, thorough: 40 } as const);
/** The most paths the planner is asked about (the contract's `pathsMax`); their English pairs always fit the cap. */
export const WEB_PLANNER_PATHS_MAX = 8 as const;

/**
 * Which AI plans (plan Q11 was left open; the owner's answers name the readers only). The cheapest suitable model of
 * the reviewed rows first: the planner reads a few thousand tokens and writes a short list, so the output price
 * decides — Qwen3.8-Flash ($0.113 / $0.382 per million), then Claude Haiku 5.5 ($0.10 / $0.50), GLM-5.3-Flash
 * ($0.15 / $0.50), DeepSeek-V4.1-Flash ($0.20 / $0.60). About 0.1¢ a debate. A backup is the next one of another
 * company.
 */
export const WEB_PLANNER_MODEL_ORDER = Object.freeze([
  "Qwen/Qwen3.8-Flash", "claude-haiku-5-5", "zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"
] as const);

/** The planner's call-site keys: the first planner, then its backup (the thinking table reads both as `web_planner`). */
export const WEB_PLAN_BACKUP_CALL_SITE_KEY = `${WEB_PLAN_CALL_SITE_KEY}:seat:runnerUp` as const;
const PLANNER_KEYS = Object.freeze([WEB_PLAN_CALL_SITE_KEY, WEB_PLAN_BACKUP_CALL_SITE_KEY] as const);

/**
 * The reason a web path carries when the planner gave none: the answer form asks for a reason only on a path with no
 * search (whose reason the page shows), while the frozen set keeps one for every path. Never shown.
 */
export const WEB_PLAN_NO_REASON_GIVEN = "NO_REASON_GIVEN" as const;

/* ----------------------------------------------------------------- the input and the outcome */

/** One fixed path of the map as the planner reads it: its words and its points, each with what it rests on. */
export type WebPlannerPath = Readonly<{
  pathId: string;
  answer: string;
  forPoints: readonly WebPlannerPoint[];
  againstPoints: readonly WebPlannerPoint[];
}>;

/** One AI that may plan: its gateway and identity (the caller's run members). */
export type WebPlannerSeat = Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>;

export type WebPlannerInput = Readonly<{
  /** Free never searches: no call, every path NOT_ON_PLAN. */
  planId: PlanId;
  /** The web on/off setting (owner Q16): off means no call, every path SWITCHED_OFF. */
  webSwitchedOn: boolean;
  /** Quick look or Thorough: Thorough doubles the search cap. */
  mode: WebMode;
  runId: string;
  subjectItemId: string;
  question: string;
  /** The run's locked language, or null; sent last as `question_language`, and the local searches' language. */
  questionLanguage: QuestionLanguage | null;
  /** The ISO 3166-1 code of the question's step-2 place, or null when the place gave none. */
  placeCountry: string | null;
  /** The run's own date: the look-back window counts back from it, so a resumed run works out the same date. */
  asOf: Date;
  /** The map's fixed paths, in the map's order. */
  paths: readonly WebPlannerPath[];
  /** The planner, then its backups (of other companies), in order: `webPlannerSeats` picks them. */
  seats: readonly WebPlannerSeat[];
  /** `engineContractHash()`, the seal that covers `web.plan.v2`. */
  contractHash: string;
  bound: CallBound;
  /** Root 0's room, which no web call may cut into (plan fact 9). */
  keepRoomMicros?: number;
  /** An error the runner must see as it came (the run is abandoned): rethrown, nothing more is tried. */
  abandon?: (error: unknown) => boolean;
  /** An error after which no backup is tried (a money stop): the plan fails and the debate goes on without the web. */
  stopsHere?: (error: unknown) => boolean;
}>;

export type WebPlannerAttempt = Readonly<{ callSiteKey: string; maker: string; code: string }>;

export type WebPlanOutcome =
  | Readonly<{ kind: "NOT_ON_PLAN" }>
  | Readonly<{ kind: "SWITCHED_OFF" }>
  | Readonly<{ kind: "FAILED"; code: string; attempts: readonly WebPlannerAttempt[] }>
  | Readonly<{
    kind: "PLANNED";
    querySet: FrozenWebQuerySet;
    /** The question's country the local searches used: the step-2 code, else the one the planner read, else null. */
    country: string | null;
    /** The searches the set will send (held ones are not sent and cost nothing). */
    searchesToSend: number;
    cap: number;
    /** Paths whose local pair the cap dropped, in map order (none while the map has at most 4 paths). */
    localPairsOverCap: readonly string[];
    /** What code fixed in the reply with no call (codes only). */
    salvaged: readonly WebPlannerSalvage[];
    callSiteKey: string;
    maker: string;
    model: string;
    rawArtifactRef: string;
    ledgerEntryRef: string;
    /** Planners that failed before this one answered. */
    attempts: readonly WebPlannerAttempt[];
  }>;

/* ----------------------------------------------------------------- who plans */

/** The planner and its backup from the run's members: the first of WEB_PLANNER_MODEL_ORDER present, then the next of another company. */
export function webPlannerSeats<T extends Readonly<{ model: string; maker: string }>>(members: readonly T[]): readonly T[] {
  const ordered = WEB_PLANNER_MODEL_ORDER.flatMap((model) => members.filter((member) => member.model === model).slice(0, 1));
  const main = ordered[0];
  if (main === undefined) return Object.freeze([]);
  const backup = ordered.find((member) => member.maker !== main.maker);
  return Object.freeze(backup === undefined ? [main] : [main, backup]);
}

/* ----------------------------------------------------------------- code's salvage (step 1 of the recovery order) */

export type WebPlannerSalvage =
  | "COUNTRY_GIVEN_KEPT"
  | "COUNTRY_NOT_ONE_COUNTRY"
  | "LOCAL_WITHOUT_TARGET_DROPPED"
  | "LOCAL_PAIR_INCOMPLETE_DROPPED"
  | "PACE_WITHOUT_SEARCH_DROPPED";

function oneCountry(code: string | null): boolean {
  if (code === null) return false;
  try {
    localSearchTarget({ questionLanguage: null, placeCountry: code });
    return true;
  } catch {
    return false;
  }
}

function localTargetExists(questionLanguage: QuestionLanguage | null, country: string | null): boolean {
  if (country === null) return false;
  return localSearchTarget({ questionLanguage: questionLanguage?.code ?? null, placeCountry: country }) !== null;
}

/**
 * The reply with what code can fix fixed, and which fixes it made. Nothing is invented: a value is only dropped or
 * replaced by the one code already holds (the step-2 country). A web path keeps its English pair untouched.
 */
export function salvageWebPlannerReply(
  reply: WebPlannerV2Reply,
  context: Readonly<{ givenCountryCode: string | null; questionLanguage: QuestionLanguage | null }>
): Readonly<{ reply: WebPlannerV2Reply; salvaged: readonly WebPlannerSalvage[] }> {
  const salvaged = new Set<WebPlannerSalvage>();
  let country = reply.country;
  if (context.givenCountryCode !== null) {
    if (country !== null && country !== context.givenCountryCode) salvaged.add("COUNTRY_GIVEN_KEPT");
    country = context.givenCountryCode;
  } else if (country !== null && !oneCountry(country)) {
    salvaged.add("COUNTRY_NOT_ONE_COUNTRY");
    country = null;
  }
  const target = localTargetExists(context.questionLanguage, country);
  const answers = reply.answers.map((entry) => {
    if (!entry.needs_search) {
      if (entry.pace === null) return entry;
      salvaged.add("PACE_WITHOUT_SEARCH_DROPPED");
      return { ...entry, pace: null };
    }
    const local = entry.searches.filter((search) => search.local);
    if (local.length === 0) return entry;
    const pair = local.length === 2 && local.some((search) => search.side === "for") && local.some((search) => search.side === "against");
    if (target && pair) return entry;
    salvaged.add(target ? "LOCAL_PAIR_INCOMPLETE_DROPPED" : "LOCAL_WITHOUT_TARGET_DROPPED");
    return { ...entry, searches: entry.searches.filter((search) => !search.local) };
  });
  const order: readonly WebPlannerSalvage[] = ["COUNTRY_GIVEN_KEPT", "COUNTRY_NOT_ONE_COUNTRY", "LOCAL_WITHOUT_TARGET_DROPPED",
    "LOCAL_PAIR_INCOMPLETE_DROPPED", "PACE_WITHOUT_SEARCH_DROPPED"];
  return Object.freeze({ reply: { country, answers }, salvaged: Object.freeze(order.filter((code) => salvaged.has(code))) });
}

/* ----------------------------------------------------------------- the reply as the run's plan */

const PACE: Readonly<Record<"fast" | "normal" | "slow", WebPace>> = Object.freeze({ fast: "FAST", normal: "NORMAL", slow: "SLOW" });

/** The planner's answer ids, by code: `a1`, `a2`, … in map order (never the run's own path ids). */
const answerIdOf = (index: number): string => `a${String(index + 1)}`;

function plannedPathOf(pathId: string, entry: WebPlannerV2Reply["answers"][number]): PlannedWebPath {
  const searches: PlannedWebSearch[] = entry.searches.map((search) => Object.freeze({
    scope: search.local ? "LOCAL" as const : "ENGLISH" as const,
    polarity: search.side === "for" ? "SUPPORTING" as const : "DISCONFIRMING" as const,
    text: search.query
  }));
  return Object.freeze({
    pathId,
    web: entry.needs_search,
    reason: entry.reason ?? WEB_PLAN_NO_REASON_GIVEN,
    pace: entry.pace === null ? null : PACE[entry.pace],
    localHelps: searches.some((search) => search.scope === "LOCAL"),
    searches: Object.freeze(searches)
  });
}

/** The cap, in code: every web path's English pair first, then the local pairs in map order while they fit. */
function cappedPlan(plan: readonly PlannedWebPath[], cap: number): Readonly<{ plan: readonly PlannedWebPath[]; dropped: readonly string[] }> {
  let used = plan.filter((path) => path.web).length * 2;
  const dropped: string[] = [];
  const kept = plan.map((path) => {
    if (!path.localHelps) return path;
    if (used + 2 <= cap) {
      used += 2;
      return path;
    }
    dropped.push(path.pathId);
    return Object.freeze({ ...path, localHelps: false, searches: Object.freeze(path.searches.filter((search) => search.scope !== "LOCAL")) });
  });
  return Object.freeze({ plan: Object.freeze(kept), dropped: Object.freeze(dropped) });
}

type PlannerContext = Readonly<{
  pathIds: readonly string[];
  answerIds: readonly string[];
  givenCountryCode: string | null;
  questionLanguage: QuestionLanguage | null;
  asOf: Date;
  cap: number;
}>;

type ReadPlan = Readonly<{
  querySet: FrozenWebQuerySet;
  country: string | null;
  localPairsOverCap: readonly string[];
  salvaged: readonly WebPlannerSalvage[];
}>;

/** Freezes the plan, or names each entry the search rules refuse (a for and an against that are the same words once cleaned). */
function frozenOrIssues(reply: WebPlannerV2Reply, context: PlannerContext):
  Readonly<{ kind: "FROZEN"; read: Omit<ReadPlan, "salvaged"> }> | Readonly<{ kind: "ISSUES"; issues: readonly WebReplyIssue[] }> {
  const pathOf = new Map(context.answerIds.map((answerId, index) => [answerId, context.pathIds[index]!]));
  const planned = reply.answers.map((entry) => plannedPathOf(pathOf.get(entry.answer_id)!, entry));
  const country = context.givenCountryCode ?? reply.country;
  const frame = { asOf: context.asOf, questionLanguage: context.questionLanguage?.code ?? null, placeCountry: country };
  const issues: WebReplyIssue[] = [];
  planned.forEach((path, index) => {
    try {
      freezeWebQuerySet([path], { ...frame, pathIds: [path.pathId] });
    } catch (error) {
      if (!(error instanceof TypedDomainError)) throw error;
      issues.push(Object.freeze({ code: WEB_REPLY_SEARCHES_INVALID, path: Object.freeze(["answers", index]), message: WEB_REPLY_SEARCHES_INVALID }));
    }
  });
  if (issues.length > 0) return Object.freeze({ kind: "ISSUES", issues: Object.freeze(issues) });
  const capped = cappedPlan(context.pathIds.map((pathId) => planned.find((path) => path.pathId === pathId)!), context.cap);
  const querySet = freezeWebQuerySet(capped.plan, { ...frame, pathIds: context.pathIds });
  return Object.freeze({ kind: "FROZEN", read: Object.freeze({ querySet, country, localPairsOverCap: capped.dropped }) });
}

/** The full check of one decoded reply: salvage, the answer form's rules, then the search rules. */
function checkedPlan(value: WebPlannerV2Reply, context: PlannerContext):
  Readonly<{ kind: "OK"; read: ReadPlan }> | Readonly<{ kind: "ISSUES"; issues: readonly WebReplyIssue[] }> {
  const salvage = salvageWebPlannerReply(value, context);
  const formIssues = webPlannerV2ReplyIssues(salvage.reply, context.answerIds, context.givenCountryCode);
  if (formIssues.length > 0) return Object.freeze({ kind: "ISSUES", issues: formIssues });
  const frozen = frozenOrIssues(salvage.reply, context);
  if (frozen.kind === "ISSUES") return frozen;
  return Object.freeze({ kind: "OK", read: Object.freeze({ ...frozen.read, salvaged: salvage.salvaged }) });
}

/* ----------------------------------------------------------------- the call */

/** The planner's framed prompt: `web.plan.v2`, its material, and the run's language field last. Same input, same bytes. */
export function webPlannerFramedPrompt(input: Readonly<{
  question: string;
  placeCountry: string | null;
  questionLanguage: QuestionLanguage | null;
  paths: readonly WebPlannerPath[];
}>): FramedPrompt {
  const material = webPlannerV2MaterialFields({
    question: input.question,
    countryCode: input.placeCountry,
    answers: input.paths.map((path, index) => Object.freeze({
      answerId: answerIdOf(index), answer: path.answer, forPoints: path.forPoints, againstPoints: path.againstPoints
    }))
  });
  return buildFramedPrompt({ contract: WEB_PLANNER_V2_PROMPT_CONTRACT, material: withQuestionLanguageField(material, input.questionLanguage) });
}

function checkedInput(input: WebPlannerInput): void {
  const ids = input.paths.map((path) => path.pathId);
  if (ids.length === 0 || ids.length > WEB_PLANNER_PATHS_MAX || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || id.trim() === "")) {
    throw new TypedDomainError("WEB_PLANNER_PATHS_INVALID", `The planner reads 1 to ${String(WEB_PLANNER_PATHS_MAX)} distinct paths`);
  }
  // The step-2 country is code's own value: refused here, before anything is sent, when it is not one country.
  if (input.placeCountry !== null && !oneCountry(input.placeCountry)) {
    throw new TypedDomainError("WEB_PLACE_COUNTRY_INVALID", "A place country must be one ISO 3166-1 country code");
  }
}

const errorCodeOf = (error: unknown): string => error instanceof ProviderContentUnacceptedError
  ? "WEB_PLANNER_REPLY_REFUSED"
  : error instanceof TypedDomainError ? error.code : "WEB_PLANNER_CALL_FAILED";

/**
 * The planner step: Free and the off switch first (no call), then the planner and, if it fails, its backup. Returns
 * the run's frozen web query set, or why there is none. Never throws for a planner that failed: the debate goes on
 * without the web. Throws only for a wiring defect in its input, or an error `abandon` names.
 */
export async function planWebSearches(input: WebPlannerInput): Promise<WebPlanOutcome> {
  if (input.planId === "FREE") return Object.freeze({ kind: "NOT_ON_PLAN" });
  if (!input.webSwitchedOn) return Object.freeze({ kind: "SWITCHED_OFF" });
  checkedInput(input);
  const framed = webPlannerFramedPrompt(input);
  const context: PlannerContext = Object.freeze({
    pathIds: Object.freeze(input.paths.map((path) => path.pathId)),
    answerIds: Object.freeze(input.paths.map((_, index) => answerIdOf(index))),
    givenCountryCode: input.placeCountry,
    questionLanguage: input.questionLanguage,
    asOf: input.asOf,
    cap: WEB_PLAN_SEARCH_CAP_BY_MODE[input.mode]
  });
  const classify = (content: string, reply: ModelReplyFacts | undefined): ContentClassification =>
    classifyStructuredArtifact(content, webPlannerV2ReplySchema, reply, undefined, (value) => {
      const checked = checkedPlan(value, context);
      return checked.kind === "OK" ? [] : checked.issues;
    });
  const attempts: WebPlannerAttempt[] = [];
  const seats = input.seats.slice(0, PLANNER_KEYS.length);
  for (const [index, seat] of seats.entries()) {
    const callSiteKey = PLANNER_KEYS[index]!;
    const reading = rememberingAcceptedReply(classify);
    try {
      const response = await seat.provider.call({
        runId: input.runId, subjectItemId: input.subjectItemId, callSiteKey, role: "JUDGE", lane: "served",
        bound: input.bound, contractHash: input.contractHash, providerRef: seat.providerRef, packet: framed.packet,
        classifyContent: reading.classifyContent,
        buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
        ...(input.keepRoomMicros !== undefined && input.keepRoomMicros > 0 ? { keepRoomMicros: input.keepRoomMicros } : {})
      });
      const parsed = parseStructuredArtifact(response.content, webPlannerV2ReplySchema, reading.acceptedAs(response.content).reply);
      const checked = parsed.kind === "PARSED" ? checkedPlan(parsed.value, context) : null;
      if (checked === null || checked.kind !== "OK") {
        // The gateway accepts only what the classifier passed; a reply that reads differently here is refused, not used.
        attempts.push(Object.freeze({ callSiteKey, maker: seat.maker, code: "WEB_PLANNER_REPLY_REFUSED" }));
        continue;
      }
      const { querySet } = checked.read;
      return Object.freeze({
        kind: "PLANNED",
        querySet,
        country: checked.read.country,
        searchesToSend: querySet.searches.filter((search) => search.status === "SEND").length,
        cap: context.cap,
        localPairsOverCap: checked.read.localPairsOverCap,
        salvaged: checked.read.salvaged,
        callSiteKey,
        maker: response.maker,
        model: response.model,
        rawArtifactRef: response.rawArtifactRef,
        ledgerEntryRef: response.ledgerEntryRef,
        attempts: Object.freeze([...attempts])
      });
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      attempts.push(Object.freeze({ callSiteKey, maker: seat.maker, code: errorCodeOf(error) }));
      if (input.stopsHere?.(error) === true) break;
    }
  }
  return Object.freeze({
    kind: "FAILED",
    code: attempts.at(-1)?.code ?? "WEB_PLANNER_NO_SEAT",
    attempts: Object.freeze(attempts)
  });
}

/* ----------------------------------------------------------------- per path, for the page and the web step */

export type WebPlanPathStatus = Readonly<{
  pathId: string;
  status: "PLANNED" | "NO_SEARCH_PLANNED" | "NOT_ON_PLAN" | "SWITCHED_OFF" | "FAILED";
  /** The planner's reason for a path with no search; null otherwise. */
  reason: string | null;
  /** The searches this path will send (0 when the guard held them all back). */
  searchesToSend: number;
}>;

/** Each path's web status before any search runs (the contract's SEARCHED or FAILED is the web step's to say after). */
export function webPlanPathStatuses(outcome: WebPlanOutcome, pathIds: readonly string[]): readonly WebPlanPathStatus[] {
  return Object.freeze(pathIds.map((pathId): WebPlanPathStatus => {
    if (outcome.kind !== "PLANNED") return Object.freeze({ pathId, status: outcome.kind, reason: null, searchesToSend: 0 });
    const path = outcome.querySet.paths.find((entry) => entry.pathId === pathId);
    if (path === undefined) throw new TypedDomainError("WEB_PLAN_PATH_MISSING", "Every path on the map needs a web decision");
    const searchesToSend = outcome.querySet.searches.filter((search) => search.pathId === pathId && search.status === "SEND").length;
    return path.web
      ? Object.freeze({ pathId, status: "PLANNED", reason: null, searchesToSend })
      : Object.freeze({ pathId, status: "NO_SEARCH_PLANNED", reason: path.reason, searchesToSend: 0 });
  }));
}
