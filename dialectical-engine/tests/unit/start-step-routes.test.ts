// tests/unit/start-step-routes.test.ts
// V4 start step, Task 30 (spec 2026-11-03 §4.1; owner answers Q2 and Q8 of 4 Nov): THE FOUR CALLS BEFORE START, over HTTP. POST
// /v1/asks/paths/lists and …/merge answer as an event stream (one frame per event, a keep-alive comment, exactly one end, last); …/combine
// and …/fit answer once, as JSON. The front door is the clarifying questions' (a signed-in person only; no crisis in the line or in the
// person's own words, the consent given, on the preview's team, not from a blocked country; the step, its key and the active version there;
// a pool with room), each refusal answered `none` before the step is asked. A reference that does not verify is refused before a byte of a
// stream; a reference of an older settings version is not (answer Q8). The step itself is a scripted port here (its own tests are
// start-step-api-lists and start-step-api-merge); the references are signed with a real key. Data is made up.
import { EventEmitter } from "node:events";
import type { FastifyReply } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import {
  START_PATHS_EXPIRED, START_PATHS_INVALID, START_PATHS_STALE, parseStartStepFrames, type RunProjection, type StartList, type StartListsEvent
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { startCodeMenu } from "@debateai/map";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, type DebateShapePlanKey, type PlanId } from "@debateai/register";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomReader } from "../../apps/api/src/ask-room.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import {
  newStartStepKey, signStartCheck, signStartCombine, signStartList, signStartMenu, startMembersHash, type StartStepKey
} from "../../apps/api/src/start-step/signing.js";
import {
  startStepBindingOf, type StartCombineInput, type StartFitInput, type StartListsInput, type StartMergeInput, type StartStepPort
} from "../../apps/api/src/start-step/step.js";
import { START_STREAM_DRAIN_POLL_MS, openStartStream, type StartStream } from "../../apps/api/src/start-step/stream.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("start-step-routes");
const OWNER = IDENTITY.authenticated.ownerRef;
const SCOPE = `owner:${OWNER}`;
const HEADERS = testSessionHeaders(IDENTITY, true);
const ACTIVE = 31;
const Q = "Should the town build a second ferry pier before next summer?";
const OTHER_Q = "Should the town close the old ferry pier?";
const EN = Object.freeze({ code: "en", name: "English" });
const TRACE = Object.freeze({ eld: null, fast: null, contractHash: null });
const LOCK: QuestionLanguageLock = Object.freeze({ language: EN, source: "ELD_SITE" as const, siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: TRACE, recordCode: "ELD_SITE", localReason: null });
const MENU_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const PARENT_RUN = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const OTHERS_RUN = "7a2b3c4d-5e6f-4a70-8b81-c2d3e4f50617";
const PREVIEW_CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "start-step-routes-fixture"
}))!;

const listOf = (no: number): StartList => ({
  list_no: no,
  angles: [{ angle_id: "g1", kind: "PRACTICAL", label: "What building it would take" }],
  viewpoints: [{ viewpoint_id: `pt${no}1`, title: `Queues at the old pier ${no}`, question: "Would the queues at the old pier change the answer?",
    why: "It decides whether the second pier pays off.", angle_id: "g1" }]
});
type Bound = Readonly<{ questionLine?: string; planKey?: DebateShapePlanKey; settingsVersion?: number }>;
const binding = (over: Bound = {}) => ({ ownerScope: SCOPE, questionLine: over.questionLine ?? Q,
  planKey: over.planKey ?? "premium" as DebateShapePlanKey, settingsVersion: over.settingsVersion ?? ACTIVE });
const checkRefOf = (key: StartStepKey, over: Bound = {}) => signStartCheck(key, { ...binding(over), lock: LOCK, originalQuestionLine: null });
const signedList = (key: StartStepKey, no: number, over: Bound = {}) => ({ list: listOf(no), ref: signStartList(key, { ...binding(over), list: listOf(no) }) });
const signedMenu = (key: StartStepKey, no: number, over: Bound = {}) => {
  const menu = startCodeMenu(listOf(no), { menuId: MENU_ID, language: EN });
  return { menu, ref: signStartMenu(key, { ...binding(over), menu }) };
};

type Seen = { lists: StartListsInput[]; merges: StartMergeInput[]; combines: StartCombineInput[]; fits: StartFitInput[]; signals: AbortSignal[] };
type Script = Partial<Pick<StartStepPort, "lists" | "merge" | "combine" | "fit">>;
/** A scripted step: by default the lists send check, list and end; the merge a code menu; the combine and the fit an AI answer. */
function portOf(key: StartStepKey, script: Script = {}): Readonly<{ port: StartStepPort; seen: Seen }> {
  const seen: Seen = { lists: [], merges: [], combines: [], fits: [], signals: [] };
  const port: StartStepPort = Object.freeze({
    route: "PREVIEW" as const,
    async lists(input: StartListsInput, emit: (event: StartListsEvent) => void, signal: AbortSignal) {
      seen.lists.push(input);
      seen.signals.push(signal);
      if (script.lists !== undefined) return script.lists(input, emit, signal);
      emit({ event: "check", data: { check_ref: checkRefOf(key), language: EN, seats: 4 } });
      emit({ event: "list", data: { list: signedList(key, 1) } });
      emit({ event: "end", data: { reason: "DONE" } });
    },
    async merge(input: StartMergeInput, signal: AbortSignal) {
      seen.merges.push(input);
      seen.signals.push(signal);
      return script.merge !== undefined ? script.merge(input, signal) : { source: "CODE" as const, menu: signedMenu(key, 1) };
    },
    async combine(input: StartCombineInput, signal: AbortSignal) {
      seen.combines.push(input);
      if (script.combine !== undefined) return script.combine(input, signal);
      const context = input.context.kind === "MENU" ? { kind: "MENU" as const, menuId: input.context.menu_id }
        : { kind: "DIG" as const, parentRunId: input.context.parent_run_id };
      return { source: "AI" as const, title: "Queues and winters", question: "Do the queues and the winters decide it?",
        combine_ref: signStartCombine(key, { ownerScope: SCOPE, context, membersHash: startMembersHash(input.members), title: "Queues and winters",
          question: "Do the queues and the winters decide it?" }) };
    },
    async fit(input: StartFitInput, signal: AbortSignal) {
      seen.fits.push(input);
      return script.fit !== undefined ? script.fit(input, signal) : { source: "AI" as const, fits_key: "p1" };
    }
  });
  return { port, seen };
}

const RUN: RunProjection = Object.freeze({ run_ref: PARENT_RUN, question_line: "Should the town build a second ferry pier?", state: "SETTLED",
  terminal_reason: null, hold_until: null, argument_language: { tag: "en", name: "English" } });
type Over = Readonly<{
  port?: StartStepPort | null; key?: StartStepKey | null; version?: number | null; consent?: "given" | "required"; country?: string | null;
  offTeam?: boolean; pool?: () => Promise<Readonly<{ empty: boolean; funding: null }>>; draining?: () => boolean;
  timing?: Readonly<{ heartbeatMs?: number; streamMaxLifeMs?: number }>; run?: RunProjection | null;
}>;
function apiOver(key: StartStepKey, port: StartStepPort | undefined, over: Over = {}) {
  const sessions = { ...testSessionApplication([IDENTITY]), readSensitiveDataConsent: async () => over.consent ?? "given" as const };
  const application = { readRun: async (runId: string) => runId === PARENT_RUN ? over.run === undefined ? RUN : over.run : null } as unknown as AskApplication;
  const view: AdmissionView = Object.freeze({ registerVersion: over.version ?? ACTIVE, modelScorecardInForce: false });
  return buildApi({
    application, sessions, allowedOrigin: TEST_APP_ORIGIN,
    ...(over.port === null || port === undefined ? {} : { startStep: over.port ?? port }),
    ...(over.key === null ? {} : { startStepKey: over.key ?? key }),
    ...(over.version === null ? {} : { admissionView: async () => view }),
    ...(over.pool === undefined ? {} : { askRoom: { readPersonPool: over.pool } as unknown as AskRoomReader }),
    ...(over.country === undefined ? {} : { countryGate: { ask: () => over.country, recordedCountry: () => null, record: () => undefined } as never }),
    ...(over.offTeam === true ? { previewProviderTestConfig: PREVIEW_CONFIG, previewTeamUserIds: [] } : {}),
    ...(over.draining === undefined ? {} : { readiness: { readiness: () => { throw new Error("not read"); }, draining: over.draining } as never }),
    ...(over.timing === undefined ? {} : { startStepTiming: over.timing })
  });
}
type Api = ReturnType<typeof apiOver>;
const post = (api: Api, path: string, payload: unknown, headers: Readonly<Record<string, string>> = HEADERS) =>
  api.inject({ method: "POST", url: `/v1/asks/paths/${path}`, headers, payload: payload as Record<string, unknown> });
const framesOf = (body: string) => parseStartStepFrames(body).events.map((one) => ({ event: one.event, data: one.data }));
const namesOf = (body: string) => framesOf(body).map((one) => one.event);

const LISTS_BODY = { question_line: Q, reading_level: "plain" };
const mergeBody = (key: StartStepKey, over: Readonly<{ check?: Bound; list?: Bound; prior?: Bound | null; matters?: string }> = {}) => ({
  question_line: Q, check_ref: checkRefOf(key, over.check), reading_level: "plain",
  lists: [signedList(key, over.prior === undefined || over.prior === null ? 1 : 2, over.list)],
  ...(over.prior === undefined || over.prior === null ? {} : { prior_menu: signedMenu(key, 1, over.prior) }),
  ...(over.matters === undefined ? {} : { clarify: { matters: over.matters } })
});
const MEMBERS = [{ viewpoint_id: "pt11", pick_no: null, title: "Queues", question: "Do the queues decide it?" },
  { viewpoint_id: "pt12", pick_no: null, title: "Winters", question: "Do the winters decide it?" }];
const combineBody = (key: StartStepKey, context?: unknown) => ({
  context: context ?? { kind: "MENU", question_line: Q, check_ref: checkRefOf(key), menu_id: MENU_ID }, reading_level: "plain", members: MEMBERS });
const fitBody = (key: StartStepKey, ownText = "What the fishermen think of the pier") => ({ question_line: Q, check_ref: checkRefOf(key),
  reading_level: "plain", own_text: ownText, paths: [{ key: "p1", title: "Queues", question: "Do the queues decide it?" }] });
const CRISIS = "I want to kill myself tonight";

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /v1/asks/paths/lists", () => {
  it("streams the step's events as text/event-stream: check, list, end; the step reads under the room's binding", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const response = await post(api, "lists", LISTS_BODY, { ...HEADERS, "cf-ipcountry": "RO" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(namesOf(response.body)).toEqual(["check", "list", "end"]);
      expect(framesOf(response.body).at(-1)).toEqual({ event: "end", data: { reason: "DONE" } });
      expect(seen.lists).toHaveLength(1);
      expect(seen.lists[0]).toMatchObject({ question_line: Q, reading_level: "plain", ownerRef: OWNER, ownerScope: SCOPE, funding: null,
        planKey: "premium", settingsVersion: ACTIVE, country: "RO" });
      expect(seen.signals[0]!.aborted).toBe(true);
    } finally {
      await api.close();
    }
  });

  it("nobody signed in: 401 SESSION_REQUIRED; a member the contract does not know or a line over the limit: 400; the step is not asked", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      for (const path of ["lists", "merge", "combine", "fit"]) {
        const anonymous = await post(api, path, LISTS_BODY, { origin: TEST_APP_ORIGIN });
        expect(anonymous.statusCode, path).toBe(401);
        expect(anonymous.json(), path).toEqual({ error: "SESSION_REQUIRED" });
      }
      const bodies: Readonly<Record<string, Record<string, unknown>>> = { lists: LISTS_BODY, merge: mergeBody(key), combine: combineBody(key), fit: fitBody(key) };
      for (const [path, body] of Object.entries(bodies)) {
        const extra = await post(api, path, { ...body, plan_tier: "premium" });
        expect(extra.statusCode, path).toBe(400);
        expect(extra.json(), path).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      }
      const long = "é".repeat(4_097);
      for (const [path, body] of [["lists", { ...LISTS_BODY, question_line: long }], ["merge", { ...mergeBody(key), question_line: long }],
        ["fit", { ...fitBody(key), question_line: long }],
        ["combine", combineBody(key, { kind: "MENU", question_line: long, check_ref: checkRefOf(key), menu_id: MENU_ID })]] as const) {
        expect((await post(api, path, body)).statusCode, path).toBe(400);
      }
      expect([seen.lists, seen.merges, seen.combines, seen.fits].map((calls) => calls.length)).toEqual([0, 0, 0, 0]);
    } finally {
      await api.close();
    }
  });

  it.each([
    ["the line in crisis", {}, { question_line: CRISIS, reading_level: "plain" }],
    ["the original line of a rewrite in crisis", {}, { question_line: Q, reading_level: "plain",
      question_language_choice: { check_ref: "b2ZmZXI.c2lnbmVk", choice: "USE_REWRITE", original_question_line: CRISIS } }],
    ["before the sensitive-data consent", { consent: "required" as const }, LISTS_BODY],
    ["off the preview's team", { offTeam: true }, LISTS_BODY],
    ["from a blocked country", { country: "COUNTRY_ASK_BLOCKED" }, LISTS_BODY]
  ])("%s: none NOT_ASKED, end NONE, and the words go to no step", async (_name, over: Over, body) => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port, over);
    try {
      const response = await post(api, "lists", body);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      expect(framesOf(response.body)).toEqual([{ event: "none", data: { reason: "NOT_ASKED" } }, { event: "end", data: { reason: "NONE" } }]);
      expect(seen.lists).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it.each([
    ["an empty pool", "POOL_EMPTY", { pool: async () => ({ empty: true, funding: null }) }],
    ["a pool that cannot be read", "POOL_EMPTY", { pool: async () => { throw new Error("down"); } }],
    ["no step", "OFF", { port: null }],
    ["no key", "OFF", { key: null }],
    ["no active version", "OFF", { version: null }]
  ])("%s: none %s, end NONE, nothing asked", async (_name, reason, over: Over) => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port, over);
    try {
      const response = await post(api, "lists", LISTS_BODY);
      expect(framesOf(response.body)).toEqual([{ event: "none", data: { reason } }, { event: "end", data: { reason: "NONE" } }]);
      expect(seen.lists).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("a step on the route NONE: none OFF, and it is not asked", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, Object.freeze({ ...port, route: "NONE" as const }));
    try {
      expect(framesOf((await post(api, "lists", LISTS_BODY)).body)).toEqual([{ event: "none", data: { reason: "OFF" } },
        { event: "end", data: { reason: "NONE" } }]);
      expect(seen.lists).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("with room in the pool, the step is asked with what funds the person", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port, { pool: async () => ({ empty: false, funding: null }) });
    try {
      expect(namesOf((await post(api, "lists", LISTS_BODY)).body)).toEqual(["check", "list", "end"]);
      expect(seen.lists).toHaveLength(1);
    } finally {
      await api.close();
    }
  });

  it("an event the contract refuses, or a step that fails: none TRANSPORT, end NONE, nothing after", async () => {
    const key = newStartStepKey();
    const refusing = portOf(key, { lists: async (_input, emit) => {
      emit({ event: "progress", data: { answered: 1, of: 4 } });
      emit({ event: "progress", data: { answered: 99, of: 4 } });
      emit({ event: "end", data: { reason: "DONE" } });
    } });
    const failing = portOf(key, { lists: async (_input, emit) => {
      emit({ event: "progress", data: { answered: 0, of: 4 } });
      throw new Error("the step broke");
    } });
    const silent = portOf(key, { lists: async () => undefined });
    for (const [port, first] of [[refusing.port, ["progress"]], [failing.port, ["progress"]], [silent.port, []]] as const) {
      const api = apiOver(key, port);
      try {
        const response = await post(api, "lists", LISTS_BODY);
        expect(namesOf(response.body)).toEqual([...first, "none", "end"]);
        expect(framesOf(response.body).slice(-2)).toEqual([{ event: "none", data: { reason: "TRANSPORT" } }, { event: "end", data: { reason: "NONE" } }]);
      } finally {
        await api.close();
      }
    }
  });

  it("a heartbeat every heartbeatMs while the step writes; draining ends the lists with end DRAINING and stops listening", async () => {
    const key = newStartStepKey();
    let draining = false;
    const { port, seen } = portOf(key, { lists: async (_input, emit, signal) => {
      emit({ event: "check", data: { check_ref: checkRefOf(key), language: EN, seats: 4 } });
      setTimeout(() => { draining = true; }, 100);
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); });
      emit({ event: "list", data: { list: signedList(key, 1) } });
    } });
    const api = apiOver(key, port, { draining: () => draining, timing: { heartbeatMs: 20 } });
    try {
      const started = Date.now();
      const response = await post(api, "lists", LISTS_BODY);
      expect(Date.now() - started).toBeGreaterThanOrEqual(START_STREAM_DRAIN_POLL_MS - 50);
      expect(framesOf(response.body)).toEqual([{ event: "check", data: { check_ref: expect.any(String), language: EN, seats: 4 } },
        { event: "end", data: { reason: "DRAINING" } }]);
      expect(response.body.split(": keep-alive\n\n").length - 1).toBeGreaterThanOrEqual(5);
      expect(response.body.endsWith("event: end\ndata: {\"reason\":\"DRAINING\"}\n\n")).toBe(true);
      expect(seen.signals[0]!.aborted).toBe(true);
    } finally {
      await api.close();
    }
  });

  it("past the stream's longest life: none DEADLINE, end NONE", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key, { lists: async (_input, emit, signal) => {
      emit({ event: "progress", data: { answered: 0, of: 4 } });
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); });
    } });
    const api = apiOver(key, port, { timing: { heartbeatMs: 1_000, streamMaxLifeMs: 60 } });
    try {
      expect(framesOf((await post(api, "lists", LISTS_BODY)).body)).toEqual([{ event: "progress", data: { answered: 0, of: 4 } },
        { event: "none", data: { reason: "DEADLINE" } }, { event: "end", data: { reason: "NONE" } }]);
      expect(seen.signals[0]!.aborted).toBe(true);
    } finally {
      await api.close();
    }
  });

  it("the page goes: the step's signal aborts", async () => {
    const key = newStartStepKey();
    let listening: AbortSignal | null = null;
    const { port } = portOf(key, { lists: async (_input, emit, signal) => {
      listening = signal;
      emit({ event: "check", data: { check_ref: checkRefOf(key), language: EN, seats: 4 } });
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); });
    } });
    const api = apiOver(key, port, { timing: { heartbeatMs: 20 } });
    const page = new AbortController();
    try {
      await api.listen({ host: "127.0.0.1", port: 0 });
      const address = api.server.address();
      if (address === null || typeof address === "string") throw new Error("Expected a TCP test listener");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/asks/paths/lists`, { method: "POST", signal: page.signal,
        headers: { ...HEADERS, "content-type": "application/json" }, body: JSON.stringify(LISTS_BODY) });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain("event: check");
      page.abort();
      const until = Date.now() + 2_000;
      while ((listening as AbortSignal | null)?.aborted !== true && Date.now() < until) await new Promise((resolve) => { setTimeout(resolve, 10); });
      expect((listening as AbortSignal | null)?.aborted).toBe(true);
    } finally {
      page.abort();
      await api.close();
    }
  });
});

describe("POST /v1/asks/paths/merge", () => {
  it("verifies the references, then streams the menu and end DONE", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const response = await post(api, "merge", mergeBody(key));
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      expect(framesOf(response.body)).toEqual([{ event: "menu", data: { source: "CODE", menu: signedMenu(key, 1) } },
        { event: "end", data: { reason: "DONE" } }]);
      expect(seen.merges[0]).toMatchObject({ question_line: Q, ownerScope: SCOPE, planKey: "premium", settingsVersion: ACTIVE });
    } finally {
      await api.close();
    }
  });

  it("an answer of none streams none and end NONE", async () => {
    const key = newStartStepKey();
    const { port } = portOf(key, { merge: async () => ({ source: "NONE" as const, reason: "DEADLINE" as const }) });
    const api = apiOver(key, port);
    try {
      expect(framesOf((await post(api, "merge", mergeBody(key))).body)).toEqual([{ event: "none", data: { reason: "DEADLINE" } },
        { event: "end", data: { reason: "NONE" } }]);
    } finally {
      await api.close();
    }
  });

  it.each([
    ["the menu so far of another reading (another line)", { prior: { questionLine: OTHER_Q } }],
    ["the menu so far signed for another plan", { prior: { planKey: "plus" as const } }],
    ["a list signed for another plan", { list: { planKey: "plus" as const } }],
    ["a list of another version than its check", { prior: null, list: { settingsVersion: 30 } }]
  ])("%s: 409 START_PATHS_STALE before any byte of a stream, and the step is not asked", async (_name, over) => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const response = await post(api, "merge", mergeBody(key, over));
      expect(response.statusCode).toBe(409);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toEqual({ error: START_PATHS_STALE, message: START_PATHS_STALE });
      expect(seen.merges).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("a reference that does not verify: 400 START_PATHS_INVALID before any byte", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const forged = { ...mergeBody(key), check_ref: checkRefOf(newStartStepKey()) };
      const response = await post(api, "merge", forged);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: START_PATHS_INVALID, message: START_PATHS_INVALID });
      expect(seen.merges).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("answer Q8: a reading signed under an older settings version streams its menu, on the active version", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const old = { settingsVersion: 30 };
      const response = await post(api, "merge", mergeBody(key, { check: old, list: old, prior: old }));
      expect(response.statusCode).toBe(200);
      expect(namesOf(response.body)).toEqual(["menu", "end"]);
      expect(seen.merges).toHaveLength(1);
      expect(seen.merges[0]!.settingsVersion).toBe(ACTIVE);
    } finally {
      await api.close();
    }
  });

  it("the front door answers first: what the person said in crisis, none NOT_ASKED; an empty pool, none POOL_EMPTY; even with a forged reference", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const crisis = apiOver(key, port);
    const empty = apiOver(key, port, { pool: async () => ({ empty: true, funding: null }) });
    try {
      expect(framesOf((await post(crisis, "merge", mergeBody(key, { matters: CRISIS }))).body))
        .toEqual([{ event: "none", data: { reason: "NOT_ASKED" } }, { event: "end", data: { reason: "NONE" } }]);
      const forged = { ...mergeBody(key), check_ref: checkRefOf(newStartStepKey()) };
      expect(framesOf((await post(empty, "merge", forged)).body))
        .toEqual([{ event: "none", data: { reason: "POOL_EMPTY" } }, { event: "end", data: { reason: "NONE" } }]);
      expect(seen.merges).toEqual([]);
    } finally {
      await crisis.close();
      await empty.close();
    }
  });

  it("draining while the merge runs: none DRAINING, end NONE; a menu that comes after is not written", async () => {
    const key = newStartStepKey();
    let draining = false;
    const { port } = portOf(key, { merge: async (_input, signal) => {
      setTimeout(() => { draining = true; }, 50);
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => { resolve(); }, { once: true }); });
      return { source: "CODE" as const, menu: signedMenu(key, 1) };
    } });
    const api = apiOver(key, port, { draining: () => draining, timing: { heartbeatMs: 20 } });
    try {
      const response = await post(api, "merge", mergeBody(key));
      expect(framesOf(response.body)).toEqual([{ event: "none", data: { reason: "DRAINING" } }, { event: "end", data: { reason: "NONE" } }]);
      expect(response.body).toContain(": keep-alive\n\n");
    } finally {
      await api.close();
    }
  });

  it("a menu the contract refuses: none TRANSPORT", async () => {
    const key = newStartStepKey();
    const spoiled = signedMenu(key, 1);
    const { port } = portOf(key, { merge: async () => ({ source: "AI" as const,
      menu: { ...spoiled, menu: { ...spoiled.menu, viewpoints: [{ ...spoiled.menu.viewpoints[0]!, repeat_ids: ["pt16"] }] } } }) });
    const api = apiOver(key, port);
    try {
      expect(framesOf((await post(api, "merge", mergeBody(key))).body)).toEqual([{ event: "none", data: { reason: "TRANSPORT" } },
        { event: "end", data: { reason: "NONE" } }]);
    } finally {
      await api.close();
    }
  });
});

describe("POST /v1/asks/paths/combine and …/fit", () => {
  it("answer once as JSON, read under the room's binding", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    try {
      const combined = await post(api, "combine", combineBody(key));
      expect(combined.statusCode).toBe(200);
      expect(combined.headers["content-type"]).toContain("application/json");
      expect(combined.json()).toMatchObject({ source: "AI", title: "Queues and winters", question: "Do the queues and the winters decide it?" });
      expect(seen.combines[0]).toMatchObject({ ownerScope: SCOPE, planKey: "premium", settingsVersion: ACTIVE, digParent: null });
      const fitted = await post(api, "fit", fitBody(key));
      expect(fitted.json()).toEqual({ source: "AI", fits_key: "p1" });
      expect(seen.fits[0]).toMatchObject({ own_text: "What the fishermen think of the pier", ownerScope: SCOPE, planKey: "premium" });
    } finally {
      await api.close();
    }
  });

  it("a dig's combine reads its parent's question and language; on another person's debate, 404 RUN_NOT_FOUND and nothing asked", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const api = apiOver(key, port);
    const unnamed = apiOver(key, port, { run: { ...RUN, question_line: "Ar trebui orașul să construiască un al doilea debarcader?", argument_language: null } });
    try {
      const own = await post(api, "combine", combineBody(key, { kind: "DIG", parent_run_id: PARENT_RUN }));
      expect(own.statusCode).toBe(200);
      expect(seen.combines[0]!.digParent).toEqual({ questionLine: RUN.question_line, language: { code: "en", name: "English" } });
      await post(unnamed, "combine", combineBody(key, { kind: "DIG", parent_run_id: PARENT_RUN }));
      expect(seen.combines[1]!.digParent).toEqual({ questionLine: "Ar trebui orașul să construiască un al doilea debarcader?",
        language: { code: "ro", name: "Romanian" } });
      const others = await post(api, "combine", combineBody(key, { kind: "DIG", parent_run_id: OTHERS_RUN }));
      expect(others.statusCode).toBe(404);
      expect(others.json()).toEqual({ error: "RUN_NOT_FOUND" });
      expect(seen.combines).toHaveLength(2);
    } finally {
      await api.close();
      await unnamed.close();
    }
  });

  it.each([
    [START_PATHS_INVALID, 400], [START_PATHS_STALE, 409], [START_PATHS_EXPIRED, 409]
  ])("a reference the step refuses with %s: %i with that code", async (code, status) => {
    const key = newStartStepKey();
    const refuse = async (): Promise<never> => { throw new TypedDomainError(code, code); };
    const { port } = portOf(key, { combine: refuse, fit: refuse });
    const api = apiOver(key, port);
    try {
      for (const [path, body] of [["combine", combineBody(key)], ["fit", fitBody(key)]] as const) {
        const response = await post(api, path, body);
        expect(response.statusCode, path).toBe(status);
        expect(response.json(), path).toEqual({ error: code, message: code });
      }
    } finally {
      await api.close();
    }
  });

  it("the front door: own words in crisis, no consent, no step, an empty pool: none with its reason, nothing asked", async () => {
    const key = newStartStepKey();
    const { port, seen } = portOf(key);
    const cases: readonly [Over, string, Record<string, unknown>, string][] = [
      [{}, "fit", fitBody(key, CRISIS), "NOT_ASKED"],
      [{}, "combine", { ...combineBody(key), members: [MEMBERS[0], { ...MEMBERS[1], question: CRISIS }] }, "NOT_ASKED"],
      [{ consent: "required" }, "fit", fitBody(key), "NOT_ASKED"],
      [{ consent: "required" }, "combine", combineBody(key, { kind: "DIG", parent_run_id: OTHERS_RUN }), "NOT_ASKED"],
      [{ port: null }, "combine", combineBody(key), "OFF"],
      [{ version: null }, "fit", fitBody(key), "OFF"],
      [{ pool: async () => ({ empty: true, funding: null }) }, "fit", fitBody(key), "POOL_EMPTY"]
    ];
    for (const [over, path, body, reason] of cases) {
      const api = apiOver(key, port, over);
      try {
        const response = await post(api, path, body);
        expect(response.statusCode, `${path} ${reason}`).toBe(200);
        expect(response.json(), `${path} ${reason}`).toEqual({ source: "NONE", reason });
      } finally {
        await api.close();
      }
    }
    expect([seen.combines.length, seen.fits.length]).toEqual([0, 0]);
  });

  it("an answer the contract refuses, or a step that fails: none TRANSPORT", async () => {
    const key = newStartStepKey();
    const { port } = portOf(key, { fit: async () => ({ source: "AI" as const, fits_key: "not a key!" }),
      combine: async () => { throw new Error("the step broke"); } });
    const api = apiOver(key, port);
    try {
      expect((await post(api, "fit", fitBody(key))).json()).toEqual({ source: "NONE", reason: "TRANSPORT" });
      expect((await post(api, "combine", combineBody(key))).json()).toEqual({ source: "NONE", reason: "TRANSPORT" });
    } finally {
      await api.close();
    }
  });
});

describe("the four routes' policy rows", () => {
  it("each is a signed-in person's call on their own questions", () => {
    expect(authorizationPolicyInventory.filter((row) => row.route.startsWith("POST /v1/asks/paths/"))).toEqual([
      { route: "POST /v1/asks/paths/lists", auth: "user", resource: "run-owner", action: "read-start-lists" },
      { route: "POST /v1/asks/paths/merge", auth: "user", resource: "run-owner", action: "read-start-menu" },
      { route: "POST /v1/asks/paths/combine", auth: "user", resource: "run-owner", action: "read-start-combine" },
      { route: "POST /v1/asks/paths/fit", auth: "user", resource: "run-owner", action: "read-start-fit" }
    ]);
  });
});

describe("startStepBindingOf: the one binding of a call before Start", () => {
  const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
  const billingOf = (planId: PlanId, internal = false): AskBilling => Object.freeze({
    plans, entitlements: { current: async () => ({ planId, eventId: "3c1d5e7f-9a2b-4c6d-8e0f-1a3b5c7d9e2f" }) },
    coarseFit: {} as never, clock: () => new Date("2026-11-04T10:00:00.000Z"),
    ...(internal ? { funding: { resolveAskFunding: async () => ({ kind: "INTERNAL" as const, grantId: "0b5e1c8a-3f4d-4e2a-9c71-6d8f2a4b9e10",
      grantEventId: "7e2d4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a" }) as never } } : {})
  });

  it("no version: null, and nothing is read", async () => {
    const current = vi.fn();
    expect(await startStepBindingOf({ ownerRef: OWNER, askBilling: { ...billingOf("PLUS"), entitlements: { current } }, registerVersion: undefined })).toBeNull();
    expect(current).not.toHaveBeenCalled();
  });

  it("billing off: the premium key; on: the person's plan; an internal grant: the team plan's; the owner scope and the version", async () => {
    expect(await startStepBindingOf({ ownerRef: OWNER, askBilling: undefined, registerVersion: ACTIVE }))
      .toEqual({ ownerScope: SCOPE, planKey: "premium", settingsVersion: ACTIVE });
    expect(await startStepBindingOf({ ownerRef: OWNER, askBilling: billingOf("FREE"), registerVersion: 7 }))
      .toEqual({ ownerScope: SCOPE, planKey: "free", settingsVersion: 7 });
    expect((await startStepBindingOf({ ownerRef: OWNER, askBilling: billingOf("PLUS"), registerVersion: 7 }))?.planKey).toBe("plus");
    expect((await startStepBindingOf({ ownerRef: OWNER, askBilling: billingOf("FREE", true), registerVersion: 7 }))?.planKey).toBe("max");
  });
});

describe("openStartStream: the writer", () => {
  class FakeRaw extends EventEmitter {
    readonly written: string[] = [];
    head: readonly [number, Readonly<Record<string, unknown>>] | null = null;
    destroyed = false;
    writableEnded = false;
    writeHead(status: number, headers: Readonly<Record<string, unknown>>) { this.head = [status, headers]; return this; }
    write(text: string) { this.written.push(text); return true; }
    end() { this.writableEnded = true; this.emit("close"); return this; }
  }
  const open = (over: Readonly<{ gone?: AbortController; draining?: () => boolean; onStop?: (cause: "DRAINING" | "MAX_LIFE", stream: StartStream) => void }> = {}) => {
    const raw = new FakeRaw();
    const gone = over.gone ?? new AbortController();
    const stops: string[] = [];
    const stream = openStartStream({ raw } as unknown as FastifyReply, { headers: { "x-content-type-options": "nosniff", "content-type": "text/html" },
      heartbeatMs: 100, maxLifeMs: 10_000, draining: over.draining ?? (() => false), clientGone: gone.signal,
      onStop: over.onStop ?? ((cause, opened) => { stops.push(cause); opened.end("end", { reason: cause }); }) });
    return { raw, gone, stream, stops };
  };

  it("writes the head with the given headers, then one frame per event and exactly one end, last", () => {
    const { raw, stream } = open();
    expect(raw.head).toEqual([200, { "x-content-type-options": "nosniff", "content-type": "text/event-stream", "cache-control": "no-store",
      connection: "keep-alive" }]);
    stream.write("progress", { answered: 1, of: 4 });
    stream.end("end", { reason: "DONE" });
    stream.write("late_list", { x: 1 });
    stream.end("end", { reason: "NONE" });
    expect(raw.written).toEqual(["event: progress\ndata: {\"answered\":1,\"of\":4}\n\n", "event: end\ndata: {\"reason\":\"DONE\"}\n\n"]);
    expect([stream.ended(), stream.signal.aborted, raw.writableEnded]).toEqual([true, true, true]);
  });

  it("a heartbeat comment every heartbeatMs; the drain asked every second; the longest life; each stop once", () => {
    vi.useFakeTimers();
    let draining = false;
    const { raw, stream, stops } = open({ draining: () => draining });
    vi.advanceTimersByTime(350);
    expect(raw.written).toEqual([": keep-alive\n\n", ": keep-alive\n\n", ": keep-alive\n\n"]);
    draining = true;
    vi.advanceTimersByTime(START_STREAM_DRAIN_POLL_MS);
    expect(stops).toEqual(["DRAINING"]);
    expect(stream.signal.aborted).toBe(true);
    const written = raw.written.length;
    vi.advanceTimersByTime(20_000);
    expect(raw.written).toHaveLength(written);
    expect(stops).toEqual(["DRAINING"]);
    const late = open();
    vi.advanceTimersByTime(10_000);
    expect(late.stops).toEqual(["MAX_LIFE"]);
    expect(late.raw.written.at(-1)).toBe("event: end\ndata: {\"reason\":\"MAX_LIFE\"}\n\n");
  });

  it("a stop whose route wrote no end still ends the stream", () => {
    vi.useFakeTimers();
    const { raw, stream } = open({ draining: () => true, onStop: () => { throw new Error("the route broke"); } });
    vi.advanceTimersByTime(START_STREAM_DRAIN_POLL_MS);
    expect([stream.ended(), stream.signal.aborted, raw.writableEnded]).toEqual([true, true, true]);
  });

  it("the page gone: the signal aborts and nothing more is written, not a heartbeat, a frame or an end", () => {
    vi.useFakeTimers();
    const { raw, gone, stream } = open();
    stream.write("check", { seats: 4 });
    gone.abort();
    expect([stream.ended(), stream.signal.aborted]).toEqual([true, true]);
    stream.write("list", { x: 1 });
    stream.end("end", { reason: "DONE" });
    vi.advanceTimersByTime(20_000);
    expect(raw.written).toEqual(["event: check\ndata: {\"seats\":4}\n\n"]);
  });

  it("a page already gone: no head, nothing written, the signal aborted", () => {
    const gone = new AbortController();
    gone.abort();
    const { raw, stream } = open({ gone });
    stream.write("check", { seats: 4 });
    expect([raw.head, raw.written, stream.signal.aborted]).toEqual([null, [], true]);
  });
});
