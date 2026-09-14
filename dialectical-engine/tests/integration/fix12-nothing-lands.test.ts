import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { createDiagnosisDispatcher } from "../../tools/obs-listener/src/worker-diagnosis/dispatch.js";
import { buildPacket } from "../../tools/obs-listener/src/worker-diagnosis/packet.js";

describe("FIX-12 report-only boundary", () => {
  it("does not change tracked files or create a fixagent branch during proposal dispatch", async () => {
    const beforeStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" });
    const beforeBranches = execFileSync("git", ["branch", "--list", "fixagent/*"], { encoding: "utf8" });
    const packet = buildPacket({
      incidentId: "10000000-0000-4000-8000-000000000012",
      occurrenceId: "20000000-0000-4000-8000-000000000012",
      source: "first_party", verdict: "CODE_ROOT", floor: "FLOOR_CLEAR", sizeLabel: "QUICK",
      codes: ["OBS_SCHEDULER_JOB_FAILED"],
    }, {
      root: { path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
      frames: [{ kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" }],
      chainCodes: ["OBS_SCHEDULER_JOB_FAILED"],
    });
    const actions: unknown[] = [];
    const dispatcher = createDiagnosisDispatcher({
      custodianToken: "custodian-token",
      bundle: {
        productionSourceGlobs: ["apps/*/src/**"], floorDenyGlobs: [],
        allowedToolCalls: ["read_file"], invariantRefs: ["RT-30"], moduleGraph: {},
      },
      store: {
        callsToday: async () => 0,
        appendAction: async (action) => { actions.push(action); },
        recordUsage: async () => undefined,
      },
      notifier: { notify: async () => undefined },
      model: { run: async () => ({
        output: {
          incidentId: packet.incidentId, root: packet.root,
          diagnosis: { defectClass: "WRONG_BRANCH", params: { code: packet.codes[0] } },
          changeScope: ["apps/scheduler/src/index.ts"], sizeLabel: "QUICK",
          redTestPlan: { invariantRef: "RT-30" }, spendUnits: 1, toolCalls: ["read_file"],
        },
        usage: { totalUnits: 1 },
      }) },
    });
    dispatcher.arm("custodian-token");
    expect(await dispatcher.dispatch(packet)).toMatchObject({ kind: "PROPOSED" });
    expect(actions).toHaveLength(1);

    expect(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" })).toBe(beforeStatus);
    expect(execFileSync("git", ["branch", "--list", "fixagent/*"], { encoding: "utf8" })).toBe(beforeBranches);
  });
});
