// The proof L7-F2 asked for, finished under owner ruling V-21(a) on 2026-09-22.
//
// `compose.dev.yaml` used to give `POSTGRES_PASSWORD` a fixed value in the tracked file, on a
// published loopback port. Any other process or uid on the workstation could read the identity
// tables, rewrite the audit chain, weaken the sealed register, and create roles — and
// hatchet-lite, an engine that is internet-facing by default, held the same credential. The
// role split landed first (`debateai_dev_hatchet`, NOSUPERUSER); this row retires the literal
// itself: the superuser password is now generated once into the 0600 custody file that already
// feeds compose, so the repository carries no service credential at all.
//
// This file must never spell the retired value either — it assembles it below — or the sweep
// would report itself. That is not pedantry: it is the difference between a guard and a copy.
//
// `pnpm dev:auth:up` stays a no-argument command: the data plane generates the file before
// it starts compose, and reads the same file when it builds the migrator URL.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_COMPOSE_SECRET_KEYS } from "../../deploy/dev-auth/compose-secrets.mjs";
import { developmentMigratorDatabaseUrl } from "../../apps/runner/src/dev-auth-data-plane.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const GIT_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: REPOSITORY_ROOT,
  encoding: "utf8"
}).trim();
const TRACKED = execFileSync("git", ["ls-files", "-z"], { cwd: GIT_ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const RETIRED_SUPERUSER_PASSWORD = ["debateai", "dev", "only"].join("-");

// The written records of this very finding quote the retired literal as evidence, and the
// secret scanner's allowlist must keep naming it while they do. Everything else that git
// tracks is swept, so no shipped file can carry it again.
const WRITTEN_RECORDS = [
  "dialectical-engine/docs/",
  "dialectical-engine/.hermes/",
  ".gitleaks.toml"
];

describe("development compose credentials (L7-F2, V-21a)", () => {
  it("carries the retired dev superuser password in no tracked file that ships", async () => {
    expect(TRACKED.length, "tracked files").toBeGreaterThan(1_000);
    const swept = TRACKED.filter((path) =>
      !WRITTEN_RECORDS.some((prefix) => path.startsWith(prefix)));
    expect(swept.length, "files actually swept").toBeGreaterThan(500);
    const offenders: string[] = [];
    for (const path of swept) {
      const text = await readFile(join(GIT_ROOT, path), "utf8").catch(() => "");
      if (text.includes(RETIRED_SUPERUSER_PASSWORD)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("interpolates the superuser password from the custody file, never inline", async () => {
    const source = await readFile(join(REPOSITORY_ROOT, "compose.dev.yaml"), "utf8");
    const password = source.match(/^      POSTGRES_PASSWORD: (.+)$/mu)?.[1];
    // The `:?` form is what makes a bare `docker compose up` refuse rather than boot with a
    // default: compose has no value for it unless the custody env-file is passed.
    expect(password).toMatch(/^\$\{POSTGRES_SUPERUSER_PASSWORD:\?[^}]+\}$/u);
    expect(source).toContain("POSTGRES_USER: debateai");
    // The superuser still never travels to hatchet-lite.
    expect(source).not.toContain("postgresql://debateai:");
  });

  it("generates the superuser password as one of the custody compose secrets", () => {
    expect([...DEVELOPMENT_COMPOSE_SECRET_KEYS]).toContain("POSTGRES_SUPERUSER_PASSWORD");
  });

  it("builds the local migrator URL from a supplied password, encoding it for the URL", () => {
    expect(developmentMigratorDatabaseUrl("s3cret-value_A"))
      .toBe("postgresql://debateai:s3cret-value_A@127.0.0.1:55432/debateai");
    // A password is opaque material, not a URL fragment: reserved characters must not be
    // able to re-point the connection at another host or database.
    expect(developmentMigratorDatabaseUrl("a@b/c?d#e"))
      .toBe("postgresql://debateai:a%40b%2Fc%3Fd%23e@127.0.0.1:55432/debateai");
    expect(() => developmentMigratorDatabaseUrl("")).toThrow("DEV_AUTH_DATA_PLANE_SECRET_FAILED");
  });
});
