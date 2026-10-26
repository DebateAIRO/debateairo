/**
 * Ruling R31 (side-by-side spec §13): the ONE rule both settings caches use (the runner's, apps/runner/src/run-settings.ts,
 * and the API's, apps/api/src/admission-settings.ts) to tell a settings version's refusal from the database's own
 * failure: `settingsRefusalCode` and `isDatabaseFailure`, written once in @debateai/db beside `isDatabasePoolBusy`.
 */
import { createServer, type Server, type Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPool, isDatabaseFailure, isDatabasePoolBusy, settingsRefusalCode } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

describe("settingsRefusalCode / isDatabaseFailure: a settings refusal, never the database's failure (R31)", () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });

  it("a typed code, or an Error whose whole message is a code (CODE or CODE:detail), is the refusal's code", () => {
    expect(settingsRefusalCode(new TypedDomainError("ENGINE_VERSION_POLICY_INVALID", "prose may follow"))).toBe("ENGINE_VERSION_POLICY_INVALID");
    expect(settingsRefusalCode(new TypeError("CALL_CONCURRENCY_POLICY_INVALID"))).toBe("CALL_CONCURRENCY_POLICY_INVALID");
    expect(settingsRefusalCode(new TypeError("CLAIM_BOUND_MISMATCH:judge"))).toBe("CLAIM_BOUND_MISMATCH:judge");
  });

  it("prose, a non-Error, the pool's own code (alone or as a cause) are no settings refusal", () => {
    expect(settingsRefusalCode(new Error("connection terminated unexpectedly"))).toBeNull();
    expect(settingsRefusalCode("CODE_AS_A_STRING")).toBeNull();
    const pooled = new TypedDomainError("DATABASE_POOL_FAILED", "PostgreSQL pool operation failed: connection terminated");
    const wrapped = Object.assign(new TypedDomainError("RUN_READ_FAILED", "fixture"), { cause: pooled });
    for (const failure of [pooled, wrapped]) {
      expect(isDatabaseFailure(failure)).toBe(true);
      expect(settingsRefusalCode(failure)).toBeNull();
    }
    expect(isDatabaseFailure(new TypedDomainError("DEBATE_SHAPE_POLICY_INVALID", "fixture"))).toBe(false);
  });

  it("a busy pool (marked busy at its origin by createPool) is the database's failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = createServer((socket) => { sockets.push(socket); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new TypeError("TEST_SERVER_ADDRESS");
    const pool = createPool(`postgresql://nobody@127.0.0.1:${address.port}/none`, { max: 1, connectionTimeoutMillis: 150, name: "test:busy" });
    try {
      const failure = await pool.query("SELECT 1").then(() => undefined, (error: unknown) => error);
      expect(isDatabasePoolBusy(failure)).toBe(true);
      expect(isDatabaseFailure(failure)).toBe(true);
      expect(settingsRefusalCode(failure)).toBeNull();
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it("is written once: neither settings cache keeps a copy of its own", async () => {
    for (const file of ["apps/runner/src/run-settings.ts", "apps/api/src/admission-settings.ts"]) {
      const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/function (?:isDatabaseFailure|settingsRefusalCode)\(/u);
      expect(source, file).not.toContain("const REFUSAL_CODE");
      expect(source, file).toMatch(/import \{[^}]*\bsettingsRefusalCode\b[^}]*\} from "@debateai\/db";/u);
    }
  });
});
