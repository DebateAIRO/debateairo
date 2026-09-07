import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  reconcileRunnerStartupWork,
  RunnerStartupReconciliationError
} from "../../apps/runner/src/runner-startup-reconciliation.js";
import { TypedDomainError } from "../../packages/kernel/src/index.js";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError
} from "../../packages/providers/src/index.js";
import { runnerTerminalFailureReason } from "../../apps/runner/src/index.js";
import { developmentRunnerClaimMs } from "../../apps/runner/src/dev-runner-process.js";

// Synthetic sensitive content. None of these is a real credential; each is shaped
// like a value that the removed rules would have emitted verbatim.
// The canonical expected-membership lists live in tests/unit/api-operational-error.test.ts
// and are read out of its SOURCE TEXT here. Importing that module would register its
// suites a second time; reading the text keeps one canonical list and keeps this
// test's expectation independent of the implementation it checks (codex r1b F2).
async function expectedListFromApiTest(name: string): Promise<readonly string[]> {
  const source = await readFile("tests/unit/api-operational-error.test.ts", "utf8");
  const declaration = source.slice(source.indexOf(`const ${name}`));
  const body = declaration.slice(declaration.indexOf("["), declaration.indexOf("]);"));
  const values = [...body.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]!);
  expect(values.length).toBeGreaterThan(200);
  return Object.freeze(values);
}

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

  it("maps a declared domain code and refuses an undeclared typed code", async () => {
    // codex r1 F1. This reason is PERSISTED (core.work_item.terminal_reason via
    // packages/battery/src/index.ts:434) with no later alphabet check, so an
    // undeclared typed code used to become durable state.
    expect(runnerTerminalFailureReason(
      new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", "not recorded")
    )).toBe("RUNNER_EXECUTION_FAILED:RUNNER_FAILURE_STATE_NOT_RECORDED");
    expect(runnerTerminalFailureReason(
      new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "composition contract")
    )).toBe("RUNNER_EXECUTION_FAILED:COMPOSITION_CONTRACT_ERROR");

    expect(runnerTerminalFailureReason(new TypedDomainError("DIAG_REVIEW_SENTINEL", "probe")))
      .toBe("RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR");

    const tokenTyped = runnerTerminalFailureReason(new TypedDomainError(FAKE_TOKEN, "probe"));
    expect(tokenTyped).not.toContain(FAKE_TOKEN);
    expect(tokenTyped).toBe("RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR");

    const sqlTyped = runnerTerminalFailureReason(new TypedDomainError(SQL_FRAGMENT, "probe"));
    expect(sqlTyped).not.toContain(SQL_FRAGMENT);
    expect(sqlTyped).toBe("RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR");

    // Non-code literals that were wrongly admitted (codex r1b F2).
    for (const notACode of ["MATCHED_EXISTING", "PROWESS_RANK", "UNASSESSABLE"]) {
      expect(runnerTerminalFailureReason(new TypedDomainError(notACode, "probe")))
        .toBe("RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR");
    }

    const source = await readFile("apps/runner/src/index.ts", "utf8");
    const block = source.slice(
      source.indexOf("// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET"),
      source.indexOf("// ─── END OPERATIONAL DIAGNOSTIC ALPHABET")
    );
    const declaration = block.slice(block.indexOf("const KNOWN_DOMAIN_CODES"));
    const body = declaration.slice(declaration.indexOf("["), declaration.indexOf("]);"));
    const codes = [...body.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]!);
    const expected = await expectedListFromApiTest("EXPECTED_DOMAIN_CODES");
    expect([...codes].sort()).toEqual([...expected].sort());
    for (const code of expected) {
      expect(runnerTerminalFailureReason(new TypedDomainError(code, "declared")))
        .toBe(`RUNNER_EXECUTION_FAILED:${code}`);
    }
  });

  it("preserves a declared provider subclass code without its raw fields", () => {
    // codex r1b F3. This reason is PERSISTED, so a real provider failure degrading
    // to the unknown fallback would become durable state that names nothing.
    const called = new ProviderCallFailedError(
      new Error("upstream 10.0.0.9:443 refused: key sk-live-EXAMPLE"),
      3,
      "TIMED_OUT",
      "ledger:abc123"
    );
    const calledReason = runnerTerminalFailureReason(called);
    expect(calledReason).toBe("RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED");
    expect(calledReason).not.toContain("10.0.0.9");
    expect(calledReason).not.toContain("sk-live-EXAMPLE");

    const unaccepted = new ProviderContentUnacceptedError(
      2,
      "PARSE_FAILED",
      "unexpected token at line 4: {\"secret\":\"sk-live-EXAMPLE\"}",
      "artifact:raw-9f8ae2",
      "ledger:def456"
    );
    const unacceptedReason = runnerTerminalFailureReason(unaccepted);
    expect(unacceptedReason).toBe("RUNNER_EXECUTION_FAILED:PROVIDER_CONTENT_UNACCEPTED");
    expect(unacceptedReason).not.toContain("secret");
    expect(unacceptedReason).not.toContain("artifact:raw-9f8ae2");
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
    const expectedConstants = await expectedListFromApiTest("EXPECTED_FAILURE_CONSTANTS");
    expect([...constants].sort()).toEqual([...expectedConstants].sort());
    for (const constant of expectedConstants) {
      expect(runnerTerminalFailureReason(new Error(constant)))
        .toBe(`RUNNER_EXECUTION_FAILED:${constant}`);
    }
  });

  it("derives the claim lease from the sealed cooldown and longest call bound", () => {
    expect(developmentRunnerClaimMs()).toBe(1_741_000);
  });
});
