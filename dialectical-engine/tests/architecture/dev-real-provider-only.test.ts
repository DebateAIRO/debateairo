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
    expect(panel).toContain("development:codex-premium-cli");
    expect(panel).toContain("development:claude-premium-cli");
    expect(panel).toContain("development:grok-cli");
    expect(panel).toContain("development:openai-free-api");
    expect(panel).toContain("development:zai-free-api");
    expect(panel).toContain("DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1");
    expect(panel).toContain("qa-deterministic-v1");
  });

  it("keeps Hermes GLM in the Support-only stack seam and out of the debate roster",async () => {
    const [panel,stack] = await Promise.all([
      readFile("apps/runner/src/dev-provider-panel.ts","utf8"),
      readFile("apps/runner/src/dev-auth-stack.ts","utf8")
    ]);
    // The glm-5.3-flash debate entry has its own development:zai-free-api ref, endpoint and credential;
    // none of this slice's files alters the port-8794 Hermes Support seam.
    expect(panel).not.toContain("hermes-glm-5.3-flash");
    expect(panel).not.toContain("startHermesSupportRelay");
    expect(stack).toContain("startHermesSupportRelay");
    expect(stack).toContain("supportModelTarget");
  });

  it("builds the Support model map only from the dedicated target instead of debate discovery",async () => {
    const main = await readFile("apps/api/src/main.ts","utf8");
    const support = main.slice(main.indexOf("const supportModels"),main.indexOf("const supportStatus"));
    expect(main).toContain("parseSupportModelTargetJson(environment.SUPPORT_MODEL_TARGET_JSON)");
    expect(support).toContain("supportModelTarget.providerRef");
    expect(support).not.toContain("providerDiscoveryTargets.map");
  });

  it("threads the file-derived configured set through every runner command", async () => {
    const [deployment, dataPlane, environment, publication] = await Promise.all([
      readFile("apps/runner/src/dev-deployment-register-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-data-plane-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-api-environment-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-provider-set-publish-cli.ts", "utf8")
    ]);
    expect(deployment).toContain(
      "loadDevelopmentProviderPanelFromEnvironment(commandEnvironment, loadModelConfigConfiguredProviders(process.cwd()))"
    );
    expect(dataPlane).toContain(
      "loadDevelopmentProviderPanelFromEnvironment(commandEnvironment, loadModelConfigConfiguredProviders(process.cwd()))"
    );
    expect(environment).toContain(
      "loadDevelopmentProviderPanelFromEnvironment(commandEnvironment, loadModelConfigConfiguredProviders(repositoryRoot))"
    );
    expect(publication).toContain(
      "developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(repositoryRoot))"
    );
    expect(publication).not.toContain("developmentConfiguredProviderPanel()");
  });
});
