// tests/unit/obs-agent-dl7-f9-oactl.test.ts
// DL7-F9, the command half. `oactl thresholds apply` used to open its pool with the DAEMON's
// OBSERVATION_DATABASE_URL — the credential that must not be able to re-rule its own monitor.
// It now reads a separate, custody-checked credential file for the threshold operator
// principal (migration 0071), and `oactl provision` mints both. No database is needed: every
// case here must refuse, or write files, before a connection is ever opened.
import { createServer, type Server } from "node:net";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const engineRoot = resolve(import.meta.dirname, "../..");
const scratchDirectories: string[] = [];
const originalCustodyRoot = process.env.DEBATEAI_DEV_CUSTODY_ROOT;

afterEach(async () => {
  if (originalCustodyRoot === undefined) delete process.env.DEBATEAI_DEV_CUSTODY_ROOT;
  else process.env.DEBATEAI_DEV_CUSTODY_ROOT = originalCustodyRoot;
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function custodyRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-dl7-f9-"));
  scratchDirectories.push(path);
  await chmod(path, 0o700);
  process.env.DEBATEAI_DEV_CUSTODY_ROOT = path;
  return path;
}

const DAEMON_ENV = [
  "OBSERVATION_DATABASE_URL='postgresql://debateai_observation_agent:daemon-secret@127.0.0.1:55432/debateai'",
  "OBSERVATION_STATE_DIR='/tmp/obs-dl7-f9-state'",
  "OBSERVATION_TARGETS_PATH='/tmp/obs-dl7-f9-targets'",
  "OBSERVATION_HATCHET_TOKEN_PATH='/tmp/obs-dl7-f9-token'"
].join("\n") + "\n";

const OPERATOR_URL =
  "postgresql://debateai_observation_threshold_operator:operator-secret@127.0.0.1:55432/debateai";

async function runApply(): Promise<Readonly<{ code: number; stderr: string[] }>> {
  const { runOactl } = await import("../../apps/observation-agent/src/oactl/core/commands.js");
  const stderr: string[] = [];
  const code = await runOactl(
    ["thresholds", "apply", "deploy/observation-agent/thresholds/drill-connections-20pct.json",
      "--source-ref", "DL7-F9"],
    { stdout: () => undefined, stderr: (value) => { stderr.push(value); } },
    { repoRoot: engineRoot, home: tmpdir(), uid: process.getuid!(), execute: async () => undefined }
  );
  return { code, stderr };
}

describe("DL7-F9: `oactl thresholds apply` never uses the daemon's credential", () => {
  it("refuses before any connection when only the daemon's env file exists", async () => {
    const root = await custodyRoot();
    await writeFile(join(root, "observation-agent.env"), DAEMON_ENV, { mode: 0o600 });
    await expect(runApply()).resolves.toEqual({
      code: 2,
      stderr: ["OBSERVATION_THRESHOLD_OPERATOR_ENV_INVALID"]
    });
  });

  it("connects with the OPERATOR's URL, never the daemon's (two listeners, one per credential)", async () => {
    // No database: each credential points at its own loopback listener, which records the
    // connection and hangs up. Whichever listener is reached is the credential `apply` used.
    const hits = { daemon: 0, operator: 0 };
    const listen = (name: keyof typeof hits): Promise<Readonly<{ server: Server; port: number }>> =>
      new Promise((resolvePromise) => {
        const server = createServer((socket) => { hits[name] += 1; socket.destroy(); });
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolvePromise({ server, port: typeof address === "object" && address !== null ? address.port : 0 });
        });
      });
    const daemon = await listen("daemon");
    const operator = await listen("operator");
    try {
      const root = await custodyRoot();
      await writeFile(join(root, "observation-agent.env"), DAEMON_ENV.replace(":55432/", `:${daemon.port}/`), { mode: 0o600 });
      await writeFile(
        join(root, "observation-threshold-operator.env"),
        `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='${OPERATOR_URL.replace(":55432/", `:${operator.port}/`)}'\n`,
        { mode: 0o600 }
      );
      const result = await runApply();
      expect(result.code).toBe(2);
      expect(hits).toEqual({ daemon: 0, operator: 1 });
    } finally {
      await new Promise((resolvePromise) => daemon.server.close(resolvePromise));
      await new Promise((resolvePromise) => operator.server.close(resolvePromise));
    }
  });

  it("reads exactly one key, from a private file, for the operator principal only", async () => {
    const root = await custodyRoot();
    const { readThresholdOperatorDatabaseUrl } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
    );
    const path = join(root, "observation-threshold-operator.env");
    await writeFile(path, `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='${OPERATOR_URL}'\n`, { mode: 0o600 });
    await expect(readThresholdOperatorDatabaseUrl(engineRoot)).resolves.toBe(OPERATOR_URL);

    const refusals: Array<readonly [string, () => Promise<void>]> = [
      ["group-readable file", async () => { await chmod(path, 0o640); }],
      ["a second key", async () => {
        await writeFile(path, `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='${OPERATOR_URL}'\nOBSERVATION_DATABASE_URL='${OPERATOR_URL}'\n`, { mode: 0o600 });
      }],
      ["the daemon's principal", async () => {
        await writeFile(path, "OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='postgresql://debateai_observation_agent:x@127.0.0.1:55432/debateai'\n", { mode: 0o600 });
      }],
      ["a symlink", async () => {
        await rm(path);
        const target = join(root, "elsewhere.env");
        await writeFile(target, `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='${OPERATOR_URL}'\n`, { mode: 0o600 });
        await symlink(target, path);
      }]
    ];
    for (const [name, arrange] of refusals) {
      await rm(path, { force: true });
      await writeFile(path, `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='${OPERATOR_URL}'\n`, { mode: 0o600 });
      await arrange();
      await expect(readThresholdOperatorDatabaseUrl(engineRoot), name)
        .rejects.toMatchObject({ code: "OBSERVATION_THRESHOLD_OPERATOR_ENV_INVALID" });
    }
  });

  it("`oactl provision` mints both credentials, distinct, each in its own 0600 file", async () => {
    const root = await custodyRoot();
    const home = await mkdtemp(join(tmpdir(), "obs-dl7-f9-home-"));
    scratchDirectories.push(home);
    const { provisionObservationAgent } = await import(
      "../../apps/observation-agent/src/oactl/core/provision.js"
    );
    const passwords = ["agent-secret-1", "operator-secret-2"];
    const applied: Array<readonly [string, string]> = [];
    const result = await provisionObservationAgent({
      repoRoot: engineRoot,
      home,
      passwordFactory: () => passwords.shift()!,
      setRolePassword: async (password, role) => { applied.push([role ?? "", password]); }
    });
    expect(applied).toEqual([
      ["debateai_observation_agent", "agent-secret-1"],
      ["debateai_observation_threshold_operator", "operator-secret-2"]
    ]);
    expect(result.operatorEnvironmentPath).toBe(join(root, "observation-threshold-operator.env"));
    expect(JSON.stringify(result)).not.toMatch(/secret-[12]/u);
    const daemon = await readFile(result.environmentPath, "utf8");
    const operator = await readFile(result.operatorEnvironmentPath, "utf8");
    expect(daemon).not.toContain("operator-secret-2");
    expect(daemon).not.toContain("debateai_observation_threshold_operator");
    expect(operator.trim().split("\n")).toHaveLength(1);
    expect(operator).toMatch(/^OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL='postgresql:\/\/debateai_observation_threshold_operator:operator-secret-2@/u);
    expect((await stat(result.operatorEnvironmentPath)).mode & 0o777).toBe(0o600);
    const { readThresholdOperatorDatabaseUrl } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
    );
    await expect(readThresholdOperatorDatabaseUrl(engineRoot)).resolves.toMatch(
      /^postgresql:\/\/debateai_observation_threshold_operator:operator-secret-2@/u
    );
  });
});
