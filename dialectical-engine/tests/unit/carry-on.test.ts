import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AskRequestSchema, askQuestionMaxBytes, type Answer, type AnswerBranches, type AskRequest, type DigSuggestion, type PathId
} from "@debateai/contract";
import { buildApi, type AskApplication } from "@debateai/api";
import type { CarryOnDue, InvestigationReportEntry, InvestigationReportsOwnerRead, StoredAsk, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { InvestigationReportPorts } from "../../apps/api/src/investigation-report.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import {
  CARRY_ON_PRESS_ANYWAY_MS, CARRY_ON_TICK_LIMITS, carryOnAskerOf, carryOnDigAskOf, carryOnDigOf, carryOnDigPicksOf, carryOnDigQuestionLine,
  carryOnHasRoom, carryOnTick, pressCarryOnReport, runCarryOnToReport, topDigSuggestionOf, type AskAsOwnerOutcome, type CarryOnDigRoom,
  type CarryOnPorts, type WriteReportAsOwnerOutcome
} from "../../apps/api/src/carry-on.js";
import { AskRoom, type RoomQuestion, type RoomWindowUse } from "../../apps/api/src/ask-room.js";
import { recordCarryOnDueSafely } from "../../apps/runner/src/index.js";
import { INVESTIGATION_CLOSE_DEFAULTS } from "../../apps/runner/src/investigation-close.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { pathSuggestionsOf, suggestionPick, suggestionsByKind } from "../../apps/ui/lib/v4/suggestions.js";
import { branchFixture, branchesFixture, outcomeFixture } from "../support/branchesFixture.js";

/*
 * V4 start step, Task 56 ("Let the AIs carry on to the report"; owner ruling 3 Nov, evening; decision record answer 9): when the ask
 * carried the box and the first debate has settled, the AIs dig once into each path's top suggestion (the first one the map shows on
 * that path), then "Write my report" runs by itself; Free gets one dig in all; it stops early when the day's share runs out, and the
 * report always keeps its reserve. Everything here runs over fake ports that record every call; tests/integration/v2-carry-on.test.ts
 * runs the same code on the real API, the real runner and a real database. Every figure, id and word is made up.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const ROOT = "aaaaaaaa-1111-4111-8111-111111111111";
const OWNER = "bbbbbbbb-2222-4222-8222-222222222222";
const USER = "cccccccc-3333-4333-8333-333333333333";
const SESSION = "dddddddd-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-05T09:00:00.000Z");
const Q = "Should we build new reactors?";

const suggestion = (id: string, kind: DigSuggestion["kind"], side: DigSuggestion["side"] = null, text = `Made-up suggestion ${id}`): DigSuggestion =>
  Object.freeze({ suggestion_id: id, kind, side, text, places: [`p:${id}`] });
const CONTRA_1 = suggestion("contra-1", "CONTRADICTING", null, "Who checked the cost figures?");
const UNDOC_1 = suggestion("undoc-1", "UNDOCUMENTED");
const MORE_WEB_1 = suggestion("web-1", "NEEDS_MORE_WEB");
const HELPS_FOR = suggestion("helps-for", "HELPS_MAIN_QUESTION", "FOR");
const HELPS_AGAINST = suggestion("helps-against", "HELPS_MAIN_QUESTION", "AGAINST");

/** An answer whose web part offers `byPath`'s suggestions on each path, and (optionally) the branches given. Only what is read is set. */
function answerWith(byPath: Readonly<Record<string, readonly DigSuggestion[]>>, branches?: AnswerBranches): Answer {
  return {
    answer_id: "eeeeeeee-5555-4555-8555-555555555555", run_ref: ROOT,
    web: { paths: Object.entries(byPath).map(([ref, suggestions]) => ({ position_ref: ref, search: { status: "NOT_ON_PLAN" }, other_pages: [], suggestions })) },
    ...(branches === undefined ? {} : { branches })
  } as unknown as Answer;
}

const B1_B5: readonly PathId[] = ["b1", "b2", "b3", "b4", "b5"];
const everyPath = (count: number, list: (n: number) => readonly DigSuggestion[]) =>
  Object.fromEntries(Array.from({ length: count }, (_, at) => [`b${at + 1}`, list(at + 1)]));
const FIVE = answerWith(everyPath(5, (n) => [suggestion(`u-${n}`, "UNDOCUMENTED"), suggestion(`c-${n}`, "CONTRADICTING")]), branchesFixture(5));
const FIVE_B3_FAILED = answerWith(everyPath(5, (n) => [suggestion(`u-${n}`, "UNDOCUMENTED")]),
  branchesFixture([1, 2, 3, 4, 5].map((n) => n === 3 ? branchFixture(3, { state: "FAILED", outcome: outcomeFixture("FAILED") }) : branchFixture(n))));
const THREE_B1_NONE = answerWith({ b1: [], b2: [UNDOC_1], b3: [MORE_WEB_1] }, branchesFixture(3));
const NONE_ANYWHERE = answerWith(everyPath(5, () => []), branchesFixture(5));
/** Answers the drift pin reads: kinds out of order, a repeated id, a blank text, an unknown kind, more than twenty, a path with none. */
const FIXTURES: readonly Answer[] = [
  FIVE, FIVE_B3_FAILED, THREE_B1_NONE, NONE_ANYWHERE,
  answerWith({ b1: [HELPS_AGAINST, HELPS_FOR, MORE_WEB_1], b2: [{ ...CONTRA_1, text: " \n " }, UNDOC_1, CONTRA_1], b3: [{ ...UNDOC_1, kind: "SOMETHING" as never }, HELPS_AGAINST] }),
  answerWith({ b1: Array.from({ length: 24 }, (_, at) => suggestion(`s-${at}`, at < 21 ? "NEEDS_MORE_WEB" : "CONTRADICTING")), b2: [CONTRA_1, CONTRA_1, UNDOC_1] }),
  answerWith({ b2: [HELPS_FOR] }),
  answerWith({})
];

const STORED: StoredAsk = Object.freeze({
  runId: ROOT, releaseKey: "made-up-release", registerVersion: 5, questionLine: Q,
  askContract: Object.freeze({ decision_scope: "A made-up decision scope", steering_presets: ["made-up-preset"], steering_annotations: [], carry_on_to_report: true }),
  askerId: `owner:${OWNER}`, sessionId: SESSION, callerScope: "ASKER", asOf: new Date("2026-11-05T08:00:00.000Z"), askerRiskTier: "standard",
  tierSource: "ASKER", tierProvenanceRef: "made-up:asker", compositionBudgetTier: "medium", planTier: "premium",
  depthParams: Object.freeze({ depth: 2 }), argumentLanguageTag: "en", argumentLanguageName: "English", contentEncrypted: true
}) as StoredAsk;
const STORED_PLUS_DEPTH_2 = STORED;
const STORED_FREE: StoredAsk = Object.freeze({ ...STORED, planTier: "free", compositionBudgetTier: "low", tierSource: "MACHINE_DEFAULT",
  tierProvenanceRef: "machine:plan-tier-free", depthParams: Object.freeze({ depth: 1 }) }) as StoredAsk;

const DUE: CarryOnDue = Object.freeze({ runId: ROOT, ownerRef: OWNER, userId: USER, identitySessionId: SESSION, begunAt: NOW });

function setOf(count: number, extra: Partial<StoredStartPathSet> = {}): StoredStartPathSet {
  return Object.freeze({
    runId: ROOT, source: "MENU", width: Math.max(count, 3), chosenBy: "AIS", carryOnToReport: true, menu: null,
    paths: Array.from({ length: count }, (_, at) => Object.freeze({ pathId: `b${at + 1}` as PathId, pathNo: at + 1, author: "AI_SUGGESTION",
      title: `Made-up path ${at + 1}`, question: `Made-up question ${at + 1}?`, viewpoints: [], ownWords: [] })), ...extra
  }) as StoredStartPathSet;
}

/** A room look: the admission, the dig's share (`digMicros`) and the person's windows, each [scope, limitMicros, usedMicros]. */
function room(admission: "START" | "WAIT", digMicros: number, windows: ReadonlyArray<readonly [RoomWindowUse["scope"], number, number]>): CarryOnDigRoom {
  return Object.freeze({
    preview: { admission: admission === "START" ? { kind: "START" } : { kind: "WAIT", waitsUntil: NOW, scope: "PERSON_DAY" },
      personUses: windows.map(([scope, limitMicros, usedMicros]) => ({ scope, limitMicros, usedMicros, resetsAt: NOW, closeBasisPoints: 9_000 })) } as never,
    digMicros
  });
}

type Fake = Readonly<{
  set?: StoredStartPathSet | null; stored?: StoredAsk | null; answer?: Answer | null;
  plan?: Readonly<{ free: boolean; reserveInsideMicros: number }>;
  report?: (call: number) => Readonly<{ public: boolean; closings: number; waiting: number }>;
  roomForDig?: (call: number, ask: AskRequest) => CarryOnDigRoom | null;
  askPreflight?: (call: number) => Readonly<{ allowed: true }> | Readonly<{ allowed: false; code: string }>;
  askAsOwner?: (call: number, ask: AskRequest) => AskAsOwnerOutcome;
  write?: (call: number) => WriteReportAsOwnerOutcome;
  claim?: readonly CarryOnDue[]; begun?: readonly CarryOnDue[];
}>;

const ACCEPTED: AskAsOwnerOutcome = Object.freeze({ kind: "ACCEPTED", status: 202, body: Object.freeze({ run_ref: "made-up-dig", status: "QUEUED" }) });

/** Fake ports recording every call, in order; each port answers what `fake` says (or a plain default). */
function fakePorts(fake: Fake = {}) {
  const calls: string[] = [];
  const asks: AskRequest[] = [];
  const lines: string[] = [];
  const done: string[] = [];
  const count = new Map<string, number>();
  const next = (name: string): number => { const n = (count.get(name) ?? 0) + 1; count.set(name, n); calls.push(name); return n; };
  const ports: CarryOnPorts = {
    marks: {
      readStartPaths: async () => { next("readStartPaths"); return fake.set === undefined ? setOf(5) : fake.set; },
      claimCarryOnDue: async () => { next("claimCarryOnDue"); return fake.claim ?? []; },
      readCarryOnBegun: async () => { next("readCarryOnBegun"); return fake.begun ?? []; },
      recordCarryOnDone: async (runId) => { next("recordCarryOnDone"); done.push(runId); return "RECORDED"; }
    },
    readStoredAsk: async () => { next("readStoredAsk"); return fake.stored === undefined ? STORED : fake.stored; },
    readAnswer: async () => { next("readAnswer"); return fake.answer === undefined ? FIVE : fake.answer; },
    planOf: async () => { next("planOf"); return fake.plan ?? { free: false, reserveInsideMicros: 40_000 }; },
    roomForDig: async (_asker, ask) => { const n = next("roomForDig"); return fake.roomForDig === undefined ? null : fake.roomForDig(n, ask); },
    askPreflight: async () => { const n = next("askPreflight"); return fake.askPreflight === undefined ? { allowed: true } : fake.askPreflight(n); },
    askAsOwner: async (asker, ask) => {
      const n = next("askAsOwner");
      expect(asker.owner).toEqual({ ownerRef: OWNER, userId: USER });
      asks.push(ask);
      return fake.askAsOwner === undefined ? ACCEPTED : fake.askAsOwner(n, ask);
    },
    readReport: async () => { const n = next("readReport"); return fake.report === undefined ? { public: false, closings: 0, waiting: 0 } : fake.report(n); },
    writeReportAsOwner: async () => {
      const n = next("writeReportAsOwner");
      return fake.write === undefined ? { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 } : fake.write(n);
    },
    log: (line) => { lines.push(line); }
  };
  const named = (name: string) => calls.filter((call) => call === name).length;
  return { ports, calls, asks, lines, done, named };
}

const thrown = (code: string) => { throw new TypedDomainError(code, code); };

describe("topDigSuggestionOf: the first suggestion the map shows on a path", () => {
  it("is the first of the map's group order, each group in the answer's order; null when the path offers none", () => {
    expect(topDigSuggestionOf(answerWith({ b2: [UNDOC_1, CONTRA_1] }), "b2")).toEqual(CONTRA_1);   // the map shows CONTRADICTING first
    expect(topDigSuggestionOf(answerWith({ b2: [{ ...HELPS_FOR, text: "   " }, HELPS_AGAINST] }), "b2")).toEqual(HELPS_AGAINST);
    expect(topDigSuggestionOf(answerWith({ b2: [] }), "b2")).toBeNull();
    expect(topDigSuggestionOf(answerWith({ b1: [CONTRA_1] }), "b2")).toBeNull();
  });

  it("agrees with the map's own reading of every fixture, path by path (drift pin with apps/ui/lib/v4/suggestions.ts)", () => {
    for (const answer of FIXTURES) for (const ref of ["b1", "b2", "b3"] as const) {
      expect(topDigSuggestionOf(answer, ref)).toEqual(suggestionsByKind(pathSuggestionsOf(answer, ref))[0]?.suggestions[0] ?? null);
    }
  });
});

describe("carryOnDigPicksOf: one dig per path, in order, skipping a failed path and a path with nothing to dig", () => {
  it("five paths, a failed one, Free's one dig in all, none anywhere", () => {
    expect(carryOnDigPicksOf({ answer: FIVE, pathIds: B1_B5, free: false }).map((pick) => pick.pathId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(carryOnDigPicksOf({ answer: FIVE_B3_FAILED, pathIds: B1_B5, free: false }).map((pick) => pick.pathId)).toEqual(["b1", "b2", "b4", "b5"]);
    expect(carryOnDigPicksOf({ answer: THREE_B1_NONE, pathIds: ["b1", "b2", "b3"], free: true }).map((pick) => pick.pathId)).toEqual(["b2"]);
    expect(carryOnDigPicksOf({ answer: NONE_ANYWHERE, pathIds: B1_B5, free: false })).toEqual([]);
    expect(carryOnDigPicksOf({ answer: FIVE, pathIds: ["b2"], free: false })).toEqual([{ pathId: "b2", suggestion: suggestion("c-2", "CONTRADICTING") }]);
  });
});

describe("carryOnHasRoom: the dig's share fits what the smallest window has left beyond the reserve", () => {
  // Made-up micros: the dig's share 25_000 (room's second argument, its digMicros), reserve 40_000.
  it("measures every window, the month without the reserve again, less what this pass already started", () => {
    expect(carryOnHasRoom({ room: room("START", 25_000, [["PERSON_DAY", 200_000, 135_000]]), reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(true);
    expect(carryOnHasRoom({ room: room("START", 25_000, [["PERSON_DAY", 200_000, 135_001]]), reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(false);
    expect(carryOnHasRoom({ room: room("START", 25_000, [["PERSON_DAY", 300_000, 135_000]]), reserveInsideMicros: 40_000, startedMicros: 100_000 })).toBe(true);
    expect(carryOnHasRoom({ room: room("START", 25_000, [["PERSON_WEEK", 900_000, 0], ["PERSON_DAY", 200_000, 135_001]]), reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(false); // the smallest window decides
    expect(carryOnHasRoom({ room: room("START", 25_000, [["PERSON_MONTH", 160_000, 135_000]]), reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(true); // the month's limit already keeps the reserve out
    expect(carryOnHasRoom({ room: room("WAIT", 25_000, []), reserveInsideMicros: 0, startedMicros: 0 })).toBe(false);
    expect(carryOnHasRoom({ room: room("START", 25_000, []), reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(true);           // no personal limit
    expect(carryOnHasRoom({ room: null, reserveInsideMicros: 40_000, startedMicros: 0 })).toBe(true);                                  // no room composed
  });
});

describe("carryOnDigAskOf and carryOnDigQuestionLine: the dig's ask, as the person's own one-pick dig", () => {
  it("is the first debate's settings, a quick dig of one path with the suggestion as its pick, and nothing a first debate carries", () => {
    const ask = carryOnDigAskOf({ stored: STORED_PLUS_DEPTH_2, rootRunId: ROOT, pick: { pathId: "b2", suggestion: CONTRA_1 }, free: false, now: NOW });
    expect(AskRequestSchema.parse(ask)).toEqual(ask);
    expect(ask.parent).toEqual({ parent_run_id: ROOT, places: ["path:b2"], mode: "quick",
      picks: [{ kind: "CONTRADICTING", suggestion_id: CONTRA_1.suggestion_id, place: "path:b2", text: CONTRA_1.text }] });
    expect(["carry_on_to_report", "start_paths", "start_check", "purpose_lines"].filter((key) => key in ask)).toEqual([]);
    expect({ plan: ask.plan_tier, budget: ask.composition_budget_tier, depth: ask.depth_params, risk: ask.risk_tier, scope: ask.decision_scope,
      presets: ask.steering_presets, annotations: ask.steering_annotations, asOf: ask.as_of }).toEqual({ plan: "premium", budget: "medium",
      depth: { depth: 2 }, risk: "standard", scope: "A made-up decision scope", presets: ["made-up-preset"], annotations: [], asOf: NOW.toISOString() });
    expect(carryOnDigOf(ask)).toEqual({ parentRunId: ROOT, pathId: "b2" });
    expect(carryOnDigAskOf({ stored: STORED_FREE, rootRunId: ROOT, pick: { pathId: "b1", suggestion: UNDOC_1 }, free: true, now: NOW }).parent?.mode).toBe("quick");
  });

  it("writes the page's own off-English one-pick form: the pick, a blank line, the first question in quotes", () => {
    expect(carryOnDigQuestionLine("Who checked the cost figures?", "Should we build new reactors?")).toBe("Who checked the cost figures?\n\n“Should we build new reactors?”");
    expect(carryOnDigQuestionLine(CONTRA_1.text, Q)).toBe(digQuestion({ kind: "picks", path: null, picks: [suggestionPick("b2", CONTRA_1)] }, Q, CATALOG, "ro")); // the page's off-English form
  });

  it("cuts only the first question, by code points with an ellipsis, so the whole line fits the limit", () => {
    const limit = askQuestionMaxBytes();
    const long = "€".repeat(Math.floor((limit - 10) / 3)) + "x".repeat((limit - 10) % 3);
    expect(Buffer.byteLength(long, "utf8")).toBe(limit - 10);
    const line = carryOnDigQuestionLine(CONTRA_1.text, long);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(limit);
    expect(line.endsWith("…”")).toBe(true);
    expect(line.startsWith(`${CONTRA_1.text}\n\n“€`)).toBe(true);
  });

  it("the press-anyway wait is the runner's own give-up wait", () => {
    expect(CARRY_ON_PRESS_ANYWAY_MS).toBe(INVESTIGATION_CLOSE_DEFAULTS.giveUpWaitingMs);
    expect(CARRY_ON_TICK_LIMITS).toEqual({ due: 10, begun: 50 });
  });

  it("acts as the person, on the first debate's own identity session, with no live sign-in", () => {
    expect(carryOnAskerOf(DUE)).toEqual({ ownerRef: OWNER, userId: USER, session: { asker_id: `owner:${OWNER}`, session_id: SESSION,
      caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false } });
  });
});

describe("runCarryOnToReport: one dig into each path's top suggestion, through the person's own dig step", () => {
  it("does nothing for a debate without the box, without a set, with a dig's set or without its stored ask", async () => {
    for (const fake of [{ set: null }, { set: setOf(3, { carryOnToReport: false }) }, { set: setOf(1, { source: "DIG_PICKS" }) }, { stored: null }] as const) {
      const { ports, named } = fakePorts(fake);
      expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "NOT_ASKED" });
      expect(named("askAsOwner")).toBe(0);
    }
  });

  it("does nothing when the person pressed \"Write my report\" first", async () => {
    const { ports, named } = fakePorts({ report: () => ({ public: false, closings: 1, waiting: 0 }) });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "PERSON_PRESSED" });
    expect(named("askAsOwner")).toBe(0);
  });

  it("five paths: five digs, each through the room, the pre-flight and the person's own dig step, in that order", async () => {
    const { ports, calls, asks } = fakePorts();
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 5, stop: null });
    expect(calls.filter((call) => ["roomForDig", "askPreflight", "askAsOwner"].includes(call)))
      .toEqual(Array.from({ length: 5 }, () => ["roomForDig", "askPreflight", "askAsOwner"]).flat());
    // Each dig is the person's own dig of its path's top suggestion, and its principal carries that path (carryOnDigOf).
    expect(asks.map((ask) => carryOnDigOf(ask))).toEqual(B1_B5.map((pathId) => ({ parentRunId: ROOT, pathId })));
    expect(asks.map((ask) => ask.parent?.picks?.[0]?.suggestion_id)).toEqual(B1_B5.map((_, at) => `c-${at + 1}`));
  });

  it("stops when the day's share runs out: room for two (each check less what this pass started), then NO_ROOM", async () => {
    const { ports, lines } = fakePorts({ roomForDig: () => room("START", 25_000, [["PERSON_DAY", 200_000, 110_000]]) });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 2, stop: "NO_ROOM" });
    expect(lines.some((line) => line.includes("NO_ROOM"))).toBe(true);
  });

  it("counts a dig's whole share (estimate, web part and updates: 40_000) as started: 60_000 left beyond the reserve starts one dig, not two", async () => {
    const { ports } = fakePorts({ roomForDig: () => room("START", 40_000, [["PERSON_DAY", 200_000, 100_000]]) });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 1, stop: "NO_ROOM" });
  });

  it("a refused pre-flight stops it (its code logged, no id)", async () => {
    const { ports, lines } = fakePorts({ askPreflight: (n) => n === 2 ? { allowed: false, code: "ADMISSION_RATE_LIMITED" } : { allowed: true } });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 1, stop: "REFUSED" });
    const refused = lines.filter((line) => line.includes("ADMISSION_RATE_LIMITED"));
    expect(refused).toHaveLength(1);
    for (const id of [ROOT, OWNER, USER, SESSION]) expect(lines.join("\n")).not.toContain(id);
  });

  it("a refusal the dig step answers stops it too", async () => {
    const { ports, lines } = fakePorts({ askAsOwner: (n) => n === 3
      ? { kind: "REFUSED", status: 409, body: { error: "DIG_TOO_DEEP", message: "DIG_TOO_DEEP" } } : ACCEPTED });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 2, stop: "REFUSED" });
    expect(lines.some((line) => line.includes("DIG_TOO_DEEP"))).toBe(true);
  });

  it("no room composed: every dig starts with no room check", async () => {
    const { ports } = fakePorts({ roomForDig: () => null });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 5, stop: null });
  });

  it("a question already waiting refuses the first dig's room look (ASK_ALREADY_WAITING, logged)", async () => {
    const { ports, lines, named } = fakePorts({ roomForDig: () => thrown("ASK_ALREADY_WAITING") });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 0, stop: "REFUSED" });
    expect(lines.some((line) => line.includes("ASK_ALREADY_WAITING"))).toBe(true);
    expect(named("askAsOwner")).toBe(0);
  });

  it("an account that is gone stops it (OWNER_GONE)", async () => {
    for (const code of ["CARRY_ON_DIG_OWNER_GONE", "RUN_OWNER_INVALID"]) {
      const { ports } = fakePorts({ askAsOwner: () => thrown(code) });
      expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 0, stop: "OWNER_GONE" });
    }
  });

  it("a path already dug is skipped and the pass goes on; any other throw is REFUSED", async () => {
    const taken = fakePorts({ set: setOf(3), askAsOwner: (n) => n === 1 ? thrown("CARRY_ON_DIG_TAKEN") : ACCEPTED });
    expect(await runCarryOnToReport(DUE, taken.ports)).toEqual({ kind: "STARTED", digs: 2, stop: null });
    expect(taken.lines.some((line) => line.includes("CARRY_ON_DIG_TAKEN"))).toBe(true);
    const other = fakePorts({ askAsOwner: () => { throw new Error("made-up database failure"); } });
    expect(await runCarryOnToReport(DUE, other.ports)).toEqual({ kind: "STARTED", digs: 0, stop: "REFUSED" });
    expect(other.lines.join("\n")).not.toContain("made-up database failure");
    // The route's own refusal thrown from submit (an AskRefusal: an Error carrying its code), e.g. the site's day reached.
    const site = fakePorts({ askAsOwner: (n) => n === 2 ? (() => { throw Object.assign(new Error("made-up words"), { code: "DAILY_COST_ENVELOPE_REACHED" }); })() : ACCEPTED });
    expect(await runCarryOnToReport(DUE, site.ports)).toEqual({ kind: "STARTED", digs: 1, stop: "REFUSED" });
    expect(site.lines.some((line) => line.includes("DAILY_COST_ENVELOPE_REACHED"))).toBe(true);
    expect(site.lines.join("\n")).not.toContain("made-up words");
  });

  it("a dig the room puts in line waits like the person's own; no further dig starts", async () => {
    const { ports } = fakePorts({ askAsOwner: (n) => n === 2 ? { kind: "ACCEPTED", status: 202, body: { run_ref: "made-up", status: "WAITING" } } : ACCEPTED });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 2, stop: "NO_ROOM" });
  });

  it("Free: one dig in all, on the first path that has one", async () => {
    const { ports, asks } = fakePorts({ set: setOf(3), answer: answerWith({ b1: [UNDOC_1], b2: [MORE_WEB_1], b3: [CONTRA_1] }, branchesFixture(3)),
      stored: STORED_FREE, plan: { free: true, reserveInsideMicros: 0 } });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 1, stop: null });
    expect(asks.map((ask) => [ask.parent?.places, ask.parent?.mode])).toEqual([[["path:b1"], "quick"]]);
  });

  it("a dig whose question reads as a person in crisis is never sent (REFUSED, nothing asked)", async () => {
    const crisis = suggestion("crisis-1", "CONTRADICTING", null, "I want to kill myself");
    const { ports, named } = fakePorts({ answer: answerWith({ b1: [crisis] }, branchesFixture(1)), set: setOf(1) });
    expect(await runCarryOnToReport(DUE, ports)).toEqual({ kind: "STARTED", digs: 0, stop: "REFUSED" });
    expect(named("askAsOwner")).toBe(0);
  });

  it("the one principal with a carry-on is built inside the carry-on ports, in buildApi, never by a route", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/api/src/index.ts"), "utf8");
    const at = [...source.matchAll(/carryOn:/gu)].map((match) => match.index ?? 0);
    expect(at).toHaveLength(1);
    const ports = source.indexOf("const carryOnPorts");
    expect(ports).toBeGreaterThan(source.indexOf("export function buildApi("));
    expect(at[0]).toBeGreaterThan(ports);
    expect(source.slice(ports, at[0])).not.toMatch(/\n {2}api\.(get|post)\(/u);
    expect(source.slice(at[0]! - 200, at[0]! + 80)).toContain("carryOnDigOf(ask)");
  });
});

describe("pressCarryOnReport: \"Write my report\" once, through the person's own report step", () => {
  const press = (fake: Fake, now = NOW) => { const made = fakePorts(fake); return { made, result: pressCarryOnReport(DUE, made.ports, now) }; };

  it("waits while digs run; presses when none does", async () => {
    const waiting = press({ report: () => ({ public: false, closings: 0, waiting: 2 }) });
    expect(await waiting.result).toBe("WAITING_FOR_DIGS");
    expect(waiting.made.named("writeReportAsOwner")).toBe(0);
    expect(waiting.made.done).toEqual([]);
    const ready = press({});
    expect(await ready.result).toBe("PRESSED");
    expect(ready.made.named("writeReportAsOwner")).toBe(1);
    expect(ready.made.done).toEqual([ROOT]);
  });

  it("a refusal is the end (NOT_PRESSED, DONE); a throw records nothing and is pressed again at the next tick", async () => {
    const refused = press({ write: () => ({ kind: "REFUSED", status: 404, code: "RUN_NOT_FOUND" }) });
    expect(await refused.result).toBe("NOT_PRESSED");
    expect(refused.made.done).toEqual([ROOT]);
    expect(refused.made.lines.some((line) => line.includes("RUN_NOT_FOUND"))).toBe(true);
    const race = fakePorts({ write: () => thrown("INVESTIGATION_CLOSE_RACE") });
    await expect(pressCarryOnReport(DUE, race.ports, NOW)).rejects.toMatchObject({ code: "INVESTIGATION_CLOSE_RACE" });
    expect(race.done).toEqual([]);
    const ticks = fakePorts({ begun: [DUE], write: (n) => n === 1 ? thrown("INVESTIGATION_CLOSE_RACE") : { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 } });
    expect(await carryOnTick(ticks.ports, NOW)).toEqual({ begun: 0, digs: 0, pressed: 0, waiting: 0 });
    expect(ticks.done).toEqual([]);
    expect(await carryOnTick(ticks.ports, NOW)).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(ticks.done).toEqual([ROOT]);
  });

  it("the person pressed first: nothing pressed, DONE (private and public)", async () => {
    for (const isPublic of [false, true]) {
      const pressed = press({ report: () => ({ public: isPublic, closings: 1, waiting: 0 }) });
      expect(await pressed.result).toBe("PERSON_PRESSED");
      expect(pressed.made.named("writeReportAsOwner")).toBe(0);
      expect(pressed.made.done).toEqual([ROOT]);
    }
  });

  it("a public debate still going, or whose report waits for the reset, is tried again at the next tick", async () => {
    for (const code of ["PUBLIC_DEBATE_ONGOING", "PUBLIC_DEBATE_WAITS_FOR_RESET"]) {
      const ongoing = press({ report: () => ({ public: true, closings: 0, waiting: 0 }), write: () => ({ kind: "REFUSED", status: 409, code }) });
      expect(await ongoing.result).toBe("WAITING_FOR_DIGS");
      expect(ongoing.made.done).toEqual([]);
    }
  });

  it("six hours after BEGUN: a private debate is pressed anyway; a public one still going is given up", async () => {
    const late = new Date(NOW.getTime() + CARRY_ON_PRESS_ANYWAY_MS);
    const privately = press({ report: () => ({ public: false, closings: 0, waiting: 1 }) }, late);
    expect(await privately.result).toBe("PRESSED");
    expect(privately.made.done).toEqual([ROOT]);
    const publicly = press({ report: () => ({ public: true, closings: 0, waiting: 0 }), write: () => ({ kind: "REFUSED", status: 409, code: "PUBLIC_DEBATE_ONGOING" }) }, late);
    expect(await publicly.result).toBe("NOT_PRESSED");
    expect(publicly.made.done).toEqual([ROOT]);
  });
});

describe("carryOnTick: claims what is due, digs, presses, one line of counts", () => {
  it("nothing due: zeros, and one line", async () => {
    const { ports, lines } = fakePorts();
    expect(await carryOnTick(ports, NOW)).toEqual({ begun: 0, digs: 0, pressed: 0, waiting: 0 });
    expect(lines).toEqual([JSON.stringify({ event: "api.carry_on.tick", begun: 0, digs: 0, pressed: 0, waiting: 0 })]);
  });

  it("a run claimed in the tick digs, then is pressed once in it, even when it is read again as BEGUN", async () => {
    const { ports, lines, named } = fakePorts({ claim: [DUE], begun: [DUE], report: (n) => ({ public: false, closings: 0, waiting: n === 1 ? 0 : 5 }) });
    expect(await carryOnTick(ports, NOW)).toEqual({ begun: 1, digs: 5, pressed: 0, waiting: 1 });
    expect(named("readReport")).toBe(2);
    expect(named("writeReportAsOwner")).toBe(0);
    expect(lines.at(-1)).toBe(JSON.stringify({ event: "api.carry_on.tick", begun: 1, digs: 5, pressed: 0, waiting: 1 }));
  });

  it("no suggestion on any path: no dig, and the report pressed in the same tick", async () => {
    const { ports, named, done } = fakePorts({ claim: [DUE], answer: NONE_ANYWHERE });
    expect(await carryOnTick(ports, NOW)).toEqual({ begun: 1, digs: 0, pressed: 1, waiting: 0 });
    expect(named("askAsOwner")).toBe(0);
    expect(named("writeReportAsOwner")).toBe(1);
    expect(done).toEqual([ROOT]);
  });

  it("a dig pass that throws still presses its report", async () => {
    const { ports, done } = fakePorts({ claim: [DUE], set: setOf(2) });
    ports.readAnswer = async () => { throw new Error("made-up read failure"); };
    expect(await carryOnTick(ports, NOW)).toEqual({ begun: 1, digs: 0, pressed: 1, waiting: 0 });
    expect(done).toEqual([ROOT]);
  });

  // Task 56e (owner answer 11: "If the account is no longer active, the digs stop and the report is still written"): the person's own
  // report step writes only for an active account, so a pass that meets OWNER_GONE leaves the run BEGUN, and the BEGUN reader (which
  // reads only active accounts) hands it to the press once the account is active again.
  it("an account that stops being active during the pass: no more digs, no press in that tick, the report once it is active again", async () => {
    for (const code of ["CARRY_ON_DIG_OWNER_GONE", "RUN_OWNER_INVALID"]) {
      const { ports, named, done } = fakePorts({ claim: [DUE], askAsOwner: (n) => n === 3 ? thrown(code) : ACCEPTED });
      expect(await carryOnTick(ports, NOW)).toEqual({ begun: 1, digs: 2, pressed: 0, waiting: 0 });
      expect(named("askAsOwner")).toBe(3);
      expect(named("writeReportAsOwner")).toBe(0);
      expect(done).toEqual([]);
      // Active again: the next tick claims nothing new, and the BEGUN reader's run is pressed once, with no further dig.
      const later = fakePorts({ begun: [DUE] });
      expect(await carryOnTick(later.ports, NOW)).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
      expect(later.named("askAsOwner")).toBe(0);
      expect(later.named("writeReportAsOwner")).toBe(1);
      expect(later.done).toEqual([ROOT]);
    }
    // Read again as BEGUN in the same tick (its account active), it is pressed in that tick, once.
    const { ports, named, done } = fakePorts({ claim: [DUE], begun: [DUE], askAsOwner: () => thrown("CARRY_ON_DIG_OWNER_GONE") });
    expect(await carryOnTick(ports, NOW)).toEqual({ begun: 1, digs: 0, pressed: 1, waiting: 0 });
    expect(named("writeReportAsOwner")).toBe(1);
    expect(done).toEqual([ROOT]);
  });
});

describe("AskRoom.digShareMicros: the dig's share as the room read shows it (estimate, web part, updates)", () => {
  const roomWith = () => new AskRoom({ dailyCeilingMicros: 1_100_000, closeBasisPoints: 9_000, waitingLinePerPerson: 1,
    estimator: { estimateMicros: async () => 25_000, digWebPartMicros: () => 10_000, digUpdatesPartMicros: () => 5_000 } } as never);
  const question = (planTier: "free" | "premium", dig: boolean): RoomQuestion => ({ access: { ownerRef: OWNER, legacyAskerId: null },
    settingsClass: { planTier } as never, ...(dig ? { dig: { parentRunId: ROOT, mode: "quick" as const, picks: 1, level: 1 } } : {}) });
  it("adds the web part and the updates to the estimate on a dig; Free never searches", async () => {
    expect(await roomWith().digShareMicros(question("premium", true))).toBe(40_000);
    expect(await roomWith().digShareMicros(question("free", true))).toBe(30_000);
    expect(await roomWith().digShareMicros(question("premium", false))).toBe(25_000);
  });
});

describe("recordCarryOnDueSafely: the runner's story stage marks a ticked first debate DUE, and never rejects", () => {
  it("no store: NONE; the store's answer otherwise; a failure is FAILED with one line holding the code only", async () => {
    const lines: string[] = [];
    expect(await recordCarryOnDueSafely(undefined, ROOT, (line) => { lines.push(line); })).toBe("NONE");
    expect(await recordCarryOnDueSafely({ recordCarryOnDue: async () => "RECORDED" }, ROOT, (line) => { lines.push(line); })).toBe("RECORDED");
    expect(await recordCarryOnDueSafely({ recordCarryOnDue: async () => "NOT_ASKED" }, ROOT, (line) => { lines.push(line); })).toBe("NOT_ASKED");
    expect(lines).toEqual([]);
    expect(await recordCarryOnDueSafely({ recordCarryOnDue: async () => { throw new TypedDomainError("MADE_UP_DUE_FAILURE", "made-up words"); } }, ROOT,
      (line) => { lines.push(line); })).toBe("FAILED");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("MADE_UP_DUE_FAILURE");
    expect(lines[0]).not.toContain(ROOT);
    expect(lines[0]).not.toContain("made-up words");
  });
});

describe("the carry-on's ports in buildApi: a private debate's closings are 0133's, every one the person pressed", () => {
  // Task 56 review: the brief's readReport is "private: 0133's closings" ("a closing already there → the person pressed first: DONE,
  // PERSON_PRESSED, nothing pressed"), so the carry-on never starts a second version. Here the person pressed "Write my report" before
  // the tick and their report FAILED: the closing is still there, so the carry-on digs nothing and presses nothing (their own button
  // writes it again); counting only the closings that did not fail would dig every path and write a version they did not ask for.
  it("a person's own closing whose report FAILED still means the person pressed: no dig, no new version, DONE", async () => {
    const INVESTIGATION = "ffffffff-6666-4666-8666-666666666666";
    const at = (minute: number) => `2026-11-05T08:${String(minute).padStart(2, "0")}:00.000000+00:00`;
    const failed: InvestigationReportEntry = { report_version: 1, report_id: "99999999-7777-4777-8777-777777777777", outcome: "FAILED", story_outcome: null,
      failure_code: "ANSWER_FAILED", covered_rewrite_id: null, covered_rewrite_recorded_at: null, ladder_step: 1, left_out: 0, spent_micros: 0,
      recorded_at: at(40), content: null };
    const read: InvestigationReportsOwnerRead = {
      investigation: { investigation_id: INVESTIGATION, root_run_id: ROOT, state: "closed", opened_at: at(0), last_activity_at: at(30), closed_at: at(30),
        report_version: 1, members: [{ run_id: ROOT, parent_run_id: null, places: [], mode: null, joined_at: at(0) }],
        closings: [{ report_version: 1, closed_at: at(30), reopened_at: null, report_ref: null, report_written_at: null }] },
      waiting: 0, reports: [failed]
    };
    const calls: string[] = [];
    const done: string[] = [];
    const reports: InvestigationReportPorts = {
      reports: { read: async (ownerRef, runId) => ownerRef === OWNER && runId === ROOT ? read : null },
      investigations: {
        open: async () => { calls.push("open"); return INVESTIGATION; },
        close: async () => { calls.push("close"); return { outcome: "CLOSED", reportVersion: 2 }; },
        reopen: async () => { calls.push("reopen"); return "REOPENED"; }
      },
      owns: async (ownerRef, runId) => ownerRef === OWNER && runId === ROOT,
      openRootContent: async (_root, items) => items.map(() => null)
    };
    let claims = 0;
    const api = buildApi({
      application: {
        readStoredAsk: async () => { calls.push("readStoredAsk"); return STORED; },
        readRunAnswer: async () => { calls.push("readAnswer"); return FIVE; }
      } as unknown as AskApplication,
      allowedOrigin: TEST_APP_ORIGIN,
      investigationReports: reports,
      // Task 56b's counts are composed (as main.ts composes them): a private debate asks none.
      ownClosings: { countPublicReports: async () => { calls.push("countPublicReports"); return { own: 0, all: 0 }; } },
      carryOn: {
        claimCarryOnDue: async () => (claims++ === 0 ? [DUE] : []),
        readCarryOnBegun: async () => [],
        recordCarryOnDone: async (runId) => { done.push(runId); return "RECORDED"; },
        readStartPaths: async () => setOf(3)
      }
    });
    try {
      expect(await api.carryOnTick()).toEqual({ begun: 1, digs: 0, pressed: 0, waiting: 0 });
      expect(calls).toEqual([]);
      expect(done).toEqual([ROOT]);
    } finally {
      await api.close();
    }
  });
});
