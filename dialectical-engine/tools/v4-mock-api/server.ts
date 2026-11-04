/*
 * A small local MOCK of the DebateAIRO V3 API, so the website (apps/ui) can be click-tested without the real API,
 * database or AIs. Start it from the repository's dialectical-engine folder (see README.md):
 *
 *   node_modules/.bin/tsx tools/v4-mock-api/server.ts
 *
 * Every JSON body it sends is checked against the website's own contract schemas (packages/contract) — all seeded
 * bodies once at startup (a bad shape stops the start), and every body again just before it is sent.
 *
 * Plan 2026-10-30-dig-model-revision.md, task W2-7: it also plays the new dig model (rewritten paths, the verdict on the
 * person's point of view, a dig trail three levels down; rewrite-seed.ts) and the money rule (a debate paused at the month
 * wall with Continue, a usage read that borrowed from tomorrow, a room where new starts wait for the reset).
 *
 * stdout: one JSON line at start ({"mock":"ready",...}) and one JSON line per posted ask ({"mock":"ask",...}).
 * stderr: one line per request ("[mock] GET /v1/session 200"); MOCK_QUIET=1 hides them.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSeed, SEED_NODE_IDS, type StoryStatus } from "./seed.js";
import {
  answerDraftProblems, answerIndexDraftProblems, contractOrDraft, DraftAskParentSchema, DraftInvestigationSchema, DraftMonthPauseSchema, DraftNodeWebSchema,
  DraftRunQuotaUsedSchema,
  DraftRoomPartSchema, DraftRoomQueryPartSchema, DraftRunContinuedSchema, DraftRunContinueRefusedSchema, DraftRunContinueRequestSchema,
  DraftRunStartedAtSchema, DraftUsageBorrowsSchema, splitAsk, splitRoomQuery, stripAnswer, stripNode, stripRoom,
  stripAnswerIndex, stripRun, stripUsage, type DraftAskParent
} from "./web-draft.js";
import {
  ARABIC_RUN, borrowNotice, DEEPEST_DIG, DIG_ANSWERS, DIG_RUNS, mainAnswerAt, monthPause, PATH_REWRITES, reportVersionBody, RUN_PAUSED, SEEDED_NEW_DIGS
} from "./rewrite-seed.js";
import type { WebCase } from "./web-seed.js";
import { paymentRegionsOf } from "../../packages/kernel/src/payment-regions.js";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, priceCurrencyFor } from "../../packages/register/src/billing-plans.js";
import { contributionOf, PUBLIC_MODES, PUBLIC_REF, seedPublicDebates, writtenReport, type PublicMode } from "./public-seed.js";

// ---------------------------------------------------------------------------------------------------------------
// Find the repository (no machine path is written here): MOCK_ENGINE_DIR, else the dialectical-engine folder this file
// sits in (tools/v4-mock-api), else the folder we were started from or one of its parents.
// ---------------------------------------------------------------------------------------------------------------

const CONTRACT_ENTRY = join("packages", "contract", "generated", "client.ts");
const FIXTURE_ENTRY = join("apps", "ui", "lib", "v3", "storyFixture.ts");

function isEngine(dir: string): boolean {
  return existsSync(join(dir, CONTRACT_ENTRY)) && existsSync(join(dir, FIXTURE_ENTRY));
}

function findEngineDir(): string {
  const override = process.env.MOCK_ENGINE_DIR?.trim();
  if (override !== undefined && override.length > 0) {
    const dir = resolve(override);
    if (isEngine(dir)) return dir;
    throw new Error(`MOCK_ENGINE_DIR_INVALID: ${dir} holds no ${CONTRACT_ENTRY} and ${FIXTURE_ENTRY}`);
  }
  const home = resolve(import.meta.dirname, "..", "..");
  if (isEngine(home)) return home;
  let dir = process.cwd();
  for (;;) {
    if (isEngine(dir)) return dir;
    if (isEngine(join(dir, "dialectical-engine"))) return join(dir, "dialectical-engine");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "MOCK_ENGINE_DIR_NOT_FOUND: start the mock from inside the repository's dialectical-engine folder, or set MOCK_ENGINE_DIR to it"
  );
}

const ENGINE_DIR = findEngineDir();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(join(ENGINE_DIR, CONTRACT_ENTRY)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = await import(pathToFileURL(join(ENGINE_DIR, FIXTURE_ENTRY)).href);
const seed = createSeed(F);

// ---------------------------------------------------------------------------------------------------------------
// Settings (environment, and live via GET /__mock/set)
// ---------------------------------------------------------------------------------------------------------------

/**
 * BLOCKED is a mock switch: a FULL day with the DRAFT reserve word BLOCKED ("blocked until {reset}"); today's contract reads FULL.
 * WAIT_RESET (W2-7, money rule): a FULL day whose new starts wait for the reset (`new_starts`); running work goes on.
 */
const ROOM_MODES = ["FITS", "CLOSE", "FULL", "ALREADY_WAITING", "BLOCKED", "WAIT_RESET"] as const;
type RoomMode = (typeof ROOM_MODES)[number];
const ASK_MODES = ["AUTO", "ACCEPT", "WAITING", "ALREADY_WAITING", "LANGUAGE_CHOICE"] as const;
type AskMode = (typeof ASK_MODES)[number];
/** The person's plan: Plus (paid, the web step runs) or Free (never searches). */
const PLAN_MODES = ["PLUS", "FREE"] as const;
type PlanMode = (typeof PLAN_MODES)[number];
/** W2-7 (money rule): the usage read as today (NORMAL), or after running work borrowed from tomorrow (BORROWED). */
const USAGE_MODES = ["NORMAL", "BORROWED"] as const;
type UsageMode = (typeof USAGE_MODES)[number];
/** W2-7 (money rule): the paused debate waits for the month reset (UNTIL_RESET), or the new month has started (CAN_CONTINUE). */
const PAUSE_MODES = ["UNTIL_RESET", "CAN_CONTINUE"] as const;
type PauseMode = (typeof PAUSE_MODES)[number];
/** Owner review 3 Nov 2026: how a NEW dig ends — it finishes (default), fails once its run time is up, or pauses at the month wall. */
const DIG_END_MODES = ["SETTLE", "FAIL", "PAUSE"] as const;
type DigEndMode = (typeof DIG_END_MODES)[number];

function choice<T extends string>(name: string, raw: string | undefined, allowed: readonly T[], fallback: T): T {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toUpperCase();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${name}_INVALID: ${raw} (allowed: ${allowed.join(", ")})`);
}

function seconds(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}_INVALID: ${raw}`);
  return value;
}

const PORT = (() => {
  const raw = process.env.MOCK_PORT?.trim() || "4011";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`MOCK_PORT_INVALID: ${raw}`);
  return port;
})();
const HOST = "127.0.0.1";
const RUN_SECONDS = seconds("MOCK_RUN_SECONDS", 25);
const STORY_WRITING_SECONDS = seconds("MOCK_STORY_WRITING_SECONDS", 40);
const POSTED_STORY_SECONDS = seconds("MOCK_POSTED_STORY_SECONDS", 10);
/** dig-f1 (V4 screen review, 3 Nov 2026): how long the first debate's main answer is still being rewritten after the mock starts. */
const MAIN_ANSWER_SECONDS = seconds("MOCK_MAIN_ANSWER_SECONDS", 45);
const QUIET = process.env.MOCK_QUIET === "1";
let roomMode: RoomMode = choice("MOCK_ROOM", process.env.MOCK_ROOM, ROOM_MODES, "FITS");
let askMode: AskMode = choice("MOCK_ASK", process.env.MOCK_ASK, ASK_MODES, "AUTO");
let planMode: PlanMode = choice("MOCK_PLAN", process.env.MOCK_PLAN, PLAN_MODES, "PLUS");
let usageMode: UsageMode = choice("MOCK_USAGE", process.env.MOCK_USAGE, USAGE_MODES, "NORMAL");
/** Decision 33: the mock's review of a public debate, in memory. One dig to take out and any first-snapshot text to replace. */
type MockReview = { hidden: boolean; removed: boolean; corrected: Map<string, string>; log: { revision: number; action: string; piece_kind: null; actor_staff_id: string; at: string }[] };
const mockReview = new Map<string, MockReview>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFlags: any[] = [];
const MOCK_REVIEWER = "d1000000-0000-4000-8000-000000000001";
const MOCK_DIG = "d2000000-0000-4000-8000-000000000001";
const MOCK_POINTERS = ["/question", "/story_short/headline", "/story_short/summary"];
const mockAt = (value: unknown, pointer: string): string => String(pointer.split("/").slice(1).reduce((at: any, step) => at?.[step], value)); // eslint-disable-line @typescript-eslint/no-explicit-any
function mockReviewStep(row: MockReview, action: string, pointer?: string, text?: string): string | null {
  if (action === "HIDE") row.hidden = true;
  else if (action === "REPUBLISH") row.hidden = false;
  else if (!row.hidden) return "PUBLIC_REVIEW_NOT_HIDDEN";
  else if (action === "REMOVE_DIG") row.removed = true;
  else if (action === "CORRECT") row.corrected.set(pointer!, text!);
  row.log.push({ revision: row.log.length + 1, action, piece_kind: null, actor_staff_id: MOCK_REVIEWER, at: new Date().toISOString() });
  return null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReviewed(debate: any): any {
  const row = mockReview.get(String(debate.public_ref));
  if (row === undefined || !row.log.some((entry) => entry.action === "CORRECT" || entry.action === "REMOVE_DIG")) return debate;
  const copy = structuredClone(debate);
  for (const [pointer, text] of row.corrected) {
    const steps = pointer.split("/").slice(1);
    const parent = steps.slice(0, -1).reduce((at: any, step) => at[step], copy); // eslint-disable-line @typescript-eslint/no-explicit-any
    parent[steps.at(-1)!] = text;
  }
  if (row.removed) { delete copy.contributions; delete copy.main_answer_update; delete copy.reports; }
  return { ...copy, changed_after_review: true };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReviewPage(ref: string, debate: any, row: MockReview) {
  const contribution = (debate.contributions ?? [])[0];
  return { publication_ref: ref, hidden: row.hidden, revision: row.log.length, question: String(debate.question), published_at: String(debate.published_at), snapshot_unreadable: false,
    snapshot: MOCK_POINTERS.map((pointer) => ({ pointer, original: mockAt(debate, pointer), corrected: row.corrected.get(pointer) ?? null })),
    digs: contribution === undefined ? [] : [{ dig_run_id: MOCK_DIG, parent_run_id: MOCK_DIG, position_ref: contribution.position_ref, contributor: contribution.contributor, contributed_at: `${String(contribution.contributed_on)}T10:00:00.000Z`, removed: row.removed }],
    updates: contribution === undefined ? [] : [{ update_id: MOCK_DIG, update_seq: 1, dig_run_id: MOCK_DIG, kind: "PATH", position_ref: contribution.position_ref, recorded_at: `${String(contribution.contributed_on)}T10:00:00.000Z`,
      state: row.removed ? "ITS_DIG_REMOVED" : "ON_THE_PAGE", before: null, pieces: [{ pointer: "/line", original: String(contribution.line), corrected: null }] }],
    reports: [], log: row.log };
}

/** Decision 13: what a public page's dig or report waits on (the click-test's switch), and how long the mock's check and report writer take. */
let publicMode: PublicMode = choice("MOCK_PUBLIC", process.env.MOCK_PUBLIC, PUBLIC_MODES, "OPEN");
let sessionOut = false;
const PUBLIC_CHECK_MS = 10_000;
const PUBLIC_REPORT_MS = 8_000;
/** W4-4: how long the mock's readers take over a page added to researched. */
const RESEARCHED_READ_MS = 6_000;
let pauseMode: PauseMode = choice("MOCK_PAUSE", process.env.MOCK_PAUSE, PAUSE_MODES, "UNTIL_RESET");
let digEndMode: DigEndMode = choice("MOCK_DIG", process.env.MOCK_DIG, DIG_END_MODES, "SETTLE");
/** Owner review 3 Nov: what a dig that fails under `dig=FAIL` stored ("stopped partway", one of the website's fixed sentences). */
const DIG_FAILED_REASON = "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED";
/** R22 W5-1: whether the next report written comes out finished (OK) or failed (FAIL), and how long the mock's writer takes. */
const REPORT_MODES = ["OK", "FAIL"] as const;
type ReportMode = (typeof REPORT_MODES)[number];
let reportMode: ReportMode = choice("MOCK_REPORT", process.env.MOCK_REPORT, REPORT_MODES, "OK");
const REPORT_WRITING_MS = seconds("MOCK_REPORT_SECONDS", 8) * 1000;

// ---------------------------------------------------------------------------------------------------------------
// The seeded world
// ---------------------------------------------------------------------------------------------------------------

const T0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const RUN_SETTLED = "11111111-1111-4111-8111-111111111111";
const RUN_RUNNING = "22222222-2222-4222-8222-222222222222";
const RUN_WAITING = "33333333-3333-4333-8333-333333333333";
const RUN_FAILED = "44444444-4444-4444-8444-444444444444";
const RUN_STORY_WRITING = "55555555-5555-4555-8555-555555555555";
const RUN_FREE = "66666666-6666-4666-8666-666666666666";
const RUN_SEARCH_FAILED = "77777777-7777-4777-8777-777777777777";
const RUN_DIG = "88888888-8888-4888-8888-888888888888";
const ANSWER_SETTLED = "aaaa1111-1111-4111-8111-111111111111";
const ANSWER_STORY_WRITING = "aaaa5555-5555-4555-8555-555555555555";
const ANSWER_FREE = "aaaa6666-6666-4666-8666-666666666666";
const ANSWER_SEARCH_FAILED = "aaaa7777-7777-4777-8777-777777777777";
const ANSWER_DIG = "aaaa8888-8888-4888-8888-888888888888";
/** A code lib/v3/runFailure.ts knows: "the AIs chosen were not available" (MODELS_UNAVAILABLE). */
const FAILED_REASON = "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM";

const SESSION = Object.freeze({
  asker_id: "owner:0f6c2b1e-3a4d-4c5e-9f70-112233445566",
  session_id: "5e551011-7c3a-4f2b-9d1e-0a1b2c3d4e5f",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
});
const ENGLISH = Object.freeze({ tag: "en", name: "English" });
/** The premium roster, read from the contract (the same ids the fixture's makers use). */
const MODELS: readonly string[] = Object.freeze([...C.PLAN_TIER_ROSTERS.premium]);

type MockRun = {
  runRef: string;
  question: string;
  seq: number;
  /** Absent: never settles (stays RUNNING, or WAITING/FAILED below). */
  settleAt?: number;
  waiting?: boolean;
  failedReason?: string;
  answerId?: string;
  /** The story reads WRITING until this moment, READY after it. */
  storyReadyAt?: number;
  /** The draft web case its answer carries (web-seed.ts). */
  web?: WebCase;
  /** The question's language, when it is not English (the Arabic scene). */
  language?: Readonly<{ tag: string; name: string }>;
  /** W2-7 (money rule): its planned calls and searches paused at the month wall, until Continue (POST /v1/runs/{id}/continue). */
  monthPaused?: boolean;
  /**
   * Draft (journey-d2, and the shelf's cards, owner's screen review 3 Nov): when it started; absent while it waits to
   * start. One time for both draft reads: the run read's `started_at` (DraftRunStartedAtSchema) and the answer list's
   * `started_at` on open runs (DraftShelfRowPartSchema).
   */
  startedAt?: number;
  /** Owner review 3 Nov: a run with `failedReason` fails only from this moment (a new dig under `dig=FAIL`); absent: failed from the start. */
  failsAt?: number;
  /** Owner review 3 Nov (draft field): what a FAILED run took from the person's quota, on its draft view only. */
  quotaUsed?: "NONE" | "SOME";
  /** Owner review 3 Nov: a dig paused under `dig=PAUSE` finishes its run time once Continue is pressed. */
  settlesAfterContinue?: boolean;
  /** dig-f1: its main answer is still being rewritten until this moment, then has its newest version (rewrite-seed.ts mainAnswerAt). */
  mainAnswerReadyAt?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer?: any;
};

const runs = new Map<string, MockRun>();
const runsByAnswer = new Map<string, MockRun>();
let nextSeq = 100;

function addRun(run: MockRun): MockRun {
  runs.set(run.runRef, run);
  if (run.answerId !== undefined) runsByAnswer.set(run.answerId, run);
  return run;
}

/** A run's answer as it stands now: dig-f1, the first debate's main answer is rewritten a little after the mock starts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function answerNow(run: MockRun, now = Date.now()): any {
  return run.mainAnswerReadyAt === undefined ? run.answer : { ...run.answer, main_answer: mainAnswerAt(now, run.mainAnswerReadyAt) };
}

function settledRun(input: Readonly<{
  runRef: string; answerId: string; question: string; seq: number; askedAt: number; settleAt: number; storyReadyAt: number;
  web: WebCase;
  /** W3-4: a dig's own part (its parent, places, level, picks); else the seeded one, if any. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dig?: any;
}>): MockRun {
  const dig = input.dig ?? DIG_ANSWERS[input.runRef];
  return addRun({
    runRef: input.runRef,
    question: input.question,
    seq: input.seq,
    settleAt: input.settleAt,
    startedAt: input.askedAt,
    answerId: input.answerId,
    storyReadyAt: input.storyReadyAt,
    web: input.web,
    answer: {
      ...seed.answer({
        answerId: input.answerId,
        runRef: input.runRef,
        question: input.question,
        askedAt: iso(input.askedAt),
        servedAt: iso(input.settleAt),
        web: input.web
      }),
      // W2-7: the seeded digs' rewrites of their parents' paths, and a dig's own part (rewrite-seed.ts).
      ...(PATH_REWRITES[input.runRef] === undefined ? {} : { path_rewrites: PATH_REWRITES[input.runRef] }),
      ...(dig === undefined ? {} : { dig })
    }
  });
}

settledRun({
  runRef: RUN_SETTLED, answerId: ANSWER_SETTLED, seq: 2,
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: Date.parse("2026-10-27T15:12:00.000Z"), settleAt: Date.parse("2026-10-27T15:40:00.000Z"), storyReadyAt: 0, web: "PAID"
}).mainAnswerReadyAt = T0 + MAIN_ANSWER_SECONDS * 1000;
addRun({ runRef: RUN_RUNNING, seq: 5, startedAt: T0 - 4 * 60_000, question: "Is a four-day work week good for productivity and for workers?" });
addRun({ runRef: RUN_WAITING, seq: 3, waiting: true, question: "Should my town close the old centre to cars at weekends?" });
addRun({
  runRef: RUN_FAILED, seq: 1, failedReason: FAILED_REASON,
  // Owner review 3 Nov (draft): the models were gone when it was claimed, so it never began and nothing was taken.
  quotaUsed: "NONE",
  question: "Will AI tutors replace homework help from teachers within five years?"
});
settledRun({
  runRef: RUN_STORY_WRITING, answerId: ANSWER_STORY_WRITING, seq: 4,
  question: "Should Romania build two new reactors at Cernavodă, or spend the money on wind, solar and batteries?",
  askedAt: T0 - 30 * 60_000, settleAt: T0 - 60_000, storyReadyAt: T0 + STORY_WRITING_SECONDS * 1000, web: "PAID"
});
// Perplexity plan W1-7: a debate asked on the Free plan (never searched), a paid debate whose search failed, and a dig of
// the first debate (its link is in the account memory below, and it reopened that debate's investigation).
settledRun({
  runRef: RUN_FREE, answerId: ANSWER_FREE, seq: 6, web: "FREE",
  question: "Should Europe bet on new nuclear power or on renewables? (asked on the Free plan)",
  askedAt: Date.parse("2026-10-26T09:00:00.000Z"), settleAt: Date.parse("2026-10-26T09:20:00.000Z"), storyReadyAt: 0
});
settledRun({
  runRef: RUN_SEARCH_FAILED, answerId: ANSWER_SEARCH_FAILED, seq: 7, web: "FAILED",
  question: "Should my country keep its old nuclear reactors running for another twenty years?",
  askedAt: Date.parse("2026-10-28T11:00:00.000Z"), settleAt: Date.parse("2026-10-28T11:25:00.000Z"), storyReadyAt: 0
});
settledRun({
  runRef: RUN_DIG, answerId: ANSWER_DIG, seq: 8, web: "PAID",
  question: "Does this hold up, and when? Batteries and long-distance power lines can already cover multi-day lulls in wind and sun at an acceptable cost.",
  askedAt: Date.parse("2026-10-29T08:00:00.000Z"), settleAt: Date.parse("2026-10-29T08:12:00.000Z"), storyReadyAt: 0
});
// W2-7 (dig model): a dig with the person's own view (level 1), a dig of the dig (level 2) and a dig of that (level 3),
// whose rewrite is still writing; and a debate paused at the month wall (money rule).
for (const dig of SEEDED_NEW_DIGS) {
  settledRun({
    runRef: dig.runRef, answerId: dig.answerId, seq: dig.seq, web: "PAID", question: dig.question,
    askedAt: Date.parse(dig.askedAt), settleAt: Date.parse(dig.settledAt), storyReadyAt: 0
  });
}
addRun({ runRef: RUN_PAUSED, seq: 12, monthPaused: true, startedAt: T0 - 40 * 60_000, question: "Should my region build a hydrogen pipeline or more power lines?" });
// W3-4: a dig at the deepest level (10), whose map offers no dig anywhere (rewrite-seed.ts DEEPEST_DIG).
settledRun({
  runRef: DEEPEST_DIG.runRef, answerId: DEEPEST_DIG.answerId, seq: DEEPEST_DIG.seq, web: "PAID", question: DEEPEST_DIG.question,
  askedAt: Date.parse(DEEPEST_DIG.askedAt), settleAt: Date.parse(DEEPEST_DIG.settledAt), storyReadyAt: 0, dig: DEEPEST_DIG.dig
});
// The click-test's Arabic debate: its question and its report are in Arabic, so the page offers Print in place of the PDF.
settledRun({
  runRef: ARABIC_RUN.runRef, answerId: ARABIC_RUN.answerId, seq: 40, web: "PAID", question: ARABIC_RUN.question,
  askedAt: Date.parse("2026-10-30T09:00:00.000Z"), settleAt: Date.parse("2026-10-30T09:20:00.000Z"), storyReadyAt: 0
}).language = Object.freeze({ tag: "ar", name: "Arabic" });

// Decision 13: the public debates, and a digger's three digs on one, each in one state of its check (seeded under the first public debate's path).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const publicDebates = new Map<string, any>(seedPublicDebates().map((debate) => [debate.public_ref as string, structuredClone(debate)]));
const SEEDED_CONTRIBUTION_DIGS = [
  { state: "CHECKING", runRef: "c1000000-0000-4000-8000-000000000001", answerId: "aaaac100-0000-4000-8000-000000000001" },
  { state: "ON_THE_PAGE", runRef: "c1000000-0000-4000-8000-000000000002", answerId: "aaaac100-0000-4000-8000-000000000002" },
  { state: "KEPT_PRIVATE", runRef: "c1000000-0000-4000-8000-000000000003", answerId: "aaaac100-0000-4000-8000-000000000003" },
  { state: "REMOVED_AFTER_REVIEW", runRef: "c1000000-0000-4000-8000-000000000004", answerId: "aaaac100-0000-4000-8000-000000000004" }
] as const;
for (const [at, seeded] of SEEDED_CONTRIBUTION_DIGS.entries()) {
  const run = settledRun({
    runRef: seeded.runRef, answerId: seeded.answerId, seq: 30 + at, web: "PAID",
    question: `Look deeper into this part of the answer: free fares for everyone. (a dig on a public debate, ${seeded.state})`,
    askedAt: Date.parse("2026-10-29T08:00:00.000Z"), settleAt: Date.parse("2026-10-29T08:12:00.000Z"), storyReadyAt: 0,
    dig: { parent_run_id: RUN_SETTLED, position_ref: "n-mix", places: ["path:n-mix"], level: 1,
      picks: [{ kind: "OWN_VIEW", place: "path:n-mix", text: "Small towns behave differently.", by: "PERSON_OWN_VIEW" }], rewrite: null }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (run.answer as any).contribution = { public_ref: PUBLIC_REF, state: seeded.state, rewrite: seeded.state === "CHECKING" || seeded.state === "REMOVED_AFTER_REVIEW" ? null
    : { line: "Free fares for everyone: partly held, by this dig's own reading.", summary: "The dig looked at small towns, and the picture stayed the same.", fate: "PARTLY_HELD", what_changed: ["Small towns are now covered."] } };
}

type RunState = "QUEUED" | "WAITING" | "CLAIMED" | "RUNNING" | "HOLDING" | "SETTLED" | "FAILED";

function stateOf(run: MockRun, now = Date.now()): RunState {
  if (run.failedReason !== undefined && (run.failsAt === undefined || now >= run.failsAt)) return "FAILED";
  if (run.waiting === true) return "WAITING";
  if (run.settleAt === undefined || now < run.settleAt) return "RUNNING";
  return "SETTLED";
}

/** A waiting question's expected start: 20 minutes after the mock started, rolled forward once that has passed. */
function waitsUntil(now = Date.now()): string {
  const planned = T0 + 20 * 60_000;
  return iso(planned > now ? planned : now + 20 * 60_000);
}

function nextUtcMidnight(now = Date.now()): string {
  const date = new Date(now);
  return iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function storyStatusOf(run: MockRun, now = Date.now()): StoryStatus {
  return run.storyReadyAt !== undefined && now >= run.storyReadyAt ? "READY" : "WRITING";
}

// ---------------------------------------------------------------------------------------------------------------
// The account memory of migration 0131 (reading level, last visits, dig links), kept in memory
// ---------------------------------------------------------------------------------------------------------------

type DigLink = { parent_run_id: string; child_run_id: string; places: string[]; mode: "quick" | "thorough"; created_at: string };

let readingLevel: string | null = null;
const lastVisits = new Map<string, { seen_at: string; items: Record<string, string> }>();
const digLinks: DigLink[] = [];

// ---------------------------------------------------------------------------------------------------------------
// Investigations (DRAFT, web-draft.ts): a debate and all its digs. Open until the person asks for the report; a dig on a
// closed one reopens it. While any is open, the person's ONE reserve is kept (the room read's "reserve kept").
// ---------------------------------------------------------------------------------------------------------------

type Investigation = {
  investigation_id: string;
  root_run_id: string;
  state: "OPEN" | "CLOSED";
  digs: DigLink[];
  closings: Array<{ report_version: number; closed_at: string; report: "WRITING" | "READY" | "FAILED"; answer_id: string | null }>;
};
const investigations = new Map<string, Investigation>();
/** Run id → the root run of its investigation. */
const investigationOfRun = new Map<string, string>();

function openInvestigation(rootRunId: string, closings: Investigation["closings"] = [], state: Investigation["state"] = "OPEN"): Investigation {
  const investigation: Investigation = { investigation_id: randomUUID(), root_run_id: rootRunId, state, digs: [], closings };
  investigations.set(rootRunId, investigation);
  investigationOfRun.set(rootRunId, rootRunId);
  return investigation;
}

function investigationOf(runId: string): Investigation | undefined {
  const root = investigationOfRun.get(runId);
  return root === undefined ? undefined : investigations.get(root);
}

/** GET /v1/runs/{id}/dig-links: the link this debate was dug by (or null), and the digs made from it, oldest first. */
function digLinksOf(runId: string) {
  const copy = (record: DigLink) => ({ ...record, places: [...record.places] });
  const parent = digLinks.find((record) => record.child_run_id === runId);
  return { parent: parent === undefined ? null : copy(parent), children: digLinks.filter((record) => record.parent_run_id === runId).map(copy) };
}

const anyInvestigationOpen = () => [...investigations.values()].some((investigation) => investigation.state === "OPEN");

/**
 * Records a dig's link (0131's identity.record_dig_link) and puts the dig in its parent's investigation, reopening it
 * if it was closed. The same link again is a no-op; a child already dug from another parent is a CONFLICT.
 */
function linkDig(parentRunId: string, link: Readonly<{ child_run_id: string; places: readonly string[]; mode: "quick" | "thorough" }>, now = Date.now()): "RECORDED" | "NOT_OWNED" | "CONFLICT" {
  if (!runs.has(parentRunId) || !runs.has(link.child_run_id)) return "NOT_OWNED";
  const earlier = digLinks.find((record) => record.child_run_id === link.child_run_id);
  if (earlier !== undefined) return earlier.parent_run_id === parentRunId ? "RECORDED" : "CONFLICT";
  const record: DigLink = { parent_run_id: parentRunId, child_run_id: link.child_run_id, places: [...link.places], mode: link.mode, created_at: iso(now) };
  digLinks.push(record);
  const investigation = investigationOf(parentRunId) ?? openInvestigation(parentRunId);
  const placeholder = investigations.get(link.child_run_id);
  // A dig asked as a new question first had an investigation of its own; it joins its parent's.
  if (placeholder !== undefined && placeholder.digs.length === 0 && placeholder.closings.length === 0) investigations.delete(link.child_run_id);
  investigation.digs.push(record);
  investigation.state = "OPEN";
  investigationOfRun.set(link.child_run_id, investigation.root_run_id);
  return "RECORDED";
}

// Seeded: run 1111 was closed once (report version 1) and reopened by its dig 8888; 5555 and 7777 are open; the Free
// debate 6666 was closed. Run 4444 (failed) has none; 2222 and 3333 (running, waiting) are open.
openInvestigation(RUN_SETTLED, [{ report_version: 1, closed_at: "2026-10-28T09:00:00.000Z", report: "READY", answer_id: ANSWER_SETTLED }], "CLOSED");
linkDig(RUN_SETTLED, { child_run_id: RUN_DIG, places: ["p:n-renew-storage"], mode: "quick" }, Date.parse("2026-10-29T08:00:00.000Z"));
openInvestigation(RUN_STORY_WRITING);
openInvestigation(RUN_FREE, [{ report_version: 1, closed_at: "2026-10-26T10:00:00.000Z", report: "READY", answer_id: ANSWER_FREE }], "CLOSED");
openInvestigation(RUN_SEARCH_FAILED);
openInvestigation(RUN_RUNNING);
openInvestigation(RUN_WAITING);
openInvestigation(RUN_PAUSED);
openInvestigation(ARABIC_RUN.runRef, [{ report_version: 1, closed_at: "2026-10-30T10:00:00.000Z", report: "READY", answer_id: ARABIC_RUN.answerId }], "CLOSED");
// W2-7: the dig trail. Each dig joins the first debate's investigation (a dig of a dig too).
for (const dig of SEEDED_NEW_DIGS) {
  const answer = DIG_ANSWERS[dig.runRef]!;
  linkDig(answer.parent_run_id, { child_run_id: dig.runRef, places: answer.places, mode: dig.mode }, Date.parse(dig.askedAt));
}
linkDig(DEEPEST_DIG.dig.parent_run_id, { child_run_id: DEEPEST_DIG.runRef, places: DEEPEST_DIG.dig.places, mode: DEEPEST_DIG.mode },
  Date.parse(DEEPEST_DIG.askedAt));

/** W3-4: a debate's dig level, as its answer says it (0: a first debate, or a run with no answer yet). */
function digLevelOfRun(runRef: string): number {
  const level = runs.get(runRef)?.answer?.dig?.level;
  return typeof level === "number" ? level : 0;
}

/**
 * W3-4: a new dig's own part (AnswerDigSchema), from the ask's parent: the path its places name first (or none), its
 * level, and each pick with who wrote it — the person's own view, or a suggestion as written or edited (compared with the
 * text the parent's answer suggested).
 */
function digPartOf(parent: DraftAskParent, level: number) {
  const parentAnswer = runs.get(parent.parent_run_id)?.answer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggested = new Map<string, string>((parentAnswer?.web?.paths ?? []).flatMap((path: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    path.suggestions.map((item: any) => [item.suggestion_id, item.text] as [string, string])));
  const pathPlace = parent.places.find((place) => place.startsWith("path:"));
  return {
    parent_run_id: parent.parent_run_id,
    position_ref: pathPlace === undefined ? null : pathPlace.slice("path:".length).replace(/#\d+$/u, ""),
    places: [...parent.places],
    level,
    picks: (parent.picks ?? []).map((pick) => ({
      kind: pick.kind,
      place: pick.place,
      text: pick.text,
      by: pick.kind === "OWN_VIEW" ? "PERSON_OWN_VIEW"
        : suggested.get(pick.suggestion_id ?? "") === pick.text ? "AI_SUGGESTION" : "PERSON_EDITED"
    })),
    rewrite: null
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------------------------------------------

function runProjection(run: MockRun, now = Date.now()) {
  const state = stateOf(run, now);
  return {
    run_ref: run.runRef,
    question_line: run.question,
    state,
    terminal_reason: state === "FAILED" ? run.failedReason ?? null : null,
    hold_until: null,
    argument_language: run.language ?? ENGLISH,
    waits_until: state === "WAITING" ? waitsUntil(now) : null,
    waits_for: null,
    // W2-7 (money rule, draft): paused at the month wall until the next month; Continue once it has started.
    ...(run.monthPaused === true && state === "RUNNING" ? { month_pause: monthPause(nextUtcMonth(now), pauseMode === "CAN_CONTINUE") } : {}),
    // Owner review 3 Nov (draft, web-draft.ts DraftRunQuotaUsedSchema): what a failed run took from the quota.
    ...(state === "FAILED" && run.quotaUsed !== undefined ? { quota_used: run.quotaUsed } : {})
  };
}

/**
 * Draft (owner's screen review, journey-d2 / journey-f16 / wait-f7): the run read with when the question started, so the
 * waiting card can say "Started 14:31" on any device. Sent on the draft view, and on the normal view only once the
 * contract's own (strict) RunProjection schema accepts it; never while the question waits to start.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withStartedAt(body: any, run: MockRun, draftView: boolean, now = Date.now()) {
  if (run.startedAt === undefined || stateOf(run, now) === "WAITING") return body;
  const full = { ...body, started_at: iso(run.startedAt) };
  return draftView || C.RunProjectionSchema.safeParse(full).success ? full : body;
}

function nextUtcMonth(now = Date.now()): string {
  const date = new Date(now);
  return iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function storyRead(run: MockRun, now = Date.now()) {
  const status = storyStatusOf(run, now);
  const writtenAt = iso(Math.max(run.storyReadyAt ?? 0, run.settleAt ?? 0));
  return seed.story(run.answerId!, status, writtenAt);
}

/**
 * The shelf's draft parts of a row (web-draft.ts DraftShelfRowPartSchema, owner's screen review 3 Nov): the debate it was
 * dug from (the account's dig link; null for a first question), and for an answer the seeded map's four-shade bar and
 * whether its map changed since the person last opened it (here: no last visit recorded yet).
 */
const SEEDED_MAP_BAR = Object.freeze({ sure: 4, sure_for_case: 5, still_argued: 2, didnt_hold: 1 });
function shelfPart(run: MockRun, served: boolean, now: number) {
  const dugFrom = digLinks.find((record) => record.child_run_id === run.runRef)?.parent_run_id ?? null;
  if (served) return { map_bar: { ...SEEDED_MAP_BAR }, changed_since_visit: !lastVisits.has(run.runRef), dug_from: dugFrom };
  const working = !["WAITING", "FAILED"].includes(stateOf(run, now));
  return { ...(working && run.startedAt !== undefined ? { started_at: iso(run.startedAt) } : {}), dug_from: dugFrom };
}

function answerIndex(limit: number, offset: number, now = Date.now()) {
  const all = [...runs.values()].sort((left, right) => right.seq - left.seq);
  const served = all.filter((run) => stateOf(run, now) === "SETTLED" && run.answer !== undefined);
  const open = all.filter((run) => stateOf(run, now) !== "SETTLED");
  return {
    items: served.slice(offset, offset + limit).map((run) => ({
      answer_id: run.answerId!,
      run_ref: run.runRef,
      answer_version: 1,
      question_line: run.question,
      verdict_state: run.answer.verdict_state,
      abstention: null,
      serve_state: "COMPOSED",
      staleness_state: "FRESH",
      builds_on_previous: false,
      created_at_sequence: run.seq,
      models: [...MODELS],
      ...shelfPart(run, true, now)
    })),
    open_runs: open.map((run) => {
      const projection = runProjection(run, now);
      return {
        run_ref: run.runRef,
        question_line: run.question,
        state: projection.state,
        terminal_reason: projection.terminal_reason,
        created_at_sequence: run.seq,
        ...shelfPart(run, false, now)
      };
    }),
    limit,
    offset,
    total: served.length
  };
}

/** A dig's share of today (draft, Q14), in steps of 5: what the mock says a quick look and a thorough dig take. */
const DIG_SHARE_PERCENT = Object.freeze({ quick: 20, thorough: 35 });
/** W2-7 (money rule, draft): what the mock says a new question takes of today. */
const START_SHARE_PERCENT = 15;

function roomRead(
  mode: RoomMode, now = Date.now(), plan_id: PlanMode = planMode, reserveKept = anyInvestigationOpen(),
  digMode: "quick" | "thorough" | null = null
) {
  // Draft words: the person's one reserve is KEPT while an investigation is open; BLOCKED is a FULL day until its reset.
  const reserve = mode === "BLOCKED" ? { reserve: "BLOCKED" as const } : reserveKept ? { reserve: "KEPT" as const } : {};
  // W2-7 (money rule): a read for a new question carries its estimate too, as a share of today.
  const share = digMode === null ? { start_share_percent: START_SHARE_PERCENT } : { dig_share_percent: DIG_SHARE_PERCENT[digMode] };
  const plan = {
    plan_id,
    // shape_settings is left out on purpose: the contract allows only `true` or absent, and absent means "off".
    answer_words: { short: 300, standard: 700, detailed: 1500 },
    length_settings: true,
    settings_version: 20,
    ...reserve,
    ...share
  };
  // One builder per room word (a table: the source law wants a default and an exhaustive fall-through in any switch).
  const rooms: Readonly<Record<RoomMode, () => Record<string, unknown>>> = {
    FITS: () => ({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, ...plan }),
    CLOSE: () => ({ room: "CLOSE", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan }),
    FULL: () => ({ room: "FULL", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan }),
    ALREADY_WAITING: () => ({ room: "ALREADY_WAITING", scope: "PERSON_DAY", resets_at: waitsUntil(now), waiting_run_ref: RUN_WAITING, ...plan }),
    // Draft: a closing found no credits left, so everything waits for the day's limit to reset.
    BLOCKED: () => ({ room: "FULL", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan }),
    // W2-7 (money rule, draft): the day is used up (perhaps by running work that borrowed); new starts wait for its reset.
    WAIT_RESET: () => ({
      room: "FULL", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan, new_starts: "BLOCKED_UNTIL_RESET"
    })
  };
  return rooms[mode]();
}

function billingUsage(now = Date.now(), plan_id: PlanMode = planMode, usage: UsageMode = usageMode) {
  const date = new Date(now);
  const daysToMonday = ((8 - date.getUTCDay()) % 7) || 7;
  // W2-7 (money rule, draft): BORROWED is the day after the running debate went past it: 104% used, 4% of tomorrow's taken.
  const borrowed = usage === "BORROWED";
  return {
    plan_id,
    windows: [
      { scope: "PERSON_DAY", percent: borrowed ? 104 : 14, resets_at: nextUtcMidnight(now) },
      { scope: "PERSON_WEEK", percent: borrowed ? 47 : 31, resets_at: iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToMonday)) },
      { scope: "PERSON_MONTH", percent: borrowed ? 16 : 9, resets_at: nextUtcMonth(now) }
    ],
    ...(borrowed ? { borrowed: [borrowNotice(RUN_RUNNING, nextUtcMidnight(now))] } : {})
  };
}

/** The register's default plans (packages/register/src/billing-plans.ts), in US dollars, for no place yet. */
const BILLING_PLANS = Object.freeze({
  currency: "USD",
  place: { country: null, postal_code: null, status: "COUNTRY_NEEDED" },
  tax: null,
  plans: [
    { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: null, allowance_vs_plus: "0.04" },
    { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: null, allowance_vs_plus: "1" },
    { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, total_price: null, allowance_vs_plus: "4" },
    { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, total_price: null, allowance_vs_plus: "30" }
  ]
});

/**
 * The mock's tax table: each EU country's standard VAT rate (2026), which a Romanian seller charges every EU consumer
 * through the OSS, and Texas's sales tax by ZIP; none elsewhere, where the seller is not registered.
 */
const MOCK_TAX_RATES: Readonly<Record<string, Readonly<{ name: string; basisPoints: number }>>> = {
  AT: { name: "USt.", basisPoints: 2_000 }, BE: { name: "VAT", basisPoints: 2_100 }, BG: { name: "VAT", basisPoints: 2_000 },
  CY: { name: "VAT", basisPoints: 1_900 }, CZ: { name: "DPH", basisPoints: 2_100 }, DE: { name: "MwSt.", basisPoints: 1_900 },
  DK: { name: "moms", basisPoints: 2_500 }, EE: { name: "VAT", basisPoints: 2_400 }, ES: { name: "IVA", basisPoints: 2_100 },
  FI: { name: "ALV", basisPoints: 2_550 }, FR: { name: "TVA", basisPoints: 2_000 }, GR: { name: "ΦΠΑ", basisPoints: 2_400 },
  HR: { name: "PDV", basisPoints: 2_500 }, HU: { name: "ÁFA", basisPoints: 2_700 }, IE: { name: "VAT", basisPoints: 2_300 },
  IT: { name: "IVA", basisPoints: 2_200 }, LT: { name: "PVM", basisPoints: 2_100 }, LU: { name: "TVA", basisPoints: 1_700 },
  LV: { name: "PVN", basisPoints: 2_100 }, MT: { name: "VAT", basisPoints: 1_800 }, NL: { name: "btw", basisPoints: 2_100 },
  PL: { name: "VAT", basisPoints: 2_300 }, PT: { name: "IVA", basisPoints: 2_300 }, RO: { name: "VAT", basisPoints: 2_100 },
  SE: { name: "moms", basisPoints: 2_500 }, SI: { name: "DDV", basisPoints: 2_200 }, SK: { name: "DPH", basisPoints: 2_300 }
};

/** The register's own plans row, for the currency each country pays in (RO: lei; the euro countries: euro; else dollars). */
const REGISTER_PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

/**
 * Terms §12, as GET /v1/billing/plans answers: the plans priced for the place asked (?country=, and in the US and
 * Canada ?postal_code=, checked by the kernel's own format as the API does), in that place's currency, each with its
 * total including that place's tax, and no price at all until the place is known.
 */
function billingPlans(countryParam: string | null, postalParam: string | null) {
  const country = (countryParam ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country)) return BILLING_PLANS;
  const currency = priceCurrencyFor(REGISTER_PLANS, country);
  const unpriced = (status: "POSTAL_CODE_NEEDED" | "POSTAL_CODE_INVALID") =>
    ({ ...BILLING_PLANS, currency, place: { country, postal_code: null, status } });
  let postalCode: string | null = null;
  if (country === "US" || country === "CA") {
    const typed = (postalParam ?? "").toUpperCase().replace(/[\s-]+/gu, "");
    if (typed === "") return unpriced("POSTAL_CODE_NEEDED");
    if (paymentRegionsOf({ country, postalCode: typed, region: null }).kind === "POSTCODE_INVALID") return unpriced("POSTAL_CODE_INVALID");
    postalCode = country === "US" ? typed.slice(0, 5) : `${typed.slice(0, 3)} ${typed.slice(3)}`;
  }
  const rate = country === "US"
    ? (postalCode !== null && /^7[5-9]/u.test(postalCode) ? { name: "Sales tax", basisPoints: 625 } : undefined)
    : MOCK_TAX_RATES[country];
  const basisPoints = rate?.basisPoints ?? 0;
  const withTax = (net: string) => {
    const cents = Math.round(Number(net) * 100);
    return ((cents + Math.floor((cents * basisPoints + 5_000) / 10_000)) / 100).toFixed(2);
  };
  return {
    currency,
    place: { country, postal_code: postalCode, status: "PRICED" },
    tax: {
      country, tax_name: rate?.name ?? (country === "US" ? "Sales tax" : "VAT"), tax_rate_bp: basisPoints,
      tax_status: rate === undefined ? "NOT_REGISTERED" : "TAXABLE"
    },
    plans: BILLING_PLANS.plans.map((plan) => ({ ...plan, total_price: withTax(plan.net_prices[currency]) }))
  };
}

const DEPLOYMENT = Object.freeze({
  register: { register_version: 20, rows: [] },
  scorecards: [],
  model_ledger: [],
  fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
});

function inspection(answer: { answer_id: string; composed_text: { segment_id: string }[] }) {
  return {
    answer_id: answer.answer_id,
    answer_version: 1,
    conformance: {
      outcome: "PASS",
      coverage_mode: "EXHAUSTIVE",
      segment_results: answer.composed_text.map((segment) => ({ segment_id: segment.segment_id, state: "JUDGED", conforms: true }))
    },
    segment_suppressions: [],
    shadow_suppressions: []
  };
}

function ledgerDigest(answer: { answer_id: string; run_ref: string; nodes: { node_id: string }[] }) {
  return {
    answer_id: answer.answer_id,
    run_ref: answer.run_ref,
    work_items: answer.nodes.map((node) => ({ node_ref: node.node_id, status: "READY", reason: null })),
    entries: []
  };
}

function askAccepted(run: MockRun, waiting: boolean) {
  return waiting
    ? { run_ref: run.runRef, status: "WAITING", waits_until: waitsUntil(), waiting_scope: "PERSON_DAY" }
    : { run_ref: run.runRef, status: "QUEUED" };
}

function alreadyWaiting() {
  return { error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: RUN_WAITING, waits_until: waitsUntil() };
}

function languageOffer(question: string) {
  const proposed = question.replace(/#mix/giu, "").replace(/\s{2,}/gu, " ").trim() || question;
  return {
    error: "QUESTION_LANGUAGE_CHOICE_NEEDED",
    message: "QUESTION_LANGUAGE_CHOICE_NEEDED",
    offer: {
      // The page sends this back in question_language_choice.check_ref, whose grammar is "<part>.<part>".
      check_ref: `mockoffer.${randomBytes(12).toString("base64url")}`,
      main_language: { code: "en", name: "English" },
      languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }],
      proposed_question: proposed
    }
  };
}

function runEvent(runRef: string, seq: number, type: string, payload: Record<string, unknown>) {
  return { event_id: `${runRef}:${seq}`, event_type: type, run_ref: runRef, subject_ref: null, at_sequence: seq, payload };
}

// ---------------------------------------------------------------------------------------------------------------
// Draft fields (web-draft.ts): sent only when the contract already accepts them, else held back. /__mock/draft/<path>
// always shows the full body.
// ---------------------------------------------------------------------------------------------------------------

/** Whether this mock's contract already knows the draft fields (W1-6 merged and the names agree). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draftServed = (schema: any, full: unknown, strip: (body: any) => any) => contractOrDraft(schema, full, strip).draft;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkAnswerDraft = (answer: any): string[] => answerDraftProblems(answer);

/** W2-7: the draft parts of a run read (its month pause) and of the usage read (its borrow notices), when there. */
const draftPart = (key: string, schema: { safeParse: (body: unknown) => { success: boolean; error?: { issues: unknown } } }) => ({
  safeParse: (body: unknown) => {
    const value = (body as Record<string, unknown>)[key];
    return value === undefined ? { success: true } : schema.safeParse(value);
  }
});
const runPauseDraft = draftPart("month_pause", DraftMonthPauseSchema);
const runQuotaDraft = draftPart("quota_used", DraftRunQuotaUsedSchema);
/** A run read's draft parts: its month pause (W2-7) and, on a failed run, its `quota_used` (owner review 3 Nov). */
const runDraftSchema = {
  safeParse: (body: unknown) => {
    const pause = runPauseDraft.safeParse(body);
    return pause.success ? runQuotaDraft.safeParse(body) : pause;
  }
};
const runStartDraftSchema = draftPart("started_at", DraftRunStartedAtSchema);
const usageDraftSchema = draftPart("borrowed", DraftUsageBorrowsSchema);

function investigationBody(investigation: Investigation) {
  return {
    investigation_id: investigation.investigation_id,
    root_run_id: investigation.root_run_id,
    state: investigation.state,
    digs: investigation.digs.map((record) => ({ ...record, places: [...record.places] })),
    closings: investigation.closings.map((closing) => ({ ...closing }))
  };
}

/** GET /v1/runs/{id}/investigation as the website reads it (R22 W5-1): each closing as a report version, the current one the newest finished. */
function investigationReports(investigation: Investigation) {
  const root = runs.get(investigation.root_run_id);
  const versions = investigation.closings.map((closing) => {
    const fields = { report_version: closing.report_version, closed_at: closing.closed_at };
    if (closing.report === "WRITING") return { ...fields, state: "WRITING", waiting_for_digs: 0 };
    if (closing.report === "FAILED") return { ...fields, state: "FAILED", written_at: closing.closed_at };
    return reportVersionBody({ version: closing.report_version, closedAt: closing.closed_at, writtenAt: closing.closed_at, free: root?.web === "FREE", arabic: root?.language?.tag === "ar" });
  });
  const finished = investigation.closings.filter((closing) => closing.report === "READY").at(-1);
  return { investigation_id: investigation.investigation_id, root_run_id: investigation.root_run_id, state: investigation.state, digs: investigation.digs.length, versions, current: finished?.report_version ?? null };
}

// ---------------------------------------------------------------------------------------------------------------
// Startup check: every seeded body must pass the website's own schema, or the mock refuses to start.
// ---------------------------------------------------------------------------------------------------------------

function startupCheck(): number {
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (label: string, schema: any, body: unknown) => {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new Error(`MOCK_SEED_INVALID: ${label} does not pass its contract schema:\n${JSON.stringify(result.error.issues, null, 2)}`);
    }
    count += 1;
  };
  check("GET /v1/session", C.SessionSchema, SESSION);
  check("GET /v1/auth/age-confirmation", C.AgeConfirmationStatusSchema, { status: "confirmed" });
  check("GET /v1/account/sensitive-data-consent", C.SensitiveDataConsentStatusSchema, { status: "given" });
  check("GET /v1/account/legal-status", C.LegalStatusResponseSchema, { must_accept: [] });
  check("GET /v1/geo/availability", C.GeoAvailabilityResponseSchema, { signup: true, pay: true, service: true });
  check("GET /v1/public/ai-providers", C.PublicAiProvidersResponseSchema, { companies: ["anthropic", "openai", "xai"] });
  check("GET /v1/public/debates", C.PublicDebateListSchema, { items: [], total: 0 });
  for (const debate of publicDebates.values()) check(`GET /v1/public/debates/${String(debate.public_ref)}`, C.PublicDebateSchema, debate);
  check("GET /v1/deployment", C.DeploymentSchema, DEPLOYMENT);
  // A draft body must pass the draft schema whole, and today's contract once its draft fields are held back.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkDraft = (label: string, schema: any, full: unknown, strip: (body: any) => any, draftSchema: any) => {
    check(`${label} (draft)`, draftSchema, full);
    check(label, schema, contractOrDraft(schema, full, strip).body);
  };
  for (const plan of PLAN_MODES) {
    for (const mode of ROOM_MODES) {
      for (const reserve of [true, false]) {
        for (const dig of [null, "quick", "thorough"] as const) {
          checkDraft(`GET /v1/asks/room (${plan}, ${mode}, reserve ${reserve}, dig ${dig})`, C.AskRoomResponseSchema,
            roomRead(mode, Date.now(), plan, reserve, dig), stripRoom, DraftRoomPartSchema);
        }
      }
    }
    for (const usage of USAGE_MODES) {
      checkDraft(`GET /v1/billing/usage (${plan}, ${usage})`, C.BillingUsageResponseSchema, billingUsage(Date.now(), plan, usage), stripUsage,
        usageDraftSchema);
    }
  }
  check("GET /v1/billing/plans", C.BillingPlansResponseSchema, BILLING_PLANS);
  for (const [country, postal] of [["DE", null], ["RO", null], ["US", "75201"], ["US", null], ["CA", "D1A 1A1"], ["JP", null]] as const) {
    check(`GET /v1/billing/plans?country=${country}`, C.BillingPlansResponseSchema, billingPlans(country, postal));
  }
  // The shelf's draft parts (owner's screen review, 3 Nov) pass their draft schema, and today's contract once held back.
  const index = answerIndex(50, 0);
  const shelfProblems = answerIndexDraftProblems(index);
  if (shelfProblems.length > 0) throw new Error(`MOCK_SEED_INVALID: GET /v1/answers draft fields:\n${shelfProblems.join("\n")}`);
  check("GET /v1/answers", C.AnswerIndexSchema, contractOrDraft(C.AnswerIndexSchema, index, stripAnswerIndex).body);
  for (const run of runs.values()) {
    checkDraft(`GET /v1/runs/${run.runRef}`, C.RunProjectionSchema, runProjection(run), stripRun, runDraftSchema);
    check(`GET /v1/runs/${run.runRef}/visibility`, C.PublicationTransitionSchema, { state: "PRIVATE", public_ref: null });
    check(`GET /v1/runs/${run.runRef}/last-visit`, C.LastVisitSchema, { seen_at: null, items: null });
    check(`GET /v1/runs/${run.runRef}/dig-links`, C.DigLinksSchema, digLinksOf(run.runRef));
    const investigation = investigationOf(run.runRef);
    if (investigation !== undefined) check(`GET /v1/runs/${run.runRef}/investigation (draft)`, DraftInvestigationSchema, investigationBody(investigation));
    if (run.answer === undefined) continue;
    const problems = checkAnswerDraft(run.answer);
    if (problems.length > 0) throw new Error(`MOCK_SEED_INVALID: GET /v1/answers/${run.answerId} draft fields:\n${problems.join("\n")}`);
    check(`GET /v1/answers/${run.answerId}`, C.AnswerSchema, contractOrDraft(C.AnswerSchema, run.answer, stripAnswer).body);
    if (run.mainAnswerReadyAt !== undefined) {
      for (const at of [run.mainAnswerReadyAt - 1, run.mainAnswerReadyAt]) {
        check(`GET /v1/answers/${run.answerId} (main answer at ${iso(at)})`, C.AnswerSchema, contractOrDraft(C.AnswerSchema, answerNow(run, at), stripAnswer).body);
      }
    }
    for (const status of ["WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"] as const) {
      check(`GET /v1/answers/${run.answerId}/story (${status})`, C.AnswerStorySchema, seed.story(run.answerId!, status, iso(T0)));
    }
    check(`GET /v1/answers/${run.answerId}/disclosure`, C.AnswerDisclosureSchema, seed.disclosure(run.answerId!));
    check(`GET /v1/answers/${run.answerId}/inspection`, C.InspectionSchema, inspection(run.answer));
    check(`GET /v1/answers/${run.answerId}/ledger-digest`, C.ExecutionLedgerDigestSchema, ledgerDigest(run.answer));
    for (const node of run.answer.nodes) {
      check(`GET /v1/answers/${run.answerId}/nodes/${node.node_id}`, C.NodeSchema, contractOrDraft(C.NodeSchema, node, stripNode).body);
    }
  }
  const probe = { runRef: "probe", question: "probe", seq: 1 } as MockRun;
  check("POST /v1/asks (QUEUED)", C.AskAcceptedSchema, askAccepted(probe, false));
  check("POST /v1/asks (WAITING)", C.AskAcceptedSchema, askAccepted(probe, true));
  check("POST /v1/asks 422 ASK_ALREADY_WAITING", C.AskAlreadyWaitingSchema, alreadyWaiting());
  check("POST /v1/asks 409 QUESTION_LANGUAGE_CHOICE_NEEDED", C.QuestionLanguageChoiceNeededSchema, languageOffer("A #mix question"));
  check("GET /v1/account/reading-level", C.ReadingLevelStateSchema, { reading_level: readingLevel });
  for (const type of ["run.accepted", "run.running", "run.terminal"]) {
    check(`event ${type}`, C.RunEventSchema, runEvent(RUN_RUNNING, 1, type, { state: "SETTLED" }));
  }
  // The seed must still hold every node the README promises.
  const nodeIds = new Set(runs.get(RUN_SETTLED)!.answer.nodes.map((node: { node_id: string }) => node.node_id));
  for (const id of SEED_NODE_IDS) if (!nodeIds.has(id)) throw new Error(`MOCK_SEED_INVALID: node ${id} missing`);
  return count;
}

const CHECKED = startupCheck();

// ---------------------------------------------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------------------------------------------

function logRequest(method: string, path: string, status: number, note = ""): void {
  if (QUIET) return;
  process.stderr.write(`[mock] ${method} ${path} ${status}${note === "" ? "" : ` ${note}`}\n`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendJson(req: IncomingMessage, res: ServerResponse, status: number, body: unknown, schema?: any, extraHeaders: Record<string, string | string[]> = {}): void {
  let finalStatus = status;
  let finalBody = body;
  if (schema !== undefined) {
    const result = schema.safeParse(body);
    if (!result.success) {
      // Never send a body the website would refuse: say so loudly instead.
      process.stderr.write(`[mock] RESPONSE FAILED ITS SCHEMA for ${req.method} ${req.url}: ${JSON.stringify(result.error.issues)}\n`);
      finalStatus = 500;
      finalBody = { error: "MOCK_RESPONSE_INVALID", message: "The mock built a body that fails the contract schema; see the mock's log." };
    }
  }
  const text = JSON.stringify(finalBody);
  res.writeHead(finalStatus, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(text)),
    ...extraHeaders
  });
  res.end(text);
  logRequest(req.method ?? "GET", req.url ?? "", finalStatus);
}

function sendEmpty(req: IncomingMessage, res: ServerResponse, status: number, extraHeaders: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { "cache-control": "no-store", ...extraHeaders });
  res.end();
  logRequest(req.method ?? "GET", req.url ?? "", status);
}

function notFound(req: IncomingMessage, res: ServerResponse, code: string, message: string): void {
  sendJson(req, res, 404, { error: code, message });
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 1_048_576) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.trim() === "") return resolveBody(null);
      try {
        resolveBody(JSON.parse(text));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** The proxy passes these exact cookie forms only (app/api/[...path]/route.ts lawfulSetCookie). */
function sessionCookies(): string[] {
  const token = () => randomBytes(32).toString("base64url"); // 43 characters of [A-Za-z0-9_-]
  return [
    `__Host-debateai-session=${token()}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    `__Host-debateai-csrf=${token()}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`
  ];
}

function clearedSessionCookies(): string[] {
  const gone = "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  return [
    `__Host-debateai-session=; ${gone}; HttpOnly; Secure; SameSite=Lax`,
    `__Host-debateai-csrf=; ${gone}; Secure; SameSite=Lax`
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// The run event stream (Server-Sent Events)
// ---------------------------------------------------------------------------------------------------------------

const openStreams = new Set<ServerResponse>();

function streamEvents(req: IncomingMessage, res: ServerResponse, run: MockRun): void {
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
  let seq = 0;
  const emit = (type: string, payload: Record<string, unknown>) => {
    seq += 1;
    const event = runEvent(run.runRef, seq, type, payload);
    C.RunEventSchema.parse(event);
    res.write(`id: ${event.event_id}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const state = stateOf(run);
  if (state === "SETTLED" || state === "FAILED") {
    // A finished run: replay its record and close (the classic page reads this to the end).
    emit("run.accepted", {});
    emit("run.running", {});
    emit("run.terminal", state === "FAILED" ? { state: "FAILED", reason: run.failedReason } : { state: "SETTLED" });
    res.end();
    logRequest(req.method ?? "GET", req.url ?? "", 200, `(event replay, ${state})`);
    return;
  }
  openStreams.add(res);
  res.write(": mock event stream open\n\n");
  emit("run.accepted", {});
  if (state !== "WAITING") emit("run.running", {});
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
  let settle: ReturnType<typeof setTimeout> | null = null;
  const close = () => {
    clearInterval(ping);
    if (settle !== null) clearTimeout(settle);
    openStreams.delete(res);
  };
  // A dig paused under dig=PAUSE settles only after Continue (its far time would overflow the timer, so none is set).
  if (state === "RUNNING" && run.settleAt !== undefined && run.monthPaused !== true) {
    settle = setTimeout(() => {
      emit("run.terminal", { state: "SETTLED" });
      close();
      res.end();
    }, Math.max(0, run.settleAt - Date.now()));
  }
  req.on("close", close);
  res.on("close", close);
  logRequest(req.method ?? "GET", req.url ?? "", 200, `(event stream open, ${state})`);
}

// ---------------------------------------------------------------------------------------------------------------
// POST /v1/asks
// ---------------------------------------------------------------------------------------------------------------

function effectiveAskMode(): Exclude<AskMode, "AUTO"> {
  if (askMode !== "AUTO") return askMode;
  if (roomMode === "FULL" || roomMode === "BLOCKED" || roomMode === "WAIT_RESET") return "WAITING";
  if (roomMode === "ALREADY_WAITING") return "ALREADY_WAITING";
  return "ACCEPT";
}

/**
 * Decisions 29 and 31, dynamic step 2. The question decides the scene, so a click-test can see each: words ending "#none" get no questions (the AI could
 * not help), "#fail" a server failure (no questions either), "#slow" no answer for 15 seconds (past the page's limit), "#purposeonly" only the purpose
 * question, "#nopurpose" no purpose question; anything else two questions and the purpose question. Waits a little, so "Analyzing your question…" can be seen.
 */
async function postClarify(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = C.AskClarifyRequestSchema.safeParse(await readJsonBody(req).catch(() => undefined));
  if (!body.success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
  const question = body.data.question_line;
  await new Promise((done) => setTimeout(done, question.endsWith("#slow") ? 15_000 : 900));
  if (res.destroyed) return;
  if (question.endsWith("#fail")) return sendJson(req, res, 503, { error: "MOCK_FAILURE", message: "MOCK_FAILURE" });
  if (question.endsWith("#none")) return sendJson(req, res, 200, { source: "NONE" }, C.AskClarifyResponseSchema);
  const purpose = { text: "What do you want the answer for?", answers: ["To decide how to vote", "To explain it to someone", "To write about it"] };
  const questions = question.endsWith("#purposeonly") ? [] : [
    { text: "Which country or region is this about?", answers: ["Romania", "The EU as a whole", "Anywhere in general"] },
    { text: "Over what time?", answers: ["The next 5 years", "The next 25 years"] }
  ];
  return sendJson(req, res, 200, { source: "AI", questions, ...(question.endsWith("#nopurpose") ? {} : { purpose }) }, C.AskClarifyResponseSchema);
}

const publicReportsWriting = new Map<string, number>();
/** Decision 13: the Free notices the asks said they showed, for the click-test to read in `/__mock/state`. */
let freeNotices = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicDigRefusal(parent: any, planTier: string): Readonly<{ status: number; error: string; extra: object }> | null {
  const debate = publicDebates.get(parent.public_ref);
  if (debate === undefined) return { status: 404, error: "RUN_NOT_FOUND", extra: {} };
  if (planTier === "free" && (parent.picks?.length ?? 0) > C.FREE_DIG_PICKS_MAX) return { status: 400, error: C.DIG_FREE_PICKS_MAX, extra: { picks_max: C.FREE_DIG_PICKS_MAX } };
  if (publicMode === "TOO_DEEP") return { status: 409, error: C.DIG_TOO_DEEP, extra: { level_max: C.DIG_LEVEL_MAX } };
  if (publicMode === "REPORT_WRITING") return { status: 409, error: "PUBLIC_DEBATE_REPORT_WRITING", extra: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shown: readonly any[] = parent.dig_ref === undefined ? debate.story_short?.paths ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (debate.contributions ?? []).find((contribution: any) => contribution.update_ref === parent.dig_ref)?.dig_paths ?? [];
  const place = (parent.places as readonly string[]).find((candidate) => candidate.startsWith("path:"))?.slice("path:".length);
  if (place === undefined || !shown.some((path) => path.position_ref === place)) return { status: 400, error: "PUBLIC_DIG_NEEDS_A_PATH", extra: {} };
  if (roomMode === "FULL" || roomMode === "BLOCKED" || roomMode === "WAIT_RESET") return { status: 409, error: "PUBLIC_DEBATE_WAITS_FOR_RESET", extra: {} };
  return null;
}

/** CHECKING while the dig runs and for a few seconds after; then ON_THE_PAGE and the page changes, or, with "#refuse" in the view, KEPT_PRIVATE and it does not. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startPublicCheck(run: MockRun, parent: any, question: string, settleAt: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const answer = run.answer as any;
  answer.contribution = { public_ref: parent.public_ref, state: "CHECKING" };
  const settle = setTimeout(() => {
    if (/#refuse/iu.test(question)) {
      answer.contribution = { public_ref: parent.public_ref, state: "KEPT_PRIVATE" };
      return;
    }
    answer.contribution = { public_ref: parent.public_ref, state: "ON_THE_PAGE" };
    const place = (parent.places as readonly string[]).find((candidate) => candidate.startsWith("path:"))!.slice("path:".length);
    const debate = publicDebates.get(parent.public_ref);
    debate.contributions = [...(debate.contributions ?? []), contributionOf(place, parent.dig_ref ?? null, randomUUID(), iso(Date.now()).slice(0, 10), parent.picks?.[0]?.text ?? "")];
  }, Math.max(0, settleAt - Date.now()) + PUBLIC_CHECK_MS);
  settle.unref();
}

async function postAsk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (failure) {
    // A fixed code, never the error's own text (CodeQL js/stack-trace-exposure, PR #224).
    const tooLarge = failure instanceof Error && failure.message === "PAYLOAD_TOO_LARGE";
    const code = tooLarge ? "PAYLOAD_TOO_LARGE" : "MALFORMED_REQUEST";
    sendJson(req, res, tooLarge ? 413 : 400, { error: code, message: code });
    return;
  }
  // A dig may name its parent (DRAFT field `parent`, web-draft.ts). Today's ask rules read the rest; once the contract
  // knows `parent` (W1-6), the whole body passes AskRequestSchema and the parent is read from it.
  const whole = C.AskRequestSchema.safeParse(body);
  const split = whole.success ? { ask: body, parent: (body as { parent?: unknown }).parent } : splitAsk(body);
  const parsed = whole.success ? whole : C.AskRequestSchema.safeParse(split.ask);
  const parentParsed = split.parent === undefined ? null : DraftAskParentSchema.safeParse(split.parent);
  const mode = effectiveAskMode();
  const log = (outcome: string, runRef: string | null) => {
    process.stdout.write(`${JSON.stringify({
      mock: "ask", at: iso(Date.now()), valid: parsed.success && parentParsed?.success !== false, outcome, run_ref: runRef, body,
      ...(parsed.success ? {} : { issues: parsed.error.issues }),
      ...(parentParsed === null || parentParsed.success ? {} : { parent_issues: parentParsed.error.issues })
    })}\n`);
  };
  if (!parsed.success || parentParsed?.success === false) {
    log("REFUSED_MALFORMED", null);
    sendJson(req, res, 400, {
      error: "MALFORMED_REQUEST", message: "The ask does not pass AskRequestSchema (or its draft parent does not pass DraftAskParentSchema).",
      issues: parsed.success ? parentParsed?.error?.issues : parsed.error.issues
    });
    return;
  }
  const parent: DraftAskParent | null = parentParsed === null ? null : parentParsed.data as DraftAskParent;
  // Decision 13: a dig named by a public page, refused as POST /v1/asks refuses it, before anything starts.
  const publicParent = parsed.data.public_parent;
  if (publicParent !== undefined) {
    const refusal = publicDigRefusal(publicParent, parsed.data.plan_tier);
    if (refusal !== null) {
      log(`REFUSED_${refusal.error}`, null);
      sendJson(req, res, refusal.status, { error: refusal.error, ...(refusal.error === "RUN_NOT_FOUND" ? {} : { message: refusal.error }), ...refusal.extra });
      return;
    }
  }
  if (parsed.data.free_public_notice === true && parent === null && publicParent === undefined) freeNotices += 1;
  if (parent !== null && !runs.has(parent.parent_run_id)) {
    log("PARENT_NOT_FOUND", null);
    sendJson(req, res, 404, { error: "RUN_NOT_FOUND", message: "RUN_NOT_FOUND" });
    return;
  }
  // W3-4 (dig model revision §2): a dig is its parent's level + 1; past DIG_LEVEL_MAX it is refused before anything starts.
  const levelMax: number = typeof C.DIG_LEVEL_MAX === "number" ? C.DIG_LEVEL_MAX : 10;
  const digLevel = parent === null ? 0 : digLevelOfRun(parent.parent_run_id) + 1;
  if (digLevel > levelMax) {
    log("DIG_TOO_DEEP", null);
    sendJson(req, res, 409, { error: "DIG_TOO_DEEP", message: "DIG_TOO_DEEP", level_max: levelMax },
      ...(C.DigTooDeepSchema === undefined ? [] : [C.DigTooDeepSchema]));
    return;
  }
  const ask = parsed.data;
  const question: string = ask.question_line.trim();
  const wantsLanguageChoice = mode === "LANGUAGE_CHOICE" || /#mix/iu.test(question);
  if (wantsLanguageChoice && ask.question_language_choice === undefined) {
    log("LANGUAGE_CHOICE_NEEDED", null);
    sendJson(req, res, 409, languageOffer(question), C.QuestionLanguageChoiceNeededSchema);
    return;
  }
  if (mode === "ALREADY_WAITING") {
    log("ASK_ALREADY_WAITING", RUN_WAITING);
    sendJson(req, res, 422, alreadyWaiting(), C.AskAlreadyWaitingSchema);
    return;
  }
  const now = Date.now();
  const runRef = randomUUID();
  const seq = nextSeq++;
  // A new question opens its own investigation; a dig with a parent joins (and reopens) its parent's, as the server
  // will once W3-2 lands. The page's after-start link (POST /v1/runs/{id}/dig-links) does the same.
  const join = (child: string) => {
    if (parent === null) openInvestigation(child);
    else linkDig(parent.parent_run_id, { child_run_id: child, places: parent.places, mode: parent.mode }, now);
  };
  if (mode === "WAITING") {
    const run = addRun({ runRef, question, seq, waiting: true });
    join(runRef);
    log(parent === null ? "WAITING" : "WAITING_DIG", runRef);
    sendJson(req, res, 202, askAccepted(run, true), C.AskAcceptedSchema);
    return;
  }
  // Owner review 3 Nov (dig=FAIL): a new dig runs its time, then fails "stopped partway" (and its draft view says it took
  // some quota), so the click-test can try it again and see a second failure.
  if (parent !== null && digEndMode === "FAIL") {
    const run = addRun({ runRef, question, seq, failedReason: DIG_FAILED_REASON, failsAt: now + RUN_SECONDS * 1000, quotaUsed: "SOME" });
    join(runRef);
    log("QUEUED_DIG_WILL_FAIL", runRef);
    sendJson(req, res, 202, askAccepted(run, false), C.AskAcceptedSchema);
    return;
  }
  const settleAt = now + RUN_SECONDS * 1000;
  // Free never searches; "#webfail" in the question plays a debate whose search failed.
  const web: WebCase = ask.plan_tier === "free" ? "FREE" : /#webfail/iu.test(question) ? "FAILED" : "PAID";
  const run = settledRun({
    runRef, answerId: randomUUID(), question, seq, askedAt: now, settleAt,
    storyReadyAt: settleAt + POSTED_STORY_SECONDS * 1000, web,
    // W3-4: a dig's answer says its level and its picks, so its own map knows how deep it is.
    ...(parent === null ? {} : { dig: digPartOf(parent, digLevel) }),
    // A stranger's dig names no run; the answer still needs a parent, so it hangs under the mock's first debate. The page never reads it.
    ...(publicParent === undefined ? {} : { dig: digPartOf({ parent_run_id: RUN_SETTLED, places: publicParent.places, mode: publicParent.mode, picks: publicParent.picks } as DraftAskParent, 1) })
  });
  if (publicParent !== undefined) startPublicCheck(run, publicParent, question, settleAt);
  // Owner review 3 Nov (dig=PAUSE): a new dig reaches the month wall at once; Continue (once pause=CAN_CONTINUE) lets it finish.
  if (parent !== null && digEndMode === "PAUSE") {
    run.monthPaused = true;
    // Paused: it does not finish until Continue (a far, valid time; the state read says RUNNING until then).
    run.settleAt = Date.UTC(2100, 0, 1);
    run.settlesAfterContinue = true;
  }
  join(runRef);
  log(parent === null ? "QUEUED" : "QUEUED_DIG", runRef);
  sendJson(req, res, 202, askAccepted(run, false), C.AskAcceptedSchema);
}

// ---------------------------------------------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------------------------------------------

function mockState() {
  const now = Date.now();
  return {
    room: roomMode,
    ask: askMode,
    plan: planMode,
    usage: usageMode,
    pause: pauseMode,
    dig: digEndMode,
    public: publicMode,
    report: reportMode,
    session: sessionOut ? "OUT" : "IN",
    free_notices: freeNotices,
    ask_effective: effectiveAskMode(),
    now: iso(now),
    reading_level: readingLevel,
    reserve: roomMode === "BLOCKED" ? "BLOCKED" : anyInvestigationOpen() ? "KEPT" : null,
    draft_fields_sent: {
      answer: draftServed(C.AnswerSchema, runs.get(RUN_SETTLED)!.answer, stripAnswer),
      room: draftServed(C.AskRoomResponseSchema, roomRead(roomMode, now), stripRoom),
      run: draftServed(C.RunProjectionSchema, runProjection(runs.get(RUN_PAUSED)!, now), stripRun),
      usage: draftServed(C.BillingUsageResponseSchema, billingUsage(now, planMode, "BORROWED"), stripUsage),
      answer_index: draftServed(C.AnswerIndexSchema, answerIndex(50, 0, now), stripAnswerIndex)
    },
    investigations: [...investigations.values()].map(investigationBody),
    dig_links: digLinks.map((record) => ({ ...record })),
    runs: [...runs.values()].sort((left, right) => left.seq - right.seq).map((run) => ({
      run_ref: run.runRef,
      question_line: run.question,
      state: stateOf(run, now),
      answer_id: run.answerId ?? null,
      story: run.answerId === undefined || stateOf(run, now) !== "SETTLED" ? null : storyStatusOf(run, now),
      settles_at: run.settleAt === undefined ? null : iso(run.settleAt),
      story_ready_at: run.storyReadyAt === undefined ? null : iso(run.storyReadyAt),
      web: run.web ?? null,
      month_paused: run.monthPaused === true
    }))
  };
}

function positiveInt(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  return /^\d{1,4}$/u.test(raw) ? Number(raw) : null;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  let parts = url.pathname.split("/").filter((part) => part.length > 0).map((part) => decodeURIComponent(part));
  // /__mock/draft/<a /v1 path>: the same reply with every DRAFT field in it, checked against the draft schemas only.
  const draftView = parts[0] === "__mock" && parts[1] === "draft" && parts[2] === "v1";
  if (draftView) parts = parts.slice(2);
  const path = `/${parts.join("/")}`;
  const isGet = method === "GET" || method === "HEAD";

  /** Sends a body that may carry draft fields: whole on the draft view, else as the contract accepts it today. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendDraftable = (full: any, schema: any, strip: (body: any) => any, draftProblems: (body: any) => string[]) => {
    if (!draftView) return sendJson(req, res, 200, contractOrDraft(schema, full, strip).body, schema);
    const problems = draftProblems(full);
    if (problems.length === 0) return sendJson(req, res, 200, full);
    process.stderr.write(`[mock] DRAFT BODY FAILED ITS DRAFT SCHEMA for ${method} ${path}: ${problems.join("; ")}\n`);
    return sendJson(req, res, 500, { error: "MOCK_RESPONSE_INVALID", message: "The mock built a draft body that fails its draft schema; see the mock's log." });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issuesOf = (schema: any) => (body: unknown) => {
    const result = schema.safeParse(body);
    return result.success ? [] : [JSON.stringify(result.error.issues)];
  };

  // ---- mock controls (not part of the real API) ----
  if (parts[0] === "__mock") {
    if (parts[1] === "state" && isGet) return sendJson(req, res, 200, mockState());
    // Decision 33: a passkey cannot be pressed on the mock, so this does what the panel's Confirm would: /__mock/review?ref=<public ref>&step=HIDE|REMOVE_DIG|CORRECT|REPUBLISH[&pointer=/question&text=...]
    if (parts[1] === "review") {
      const ref = url.searchParams.get("ref") ?? PUBLIC_REF;
      const row = mockReview.get(ref) ?? { hidden: false, removed: false, corrected: new Map<string, string>(), log: [] };
      mockReview.set(ref, row);
      const refused = mockReviewStep(row, url.searchParams.get("step") ?? "HIDE", url.searchParams.get("pointer") ?? "/story_short/summary", url.searchParams.get("text") ?? "A corrected text.");
      return sendJson(req, res, refused === null ? 200 : 409, { refused, hidden: row.hidden, revision: row.log.length });
    }
    if (parts[1] === "set" && (isGet || method === "POST")) {
      try {
        const room = url.searchParams.get("room");
        const ask = url.searchParams.get("ask");
        const plan = url.searchParams.get("plan");
        const usage = url.searchParams.get("usage");
        const pause = url.searchParams.get("pause");
        const publicSetting = url.searchParams.get("public");
        const reportSetting = url.searchParams.get("report");
        const digSetting = url.searchParams.get("dig");
        if (reportSetting !== null) reportMode = choice("report", reportSetting, REPORT_MODES, reportMode);
        if (digSetting !== null) digEndMode = choice("dig", digSetting, DIG_END_MODES, digEndMode);
        if (room !== null) roomMode = choice("room", room, ROOM_MODES, roomMode);
        if (ask !== null) askMode = choice("ask", ask, ASK_MODES, askMode);
        if (plan !== null) planMode = choice("plan", plan, PLAN_MODES, planMode);
        if (usage !== null) usageMode = choice("usage", usage, USAGE_MODES, usageMode);
        if (publicSetting !== null) publicMode = choice("public", publicSetting, PUBLIC_MODES, publicMode);
        const sessionSetting = url.searchParams.get("session");
        if (sessionSetting !== null) sessionOut = choice("session", sessionSetting, ["IN", "OUT"] as const, sessionOut ? "OUT" : "IN") === "OUT";
        if (pause !== null) {
          pauseMode = choice("pause", pause, PAUSE_MODES, pauseMode);
          // Setting the pause again pauses the seeded debate again (after a Continue), so a click-test can be repeated.
          runs.get(RUN_PAUSED)!.monthPaused = true;
        }
      } catch (failure) {
        // The detail goes to the mock's log, never into the reply (CodeQL js/stack-trace-exposure, PR #224).
        process.stderr.write(`[mock] setting refused: ${failure instanceof Error ? failure.message : String(failure)}\n`);
        return sendJson(req, res, 400, { error: "MOCK_SETTING_INVALID", message: "Unknown value for room, ask, plan, usage, pause, dig or public; see the mock's log." });
      }
      return sendJson(req, res, 200, mockState());
    }
    if (parts[1] === "sign-in" && isGet) {
      return sendJson(req, res, 200, { signed_in: true, next: "/v4" }, undefined, { "set-cookie": sessionCookies() });
    }
    if (parts[1] === "sign-out" && isGet) {
      return sendJson(req, res, 200, { signed_in: false }, undefined, { "set-cookie": clearedSessionCookies() });
    }
    return notFound(req, res, "MOCK_CONTROL_NOT_FOUND", "Known: /__mock/state, /__mock/set?room=&ask=&plan=&usage=&pause=&public=, /__mock/draft/v1/..., /__mock/sign-in, /__mock/sign-out");
  }

  // ---- the website edge's readiness probe (server.mjs /readyz forwards to <API>/readyz) ----
  if (path === "/readyz" && isGet) return sendJson(req, res, 200, { ready: true, releaseKey: null, reasons: [] });

  if (parts[0] !== "v1") return notFound(req, res, "NOT_FOUND", `The mock serves /v1/... only (got ${path}).`);

  // ---- session, gates, public reads ----
  // Decision 13: `session=OUT` shows a public page as a stranger sees it (a sign-in link in place of each press).
  if (path === "/v1/session" && isGet && sessionOut) return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });
  // V4 screen review (wait-f1): with `session=OUT` the asker's own debates are refused as an ended sign-in is (401
  // SESSION_REQUIRED), so a page opened while signed in shows "Please sign in again to see your question." on its next read.
  if (sessionOut && isGet && (parts[1] === "runs" || parts[1] === "answers")) return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });
  // A stranger has no quota and no account: the room and usage reads and the account reads are signed-in only in the
  // real API (auth "user"), so the ask page shows no "% of your quota used" and no share line to someone signed out.
  if (sessionOut && isGet && (path === "/v1/asks/room" || path === "/v1/billing/usage" || parts[1] === "account")) {
    return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });
  }
  if (path === "/v1/session" && isGet) return sendJson(req, res, 200, SESSION, C.SessionSchema);
  if (path === "/v1/auth/age-confirmation" && isGet) return sendJson(req, res, 200, { status: "confirmed" }, C.AgeConfirmationStatusSchema);
  if (path === "/v1/account/sensitive-data-consent" && (isGet || method === "POST")) {
    return sendJson(req, res, 200, { status: "given" }, C.SensitiveDataConsentStatusSchema);
  }
  if (path === "/v1/account/legal-status" && isGet) return sendJson(req, res, 200, { must_accept: [] }, C.LegalStatusResponseSchema);
  if (path === "/v1/account/legal-accept" && method === "POST") return sendEmpty(req, res, 204);
  // ---- the account memory of migration 0131 ----
  if (path === "/v1/account/reading-level" && isGet) return sendJson(req, res, 200, { reading_level: readingLevel }, C.ReadingLevelStateSchema);
  if (path === "/v1/account/reading-level" && method === "POST") {
    const body = C.ReadingLevelSaveRequestSchema.safeParse(await readJsonBody(req).catch(() => undefined));
    if (!body.success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    readingLevel = body.data.reading_level;
    return sendJson(req, res, 200, { reading_level: readingLevel }, C.ReadingLevelStateSchema);
  }
  if (path === "/v1/auth/logout" && method === "POST") return sendEmpty(req, res, 204, { "set-cookie": clearedSessionCookies() });
  if (path === "/v1/geo/availability" && isGet) {
    return sendJson(req, res, 200, { signup: true, pay: true, service: true }, C.GeoAvailabilityResponseSchema);
  }
  if (path === "/v1/public/ai-providers" && isGet) {
    return sendJson(req, res, 200, { companies: ["anthropic", "openai", "xai"] }, C.PublicAiProvidersResponseSchema);
  }
  if (path === "/v1/public/debates" && isGet) return sendJson(req, res, 200, { items: [], total: 0 }, C.PublicDebateListSchema);
  // Decision 33: the private team panel's reads and steps. The passkey is the mock's usual pretend one.
  if (parts[1] === "admin" && parts[2] === "public-review") {
    if (parts.length === 3 && isGet) {
      return sendJson(req, res, 200, { hidden: [...mockReview.entries()].filter(([, row]) => row.hidden).map(([publication_ref, row]) => ({ publication_ref, hidden_at: row.log.at(-1)!.at })),
        log: [...mockReview.entries()].flatMap(([publication_ref, row]) => row.log.map((entry) => ({ ...entry, publication_ref }))).slice(-100) }, C.PublicReviewListSchema);
    }
    const ref = parts[3]!;
    const debate = publicDebates.get(ref);
    if (debate === undefined) return sendJson(req, res, 404, { error: "PUBLIC_REVIEW_NOT_PUBLIC" });
    const row = mockReview.get(ref) ?? { hidden: false, removed: false, corrected: new Map<string, string>(), log: [] };
    mockReview.set(ref, row);
    if (parts.length === 4 && isGet) return sendJson(req, res, 200, mockReviewPage(ref, debate, row), C.PublicReviewPageSchema);
    if (parts.length === 5 && method === "POST") {
      const body = await readJsonBody(req) as { step?: string; pointer?: string; text?: string; expected_revision?: number };
      if (body.expected_revision !== row.log.length) return sendJson(req, res, 409, { error: "PUBLIC_REVIEW_STALE" });
      const refused = mockReviewStep(row, parts[4] === "hide" ? "HIDE" : body.step!, body.pointer, body.text);
      if (refused !== null) return sendJson(req, res, 409, { error: refused });
      return sendJson(req, res, 200, { operation_id: crypto.randomUUID(), outcome: "COMPLETED", recorded_at: iso(Date.now()) }, C.SecurityReceiptSchema);
    }
  }
  // Decision 35: Report. The word "hide" in the claim hides (the mock's pretend check), "#person" goes to a person, anything else is not found. The queue is the team panel's.
  if (parts[1] === "public" && parts[2] === "debates" && parts.length === 5 && parts[4] === "flag" && method === "POST") {
    const body = C.PublicFlagRequestSchema.safeParse(await readJsonBody(req).catch(() => undefined));
    if (!body.success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    const ref = parts[3]!;
    if (!publicDebates.has(ref)) return sendJson(req, res, 200, { state: "NOT_FOUND" }, C.PublicFlagAnswerSchema);
    const state = body.data.claim.includes("#person") ? "WITH_A_PERSON" as const : body.data.claim.includes("hide") ? "HIDDEN" as const : "NOT_FOUND" as const;
    mockFlags.push({ flag_id: crypto.randomUUID(), publication_ref: ref, reporter: "Quiet Heron", state: state === "HIDDEN" ? "HIDDEN" : state === "NOT_FOUND" ? "NOT_FOUND" : "QUEUED", verdict: state === "HIDDEN" ? "AGREE" : state === "NOT_FOUND" ? "NOT_FOUND" : null,
      reason: state === "HIDDEN" ? "CONTENT" : null, created_at: new Date().toISOString(), judged_at: null, dismissed_at: null, where: body.data.where, claim: body.data.claim, debate_hidden: state === "HIDDEN" });
    if (state === "HIDDEN") {
      const row = mockReview.get(ref) ?? { hidden: false, removed: false, corrected: new Map<string, string>(), log: [] };
      mockReview.set(ref, row);
      mockReviewStep(row, "HIDE");
    }
    return sendJson(req, res, 200, { state }, C.PublicFlagAnswerSchema);
  }
  if (parts[1] === "admin" && parts[2] === "public-reports") {
    if (parts.length === 3 && isGet) return sendJson(req, res, 200, { reports: mockFlags }, C.PublicFlagQueueSchema);
  }
  // Decision 13: a public debate, with what contributions changed since its snapshot; a report on it, while nothing is ongoing.
  if (parts[1] === "public" && parts[2] === "debates" && parts.length === 4 && isGet) {
    const debate = publicDebates.get(parts[3]!);
    if (debate === undefined) return sendJson(req, res, 404, { error: "DEBATE_NOT_FOUND", message: "DEBATE_NOT_FOUND" });
    // Decision 33: hidden under review, the plain line. The mock's own switch below hides, corrects and puts back.
    if (mockReview.get(parts[3]!)?.hidden === true) return sendJson(req, res, 410, { error: "DEBATE_UNDER_REVIEW" });
    return sendJson(req, res, 200, mockReviewed(debate), C.PublicDebateSchema);
  }
  if (parts[1] === "public" && parts[2] === "debates" && parts.length === 5 && parts[4] === "report" && method === "POST") {
    const debate = publicDebates.get(parts[3]!);
    if (debate === undefined) return sendJson(req, res, 404, { error: "DEBATE_NOT_FOUND" });
    const refuse = (error: string) => sendJson(req, res, 409, { error, message: error }, C.PublicDebateRefusedSchema);
    if (roomMode === "FULL" || roomMode === "BLOCKED" || roomMode === "WAIT_RESET") return refuse("PUBLIC_DEBATE_WAITS_FOR_RESET");
    if (publicMode === "ONGOING") return refuse("PUBLIC_DEBATE_ONGOING");
    if (debate.author_name_gone === true && (debate.contributions ?? []).length === 0) return refuse("PUBLIC_DEBATE_NO_CARRIER");
    const version = (debate.reports ?? []).length + 1 + (publicReportsWriting.get(parts[3]!) ?? 0);
    publicReportsWriting.set(parts[3]!, (publicReportsWriting.get(parts[3]!) ?? 0) + 1);
    const written = setTimeout(() => {
      publicReportsWriting.set(debate.public_ref, (publicReportsWriting.get(debate.public_ref) ?? 1) - 1);
      debate.reports = [...(debate.reports ?? []), writtenReport(version, iso(Date.now()))];
    }, PUBLIC_REPORT_MS);
    written.unref();
    return sendJson(req, res, 202, { state: "WRITING", report_version: version }, C.PublicReportAcceptedSchema);
  }
  if (path === "/v1/deployment" && isGet) return sendJson(req, res, 200, DEPLOYMENT, C.DeploymentSchema);

  // ---- asking ----
  if (path === "/v1/asks/room" && isGet) {
    // A read for a dig names its parent, mode and picks (DRAFT query part); today's query rules read the rest.
    const all = Object.fromEntries(url.searchParams);
    const whole = C.AskRoomQuerySchema.safeParse(all);
    const split = whole.success ? { query: all, dig: Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith("dig_"))) } : splitRoomQuery(all);
    const query = whole.success ? whole : C.AskRoomQuerySchema.safeParse(split.query);
    const dig = DraftRoomQueryPartSchema.safeParse(split.dig);
    if (!query.success || !dig.success) {
      return sendJson(req, res, 400, {
        error: "MALFORMED_REQUEST", message: "The room query does not pass AskRoomQuerySchema (or its draft dig part).",
        issues: query.success ? dig.error?.issues : query.error.issues
      });
    }
    const digMode = dig.data.dig_parent === undefined ? null : dig.data.dig_mode ?? "quick";
    return sendDraftable(roomRead(roomMode, Date.now(), planMode, anyInvestigationOpen(), digMode), C.AskRoomResponseSchema, stripRoom, issuesOf(DraftRoomPartSchema));
  }
  if (path === "/v1/asks" && method === "POST") return postAsk(req, res);
  if (path === "/v1/asks/clarify" && method === "POST") return postClarify(req, res);

  // ---- billing ----
  if (path === "/v1/billing/usage" && isGet) {
    // W2-7 (draft): the borrow notices ride the usage read once the contract knows them.
    return sendDraftable(billingUsage(), C.BillingUsageResponseSchema, stripUsage, issuesOf(usageDraftSchema));
  }
  if (path === "/v1/billing/plans" && isGet) {
    return sendJson(req, res, 200, billingPlans(url.searchParams.get("country"), url.searchParams.get("postal_code")), C.BillingPlansResponseSchema);
  }

  // ---- answers ----
  if (path === "/v1/answers" && isGet) {
    const limit = positiveInt(url.searchParams.get("limit"), 50);
    const offset = positiveInt(url.searchParams.get("offset"), 0);
    if (limit === null || limit < 1 || offset === null) {
      return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "limit and offset must be whole numbers (limit at least 1)." });
    }
    return sendDraftable(answerIndex(limit, offset), C.AnswerIndexSchema, stripAnswerIndex, answerIndexDraftProblems);
  }
  if (parts[1] === "answers" && parts.length >= 3 && isGet) {
    const run = runsByAnswer.get(parts[2]!);
    if (run === undefined || run.answer === undefined || stateOf(run) !== "SETTLED") {
      return notFound(req, res, "ANSWER_NOT_FOUND", "No answer with this id.");
    }
    const version = url.searchParams.get("version");
    if (version !== null && version !== "1") return notFound(req, res, "ANSWER_VERSION_NOT_FOUND", "Only version 1 exists.");
    const sub = parts.slice(3).join("/");
    if (sub === "") return sendDraftable(answerNow(run), C.AnswerSchema, stripAnswer, checkAnswerDraft);
    if (sub === "story") return sendJson(req, res, 200, storyRead(run), C.AnswerStorySchema);
    if (sub === "map") return notFound(req, res, "MAP_VIEW_NOT_FOUND", "This debate has no map view (the debate-shape row was off).");
    if (sub === "disclosure") return sendJson(req, res, 200, seed.disclosure(run.answerId!), C.AnswerDisclosureSchema);
    if (sub === "inspection") return sendJson(req, res, 200, inspection(run.answer), C.InspectionSchema);
    if (sub === "ledger-digest") return sendJson(req, res, 200, ledgerDigest(run.answer), C.ExecutionLedgerDigestSchema);
    if (parts[3] === "nodes" && parts.length === 5) {
      const node = run.answer.nodes.find((candidate: { node_id: string }) => candidate.node_id === parts[4]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeDraft = (body: any) => issuesOf(DraftNodeWebSchema)({ sources: body.sources, looked_up_checked: body.looked_up_checked });
      return node === undefined ? notFound(req, res, "NODE_NOT_FOUND", "No such point.") : sendDraftable(node, C.NodeSchema, stripNode, nodeDraft);
    }
  }

  // ---- runs: account memory (0131) and investigations (draft), which also take a POST ----
  if (parts[1] === "runs" && parts.length === 4 && method === "POST") {
    const run = runs.get(parts[2]!);
    if (run === undefined) return sendJson(req, res, 404, { error: "RUN_NOT_FOUND" });
    const body = await readJsonBody(req).catch(() => undefined);
    if (parts[3] === "last-visit") {
      const parsed = C.LastVisitRecordRequestSchema.safeParse(body);
      if (!parsed.success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      const seenAt = iso(Date.now());
      lastVisits.set(run.runRef, { seen_at: seenAt, items: { ...parsed.data.items } });
      return sendJson(req, res, 200, { seen_at: seenAt }, C.LastVisitRecordedSchema);
    }
    if (parts[3] === "continue") {
      // Draft route (W2-7, money rule): Continue on a debate paused at the month wall, once the new month has started.
      if (run.monthPaused !== true || stateOf(run) !== "RUNNING") return sendJson(req, res, 409, { error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" });
      if (!DraftRunContinueRequestSchema.safeParse(body ?? {}).success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      if (pauseMode !== "CAN_CONTINUE") {
        return sendJson(req, res, 409, { error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until: nextUtcMonth() }, DraftRunContinueRefusedSchema);
      }
      run.monthPaused = false;
      // A dig paused under `dig=PAUSE` then runs its time and finishes, so the click-test sees it through.
      if (run.settlesAfterContinue === true) {
        run.settleAt = Date.now() + RUN_SECONDS * 1000;
        run.storyReadyAt = run.settleAt;
        run.settlesAfterContinue = false;
      }
      return sendJson(req, res, 200, { state: "CONTINUING" }, DraftRunContinuedSchema);
    }
    if (parts[3] === "researched") {
      // W4-4: "Add to researched". READING at once, then the readers' outcome a few seconds later, as the runner's sweep; a guide adds nothing.
      const parsed = C.ResearchedAddRequestSchema.safeParse(body);
      if (!parsed.success) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      if (stateOf(run) !== "SETTLED" || run.answer === undefined) {
        return sendJson(req, res, 409, { error: "WEB_RESEARCHED_NOT_NOW", message: "WEB_RESEARCHED_NOT_NOW" }, C.ResearchedRefusedSchema);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page: any = (run.answer as any).web?.paths.find((path: any) => path.position_ref === parsed.data.position_ref)?.other_pages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .find((candidate: any) => candidate.page_ref === parsed.data.page_ref);
      if (page === undefined) return sendJson(req, res, 404, { error: "RUN_NOT_FOUND" });
      if (page.researched === undefined) {
        if (planMode === "FREE") return sendJson(req, res, 409, { error: "WEB_RESEARCHED_NOT_ON_PLAN", message: "WEB_RESEARCHED_NOT_ON_PLAN" }, C.ResearchedRefusedSchema);
        if (roomMode === "FULL" || roomMode === "BLOCKED") return sendJson(req, res, 409, { error: "WEB_RESEARCHED_WAITS_FOR_RESET", message: "WEB_RESEARCHED_WAITS_FOR_RESET" }, C.ResearchedRefusedSchema);
        page.researched = { state: "READING" };
        const settle = setTimeout(() => {
          const { researched: _reading, ...fields } = page;
          page.researched = /guide/iu.test(String(page.title)) ? { state: "ADDS_NOTHING" } : { state: "ADDS", sources: [{ ...fields, page_ref: undefined,
            extract_id: `S99-${String(page.page_ref).replace(/[^0-9]/gu, "").slice(0, 3) || "1"}`, quote: "A made-up line this page was found to hold.", published_on: null }] };
        }, RESEARCHED_READ_MS);
        settle.unref();
      }
      return sendJson(req, res, 202, { state: "READING" }, C.ResearchedAddedSchema);
    }
    if (parts[3] === "dig-links") {
      const parsed = C.DigLinkRecordRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.child_run_id === run.runRef) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      const outcome = linkDig(run.runRef, parsed.data);
      if (outcome === "NOT_OWNED") return sendJson(req, res, 404, { error: "RUN_NOT_FOUND" });
      if (outcome === "CONFLICT") return sendJson(req, res, 409, { error: "DIG_LINK_CONFLICT", message: "DIG_LINK_CONFLICT" });
      return sendJson(req, res, 200, { recorded: true }, C.DigLinkRecordedSchema);
    }
  }
  // R22 W5-1: "Write my report": the new version reads WRITING, then finished (or failed, with the switch report=FAIL). Once a finished version stands: "Keep digging" first.
  if (parts[1] === "runs" && parts.length === 4 && parts[3] === "report" && method === "POST") {
    const investigation = investigationOf(parts[2]!);
    if (investigation === undefined) return notFound(req, res, "RUN_NOT_FOUND", "No run with this id.");
    const newest = investigation.closings.at(-1);
    if (investigation.state === "CLOSED" && newest?.report !== "FAILED") return sendJson(req, res, 409, { error: "INVESTIGATION_CLOSED", message: "INVESTIGATION_CLOSED" });
    investigation.state = "CLOSED";
    const closing: Investigation["closings"][number] = { report_version: investigation.closings.length + 1, closed_at: iso(Date.now()), report: "WRITING", answer_id: null };
    investigation.closings.push(closing);
    const outcome = reportMode;
    setTimeout(() => {
      closing.report = outcome === "FAIL" ? "FAILED" : "READY";
      closing.answer_id = outcome === "FAIL" ? null : runs.get(investigation.root_run_id)?.answerId ?? null;
    }, REPORT_WRITING_MS);
    return sendJson(req, res, 202, { state: "WRITING", report_version: closing.report_version, waiting_for_digs: 0 }, C.InvestigationReportAcceptedSchema);
  }
  // R22 W5-1: "Keep digging".
  if (parts[1] === "runs" && parts.length === 4 && parts[3] === "reopen" && method === "POST") {
    const investigation = investigationOf(parts[2]!);
    if (investigation === undefined) return notFound(req, res, "RUN_NOT_FOUND", "No run with this id.");
    const newest = investigation.closings.at(-1);
    if (newest?.report === "WRITING") return sendJson(req, res, 409, { error: "INVESTIGATION_REPORT_WRITING", message: "INVESTIGATION_REPORT_WRITING", report_version: newest.report_version }, C.InvestigationReportWritingSchema);
    investigation.state = "OPEN";
    return sendJson(req, res, 200, { state: "OPEN" }, C.InvestigationReopenedSchema);
  }
  if (parts[1] === "runs" && parts.length === 5 && parts[3] === "investigation" && parts[4] === "close" && method === "POST") {
    // Draft: "Write my report" closes the investigation and writes a new report version (earlier ones are kept).
    const investigation = investigationOf(parts[2]!);
    if (investigation === undefined) return sendJson(req, res, 404, { error: "INVESTIGATION_NOT_FOUND" });
    if (investigation.state === "OPEN") {
      investigation.state = "CLOSED";
      const root = runs.get(investigation.root_run_id);
      investigation.closings.push({
        report_version: investigation.closings.length + 1, closed_at: iso(Date.now()), report: "READY", answer_id: root?.answerId ?? null
      });
    }
    return sendJson(req, res, 200, investigationBody(investigation), DraftInvestigationSchema);
  }

  // ---- runs ----
  if (parts[1] === "runs" && parts.length >= 3 && isGet) {
    const run = runs.get(parts[2]!);
    if (run === undefined) return notFound(req, res, "RUN_NOT_FOUND", "No run with this id.");
    const sub = parts.slice(3).join("/");
    // W2-7 (draft): a debate paused at the month wall says so once the contract knows `month_pause`.
    // Draft (journey-d2): the start time rides along on the draft view, and on the normal view once the contract knows it.
    if (sub === "") {
      return sendDraftable(withStartedAt(runProjection(run), run, draftView), C.RunProjectionSchema, stripRun,
        (body: unknown) => [...issuesOf(runDraftSchema)(body), ...issuesOf(runStartDraftSchema)(body)]);
    }
    if (sub === "answer") {
      if (stateOf(run) !== "SETTLED" || run.answer === undefined) return notFound(req, res, "ANSWER_NOT_FOUND", "This run has no answer yet.");
      return sendDraftable(answerNow(run), C.AnswerSchema, stripAnswer, checkAnswerDraft);
    }
    if (sub === "last-visit") return sendJson(req, res, 200, lastVisits.get(run.runRef) ?? { seen_at: null, items: null }, C.LastVisitSchema);
    if (sub === "dig-links") return sendJson(req, res, 200, digLinksOf(run.runRef), C.DigLinksSchema);
    if (sub === "investigation") {
      // Draft route (W1-6 / W3-2): the investigation this run belongs to.
      const investigation = investigationOf(run.runRef);
      if (investigation === undefined) return sendJson(req, res, 404, { error: "INVESTIGATION_NOT_FOUND" });
      // The website reads report versions (R22 W5-1); the draft view keeps the older shape, with its dig links and closings.
      if (!draftView) return sendJson(req, res, 200, investigationReports(investigation), C.InvestigationReportsSchema);
      return sendJson(req, res, 200, investigationBody(investigation), DraftInvestigationSchema);
    }
    if (sub === "events") return streamEvents(req, res, run);
    if (sub === "visibility") return sendJson(req, res, 200, { state: "PRIVATE", public_ref: null }, C.PublicationTransitionSchema);
  }

  logRequest(method, req.url ?? "", 404, "<- NOT MOCKED");
  res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify({ error: "NOT_MOCKED", message: `The mock does not serve ${method} ${path}.` }));
}

const server = createServer((req, res) => {
  route(req, res).catch((failure) => {
    process.stderr.write(`[mock] handler crashed for ${req.method} ${req.url}: ${failure instanceof Error ? failure.stack : String(failure)}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "MOCK_CRASHED", message: "The mock failed on this request; see its log." }));
    } else {
      res.end();
    }
  });
});

server.on("error", (failure: NodeJS.ErrnoException) => {
  process.stderr.write(`[mock] cannot listen on ${HOST}:${PORT}: ${failure.code ?? failure.message}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`${JSON.stringify({
    mock: "ready",
    url: `http://${HOST}:${PORT}`,
    engine_dir: ENGINE_DIR,
    seeded_bodies_checked: CHECKED,
    room: roomMode,
    ask: askMode,
    plan: planMode,
    draft_fields_sent: draftServed(C.AnswerSchema, runs.get(RUN_SETTLED)!.answer, stripAnswer),
    seed_runs: {
      settled: RUN_SETTLED, running: RUN_RUNNING, waiting: RUN_WAITING, failed: RUN_FAILED, story_writing: RUN_STORY_WRITING,
      free: RUN_FREE, search_failed: RUN_SEARCH_FAILED, dig: RUN_DIG,
      // W2-7: the dig trail (own view at level 1, then levels 2 and 3) and the debate paused at the month wall.
      dig_own_view: DIG_RUNS.ownView, dig_level_two: DIG_RUNS.levelTwo, dig_level_three: DIG_RUNS.levelThree, dig_deepest: DEEPEST_DIG.runRef, paused: RUN_PAUSED
    }
  })}\n`);
});

function shutdown(): void {
  for (const stream of openStreams) stream.end();
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
