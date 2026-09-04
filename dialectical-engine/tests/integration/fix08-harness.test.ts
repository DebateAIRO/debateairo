import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readbackMock = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock("../../acceptance/obs/readback.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../acceptance/obs/readback.js")>();
  return {
    ...actual,
    openObsReadbackFromEnvironment: readbackMock.open,
  };
});

import {
  OBS_G1_CHILD_OUTPUT_MAX_BYTES,
  runFamily,
  type ObsAcceptanceCase,
  type ObsVerdict,
  type SpawnReceipt,
} from "../../acceptance/obs/index.js";
import {
  ObsReadbackFailure,
  type ObsOccurrenceReadbackQuery,
  type ObsOccurrenceReadbackRow,
  type ObsReadback,
} from "../../acceptance/obs/readback.js";
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

function forgedReceiptScript(occurrenceSequences: readonly number[]): string {
  return [
    "const receipt = {",
    "  pid: process.pid,",
    "  run_ref: process.env.OBS_G1_DECLARED_RUN_REF,",
    `  occ_seq: ${JSON.stringify(occurrenceSequences)},`,
    "};",
    "process.stdout.write('OBS_G1_CHILD_RECEIPT ' + JSON.stringify(receipt) + '\\n');",
  ].join("\n");
}

function row(
  query: ObsOccurrenceReadbackQuery,
  occurrenceSequence = 17n,
): ObsOccurrenceReadbackRow {
  return Object.freeze({
    occurrenceSequence,
    runRef: query.runRef,
    runtime: query.runtime,
    capturePoint: query.capturePoint,
  });
}

function installReadback(options: {
  readonly baseline?: bigint;
  readonly rows?: (query: ObsOccurrenceReadbackQuery) => readonly ObsOccurrenceReadbackRow[] | Promise<readonly ObsOccurrenceReadbackRow[]>;
} = {}) {
  const readBaseline = vi.fn(async () => options.baseline ?? 16n);
  const readRows = vi.fn(async (query: ObsOccurrenceReadbackQuery) => options.rows?.(query) ?? [row(query)]);
  const close = vi.fn(async () => undefined);
  const verifier: ObsReadback = {
    readBaseline,
    readRows,
    close,
  };
  readbackMock.open.mockResolvedValue(verifier);
  return { readBaseline, readRows, close };
}

beforeEach(() => {
  readbackMock.open.mockReset();
  readbackMock.open.mockResolvedValue(undefined);
});

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

  it("rejects row verdict and receipt replay by later cases", async () => {
    const repoRoot = await temporaryDirectory("fix08-row-replay-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    const verifier = installReadback();
    let savedVerdict: ObsVerdict | undefined;
    let savedReceipt: SpawnReceipt | undefined;

    const result = await runFamily("obs-g1", {
      cases: [
        {
          name: "row-owner",
          subjectPaths: [subject],
          async run(context) {
            savedReceipt = await context.spawn({
              command: process.execPath,
              arguments: ["-e", ""],
              timeoutMs: 1_000,
              rowExpectation: { runtime: "scheduler", capturePoint: "job" },
            });
            savedVerdict = context.passRows(savedReceipt);
            return savedVerdict;
          },
        },
        {
          name: "row-verdict-replay",
          subjectPaths: [subject],
          async run() {
            if (savedVerdict === undefined) throw new Error("OWNER_DID_NOT_RUN");
            return savedVerdict;
          },
        },
        {
          name: "row-receipt-replay",
          subjectPaths: [subject],
          async run(context) {
            if (savedReceipt === undefined) throw new Error("OWNER_DID_NOT_RUN");
            return context.passRows(savedReceipt);
          },
        },
      ],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/row-owner PASS(rows=1)",
      "obs-g1/row-verdict-replay FAIL(code=FABRICATED_VERDICT)",
      "obs-g1/row-receipt-replay FAIL(code=SPAWN_RECEIPT_INVALID)",
    ]);
    expect(verifier.readBaseline).toHaveBeenCalledOnce();
    expect(verifier.readRows).toHaveBeenCalledOnce();
  });

  it("rejects process verdict and receipt replay by later cases", async () => {
    const repoRoot = await temporaryDirectory("fix08-process-replay-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    let savedVerdict: ObsVerdict | undefined;
    let savedReceipt: SpawnReceipt | undefined;

    const result = await runFamily("obs-g1", {
      cases: [
        {
          name: "process-owner",
          subjectPaths: [subject],
          async run(context) {
            savedReceipt = await context.spawn({
              command: process.execPath,
              arguments: ["-e", ""],
              timeoutMs: 1_000,
            });
            savedVerdict = context.passProcess(savedReceipt, { children: 1 });
            return savedVerdict;
          },
        },
        {
          name: "process-verdict-replay",
          subjectPaths: [subject],
          async run() {
            if (savedVerdict === undefined) throw new Error("OWNER_DID_NOT_RUN");
            return savedVerdict;
          },
        },
        {
          name: "process-receipt-replay",
          subjectPaths: [subject],
          async run(context) {
            if (savedReceipt === undefined) throw new Error("OWNER_DID_NOT_RUN");
            return context.passProcess(savedReceipt, { children: 1 });
          },
        },
      ],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/process-owner PASS(children=1)",
      "obs-g1/process-verdict-replay FAIL(code=FABRICATED_VERDICT)",
      "obs-g1/process-receipt-replay FAIL(code=SPAWN_RECEIPT_INVALID)",
    ]);
  });

  it("consumes a row receipt and proof on their first use", async () => {
    const repoRoot = await temporaryDirectory("fix08-row-one-use-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    installReadback();

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "row-one-use",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          context.passRows(receipt);
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/row-one-use FAIL(code=SPAWN_RECEIPT_ALREADY_USED)",
    ]);
  });

  it("consumes a process receipt on its first use", async () => {
    const repoRoot = await temporaryDirectory("fix08-process-one-use-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "process-one-use",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
          });
          context.passProcess(receipt, { children: 1 });
          return context.passProcess(receipt, { children: 1 });
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/process-one-use FAIL(code=SPAWN_RECEIPT_ALREADY_USED)",
    ]);
  });

  it("rejects a stdout-only row forgery with an invented matching occ_seq", async () => {
    const repoRoot = await temporaryDirectory("fix08-stdout-forgery-");
    const subject = await presentSubject(repoRoot);
    const forgedOutput = join(repoRoot, "forged-output.json");
    const lines: string[] = [];
    const verifier = installReadback({ rows: () => [] });

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "stdout-forgery",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", [
              forgedReceiptScript([777]),
              "require('node:fs').writeFileSync(process.argv[1], JSON.stringify(receipt));",
            ].join("\n"), forgedOutput],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual([
      "obs-g1/stdout-forgery FAIL(code=ROW_READBACK_EMPTY)",
    ]);
    expect(lines.join("\n")).not.toContain(" PASS");
    expect(verifier.readRows).toHaveBeenCalledOnce();
    const forged = JSON.parse(await readFile(forgedOutput, "utf8")) as {
      readonly pid: number;
      readonly run_ref: string;
      readonly occ_seq: readonly number[];
    };
    const query = verifier.readRows.mock.calls[0]?.[0];
    expect(forged).toMatchObject({ run_ref: query?.runRef, occ_seq: [777] });
    expect(forged.pid).toBeGreaterThan(0);
  });

  it("rejects the old case-supplied row-object call even when its values match stdout", async () => {
    const repoRoot = await temporaryDirectory("fix08-case-rows-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    installReadback();

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "case-rows",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", forgedReceiptScript([777])],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          const oldPassRows = context.passRows as unknown as (
            oldReceipt: typeof receipt,
            suppliedRows: readonly Readonly<Record<string, unknown>>[],
            suppliedMetrics: Readonly<Record<string, number>>,
          ) => ReturnType<typeof context.passRows>;
          return oldPassRows(receipt, [{
            pid: receipt.pid,
            runRef: receipt.declaredRunRef,
            occurrenceSequence: 777,
          }], { rows: 1 });
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/case-rows FAIL(code=CASE_ROWS_FORBIDDEN)"]);
    expect(lines.join("\n")).not.toContain(" PASS");
  });

  it("mints row PASS only after parent read-back above the pre-spawn baseline", async () => {
    const repoRoot = await temporaryDirectory("fix08-real-pass-");
    const scratchRoot = await temporaryDirectory("fix08-real-pass-scratch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    const childMarker = join(repoRoot, "child-ran");
    const baselineMarker = join(repoRoot, "baseline-ready");
    let markerPresentAtReadback = false;
    let childOutput: { readonly pid: number; readonly run_ref: string } | undefined;
    let receiptPid: number | undefined;
    let receiptExitCode: number | null | undefined;
    const verifier = installReadback({
      baseline: 16n,
      async rows(query) {
        markerPresentAtReadback = await access(childMarker).then(() => true, () => false);
        return [row(query, 17n)];
      },
    });
    verifier.readBaseline.mockImplementation(async () => {
      await writeFile(baselineMarker, "ready", "utf8");
      return 16n;
    });

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "real-pass",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", [
              "if (!require('node:fs').existsSync(process.argv[2])) process.exit(91);",
              "require('node:fs').writeFileSync(process.argv[1], 'ran');",
              "process.stdout.write(JSON.stringify({",
              "  pid: process.pid,",
              "  run_ref: process.env.OBS_G1_DECLARED_RUN_REF,",
              "}) + '\\n');",
            ].join("\n"), childMarker, baselineMarker],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          receiptPid = receipt.pid;
          receiptExitCode = receipt.exitCode;
          childOutput = JSON.parse(receipt.stdout.trim()) as typeof childOutput;
          return context.passRows(receipt, { children: 1 });
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["obs-g1/real-pass PASS(children=1 rows=1)"]);
    expect(receiptExitCode).toBe(0);
    expect(markerPresentAtReadback).toBe(true);
    expect(verifier.readBaseline).toHaveBeenCalledOnce();
    expect(verifier.readRows).toHaveBeenCalledOnce();
    expect(verifier.close).toHaveBeenCalledOnce();
    const query = verifier.readRows.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      baseline: 16n,
      runtime: "scheduler",
      capturePoint: "job",
    });
    expect(query?.runRef).toMatch(/^run:obs-g1:[0-9a-f-]{36}$/u);
    expect(childOutput).toEqual({ pid: receiptPid, run_ref: query?.runRef });
    expect(await readdir(scratchRoot)).toEqual([]);
  });

  it.each([
    {
      label: "baseline",
      rows: (query: ObsOccurrenceReadbackQuery) => [row(query, query.baseline)],
    },
    {
      label: "declared run",
      rows: (query: ObsOccurrenceReadbackQuery) => [{ ...row(query), runRef: "run:other" }],
    },
    {
      label: "runtime",
      rows: (query: ObsOccurrenceReadbackQuery) => [{ ...row(query), runtime: "runner" }],
    },
    {
      label: "capture point",
      rows: (query: ObsOccurrenceReadbackQuery) => [{ ...row(query), capturePoint: "process" }],
    },
  ])("rejects a parent read-back row with the wrong $label", async ({ rows }) => {
    const repoRoot = await temporaryDirectory("fix08-row-mismatch-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    installReadback({ rows });

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "row-mismatch",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/row-mismatch FAIL(code=ROW_READBACK_MISMATCH)"]);
  });

  it("fails before spawn when the parent read-only verifier is unavailable", async () => {
    const repoRoot = await temporaryDirectory("fix08-no-verifier-");
    const subject = await presentSubject(repoRoot);
    const childMarker = join(repoRoot, "must-not-run");
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "no-verifier",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'ran')", childMarker],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/no-verifier FAIL(code=ROW_VERIFIER_UNAVAILABLE)"]);
    await expect(access(childMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed when parent read-back exceeds its row limit", async () => {
    const repoRoot = await temporaryDirectory("fix08-row-limit-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    installReadback({
      rows: (query) => Array.from(
        { length: 101 },
        (_unused, index) => row(query, query.baseline + BigInt(index + 1)),
      ),
    });

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "row-limit",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/row-limit FAIL(code=ROW_READBACK_LIMIT)"]);
  });

  it("keeps database error text and credentials out of output", async () => {
    const repoRoot = await temporaryDirectory("fix08-query-error-");
    const subject = await presentSubject(repoRoot);
    const lines: string[] = [];
    const verifier = installReadback();
    verifier.readBaseline.mockRejectedValue(
      new ObsReadbackFailure("PASSWORD_PLANTED_SECRET_PRIVATE_DB"),
    );

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "query-error",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
            rowExpectation: { runtime: "scheduler", capturePoint: "job" },
          });
          return context.passRows(receipt);
        },
      }],
      repoRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(lines).toEqual(["obs-g1/query-error FAIL(code=ROW_READBACK_QUERY_FAILED)"]);
    expect(lines.join("\n")).not.toMatch(/planted-secret|private-db/iu);
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
            arguments: ["-e", ""],
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
    const lines: string[] = [];

    const result = await runFamily("obs-g1", {
      cases: [{
        name: "cleanup",
        subjectPaths: [subject],
        async run(context) {
          const receipt = await context.spawn({
            command: process.execPath,
            arguments: ["-e", ""],
            timeoutMs: 1_000,
          });
          scratchDirectory = receipt.scratchDirectory;
          return context.passProcess(receipt, { children: 1 });
        },
      }],
      repoRoot,
      scratchRoot,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["obs-g1/cleanup PASS(children=1)"]);
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
