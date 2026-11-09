import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AskRequestSchema, CRISIS_SUPPORT_OFFERED, SAVED_QUESTION_LIMITS, SavedQuestionDocSchema, SavedQuestionListSchema, SavedQuestionReadSchema,
  SavedQuestionWrittenSchema, savedQuestionTitleOf, type SavedQuestionDoc, type SavedQuestionRead, type StartListsEvent
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";

/*
 * V4 start step, Task 80b (saved questions spec 2026-11-04 §3.4-§3.6, §3.14; owner answers S3 A, S4 A; the owner card "Where shown"): the
 * mock API keeps the questions not started yet, so the click-test can show that Pick up asks no AI. The module is read fresh for each case
 * (its kept questions and counters are the mock's life). The routes run on a stand-in request and answer, as the mock's server hands them
 * over; server.ts listens when it is imported, so its wiring is read as source, as v4-mock-api and v4-mock-start-step do.
 */
type Saved = typeof import("../../tools/v4-mock-api/saved-questions.js");
type Step = typeof import("../../tools/v4-mock-api/start-step.js");
type Plan = "PLUS" | "FREE";
const T0 = Date.parse("2026-11-06T10:00:00.000Z");
const ROOT = "/v1/account/saved-questions";
const QUESTION = "Should towns close their centres to cars at weekends?";

let saved: Saved;
let step: Step;
beforeEach(async () => {
  vi.stubEnv("MOCK_QUIET", "1");
  vi.resetModules();
  step = await import("../../tools/v4-mock-api/start-step.js");
  saved = await import("../../tools/v4-mock-api/saved-questions.js");
  vi.useFakeTimers({ now: T0, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A request whose body (if any) is handed over once the route listens for its end (as a socket's arrives). */
function fakeRequest(method: string, text: string | null): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & { method: string; url: string; headers: Record<string, string>; destroy(): void };
  Object.assign(request, { method, url: "/", headers: {}, destroy: () => undefined });
  const on = request.on.bind(request);
  request.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === "end") {
      void Promise.resolve().then(() => {
        if (text !== null) request.emit("data", Buffer.from(text, "utf8"));
        request.emit("end");
      });
    }
    return request;
  }) as typeof request.on;
  return request as unknown as IncomingMessage;
}

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  text = "";
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  writeHead(status: number, headers: Record<string, string> = {}): this {
    this.statusCode = status;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
  end(chunk?: string): this {
    if (chunk !== undefined) this.text += chunk;
    this.writableEnded = true;
    this.emit("close");
    return this;
  }
}

/** One call through the mock's saved-question routes, for the mock's person on `plan`. */
async function call(method: string, path: string, body?: unknown, plan: Plan = "PLUS"): Promise<FakeResponse> {
  const res = new FakeResponse();
  const handled = await saved.routeSavedQuestions(fakeRequest(method, body === undefined ? null : JSON.stringify(body)),
    res as unknown as ServerResponse, path, method, { plan });
  expect(handled, `${method} ${path}`).toBe(true);
  return res;
}
const jsonOf = (res: FakeResponse): unknown => JSON.parse(res.text);

const listsOf = (script: readonly Readonly<{ event: StartListsEvent }>[], name: "list" | "late_list") =>
  script.flatMap((one) => (one.event.event === name ? [one.event.data.list] : []));

/**
 * Step 2 as the page saves it, over a reading the mock itself made for `plan`: its check, the menu, the first five paths in the AI's
 * words. The menu's first path title ends in a space, which a parse of SignedStartMenuSchema trims: it must come back as sent.
 */
function docOf(plan: Plan = "PLUS", line = QUESTION): SavedQuestionDoc {
  const script = step.mockStartListsScript(line, plan);
  const check = script[0]!.event;
  if (check.event !== "check") throw new Error("the check comes first");
  const menu = structuredClone(step.mockStartMenu(listsOf(script, "list"), null).menu);
  menu.menu.paths[0]!.title = `${menu.menu.paths[0]!.title} `;
  const question = (id: string) => menu.menu.viewpoints.find((one) => one.viewpoint_id === id)?.question ?? id;
  const paths = menu.menu.paths.slice(0, 5).map((path) => ({ key: path.path_ref, title: path.title, question: path.question, wording: "AI" as const,
    viewpoints: path.viewpoint_ids.map((id) => ({ key: id, source: { kind: "MENU" as const, viewpointId: id }, question: question(id) })) }));
  return {
    v: 1,
    reading: { read_line: line, reading_level: "plain", check: { ref: check.data.check_ref }, language: check.data.language, seats: check.data.seats,
      clarify: null, menu, late_lists: [], end: "READY" },
    page: { box: { text: line, placed: [] }, sent_goal: { answers: [] }, plan: { paths, more: [], undo: [] }, width: 5, mode: "quick", carry_on: false }
  };
}

describe("V4 mock API: saved questions round-trip (Task 80b)", () => {
  it("create, save, list, read and delete round-trip; the stored document comes back as sent, never a parse; an old revision is 409", async () => {
    const doc = docOf();
    const created = await call("POST", ROOT, { doc });
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    const written = SavedQuestionWrittenSchema.parse(jsonOf(created));
    expect(written.revision).toBe(1);

    const listed = SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT)));
    expect(listed.questions).toEqual([{ id: written.id, question: savedQuestionTitleOf(doc), saved_at: new Date(T0).toISOString() }]);

    vi.setSystemTime(T0 + 60_000);
    const changed: SavedQuestionDoc = { ...doc, page: { ...doc.page, box: { text: `${QUESTION}\n\nI mean in Romania.`, placed: [{ key: "Where?", text: "I mean in Romania." }] } } };
    const second = await call("PUT", `${ROOT}/${written.id}`, { revision: 1, doc: changed });
    expect(second.statusCode).toBe(200);
    expect(SavedQuestionWrittenSchema.parse(jsonOf(second))).toEqual({ id: written.id, revision: 2 });

    const pickedUp = await call("GET", `${ROOT}/${written.id}`);
    expect(pickedUp.statusCode).toBe(200);
    expect(pickedUp.headers["cache-control"]).toBe("no-store");
    const read = SavedQuestionReadSchema.parse(jsonOf(pickedUp));
    expect(read).toMatchObject({ id: written.id, revision: 2, saved_at: new Date(T0 + 60_000).toISOString(), state: "READY" });
    // The raw value: the trailing space a parse would trim is still there.
    expect(JSON.stringify(read.doc)).toBe(JSON.stringify(changed));
    expect(JSON.stringify(SavedQuestionDocSchema.parse(read.doc))).not.toBe(JSON.stringify(changed));

    const stale = await call("PUT", `${ROOT}/${written.id}`, { revision: 1, doc });
    expect(stale.statusCode).toBe(409);
    expect(jsonOf(stale)).toMatchObject({ error: "SAVED_QUESTION_REVISION", revision: 2 });

    const deleted = await call("DELETE", `${ROOT}/${written.id}`);
    expect(deleted.statusCode).toBe(204);
    expect(deleted.text).toBe("");
    expect(deleted.headers["cache-control"]).toBe("no-store");
    expect(jsonOf(await call("GET", `${ROOT}/${written.id}`))).toMatchObject({ error: "SAVED_QUESTION_GONE" });
    expect((await call("GET", `${ROOT}/${written.id}`)).statusCode).toBe(404);
    expect((await call("PUT", `${ROOT}/${written.id}`, { revision: 2, doc })).statusCode).toBe(404);
    // An id that is not there answers as Delete always does, and destroys nothing.
    expect((await call("DELETE", `${ROOT}/${written.id}`)).statusCode).toBe(204);
    expect(SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT))).questions).toEqual([]);
    expect(saved.savedQuestionCounters()).toEqual({ creates: 1, saves: 3, reads: 3, deletes: 2 });
  });

  it("keeps at most 20: a 21st first save answers 409 SAVED_QUESTIONS_FULL and keeps nothing more; the list is newest first", async () => {
    const ids: string[] = [];
    for (let at = 0; at < SAVED_QUESTION_LIMITS.kept; at += 1) {
      vi.setSystemTime(T0 + at * 1_000);
      const res = await call("POST", ROOT, { doc: docOf("PLUS", `${QUESTION} (${String(at + 1)})`) });
      expect(res.statusCode).toBe(201);
      ids.push(SavedQuestionWrittenSchema.parse(jsonOf(res)).id);
    }
    const full = await call("POST", ROOT, { doc: docOf() });
    expect(full.statusCode).toBe(409);
    expect(jsonOf(full)).toMatchObject({ error: "SAVED_QUESTIONS_FULL" });
    expect(saved.savedQuestionsKept()).toBe(20);
    const listed = SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT)));
    expect(listed.questions.map((one) => one.id)).toEqual([...ids].reverse());
    // Deleting one makes room again.
    await call("DELETE", `${ROOT}/${ids[0]!}`);
    expect((await call("POST", ROOT, { doc: docOf() })).statusCode).toBe(201);
  });

  it("refuses before anything is kept: an id or a body of the wrong shape 400, a box over its bytes 400 TOO_LARGE, crisis words 422", async () => {
    expect(jsonOf(await call("GET", `${ROOT}/not-an-id`))).toMatchObject({ error: "MALFORMED_REQUEST" });
    // The API makes lowercase ids only (Task 39c's ruling); one in capitals is refused, not looked up.
    expect((await call("GET", `${ROOT}/3F2C1A9E-7B4D-4C2A-9E8F-1A2B3C4D5E6F`)).statusCode).toBe(400);
    expect((await call("POST", ROOT, { doc: { v: 2 } })).statusCode).toBe(400);
    const doc = docOf();
    const tooLarge = await call("POST", ROOT, { doc: { ...doc, page: { ...doc.page, box: { text: "ă".repeat(5_000), placed: [] } } } });
    expect(tooLarge.statusCode).toBe(400);
    expect(jsonOf(tooLarge)).toMatchObject({ error: "SAVED_QUESTION_TOO_LARGE" });
    const crisis = await call("POST", ROOT, { doc: { ...doc, page: { ...doc.page, box: { text: "I want to kill myself tonight", placed: [] } } } });
    expect(crisis.statusCode).toBe(422);
    expect(jsonOf(crisis)).toMatchObject({ error: CRISIS_SUPPORT_OFFERED });
    expect(saved.savedQuestionsKept()).toBe(0);
    // Any other route is not this module's.
    const res = new FakeResponse();
    expect(await saved.routeSavedQuestions(fakeRequest("GET", null), res as unknown as ServerResponse, "/v1/account/reading-level", "GET")).toBe(false);
    expect(res.headersSent).toBe(false);
  });

  it("an ask with saved_question_id takes the copy out of the list, as the API removes it once the ask is accepted", async () => {
    const kept = SavedQuestionWrittenSchema.parse(jsonOf(await call("POST", ROOT, { doc: docOf() })));
    const other = SavedQuestionWrittenSchema.parse(jsonOf(await call("POST", ROOT, { doc: docOf("PLUS", `${QUESTION} Again.`) })));
    const ask = AskRequestSchema.parse({ question_line: QUESTION, risk_tier: "standard", tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "test:v4-mock-saved-questions", composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" },
      decision_scope: "personal", as_of: "2026-11-06T10:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [],
      site_language: "en", saved_question_id: kept.id });
    saved.removeSavedQuestionAtStart(ask.saved_question_id!);
    const listed = SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT)));
    expect(listed.questions.map((one) => one.id)).toEqual([other.id]);
    expect((await call("GET", `${ROOT}/${kept.id}`)).statusCode).toBe(404);
  });
});

describe("V4 mock API: the saved questions' shapes (Task 80b)", () => {
  it("every answer the startup check reads parses with Task 39c's schemas, on both plans", () => {
    const samples = saved.savedQuestionSamples();
    expect(SavedQuestionListSchema.safeParse(samples.list).success).toBe(true);
    expect(samples.list.questions.length).toBeGreaterThanOrEqual(2);
    expect(SavedQuestionWrittenSchema.safeParse(samples.written).success).toBe(true);
    expect(samples.reads.map((read) => read.state).sort()).toEqual(["NEEDS_READING", "NEEDS_READING", "READY", "READY"]);
    for (const read of samples.reads) {
      expect(SavedQuestionReadSchema.safeParse(read).success, read.id).toBe(true);
      expect(SavedQuestionDocSchema.safeParse(read.doc).success, read.id).toBe(true);
    }
    // Building the samples keeps nothing and counts nothing.
    expect(saved.savedQuestionsKept()).toBe(0);
    expect(saved.savedQuestionCounters()).toEqual({ creates: 0, saves: 0, reads: 0, deletes: 0 });
    expect(step.startStepCounters()).toEqual({ lists: 0, merges: 0, combines: 0, fits: 0 });
  });
});

describe("V4 mock API: the #pickup scene (Task 80b)", () => {
  it("after saved=pickup the list shows the two seeded questions; the READY one gives its five paths; Pick up asks no AI", async () => {
    expect(saved.MOCK_SAVED_SCENES).toEqual(["#pickup"]);
    const before = step.startStepCounters();
    const used = step.startStepUsedPercent();
    saved.setSavedQuestionsScene("PICKUP");
    expect(saved.savedQuestionsScene()).toBe("PICKUP");

    const listed = SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT)));
    expect(listed.questions.map((one) => one.id)).toEqual([saved.MOCK_PICKUP_IDS.ready, saved.MOCK_PICKUP_IDS.needsReading]);
    expect(listed.questions[0]!.question).toBe("Should Romania build new nuclear plants?");

    const ready = SavedQuestionReadSchema.parse(jsonOf(await call("GET", `${ROOT}/${saved.MOCK_PICKUP_IDS.ready}`)));
    expect(ready.state).toBe("READY");
    const doc = SavedQuestionDocSchema.parse(ready.doc);
    const paths = doc.page.plan.paths;
    expect(paths).toHaveLength(5);
    expect(paths.map((path) => path.wording).sort()).toEqual(["AI", "AI", "AI", "COMBINED", "PERSON"]);
    const combined = paths.find((path) => path.wording === "COMBINED") as Readonly<Record<string, unknown>> & (typeof paths)[number];
    expect(typeof combined.combineRef).toBe("string");
    expect(combined.viewpoints.length).toBeGreaterThanOrEqual(2);
    expect(paths.find((path) => path.wording === "PERSON")!.viewpoints.map((one) => one.source.kind)).toEqual(["OWN"]);
    expect(doc.page.box.placed).toHaveLength(2);
    expect(doc.page.sent_goal.answers).toHaveLength(2);
    for (const placed of doc.page.box.placed) expect(doc.page.box.text).toContain(placed.text);
    expect(doc.page).toMatchObject({ width: 5, mode: "thorough" });
    expect(doc.page.plan.undo.length).toBeGreaterThan(0);
    expect(doc.reading.end).toBe("READY");
    expect(doc.reading.clarify).not.toBeNull();
    expect(step.mockStartRefOf(doc.reading.check.ref)?.plan).toBe("PLUS");

    const other = SavedQuestionReadSchema.parse(jsonOf(await call("GET", `${ROOT}/${saved.MOCK_PICKUP_IDS.needsReading}`)));
    expect(other.state).toBe("NEEDS_READING");
    expect(step.mockStartRefOf(SavedQuestionDocSchema.parse(other.doc).reading.check.ref)?.plan).toBe("FREE");

    // No lists, merge, combine or fit was asked, and nothing moved the usage.
    expect(step.startStepCounters()).toEqual(before);
    expect(step.startStepUsedPercent()).toBe(used);
    expect(saved.savedQuestionCounters()).toEqual({ creates: 0, saves: 0, reads: 2, deletes: 0 });
  });

  it("on the Free plan the two swap; saved=none keeps none; a reseed puts the scene back as it was", async () => {
    saved.seedPickUpScene();
    const stateOn = async (plan: Plan, id: string) => SavedQuestionReadSchema.parse(jsonOf(await call("GET", `${ROOT}/${id}`, undefined, plan))).state;
    expect(await stateOn("FREE", saved.MOCK_PICKUP_IDS.ready)).toBe("NEEDS_READING");
    expect(await stateOn("FREE", saved.MOCK_PICKUP_IDS.needsReading)).toBe("READY");
    const read = SavedQuestionReadSchema.parse(jsonOf(await call("GET", `${ROOT}/${saved.MOCK_PICKUP_IDS.ready}`)));
    await call("PUT", `${ROOT}/${saved.MOCK_PICKUP_IDS.ready}`, { revision: 1, doc: read.doc });
    saved.setSavedQuestionsScene("NONE");
    expect(SavedQuestionListSchema.parse(jsonOf(await call("GET", ROOT))).questions).toEqual([]);
    saved.setSavedQuestionsScene("PICKUP");
    const again = SavedQuestionReadSchema.parse(jsonOf(await call("GET", `${ROOT}/${saved.MOCK_PICKUP_IDS.ready}`)));
    expect(again.revision).toBe(1);
  });
});

describe("V4 mock API: check.ts's saved-question steps (Task 80b)", () => {
  /** What the website's contract client does, answered in-process by the mock's routes (check.ts sends the same through the /api proxy). */
  const viaRoutes = (async (input: unknown, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const res = new FakeResponse();
    const text = typeof init.body === "string" ? init.body : null;
    if (!await saved.routeSavedQuestions(fakeRequest(method, text), res as unknown as ServerResponse, url.pathname, method)) {
      return new Response(JSON.stringify({ error: "NOT_MOCKED" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(res.statusCode === 204 ? null : res.text, { status: res.statusCode, headers: res.headers });
  }) as typeof fetch;

  it("the list, Pick up, a first save, a later save and Delete pass through the contract client with no mismatch", async () => {
    const client = createContractClient("http://127.0.0.1:3011", viaRoutes, { mode: "cookie" });
    saved.setSavedQuestionsScene("PICKUP");
    const before = step.startStepCounters();
    const list = await client.listSavedQuestions();
    expect(list.questions.map((one) => one.id)).toEqual([saved.MOCK_PICKUP_IDS.ready, saved.MOCK_PICKUP_IDS.needsReading]);
    const ready: SavedQuestionRead = await client.readSavedQuestion(saved.MOCK_PICKUP_IDS.ready);
    expect(ready.state).toBe("READY");
    expect((await client.readSavedQuestion(saved.MOCK_PICKUP_IDS.needsReading)).state).toBe("NEEDS_READING");
    expect(step.startStepCounters()).toEqual(before);
    const doc = ready.doc as SavedQuestionDoc;
    const first = await client.createSavedQuestion(doc);
    expect(first.revision).toBe(1);
    expect(await client.saveSavedQuestion(first.id, first.revision, doc)).toEqual({ id: first.id, revision: 2 });
    await expect(client.saveSavedQuestion(first.id, first.revision, doc)).rejects.toMatchObject({ status: 409, serverCode: "SAVED_QUESTION_REVISION" });
    await client.deleteSavedQuestion(first.id);
    expect((await client.listSavedQuestions()).questions.map((one) => one.id)).not.toContain(first.id);
  });

  it("check.ts sets the scene and makes the five steps through the website's client", () => {
    const check = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/check.ts"), "utf8");
    expect(check).toContain('await mock("/__mock/set?saved=pickup");');
    expect([...check.matchAll(/await step\("saved questions: /gu)]).toHaveLength(5);
    for (const used of ["client.listSavedQuestions()", "client.readSavedQuestion(", "client.createSavedQuestion(", "client.saveSavedQuestion(",
      "client.deleteSavedQuestion("]) expect(check).toContain(used);
  });
});

describe("V4 mock API: server.ts serves the saved questions (Task 80b)", () => {
  const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
  const between = (from: string, to: string): string => server.slice(server.indexOf(from), server.indexOf(to, server.indexOf(from)));

  it("routes the five through saved-questions.ts for the mock's plan, signed in only", () => {
    expect(server).toContain('from "./saved-questions.js";');
    const routed = server.indexOf("if (await routeSavedQuestions(req, res, path, method, { plan: planMode })) return;");
    expect(routed).toBeGreaterThan(-1);
    const guard = server.lastIndexOf('if (path.startsWith("/v1/account/saved-questions")', routed);
    expect(guard).toBeGreaterThan(-1);
    expect(server.slice(guard, routed)).toContain('if (sessionOut) return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });');
  });

  it("checks the answers at startup beside the reading level's, counts them in /__mock/state, and reads the saved= switch", () => {
    const startup = between("function startupCheck(", "const CHECKED = startupCheck();");
    const level = startup.indexOf('check("GET /v1/account/reading-level"');
    const samples = startup.indexOf("savedQuestionSamples()");
    expect(samples).toBeGreaterThan(level);
    expect(samples - level).toBeLessThan(400);
    expect(startup).toContain("C.SavedQuestionListSchema");
    expect(startup).toContain("C.SavedQuestionReadSchema");
    expect(startup).toContain("C.SavedQuestionWrittenSchema");
    expect(startup).toContain("C.SavedQuestionDocSchema");
    expect(between("function mockState(", "function positiveInt(")).toContain("savedQuestions: { ...savedQuestionCounters(), kept: savedQuestionsKept(), scene: savedQuestionsScene() }");
    expect(between('if (parts[1] === "set"', 'if (parts[1] === "sign-in"')).toContain('url.searchParams.get("saved")');
  });

  it("POST /v1/asks removes the copy named by saved_question_id once the ask is accepted, never on a refusal", () => {
    const ask = between("async function postAsk(", "function sendProgress(");
    const removal = ask.indexOf("if (ask.saved_question_id !== undefined) removeSavedQuestionAtStart(ask.saved_question_id);");
    expect(removal).toBeGreaterThan(-1);
    // After the last refusal (one waiting already), before every 202.
    expect(removal).toBeGreaterThan(ask.indexOf('if (mode === "ALREADY_WAITING") {'));
    expect(removal).toBeLessThan(ask.indexOf("const runRef = randomUUID();"));
  });
});
