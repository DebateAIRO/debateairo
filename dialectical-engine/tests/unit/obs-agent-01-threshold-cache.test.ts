import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservationError } from "../../apps/observation-agent/src/core/errors.js";
import {
  readBootThresholdPolicy,
  ThresholdPolicyCache
} from "../../apps/observation-agent/src/core/threshold-cache.js";
import {
  reloadThresholdPolicy,
  type RatifiedThresholdPolicy
} from "../../apps/observation-agent/src/oactl/core/thresholds.js";

const scratchDirectories: string[] = [];
const replacementBeforeOpen = vi.hoisted(() => ({
  path: null as string | null,
  replacement: null as string | null
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    async open(...args: Parameters<typeof actual.open>) {
      const [path] = args;
      if (replacementBeforeOpen.path !== null
        && path === replacementBeforeOpen.path
        && replacementBeforeOpen.replacement !== null) {
        const replacement = replacementBeforeOpen.replacement;
        replacementBeforeOpen.path = null;
        replacementBeforeOpen.replacement = null;
        await actual.rename(path, `${String(path)}.checked`);
        await actual.rename(replacement, path);
      }
      return actual.open(...args);
    }
  };
});

afterEach(async () => {
  replacementBeforeOpen.path = null;
  replacementBeforeOpen.replacement = null;
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-threshold-cache-"));
  scratchDirectories.push(path);
  return path;
}

const POLICY = {
  schema_version: 1,
  liveness: {
    probe_interval_ms: 5_000,
    probe_timeout_ms: 2_000,
    open_after_failures: 2,
    clear_after_successes: 2
  },
  notification: {
    rate_limit_ms: 600_000,
    degraded_after_ms: 900_000,
    timeout_ms: 2_000
  },
  resources: {
    cpu_percent_max: 2,
    rss_mb_max: 150,
    max_database_sessions: 2,
    statement_timeout_ms: 2_000
  },
  routing: {
    INFRA_DOWN: "FATAL",
    INFRA_NOT_READY: "DEGRADED",
    INFRA_UNKNOWN: "SEVERE",
    AGENT_SELF: "SEVERE"
  }
} as const;

function ratified(version: number): RatifiedThresholdPolicy {
  return Object.freeze({
    version,
    value: POLICY,
    sourceRef: `OBS-01-v${version}`,
    ratifiedBy: "V",
    appliedAt: new Date(`2026-09-0${version}T09:00:00.000Z`)
  });
}

function unavailable(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

async function seedRaw(stateDir: string, value: string, mode = 0o600): Promise<string> {
  const directory = join(stateDir, "thresholds");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "last-ratified.json");
  await writeFile(path, value, { mode });
  await chmod(path, mode);
  return path;
}

describe("OBS-01 strict last-ratified threshold cache", () => {
  it("prefers a successful database read and atomically replaces the 0600 cache", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    await cache.write(ratified(1));

    const current = ratified(2);
    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { return current; } },
      cache
    })).resolves.toEqual({ policy: current, source: "DATABASE" });

    const directory = join(stateDir, "thresholds");
    const path = join(directory, "last-ratified.json");
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual(["last-ratified.json"]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      ...current,
      appliedAt: "2026-09-02T09:00:00.000Z"
    });
    await expect(cache.read()).resolves.toEqual(current);
  });

  it("falls back to the exact cached policy only for classified database unavailability", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    const cached = ratified(1);
    await cache.write(cached);
    const before = await readFile(join(stateDir, "thresholds", "last-ratified.json"));

    for (const code of ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "08006", "57P01", "57P03"]) {
      await expect(readBootThresholdPolicy({
        repository: { async readCurrent() { throw unavailable(code); } },
        cache
      })).resolves.toEqual({ policy: cached, source: "LAST_RATIFIED_CACHE" });
    }
    expect(await readFile(join(stateDir, "thresholds", "last-ratified.json"))).toEqual(before);
  });

  it("replaces the cache after every successful database reload", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    const previous = ratified(1);
    const current = ratified(2);
    await cache.write(previous);

    await expect(reloadThresholdPolicy(
      { async readCurrent() { return current; } },
      previous,
      (policy) => cache.write(policy)
    )).resolves.toEqual(current);
    await expect(cache.read()).resolves.toEqual(current);
  });

  it("propagates reachable validation failures even when a valid cache exists", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    await cache.write(ratified(1));

    await expect(readBootThresholdPolicy({
      repository: {
        async readCurrent(): Promise<RatifiedThresholdPolicy> {
          throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID");
        }
      },
      cache
    })).rejects.toThrow("OBSERVATION_THRESHOLDS_INVALID");
  });

  it("rejects a missing, malformed, unknown-field, wrongly permissioned, or symlink cache", async () => {
    const cases: ReadonlyArray<Readonly<{
      name: string;
      arrange(stateDir: string): Promise<ThresholdPolicyCache>;
    }>> = [
      {
        name: "missing",
        async arrange(stateDir) { return new ThresholdPolicyCache(stateDir); }
      },
      {
        name: "bad JSON",
        async arrange(stateDir) {
          await seedRaw(stateDir, "{not-json\n");
          return new ThresholdPolicyCache(stateDir);
        }
      },
      {
        name: "unknown field",
        async arrange(stateDir) {
          await seedRaw(stateDir, JSON.stringify({
            ...ratified(1), appliedAt: ratified(1).appliedAt.toISOString(), unexpected: true
          }));
          return new ThresholdPolicyCache(stateDir);
        }
      },
      {
        name: "mode 0644",
        async arrange(stateDir) {
          await seedRaw(stateDir, JSON.stringify({
            ...ratified(1), appliedAt: ratified(1).appliedAt.toISOString()
          }), 0o644);
          return new ThresholdPolicyCache(stateDir);
        }
      },
      {
        name: "symlink",
        async arrange(stateDir) {
          const directory = join(stateDir, "thresholds");
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const target = join(stateDir, "target.json");
          await writeFile(target, JSON.stringify({
            ...ratified(1), appliedAt: ratified(1).appliedAt.toISOString()
          }), { mode: 0o600 });
          await symlink(target, join(directory, "last-ratified.json"));
          return new ThresholdPolicyCache(stateDir);
        }
      }
    ];

    for (const testCase of cases) {
      const stateDir = await scratch();
      const cache = await testCase.arrange(stateDir);
      await expect(readBootThresholdPolicy({
        repository: { async readCurrent() { throw unavailable("ECONNREFUSED"); } },
        cache
      }), testCase.name).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
    }
  });

  it("rejects a cache whose owner is not the expected uid", async () => {
    const stateDir = await scratch();
    const writer = new ThresholdPolicyCache(stateDir);
    await writer.write(ratified(1));
    const metadata = await lstat(join(stateDir, "thresholds", "last-ratified.json"));
    const wrongOwnerReader = new ThresholdPolicyCache(stateDir, metadata.uid + 1);

    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { throw unavailable("ECONNREFUSED"); } },
      cache: wrongOwnerReader
    })).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
  });

  it("rejects a symlinked thresholds directory", async () => {
    const stateDir = await scratch();
    const outside = join(stateDir, "outside");
    await mkdir(outside, { mode: 0o700 });
    await writeFile(join(outside, "last-ratified.json"), JSON.stringify({
      ...ratified(1), appliedAt: ratified(1).appliedAt.toISOString()
    }), { mode: 0o600 });
    await symlink(outside, join(stateDir, "thresholds"), "dir");

    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { throw unavailable("ECONNREFUSED"); } },
      cache: new ThresholdPolicyCache(stateDir)
    })).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
  });

  it("rejects an existing thresholds directory whose mode is not 0700", async () => {
    const stateDir = await scratch();
    await seedRaw(stateDir, JSON.stringify({
      ...ratified(1), appliedAt: ratified(1).appliedAt.toISOString()
    }));
    await chmod(join(stateDir, "thresholds"), 0o755);

    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { throw unavailable("ECONNREFUSED"); } },
      cache: new ThresholdPolicyCache(stateDir)
    })).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
  });

  it("rejects directories not owned by the expected uid before writing", async () => {
    const stateDir = await scratch();
    const metadata = await lstat(stateDir);
    await mkdir(join(stateDir, "thresholds"), { mode: 0o700 });

    await expect(new ThresholdPolicyCache(stateDir, metadata.uid + 1)
      .write(ratified(1))).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
  });

  it("rejects a regular cache file replaced between lstat and open", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    await cache.write(ratified(1));
    const cachePath = join(stateDir, "thresholds", "last-ratified.json");
    const replacementPath = join(stateDir, "replacement.json");
    await writeFile(replacementPath, JSON.stringify({
      ...ratified(2), appliedAt: ratified(2).appliedAt.toISOString()
    }), { mode: 0o600 });
    replacementBeforeOpen.path = cachePath;
    replacementBeforeOpen.replacement = replacementPath;

    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { throw unavailable("ECONNREFUSED"); } },
      cache
    })).rejects.toThrow("OBSERVATION_THRESHOLDS_CACHE_INVALID");
  });

  it("does not fall back for unclassified database errors", async () => {
    const stateDir = await scratch();
    const cache = new ThresholdPolicyCache(stateDir);
    await cache.write(ratified(1));

    await expect(readBootThresholdPolicy({
      repository: { async readCurrent() { throw unavailable("23514"); } },
      cache
    })).rejects.toMatchObject({ code: "23514" });
  });
});
