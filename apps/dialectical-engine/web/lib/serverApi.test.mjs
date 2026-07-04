import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-server-api-test");
const originalTimeout = process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS;
const originalCoordinatorUrl = process.env.DIALECTICAL_COORDINATOR_URL;

function compileHelper() {
  rmSync(outDir, { recursive: true, force: true });
  const tscCommand =
    process.platform === "win32"
      ? join(process.cwd(), "node_modules", ".bin", "tsc.cmd")
      : join(process.cwd(), "node_modules", ".bin", "tsc");
  const tscArgs = [
    "lib/serverApi.ts",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--rootDir",
    ".",
    "--outDir",
    outDir,
    "--skipLibCheck",
    "--strict",
  ];

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", tscCommand, ...tscArgs], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync(tscCommand, tscArgs, { cwd: process.cwd(), stdio: "pipe" });
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  restoreEnv();
});

beforeEach(() => {
  delete globalThis.fetch;
  process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS = "20";
  process.env.DIALECTICAL_COORDINATOR_URL = "http://127.0.0.1:65535";
});

function restoreEnv() {
  if (originalTimeout === undefined) {
    delete process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS;
  } else {
    process.env.DIALECTICAL_SERVER_FETCH_TIMEOUT_MS = originalTimeout;
  }

  if (originalCoordinatorUrl === undefined) {
    delete process.env.DIALECTICAL_COORDINATOR_URL;
  } else {
    process.env.DIALECTICAL_COORDINATOR_URL = originalCoordinatorUrl;
  }
}

async function loadHelper() {
  compileHelper();
  const moduleUrl = pathToFileURL(join(outDir, "lib", "serverApi.js")).href;
  return import(`${moduleUrl}?cacheBust=${Date.now()}`);
}

test("listDebatesServer times out instead of hanging on an unresponsive coordinator", async () => {
  globalThis.fetch = () => new Promise(() => {});
  const { listDebatesServer } = await loadHelper();

  await assert.rejects(
    Promise.race([
      listDebatesServer(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("test timed out before server API did")), 200)),
    ]),
    /timed out after 20ms/,
  );
});
