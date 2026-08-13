import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = process.cwd();
// HYG-01 owns the previously phantom 31KB scoring-response behavioral suite.
// Quarantined legacy source-contract files retain their historical content but
// cannot look active. The root gate proves every active *.test.mjs is listed.
const tests = JSON.parse(await readFile(new URL("./node-test-manifest.json", import.meta.url), "utf8"));
await Promise.all(tests.map(async (testPath) => {
  await readFile(resolve(appRoot, testPath));
}));

process.stdout.write(`V2_UI_NODE_TESTS_DISCOVERED=${tests.length}\n`);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...tests], {
  cwd: appRoot,
  env: process.env,
  stdio: "inherit"
});
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
