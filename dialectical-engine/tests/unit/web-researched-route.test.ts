import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { ResearchedAddedSchema, ResearchedRefusedSchema, type Answer } from "@debateai/contract";
import { addToResearched, type WebResearchedPorts } from "../../apps/api/src/web-researched.js";
import { addToResearched as pressOnPage } from "../../apps/ui/lib/v4/load.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * W4-4 "Add to researched", POST /v1/runs/{id}/researched (dig-model revision; owner Q7, Q-D9, F12). The owner only (a stranger's press is the closed
 * 404, before anything is read or kept); only one of that path's other pages; a page already added starts nothing again; not on Free; not while
 * the debate runs; not while new starts wait for a reset. Each refusal keeps nothing and marks no activity.
 */
const OWNER = testHttpIdentity("researched-route-owner");
const OTHER = testHttpIdentity("researched-route-other");
const RUN = "44444444-4444-4444-8444-444444444444";
const POSITION = "55555555-5555-4555-8555-555555555555";
const BODY = { position_ref: POSITION, page_ref: "pg-1" };
const page = (pageRef: string, researched?: object) => ({ page_ref: pageRef, title: "A page", site: "a.example", link: "https://a.example/p", read_depth: "WHOLE", explanation: null,
  ...(researched === undefined ? {} : { researched }) });
const answer = (pages: readonly object[]): Answer => ({ web: { paths: [{ position_ref: POSITION, search: { status: "SEARCHED" }, other_pages: pages, suggestions: [] }] } }) as unknown as Answer;

function ports(overrides: Partial<WebResearchedPorts> = {}) {
  const record = vi.fn<WebResearchedPorts["record"]>(async () => "RECORDED");
  const markActivity = vi.fn<WebResearchedPorts["markActivity"]>(async () => undefined);
  return { record, markActivity, readAnswer: async () => answer([page("pg-1")]), readRunExists: async () => true,
    readRoom: async () => ({ planId: "PLUS", waitsForReset: false }), ...overrides } satisfies WebResearchedPorts;
}
const run = (p: WebResearchedPorts, body: unknown = BODY) => addToResearched({ ownerRef: "owner", runId: RUN, body }, p);

describe("addToResearched", () => {
  it("keeps the choice and starts the 30-day clock again: READING", async () => {
    const p = ports();
    expect(await run(p)).toEqual({ kind: "ADDED", body: { state: "READING" } });
    expect(p.record).toHaveBeenCalledExactlyOnceWith("owner", RUN, "pg-1");
    expect(p.markActivity).toHaveBeenCalledExactlyOnceWith("owner", RUN);
  });
  it("a page already added answers READING and neither reads the room nor keeps anything", async () => {
    for (const state of [{ state: "READING" }, { state: "ADDS_NOTHING" }, { state: "FAILED" }]) {
      const readRoom = vi.fn(async () => ({ planId: "FREE", waitsForReset: true }));
      const p = ports({ readAnswer: async () => answer([page("pg-1", state)]), readRoom });
      expect((await run(p)).kind).toBe("ADDED");
      expect(p.record).not.toHaveBeenCalled();
      expect(readRoom).not.toHaveBeenCalled();
    }
  });
  it("refuses Free, and a full day, week or month, keeping nothing", async () => {
    const free = ports({ readRoom: async () => ({ planId: "FREE", waitsForReset: false }) });
    expect(await run(free)).toMatchObject({ kind: "REFUSED", body: { error: "WEB_RESEARCHED_NOT_ON_PLAN" } });
    const full = ports({ readRoom: async () => ({ planId: "PLUS", waitsForReset: true }) });
    expect(await run(full)).toMatchObject({ kind: "REFUSED", body: { error: "WEB_RESEARCHED_WAITS_FOR_RESET" } });
    for (const p of [free, full]) { expect(p.record).not.toHaveBeenCalled(); expect(p.markActivity).not.toHaveBeenCalled(); }
  });
  it("while the debate runs: NOT_NOW; a debate this account cannot read: not found", async () => {
    expect(await run(ports({ readAnswer: async () => null }))).toMatchObject({ kind: "REFUSED", body: { error: "WEB_RESEARCHED_NOT_NOW" } });
    expect(await run(ports({ readAnswer: async () => null, readRunExists: async () => false }))).toEqual({ kind: "NOT_FOUND" });
  });
  it("only an other page of that path; the store's own refusal is not found too", async () => {
    expect(await run(ports(), { position_ref: "66666666-6666-4666-8666-666666666666", page_ref: "pg-1" })).toEqual({ kind: "NOT_FOUND" });
    expect(await run(ports(), { position_ref: POSITION, page_ref: "pg-9" })).toEqual({ kind: "NOT_FOUND" });
    for (const refusal of ["NOT_OWNED", "NOT_OTHER_PAGE"] as const) {
      const p = ports({ record: vi.fn(async () => refusal) });
      expect(await run(p)).toEqual({ kind: "NOT_FOUND" });
      expect(p.markActivity).not.toHaveBeenCalled();
    }
  });
  it("a body that is not the path and the page is malformed", async () => {
    expect(await run(ports(), { position_ref: POSITION })).toEqual({ kind: "MALFORMED" });
    expect(await run(ports(), { ...BODY, search_words: "harbour" })).toEqual({ kind: "MALFORMED" });
  });
});

describe("POST /v1/runs/{id}/researched", () => {
  function apiWith() {
    const record = vi.fn(async () => "RECORDED" as const);
    const markActivity = vi.fn(async () => undefined);
    const api = buildApi({
      application: {
        // The owner's answer read answers null for anyone else.
        readRunAnswer: async (_runId: string, _session: unknown, ownership: { ownerRef: string | null }) =>
          ownership.ownerRef === OWNER.authenticated.ownerRef ? answer([page("pg-1")]) : null,
        readRun: async (_runId: string, _session: unknown, ownership: { ownerRef: string | null }) =>
          ownership.ownerRef === OWNER.authenticated.ownerRef ? {} : null
      } as unknown as AskApplication,
      sessions: testSessionApplication([OWNER, OTHER]),
      allowedOrigin: TEST_APP_ORIGIN,
      webResearched: { record, markActivity }
    });
    return { api, record, markActivity };
  }
  const post = (api: ReturnType<typeof apiWith>["api"], identity: typeof OWNER, payload: object = BODY) =>
    api.inject({ method: "POST", url: `/v1/runs/${RUN}/researched`, headers: testSessionHeaders(identity, true), payload });

  it("the owner gets 202 READING", async () => {
    const { api, record, markActivity } = apiWith();
    const response = await post(api, OWNER);
    expect(response.statusCode).toBe(202);
    expect(ResearchedAddedSchema.parse(response.json())).toEqual({ state: "READING" });
    expect(record).toHaveBeenCalledOnce();
    expect(markActivity).toHaveBeenCalledOnce();
  });
  it("a stranger gets the closed 404, nothing kept", async () => {
    const { api, record } = apiWith();
    expect((await post(api, OTHER)).statusCode).toBe(404);
    expect(record).not.toHaveBeenCalled();
  });
  it("anyone not signed in is refused, and a word on the side is 400", async () => {
    const { api, record } = apiWith();
    expect((await api.inject({ method: "POST", url: `/v1/runs/${RUN}/researched`, payload: BODY })).statusCode).toBeGreaterThanOrEqual(401);
    expect((await post(api, OWNER, { ...BODY, extra: 1 })).statusCode).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
  it("the refusals parse as the contract says", () => {
    expect(ResearchedRefusedSchema.parse({ error: "WEB_RESEARCHED_NOT_NOW", message: "WEB_RESEARCHED_NOT_NOW" })).toBeDefined();
  });
});

describe("the page's press", () => {
  it("sends the path's position, and turns the answers into what the page says", async () => {
    const asked: unknown[] = [];
    const answering = (answer: () => unknown) => ({ addToResearched: async (_run: string, body: unknown) => { asked.push(body); return answer() as never; } });
    expect(await pressOnPage(RUN, `${POSITION}#2`, "pg-1", answering(() => ({ state: "READING" })))).toBe("READING");
    expect(asked).toEqual([{ position_ref: POSITION, page_ref: "pg-1" }]);
    expect(await pressOnPage(RUN, POSITION, "pg-1", answering(() => ({ error: "WEB_RESEARCHED_WAITS_FOR_RESET", message: "WEB_RESEARCHED_WAITS_FOR_RESET" })))).toBe("WAITS_FOR_RESET");
    expect(await pressOnPage(RUN, POSITION, "pg-1", answering(() => ({ error: "WEB_RESEARCHED_NOT_NOW", message: "WEB_RESEARCHED_NOT_NOW" })))).toBe("TRY_AGAIN");
    expect(await pressOnPage(RUN, POSITION, "pg-1", answering(() => { throw new Error("offline"); }))).toBe("TRY_AGAIN");
  });
});

