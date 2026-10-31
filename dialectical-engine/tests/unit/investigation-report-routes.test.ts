import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  createContractClient,
  InvestigationReopenedSchema,
  InvestigationReportAcceptedSchema,
  InvestigationReportsSchema,
  InvestigationReportWritingSchema,
  type InvestigationReportStory
} from "@debateai/contract";
import type { InvestigationRead, InvestigationReportEntry } from "@debateai/db";
import type { InvestigationReportPorts, ReportContentItem } from "../../apps/api/src/investigation-report.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * R22 W5-1 — THE FINAL REPORT OVER AN INVESTIGATION, its three routes over stand-ins for 0133's and 0136's definers.
 *  - GET /v1/runs/{id}/investigation: each closing a version, oldest first; one being written says how many digs it waits
 *    for; FAILED rows FAILED; written ones opened under the ROOT's run key; a content that does not open into the stored
 *    shape is served FAILED (never a failed read); `current` the newest finished one; a debate in no investigation OPEN.
 *  - POST /v1/runs/{id}/report ("Write my report"): 202 with the version being written; a second press the same version;
 *    after a FAILED version a new one; after a finished one 409 INVESTIGATION_CLOSED.
 *  - POST /v1/runs/{id}/reopen ("Keep digging"): 409 INVESTIGATION_REPORT_WRITING while a version is written; else 200 OPEN.
 * Another account's debate is the closed 404 on all three. Made-up texts only.
 */

const OWNER = testHttpIdentity("investigation-report-owner");
const OTHER = testHttpIdentity("investigation-report-other");
const ROOT = "11111111-1111-4111-8111-111111111111";
const DIG = "22222222-2222-4222-8222-222222222222";
const DIG_TWO = "33333333-3333-4333-8333-333333333333";
const LONE = "44444444-4444-4444-8444-444444444444";
const INVESTIGATION = "55555555-5555-4555-8555-555555555555";
const LONE_INVESTIGATION = "66666666-6666-4666-8666-666666666666";
const REPORT_ONE = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const REPORT_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const STORY: InvestigationReportStory = {
  short_answer: "A made-up short answer over the whole investigation.",
  what_would_change: "A made-up line on what would change it.",
  how_it_went: [{ dig_run_id: DIG, paragraph: "The made-up dig found the costs were lower than first said." }],
  still_open: ["A made-up open question."]
};
const SOURCE = { site: "grid-costs.example", title: "A made-up report", quote: "A made-up quote.", line: "Reader one says why it matters." };
const content = (extra: Record<string, unknown> = {}) => ({
  v: 1, answer: { segments: ["The made-up answer.", "What evidence would decide it."] }, story: STORY, sources: [SOURCE], shortened: false, ...extra
});

type Closing = InvestigationRead["closings"][number];
type World = {
  state: "open" | "closed";
  closings: Closing[];
  reports: InvestigationReportEntry[];
  waiting: number;
  /** The sealed contents by report id (the stand-in "opens" an envelope to its value). */
  sealed: Map<string, unknown>;
  lone: string | null;
};

const at = (minute: number) => `2026-10-31T10:${String(minute).padStart(2, "0")}:00.123456+00:00`;
const isoAt = (minute: number) => new Date(at(minute)).toISOString();
const closing = (version: number, minute: number, reopened: number | null = null): Closing =>
  ({ report_version: version, closed_at: at(minute), reopened_at: reopened === null ? null : at(reopened), report_ref: null, report_written_at: null });
const report = (version: number, id: string, outcome: InvestigationReportEntry["outcome"], minute: number): InvestigationReportEntry => ({
  report_version: version, report_id: id, outcome, story_outcome: outcome === "FAILED" ? null : outcome, failure_code: outcome === "FAILED" ? "ANSWER_FAILED" : null,
  covered_rewrite_id: null, covered_rewrite_recorded_at: null, ladder_step: 1, left_out: 0, spent_micros: 0, recorded_at: at(minute),
  content: outcome === "FAILED" ? null : { sealed: id }
});

function worldOf(partial: Partial<World> = {}): World {
  return { state: "open", closings: [], reports: [], waiting: 0, sealed: new Map(), lone: null, ...partial };
}

function portsOver(world: World) {
  const isOwner = (ownerRef: string) => ownerRef === OWNER.authenticated.ownerRef;
  const members = () => [ROOT, DIG, DIG_TWO];
  const investigationOf = (runId: string) => members().includes(runId) ? INVESTIGATION : world.lone !== null && runId === LONE ? LONE_INVESTIGATION : null;
  const readOf = (runId: string): InvestigationRead => ({
    investigation_id: investigationOf(runId)!, root_run_id: runId === LONE ? LONE : ROOT, state: world.state, opened_at: at(0),
    last_activity_at: at(0), closed_at: world.state === "closed" ? world.closings.at(-1)!.closed_at : null,
    report_version: world.closings.length,
    members: (runId === LONE ? [LONE] : members()).map((member) => ({ run_id: member, parent_run_id: member === LONE || member === ROOT ? null : ROOT,
      places: [], mode: null, joined_at: at(0) })),
    closings: [...world.closings]
  });
  const close = vi.fn(async (ownerRef: string, _investigationId: string) => {
    if (!isOwner(ownerRef)) return { outcome: "NOT_OWNED" as const, reportVersion: null, wipedTexts: 0 };
    if (world.state === "closed") return { outcome: "ALREADY_CLOSED" as const, reportVersion: null, wipedTexts: 0 };
    world.state = "closed";
    world.closings.push(closing(world.closings.length + 1, 30));
    return { outcome: "CLOSED" as const, reportVersion: world.closings.length, wipedTexts: 3 };
  });
  const reopen = vi.fn(async (ownerRef: string, _investigationId: string) => {
    if (!isOwner(ownerRef)) return "NOT_OWNED" as const;
    if (world.state === "open") return "ALREADY_OPEN" as const;
    world.state = "open";
    const newest = world.closings.at(-1)!;
    world.closings[world.closings.length - 1] = { ...newest, reopened_at: at(40) };
    return "REOPENED" as const;
  });
  const opened: Array<{ root: string; items: readonly ReportContentItem[] }> = [];
  const ports: InvestigationReportPorts = {
    reports: {
      read: async (ownerRef, runId) => !isOwner(ownerRef) || investigationOf(runId) === null ? null
        : { investigation: readOf(runId), waiting: world.waiting, reports: [...world.reports] }
    },
    investigations: {
      open: async (ownerRef, runId) => {
        if (!isOwner(ownerRef) || ![...members(), LONE].includes(runId)) return null;
        if (runId === LONE && world.lone === null) world.lone = LONE_INVESTIGATION;
        return investigationOf(runId);
      },
      close,
      reopen
    },
    owns: async (ownerRef, runId) => isOwner(ownerRef) && [...members(), LONE].includes(runId),
    openRootContent: async (root, items) => {
      opened.push({ root, items });
      return items.map((item) => world.sealed.get(item.primaryKey));
    }
  };
  return { ports, close, reopen, opened };
}

function apiOver(world: World) {
  const over = portsOver(world);
  const api = buildApi({
    application: {} as unknown as AskApplication,
    sessions: testSessionApplication([OWNER, OTHER]),
    allowedOrigin: TEST_APP_ORIGIN,
    investigationReports: over.ports
  });
  return { api, ...over };
}

const get = (api: ReturnType<typeof apiOver>["api"], identity: typeof OWNER, runId = ROOT) =>
  api.inject({ method: "GET", url: `/v1/runs/${runId}/investigation`, headers: testSessionHeaders(identity) });
const post = (api: ReturnType<typeof apiOver>["api"], identity: typeof OWNER, path: "report" | "reopen", runId = ROOT, payload: unknown = {}) =>
  api.inject({ method: "POST", url: `/v1/runs/${runId}/${path}`, headers: testSessionHeaders(identity, true), payload: payload as object });

/** Three versions: 1 written (shortened, no story), 2 failed, 3 still being written and waiting for two digs. */
function threeVersions(): World {
  return worldOf({
    state: "closed",
    closings: [closing(1, 1, 5), closing(2, 6, 9), closing(3, 10)],
    reports: [report(1, REPORT_ONE, "READY_WITH_RESERVATION", 3), report(2, REPORT_TWO, "FAILED", 8)],
    waiting: 2,
    sealed: new Map([[REPORT_ONE.toLowerCase(), content({ story: null, shortened: true })]])
  });
}

describe("GET /v1/runs/{id}/investigation", () => {
  it("another account's debate is the closed 404; an anonymous read is refused", async () => {
    const { api, opened } = apiOver(threeVersions());
    const other = await get(api, OTHER);
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: "RUN_NOT_FOUND" });
    const anonymous = await api.inject({ method: "GET", url: `/v1/runs/${ROOT}/investigation` });
    expect(anonymous.statusCode).toBe(401);
    expect(opened).toEqual([]);
    await api.close();
  });

  it("serves every closing as a version, oldest first: written, failed and being written, the newest written one current", async () => {
    const { api, opened } = apiOver(threeVersions());
    const response = await get(api, OWNER);
    expect(response.statusCode).toBe(200);
    const read = InvestigationReportsSchema.parse(response.json());
    expect(read).toEqual({
      investigation_id: INVESTIGATION, root_run_id: ROOT, state: "CLOSED", digs: 2, current: 1,
      versions: [
        { report_version: 1, closed_at: isoAt(1), state: "READY_WITH_RESERVATION", written_at: isoAt(3),
          answer: { segments: ["The made-up answer.", "What evidence would decide it."] }, story: null, sources: [SOURCE], shortened: true },
        { report_version: 2, closed_at: isoAt(6), state: "FAILED", written_at: isoAt(8) },
        { report_version: 3, closed_at: isoAt(10), state: "WRITING", waiting_for_digs: 2 }
      ]
    });
    // Only the written version is opened, under the ROOT's run key, by its report id in lower case.
    expect(opened).toEqual([{ root: ROOT, items: [{ carrier: "identity.investigation_report", primaryKey: REPORT_ONE.toLowerCase(), envelope: { sealed: REPORT_ONE } }] }]);
    await api.close();
  });

  it("a dig answers its investigation's versions too", async () => {
    const { api } = apiOver(threeVersions());
    const read = InvestigationReportsSchema.parse((await get(api, OWNER, DIG)).json());
    expect(read.root_run_id).toBe(ROOT);
    expect(read.versions).toHaveLength(3);
    await api.close();
  });

  it("a content that does not open into the stored shape is served as FAILED, never as a failed read", async () => {
    const world = worldOf({
      state: "closed", closings: [closing(1, 1, 5), closing(2, 6)],
      reports: [report(1, REPORT_ONE, "READY", 3), report(2, REPORT_TWO, "READY", 8)],
      sealed: new Map<string, unknown>([[REPORT_ONE.toLowerCase(), content()], [REPORT_TWO, content({ v: 2, score: 0.9 })]])
    });
    const { api } = apiOver(world);
    const read = InvestigationReportsSchema.parse((await get(api, OWNER)).json());
    expect(read.versions.map((version) => version.state)).toEqual(["READY", "FAILED"]);
    expect(read.versions[1]).toEqual({ report_version: 2, closed_at: isoAt(6), state: "FAILED", written_at: isoAt(8) });
    expect(read.current).toBe(1);
    await api.close();
  });

  it("a closing reopened before its report was written reads FAILED, from when it was reopened", async () => {
    const { api } = apiOver(worldOf({ state: "open", closings: [closing(1, 1, 4)] }));
    const read = InvestigationReportsSchema.parse((await get(api, OWNER)).json());
    expect(read).toMatchObject({ state: "OPEN", current: null, versions: [{ report_version: 1, state: "FAILED", written_at: isoAt(4) }] });
    await api.close();
  });

  it("a debate in no investigation is open, with no versions", async () => {
    const { api } = apiOver(worldOf());
    const response = await get(api, OWNER, LONE);
    expect(response.statusCode).toBe(200);
    expect(InvestigationReportsSchema.parse(response.json()))
      .toEqual({ investigation_id: null, root_run_id: LONE, state: "OPEN", digs: 0, versions: [], current: null });
    await api.close();
  });

  it("without the report ports the route answers the closed 404", async () => {
    const api = buildApi({ application: {} as unknown as AskApplication, sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN });
    expect((await get(api, OWNER)).statusCode).toBe(404);
    expect((await post(api, OWNER, "report")).statusCode).toBe(404);
    expect((await post(api, OWNER, "reopen")).statusCode).toBe(404);
    await api.close();
  });
});

describe("POST /v1/runs/{id}/report (\"Write my report\")", () => {
  it("closes an open investigation: 202 with the version being written and the digs it waits for", async () => {
    const world = worldOf({ waiting: 1 });
    const { api, close } = apiOver(world);
    const response = await post(api, OWNER, "report");
    expect(response.statusCode).toBe(202);
    expect(InvestigationReportAcceptedSchema.parse(response.json())).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 1 });
    expect(close).toHaveBeenCalledTimes(1);
    expect(world.state).toBe("closed");
    await api.close();
  });

  it("opens an investigation with this debate as its root when it is in none, then closes it", async () => {
    const world = worldOf();
    const { api } = apiOver(world);
    const response = await post(api, OWNER, "report", LONE);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 0 });
    expect(world.lone).toBe(LONE_INVESTIGATION);
    await api.close();
  });

  it("a second press while the version is being written answers the same version and changes nothing", async () => {
    const { api, close, reopen } = apiOver(worldOf({ waiting: 2 }));
    expect((await post(api, OWNER, "report")).json()).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 2 });
    const again = await post(api, OWNER, "report");
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 2 });
    expect(close).toHaveBeenCalledTimes(1);
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });

  it("after a FAILED version it writes again as a new version (reopen, then close)", async () => {
    const world = worldOf({ state: "closed", closings: [closing(1, 1)], reports: [report(1, REPORT_ONE, "FAILED", 3)] });
    const { api, close, reopen } = apiOver(world);
    const response = await post(api, OWNER, "report");
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 2, waiting_for_digs: 0 });
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(world.closings.map((entry) => entry.report_version)).toEqual([1, 2]);
    await api.close();
  });

  it("after a finished version it is refused with 409 INVESTIGATION_CLOSED, nothing changed", async () => {
    const world = worldOf({ state: "closed", closings: [closing(1, 1)], reports: [report(1, REPORT_ONE, "READY", 3)],
      sealed: new Map([[REPORT_ONE.toLowerCase(), content()]]) });
    const { api, close, reopen } = apiOver(world);
    const response = await post(api, OWNER, "report");
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "INVESTIGATION_CLOSED", message: "INVESTIGATION_CLOSED" });
    expect(close).not.toHaveBeenCalled();
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });

  it("another account's debate is the closed 404; a malformed body is 400; nothing is closed", async () => {
    const { api, close } = apiOver(worldOf());
    const other = await post(api, OTHER, "report");
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: "RUN_NOT_FOUND" });
    const malformed = await post(api, OWNER, "report", ROOT, { version: 2 });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    expect(close).not.toHaveBeenCalled();
    await api.close();
  });
});

describe("POST /v1/runs/{id}/reopen (\"Keep digging\")", () => {
  it("while the newest version is being written: 409 INVESTIGATION_REPORT_WRITING, nothing changed", async () => {
    const { api, reopen } = apiOver(worldOf({ state: "closed", closings: [closing(1, 1)] }));
    const response = await post(api, OWNER, "reopen");
    expect(response.statusCode).toBe(409);
    expect(InvestigationReportWritingSchema.parse(response.json()))
      .toEqual({ error: "INVESTIGATION_REPORT_WRITING", message: "INVESTIGATION_REPORT_WRITING", report_version: 1 });
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });

  it("after a finished version it reopens: 200 OPEN; an investigation already open answers the same", async () => {
    const world = worldOf({ state: "closed", closings: [closing(1, 1)], reports: [report(1, REPORT_ONE, "READY", 3)],
      sealed: new Map([[REPORT_ONE.toLowerCase(), content()]]) });
    const { api, reopen } = apiOver(world);
    const response = await post(api, OWNER, "reopen");
    expect(response.statusCode).toBe(200);
    expect(InvestigationReopenedSchema.parse(response.json())).toEqual({ state: "OPEN" });
    expect(world.state).toBe("open");
    const again = await post(api, OWNER, "reopen");
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ state: "OPEN" });
    expect(reopen).toHaveBeenCalledTimes(2);
    // The earlier version stays readable, and still current.
    expect(InvestigationReportsSchema.parse((await get(api, OWNER)).json())).toMatchObject({ state: "OPEN", current: 1 });
    await api.close();
  });

  it("a debate in no investigation, or another account's, is the closed 404", async () => {
    const { api, reopen } = apiOver(worldOf());
    expect((await post(api, OWNER, "reopen", LONE)).statusCode).toBe(404);
    expect((await post(api, OTHER, "reopen")).statusCode).toBe(404);
    expect((await post(api, OWNER, "reopen", ROOT, { force: true })).statusCode).toBe(400);
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });
});

describe("the typed client's report calls", () => {
  const clientOver = (status: number, body: unknown) => {
    const seen: { url: string; method: string | undefined; body: unknown; csrf: string | null }[] = [];
    const client = createContractClient("https://debate.example", (async (url: URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        csrf: new Headers(init?.headers).get("x-csrf-token") });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch, { mode: "cookie", csrfToken: () => "csrf-1" });
    return { client, seen };
  };

  it("reads the versions", async () => {
    const none = { investigation_id: null, root_run_id: ROOT, state: "OPEN", digs: 0, versions: [], current: null };
    const { client, seen } = clientOver(200, none);
    expect(await client.readInvestigation(ROOT)).toEqual(none);
    expect(seen[0]).toMatchObject({ url: `https://debate.example/v1/runs/${ROOT}/investigation`, method: undefined });
  });

  it("\"Write my report\" posts an empty body with the CSRF header; the 409 INVESTIGATION_CLOSED is answered as data", async () => {
    const accepted = clientOver(202, { state: "WRITING", report_version: 2, waiting_for_digs: 1 });
    expect(await accepted.client.writeReport(ROOT)).toEqual({ state: "WRITING", report_version: 2, waiting_for_digs: 1 });
    expect(accepted.seen).toEqual([{ url: `https://debate.example/v1/runs/${ROOT}/report`, method: "POST", body: {}, csrf: "csrf-1" }]);
    const closed = clientOver(409, { error: "INVESTIGATION_CLOSED", message: "INVESTIGATION_CLOSED" });
    expect(await closed.client.writeReport(ROOT)).toEqual({ error: "INVESTIGATION_CLOSED", message: "INVESTIGATION_CLOSED" });
    await expect(clientOver(404, { error: "RUN_NOT_FOUND" }).client.writeReport(ROOT)).rejects.toMatchObject({ status: 404 });
  });

  it("\"Keep digging\" answers OPEN, or the 409 INVESTIGATION_REPORT_WRITING as data", async () => {
    expect(await clientOver(200, { state: "OPEN" }).client.reopenInvestigation(ROOT)).toEqual({ state: "OPEN" });
    const writing = { error: "INVESTIGATION_REPORT_WRITING", message: "INVESTIGATION_REPORT_WRITING", report_version: 3 };
    expect(await clientOver(409, writing).client.reopenInvestigation(ROOT)).toEqual(writing);
  });
});
