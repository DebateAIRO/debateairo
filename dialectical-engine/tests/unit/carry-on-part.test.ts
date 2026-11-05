// tests/unit/carry-on-part.test.ts
// V4 start step, Task 58 (spec 2026-11-03 §2 items 7 and 8; item wait-f16; owner card "Carry-on", "Show it from the start"): which part a
// carry-on debate is running, as the run read and the answer serve it, from the box, whether the debate settled, the carry-on mark
// (Task 53a's readCarryOnMark) and the person's newest report version. Made-up data only.
import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { AnswerSchema, CARRY_ON_PARTS, RunProjectionSchema, type Answer, type RunPathProgress, type Session } from "@debateai/contract";
import {
  PostgresInvestigationReportRepository, PostgresOwnClosingsReader, PostgresPathProgressRepository, PostgresPublicPageRepository,
  PostgresPublicTreeRepository, RunRepository, type CarryOnMarkState, type InvestigationReportsOwnerRead, type RunLoadingProjection, type StoredAsk
} from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import {
  carryOnPartOf, carryOnReportOfInvestigation, carryOnReportOfPublic, type CarryOnReportState
} from "../../apps/api/src/carry-on-part.js";
import { branchesFixture } from "../support/branchesFixture.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const part = (carryOnToReport: boolean, runSettled: boolean, mark: CarryOnMarkState, report: CarryOnReportState) =>
  carryOnPartOf({ carryOnToReport, runSettled, mark, report });

describe("carryOnPartOf: the part a carry-on debate is running", () => {
  it("not asked: none, whatever else holds", () => {
    for (const settled of [false, true]) {
      for (const mark of ["NONE", "DUE", "BEGUN", "DONE"] as const) {
        for (const report of ["NONE", "WRITING", "FINISHED"] as const) expect(part(false, settled, mark, report)).toBeNull();
      }
    }
  });

  it("while the debate runs: its answer", () => {
    for (const mark of ["NONE", "DUE", "BEGUN", "DONE"] as const) {
      for (const report of ["NONE", "WRITING", "FINISHED"] as const) expect(part(true, false, mark, report)).toBe("ANSWER");
    }
  });

  it("settled, nothing written yet: the digs, whether the carry-on is due, begun or not marked", () => {
    expect(part(true, true, "NONE", "NONE")).toBe("DIGS");
    expect(part(true, true, "DUE", "NONE")).toBe("DIGS");
    expect(part(true, true, "BEGUN", "NONE")).toBe("DIGS");
  });

  it("the person's newest report version being written: the report; a finished one: none", () => {
    for (const mark of ["NONE", "DUE", "BEGUN", "DONE"] as const) {
      expect(part(true, true, mark, "WRITING")).toBe("REPORT");
      expect(part(true, true, mark, "FINISHED")).toBeNull();
    }
  });

  it("the carry-on done with no version (nothing pressed): none", () => {
    expect(part(true, true, "DONE", "NONE")).toBeNull();
  });

  it("every part it names is one the contract knows", () => {
    for (const settled of [false, true]) {
      for (const mark of ["NONE", "DUE", "BEGUN", "DONE"] as const) {
        for (const report of ["NONE", "WRITING", "FINISHED"] as const) {
          const named = part(true, settled, mark, report);
          if (named !== null) expect(CARRY_ON_PARTS).toContain(named);
        }
      }
    }
  });
});

/** A private debate's investigation read (0133's closings, 0136's reports) as `PostgresInvestigationReportRepository.read` answers it. */
function investigation(closings: ReadonlyArray<Readonly<{ version: number; reopened?: boolean }>>,
  reports: ReadonlyArray<Readonly<{ version: number; outcome: "READY" | "READY_WITH_RESERVATION" | "FAILED" }>>): InvestigationReportsOwnerRead {
  return {
    investigation: {
      investigation_id: "11111111-1111-4111-8111-111111111111", root_run_id: "22222222-2222-4222-8222-222222222222", state: "closed",
      opened_at: "2026-11-05T08:00:00.000Z", last_activity_at: "2026-11-05T09:00:00.000Z", closed_at: "2026-11-05T09:00:00.000Z",
      report_version: closings.length, members: [],
      closings: closings.map((closing) => ({ report_version: closing.version, closed_at: "2026-11-05T09:00:00.000Z",
        reopened_at: closing.reopened === true ? "2026-11-05T09:30:00.000Z" : null, report_ref: null, report_written_at: null }))
    },
    waiting: 0,
    reports: reports.map((report) => ({ report_version: report.version, report_id: `33333333-3333-4333-8333-33333333333${report.version}`,
      outcome: report.outcome, story_outcome: null, failure_code: report.outcome === "FAILED" ? "WRITER_FAILED" : null,
      covered_rewrite_id: null, covered_rewrite_recorded_at: null, ladder_step: 0, left_out: 0, spent_micros: 0,
      recorded_at: "2026-11-05T10:00:00.000Z", content: report.outcome === "FAILED" ? null : { v: 1 } }))
  };
}

describe("carryOnReportOfInvestigation: a private debate's newest report version, from the investigation read (no content opened)", () => {
  it("in no investigation, or no version pressed: none", () => {
    expect(carryOnReportOfInvestigation(null)).toBe("NONE");
    expect(carryOnReportOfInvestigation(investigation([], []))).toBe("NONE");
  });

  it("the newest version not written and not reopened: being written", () => {
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }], []))).toBe("WRITING");
    // An older finished version does not hide a newer one being written.
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }, { version: 2 }], [{ version: 1, outcome: "READY" }]))).toBe("WRITING");
  });

  it("a written version: finished, with or without a reservation, and still finished after a later one failed", () => {
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }], [{ version: 1, outcome: "READY" }]))).toBe("FINISHED");
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }], [{ version: 1, outcome: "READY_WITH_RESERVATION" }]))).toBe("FINISHED");
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }, { version: 2 }],
      [{ version: 1, outcome: "READY" }, { version: 2, outcome: "FAILED" }]))).toBe("FINISHED");
  });

  it("only failed versions, or one reopened before its report: none", () => {
    expect(carryOnReportOfInvestigation(investigation([{ version: 1 }], [{ version: 1, outcome: "FAILED" }]))).toBe("NONE");
    expect(carryOnReportOfInvestigation(investigation([{ version: 1, reopened: true }], []))).toBe("NONE");
  });

  it("reads the closings by version, whatever order the read lists them in", () => {
    const read = investigation([{ version: 2 }, { version: 1 }], [{ version: 1, outcome: "READY" }]);
    expect(carryOnReportOfInvestigation(read)).toBe("WRITING");
  });
});

describe("carryOnReportOfPublic: a public debate's versions, from Task 53a's counts and the page's report copies", () => {
  it("the person has no version that did not fail: none, whatever a visitor wrote (owner answer Q20)", () => {
    expect(carryOnReportOfPublic({ counts: { own: 0, all: 0 }, onPage: 0 })).toBe("NONE");
    expect(carryOnReportOfPublic({ counts: { own: 0, all: 1 }, onPage: 1 })).toBe("NONE");
    expect(carryOnReportOfPublic({ counts: { own: 0, all: 1 }, onPage: 0 })).toBe("NONE");
  });

  it("a version that did not fail and is not on the page yet: being written", () => {
    expect(carryOnReportOfPublic({ counts: { own: 1, all: 1 }, onPage: 0 })).toBe("WRITING");
    expect(carryOnReportOfPublic({ counts: { own: 1, all: 2 }, onPage: 1 })).toBe("WRITING");
  });

  it("every version that did not fail is on the page: finished", () => {
    expect(carryOnReportOfPublic({ counts: { own: 1, all: 1 }, onPage: 1 })).toBe("FINISHED");
    expect(carryOnReportOfPublic({ counts: { own: 2, all: 3 }, onPage: 3 })).toBe("FINISHED");
  });
});

/*
 * The owner's run read and answer read (PostgresAskApplication), over the stores' readers stubbed on their prototypes (b6a-waiting-projection's
 * way): the rules Task 58 adds around the readers, so a read never breaks the contract and never names a part it should not.
 */
describe("the owner's reads of a path debate (PostgresAskApplication)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function stubPool(): Pool {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));
    const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
    return { connect: vi.fn(async () => client), query } as unknown as Pool;
  }
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "t58", settlementWatchHandle: "t58",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef })
  };
  const application = () => new PostgresAskApplication(stubPool(), { dispatch: vi.fn() }, settings, { read: async () => [] }, stubPool(),
    { server: stubPool(), legacy: stubPool() });
  const session = { session_id: "33333333-3333-4333-8333-333333333333" } as Session;
  const OWNER = { ownerRef: "44444444-4444-4444-8444-444444444444", legacyAskerId: null };
  const RUN = "55555555-5555-4555-8555-555555555555";

  const progressOf = (pathIds: readonly string[]): RunPathProgress[] =>
    pathIds.map((pathId) => ({ path_id: pathId, step: "ARGUING", points: ["PUT_FORWARD"], findings: [] }));
  function loading(state: RunLoadingProjection["state"]): void {
    vi.spyOn(RunRepository.prototype, "readLoadingProjection").mockResolvedValue({ runRef: RUN, questionLine: "Should Harbour Town build a second pier?",
      state, terminalReason: state === "FAILED" ? "RUN_FAILED:TEST" : null, holdUntil: null, argumentLanguage: null });
  }
  function reads(input: Readonly<{ ticked: boolean; named: boolean; progress: RunPathProgress[] | null; asked?: boolean }>) {
    const branches = branchesFixture(3, { carry_on_to_report: input.ticked });
    vi.spyOn(ServeRepository.prototype, "readRunBranches").mockResolvedValue(input.named ? branches : null);
    vi.spyOn(ServeRepository.prototype, "readRunPathProgress").mockResolvedValue(input.progress);
    return {
      storedAsk: vi.spyOn(RunRepository.prototype, "readStoredAsk")
        .mockResolvedValue({ askContract: input.asked === true ? { carry_on_to_report: true } : {} } as unknown as StoredAsk),
      mark: vi.spyOn(PostgresPathProgressRepository.prototype, "readCarryOnMark").mockResolvedValue("BEGUN")
    };
  }
  const runRead = async () => {
    const run = await application().readRun(RUN, session, OWNER);
    return RunProjectionSchema.parse(run);
  };

  it("an R22 debate: none of the members, and its stored ask is never opened", async () => {
    loading("RUNNING");
    const spies = reads({ ticked: false, named: false, progress: null });
    const run = await runRead();
    for (const key of ["branches", "path_progress", "carry_on_part"]) expect(run, key).not.toHaveProperty(key);
    expect(spies.storedAsk).not.toHaveBeenCalled();
  });

  it("a set the runner records between the two reads: one read still choosing, with no progress shown and the ticked box's answer", async () => {
    loading("RUNNING");
    reads({ ticked: true, named: false, progress: progressOf(["b1", "b2", "b3"]), asked: true });
    const run = await runRead();
    expect(run.path_progress).toEqual([]);
    expect(run).not.toHaveProperty("branches");
    expect(run.carry_on_part).toBe("ANSWER");
  });

  it("paths not named yet on a debate that settled or failed: no part, and the stored ask is not opened", async () => {
    for (const state of ["SETTLED", "FAILED"] as const) {
      vi.restoreAllMocks();
      loading(state);
      const spies = reads({ ticked: true, named: false, progress: [], asked: true });
      const run = await runRead();
      expect(run.path_progress, state).toEqual([]);
      expect(run, state).not.toHaveProperty("carry_on_part");
      expect(spies.storedAsk, state).not.toHaveBeenCalled();
    }
  });

  it("named paths: the answer while it runs (nothing more read), the digs once settled, none once it failed or unticked", async () => {
    loading("RUNNING");
    let spies = reads({ ticked: true, named: true, progress: progressOf(["b1", "b2", "b3"]) });
    expect((await runRead()).carry_on_part).toBe("ANSWER");
    expect(spies.mark).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    loading("SETTLED");
    spies = reads({ ticked: true, named: true, progress: progressOf(["b1", "b2", "b3"]) });
    vi.spyOn(PostgresPublicTreeRepository.prototype, "readTreeOfRun").mockResolvedValue(null);
    vi.spyOn(PostgresInvestigationReportRepository.prototype, "read").mockResolvedValue(null);
    const settled = await runRead();
    expect(settled.carry_on_part).toBe("DIGS");
    expect(settled.path_progress!.map((entry) => entry.path_id)).toEqual(["b1", "b2", "b3"]);

    vi.restoreAllMocks();
    loading("FAILED");
    spies = reads({ ticked: true, named: true, progress: progressOf(["b1", "b2", "b3"]) });
    expect(await runRead()).not.toHaveProperty("carry_on_part");
    expect(spies.mark).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    loading("SETTLED");
    spies = reads({ ticked: false, named: true, progress: progressOf(["b1", "b2", "b3"]) });
    expect(await runRead()).not.toHaveProperty("carry_on_part");
    expect(spies.mark).not.toHaveBeenCalled();
  });

  /** The owner's served answer of a ticked path debate (or an R22 one), read through the application. */
  function served(answer: Answer): void {
    vi.spyOn(ServeRepository.prototype, "readRunAnswerProjection").mockResolvedValue(answer);
    vi.spyOn(PostgresPathProgressRepository.prototype, "readCarryOnMark").mockResolvedValue("BEGUN");
  }
  const TICKED = (): Answer => AnswerSchema.parse({ ...buildFairShapedAnswer(), branches: branchesFixture(3, { carry_on_to_report: true }) });

  it("the answer of a ticked private debate: the digs, then the report while its newest version is written", async () => {
    served(TICKED());
    vi.spyOn(PostgresPublicTreeRepository.prototype, "readTreeOfRun").mockResolvedValue(null);
    const investigation = vi.spyOn(PostgresInvestigationReportRepository.prototype, "read").mockResolvedValue(null);
    const answer = await application().readRunAnswer(RUN, session, OWNER);
    expect(AnswerSchema.parse(answer).carry_on_part).toBe("DIGS");
    expect(investigation).toHaveBeenCalledWith(OWNER.ownerRef, TICKED().run_ref);
    investigation.mockResolvedValue({ investigation: { investigation_id: "i", root_run_id: RUN, state: "closed", opened_at: "", last_activity_at: "",
      closed_at: "", report_version: 1, members: [], closings: [{ report_version: 1, closed_at: "", reopened_at: null, report_ref: null,
        report_written_at: null }] }, waiting: 0, reports: [] });
    expect((await application().readRunAnswer(RUN, session, OWNER))!.carry_on_part).toBe("REPORT");
  });

  it("the answer of a ticked public debate: from its report versions, the person's own being written, then on the page", async () => {
    served(TICKED());
    vi.spyOn(PostgresPublicTreeRepository.prototype, "readTreeOfRun")
      .mockResolvedValue({ publication_ref: "66666666-6666-4666-8666-666666666666", dig_update_id: null });
    const counts = vi.spyOn(PostgresOwnClosingsReader.prototype, "countPublicReports").mockResolvedValue({ own: 1, all: 1 });
    const page = vi.spyOn(PostgresPublicPageRepository.prototype, "readReports").mockResolvedValue([]);
    const investigation = vi.spyOn(PostgresInvestigationReportRepository.prototype, "read");
    expect((await application().readRunAnswer(RUN, session, OWNER))!.carry_on_part).toBe("REPORT");
    expect(counts).toHaveBeenCalledWith(OWNER.ownerRef, "66666666-6666-4666-8666-666666666666");
    page.mockResolvedValue([{ report_version: 1, recorded_at: "", requested_at: "", writer: null, content: {} as never }]);
    expect(await application().readRunAnswer(RUN, session, OWNER)).not.toHaveProperty("carry_on_part");
    counts.mockResolvedValue({ own: 0, all: 1 });
    expect((await application().readRunAnswer(RUN, session, OWNER))!.carry_on_part).toBe("DIGS");
    expect(investigation).not.toHaveBeenCalled();
  });

  it("an R22 answer, an unticked one and a legacy asker's: returned as served, nothing more read", async () => {
    const mark = vi.spyOn(PostgresPathProgressRepository.prototype, "readCarryOnMark");
    for (const answer of [buildFairShapedAnswer(), AnswerSchema.parse({ ...buildFairShapedAnswer(), branches: branchesFixture(3) })]) {
      vi.spyOn(ServeRepository.prototype, "readRunAnswerProjection").mockResolvedValue(answer);
      expect(await application().readRunAnswer(RUN, session, OWNER)).toBe(answer);
    }
    vi.spyOn(ServeRepository.prototype, "readRunAnswerProjection").mockResolvedValue(TICKED());
    expect(await application().readRunAnswer(RUN, session, { ownerRef: null, legacyAskerId: "asker:a" })).not.toHaveProperty("carry_on_part");
    expect(mark).not.toHaveBeenCalled();
  });
});
