import {
  AskRequestSchema, askQuestionMaxBytes, detectCrisis, DIG_SUGGESTION_KINDS, WEB_CONTRACT_LIMITS, type Answer, type AskRequest, type DigSuggestion,
  type PathId, type Session
} from "@debateai/contract";
import type { CarryOnDue, StartPathsStore, StoredAsk } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { RoomPreview } from "./ask-room.js";

/*
 * V4 start step, Task 56 ("Let the AIs carry on to the report"; owner ruling of 3 Nov, evening; decision record answer 9): when the
 * ask carried `carry_on_to_report` and the first debate has settled, the AIs dig once into each path's top suggestion (the first one
 * the map shows on that path), then "Write my report" runs by itself. Five paths: five digs, then the report. Free gets one dig in
 * all, never with web search. It stops early when the day's share runs out, and the report always keeps its reserve. Ticking the
 * box is the person asking (29 Oct: "Auto-finish: never automatically; only when the person asks").
 *
 * Pure over its ports: a dig is admitted only by POST /v1/asks's own steps and the report only by POST /v1/runs/{id}/report's
 * (`askPreflight`, `askAsOwner`, `writeReportAsOwner`, built inside buildApi), never through a side door. The carry-on acts as the
 * person with no live sign-in (owner ruling 3 Nov, night): the first debate's own identity session, and each dig's key provisioned
 * through 0161 from that debate's binding. Marks, so nothing runs twice: DUE (the runner's story stage) → BEGUN (the tick's claim)
 * → DONE. Logs carry codes and counts only: never an id, a word of a question or a figure.
 */

/** A run still waiting this long after BEGUN is pressed anyway (private) or given up (public): the runner's own give-up wait. */
export const CARRY_ON_PRESS_ANYWAY_MS = 6 * 60 * 60_000;
/** One tick claims at most `due` DUE runs and presses at most `begun` other BEGUN runs without DONE. */
export const CARRY_ON_TICK_LIMITS = Object.freeze({ due: 10, begun: 50 });

export type CarryOnAsker = Readonly<{ session: Session; ownerRef: string; userId: string }>;

/** The person, as the first debate's own identity session names them (signed out or not). */
export function carryOnAskerOf(due: CarryOnDue): CarryOnAsker {
  return Object.freeze({
    session: Object.freeze({ asker_id: `owner:${due.ownerRef}`, session_id: due.identitySessionId, caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const, provisional_identity_model: false as const }),
    ownerRef: due.ownerRef, userId: due.userId
  });
}

/** The groups in the order a path shows them on the map (apps/ui/lib/v4/suggestions.ts SUGGESTION_GROUPS). */
const SUGGESTION_GROUPS = ["CONTRADICTING", "UNDOCUMENTED", "NEEDS_MORE_WEB", "HELPS_MAIN_QUESTION.FOR", "HELPS_MAIN_QUESTION.AGAINST"] as const;

function groupOf(suggestion: Pick<DigSuggestion, "kind" | "side">): string {
  if (suggestion.kind !== "HELPS_MAIN_QUESTION") return suggestion.kind;
  return suggestion.side === "AGAINST" ? "HELPS_MAIN_QUESTION.AGAINST" : "HELPS_MAIN_QUESTION.FOR";
}

/** One line of text: runs of spaces and line breaks become one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A path's suggestions as the map keeps them (pathSuggestionsOf): a known kind, each id once, a non-empty line, at most twenty. */
function keptSuggestionsOf(answer: Answer, pathId: string): readonly DigSuggestion[] {
  const path = (answer.web?.paths ?? []).find((candidate) => candidate.position_ref === pathId);
  if (path === undefined) return [];
  const seen = new Set<string>();
  const kept: DigSuggestion[] = [];
  for (const suggestion of path.suggestions) {
    if (!(DIG_SUGGESTION_KINDS as readonly string[]).includes(suggestion.kind) || seen.has(suggestion.suggestion_id)) continue;
    if (oneLine(suggestion.text).length === 0) continue;
    seen.add(suggestion.suggestion_id);
    kept.push(suggestion);
    if (kept.length === WEB_CONTRACT_LIMITS.suggestionsPerPathMax) break;
  }
  return kept;
}

/** The first suggestion the map shows on the path: the first of its group order, each group in the answer's order; null: none. */
export function topDigSuggestionOf(answer: Answer, pathId: PathId): DigSuggestion | null {
  const kept = keptSuggestionsOf(answer, pathId);
  for (const group of SUGGESTION_GROUPS) {
    const found = kept.find((suggestion) => groupOf(suggestion) === group);
    if (found !== undefined) return found;
  }
  return null;
}

export type CarryOnDigPick = Readonly<{ pathId: PathId; suggestion: DigSuggestion }>;

/**
 * The digs, in the paths' order: none for a path whose branch FAILED, none for a path offering no suggestion; Free only the first
 * path that gets one.
 */
export function carryOnDigPicksOf(input: Readonly<{ answer: Answer; pathIds: readonly PathId[]; free: boolean }>): readonly CarryOnDigPick[] {
  const failed = new Set((input.answer.branches?.paths ?? []).filter((branch) => branch.state === "FAILED").map((branch) => branch.path_id));
  const picks: CarryOnDigPick[] = [];
  for (const pathId of input.pathIds) {
    if (failed.has(pathId)) continue;
    const suggestion = topDigSuggestionOf(input.answer, pathId);
    if (suggestion === null) continue;
    picks.push(Object.freeze({ pathId, suggestion }));
    if (input.free) break;
  }
  return Object.freeze(picks);
}

const QUOTE_OPEN = "“";
const QUOTE_CLOSE = "”";
const ELLIPSIS = "…";
/** The first blank line: the person's own words come before it (apps/ui/lib/v4/askText.ts ownWords). */
const BLANK_LINE = /\n[^\S\n]*\n/;

function ownWordsOf(questionLine: string): string {
  const text = questionLine.trim();
  const at = text.search(BLANK_LINE);
  return at === -1 ? text : text.slice(0, at).trim();
}

/** At most `max` code points, with "…" when cut (askText.ts cut). */
function cut(text: string, max: number): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return `${points.slice(0, Math.max(0, max)).join("").trimEnd()}${ELLIPSIS}`;
}

const bytesOf = (text: string): number => Buffer.byteLength(text, "utf8");

/**
 * The dig's question line in the page's own form for a one-pick dig on a page not in English (askText.ts digQuestion's off-English
 * branch, which needs no catalog): the pick's text on one line, a blank line, the first debate's question inside “ ”. Only the
 * question is cut, by code points with "…", the longest that keeps the whole within the API's question limit.
 */
export function carryOnDigQuestionLine(pickText: string, rootQuestionLine: string): string {
  const text = oneLine(pickText);
  const question = oneLine(ownWordsOf(rootQuestionLine));
  const write = (kept: string) => kept.length === 0 ? text : `${text}\n\n${QUOTE_OPEN}${kept}${QUOTE_CLOSE}`;
  const limit = askQuestionMaxBytes();
  if (bytesOf(write(question)) <= limit) return write(question);
  // The longest cut of the question that fits (cutting more never makes it longer).
  let low = 0;
  let high = Array.from(question).length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bytesOf(write(cut(question, middle))) <= limit) low = middle;
    else high = middle - 1;
  }
  const line = write(cut(question, low));
  // A pick text is at most 1,000 characters (WEB_CONTRACT_LIMITS), so the text alone always fits; this guard only keeps the bound.
  return bytesOf(line) <= limit ? line : cut(text, Math.floor(limit / 4));
}

/**
 * The dig's ask: the first debate's settings as stored, now, its question line, and a quick one-pick dig of one path with the
 * suggestion's own kind, id and text (so the pick is the AI's suggestion and the dig is anchored on the path). Never the box, the
 * chosen paths, the check or purpose lines (the dig gets the first debate's purpose lines at submit). Mode: always quick (owner
 * ruling 3 Nov, night: as a dig the person starts), Free included.
 */
export function carryOnDigAskOf(input: Readonly<{ stored: StoredAsk; rootRunId: string; pick: CarryOnDigPick; free: boolean; now: Date }>): AskRequest {
  const { stored, pick } = input;
  const contract = stored.askContract;
  const place = `path:${pick.pathId}`;
  return AskRequestSchema.parse({
    question_line: carryOnDigQuestionLine(pick.suggestion.text, stored.questionLine),
    risk_tier: stored.askerRiskTier,
    // As re-admission reads a stored ask (readmission.ts rebuiltAsk): a stored DEPLOYMENT_POLICY is the asker's own tier.
    tier_source: stored.tierSource === "DEPLOYMENT_POLICY" ? "ASKER" : stored.tierSource,
    tier_provenance_ref: stored.tierProvenanceRef,
    composition_budget_tier: stored.compositionBudgetTier,
    plan_tier: stored.planTier,
    depth_params: stored.depthParams,
    as_of: input.now.toISOString(),
    decision_scope: contract.decision_scope,
    steering_presets: contract.steering_presets,
    steering_annotations: contract.steering_annotations,
    parent: { parent_run_id: input.rootRunId, places: [place], mode: "quick",
      picks: [{ kind: pick.suggestion.kind, suggestion_id: pick.suggestion.suggestion_id, place, text: pick.suggestion.text }] }
  });
}

/** The carry-on dig a carry-on ask is: its debate and its one path (the server principal's `carryOn`); refused for any other ask. */
export function carryOnDigOf(ask: AskRequest): Readonly<{ parentRunId: string; pathId: string }> {
  const place = ask.parent?.places.length === 1 ? ask.parent.places[0]! : "";
  const pathId = /^path:(b[1-8])$/u.exec(place)?.[1];
  if (ask.parent === undefined || pathId === undefined) throw new TypedDomainError("CARRY_ON_DIG_INVALID", "Not a carry-on dig of one path");
  return Object.freeze({ parentRunId: ask.parent.parent_run_id, pathId });
}

/** The room's unlocked look for one dig and the dig's whole share of today (`AskRoom.digShareMicros`). */
export type CarryOnDigRoom = Readonly<{ preview: Pick<RoomPreview, "admission" | "personUses">; digMicros: number }>;

/**
 * Whether one more dig fits: no room composed, room; not START, none; no person window, room; else the smallest window's
 * limit less used less the reserve kept inside it (never again for the month, whose limit already leaves it out), less what this
 * pass already started (the money rule holds nothing before a start), must still hold the dig's share.
 */
export function carryOnHasRoom(input: Readonly<{ room: CarryOnDigRoom | null; reserveInsideMicros: number; startedMicros: number }>): boolean {
  const { room } = input;
  if (room === null) return true;
  if (room.preview.admission.kind !== "START") return false;
  if (room.preview.personUses.length === 0) return true;
  const left = Math.min(...room.preview.personUses.map((use) =>
    use.limitMicros - use.usedMicros - (use.scope === "PERSON_MONTH" ? 0 : input.reserveInsideMicros)));
  return left - input.startedMicros >= room.digMicros;
}

export type CarryOnStop = "NO_ROOM" | "REFUSED" | "OWNER_GONE";
export type CarryOnStarted =
  | Readonly<{ kind: "NOT_ASKED" }>
  | Readonly<{ kind: "PERSON_PRESSED" }>
  | Readonly<{ kind: "STARTED"; digs: number; stop: CarryOnStop | null }>;
export type CarryOnReport = "WAITING_FOR_DIGS" | "PRESSED" | "PERSON_PRESSED" | "NOT_PRESSED";
/** Who asks POST /v1/asks's steps: a route's request, or the carry-on's person (no edge country: the Start passed the gate). */
export type AskAsker = Readonly<{ session: Session; owner: Readonly<{ ownerRef: string; userId: string }> | null; edgeCountry: string | null }>;
export type AskAsOwnerOutcome =
  | Readonly<{ kind: "ACCEPTED"; status: 202; body: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: "REFUSED"; status: number; body: Readonly<Record<string, unknown>> }>;
export type WriteReportAsOwnerOutcome =
  | Readonly<{ kind: "WRITING"; reportVersion: number; waitingForDigs: number }>
  | Readonly<{ kind: "REFUSED"; status: number; code: string }>;

export interface CarryOnPorts {
  marks: Pick<StartPathsStore, "claimCarryOnDue" | "readCarryOnBegun" | "recordCarryOnDone" | "readStartPaths">;
  readStoredAsk(runId: string): Promise<StoredAsk | null>;
  readAnswer(asker: CarryOnAsker, runId: string): Promise<Answer | null>;
  planOf(asker: CarryOnAsker, stored: StoredAsk): Promise<Readonly<{ free: boolean; reserveInsideMicros: number }>>;
  /** Null without a room composed; throws ASK_ALREADY_WAITING as the room's precheck does. */
  roomForDig(asker: CarryOnAsker, ask: AskRequest): Promise<CarryOnDigRoom | null>;
  askPreflight(asker: CarryOnAsker): Promise<Readonly<{ allowed: true }> | Readonly<{ allowed: false; code: string }>>;
  askAsOwner(asker: AskAsker, ask: AskRequest): Promise<AskAsOwnerOutcome>;
  /**
   * Private: the person's closings of the debate's investigation and 0136's waiting count; public: the person's own reports of this
   * debate (Task 56b's ownClosingsCount), waiting 0 (its own press answers ONGOING).
   */
  readReport(asker: CarryOnAsker, runId: string): Promise<Readonly<{ public: boolean; closings: number; waiting: number }>>;
  writeReportAsOwner(asker: AskAsker, runId: string): Promise<WriteReportAsOwnerOutcome>;
  log(line: string): void;
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/u;

/**
 * A thrown error's code, never its words: a typed code, a code an error carries (the route's AskRefusal, e.g. the site's day), or a
 * database refusal whose whole message is a code.
 */
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof Error) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === "string" && CODE_PATTERN.test(code)) return code;
    if (CODE_PATTERN.test(error.message)) return error.message;
  }
  return "UNTYPED";
}

const OWNER_GONE_CODES: ReadonlySet<string> = new Set(["CARRY_ON_DIG_OWNER_GONE", "RUN_OWNER_INVALID"]);
const NOT_ASKED: CarryOnStarted = Object.freeze({ kind: "NOT_ASKED" });
const PERSON_PRESSED: CarryOnStarted = Object.freeze({ kind: "PERSON_PRESSED" });

function logLine(ports: CarryOnPorts, event: string, members: Readonly<Record<string, string | number>>): void {
  ports.log(JSON.stringify({ event, ...members }));
}

/**
 * The digs of one claimed run, each through the person's own steps: the crisis check, the room's look (stop early before each
 * dig), the pre-flight (consent, team, the asks budget), then the dig step itself. Only the tick that claimed the run calls it, so
 * its digs start once; it never retries a path.
 */
export async function runCarryOnToReport(due: CarryOnDue, ports: CarryOnPorts): Promise<CarryOnStarted> {
  const asker = carryOnAskerOf(due);
  const set = await ports.marks.readStartPaths(due.runId);
  if (set === null || !set.carryOnToReport || set.source === "DIG_PICKS") return NOT_ASKED;
  if ((await ports.readReport(asker, due.runId)).closings >= 1) return PERSON_PRESSED;
  const stored = await ports.readStoredAsk(due.runId);
  if (stored === null) return NOT_ASKED;
  const answer = await ports.readAnswer(asker, due.runId);
  const plan = await ports.planOf(asker, stored);
  const pathIds = [...set.paths].sort((a, b) => a.pathNo - b.pathNo).map((path) => path.pathId);
  const picks = answer === null ? [] : carryOnDigPicksOf({ answer, pathIds, free: plan.free });
  const owner: AskAsker = Object.freeze({ session: asker.session, owner: Object.freeze({ ownerRef: asker.ownerRef, userId: asker.userId }), edgeCountry: null });
  let digs = 0;
  let startedMicros = 0;
  const stopped = (stop: CarryOnStop, code: string): CarryOnStarted => {
    logLine(ports, "api.carry_on.stopped", { stop, code });
    return Object.freeze({ kind: "STARTED", digs, stop });
  };
  for (const pick of picks) {
    const ask = carryOnDigAskOf({ stored, rootRunId: due.runId, pick, free: plan.free, now: new Date() });
    // POST /v1/asks's first step: a question that reads as a person in crisis starts no debate.
    if (detectCrisis(ask.question_line).crisis) return stopped("REFUSED", "CRISIS_SUPPORT_OFFERED");
    let room: CarryOnDigRoom | null;
    try {
      room = await ports.roomForDig(asker, ask);
    } catch (error) {
      return stopped("REFUSED", codeOf(error));
    }
    if (!carryOnHasRoom({ room, reserveInsideMicros: plan.reserveInsideMicros, startedMicros })) return stopped("NO_ROOM", "NO_ROOM");
    const preflight = await ports.askPreflight(asker);
    if (!preflight.allowed) return stopped("REFUSED", preflight.code);
    let outcome: AskAsOwnerOutcome;
    try {
      outcome = await ports.askAsOwner(owner, ask);
    } catch (error) {
      const code = codeOf(error);
      if (OWNER_GONE_CODES.has(code)) return stopped("OWNER_GONE", code);
      if (code === "CARRY_ON_DIG_TAKEN") {
        logLine(ports, "api.carry_on.dig_skipped", { code });
        continue;
      }
      return stopped("REFUSED", code);
    }
    if (outcome.kind === "REFUSED") return stopped("REFUSED", typeof outcome.body.error === "string" ? outcome.body.error : "UNTYPED");
    digs += 1;
    startedMicros += room?.digMicros ?? 0;
    // A dig the room's locked decision put in line waits like the person's own dig; no further dig starts.
    if (outcome.body.status === "WAITING") return stopped("NO_ROOM", "DIG_WAITING");
  }
  return Object.freeze({ kind: "STARTED", digs, stop: null });
}

const isRetried = (code: string): boolean => code === "PUBLIC_DEBATE_ONGOING" || code === "PUBLIC_DEBATE_WAITS_FOR_RESET";

/**
 * "Write my report" for a BEGUN run without DONE, once: the person pressed first → DONE; digs still running (0136's waiting) →
 * tried again at the next tick; otherwise the person's own report step, and DONE right after its WRITING answer or a refusal that
 * ends it. A public debate still going, or whose report waits for the reset, is tried again at the next tick. Six hours after
 * BEGUN a private debate is pressed anyway (its closing goes on with what is settled) and a public one is given up. A throw
 * (a close race, a database error) records nothing and reaches the tick, which tries again next time.
 */
export async function pressCarryOnReport(due: CarryOnDue, ports: CarryOnPorts, now: Date): Promise<CarryOnReport> {
  const asker = carryOnAskerOf(due);
  const read = await ports.readReport(asker, due.runId);
  if (read.closings >= 1) {
    await ports.marks.recordCarryOnDone(due.runId);
    return "PERSON_PRESSED";
  }
  const late = now.getTime() - due.begunAt.getTime() >= CARRY_ON_PRESS_ANYWAY_MS;
  if (!read.public && read.waiting > 0 && !late) return "WAITING_FOR_DIGS";
  const outcome = await ports.writeReportAsOwner(Object.freeze({ session: asker.session,
    owner: Object.freeze({ ownerRef: asker.ownerRef, userId: asker.userId }), edgeCountry: null }), due.runId);
  if (outcome.kind === "WRITING") {
    await ports.marks.recordCarryOnDone(due.runId);
    return "PRESSED";
  }
  if (isRetried(outcome.code) && !late) return "WAITING_FOR_DIGS";
  await ports.marks.recordCarryOnDone(due.runId);
  logLine(ports, "api.carry_on.not_pressed", { code: outcome.code });
  return "NOT_PRESSED";
}

export type CarryOnTick = Readonly<{ begun: number; digs: number; pressed: number; waiting: number }>;

/**
 * One tick: claims at most CARRY_ON_TICK_LIMITS.due DUE runs and, for each, its digs then its report; then the report of at most
 * CARRY_ON_TICK_LIMITS.begun other BEGUN runs without DONE, oldest first (a run claimed in this tick is pressed once in it). One
 * line of counts. A run whose pass throws is logged by code and left for the next tick. A pass that stops OWNER_GONE is not
 * pressed after it (Task 56e, owner answer 11: "If the account is no longer active, the digs stop and the report is still
 * written"): the person's own report step writes only for an active account, so the run stays BEGUN and the BEGUN reader, which
 * reads only active accounts, hands it to the press once the account is active again; 0157's claim closes an erased one.
 */
export async function carryOnTick(ports: CarryOnPorts, now: Date): Promise<CarryOnTick> {
  const counts = { begun: 0, digs: 0, pressed: 0, waiting: 0 };
  const pressedRuns = new Set<string>();
  const press = async (due: CarryOnDue): Promise<void> => {
    pressedRuns.add(due.runId.toLowerCase());
    try {
      const report = await pressCarryOnReport(due, ports, now);
      if (report === "PRESSED") counts.pressed += 1;
      if (report === "WAITING_FOR_DIGS") counts.waiting += 1;
    } catch (error) {
      logLine(ports, "api.carry_on.press_failed", { code: codeOf(error) });
    }
  };
  for (const due of await ports.marks.claimCarryOnDue(CARRY_ON_TICK_LIMITS.due)) {
    counts.begun += 1;
    let ownerGone = false;
    try {
      const started = await runCarryOnToReport(due, ports);
      if (started.kind === "STARTED") counts.digs += started.digs;
      ownerGone = started.kind === "STARTED" && started.stop === "OWNER_GONE";
    } catch (error) {
      logLine(ports, "api.carry_on.digs_failed", { code: codeOf(error) });
    }
    if (!ownerGone) await press(due);
  }
  for (const due of await ports.marks.readCarryOnBegun(CARRY_ON_TICK_LIMITS.begun)) {
    if (pressedRuns.has(due.runId.toLowerCase())) continue;
    await press(due);
  }
  logLine(ports, "api.carry_on.tick", counts);
  return Object.freeze({ ...counts });
}
