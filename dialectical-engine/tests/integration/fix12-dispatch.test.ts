import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDiagnosisDispatcher,
  DIAGNOSIS_REGISTER_SEEDS,
  type DiagnosisAction,
  type DiagnosisActionStore,
} from "../../tools/obs-listener/src/worker-diagnosis/dispatch.js";
import {
  CodexCliDiagnosisPort,
  type DiagnosisModelPort,
} from "../../tools/obs-listener/src/worker-diagnosis/spawn.js";
import { buildPacket } from "../../tools/obs-listener/src/worker-diagnosis/packet.js";
import { notifyProposal } from "../../tools/obs-listener/src/notify/index.js";

const packet = buildPacket({
  incidentId: "10000000-0000-4000-8000-000000000012",
  occurrenceId: "20000000-0000-4000-8000-000000000012",
  source: "first_party",
  verdict: "CODE_ROOT",
  floor: "FLOOR_CLEAR",
  sizeLabel: "QUICK",
  codes: ["OBS_SCHEDULER_JOB_FAILED"],
}, {
  root: { path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
  frames: [{ kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" }],
  chainCodes: ["OBS_SCHEDULER_JOB_FAILED", "PROVIDER_UNREACHABLE"],
});

const bundle = Object.freeze({
  productionSourceGlobs: Object.freeze(["apps/*/src/**", "packages/**/src/**"]),
  floorDenyGlobs: Object.freeze(["packages/crypto/**"]),
  allowedToolCalls: Object.freeze(["read_file", "search_repo"]),
  invariantRefs: Object.freeze(["RT-30"]),
  moduleGraph: Object.freeze({ "apps/scheduler/src/index.ts": Object.freeze([]) }),
});

const modelOutput = Object.freeze({
  incidentId: packet.incidentId,
  root: packet.root,
  diagnosis: Object.freeze({ defectClass: "BOUNDARY_CONTRACT", params: { code: packet.codes[0] } }),
  changeScope: Object.freeze(["apps/scheduler/src/index.ts"]),
  sizeLabel: "QUICK",
  redTestPlan: Object.freeze({ invariantRef: "RT-30" }),
  spendUnits: 7,
  toolCalls: Object.freeze(["read_file"]),
});

function memoryStore(callsToday = 0): DiagnosisActionStore & { actions: DiagnosisAction[]; usages: number[] } {
  const actions: DiagnosisAction[] = [];
  const usages: number[] = [];
  return {
    actions,
    usages,
    callsToday: async () => callsToday + usages.length,
    appendAction: async (action) => { actions.push(action); },
    recordUsage: async (units) => { usages.push(units); },
  };
}

const noNotification = Object.freeze({ notify: async () => undefined });

describe("FIX-12 report-only dispatch", () => {
  it("starts OFF after every construction and only the custodian can arm the sole phase-1 state", () => {
    const first = createDiagnosisDispatcher({ custodianToken: "custodian-token", bundle, store: memoryStore(), notifier: noNotification, model: {
      run: async () => ({ output: modelOutput, usage: { totalUnits: 7 } }),
    } });
    expect(first.state()).toBe("OFF");
    expect(first.arm("wrong-token")).toEqual({ ok: false, code: "REFUSED" });
    expect(first.state()).toBe("OFF");
    expect(first.arm("custodian-token")).toEqual({ ok: true, state: "REPORT_ONLY_PROPOSAL" });
    expect(first.state()).toBe("REPORT_ONLY_PROPOSAL");

    const restarted = createDiagnosisDispatcher({ custodianToken: "custodian-token", bundle, store: memoryStore(), notifier: noNotification, model: {
      run: async () => ({ output: modelOutput, usage: { totalUnits: 7 } }),
    } });
    expect(restarted.state()).toBe("OFF");
    expect(DIAGNOSIS_REGISTER_SEEDS).toEqual({ callsPerDay: 20, wallClockPerDiagnosisMs: 600_000, maxConcurrentDiagnoses: 1 });
  });

  it("uses one fresh scrubbed codex exec process with closed stdin and a scratch cwd", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "fix12-codex-stub-"));
    const script = join(fixture, "stub.mjs");
    const record = join(fixture, "record.json");
    await writeFile(script, `
      import fs from "node:fs";
      const [record] = process.argv.slice(2);
      let stdinBytes = 0;
      process.stdin.on("data", chunk => { stdinBytes += chunk.length; });
      process.stdin.on("end", () => {
        fs.writeFileSync(record, JSON.stringify({ argv: process.argv.slice(3), cwd: process.cwd(), env: Object.keys(process.env).sort(), stdinBytes }));
        process.stdout.write(JSON.stringify({ proposal: ${JSON.stringify(modelOutput)}, usage: { totalUnits: 7 } }));
      });
    `);
    const port = new CodexCliDiagnosisPort({
      command: { binary: process.execPath, prefixArguments: [script, record] },
      deadlineMs: 2_000,
      environment: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", API_KEY: "must-not-cross" },
    });
    const result = await port.run(packet);
    const observed = JSON.parse(await readFile(record, "utf8")) as {
      argv: string[]; cwd: string; env: string[]; stdinBytes: number;
    };

    expect(result).toEqual({ output: modelOutput, usage: { totalUnits: 7 } });
    expect(observed.argv[0]).toBe("exec");
    expect(observed.argv).not.toContain("resume");
    expect(observed.argv).toContain("read-only");
    expect(observed.stdinBytes).toBe(0);
    expect(observed.cwd).toMatch(/fix12-diagnosis-/);
    expect(observed.env).not.toContain("API_KEY");
    // macOS injects __CF_USER_TEXT_ENCODING into a child independently of the
    // env object supplied to spawn; no caller credential key crosses the seam.
    expect(observed.env.every((key) => ["HOME", "LANG", "OLDPWD", "PATH", "PWD", "__CF_USER_TEXT_ENCODING"].includes(key))).toBe(true);
  });

  it("makes one call for an eligible incident, no idle or ineligible calls, and stores a hashed proposal", async () => {
    let calls = 0;
    const store = memoryStore();
    const model: DiagnosisModelPort = { run: async () => { calls += 1; return { output: modelOutput, usage: { totalUnits: 7 } }; } };
    const dispatcher = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store, model, notifier: noNotification,
      proposalIdFactory: () => "proposal-1",
    });
    expect(await dispatcher.dispatch(packet)).toEqual({ kind: "OFF" });
    expect(calls).toBe(0);
    dispatcher.arm("custodian-token");

    expect(await dispatcher.dispatch({ ...packet, source: "ui_client" } as never)).toEqual({ kind: "INELIGIBLE" });
    expect(await dispatcher.dispatch({ ...packet, verdict: "EXTERNAL_ROOT" } as never)).toEqual({ kind: "INELIGIBLE" });
    expect(await dispatcher.dispatch({ ...packet, floor: "FLOOR_DENY" } as never)).toEqual({ kind: "INELIGIBLE" });
    expect(calls).toBe(0);

    const proposal = await dispatcher.dispatch(packet);
    expect(proposal).toMatchObject({ kind: "PROPOSED", proposalId: "proposal-1", hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(await dispatcher.dispatch(packet)).toEqual({ kind: "ALREADY_DISPATCHED" });
    expect(calls).toBe(1);
    expect(store.usages).toEqual([7]);
    expect(store.actions).toMatchObject([{ kind: "PROPOSAL", actionRef: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
  });

  it("enforces the daily/concurrency caps and suspends dispatch when usage telemetry is missing", async () => {
    const atCap = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store: memoryStore(20), notifier: noNotification,
      model: { run: async () => ({ output: modelOutput, usage: { totalUnits: 7 } }) },
    });
    atCap.arm("custodian-token");
    expect(await atCap.dispatch(packet)).toEqual({ kind: "CAP_REFUSED", cap: "callsPerDay" });

    let release!: () => void;
    const firstCall = new Promise<void>((resolve) => { release = resolve; });
    const concurrentStore = memoryStore();
    const concurrent = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store: concurrentStore, notifier: noNotification,
      model: { run: async () => { await firstCall; return { output: modelOutput, usage: { totalUnits: 7 } }; } },
    });
    concurrent.arm("custodian-token");
    const pending = concurrent.dispatch(packet);
    expect(await concurrent.dispatch({ ...packet, incidentId: "30000000-0000-4000-8000-000000000012" })).toEqual({
      kind: "CAP_REFUSED", cap: "maxConcurrentDiagnoses",
    });
    release();
    await pending;

    const missingStore = memoryStore();
    const missing = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store: missingStore, notifier: noNotification,
      model: { run: async () => ({ output: modelOutput, usage: null }) },
    });
    missing.arm("custodian-token");
    expect(await missing.dispatch(packet)).toEqual({ kind: "TELEMETRY_MISSING" });
    expect(missing.state()).toBe("OFF");
    expect(missingStore.actions).toMatchObject([{ kind: "TELEMETRY_MISSING" }]);
  });

  it("deadline-kills a non-returning test double", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "fix12-timeout-stub-"));
    const script = join(fixture, "stub.mjs");
    await writeFile(script, "setInterval(() => undefined, 1000)");
    const port = new CodexCliDiagnosisPort({
      command: { binary: process.execPath, prefixArguments: [script] },
      deadlineMs: 50,
      environment: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    await expect(port.run(packet)).rejects.toThrow("DIAGNOSIS_TIMEOUT");
  });

  it("notifies both local channels for every proposal and records notification failure without blocking", async () => {
    const commands: { binary: string; args: readonly string[]; stdin?: string }[] = [];
    const occurrenceCodes: string[] = [];
    const notifier = notifyProposal({
      osascript: { run: async (command) => { commands.push(command); throw new Error("test double failure"); } },
      ticket: { run: async (command) => { commands.push(command); } },
      occurrence: { record: async (value) => { occurrenceCodes.push(value.code); } },
    });
    const store = memoryStore();
    const dispatcher = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store, notifier,
      proposalIdFactory: () => "proposal-12",
      ticketIdForIncident: async () => "ticket-12",
      model: { run: async () => ({ output: modelOutput, usage: { totalUnits: 7 } }) },
    });
    dispatcher.arm("custodian-token");
    expect(await dispatcher.dispatch(packet)).toMatchObject({ kind: "PROPOSED", proposalId: "proposal-12" });
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ binary: "osascript", args: expect.arrayContaining([expect.stringContaining("incident 10000000-0000-4000-8000-000000000012 proposal proposal-12")]) });
    expect(commands[1]).toMatchObject({ binary: "hermes", args: expect.arrayContaining(["comment", "ticket-12", expect.stringMatching(/^PROPOSAL proposal-12/)]) });
    expect(occurrenceCodes).toEqual(["FIXAGENT_NOTIFICATION_FAILED"]);
    expect(store.actions).toHaveLength(1);
  });

  it("keeps the stored proposal when the injected notifier itself throws", async () => {
    const store = memoryStore();
    const dispatcher = createDiagnosisDispatcher({
      custodianToken: "custodian-token", bundle, store,
      proposalIdFactory: () => "proposal-12",
      notifier: { notify: async () => { throw new TypeError("NOTIFIER_TEST_FAILURE"); } },
      model: { run: async () => ({ output: modelOutput, usage: { totalUnits: 7 } }) },
    });
    dispatcher.arm("custodian-token");
    await expect(dispatcher.dispatch(packet)).resolves.toMatchObject({
      kind: "PROPOSED", proposalId: "proposal-12",
    });
    expect(store.actions).toMatchObject([{ kind: "PROPOSAL", proposalId: "proposal-12" }]);
  });
});
