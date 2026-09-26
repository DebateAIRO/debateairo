// REV-PES-S02-p1-correctness-tests probe (head dfef0de94). Temporary fixture: copied into <worktree>/tests/ for the run,
// deleted after. Question: does I2 (the upgrade law, PLAN §5) hold for EVERY shipped predicate the new
// isExactEnvironmentWithoutDeclaredDeploymentMode composes — not only the two the slice's case (a) exercises?
import { readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import {
  DEVELOPMENT_API_ENVIRONMENT_KEYS,
  assembleDevelopmentApiEnvironment
} from "../apps/runner/src/dev-api-environment.js";
import { buildDevelopmentProviderPanel } from "../apps/runner/src/dev-provider-panel.js";
import {
  createDevelopmentDeploymentRegisterMachineReceipt,
  readDevelopmentDeploymentRegisterReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../apps/runner/src/dev-deployment-register.js";
import { parseRegisterVersionText } from "../packages/register/src/index.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "./support/developmentProviderPanel.js";
import {
  createDevApiEnvironmentAssemblyFixture,
  assembleDevApiEnvironmentFixture
} from "./support/devApiEnvironmentAssembly.js";

const ROW = "DEBATEAI_DEPLOYMENT_MODE=local\n";
const SUPPORT = JSON.stringify({
  provider_ref: "development:hermes-glm-5.3-flash",
  base_url: "http://127.0.0.1:8794/v1",
  model: "z-ai/glm-5.3-flash",
  authorization_header: "Bearer support-test"
});
const roots: string[] = [];
afterEach(async () => { delete process.env.DEBATEAI_DEV_CUSTODY_ROOT; await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

async function setup() {
  delete process.env.DEBATEAI_DEV_CUSTODY_ROOT;
  const f = await createDevApiEnvironmentAssemblyFixture();
  roots.push(f.repositoryRoot);
  process.env.DEBATEAI_DEV_CUSTODY_ROOT = f.custodyRoot;
  await assembleDevApiEnvironmentFixture(f.repositoryRoot);
  const current = await readFile(f.outputFilePath, "utf8");
  expect(current.endsWith(`\n${ROW}`)).toBe(true);
  return { ...f, current, base: current.slice(0, -ROW.length) };
}

const refreshed = () => buildDevelopmentProviderPanel([
  { providerRef: "development:codex-cli", baseUrl: "http://127.0.0.1:8791/v1", model: "codex-r", authorizationHeader: "Bearer codex-r" },
  { providerRef: "development:codex-premium-cli", baseUrl: "http://127.0.0.1:8795/v1", model: "codexp-r", authorizationHeader: "Bearer codexp-r" },
  { providerRef: "development:claude-cli", baseUrl: "http://127.0.0.1:8792/v1", model: "claude-r", authorizationHeader: "Bearer claude-r" },
  { providerRef: "development:claude-premium-cli", baseUrl: "http://127.0.0.1:8796/v1", model: "claudep-r", authorizationHeader: "Bearer claudep-r" },
  { providerRef: "development:grok-cli", baseUrl: "http://127.0.0.1:8793/v1", model: "grok-r", authorizationHeader: "Bearer grok-r" }
]);

it("P1 base-era file (no mode row) + relay refresh on the same boot is upgraded (isExactProviderRuntimeRefresh disjunct)", async () => {
  const t = await setup();
  await writeFile(t.outputFilePath, t.base, { mode: 0o600 });
  const panel = refreshed();
  await expect(assembleDevelopmentApiEnvironment({
    repositoryRoot: t.repositoryRoot, providerPanel: panel,
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(t.repositoryRoot), supportModelTarget: SUPPORT
  })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
  const after = await readFile(t.outputFilePath, "utf8");
  expect(after.endsWith(`\n${ROW}`)).toBe(true);
  expect(after).toContain(`PROVIDER_DISCOVERY_TARGETS_JSON=${panel.targetsJson}\n`);
});

it("P2 pre-support-era file (no support target, no mode row) is upgraded (legacy-without-support disjunct)", async () => {
  const t = await setup();
  const legacy = t.base.split("\n").filter((r) => !r.startsWith("SUPPORT_MODEL_TARGET_JSON=")).join("\n");
  await writeFile(t.outputFilePath, legacy, { mode: 0o600 });
  await expect(assembleDevApiEnvironmentFixture(t.repositoryRoot))
    .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
  expect(await readFile(t.outputFilePath, "utf8")).toBe(t.current);
});

it("P3 base-era file + a forward register publication is upgraded (published-register-refresh disjunct)", async () => {
  const t = await setup();
  await writeFile(t.outputFilePath, t.base, { mode: 0o600 });
  await writeDevelopmentDeploymentRegisterReceipt(t.repositoryRoot, createDevelopmentDeploymentRegisterMachineReceipt({
    registerVersion: parseRegisterVersionText("424243"), rowCount: 32, snapshotSha256: "b".repeat(64)
  }));
  await expect(assembleDevelopmentApiEnvironment({
    repositoryRoot: t.repositoryRoot, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(t.repositoryRoot), supportModelTarget: SUPPORT
  })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
  const after = await readFile(t.outputFilePath, "utf8");
  expect(after).toContain("REGISTER_VERSION=424243\n");
  expect(after.endsWith(`\n${ROW}`)).toBe(true);
});

it("P4 a hosted row anywhere, or a local row out of place, is drift and the bytes are kept", async () => {
  const t = await setup();
  const lines = t.base.trimEnd().split("\n");
  const variants = [
    t.base + "DEBATEAI_DEPLOYMENT_MODE=hosted\n",
    ["DEBATEAI_DEPLOYMENT_MODE=hosted", ...lines].join("\n") + "\n",
    ["DEBATEAI_DEPLOYMENT_MODE=local", ...lines].join("\n") + "\n",
    t.base.slice(0, -1),               // no trailing newline, no row
    t.current + ROW                    // row twice
  ];
  for (const v of variants) {
    await writeFile(t.outputFilePath, v, { mode: 0o600 });
    await expect(assembleDevApiEnvironmentFixture(t.repositoryRoot)).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(t.outputFilePath, "utf8")).toBe(v);
  }
});
