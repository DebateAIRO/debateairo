// ARCH-PES-S01 PROPOSED CODE — not product code. The entry PLAN step S01-23 asks BUILD to write at
// acceptance/pes-accept-publish-set.ts. In the product file the two `tests/support` imports are
// "../tests/support/registerFixtures.js" and "../tests/support/testDatabase.js", the module import is
// "./pes-s01-publish-set-acceptance.js", and the two URLs below are relative to acceptance/ ("..", "../apps/…").
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, type Pool } from "@debateai/db";
import {
  importHistoricalRegisterFixture,
  readLegacyDevelopmentV4Rows
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/registerFixtures.js";
import { startTestDatabase } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/testDatabase.js";
import { runPesS01PublishSetAcceptance, type PesS01CommandResult } from "./pes-s01-publish-set-acceptance.js";

const productRoot = fileURLToPath(new URL("..", import.meta.url));
const commandPath = fileURLToPath(new URL("../apps/runner/src/hosted-provider-set-publish-cli.ts", import.meta.url));
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const baseEnvironment: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  ["PATH", "HOME", "TMPDIR"].flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value] as const];
  })
));

function runPublishCommand(environment: Readonly<Record<string, string>>): Promise<PesS01CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, commandPath], {
      cwd: productRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

// The embedded server writes its routine log lines through console.info (tests/support/testDatabase.ts:103, :107),
// which is stdout; SPEC-v3 §5 steps 3-6 read THIS command's lines on stdout, so console.info and console.log are
// silenced for the run and restored after it. console.error (testDatabase.ts:104) still reaches stderr.
const { info, log } = console;
console.info = () => undefined;
console.log = () => undefined;
const scratch = await mkdtemp(join(tmpdir(), "pes-s01-accept-"));
let passed = false;
try {
  passed = await runPesS01PublishSetAcceptance({
    startDatabase: startTestDatabase,
    seedVersion4: async (pool) => {
      await migrate(pool as Pool);
      return (await importHistoricalRegisterFixture(pool as Pool, 4, await readLegacyDevelopmentV4Rows())).rowCount;
    },
    writeRoster: async (caseName, text) => {
      const path = join(scratch, `${caseName}.json`);
      await writeFile(path, text, { mode: 0o600 });
      return path;
    },
    runPublishCommand,
    baseEnvironment,
    print: (line) => { process.stdout.write(`${line}\n`); }
  });
} finally {
  console.info = info;
  console.log = log;
  await rm(scratch, { recursive: true, force: true });
}
process.exitCode = passed ? 0 : 1;
