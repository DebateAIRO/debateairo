import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPoolFailureReceipt, runPoolFailureChild } from "../support/poolFailureHarness.js";

describe("POL-03 pool failure policy", () => {
  it("keeps the real PostgreSQL reset suite mandatory in the integration pool", () => {
    const integrationSuite = readFileSync(
      fileURLToPath(new URL("../integration/pol03-pool-resilience.test.ts", import.meta.url)),
      "utf8"
    );
    expect(integrationSuite).not.toMatch(/\b(?:it|test|describe)\.(?:skip|todo)\s*\(/);
    expect(integrationSuite).not.toMatch(/\boptional\b/i);
  });

  it("keeps a child process alive and rejects subsequent queries typed after an idle pool error", async () => {
    const child = await runPoolFailureChild({ POL03_MODE: "emit" });

    expect(child.exitCode, child.stderr).toBe(0);
    expect(child.stderr).toContain("[DATABASE_POOL_FAILED] PostgreSQL pool operation failed: POL03_SIMULATED_IDLE_BACKEND_RESET");
    expect(readPoolFailureReceipt(child.stdout)).toMatchObject({
      survived: true,
      subsequentError: {
        name: "TypedDomainError",
        code: "DATABASE_POOL_FAILED"
      }
    });
  });
});
