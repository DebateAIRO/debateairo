// ARCH-FIX-PES-S01-p2 probe d1 (was ARCH-PES-S01 p8) — a DRY RUN of SPEC-v3 §5 with the PLAN's proposed code (not product code): the proposed
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
  publishReplacementRegisterFixture,
  readLegacyDevelopmentV4Rows
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/registerFixtures.js";
import { startTestDatabase } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/testDatabase.js";
import { parseRegisterVersionText } from "@debateai/register";
import {
  PES_S01_ROLE_ROWS_SOURCE_REF,
  buildPesS01RoleSeedRows,
  runPesS01PublishSetAcceptance,
  type PesS01CommandResult
} from "./pes-s01-publish-set-acceptance.js";

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
// The roster directory is made at the first roster (SPEC-v4 §5 step 6: a database that cannot start is the
// UNVERIFIED outcome, so nothing the entry does itself may fail before the database start is tried).
let scratch: string | undefined;
let exitCode: 0 | 1 = 1;
try {
  exitCode = await runPesS01PublishSetAcceptance({
    startDatabase: startTestDatabase,
    seedVersion4: async (pool) => {
      await migrate(pool as Pool);
      return (await importHistoricalRegisterFixture(pool as Pool, 4, await readLegacyDevelopmentV4Rows())).rowCount;
    },
    seedRoleRows: async (pool, version) => (await publishReplacementRegisterFixture(
      pool as Pool,
      parseRegisterVersionText(version),
      buildPesS01RoleSeedRows(),
      PES_S01_ROLE_ROWS_SOURCE_REF
    )).registerVersion,
    writeRoster: async (caseName, text) => {
      scratch ??= await mkdtemp(join(tmpdir(), "pes-s01-accept-"));
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
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
}
// V-12/V-13 (SPEC-v4 §5 steps 2 and 6): the exit code is SET BY process.exit, never by process.exitCode. Importing
// embedded-postgres registers async-exit-hook, whose `beforeExit` listener calls process.exit(0) and so erases a
// process.exitCode of 1 (probe ARCH-FIX-PES-S01-p2/d3: rc=0 after exitCode=1). An explicit process.exit fires no
// `beforeExit`. The empty write's callback runs once every earlier stdout write is flushed (a pipe is asynchronous
// on macOS), so no verdict line is lost.
await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
process.exitCode = exitCode;
