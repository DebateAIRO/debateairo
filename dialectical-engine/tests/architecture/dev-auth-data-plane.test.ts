import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DEV-08 local-auth data-plane orchestration", () => {
  it("keeps the bounded data-plane command separate from the explicit stack supervisor", async () => {
    const [packageSource, orchestrator, cli, topology, status] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-auth-data-plane.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-data-plane-cli.ts", "utf8"),
      readFile(
        "docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md",
        "utf8"
      ),
      readFile(
        "docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md",
        "utf8"
      )
    ]);
    const scripts = (JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    }).scripts;
    expect(scripts["dev:auth:data-plane"])
      .toBe("tsx apps/runner/src/dev-auth-data-plane-cli.ts");
    expect(scripts["dev:auth:up"])
      .toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(orchestrator).toContain('["postgres", "hatchet-lite"]');
    expect(orchestrator).toContain("DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE");
    expect(orchestrator).toContain("startedServices");
    expect(orchestrator).not.toMatch(/@debateai\/api|apps\/ui|tls-front-door/);
    expect(cli).not.toMatch(/password|HATCHET_CLIENT_TOKEN|DATABASE_URL=/);
    expect(topology).toContain("`pnpm dev:auth:data-plane`");
    expect(topology).toMatch(/does not start the API, UI,\s+or TLS front door/u);
    expect(status).toContain("DEV-08 adds the bounded data-plane command");
    expect(status).toContain("Docker Desktop engine is externally blocked");
  });
});
