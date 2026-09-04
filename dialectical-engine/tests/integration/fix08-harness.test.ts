import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OBS_G1_CHILD_RECEIPT_PREFIX,
  OBS_G1_CHILD_OUTPUT_MAX_BYTES,
  runFamily,
  type ObsAcceptanceCase,
} from "../../acceptance/obs/index.js";
import {
  CORPUS_TOKENS,
  evaluateCorpusBytes,
  readRawSpoolSources,
} from "../../acceptance/obs/cases/corpus.js";
import {
  IDENTITY_CANARIES,
  evaluateIdentityCanaries,
} from "../../acceptance/obs/cases/identity-canary.js";
import { evaluateSchemaManifest } from "../../acceptance/obs/cases/schema-manifest.js";

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
          return context.passRows(receipt, [{
            pid: receipt.pid,
            sourceEventRef: receipt.sourceEventRef,
            occurrenceSequence: 17,
          }], { rows: 1 });
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

  it.each([
    {
      label: "pid",
      code: "ROW_RECEIPT_PID_MISMATCH",
      row: (pid: number, sourceEventRef: string) => ({
        pid: pid + 1,
        sourceEventRef,
        occurrenceSequence: 17,
      }),
    },
    {
      label: "source event ref",
      code: "ROW_RECEIPT_SOURCE_REF_MISMATCH",
      row: (pid: number) => ({
        pid,
        sourceEventRef: "00000000-0000-4000-8000-000000000000",
        occurrenceSequence: 17,
      }),
    },
    {
      label: "occ_seq",
      code: "ROW_RECEIPT_SEQUENCE_MISMATCH",
      row: (pid: number, sourceEventRef: string) => ({
        pid,
        sourceEventRef,
        occurrenceSequence: 18,
      }),
    },
  ])("rejects a read-back row whose $label does not match the child receipt", async ({ code, row }) => {
    const repoRoot = await temporaryDirectory("fix08-row-mismatch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "row-mismatch",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", receiptScript([17])],
            timeoutMs: 1_000,
          });
          return context.passRows(
            receipt,
            [row(receipt.pid, receipt.sourceEventRef)],
            { rows: 1 },
          );
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([`obs-g1/row-mismatch FAIL(code=${code})`]);
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

describe("FIX-08 C2 adversarial corpus", () => {
  it("fails when a planted token appears in raw row bytes or raw spool bytes", async () => {
    const spoolDirectory = await temporaryDirectory("fix08-corpus-spool-");
    await writeFile(
      join(spoolDirectory, "0001.spool"),
      Buffer.from(`prefix:${CORPUS_TOKENS.jwt}:suffix`, "utf8"),
    );
    const sources = [
      {
        source: "row:occurrence",
        bytes: Buffer.from(`prefix:${CORPUS_TOKENS.email}:suffix`, "utf8"),
      },
      ...await readRawSpoolSources(spoolDirectory),
    ];

    const result = evaluateCorpusBytes(sources);

    expect(result.passed).toBe(false);
    expect(result.hits).toEqual([
      { source: "row:occurrence", tokenClass: "email" },
      { source: "spool:0001.spool", tokenClass: "jwt" },
    ]);
  });

  it("passes only when every token is absent from every supplied byte source", () => {
    const result = evaluateCorpusBytes([
      { source: "row:occurrence", bytes: Buffer.from('{"code":"JOB_FAILURE"}', "utf8") },
      { source: "spool:empty.spool", bytes: Buffer.alloc(0) },
    ]);

    expect(result).toEqual({ passed: true, scannedBytes: 22, hits: [] });
  });
});

describe("FIX-08 C2 identity canaries", () => {
  it("fails when asker or session canaries reach correlation columns", () => {
    const result = evaluateIdentityCanaries([
      {
        run_ref: `run:${IDENTITY_CANARIES.asker}`,
        work_item_ref: "work:declared",
        ledger_ref: IDENTITY_CANARIES.session,
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.hits).toEqual([
      { rowIndex: 0, column: "run_ref", canary: "asker" },
      { rowIndex: 0, column: "ledger_ref", canary: "session" },
    ]);
  });

  it("passes declared correlation kinds that contain no identity canary", () => {
    expect(evaluateIdentityCanaries([{
      run_ref: "run:declared",
      work_item_ref: "work-item:declared",
      attempt_ref: "NOT_APPLICABLE",
    }])).toEqual({ passed: true, scannedCells: 3, hits: [] });
  });
});

describe("FIX-08 C2 schema manifest", () => {
  it("fails for free-text message names and user-linked names", () => {
    const result = evaluateSchemaManifest([
      { table_schema: "obs", table_name: "occurrence", column_name: "code", data_type: "text" },
      { table_schema: "obs", table_name: "occurrence", column_name: "error_message", data_type: "text" },
      { table_schema: "obs", table_name: "occurrence", column_name: "asker_id", data_type: "uuid" },
      { table_schema: "obs", table_name: "capture_gap", column_name: "session_ref", data_type: "text" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.hits).toEqual([
      { table: "occurrence", column: "error_message", reason: "FREE_TEXT_MESSAGE" },
      { table: "occurrence", column: "asker_id", reason: "USER_LINKED" },
      { table: "capture_gap", column: "session_ref", reason: "USER_LINKED" },
    ]);
  });

  it("passes the code-only shape", () => {
    expect(evaluateSchemaManifest([
      { table_schema: "obs", table_name: "occurrence", column_name: "code", data_type: "text" },
      { table_schema: "obs", table_name: "occurrence", column_name: "occ_seq", data_type: "bigint" },
    ])).toEqual({ passed: true, scannedColumns: 2, hits: [] });
  });
});

describe("FIX-08 C2 live CLI dependency gate", () => {
  it("prints three exact SKIP lines and no PASS when the FIX-01 runtime is absent", () => {
    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "acceptance/run-acceptance.ts",
      "--family",
      "obs-g1",
      "--only",
      "corpus,identity-canary,schema-manifest",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { PATH: process.env.PATH, LANG: process.env.LANG },
      timeout: 10_000,
    });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim().split("\n")).toEqual([
      "obs-g1/corpus SKIP(missing: packages/obs-capture/src/runtime/index.ts)",
      "obs-g1/identity-canary SKIP(missing: packages/obs-capture/src/runtime/index.ts)",
      "obs-g1/schema-manifest SKIP(missing: packages/obs-capture/src/runtime/index.ts)",
    ]);
    expect(child.stdout).not.toContain(" PASS");
  });

  it("exits one when the family CLI prints FAIL", () => {
    const child = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "acceptance/run-acceptance.ts",
      "--family",
      "obs-g1",
      "--only",
      "missing-case",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { PATH: process.env.PATH, LANG: process.env.LANG },
      timeout: 10_000,
    });

    expect(child.status).toBe(1);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim()).toBe("obs-g1/harness FAIL(code=UNKNOWN_CASE)");
  });
});
