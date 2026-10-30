/*
 * A small local MOCK of the DebateAIRO V3 API, so the website (apps/ui) can be click-tested without the real API,
 * database or AIs. Start it from the repository's dialectical-engine folder (see README.md):
 *
 *   node_modules/.bin/tsx tools/v4-mock-api/server.ts
 *
 * Every JSON body it sends is checked against the website's own contract schemas (packages/contract) — all seeded
 * bodies once at startup (a bad shape stops the start), and every body again just before it is sent.
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
  answerDraftParts, contractOrDraft, DraftAnswerWebSchema, DraftAskParentSchema, DraftInvestigationSchema, DraftNodeWebSchema,
  DraftRoomPartSchema, DraftUsagePartSchema, splitAsk, stripAnswer, stripNode, stripRoom, stripUsage, type DraftAskParent
} from "./web-draft.js";
import type { WebCase } from "./web-seed.js";

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

/** BLOCKED is a DRAFT word ("blocked until {reset}"); today's contract reads it as FULL (web-draft.ts stripRoom). */
const ROOM_MODES = ["FITS", "CLOSE", "FULL", "ALREADY_WAITING", "BLOCKED"] as const;
type RoomMode = (typeof ROOM_MODES)[number];
const ASK_MODES = ["AUTO", "ACCEPT", "WAITING", "ALREADY_WAITING", "LANGUAGE_CHOICE"] as const;
type AskMode = (typeof ASK_MODES)[number];
/** The person's plan: Plus (paid, the web step runs) or Free (never searches). */
const PLAN_MODES = ["PLUS", "FREE"] as const;
type PlanMode = (typeof PLAN_MODES)[number];

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
const QUIET = process.env.MOCK_QUIET === "1";
let roomMode: RoomMode = choice("MOCK_ROOM", process.env.MOCK_ROOM, ROOM_MODES, "FITS");
let askMode: AskMode = choice("MOCK_ASK", process.env.MOCK_ASK, ASK_MODES, "AUTO");
let planMode: PlanMode = choice("MOCK_PLAN", process.env.MOCK_PLAN, PLAN_MODES, "PLUS");

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

function settledRun(input: Readonly<{
  runRef: string; answerId: string; question: string; seq: number; askedAt: number; settleAt: number; storyReadyAt: number;
  web: WebCase;
}>): MockRun {
  return addRun({
    runRef: input.runRef,
    question: input.question,
    seq: input.seq,
    settleAt: input.settleAt,
    answerId: input.answerId,
    storyReadyAt: input.storyReadyAt,
    web: input.web,
    answer: seed.answer({
      answerId: input.answerId,
      runRef: input.runRef,
      question: input.question,
      askedAt: iso(input.askedAt),
      servedAt: iso(input.settleAt),
      web: input.web
    })
  });
}

settledRun({
  runRef: RUN_SETTLED, answerId: ANSWER_SETTLED, seq: 2,
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: Date.parse("2026-10-27T15:12:00.000Z"), settleAt: Date.parse("2026-10-27T15:40:00.000Z"), storyReadyAt: 0, web: "PAID"
});
addRun({ runRef: RUN_RUNNING, seq: 5, question: "Is a four-day work week good for productivity and for workers?" });
addRun({ runRef: RUN_WAITING, seq: 3, waiting: true, question: "Should my town close the old centre to cars at weekends?" });
addRun({
  runRef: RUN_FAILED, seq: 1, failedReason: FAILED_REASON,
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

type RunState = "QUEUED" | "WAITING" | "CLAIMED" | "RUNNING" | "HOLDING" | "SETTLED" | "FAILED";

function stateOf(run: MockRun, now = Date.now()): RunState {
  if (run.failedReason !== undefined) return "FAILED";
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
  members: Array<{ run_id: string; parent_run_id: string; places: string[]; mode: "quick" | "thorough" }>;
  closings: Array<{ version: number; closed_at: string }>;
};
const investigations = new Map<string, Investigation>();
/** Run id → the root run of its investigation. */
const investigationOfRun = new Map<string, string>();

function openInvestigation(rootRunId: string, closings: Investigation["closings"] = [], state: Investigation["state"] = "OPEN"): Investigation {
  const investigation: Investigation = { investigation_id: randomUUID(), root_run_id: rootRunId, state, members: [], closings };
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
  digLinks.push({ parent_run_id: parentRunId, child_run_id: link.child_run_id, places: [...link.places], mode: link.mode, created_at: iso(now) });
  const investigation = investigationOf(parentRunId) ?? openInvestigation(parentRunId);
  const placeholder = investigations.get(link.child_run_id);
  // A dig asked as a new question first had an investigation of its own; it joins its parent's.
  if (placeholder !== undefined && placeholder.members.length === 0 && placeholder.closings.length === 0) investigations.delete(link.child_run_id);
  investigation.members.push({ run_id: link.child_run_id, parent_run_id: parentRunId, places: [...link.places], mode: link.mode });
  investigation.state = "OPEN";
  investigationOfRun.set(link.child_run_id, investigation.root_run_id);
  return "RECORDED";
}

// Seeded: run 1111 was closed once (report version 1) and reopened by its dig 8888; 5555 and 7777 are open; the Free
// debate 6666 was closed. Run 4444 (failed) has none; 2222 and 3333 (running, waiting) are open.
openInvestigation(RUN_SETTLED, [{ version: 1, closed_at: "2026-10-28T09:00:00.000Z" }], "CLOSED");
linkDig(RUN_SETTLED, { child_run_id: RUN_DIG, places: ["p:n-renew-storage"], mode: "quick" }, Date.parse("2026-10-29T08:00:00.000Z"));
openInvestigation(RUN_STORY_WRITING);
openInvestigation(RUN_FREE, [{ version: 1, closed_at: "2026-10-26T10:00:00.000Z" }], "CLOSED");
openInvestigation(RUN_SEARCH_FAILED);
openInvestigation(RUN_RUNNING);
openInvestigation(RUN_WAITING);

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
    argument_language: ENGLISH,
    waits_until: state === "WAITING" ? waitsUntil(now) : null,
    waits_for: null
  };
}

function storyRead(run: MockRun, now = Date.now()) {
  const status = storyStatusOf(run, now);
  const writtenAt = iso(Math.max(run.storyReadyAt ?? 0, run.settleAt ?? 0));
  return seed.story(run.answerId!, status, writtenAt);
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
      models: [...MODELS]
    })),
    open_runs: open.map((run) => {
      const projection = runProjection(run, now);
      return {
        run_ref: run.runRef,
        question_line: run.question,
        state: projection.state,
        terminal_reason: projection.terminal_reason,
        created_at_sequence: run.seq
      };
    }),
    limit,
    offset,
    total: served.length
  };
}

function roomRead(mode: RoomMode, now = Date.now(), plan_id: PlanMode = planMode, reserveKept = anyInvestigationOpen()) {
  // Draft word: the person's one reserve is kept while an investigation is open (never on a blocked room).
  const reserve = reserveKept && mode !== "BLOCKED" ? { reserve_kept: true as const } : {};
  const plan = {
    plan_id,
    // shape_settings is left out on purpose: the contract allows only `true` or absent, and absent means "off".
    answer_words: { short: 300, standard: 700, detailed: 1500 },
    length_settings: true,
    settings_version: 20,
    ...reserve
  };
  // One builder per room word (a table: the source law wants a default and an exhaustive fall-through in any switch).
  const rooms: Readonly<Record<RoomMode, () => Record<string, unknown>>> = {
    FITS: () => ({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, ...plan }),
    CLOSE: () => ({ room: "CLOSE", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan }),
    FULL: () => ({ room: "FULL", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan }),
    ALREADY_WAITING: () => ({ room: "ALREADY_WAITING", scope: "PERSON_DAY", resets_at: waitsUntil(now), waiting_run_ref: RUN_WAITING, ...plan }),
    // Draft: a closing found no credits left, so everything waits for the day's limit to reset.
    BLOCKED: () => ({ room: "BLOCKED", scope: "PERSON_DAY", resets_at: nextUtcMidnight(now), waiting_run_ref: null, ...plan })
  };
  return rooms[mode]();
}

function billingUsage(now = Date.now(), plan_id: PlanMode = planMode) {
  const date = new Date(now);
  const daysToMonday = ((8 - date.getUTCDay()) % 7) || 7;
  return {
    plan_id,
    // Draft (owner Q14): a dig's share of today, rounded, as a percentage, per dig mode.
    dig_share: { quick: 20, thorough: 35 },
    windows: [
      { scope: "PERSON_DAY", percent: 14, resets_at: nextUtcMidnight(now) },
      { scope: "PERSON_WEEK", percent: 31, resets_at: iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + daysToMonday)) },
      { scope: "PERSON_MONTH", percent: 9, resets_at: iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) }
    ]
  };
}

/** The register's default plans (packages/register/src/billing-plans.ts), in US dollars. */
const BILLING_PLANS = Object.freeze({
  currency: "USD",
  plans: [
    { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, allowance_vs_plus: "0.04" },
    { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" },
    { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, allowance_vs_plus: "4" },
    { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, allowance_vs_plus: "30" }
  ]
});

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
function checkAnswerDraft(answer: any): string[] {
  const parts = answerDraftParts(answer);
  const problems: string[] = [];
  const web = DraftAnswerWebSchema.safeParse(parts.web);
  if (!web.success) problems.push(`path_research: ${JSON.stringify(web.error.issues)}`);
  for (const node of parts.nodes) {
    const result = DraftNodeWebSchema.safeParse(node.web);
    if (!result.success) problems.push(`node ${node.id}: ${JSON.stringify(result.error.issues)}`);
  }
  return problems;
}

function investigationBody(investigation: Investigation) {
  return {
    investigation_id: investigation.investigation_id,
    root_run_id: investigation.root_run_id,
    state: investigation.state,
    members: investigation.members.map((member) => ({ ...member, places: [...member.places] })),
    closings: investigation.closings.map((closing) => ({ ...closing }))
  };
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
        checkDraft(`GET /v1/asks/room (${plan}, ${mode}, reserve ${reserve})`, C.AskRoomResponseSchema, roomRead(mode, Date.now(), plan, reserve), stripRoom, DraftRoomPartSchema);
      }
    }
    checkDraft(`GET /v1/billing/usage (${plan})`, C.BillingUsageResponseSchema, billingUsage(Date.now(), plan), stripUsage, DraftUsagePartSchema);
  }
  check("GET /v1/billing/plans", C.BillingPlansResponseSchema, BILLING_PLANS);
  check("GET /v1/answers", C.AnswerIndexSchema, answerIndex(50, 0));
  for (const run of runs.values()) {
    check(`GET /v1/runs/${run.runRef}`, C.RunProjectionSchema, runProjection(run));
    check(`GET /v1/runs/${run.runRef}/visibility`, C.PublicationTransitionSchema, { state: "PRIVATE", public_ref: null });
    check(`GET /v1/runs/${run.runRef}/last-visit`, C.LastVisitSchema, { seen_at: null, items: null });
    check(`GET /v1/runs/${run.runRef}/dig-links`, C.DigLinksSchema, digLinksOf(run.runRef));
    const investigation = investigationOf(run.runRef);
    if (investigation !== undefined) check(`GET /v1/runs/${run.runRef}/investigation (draft)`, DraftInvestigationSchema, investigationBody(investigation));
    if (run.answer === undefined) continue;
    const problems = checkAnswerDraft(run.answer);
    if (problems.length > 0) throw new Error(`MOCK_SEED_INVALID: GET /v1/answers/${run.answerId} draft fields:\n${problems.join("\n")}`);
    check(`GET /v1/answers/${run.answerId}`, C.AnswerSchema, contractOrDraft(C.AnswerSchema, run.answer, stripAnswer).body);
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
  if (state === "RUNNING" && run.settleAt !== undefined) {
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
  if (roomMode === "FULL" || roomMode === "BLOCKED") return "WAITING";
  if (roomMode === "ALREADY_WAITING") return "ALREADY_WAITING";
  return "ACCEPT";
}

async function postAsk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (failure) {
    const code = failure instanceof Error ? failure.message : "INVALID_JSON";
    sendJson(req, res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code === "PAYLOAD_TOO_LARGE" ? code : "MALFORMED_REQUEST", message: code });
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
  if (parent !== null && !runs.has(parent.parent_run_id)) {
    log("PARENT_NOT_FOUND", null);
    sendJson(req, res, 404, { error: "RUN_NOT_FOUND", message: "RUN_NOT_FOUND" });
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
  const settleAt = now + RUN_SECONDS * 1000;
  // Free never searches; "#webfail" in the question plays a debate whose search failed.
  const web: WebCase = ask.plan_tier === "free" ? "FREE" : /#webfail/iu.test(question) ? "FAILED" : "PAID";
  const run = settledRun({
    runRef, answerId: randomUUID(), question, seq, askedAt: now, settleAt,
    storyReadyAt: settleAt + POSTED_STORY_SECONDS * 1000, web
  });
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
    ask_effective: effectiveAskMode(),
    now: iso(now),
    reading_level: readingLevel,
    reserve_kept: anyInvestigationOpen() && roomMode !== "BLOCKED",
    draft_fields_sent: {
      answer: draftServed(C.AnswerSchema, runs.get(RUN_SETTLED)!.answer, stripAnswer),
      room: draftServed(C.AskRoomResponseSchema, roomRead(roomMode, now), stripRoom),
      usage: draftServed(C.BillingUsageResponseSchema, billingUsage(now), stripUsage)
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
      web: run.web ?? null
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
    if (parts[1] === "set" && (isGet || method === "POST")) {
      try {
        const room = url.searchParams.get("room");
        const ask = url.searchParams.get("ask");
        const plan = url.searchParams.get("plan");
        if (room !== null) roomMode = choice("room", room, ROOM_MODES, roomMode);
        if (ask !== null) askMode = choice("ask", ask, ASK_MODES, askMode);
        if (plan !== null) planMode = choice("plan", plan, PLAN_MODES, planMode);
      } catch (failure) {
        return sendJson(req, res, 400, { error: "MOCK_SETTING_INVALID", message: failure instanceof Error ? failure.message : String(failure) });
      }
      return sendJson(req, res, 200, mockState());
    }
    if (parts[1] === "sign-in" && isGet) {
      return sendJson(req, res, 200, { signed_in: true, next: "/v4" }, undefined, { "set-cookie": sessionCookies() });
    }
    if (parts[1] === "sign-out" && isGet) {
      return sendJson(req, res, 200, { signed_in: false }, undefined, { "set-cookie": clearedSessionCookies() });
    }
    return notFound(req, res, "MOCK_CONTROL_NOT_FOUND", "Known: /__mock/state, /__mock/set?room=&ask=&plan=, /__mock/draft/v1/..., /__mock/sign-in, /__mock/sign-out");
  }

  // ---- the website edge's readiness probe (server.mjs /readyz forwards to <API>/readyz) ----
  if (path === "/readyz" && isGet) return sendJson(req, res, 200, { ready: true, releaseKey: null, reasons: [] });

  if (parts[0] !== "v1") return notFound(req, res, "NOT_FOUND", `The mock serves /v1/... only (got ${path}).`);

  // ---- session, gates, public reads ----
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
  if (path === "/v1/deployment" && isGet) return sendJson(req, res, 200, DEPLOYMENT, C.DeploymentSchema);

  // ---- asking ----
  if (path === "/v1/asks/room" && isGet) {
    const query = C.AskRoomQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) {
      return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "The room query does not pass AskRoomQuerySchema.", issues: query.error.issues });
    }
    return sendDraftable(roomRead(roomMode), C.AskRoomResponseSchema, stripRoom, issuesOf(DraftRoomPartSchema));
  }
  if (path === "/v1/asks" && method === "POST") return postAsk(req, res);

  // ---- billing ----
  if (path === "/v1/billing/usage" && isGet) return sendDraftable(billingUsage(), C.BillingUsageResponseSchema, stripUsage, issuesOf(DraftUsagePartSchema));
  if (path === "/v1/billing/plans" && isGet) return sendJson(req, res, 200, BILLING_PLANS, C.BillingPlansResponseSchema);

  // ---- answers ----
  if (path === "/v1/answers" && isGet) {
    const limit = positiveInt(url.searchParams.get("limit"), 50);
    const offset = positiveInt(url.searchParams.get("offset"), 0);
    if (limit === null || limit < 1 || offset === null) {
      return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "limit and offset must be whole numbers (limit at least 1)." });
    }
    return sendJson(req, res, 200, answerIndex(limit, offset), C.AnswerIndexSchema);
  }
  if (parts[1] === "answers" && parts.length >= 3 && isGet) {
    const run = runsByAnswer.get(parts[2]!);
    if (run === undefined || run.answer === undefined || stateOf(run) !== "SETTLED") {
      return notFound(req, res, "ANSWER_NOT_FOUND", "No answer with this id.");
    }
    const version = url.searchParams.get("version");
    if (version !== null && version !== "1") return notFound(req, res, "ANSWER_VERSION_NOT_FOUND", "Only version 1 exists.");
    const sub = parts.slice(3).join("/");
    if (sub === "") return sendDraftable(run.answer, C.AnswerSchema, stripAnswer, checkAnswerDraft);
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
    if (parts[3] === "dig-links") {
      const parsed = C.DigLinkRecordRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.child_run_id === run.runRef) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      const outcome = linkDig(run.runRef, parsed.data);
      if (outcome === "NOT_OWNED") return sendJson(req, res, 404, { error: "RUN_NOT_FOUND" });
      if (outcome === "CONFLICT") return sendJson(req, res, 409, { error: "DIG_LINK_CONFLICT", message: "DIG_LINK_CONFLICT" });
      return sendJson(req, res, 200, { recorded: true }, C.DigLinkRecordedSchema);
    }
  }
  if (parts[1] === "runs" && parts.length === 5 && parts[3] === "investigation" && parts[4] === "close" && method === "POST") {
    // Draft: "Write my report" closes the investigation and writes a new report version (earlier ones are kept).
    const investigation = investigationOf(parts[2]!);
    if (investigation === undefined) return sendJson(req, res, 404, { error: "INVESTIGATION_NOT_FOUND" });
    if (investigation.state === "OPEN") {
      investigation.state = "CLOSED";
      investigation.closings.push({ version: investigation.closings.length + 1, closed_at: iso(Date.now()) });
    }
    return sendJson(req, res, 200, investigationBody(investigation), DraftInvestigationSchema);
  }

  // ---- runs ----
  if (parts[1] === "runs" && parts.length >= 3 && isGet) {
    const run = runs.get(parts[2]!);
    if (run === undefined) return notFound(req, res, "RUN_NOT_FOUND", "No run with this id.");
    const sub = parts.slice(3).join("/");
    if (sub === "") return sendJson(req, res, 200, runProjection(run), C.RunProjectionSchema);
    if (sub === "answer") {
      if (stateOf(run) !== "SETTLED" || run.answer === undefined) return notFound(req, res, "ANSWER_NOT_FOUND", "This run has no answer yet.");
      return sendDraftable(run.answer, C.AnswerSchema, stripAnswer, checkAnswerDraft);
    }
    if (sub === "last-visit") return sendJson(req, res, 200, lastVisits.get(run.runRef) ?? { seen_at: null, items: null }, C.LastVisitSchema);
    if (sub === "dig-links") return sendJson(req, res, 200, digLinksOf(run.runRef), C.DigLinksSchema);
    if (sub === "investigation") {
      // Draft route (W1-6 / W3-2): the investigation this run belongs to.
      const investigation = investigationOf(run.runRef);
      if (investigation === undefined) return sendJson(req, res, 404, { error: "INVESTIGATION_NOT_FOUND" });
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
      free: RUN_FREE, search_failed: RUN_SEARCH_FAILED, dig: RUN_DIG
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
