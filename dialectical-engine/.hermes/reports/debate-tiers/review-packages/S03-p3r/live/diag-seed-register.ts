// diag-seed-register.ts — orchestrator diagnostic (2026-09-16): the data plane swallows the seed-register child's stderr
// (dev-auth-data-plane.ts runCommand: settleFailure() without a cause). This runs the SAME child with the SAME environment
// (the panel's targetsJson + the local migrator URL) and lets its stderr through to a log. Never prints a secret itself.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import { createDevelopmentAuthStackOperations } from "../../apps/runner/src/dev-auth-stack.js";
const root = process.cwd();
const source = readFileSync(`${root}/apps/runner/src/dev-auth-data-plane.ts`, "utf8");
const url = /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/u.exec(source)?.[1];
if (url === undefined) { console.error("MIGRATOR_URL_NOT_FOUND"); process.exit(2); }
const commandEnvironment = loadDevelopmentCommandEnvironment();
const operations = createDevelopmentAuthStackOperations(root, commandEnvironment);
const panel = await operations.startProviderPanel();
console.log(`PANEL_READY healthy=${panel.healthyProviderRefs.length}`);
try {
  const child = spawn("pnpm", ["dev:auth:seed-register"], {
    cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"],
    env: { ...commandEnvironment, MIGRATION_DATABASE_URL: url, DEBATEAI_DEV_PROVIDER_TARGETS_JSON: panel.panel.targetsJson }
  });
  const redact = (s: string) => s.replace(/postgresql:\/\/[^\s"']+/gu, "postgresql://<redacted>").replace(/(KEY|TOKEN|SECRET|Bearer)[=: ]+\S+/gu, "$1=<redacted>");
  child.stdout.on("data", (c: Buffer) => process.stdout.write("[out] " + redact(c.toString("utf8"))));
  child.stderr.on("data", (c: Buffer) => process.stdout.write("[err] " + redact(c.toString("utf8"))));
  const code = await new Promise<number | null>((res) => child.once("exit", (c) => res(c)));
  console.log(`SEED_REGISTER_EXIT code=${code}`);
} finally {
  await panel.stop();
}
