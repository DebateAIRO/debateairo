// ARCH-PES-S01 probe p8 — a DRY RUN of SPEC-v3 §5 with the PLAN's proposed code (not product code): the proposed
// acceptance function (proposed/pes-s01-publish-set-acceptance.ts) drives the proposed publish command
// (proposed/hosted-provider-set-publish-cli.ts) against the repository's embedded PostgreSQL, exactly as the
// proposed entry does, except that (a) the command path is the proposed copy and (b) the children resolve
// @debateai/* through tsconfig.proposed.json (TSX_TSCONFIG_PATH). Writes nothing in the lane.
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

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine";
const commandPath = fileURLToPath(new URL("./hosted-provider-set-publish-cli.ts", import.meta.url));
const tsxLoader = createRequire(`${LANE}/package.json`).resolve("tsx");
const baseEnvironment: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(["PATH", "HOME", "TMPDIR"].flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value] as const];
  })),
  TSX_TSCONFIG_PATH: fileURLToPath(new URL("../tsconfig.proposed.json", import.meta.url))
});

function runPublishCommand(environment: Readonly<Record<string, string>>): Promise<PesS01CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, commandPath], {
      cwd: LANE, env: environment, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

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
