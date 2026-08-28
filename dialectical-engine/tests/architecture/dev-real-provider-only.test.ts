import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("development debate provider boundary", () => {
  it("has no canned provider and launches the real CLI handshake panel", async () => {
    await expect(access("apps/runner/src/dev-local-provider.ts")).rejects.toMatchObject({
      code: "ENOENT"
    });
    const [stack, cliPanel, environment, process, runner, panel] = await Promise.all([
      readFile("apps/runner/src/dev-auth-stack.ts", "utf8"),
      readFile("apps/runner/src/dev-cli-provider-panel.ts", "utf8"),
      readFile("apps/runner/src/dev-api-environment.ts", "utf8"),
      readFile("apps/runner/src/dev-api-process.ts", "utf8"),
      readFile("apps/runner/src/dev-runner-process.ts", "utf8"),
      readFile("apps/runner/src/dev-provider-panel.ts", "utf8")
    ]);
    expect(stack).toContain("startDevelopmentCliProviderPanel");
    expect(stack).not.toMatch(/startDevelopmentLocalProvider|qa-deterministic/iu);
    for (const source of [environment, process, runner]) {
      expect(source).not.toMatch(/renderDevelopmentProviderContent|createServer/iu);
    }
    expect(cliPanel).toContain("startModelShim");
    expect(cliPanel).toContain("startClaudeRelay");
    expect(cliPanel).toContain("startGrokRelay");
    expect(cliPanel).toContain("Promise.allSettled");
    expect(cliPanel).not.toMatch(/renderDevelopmentProviderContent|createServer/iu);
    expect(panel).toContain("development:codex-cli");
    expect(panel).toContain("development:claude-cli");
    expect(panel).toContain("development:grok-cli");
    expect(panel).toContain("DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1");
    expect(panel).toContain("qa-deterministic-v1");
  });
});
