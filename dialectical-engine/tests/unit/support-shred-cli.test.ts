import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  parseSupportShredArguments,
  publicSupportShredErrorCode,
  runSupportShredCli,
  type SupportShredCliDependencies
} from "../../apps/runner/src/support-shred-cli.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

function harness(input: Readonly<{
  result?: Readonly<{ kind: "SHREDDED"; counts: Readonly<{
    sessions: number; cases: number; keysDestroyed: number;
  }> }> | Readonly<{ kind: "ALREADY_SHREDDED" }>;
  credentialError?: Error;
  poolError?: Error;
  operationError?: Error;
  closeError?: Error;
}> = {}) {
  const loadCredentials = vi.fn(async () => {
    if (input.credentialError !== undefined) throw input.credentialError;
    return Object.freeze({ supportDatabaseUrl: "postgresql://closed-credential" });
  });
  const end = vi.fn(async () => {
    if (input.closeError !== undefined) throw input.closeError;
  });
  const openPool = vi.fn(() => {
    if (input.poolError !== undefined) throw input.poolError;
    return { end };
  });
  const operation = async () => {
    if (input.operationError !== undefined) throw input.operationError;
    return input.result ?? {
      kind: "SHREDDED" as const,
      counts: { sessions: 2, cases: 3, keysDestroyed: 5 }
    };
  };
  const shredOwner = vi.fn(operation);
  const shredSession = vi.fn(operation);
  const createRepository = vi.fn(() => ({ shredOwner, shredSession }));
  const dependencies = {
    loadCredentials,
    openPool,
    createRepository,
    osUsername: () => "operator",
    clock: () => new Date("2026-09-07T10:00:00.000Z")
  } as unknown as SupportShredCliDependencies;
  return { dependencies, loadCredentials, openPool, createRepository, shredOwner, shredSession, end };
}

describe("SUP-07 support:shred CLI", () => {
  // pin updated 2026-09-19 (DL7-F11): a shred destroys the keys that make a person's support
  // history readable and cannot be undone, so the caller must confirm with `--yes`. The
  // shape this row is about — exactly one canonical owner or anonymous-session target — is
  // unchanged; tests/unit/support-operator-cli-safety.test.ts owns the confirmation contract.
  it("accepts exactly one canonical owner or anonymous-session target", () => {
    expect(parseSupportShredArguments(["--owner", OWNER, "--yes"])).toEqual({
      kind: "owner", targetRef: OWNER
    });
    expect(parseSupportShredArguments(["--session", SESSION, "--yes"])).toEqual({
      kind: "session", targetRef: SESSION
    });
  });

  it.each([
    [[]], [["--owner"]], [["--session"]], [["--owner", ""]],
    [["--owner", OWNER, "extra"]], [["--owner", OWNER, "--yes", "extra"]],
    [["--owner", OWNER, "--owner", OWNER]],
    [["--session", SESSION, "--session", SESSION]],
    [["--owner", OWNER, "--session", SESSION]],
    [["--unknown", OWNER]], [["--owner", "not-a-uuid"]],
    [["--owner", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"]]
  ])("rejects malformed arguments before credential or pool I/O: %j", async (arguments_) => {
    const flow = harness();
    await expect(runSupportShredCli(arguments_, flow.dependencies))
      .rejects.toMatchObject({ code: "SUPPORT_SHRED_USAGE" });
    expect(flow.loadCredentials).not.toHaveBeenCalled();
    expect(flow.openPool).not.toHaveBeenCalled();
  });

  it("uses OS metadata, renders the exact success lines, and closes once", async () => {
    const owner = harness();
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], owner.dependencies))
      .resolves.toBe("sessions: 2, cases: 3, keys destroyed: 5\n");
    expect(owner.shredOwner).toHaveBeenCalledWith(
      OWNER, "operator", new Date("2026-09-07T10:00:00.000Z")
    );
    expect(owner.shredSession).not.toHaveBeenCalled();
    expect(owner.end).toHaveBeenCalledTimes(1);

    const session = harness({ result: { kind: "ALREADY_SHREDDED" } });
    await expect(runSupportShredCli(["--session", SESSION, "--yes"], session.dependencies))
      .resolves.toBe("already shredded\n");
    expect(session.shredSession).toHaveBeenCalledWith(
      SESSION, "operator", new Date("2026-09-07T10:00:00.000Z")
    );
    expect(session.end).toHaveBeenCalledTimes(1);
  });

  it("covers acquisition, operation, and close failures without leaking live resources", async () => {
    const credential = harness({ credentialError: new Error("credential-secret") });
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], credential.dependencies))
      .rejects.toThrow("credential-secret");
    expect(credential.openPool).not.toHaveBeenCalled();
    expect(credential.end).not.toHaveBeenCalled();

    const acquisition = harness({ poolError: new Error("pool-secret") });
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], acquisition.dependencies))
      .rejects.toThrow("pool-secret");
    expect(acquisition.end).not.toHaveBeenCalled();

    const operation = harness({ operationError: new TypeError("SUPPORT_SHRED_TARGET_NOT_FOUND") });
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], operation.dependencies))
      .rejects.toThrow("SUPPORT_SHRED_TARGET_NOT_FOUND");
    expect(operation.end).toHaveBeenCalledTimes(1);

    const primary = new TypeError("SUPPORT_SHRED_AUDIT_INVALID");
    const both = harness({ operationError: primary, closeError: new Error("password=secret") });
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], both.dependencies)).rejects.toBe(primary);
    expect(both.end).toHaveBeenCalledTimes(1);

    const close = harness({ closeError: new Error("postgresql://secret") });
    await expect(runSupportShredCli(["--owner", OWNER, "--yes"], close.dependencies))
      .rejects.toMatchObject({ code: "SUPPORT_SHRED_POOL_CLOSE_FAILED" });
    expect(close.end).toHaveBeenCalledTimes(1);
  });

  it("maps only fixed public codes and never renders error messages or target material", () => {
    expect(publicSupportShredErrorCode(new TypeError("SUPPORT_SHRED_TARGET_NOT_FOUND")))
      .toBe("SUPPORT_SHRED_TARGET_NOT_FOUND");
    expect(publicSupportShredErrorCode(new Error(
      `password=hunter2 target=${OWNER} SELECT wrapped_key`
    ))).toBe("SUPPORT_SHRED_FAILED");
  });

  it("publishes only the closed runner command and never imports API runtime or key custody", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["support:shred"])
      .toBe("tsx apps/runner/src/support-shred-cli.ts");
    const source = await readFile("apps/runner/src/support-shred-cli.ts", "utf8");
    expect(source).not.toMatch(
      /@debateai\/api|(?:apps\/|["'/])api\/src\/support|SUPPORT_KEK_PATH|process[.]env(?:[.]DATABASE_URL|\["DATABASE_URL"\])/u
    );
    expect(source).toContain("PostgresSupportShredRepository");
    expect(source).toContain("userInfo().username");
    expect(source).toContain("loadDevelopmentCommandEnvironment");
    expect(source).not.toContain(["process", "env"].join("."));
    expect(source).toContain("process.stderr.write(`${publicSupportShredErrorCode(error)}\\n`)");
    expect(source).not.toMatch(/stderr[.]write\([^\n]*(?:String\(error\)|error[.]message)/u);
  });
});
