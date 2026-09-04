import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OBS_G1_CHILD_RECEIPT_PREFIX,
  OBS_G1_CHILD_OUTPUT_MAX_BYTES,
  runFamily,
  type ObsAcceptanceCase,
} from "../../acceptance/obs/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function presentSubject(repoRoot: string): Promise<string> {
  const path = "present.subject";
  await writeFile(join(repoRoot, path), "present", "utf8");
  return path;
}

function receiptScript(occurrenceSequences: readonly number[]): string {
  return [
    "const receipt = {",
    "  pid: process.pid,",
    "  source_event_ref: process.env.OBS_G1_SOURCE_EVENT_REF,",
    `  occ_seq: ${JSON.stringify(occurrenceSequences)},`,
    "};",
    `process.stdout.write(${JSON.stringify(OBS_G1_CHILD_RECEIPT_PREFIX)} + JSON.stringify(receipt) + '\\n');`,
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("FIX-08 C1 obs-g1 family runner", () => {
  it("prints the exact missing path, exits zero, and never runs the case", async () => {
    const repoRoot = await temporaryDirectory("fix08-missing-");
    const lines: string[] = [];
    let ran = false;
    const acceptanceCase: ObsAcceptanceCase = {
      name: "missing-subject",
      subjectPaths: ["packages/obs-capture/src/runtime/index.ts"],
      async run(context) {
        ran = true;
        return context.fail("CASE_RAN_WITHOUT_SUBJECT");
      },
    };

    const result = await runFamily("obs-g1", {
      cases: [acceptanceCase],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(ran).toBe(false);
    expect(lines).toEqual([
      "obs-g1/missing-subject SKIP(missing: packages/obs-capture/src/runtime/index.ts)",
    ]);
  });

  it("prints one FAIL line and exits one", async () => {
    const repoRoot = await temporaryDirectory("fix08-fail-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "measured-failure",
        subjectPaths: [subject],
        async run(context) {
          return context.fail("COUNT_MISMATCH", { observed: 2, expected: 1 });
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/measured-failure FAIL(code=COUNT_MISMATCH expected=1 observed=2)",
    ]);
  });

  it("rejects a plain PASS-shaped object as fabricated", async () => {
    const repoRoot = await temporaryDirectory("fix08-fake-pass-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "fake-pass",
        subjectPaths: [subject],
        async run() {
          return { kind: "PASS", metrics: { rows: 1 } } as never;
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/fake-pass FAIL(code=FABRICATED_VERDICT)",
    ]);
  });

  it("accepts PASS only from a real child receipt with pid and occ_seq", async () => {
    const repoRoot = await temporaryDirectory("fix08-real-pass-");
    const scratchRoot = await temporaryDirectory("fix08-real-pass-scratch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "real-pass",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", receiptScript([17])],
            timeoutMs: 1_000,
          });
          return context.passRows(receipt, { rows: 1 });
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["obs-g1/real-pass PASS(rows=1)"]);
    expect(await readdir(scratchRoot)).toEqual([]);
  });

  it("permits a real spawned process to prove a process-only check", async () => {
    const repoRoot = await temporaryDirectory("fix08-process-pass-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "process-pass",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", receiptScript([])],
            timeoutMs: 1_000,
          });
          return context.passProcess(receipt, { queries: 1 });
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["obs-g1/process-pass PASS(queries=1)"]);
  });

  it("times out a child, prints no child error text, and removes its scratch directory", async () => {
    const repoRoot = await temporaryDirectory("fix08-timeout-");
    const scratchRoot = await temporaryDirectory("fix08-timeout-scratch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "timeout",
        subjectPaths: [subject],
        async run(context) {
          await context.spawn({
            command: process.execPath,
            arguments: ["-e", "process.stderr.write('secret\\n'); setInterval(() => {}, 1000)"],
            timeoutMs: 25,
          });
          return context.fail("TIMEOUT_NOT_ENFORCED");
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/timeout FAIL(code=CHILD_TIMEOUT)"]);
    expect(lines.join("\n")).not.toContain("secret");
    expect(await readdir(scratchRoot)).toEqual([]);
  });

  it("turns a child spawn error into one stable FAIL line", async () => {
    const repoRoot = await temporaryDirectory("fix08-spawn-error-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "spawn-error",
        subjectPaths: [subject],
        async run(context) {
          await context.spawn({
            command: join(repoRoot, "missing-command"),
            timeoutMs: 1_000,
          });
          return context.fail("SPAWN_ERROR_NOT_CAUGHT");
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/spawn-error FAIL(code=CHILD_SPAWN_FAILED)"]);
  });

  it("stops a child at the combined output limit", async () => {
    const repoRoot = await temporaryDirectory("fix08-output-limit-");
    const scratchRoot = await temporaryDirectory("fix08-output-limit-scratch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "output-limit",
        subjectPaths: [subject],
        async run(context) {
          await context.spawn({
            command: process.execPath,
            arguments: ["-e", `process.stdout.write('x'.repeat(${OBS_G1_CHILD_OUTPUT_MAX_BYTES + 1}))`],
            timeoutMs: 1_000,
          });
          return context.fail("OUTPUT_LIMIT_NOT_ENFORCED");
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/output-limit FAIL(code=CHILD_OUTPUT_LIMIT)"]);
    expect(await readdir(scratchRoot)).toEqual([]);
  });

  it("rejects zone subject paths before case execution", async () => {
    const repoRoot = await temporaryDirectory("fix08-zone-");
    const lines: string[] = [];
    let ran = false;

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "zone-subject",
        subjectPaths: ["packages/obs-capture/src/zone/manifest.ts"],
        async run(context) {
          ran = true;
          return context.fail("ZONE_CASE_RAN");
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(ran).toBe(false);
    expect(lines).toEqual([
      "obs-g1/zone-subject FAIL(code=FORBIDDEN_SUBJECT_PATH)",
    ]);
  });

  it("removes its scratch directory before a successful spawn settles", async () => {
    const repoRoot = await temporaryDirectory("fix08-cleanup-");
    const scratchRoot = await temporaryDirectory("fix08-cleanup-scratch-");
    const subject = await presentSubject(repoRoot);
    let scratchDirectory = "";

    await runFamily("obs-g1", {
      cases: [{
        name: "cleanup",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", receiptScript([])],
            timeoutMs: 1_000,
          });
          scratchDirectory = receipt.scratchDirectory;
          return context.passProcess(receipt, { children: 1 });
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: () => undefined,
    });

    await expect(access(scratchDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
