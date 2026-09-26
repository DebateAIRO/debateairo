// ARCH-FIX-PES-S01-p2 PROPOSED CODE (Revision 2) — not product code. The entry PLAN step S01-23 asks BUILD to write at
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
process.exit(exitCode);
