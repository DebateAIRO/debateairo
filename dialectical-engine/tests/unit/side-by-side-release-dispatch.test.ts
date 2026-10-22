import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReleaseNotServedError,
  ReleaseRoutedDispatcher,
  createReleaseNotServedAlert,
  releaseServes,
  type RunReleaseLookup
} from "@debateai/api";
import { LEGACY_RELEASE_KEY, TypedDomainError } from "@debateai/kernel";
import type { ReleaseState } from "../../apps/api/src/release-state.js";

/**
 * Side-by-side spec §2, §3, §4 (plan C task C4): every send is routed by the run's own release. A run whose release
 * still serves it goes to `releaseTaskName(base, run.release_key)`; one whose release no longer does is never sent —
 * its never-claimed first job is closed FAILED (RUN_SETUP_FAILED:RELEASE_NOT_SERVED), its waiver written, one typed
 * journal line printed at most once per release key per 30 minutes, and the send refused with RELEASE_NOT_SERVED.
 */
const BASE = "dialectical-run";
const KEY = ["r17", "0123456789ab"].join("-");
const OTHER_KEY = ["r18", "0123456789ab"].join("-");
const TASK = "dialectical-run-r17-0123456789ab";
const REASON = "RUN_SETUP_FAILED:RELEASE_NOT_SERVED";

// still_draining (final review A4): a DRAINING event with no later RETIRED one, so every DRAINING state reads true
// and a draining release staged again for a rollback reads STAGED and true.
const state = (s: ReleaseState["state"], retireRequested = false, stillDraining = s === "DRAINING"): ReleaseState =>
  Object.freeze({ state: s, frontPairStopped: retireRequested, retireRequested, stillDraining });

type Found = Readonly<{ releaseKey: string; state: ReleaseState | null; anyCurrent: boolean }> | null;

function arrange(input: Readonly<{
  found: Found | ((runId: string) => Found);
  hosted?: boolean;
  closes?: boolean;
  clock?: () => number;
  waiveFails?: Error;
}>) {
  const sent: unknown[][] = [];
  const closedJobs: unknown[] = [];
  const waived: string[] = [];
  const alerts: string[] = [];
  const lookup: RunReleaseLookup = {
    lookup: vi.fn(async (runId: string) => typeof input.found === "function" ? input.found(runId) : input.found)
  };
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dispatcher = new ReleaseRoutedDispatcher({
    client: { runNoWait: vi.fn(async (...args: unknown[]) => { sent.push(args); return undefined as never; }) },
    workflowName: BASE,
    hosted: input.hosted ?? true,
    lookup,
    work: { recordSetupFailure: vi.fn(async (record) => { closedJobs.push(record); return input.closes ?? true; }) },
    waive: async (runId) => { if (input.waiveFails !== undefined) throw input.waiveFails; waived.push(runId); },
    alert: createReleaseNotServedAlert({ ...(input.clock === undefined ? {} : { clock: input.clock }), write: (line) => alerts.push(line) })
  });
  const lines = () => error.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  return { dispatcher, sent, closedJobs, waived, alerts, lines, lookup };
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the send succeeded");
}

const job = () => Object.freeze({ runId: randomUUID(), workItemId: randomUUID() });

afterEach(() => { vi.restoreAllMocks(); });

describe("releaseServes (side-by-side spec §4)", () => {
  it("serves CURRENT, DRAINING before the retire request, and every run when nothing is current and the site is local", () => {
    const cases: ReadonlyArray<readonly [ReleaseState | null, boolean, boolean, boolean]> = [
      [state("CURRENT"), true, true, true],
      [state("DRAINING"), true, true, true],
      [state("DRAINING", true), true, true, false],
      [state("RETIRED"), true, true, false],
      [state("STAGED"), true, true, false],
      // Final review A4: a draining release staged again for a rollback still serves its drained debates.
      [state("STAGED", false, true), true, true, true],
      [state("STAGED", true, true), true, true, false],
      [null, true, false, false],
      [null, false, false, true],
      [null, false, true, false],
      [state("RETIRED"), false, false, true]
    ];
    for (const [s, anyCurrent, hosted, serves] of cases) {
      expect(releaseServes({ state: s, anyCurrent, hosted }), JSON.stringify({ s, anyCurrent, hosted })).toBe(serves);
    }
  });
});

describe("ReleaseRoutedDispatcher sends to the run's own release (side-by-side spec §2)", () => {
  it("sends a CURRENT release's run once, to its own task name, with today's metadata", async () => {
    const { dispatcher, sent, closedJobs, waived, alerts } = arrange({ found: { releaseKey: KEY, state: state("CURRENT"), anyCurrent: true } });
    const one = job();
    await expect(dispatcher.dispatch(one)).resolves.toBeUndefined();
    expect(sent).toEqual([[TASK, { runId: one.runId, workItemId: one.workItemId }, {
      additionalMetadata: { v3RunId: one.runId, v3WorkItemId: one.workItemId, sourceOfRecord: "core.work_item" }
    }]]);
    expect(closedJobs).toEqual([]);
    expect(waived).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("sends a DRAINING release's run to its own name until the retire request", async () => {
    const { dispatcher, sent } = arrange({ found: { releaseKey: KEY, state: state("DRAINING"), anyCurrent: true } });
    await dispatcher.dispatch(job());
    expect(sent.map(([name]) => name)).toEqual([TASK]);
  });

  it("sends a run of a draining release staged again for a rollback (STAGED, still draining)", async () => {
    const { dispatcher, sent, closedJobs, alerts } = arrange({
      found: { releaseKey: KEY, state: state("STAGED", false, true), anyCurrent: true }
    });
    await dispatcher.dispatch(job());
    expect(sent.map(([name]) => name)).toEqual([TASK]);
    expect(closedJobs).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("with no current row anywhere, a local site sends to the run's own name; a legacy run to the bare base name", async () => {
    const own = arrange({ found: { releaseKey: KEY, state: null, anyCurrent: false }, hosted: false });
    await own.dispatcher.dispatch(job());
    expect(own.sent.map(([name]) => name)).toEqual([TASK]);
    const legacy = arrange({ found: { releaseKey: LEGACY_RELEASE_KEY, state: null, anyCurrent: false }, hosted: false });
    await legacy.dispatcher.dispatch(job());
    expect(legacy.sent.map(([name]) => name)).toEqual([BASE]);
  });

  it("refuses a blank base name", () => {
    expect(() => new ReleaseRoutedDispatcher({
      client: { runNoWait: vi.fn() }, workflowName: " ", hosted: false,
      lookup: { lookup: async () => null }, work: { recordSetupFailure: async () => true },
      waive: async () => undefined, alert: createReleaseNotServedAlert({ write: () => undefined })
    })).toThrow(TypeError);
  });
});

describe("ReleaseRoutedDispatcher never sends to a release that no longer serves the run (side-by-side spec §4)", () => {
  const refused: ReadonlyArray<readonly [string, Found, boolean]> = [
    ["DRAINING with the retire request", { releaseKey: KEY, state: state("DRAINING", true), anyCurrent: true }, true],
    ["RETIRED", { releaseKey: KEY, state: state("RETIRED"), anyCurrent: true }, true],
    ["STAGED and never drained", { releaseKey: KEY, state: state("STAGED"), anyCurrent: true }, true],
    ["never recorded while another release is current", { releaseKey: KEY, state: null, anyCurrent: true }, true],
    ["no current row anywhere on a hosted site", { releaseKey: KEY, state: null, anyCurrent: false }, true]
  ];
  for (const [name, found, hosted] of refused) {
    it(`${name}: closes the never-claimed first job, writes the waiver, refuses RELEASE_NOT_SERVED`, async () => {
      const { dispatcher, sent, closedJobs, waived, alerts, lines } = arrange({ found, hosted });
      const one = job();
      const error = await refusal(dispatcher.dispatch(one));
      expect(error).toBeInstanceOf(ReleaseNotServedError);
      expect(error).toBeInstanceOf(TypedDomainError);
      expect(error).toMatchObject({ code: "RELEASE_NOT_SERVED", runId: one.runId, releaseKey: KEY, closed: true });
      expect(sent).toEqual([]);
      expect(closedJobs).toEqual([{ runId: one.runId, batteryRowId: "Q1", commandKey: `S00:${one.runId}:Q1`, reason: REASON }]);
      expect(waived).toEqual([one.runId]);
      expect(lines()).toEqual([{
        event: "api.dispatch.release_not_served", runId: one.runId, releaseKey: KEY, state: found?.state?.state ?? null, closed: true
      }]);
      expect(alerts).toEqual([`DEBATEAI_RELEASE_NOT_SERVED ${JSON.stringify({ releaseKey: KEY, state: found?.state?.state ?? null })}`]);
    });
  }

  it("a waiver write that fails after the close prints one content-free line, still alerts, still refuses typed (C4 ruling)", async () => {
    const failure = Object.assign(new Error("permission denied for table model_spend_waiver"), { code: "42501" });
    const { dispatcher, sent, closedJobs, alerts, lines } = arrange({
      found: { releaseKey: KEY, state: state("RETIRED"), anyCurrent: true }, waiveFails: failure
    });
    const one = job();
    const error = await refusal(dispatcher.dispatch(one));
    expect(error).toBeInstanceOf(ReleaseNotServedError);
    expect(error).toMatchObject({ code: "RELEASE_NOT_SERVED", runId: one.runId, releaseKey: KEY, closed: true });
    expect(sent).toEqual([]);
    expect(closedJobs).toHaveLength(1);
    expect(lines()).toEqual([
      { event: "api.dispatch.release_not_served_waiver_failed", runId: one.runId, releaseKey: KEY, sqlstate: "42501" },
      { event: "api.dispatch.release_not_served", runId: one.runId, releaseKey: KEY, state: "RETIRED", closed: true }
    ]);
    expect(JSON.stringify(lines())).not.toContain("permission denied");
    expect(alerts).toEqual([`DEBATEAI_RELEASE_NOT_SERVED {"releaseKey":"${KEY}","state":"RETIRED"}`]);
  });

  it("a waiver failure with no SQL state prints sqlstate null", async () => {
    const { dispatcher, lines } = arrange({
      found: { releaseKey: KEY, state: state("RETIRED"), anyCurrent: true }, waiveFails: new TypeError("socket closed")
    });
    const error = await refusal(dispatcher.dispatch(job()));
    expect(error).toBeInstanceOf(ReleaseNotServedError);
    expect(lines()[0]).toMatchObject({ event: "api.dispatch.release_not_served_waiver_failed", sqlstate: null });
  });

  it("writes no waiver when the job was claimed meanwhile (nothing closed)", async () => {
    const { dispatcher, sent, waived, lines } = arrange({ found: { releaseKey: KEY, state: state("RETIRED"), anyCurrent: true }, closes: false });
    const error = await refusal(dispatcher.dispatch(job()));
    expect(error).toBeInstanceOf(ReleaseNotServedError);
    expect(error).toMatchObject({ code: "RELEASE_NOT_SERVED", closed: false });
    expect(sent).toEqual([]);
    expect(waived).toEqual([]);
    expect(lines()).toEqual([expect.objectContaining({ event: "api.dispatch.release_not_served", closed: false })]);
  });

  it("refuses a run that does not exist with RUN_NOT_FOUND, and sends, closes and waives nothing", async () => {
    const { dispatcher, sent, closedJobs, waived, alerts } = arrange({ found: null });
    const error = await refusal(dispatcher.dispatch(job()));
    expect(error).toBeInstanceOf(TypedDomainError);
    expect(error).not.toBeInstanceOf(ReleaseNotServedError);
    expect(error).toMatchObject({ code: "RUN_NOT_FOUND" });
    expect(sent).toEqual([]);
    expect(closedJobs).toEqual([]);
    expect(waived).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("alerts at most once per release key per 30 minutes; another key alerts at once", async () => {
    let now = Date.parse("2026-10-22T10:00:00.000Z");
    const minutes = (n: number) => n * 60_000;
    const start = now;
    const { dispatcher, alerts } = arrange({
      found: (runId) => ({ releaseKey: runId.startsWith("0") ? OTHER_KEY : KEY, state: state("RETIRED"), anyCurrent: true }),
      clock: () => now
    });
    const ofKey = (key: string) => ({ runId: `${key === OTHER_KEY ? "0" : "1"}${randomUUID().slice(1)}`, workItemId: randomUUID() });
    await refusal(dispatcher.dispatch(ofKey(KEY)));
    now = start + minutes(29);
    await refusal(dispatcher.dispatch(ofKey(KEY)));
    expect(alerts).toEqual([`DEBATEAI_RELEASE_NOT_SERVED {"releaseKey":"${KEY}","state":"RETIRED"}`]);
    await refusal(dispatcher.dispatch(ofKey(OTHER_KEY)));
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toBe(`DEBATEAI_RELEASE_NOT_SERVED {"releaseKey":"${OTHER_KEY}","state":"RETIRED"}`);
    now = start + minutes(30);
    await refusal(dispatcher.dispatch(ofKey(KEY)));
    expect(alerts).toHaveLength(3);
    expect(alerts[2]).toBe(alerts[0]);
  });

  it("the default alert prints its line on stderr", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    createReleaseNotServedAlert().note(KEY, null);
    expect(write).toHaveBeenCalledWith(`DEBATEAI_RELEASE_NOT_SERVED {"releaseKey":"${KEY}","state":null}\n`);
  });
});
