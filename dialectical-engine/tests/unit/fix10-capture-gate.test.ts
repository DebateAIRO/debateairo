import { describe, expect, it } from "vitest";
// @ts-expect-error -- the nonshipping capture runner is intentionally plain ESM without a public type surface.
import { validateCapture } from "../../tools/fix10-capture-gate.mjs";

const manifest = { files: [{ path: "a.test.ts", names: ["suite > works"] }] };
const good = { success: true, numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0,
  numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, testResults: [
    { name: "/repo/a.test.ts", status: "passed", assertionResults: [{ fullName: "suite > works", status: "passed" }] },
  ] };

describe("FIX-10 capture gate", () => {
  it("rejects_no_match", () => expect(() => validateCapture({ ...good, testResults: [] }, manifest, 0)).toThrow("FIX10_CAPTURE_FILE_COUNT"));
  it("rejects_zero_tests", () => expect(() => validateCapture({ ...good, numTotalTests: 0 }, manifest, 0)).toThrow("FIX10_CAPTURE_TEST_COUNT"));
  it("rejects_wrong_file", () => expect(() => validateCapture({ ...good, testResults: [{ ...good.testResults[0], name: "/repo/b.test.ts" }] }, manifest, 0)).toThrow("FIX10_CAPTURE_FILE"));
  it("rejects_wrong_name", () => expect(() => validateCapture({ ...good, testResults: [{ ...good.testResults[0], assertionResults: [{ fullName: "bad", status: "passed" }] }] }, manifest, 0)).toThrow("FIX10_CAPTURE_NAMES"));
  it("rejects_wrong_count", () => expect(() => validateCapture({ ...good, numPassedTests: 2 }, manifest, 0)).toThrow("FIX10_CAPTURE_TEST_COUNT"));
  it("rejects_skip_todo", () => expect(() => validateCapture({ ...good, numPendingTests: 1 }, manifest, 0)).toThrow("FIX10_CAPTURE_STATUS"));
  it("rejects_wrong_exit", () => expect(() => validateCapture(good, manifest, 1)).toThrow("FIX10_CAPTURE_EXIT"));
  it("captures_before_asserting", () => {
    expect(validateCapture(good, manifest, 0)).toEqual({ files: 1, tests: 1 });
    const twoManifest = { files: [manifest.files[0], { path: "b.test.ts", names: ["suite > second"] }] };
    const second = { name: "/repo/b.test.ts", status: "passed",
      assertionResults: [{ fullName: "suite > second", status: "passed" }] };
    expect(validateCapture({ ...good, numTotalTests: 2, numPassedTests: 2,
      testResults: [second, good.testResults[0]] }, twoManifest, 0)).toEqual({ files: 2, tests: 2 });
  });
});
