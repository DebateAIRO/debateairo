import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCustodiedSecretFile } from "../../apps/observation-agent/src/core/custody.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { readHatchetRest } from "../../apps/observation-agent/src/modules/hatchet-throughput/client.js";
import { readWorkerHeartbeat } from "../../apps/observation-agent/src/modules/stall-detectors/heartbeat.js";
import {
  loadMergedThresholdPolicy,
  thresholdPolicySchema
} from "../../apps/observation-agent/src/oactl/core/thresholds.js";

const DEFAULTS_DIRECTORY = "deploy/observation-agent/thresholds/defaults";
const NOT_LOOPBACK = "OBSERVATION_URL_NOT_LOOPBACK";
const CUSTODY_INVALID = "OBSERVATION_SECRET_CUSTODY_INVALID";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0)
    .map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-dl7-f1-"));
  scratchDirectories.push(path);
  return path;
}

async function targetsDirectory(restUrl: string): Promise<string> {
  const root = await scratch();
  const directory = join(root, "targets.dev.d");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "OBS-06.json"), `${JSON.stringify({
    schema_version: 1,
    targets: [{ component: "hatchet", kind: "hatchet_metrics", rest_url: restUrl }]
  })}\n`);
  return directory;
}

/** A 0700 directory holding a 0600 token file, the custody the loaders require. */
async function tokenFile(contents: string): Promise<string> {
  const root = await scratch();
  const custody = join(root, "dev-auth");
  await mkdir(custody, { mode: 0o700 });
  await chmod(custody, 0o700);
  const path = join(custody, "observation-agent-hatchet.token");
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

describe("DL7-F1 loopback pin on every URL-valued target and threshold", () => {
  it("refuses a non-loopback worker_list_url in a ratified threshold policy", async () => {
    const shipped = await loadMergedThresholdPolicy({ defaultsDirectory: DEFAULTS_DIRECTORY });
    expect(thresholdPolicySchema.safeParse(shipped).success).toBe(true);
    const stall = shipped.modules?.["stall-detectors"] ?? {};
    for (const hostile of ["https://example.org/w", "http://10.0.0.7:8888/worker"]) {
      const policy = {
        ...shipped,
        modules: { ...shipped.modules, "stall-detectors": { ...stall, worker_list_url: hostile } }
      };
      const parsed = thresholdPolicySchema.safeParse(policy);
      expect(parsed.success, hostile).toBe(false);
      expect(parsed.error?.issues.map((issue) => issue.message), hostile).toContain(NOT_LOOPBACK);
    }
  });

  it("refuses a non-loopback rest_url in a target fragment and accepts a loopback one", async () => {
    await expect(loadObservationTargetCatalog(
      await targetsDirectory("https://attacker.example/api/v1/tenants/main/queue-metrics")
    )).rejects.toThrow(NOT_LOOPBACK);
    const accepted = await loadObservationTargetCatalog(
      await targetsDirectory("http://127.0.0.1:8888/api/v1/tenants/main/queue-metrics")
    );
    expect(accepted.targets).toHaveLength(1);
  });

  it("refuses a non-loopback worker_list_url before the token is read or a request attempted", async () => {
    let fetches = 0;
    let tokenReads = 0;
    await expect(readWorkerHeartbeat({
      workerListUrl: "https://example.org/api/v1/tenants/main/worker",
      workerRef: "debateai-dev-runner",
      tokenPath: await tokenFile("tenant-token\n"),
      now: new Date("2026-09-18T10:00:00.000Z"),
      timeoutMs: 2_000,
      readToken: async () => { tokenReads += 1; return "tenant-token"; },
      fetch: async () => { fetches += 1; return new Response("{\"rows\":[]}"); }
    })).rejects.toThrow(NOT_LOOPBACK);
    expect(fetches).toBe(0);
    expect(tokenReads).toBe(0);

    const accepted = await readWorkerHeartbeat({
      workerListUrl: "http://127.0.0.1:8888/api/v1/tenants/main/worker",
      workerRef: "debateai-dev-runner",
      tokenPath: await tokenFile("tenant-token\n"),
      now: new Date("2026-09-18T10:00:00.000Z"),
      timeoutMs: 2_000,
      readToken: async () => { tokenReads += 1; return "tenant-token"; },
      fetch: async () => {
        fetches += 1;
        return new Response("{\"rows\":[]}", { headers: { "content-type": "application/json" } });
      }
    });
    expect(accepted.state).toBe("UNKNOWN");
    expect(fetches).toBe(1);
    expect(tokenReads).toBe(1);
  });

  it("refuses a non-loopback hatchet rest_url before any request is attempted", async () => {
    let fetches = 0;
    await expect(readHatchetRest({
      queueUrl: "https://attacker.example/api/v1/tenants/main/queue-metrics",
      tokenPath: await tokenFile("tenant-token\n"),
      timeoutMs: 2_000,
      fetcher: async () => { fetches += 1; return new Response("{}"); }
    })).rejects.toThrow(NOT_LOOPBACK);
    expect(fetches).toBe(0);
  });

  it("reads the Hatchet token through the custody loader, never a bare file read", async () => {
    const path = await tokenFile("tenant-token\n");
    await expect(readCustodiedSecretFile(path)).resolves.toBe("tenant-token\n");

    await chmod(path, 0o644);
    await expect(readCustodiedSecretFile(path)).rejects.toThrow(CUSTODY_INVALID);
    await chmod(path, 0o600);

    await chmod(join(path, ".."), 0o755);
    await expect(readCustodiedSecretFile(path)).rejects.toThrow(CUSTODY_INVALID);
  });

  it("refuses a world-readable Hatchet token file without contacting the loopback host", async () => {
    let fetches = 0;
    const path = await tokenFile("tenant-token\n");
    await chmod(path, 0o644);
    await expect(readHatchetRest({
      queueUrl: "http://127.0.0.1:8888/api/v1/tenants/main/queue-metrics",
      tokenPath: path,
      timeoutMs: 2_000,
      fetcher: async () => { fetches += 1; return new Response("{}"); }
    })).rejects.toThrow(CUSTODY_INVALID);
    expect(fetches).toBe(0);
  });
});
