// Plan 2026-10-31 decision 12: where Continue hands a debate of another release, and what the person's press answers. The database's
// half is tests/integration/run-handover-database.test.ts; the runner's rule is tests/unit/run-handover-replay.test.ts.
import { describe, expect, it } from "vitest";
import { RunProjectionSchema } from "@debateai/contract";
import { webReadTopCallSiteKey } from "@debateai/judgement";
import { continuePausedRun, runHandoverOf, type MonthPausePort } from "../../apps/api/src/month-pause.js";
import { runWebTopReaders } from "../../apps/runner/src/web-readers-top.js";

const OWN = "r7-bbbbbbbbbbbb";
const OLD = "r6-aaaaaaaaaaaa";
const handover = (now: Readonly<{ releaseKey: string; registerVersion: number }> | null, passed: boolean, ownReleaseKey = OWN,
  answer: "RECORDED" | "NOT_CURRENT" | "VERSION_NOT_PASSED" = "RECORDED") => {
  const moved: unknown[] = [];
  return { moved, port: runHandoverOf({ ownReleaseKey, readRunReleaseNow: async () => now, versionPassed: async () => passed, activeVersion: async () => 7,
    resumeInRelease: async (...args) => { moved.push(args); return answer; } }) };
};

describe("where the debate goes", () => {
  it("nowhere when it is already this release's, or this process has one release", async () => {
    expect(await handover({ releaseKey: OWN, registerVersion: 7 }, true).port.destinationOf("run")).toBeNull();
    expect(await handover({ releaseKey: OLD, registerVersion: 6 }, true, "legacy").port.destinationOf("run")).toBeNull();
    expect(await handover(null, true).port.destinationOf("run")).toBeNull();
  });
  it("on its own settings version when this release has passed it: the same words", async () => {
    expect(await handover({ releaseKey: OLD, registerVersion: 6 }, true).port.destinationOf("run")).toEqual({ releaseKey: OWN, registerVersion: 6 });
  });
  it("else on the version a new debate would start on", async () => {
    expect(await handover({ releaseKey: OLD, registerVersion: 6 }, false).port.destinationOf("run")).toEqual({ releaseKey: OWN, registerVersion: 7 });
  });
});

describe("the press", () => {
  const at = new Date("2026-11-02T00:00:00.000Z");
  const pauses = (resumed: string[]): MonthPausePort => ({
    readPause: async () => ({ state: "PAUSED", resumable_at: "2026-11-01T00:00:00.000Z" }),
    resume: async (_owner, runId) => { resumed.push(runId); return "RECORDED"; }
  });
  const room = { monthHasRoom: async () => true };
  const press = (port: ReturnType<typeof handover>["port"], resumed: string[]) => continuePausedRun({ ownerRef: "o", runId: "run", now: at }, pauses(resumed), room, undefined, undefined, port);

  it("hands over instead of resuming in place, and the run stays in one piece", async () => {
    const resumed: string[] = [];
    const { port, moved } = handover({ releaseKey: OLD, registerVersion: 6 }, true);
    expect(await press(port, resumed)).toEqual({ kind: "CONTINUING" });
    expect(moved).toEqual([["o", "run", OWN, 6]]);
    expect(resumed).toEqual([]);
  });
  it("a debate of this release is the plain resume", async () => {
    const resumed: string[] = [];
    const { port, moved } = handover({ releaseKey: OWN, registerVersion: 7 }, true);
    expect(await press(port, resumed)).toEqual({ kind: "CONTINUING" });
    expect(moved).toEqual([]);
    expect(resumed).toEqual(["run"]);
  });
  it.each(["NOT_CURRENT", "VERSION_NOT_PASSED"] as const)("%s during a switch asks the person to press again; nothing was resumed", async (answer) => {
    const resumed: string[] = [];
    const { port } = handover({ releaseKey: OLD, registerVersion: 6 }, true, OWN, answer);
    expect(await press(port, resumed)).toEqual({ kind: "TRY_AGAIN" });
    expect(resumed).toEqual([]);
  });
});

describe("the run read", () => {
  const run = { run_ref: "run", question_line: "Should the pier stay?", terminal_reason: null, hold_until: null };
  const page = { url: "https://s.example/a", site: "s.example", title: "A", note: null, quotes: [] };
  it("lists what was found only on a debate that stopped, and only web addresses", () => {
    expect(RunProjectionSchema.safeParse({ ...run, state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", found: [page] }).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...run, state: "RUNNING", found: [page] }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...run, state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", found: [{ ...page, url: "javascript:alert(1)" }] }).success).toBe(false);
  });
});

describe("readers 2 and 3 of one path are one step", () => {
  it("named to the replay book before either is asked", async () => {
    const order: string[] = [];
    await runWebTopReaders({
      pathIndex: 1, mode: "quick" as never, question: "Should the pier stay?", answer: "Yes.",
      pages: [{ pageId: "p1", title: "A", site: "s.example", date: null, text: "Some text.", textDigest: Buffer.alloc(32, 9) }] as never,
      readerOne: [], readerOneMaker: "anthropic",
      candidates: [{ maker: "deepseek", providerRef: "ref:deepseek" }, { maker: "zhipu", providerRef: "ref:glm" }, { maker: "qwen", providerRef: "ref:qwen" }],
      verbatim: () => true,
      openReplayStep: (members) => {
        expect(order).toEqual([]);
        order.push("OPENED");
        expect(members.map((member) => member.callSiteKey)).toEqual([webReadTopCallSiteKey(1, 2), webReadTopCallSiteKey(1, 3)]);
      },
      call: async () => { order.push("ASKED"); return { kind: "UNAVAILABLE" }; }
    });
    expect(order).toEqual(["OPENED", "ASKED", "ASKED"]);
  });
});
