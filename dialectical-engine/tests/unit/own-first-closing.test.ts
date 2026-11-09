// V4 start step, Task 56b (item public-f25; owner answer Q20 B: "Only a debate's very first report uses the kept reserve: if a visitor
// wrote the first report, the owner's own report waits for the next month"). The person's own "Write my report" on their own public
// debate, while their month waits for its reset: the debate's first report goes ahead (the press is the public report, charged as a
// public report is, from the kept reserve); any further report, the person's or anyone's, waits for the reset (409
// PUBLIC_DEBATE_WAITS_FOR_RESET), as today. The public page's press follows the same rule when the presser owns the debate; a
// stranger's is today's. The owner's investigation read says whether their next press would be the debate's first
// (`first_closing_left`). Over stand-ins for 0133's and 0136's reads, Task 53a's counts and the room; made-up texts only.
import { describe, expect, it } from "vitest";
import { buildApi, ownClosingsCount, ownClosingsOf, ownFirstClosingLeft, type AskApplication, type OwnClosings } from "@debateai/api";
import { InvestigationReportsSchema, type InvestigationReportStory } from "@debateai/contract";
import type { InvestigationRead, InvestigationReportEntry, OwnClosingsStore } from "@debateai/db";
import type { InvestigationReportPorts } from "../../apps/api/src/investigation-report.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const OWNER = testHttpIdentity("own-first-closing-owner");
const VISITOR = testHttpIdentity("own-first-closing-visitor");
/** The owner's public debate (its root), and a private one of theirs. */
const RUN = "11111111-1111-4111-8111-111111111111";
const PRIVATE_RUN = "22222222-2222-4222-8222-222222222222";
const PUBLICATION = "33333333-3333-4333-8333-333333333333";
const INVESTIGATION = "44444444-4444-4444-8444-444444444444";
const REPORT_ID = "55555555-5555-4555-8555-555555555555";

const STORY: InvestigationReportStory = {
  short_answer: "A made-up short answer.", what_would_change: "A made-up line on what would change it.", how_it_went: [], still_open: []
};
const CONTENT = { v: 1, answer: { segments: ["The made-up answer."] }, story: STORY, sources: [], shortened: false };

type Closing = InvestigationRead["closings"][number];
/** A public report version as 0147 keeps it: its writer and outcome (null: being written). */
type PublicVersion = Readonly<{ writer: string; outcome: "READY" | "FAILED" | null }>;
type World = {
  waitsForReset: boolean;
  /** RUN's investigation, from before the debate went public (a private closing). */
  closings: Closing[];
  reports: InvestigationReportEntry[];
  versions: PublicVersion[];
  /** Who opened a public report version, in order. */
  presses: string[];
  /** Whether an investigation was opened (0133's open; a closing implies one). */
  opened: boolean;
  /** The private branch's closes. */
  closes: number;
};

const at = (minute: number) => `2026-11-05T09:${String(minute).padStart(2, "0")}:00.000000+00:00`;
const closing = (version: number, reopened: number | null = null): Closing =>
  ({ report_version: version, closed_at: at(version), reopened_at: reopened === null ? null : at(reopened), report_ref: null, report_written_at: null });
const report = (version: number, outcome: InvestigationReportEntry["outcome"]): InvestigationReportEntry => ({
  report_version: version, report_id: REPORT_ID, outcome, story_outcome: outcome === "FAILED" ? null : outcome, failure_code: outcome === "FAILED" ? "ANSWER_FAILED" : null,
  covered_rewrite_id: null, covered_rewrite_recorded_at: null, ladder_step: 1, left_out: 0, spent_micros: 0, recorded_at: at(version + 1),
  content: outcome === "FAILED" ? null : { sealed: true }
});
const worldOf = (partial: Partial<World> = {}): World =>
  ({ waitsForReset: true, closings: [], reports: [], versions: [], presses: [], opened: false, closes: 0, ...partial });

const isOwner = (ownerRef: string) => ownerRef === OWNER.authenticated.ownerRef;
const owned = (runId: string) => runId === RUN || runId === PRIVATE_RUN;

function reportPorts(world: World): InvestigationReportPorts {
  const readOf = (runId: string): InvestigationRead => ({
    investigation_id: INVESTIGATION, root_run_id: runId, state: world.closings.at(-1)?.reopened_at === null ? "closed" : "open",
    opened_at: at(0), last_activity_at: at(0), closed_at: null, report_version: world.closings.length,
    members: [{ run_id: runId, parent_run_id: null, places: [], mode: null, joined_at: at(0) }], closings: [...world.closings]
  });
  return {
    reports: { read: async (ownerRef, runId) => !isOwner(ownerRef) || !owned(runId) || (!world.opened && world.closings.length === 0) ? null
      : { investigation: readOf(runId), waiting: 0, reports: [...world.reports] } },
    investigations: {
      open: async (ownerRef, runId) => {
        if (!isOwner(ownerRef) || !owned(runId)) return null;
        world.opened = true;
        return INVESTIGATION;
      },
      close: async (ownerRef) => {
        if (!isOwner(ownerRef)) return { outcome: "NOT_OWNED" as const, reportVersion: null };
        if (world.closings.at(-1)?.reopened_at === null) return { outcome: "ALREADY_CLOSED" as const, reportVersion: null };
        world.closes += 1;
        world.closings.push(closing(world.closings.length + 1));
        return { outcome: "CLOSED" as const, reportVersion: world.closings.length };
      },
      reopen: async () => "ALREADY_OPEN" as const
    },
    owns: async (ownerRef, runId) => isOwner(ownerRef) && owned(runId),
    openRootContent: async (_root, items) => items.map(() => CONTENT)
  };
}

/** Task 53a's counts as 0161 counts them: the versions that did not fail, this writer's and every writer's. */
function closingsStore(world: World, asked: string[]): OwnClosingsStore {
  return {
    countPublicReports: async (ownerRef, publicationRef) => {
      asked.push(publicationRef);
      const kept = world.versions.filter((version) => publicationRef === PUBLICATION && version.outcome !== "FAILED");
      return { own: kept.filter((version) => version.writer === ownerRef).length, all: kept.length };
    }
  };
}

function apiOver(world: World, input: Readonly<{ ownClosings?: boolean; publicFlags?: boolean }> = {}) {
  const asked: string[] = [];
  const api = buildApi({
    application: {} as unknown as AskApplication,
    sessions: testSessionApplication([OWNER, VISITOR]),
    allowedOrigin: TEST_APP_ORIGIN,
    investigationReports: reportPorts(world),
    // The room's quick look: only its plan and whether new starts wait for a reset are read.
    askRoom: { readRoom: async () => ({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: "FREE",
      ...(world.waitsForReset ? { newStarts: "BLOCKED_UNTIL_RESET" } : {}) }) } as never,
    // 0147's open: a version opens for the writer and is being written (the stand-in answers WRITING, so no seal needs a database).
    publicTree: {
      pool: {} as never,
      tree: {
        readTreeOfRun: async (runId: string) => runId === RUN ? { publication_ref: PUBLICATION, dig_update_id: null } : null,
        openReport: async (ownerRef: string, publicationRef: string, reportId: string) => {
          if (publicationRef !== PUBLICATION) return { outcome: "NOT_PUBLIC", reportId: null, reportVersion: null, carrierRunId: null };
          world.versions.push({ writer: ownerRef, outcome: null });
          world.presses.push(ownerRef);
          return { outcome: "WRITING", reportId, reportVersion: world.versions.length, carrierRunId: RUN };
        }
      } as never,
      contributions: {} as never,
      readPublicDebate: async (publicationRef: string) => publicationRef === PUBLICATION ? ({ public_ref: PUBLICATION } as never) : null
    },
    // 0151's read of the run a publication is of (`PostgresPublicFlagRepository.readTarget`).
    ...(input.publicFlags === false ? {} : { publicFlags: { repository: { readTarget: async (publicationRef: string) => publicationRef === PUBLICATION ? RUN : null } } as never }),
    ...(input.ownClosings === false ? {} : { ownClosings: closingsStore(world, asked) })
  });
  return { api, asked };
}

type Api = ReturnType<typeof apiOver>["api"];
const press = (api: Api, who: typeof OWNER, runId = RUN) =>
  api.inject({ method: "POST", url: `/v1/runs/${runId}/report`, headers: testSessionHeaders(who, true), payload: {} });
const pressOnPage = (api: Api, who: typeof OWNER) =>
  api.inject({ method: "POST", url: `/v1/public/debates/${PUBLICATION}/report`, headers: testSessionHeaders(who, true), payload: {} });
const read = (api: Api, who: typeof OWNER, runId = RUN) =>
  api.inject({ method: "GET", url: `/v1/runs/${runId}/investigation`, headers: testSessionHeaders(who) });
const WAITS = { error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" };
const own = (privateClosings: number, ownPublicReports: number, publicReports: number): OwnClosings =>
  ({ privateClosings, ownPublicReports, publicReports });

describe("the person's own closings of a debate", () => {
  it("the first closing is left only while the debate has no report at all: a visitor's report counts", () => {
    expect(ownFirstClosingLeft(own(0, 0, 0))).toBe(true);
    expect(ownFirstClosingLeft(own(1, 0, 0))).toBe(false);
    expect(ownFirstClosingLeft(own(0, 1, 1))).toBe(false);
    expect(ownFirstClosingLeft(own(0, 0, 1))).toBe(false);
  });

  it("the person's own reports are their private closings and their own public reports, never a visitor's", () => {
    expect(ownClosingsCount(own(1, 1, 2))).toBe(2);
    expect(ownClosingsCount(own(0, 0, 1))).toBe(0);
  });

  it("is read from the investigation (a FAILED version does not count) and Task 53a's counts; null without the port", async () => {
    const world = worldOf({ closings: [closing(1, 2), closing(2, 4), closing(3)], reports: [report(1, "FAILED"), report(2, "READY")],
      versions: [{ writer: OWNER.authenticated.ownerRef, outcome: "READY" }, { writer: VISITOR.authenticated.ownerRef, outcome: null },
        { writer: VISITOR.authenticated.ownerRef, outcome: "FAILED" }] });
    const asked: string[] = [];
    const ports = { reports: reportPorts(world).reports, ownClosings: closingsStore(world, asked) };
    const target = { ownerRef: OWNER.authenticated.ownerRef, runId: RUN };
    // Version 1 failed, 2 is written, 3 is being written: two closings; one own public report of two that did not fail.
    expect(await ownClosingsOf({ ...target, publicationRef: PUBLICATION }, ports)).toEqual(own(2, 1, 2));
    // A private debate asks no public count.
    expect(await ownClosingsOf({ ...target, publicationRef: null }, ports)).toEqual(own(2, 0, 0));
    expect(asked).toEqual([PUBLICATION]);
    // A closing reopened before its report was written was never written; a debate in no investigation has none.
    const reopened = worldOf({ closings: [closing(1, 2)] });
    expect(await ownClosingsOf({ ...target, publicationRef: null }, { reports: reportPorts(reopened).reports, ownClosings: closingsStore(reopened, []) })).toEqual(own(0, 0, 0));
    expect(await ownClosingsOf({ ...target, publicationRef: null }, { reports: reportPorts(worldOf()).reports, ownClosings: closingsStore(worldOf(), []) })).toEqual(own(0, 0, 0));
    expect(await ownClosingsOf({ ...target, publicationRef: PUBLICATION }, { reports: ports.reports, ownClosings: undefined })).toBeNull();
  });

  it("the contract: the owner's investigation read may say whether the next press is the debate's first, a yes or no only", () => {
    const base = { investigation_id: null, root_run_id: RUN, state: "OPEN", digs: 0, versions: [], current: null };
    expect(InvestigationReportsSchema.parse(base)).toEqual(base);
    expect(InvestigationReportsSchema.parse({ ...base, first_closing_left: true })).toEqual({ ...base, first_closing_left: true });
    expect(InvestigationReportsSchema.safeParse({ ...base, first_closing_left: "yes" }).success).toBe(false);
  });
});

describe("\"Write my report\" on the person's own public debate while new starts wait for the reset", () => {
  it("the debate's first report goes ahead as its public report", async () => {
    const world = worldOf();
    const { api } = apiOver(world);
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 0 });
    expect(world.presses).toEqual([OWNER.authenticated.ownerRef]);
    await api.close();
  });

  it("after the person's own public report, the next one waits for the reset", async () => {
    const world = worldOf({ versions: [{ writer: OWNER.authenticated.ownerRef, outcome: "READY" }] });
    const { api } = apiOver(world);
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    await api.close();
  });

  it("a version that FAILED wrote nothing: the next press is still the first", async () => {
    const world = worldOf({ versions: [{ writer: OWNER.authenticated.ownerRef, outcome: "FAILED" }], closings: [closing(1)], reports: [report(1, "FAILED")] });
    const { api } = apiOver(world);
    expect((await press(api, OWNER)).statusCode).toBe(202);
    expect(world.presses).toEqual([OWNER.authenticated.ownerRef]);
    await api.close();
  });

  it("after a visitor's report the person's own report is a further one: it waits for the reset (answer Q20), and inside the quota it goes, as today", async () => {
    const visited = worldOf({ versions: [{ writer: VISITOR.authenticated.ownerRef, outcome: "READY" }] });
    const waiting = apiOver(visited);
    const refused = await press(waiting.api, OWNER);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual(WAITS);
    expect(visited.presses).toEqual([]);
    await waiting.api.close();
    const roomy = worldOf({ waitsForReset: false, versions: [{ writer: VISITOR.authenticated.ownerRef, outcome: "READY" }] });
    const open = apiOver(roomy);
    const response = await press(open.api, OWNER);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 2, waiting_for_digs: 0 });
    // Inside the quota nothing more is read than today.
    expect(open.asked).toEqual([]);
    await open.api.close();
  });

  it("a report written while the debate was private makes the public one a further report", async () => {
    const world = worldOf({ closings: [closing(1)], reports: [report(1, "READY")] });
    const { api } = apiOver(world);
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    await api.close();
  });

  it("without the closings port the route answers as today: the press waits for the reset", async () => {
    const world = worldOf();
    const { api } = apiOver(world, { ownClosings: false });
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    await api.close();
  });

  it("another account pressing on the person's debate keeps today's rule", async () => {
    const world = worldOf();
    const { api, asked } = apiOver(world);
    const response = await press(api, VISITOR);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    expect(asked).toEqual([]);
    await api.close();
  });

  it("a private debate is unchanged: its closing is never held for the quota", async () => {
    const world = worldOf();
    const { api, asked } = apiOver(world);
    const response = await press(api, OWNER, PRIVATE_RUN);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 1, waiting_for_digs: 0 });
    expect(world.closes).toBe(1);
    expect(world.presses).toEqual([]);
    expect(asked).toEqual([]);
    await api.close();
  });
});

describe("the public page's report press while new starts wait for the reset", () => {
  it("by the debate's owner, the debate's first report goes ahead", async () => {
    const world = worldOf();
    const { api } = apiOver(world);
    const response = await pressOnPage(api, OWNER);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ state: "WRITING", report_version: 1 });
    expect(world.presses).toEqual([OWNER.authenticated.ownerRef]);
    await api.close();
  });

  it("by the owner after a visitor's report, it waits for the reset", async () => {
    const world = worldOf({ versions: [{ writer: VISITOR.authenticated.ownerRef, outcome: "READY" }] });
    const { api } = apiOver(world);
    const response = await pressOnPage(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    await api.close();
  });

  it("by a stranger, today's: it waits for the reset, even on a debate with no report", async () => {
    const world = worldOf();
    const { api, asked } = apiOver(world);
    const response = await pressOnPage(api, VISITOR);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(WAITS);
    expect(world.presses).toEqual([]);
    expect(asked).toEqual([]);
    await api.close();
  });

  it("without the closings port, or without the read of the publication's debate, the owner's press is today's", async () => {
    for (const without of [{ ownClosings: false }, { publicFlags: false }]) {
      const world = worldOf();
      const { api } = apiOver(world, without);
      const response = await pressOnPage(api, OWNER);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual(WAITS);
      expect(world.presses).toEqual([]);
      await api.close();
    }
  });
});

describe("GET /v1/runs/{id}/investigation: first_closing_left on the owner's read", () => {
  it("true while the person's next press would be the debate's first report, false after one READY version", async () => {
    const world = worldOf();
    const { api } = apiOver(world);
    const before = await read(api, OWNER);
    expect(before.statusCode).toBe(200);
    expect(InvestigationReportsSchema.parse(before.json())).toMatchObject({ investigation_id: null, versions: [], first_closing_left: true });
    world.versions.push({ writer: OWNER.authenticated.ownerRef, outcome: "READY" });
    expect(InvestigationReportsSchema.parse((await read(api, OWNER)).json()).first_closing_left).toBe(false);
    await api.close();
    // A private debate's READY version too.
    const closed = worldOf({ closings: [closing(1)], reports: [report(1, "READY")] });
    const other = apiOver(closed);
    const after = InvestigationReportsSchema.parse((await read(other.api, OWNER, PRIVATE_RUN)).json());
    expect(after.current).toBe(1);
    expect(after.first_closing_left).toBe(false);
    await other.api.close();
  });

  it("false while only a visitor's version exists", async () => {
    const world = worldOf({ versions: [{ writer: VISITOR.authenticated.ownerRef, outcome: null }] });
    const { api } = apiOver(world);
    expect(InvestigationReportsSchema.parse((await read(api, OWNER)).json()).first_closing_left).toBe(false);
    await api.close();
  });

  it("a stranger's read never has the key, and without the port the owner's has none either", async () => {
    const world = worldOf();
    const { api } = apiOver(world);
    const stranger = await read(api, VISITOR);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: "RUN_NOT_FOUND" });
    await api.close();
    const without = apiOver(world, { ownClosings: false });
    const plain = await read(without.api, OWNER);
    expect(plain.statusCode).toBe(200);
    expect(plain.json()).not.toHaveProperty("first_closing_left");
    await without.api.close();
  });
});
