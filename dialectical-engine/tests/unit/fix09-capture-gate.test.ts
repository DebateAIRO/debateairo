import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

// The authority requires this executable to remain a single checked-in .mjs file.
// @ts-expect-error TypeScript does not synthesize declarations for that boundary.
import {
  assertChildArgv,
  parseGateManifest,
  validateVitestReport,
} from "../../tools/fix09-capture-gate.mjs";

type GateRule = Readonly<{
  child_argv: readonly string[];
  expected_exit: "zero";
  files: readonly string[];
  id: string;
  reporter_bytes: string;
  reporter_count: string;
  reporter_names: readonly string[];
  reporter_sha256: string;
}>;

const FILE = "tests/unit/fix09-capture-gate.test.ts";
const NAME =
  "FIX-09 evidence capture > captures immutable child evidence and rejects every closed hostile control";
const CHILD = [
  "pnpm",
  "exec",
  "vitest",
  "run",
  "--reporter=json",
  FILE,
] as const;

function compact(value: unknown): string {
  return JSON.stringify(value);
}

function rule(names: readonly string[] = [NAME]): GateRule {
  const bytes = compact(names);
  return {
    child_argv: [...CHILD],
    expected_exit: "zero",
    files: [FILE],
    id: "task1-runner",
    reporter_bytes: String(Buffer.byteLength(bytes)),
    reporter_count: String(names.length),
    reporter_names: [...names],
    reporter_sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function report(
  names: readonly string[] = [NAME],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    numFailedTests: 0,
    numPassedTests: names.length,
    numPendingTests: 0,
    numTodoTests: 0,
    numTotalTests: names.length,
    success: true,
    testResults: [
      {
        assertionResults: names.map((name) => {
          const separator = name.lastIndexOf(" > ");
          return {
            ancestorTitles: name.slice(0, separator).split(" > "),
            status: "passed",
            title: name.slice(separator + 3),
          };
        }),
        name: `/private/tmp/fixture/${FILE}`,
        status: "passed",
      },
    ],
    ...overrides,
  };
}

function expectCode(callback: () => unknown, code: string): void {
  expect(callback).toThrowError(new Error(code));
}

describe("FIX-09 evidence capture", () => {
  it("captures immutable child evidence and rejects every closed hostile control", () => {
    const expectedRule = rule();
    expect(validateVitestReport(expectedRule, report(), 0)).toEqual({
      failed: 0,
      files: 1,
      skipped: 0,
      tests: 1,
      todo: 0,
    });

    const manifest = {
      gates: [expectedRule],
      schema: "fix09-gate-manifest/v1",
    };
    expect(parseGateManifest(Buffer.from(`${compact(manifest)}\n`))).toEqual(
      manifest,
    );

    const reporterHostiles: readonly [Record<string, unknown>, string][] = [
      [report([], { testResults: [] }), "FIX09_GATE_ZERO_SELECTION"],
      [report([`${NAME} changed`]), "FIX09_GATE_NAMES"],
      [report([NAME], { numTotalTests: 2 }), "FIX09_GATE_SUMMARY"],
      [report([NAME], { numFailedTests: 1, numPassedTests: 0, success: false }), "FIX09_GATE_STATUS"],
      [report([NAME], { numPendingTests: 1 }), "FIX09_GATE_SKIPPED"],
      [report([NAME], { numTodoTests: 1 }), "FIX09_GATE_TODO"],
    ];
    for (const [hostile, code] of reporterHostiles) {
      expectCode(() => validateVitestReport(expectedRule, hostile, 0), code);
    }
    expectCode(
      () => validateVitestReport(expectedRule, report(), 1),
      "FIX09_GATE_RC",
    );

    for (const names of [
      [],
      [NAME, NAME],
      [`${NAME} B`, `${NAME} A`],
      [`${NAME} substituted`],
    ]) {
      expectCode(
        () => validateVitestReport(rule([NAME, `${NAME} B`]), report(names), 0),
        "FIX09_GATE_IT_EACH_UNDERCOUNT",
      );
    }

    for (const legacyTotal of [105, 109]) {
      expectCode(
        () =>
          validateVitestReport(
            { ...expectedRule, reporter_count: String(legacyTotal) },
            report(),
            0,
          ),
        "FIX09_GATE_LEGACY_TOTAL_105_109",
      );
    }

    for (const hostile of [
      Buffer.from("{\n"),
      Buffer.from(`${compact({ ...manifest, extra: true })}\n`),
      Buffer.from(
        `${compact({ ...manifest, gates: [expectedRule, expectedRule] })}\n`,
      ),
    ]) {
      expect(() => parseGateManifest(hostile)).toThrow();
    }
    expectCode(
      () => assertChildArgv(expectedRule, [...CHILD, "drift"]),
      "FIX09_GATE_ARGV_DRIFT",
    );
  });
});
