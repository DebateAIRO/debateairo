import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  reconcileRunnerStartupWork,
  RunnerStartupReconciliationError
} from "../../apps/runner/src/runner-startup-reconciliation.js";
import { runnerTerminalFailureReason } from "../../apps/runner/src/index.js";
import { developmentRunnerClaimMs } from "../../apps/runner/src/dev-runner-process.js";

// Synthetic sensitive content. None of these is a real credential; each is shaped
// like a value that the removed rules would have emitted verbatim.
const FAKE_TOKEN = "AKIAIOSFODNN7EXAMPLE";
const FAKE_DIGEST = "DEADBEEFCAFEBABE0123456789ABCDEF";
const SQL_FRAGMENT = "SELECT_PASSWORD_HASH_FROM_IDENTITY_USER";
const FILE_PATH = "/var/run/secrets/dialectical-api.key";

describe("development runner startup reconciliation", () => {
  it("redispatches every bounded ready or expired work item before readiness", async () => {
    const dispatch = vi.fn(async () => undefined);
    const items = Object.freeze([
      Object.freeze({ runId: "00000000-0000-4000-8000-000000000001", workItemId: "00000000-0000-4000-8000-000000000011" }),
      Object.freeze({ runId: "00000000-0000-4000-8000-000000000002", workItemId: "00000000-0000-4000-8000-000000000012" })
    ]);

    await expect(reconcileRunnerStartupWork({
      work: { listDispatchable: vi.fn(async () => items) },
      dispatcher: { dispatch }
    })).resolves.toEqual({ dispatched: 2 });
    expect(dispatch.mock.calls).toEqual(items.map((item) => [item]));
  });

  it("fails closed when the ready backlog reaches the startup cap", async () => {
    const items = Object.freeze(Array.from({ length: 101 }, (_, index) => Object.freeze({
      runId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      workItemId: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`
    })));
    await expect(reconcileRunnerStartupWork({
      work: { listDispatchable: vi.fn(async () => items) },
      dispatcher: { dispatch: vi.fn(async () => undefined) }
    })).rejects.toMatchObject({
      name: RunnerStartupReconciliationError.name,
      message: "RUNNER_STARTUP_BACKLOG_SATURATED"
    });
  });

  it("retains only bounded machine-readable dependency diagnostics", () => {
    // CHANGED (F-DIAG-OPERATIONAL-REGEX): was `DEPENDENCY_42501`. `DEPENDENCY_${code}`
    // forwarded the five-character code the SERVER chose; the code rule is now an
    // allow-list keyed by the published SQLSTATE class.
    expect(runnerTerminalFailureReason(Object.assign(new Error("sensitive detail"), { code: "42501" })))
      .toBe("RUNNER_EXECUTION_FAILED:DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX");
    expect(runnerTerminalFailureReason(new TypeError("CONTENT_ATTESTATION_INVALID")))
      .toBe("RUNNER_EXECUTION_FAILED:CONTENT_ATTESTATION_INVALID");
    expect(runnerTerminalFailureReason(new Error("raw private content must not escape")))
      .toBe("RUNNER_EXECUTION_FAILED:ERROR");
  });

  it("emits no synthetic sensitive content placed in code, message or name", () => {
    // A credential-shaped `code`: satisfied /^[A-Z0-9_]{2,32}$/u and was emitted.
    const tokenInCode = runnerTerminalFailureReason(
      Object.assign(new Error("boom"), { code: FAKE_TOKEN })
    );
    expect(tokenInCode).not.toContain(FAKE_TOKEN);
    expect(tokenInCode).toBe("RUNNER_EXECUTION_FAILED:ERROR");

    // A digest-shaped `message`: satisfied /^[A-Z][A-Z0-9_]{2,63}$/u and was emitted.
    const digestInMessage = runnerTerminalFailureReason(new Error(FAKE_DIGEST));
    expect(digestInMessage).not.toContain(FAKE_DIGEST);
    expect(digestInMessage).toBe("RUNNER_EXECUTION_FAILED:ERROR");

    // An upper-cased SQL fragment: constant-SHAPED, but not a known constant.
    const sqlInMessage = runnerTerminalFailureReason(new TypeError(SQL_FRAGMENT));
    expect(sqlInMessage).not.toContain(SQL_FRAGMENT);
    expect(sqlInMessage).toBe("RUNNER_EXECUTION_FAILED:TYPE_ERROR");

    // A secret-bearing class `name`: was camel-to-SNAKE upper-cased and emitted.
    const tokenInName = runnerTerminalFailureReason(
      Object.assign(new Error("boom"), { name: "TokenAkiaiosfodnn7" })
    );
    expect(tokenInName).not.toContain("AKIAIOSFODNN7");
    expect(tokenInName).toBe("RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR");

    // A driver rejection naming a relation: the class, never the server's text.
    const relationInMessage = runnerTerminalFailureReason(Object.assign(
      new Error('relation "core.run" does not exist'),
      { code: "42P01", name: "error" }
    ));
    expect(relationInMessage).not.toContain("core.run");
    expect(relationInMessage).not.toContain("42P01");
    expect(relationInMessage).toBe("RUNNER_EXECUTION_FAILED:DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX");

    // A filesystem path in the message reaches the fixed class category.
    const pathInMessage = runnerTerminalFailureReason(new Error(FILE_PATH));
    expect(pathInMessage).not.toContain("secrets");
    expect(pathInMessage).toBe("RUNNER_EXECUTION_FAILED:ERROR");
  });

  it("prefixes every allow-listed failure constant without re-deriving it", async () => {
    const source = await readFile("apps/runner/src/index.ts", "utf8");
    const begin = source.indexOf("// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET");
    const end = source.indexOf("// ─── END OPERATIONAL DIAGNOSTIC ALPHABET");
    expect(begin).toBeGreaterThanOrEqual(0);
    const block = source.slice(begin, end);
    const declaration = block.slice(block.indexOf("const KNOWN_FAILURE_CONSTANTS"));
    const body = declaration.slice(declaration.indexOf("["), declaration.indexOf("]);"));
    const constants = [...body.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]!);
    expect(constants.length).toBeGreaterThan(200);
    for (const constant of constants) {
      expect(runnerTerminalFailureReason(new Error(constant)))
        .toBe(`RUNNER_EXECUTION_FAILED:${constant}`);
    }
  });

  it("derives the claim lease from the sealed cooldown and longest call bound", () => {
    expect(developmentRunnerClaimMs()).toBe(1_741_000);
  });
});
