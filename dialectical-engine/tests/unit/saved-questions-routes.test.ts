/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.6, §3.7, §3.14; owner answers S3 A, S4 A): THE FIVE ROUTES of the
 * questions not started yet, through buildApi as main.ts composes it (the service over a store and a question-key store), and the
 * removal at Start in POST /v1/asks. Signed-in only; POST, PUT and DELETE behind the shared CSRF pair and Origin check; nothing cached;
 * another person's id answers exactly as a missing one and destroys nothing; the logs carry codes and ids only. Every question is made up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import { SAVED_QUESTION_LIMITS, createContractClient, savedQuestionPartBytes, type AskRequest, type SavedQuestionDoc } from "@debateai/contract";
import { MemorySavedQuestionKeyStore, decrypt, generateDek } from "../../packages/crypto/src/index.js";
import type { QuestionCheckOutcome } from "../../apps/api/src/question-check/contract.js";
import { createSavedQuestionService, savedQuestionAad } from "../../apps/api/src/saved-questions/service.js";
import { combineMembersKey } from "../../apps/ui/lib/v4/pathPlan.js";
import {
  FakeSavedQuestionStore, MemoryUserDekStore, SAVED_ACTIVE, SAVED_BOX_TEXT, SAVED_Q, SAVED_TRAILING_TITLE, newStartStepKey, savedDocOf, savedSigner
} from "../support/saved-questions.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";

const KEY = newStartStepKey();
const ANA = testHttpIdentity("saved-questions-routes-ana");
const BEN = testHttpIdentity("saved-questions-routes-ben");
const personOf = (identity: TestHttpIdentity) => ({ ownerRef: identity.authenticated.ownerRef, userId: identity.authenticated.userId });
const ANA_SIGNS = savedSigner(KEY, personOf(ANA));
const BEN_SIGNS = savedSigner(KEY, personOf(BEN));
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_ID = "3f2c1a9e-7b4d-4c2a-9e8f-1a2b3c4d5e6f";
const VIEW: AdmissionView = Object.freeze({ registerVersion: SAVED_ACTIVE, modelScorecardInForce: false });
const BASE = "/v1/account/saved-questions";

const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: SAVED_Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:start", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start from a saved question",
  as_of: "2026-11-05T00:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], ...extra });

type Over = Readonly<{ service?: "NONE"; outcome?: QuestionCheckOutcome }>;
async function harness(over: Over = {}) {
  const store = new FakeSavedQuestionStore();
  const users = new MemoryUserDekStore();
  await users.store(ANA.authenticated.userId, generateDek());
  await users.store(BEN.authenticated.userId, generateDek());
  const keys = new MemorySavedQuestionKeyStore(users);
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  const submitted: unknown[][] = [];
  const service = createSavedQuestionService({ store, keys, key: KEY,
    report: (code: string, id?: string) => { console.error(JSON.stringify({ event: code, ...(id === undefined ? {} : { saved_question_id: id }) })); } });
  const application = {
    submit: async (...args: unknown[]) => { submitted.push(args); return { run_ref: RUN_ID, status: "QUEUED" as const }; },
    readRunAnswer: async () => null
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([ANA, BEN]), allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: async () => over.outcome ?? { outcome: "PASS" as const } },
    startStepKey: KEY, admissionView: async () => VIEW,
    ...(over.service === "NONE" ? {} : { savedQuestions: service })
  } as never);
  const send = (identity: TestHttpIdentity | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown,
    headers: Readonly<Record<string, string>> = {}) => api.inject({ method, url,
    headers: { ...(identity === null ? {} : testSessionHeaders(identity, method !== "GET")), ...headers },
    ...(payload === undefined ? {} : { payload: payload as never }) });
  const create = async (identity: TestHttpIdentity, doc: SavedQuestionDoc): Promise<string> => {
    const response = await send(identity, "POST", BASE, { doc });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string }>().id;
  };
  /** Whether `id`'s title still opens under its own key, for that person. */
  const opens = async (identity: TestHttpIdentity, id: string): Promise<boolean> => {
    const person = personOf(identity);
    const key = await keys.load(id, person).catch(() => null);
    if (key === null) return false;
    try {
      return decrypt(key, store.rows.get(id)!.title, savedQuestionAad("title", id, person.ownerRef)).toString("utf8") === SAVED_Q;
    } finally { key.fill(0); }
  };
  return { api, store, keys, lines, submitted, send, create, opens };
}

afterEach(() => { vi.restoreAllMocks(); });

const ROUTES = [["GET", BASE], ["POST", BASE], ["PUT", `${BASE}/${MISSING_ID}`], ["GET", `${BASE}/${MISSING_ID}`],
  ["DELETE", `${BASE}/${MISSING_ID}`]] as const;

describe("sign-in and the credential check", () => {
  it("anonymous: 401 SESSION_REQUIRED on all five", async () => {
    const h = await harness();
    for (const [method, url] of ROUTES) {
      const response = await h.send(null, method, url, method === "POST" || method === "PUT" ? { doc: {} } : undefined);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
      expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    }
    await h.api.close();
  });

  it("POST, PUT and DELETE without the CSRF pair, or from another Origin, are refused by the shared check", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    for (const [method, url] of [["POST", BASE], ["PUT", `${BASE}/${id}`], ["DELETE", `${BASE}/${id}`]] as const) {
      const payload = method === "DELETE" ? undefined : { revision: 1, doc: savedDocOf(ANA_SIGNS) };
      const bare = await h.api.inject({ method, url, headers: testSessionHeaders(ANA), ...(payload === undefined ? {} : { payload }) });
      expect(bare.statusCode, `${method} without the pair`).toBe(403);
      const elsewhere = await h.api.inject({ method, url, headers: testSessionHeaders(ANA, true, "https://elsewhere.test"),
        ...(payload === undefined ? {} : { payload }) });
      expect(elsewhere.statusCode, `${method} from another Origin`).toBe(403);
    }
    expect(h.store.rows.size).toBe(1);
    expect(await h.opens(ANA, id)).toBe(true);
    await h.api.close();
  });
});

describe("a round trip", () => {
  it("create 201, list newest first with no-store, read the document byte for byte (also through the contract client)", async () => {
    const h = await harness();
    const first = await h.send(ANA, "POST", BASE, { doc: savedDocOf(ANA_SIGNS) });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ id: expect.any(String), revision: 1 });
    expect(first.headers["cache-control"]).toBe("no-store");
    const doc = savedDocOf(ANA_SIGNS, { page: { box: { text: `Nuclear, again?\n${SAVED_BOX_TEXT}`, placed: [] } } });
    const second = await h.create(ANA, doc);
    const list = await h.send(ANA, "GET", BASE);
    expect(list.statusCode).toBe(200);
    expect(list.headers["cache-control"]).toBe("no-store");
    expect(list.json().questions.map((one: { id: string; question: string }) => [one.id, one.question]))
      .toEqual([[second, "Nuclear, again?"], [first.json().id, SAVED_Q]]);
    const read = await h.send(ANA, "GET", `${BASE}/${second}`);
    expect(read.statusCode).toBe(200);
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(read.json()).toMatchObject({ id: second, revision: 1, state: "READY" });
    expect(JSON.stringify(read.json().doc)).toBe(JSON.stringify(doc));
    expect(read.json().doc.page.box.text.endsWith("\n")).toBe(true);
    expect(read.json().doc.page.plan.paths[0].title).toBe(SAVED_TRAILING_TITLE);

    const transport = (async (url, init) => {
      const result = await h.api.inject({ method: (init?.method ?? "GET") as "GET", url: new URL(String(url)).pathname,
        headers: { ...testSessionHeaders(ANA, true), ...Object.fromEntries(new Headers(init?.headers).entries()) },
        ...(init?.body === undefined ? {} : { payload: String(init.body) }) });
      return new Response(result.statusCode === 204 ? null : result.body, { status: result.statusCode, headers: result.headers as Record<string, string> });
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", transport, { mode: "cookie", csrfToken: () => ANA.rawCsrfToken });
    const viaClient = await client.readSavedQuestion(second);
    expect(JSON.stringify(viaClient.doc)).toBe(JSON.stringify(doc));
    const written = await client.createSavedQuestion(doc);
    expect(written.revision).toBe(1);
    expect(await client.saveSavedQuestion(written.id, 1, doc)).toEqual({ id: written.id, revision: 2 });
    expect((await client.listSavedQuestions()).questions[0]!.id).toBe(written.id);
    await client.deleteSavedQuestion(written.id);
    expect((await client.listSavedQuestions()).questions.map((one) => one.id)).not.toContain(written.id);
    await h.api.close();
  });

  it("the contract client sends the document as given, never its parse: a first and a later save read back as the same JSON text", async () => {
    // Review of Task 39e: the client checks the document with safeParse but sends the raw one. A parse would move each page object's own
    // keys behind the schema's (a path's `key`, a chip's `key`), so the stored text would no longer be the page's.
    const h = await harness();
    const sent: string[] = [];
    const transport = (async (url, init) => {
      if (init?.body !== undefined) sent.push(String(init.body));
      const result = await h.api.inject({ method: (init?.method ?? "GET") as "GET", url: new URL(String(url)).pathname,
        headers: { ...testSessionHeaders(ANA, true), ...Object.fromEntries(new Headers(init?.headers).entries()) },
        ...(init?.body === undefined ? {} : { payload: String(init.body) }) });
      return new Response(result.statusCode === 204 ? null : result.body, { status: result.statusCode, headers: result.headers as Record<string, string> });
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", transport, { mode: "cookie", csrfToken: () => ANA.rawCsrfToken });
    const first = savedDocOf(ANA_SIGNS);
    const later = savedDocOf(ANA_SIGNS, { page: { box: { text: `Nuclear, again?\n${SAVED_BOX_TEXT}`, placed: [] } } });
    const { id } = await client.createSavedQuestion(first);
    expect(sent[0]).toBe(JSON.stringify({ doc: first }));
    expect(JSON.stringify((await h.send(ANA, "GET", `${BASE}/${id}`)).json().doc)).toBe(JSON.stringify(first));
    await client.saveSavedQuestion(id, 1, later);
    expect(sent[1]).toBe(JSON.stringify({ revision: 1, doc: later }));
    expect(JSON.stringify((await h.send(ANA, "GET", `${BASE}/${id}`)).json().doc)).toBe(JSON.stringify(later));
    await h.api.close();
  });
});

describe("refusals and limits", () => {
  it("PUT with an old revision: 409 SAVED_QUESTION_REVISION with the current one", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    expect((await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1, doc: savedDocOf(ANA_SIGNS) })).json()).toEqual({ id, revision: 2 });
    const stale = await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1, doc: savedDocOf(ANA_SIGNS) });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: "SAVED_QUESTION_REVISION", message: "SAVED_QUESTION_REVISION", revision: 2 });
    await h.api.close();
  });

  it("another person's id answers as a missing one (PUT and GET 404, DELETE 204) and their key still opens", async () => {
    const h = await harness();
    const id = await h.create(BEN, savedDocOf(BEN_SIGNS));
    for (const target of [id, MISSING_ID]) {
      const put = await h.send(ANA, "PUT", `${BASE}/${target}`, { revision: 1, doc: savedDocOf(ANA_SIGNS) });
      expect(put.statusCode).toBe(404);
      expect(put.json()).toEqual({ error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" });
      const get = await h.send(ANA, "GET", `${BASE}/${target}`);
      expect(get.statusCode).toBe(404);
      expect(get.json()).toEqual({ error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" });
      expect((await h.send(ANA, "DELETE", `${BASE}/${target}`)).statusCode).toBe(204);
    }
    expect(h.store.rows.has(id)).toBe(true);
    expect(await h.opens(BEN, id)).toBe(true);
    await h.api.close();
  });

  it("an id that is not a lowercase uuid is MALFORMED_REQUEST and touches nothing", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    for (const method of ["GET", "DELETE"] as const) {
      const response = await h.send(ANA, method, `${BASE}/${id.toUpperCase()}`);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    }
    expect(await h.opens(ANA, id)).toBe(true);
    await h.api.close();
  });

  it("a body of 720_897 bytes: 413 on POST and PUT", async () => {
    const h = await harness();
    const body = `{"doc":{"pad":"${"x".repeat(SAVED_QUESTION_LIMITS.saveBodyMaxBytes + 1 - 18)}"}}`;
    expect(Buffer.byteLength(body)).toBe(720_897);
    for (const [method, url] of [["POST", BASE], ["PUT", `${BASE}/${MISSING_ID}`]] as const) {
      const response = await h.send(ANA, method, url, body, { "content-type": "application/json" });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" });
    }
    await h.api.close();
  });

  it("a 21st question is not kept: 409 SAVED_QUESTIONS_FULL, the list still holds 20, and 20 keys", async () => {
    const h = await harness();
    for (let n = 0; n < 20; n++) await h.create(ANA, savedDocOf(ANA_SIGNS));
    const full = await h.send(ANA, "POST", BASE, { doc: savedDocOf(ANA_SIGNS) });
    expect(full.statusCode).toBe(409);
    expect(full.json()).toEqual({ error: "SAVED_QUESTIONS_FULL", message: "SAVED_QUESTIONS_FULL" });
    expect((await h.send(ANA, "GET", BASE)).json().questions).toHaveLength(20);
    expect(await h.keys.listByOwner(ANA.authenticated.ownerRef)).toHaveLength(20);
    await h.api.close();
  });

  it("a refused save answers its code: crisis words 422 with the country, a reading of another person 400", async () => {
    const h = await harness();
    const crisis = await h.send(ANA, "POST", BASE, { doc: savedDocOf(ANA_SIGNS, { page: { box: { text: "I want to kill myself tonight", placed: [] } } }) },
      { "cf-ipcountry": "RO" });
    expect(crisis.statusCode).toBe(422);
    expect(crisis.json()).toEqual({ error: "CRISIS_SUPPORT_OFFERED", message: "CRISIS_SUPPORT_OFFERED", country: "RO" });
    const invalid = await h.send(ANA, "POST", BASE, { doc: savedDocOf(BEN_SIGNS) });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "SAVED_QUESTION_INVALID", message: "SAVED_QUESTION_INVALID" });
    const malformed = await h.send(ANA, "POST", BASE, { doc: { v: 1 } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    expect(h.store.rows.size).toBe(0);
    await h.api.close();
  });

  // Task 76m (spec §3.2): the AI's words of a combine undone before the save. The routes keep them as sent; only the person's own
  // chips among the members are screened, and the page's size limit holds them too.
  it("combined_written: stored and read back as sent; crisis words in an own chip 422; over 262_144 bytes 400 TOO_LARGE; members of no combine 400", async () => {
    const h = await harness();
    const entry = (own: string, extra: Readonly<Record<string, string>> = {}) => ({ members: combineMembersKey([
      { viewpoint_id: "pt14", pick_no: null, title: "Gas from Russia", question: "Would new plants cut the gas Romania buys?" },
      { viewpoint_id: null, pick_no: null, title: null, question: own }]),
    title: "Gas and my bills ", question: "Would new plants change what my family pays for gas?", combine_ref: "cmb2.sig", ...extra });
    const kept = savedDocOf(ANA_SIGNS, { page: { combined_written: [entry("My bills went up this winter")] } });
    const id = await h.create(ANA, kept);
    const read = await h.send(ANA, "GET", `${BASE}/${id}`);
    expect(JSON.stringify(read.json().doc)).toBe(JSON.stringify(kept));
    expect(read.json().doc.page.combined_written[0].title).toBe("Gas and my bills ");
    const crisis = await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1,
      doc: savedDocOf(ANA_SIGNS, { page: { combined_written: [entry("I want to kill myself tonight")] } }) });
    expect(crisis.statusCode).toBe(422);
    expect(crisis.json().error).toBe("CRISIS_SUPPORT_OFFERED");
    const base = savedQuestionPartBytes(savedDocOf(ANA_SIGNS, { page: { combined_written: [entry("x")] } }).page);
    const large = savedDocOf(ANA_SIGNS, { page: { combined_written: [entry("x"), ...Array.from({ length: 300 }, () => entry("x".repeat(1_000)))] } });
    expect(base).toBeLessThan(SAVED_QUESTION_LIMITS.pageMaxBytes);
    expect(savedQuestionPartBytes(large.page)).toBeGreaterThan(SAVED_QUESTION_LIMITS.pageMaxBytes);
    const tooLarge = await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1, doc: large });
    expect(tooLarge.statusCode).toBe(400);
    expect(tooLarge.json()).toEqual({ error: "SAVED_QUESTION_TOO_LARGE", message: "SAVED_QUESTION_TOO_LARGE" });
    const noCombine = await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1,
      doc: savedDocOf(ANA_SIGNS, { page: { combined_written: [entry("x", { members: "I want to kill myself tonight" })] } }) });
    expect(noCombine.statusCode).toBe(400);
    expect(noCombine.json().error).toBe("MALFORMED_REQUEST");
    expect(JSON.stringify((await h.send(ANA, "GET", `${BASE}/${id}`)).json().doc)).toBe(JSON.stringify(kept));
    await h.api.close();
  });

  it("without the service: 503 SAVED_QUESTIONS_UNAVAILABLE on all five, and 401 without a session", async () => {
    const h = await harness({ service: "NONE" });
    for (const [method, url] of ROUTES) {
      const payload = method === "POST" || method === "PUT" ? { revision: 1, doc: savedDocOf(ANA_SIGNS) } : undefined;
      const response = await h.send(ANA, method, url, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(503);
      expect(response.json()).toEqual({ error: "SAVED_QUESTIONS_UNAVAILABLE", message: "SAVED_QUESTIONS_UNAVAILABLE" });
      expect((await h.send(null, method, url, payload)).statusCode).toBe(401);
    }
    await h.api.close();
  });
});

describe("Delete (S4 A)", () => {
  it("204: the entry leaves the list and its key is gone", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    const deleted = await h.send(ANA, "DELETE", `${BASE}/${id}`);
    expect(deleted.statusCode).toBe(204);
    expect(deleted.headers["cache-control"]).toBe("no-store");
    expect((await h.send(ANA, "GET", BASE)).json().questions).toEqual([]);
    expect(await h.keys.exists(id)).toBe(false);
    await h.api.close();
  });

  it("a key that cannot be destroyed: 503 SAVED_QUESTIONS_UNAVAILABLE, and the entry and its key stay", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    vi.spyOn(h.keys, "destroy").mockRejectedValue(new Error("DISK"));
    const deleted = await h.send(ANA, "DELETE", `${BASE}/${id}`);
    expect(deleted.statusCode).toBe(503);
    expect(deleted.json()).toEqual({ error: "SAVED_QUESTIONS_UNAVAILABLE", message: "SAVED_QUESTIONS_UNAVAILABLE" });
    expect((await h.send(ANA, "GET", BASE)).json().questions.map((one: { id: string }) => one.id)).toEqual([id]);
    expect(await h.opens(ANA, id)).toBe(true);
    await h.api.close();
  });
});

describe("the logs", () => {
  it("hold no word of the question, no key bytes and no key file's path", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    const key = await h.keys.load(id, personOf(ANA));
    const secrets = [key.toString("base64"), key.toString("hex")];
    key.fill(0);
    await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1, doc: savedDocOf(ANA_SIGNS) });
    await h.send(ANA, "PUT", `${BASE}/${id}`, { revision: 1, doc: savedDocOf(ANA_SIGNS) });
    await h.send(ANA, "GET", `${BASE}/${id}`);
    await h.send(ANA, "GET", BASE);
    vi.spyOn(h.keys, "destroy").mockRejectedValueOnce(new Error(`DISK at /var/lib/debateai/api/user-deks/saved-questions/${id}`));
    await h.send(ANA, "DELETE", `${BASE}/${id}`);
    await h.send(ANA, "POST", "/v1/asks", ask({ saved_question_id: id }));
    const text = h.lines.join("\n");
    for (const word of ["nuclear", "Romania", "2050", "saved-questions/", "user-deks", ...secrets]) expect(text).not.toContain(word);
    await h.api.close();
  });
});

describe("the removal at Start", () => {
  it("POST /v1/asks with saved_question_id: 202, the entry and its key are gone, and the run's ask holds no saved_question_id", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    const started = await h.send(ANA, "POST", "/v1/asks", ask({ saved_question_id: id }));
    expect(started.statusCode).toBe(202);
    expect((await h.send(ANA, "GET", BASE)).json().questions).toEqual([]);
    expect(await h.keys.exists(id)).toBe(false);
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0]![0]).not.toHaveProperty("saved_question_id");
    expect(JSON.stringify(h.submitted[0]![0])).not.toContain(id);
    await h.api.close();
  });

  it("another person's saved_question_id: 202, and their entry stays with its key", async () => {
    const h = await harness();
    const id = await h.create(BEN, savedDocOf(BEN_SIGNS));
    expect((await h.send(ANA, "POST", "/v1/asks", ask({ saved_question_id: id }))).statusCode).toBe(202);
    expect(h.store.rows.has(id)).toBe(true);
    expect(await h.opens(BEN, id)).toBe(true);
    await h.api.close();
  });

  it("a removal that fails: still 202, and one api.saved_question.remove_failed line with no words", async () => {
    const h = await harness();
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    vi.spyOn(h.keys, "destroy").mockRejectedValue(new Error("DISK"));
    expect((await h.send(ANA, "POST", "/v1/asks", ask({ saved_question_id: id }))).statusCode).toBe(202);
    const failed = h.lines.filter((line) => line.includes("api.saved_question.remove_failed"));
    expect(failed).toHaveLength(1);
    expect(failed[0]).not.toMatch(/nuclear|Romania/iu);
    expect(h.store.rows.has(id)).toBe(true);
    await h.api.close();
  });

  it("a 422 from the question check removes nothing: the entry and its key stay", async () => {
    const h = await harness({ outcome: { outcome: "REFUSE", kind: "made-up", screen: "REFUSE", emergencyNumber: false } });
    const id = await h.create(ANA, savedDocOf(ANA_SIGNS));
    expect((await h.send(ANA, "POST", "/v1/asks", ask({ saved_question_id: id }))).statusCode).toBe(422);
    expect(h.store.rows.has(id)).toBe(true);
    expect(await h.opens(ANA, id)).toBe(true);
    expect(h.submitted).toEqual([]);
    await h.api.close();
  });
});
