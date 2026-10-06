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
    expect(cliPanel).toContain("startAgyRelay");
    expect(cliPanel).toContain("startPiRelay");
    expect(cliPanel).toContain("Promise.allSettled");
    expect(cliPanel).not.toMatch(/renderDevelopmentProviderContent|createServer/iu);
    expect(panel).toContain("development:codex-cli");
    expect(panel).toContain("development:codex-premium-cli");
    expect(panel).toContain("development:claude-cli");
    expect(panel).toContain("development:claude-premium-cli");
    expect(panel).toContain("development:grok-cli");
    expect(panel).toContain("development:agy-cli");
    expect(panel).toContain("development:pi-glm-cli");
    expect(panel).toContain("DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1");
    expect(panel).toContain("qa-deterministic-v1");
  });

  /**
   * INTENT REWRITTEN (owner ruling, spec §2.10, 2026-09-26). Until then this row
   * said Hermes GLM stays in the Support-only seam and OUT OF THE DEBATE ROSTER.
   * The owner has since put GLM into the debate — through `pi`, with the Z.AI key
   * kept inside pi — so what this row guards now is the SEPARATION: GLM debates
   * only through the pi relay, the Support model stays Hermes, and the two never
   * share a module, a roster slot or a credential path.
   */
  it("debates GLM only through the pi relay and keeps Hermes the Support-only seam", async () => {
    const [panel, cliPanel, stack, piRelay] = await Promise.all([
      readFile("apps/runner/src/dev-provider-panel.ts", "utf8"),
      readFile("apps/runner/src/dev-cli-provider-panel.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-stack.ts", "utf8"),
      readFile("acceptance/pi-relay.ts", "utf8")
    ]);
    expect(panel).toContain("development:pi-glm-cli");
    expect(cliPanel).toContain("startPiRelay");
    expect(panel).not.toContain("hermes-glm-5.3-flash");
    expect(panel).not.toContain("startHermesSupportRelay");
    expect(cliPanel).not.toContain("startHermesSupportRelay");
    expect(cliPanel).not.toContain("hermes-relay");
    expect(piRelay).not.toContain("hermes-relay");
    expect(piRelay).not.toContain("auth.json");
    expect(stack).toContain("startHermesSupportRelay");
    expect(stack).toContain("supportModelTarget");
  });

  it("builds the Support model map only from the dedicated target instead of debate discovery",async () => {
    const main = await readFile("apps/api/src/main.ts","utf8");
    const support = main.slice(main.indexOf("const supportModels"),main.indexOf("const supportStatus"));
    // V-30/task 12: the dedicated target is still the ONLY source of the map,
    // and it is now read through the deployment's own mode decision, so a
    // hosted API can never be composed from the debate panel and a relay can
    // never be composed on the hosted site.
    expect(main).toMatch(
      /parseSupportModelTargetJson\(environment\.SUPPORT_MODEL_TARGET_JSON,\s*\{\s*mode: environment\.DEPLOYMENT_MODE,\s*nodeEnv: environment\.NODE_ENV\s*\}\)/u
    );
    expect(support).toContain("supportModelTarget.providerRef");
    expect(support).toContain("createSupportModelAdapter(supportModelTarget");
    expect(support).not.toContain("providerDiscoveryTargets.map");
  });
});
