import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateDevPostgresCompose } from "../../deploy/dev-auth/validate-compose-postgres.mjs";

describe("DEV-02 loopback-only development PostgreSQL", () => {
  it("publishes only 127.0.0.1:55432 and gates dependants on pg_isready", async () => {
    const source = await readFile("compose.dev.yaml", "utf8");
    expect(validateDevPostgresCompose(source)).toEqual({
      host: "127.0.0.1",
      hostPort: 55432,
      containerPort: 5432,
      healthCommand: "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"
    });
    expect(source).toContain("postgres-data:/var/lib/postgresql");
    expect(source).not.toContain("postgres-data:/var/lib/postgresql/data");
  });

  it("rejects absent, wildcard, and non-loopback PostgreSQL publications", async () => {
    const source = await readFile("compose.dev.yaml", "utf8");
    expect(() => validateDevPostgresCompose(
      source.replace('"127.0.0.1:55432:5432"', '"55432:5432"')
    )).toThrow("DEV_POSTGRES_LOOPBACK_PORT_REQUIRED");
    expect(() => validateDevPostgresCompose(
      source.replace('"127.0.0.1:55432:5432"', '"0.0.0.0:55432:5432"')
    )).toThrow("DEV_POSTGRES_LOOPBACK_PORT_REQUIRED");
    expect(() => validateDevPostgresCompose(
      source.replace('      - "127.0.0.1:55432:5432"\n', "")
    )).toThrow("DEV_POSTGRES_LOOPBACK_PORT_REQUIRED");
    for (const networkMode of ["host", '"host"', "'host'"]) {
      expect(() => validateDevPostgresCompose(
        source.replace("    image: postgres:", `    network_mode: ${networkMode}\n    image: postgres:`)
      )).toThrow("DEV_POSTGRES_LOOPBACK_PORT_REQUIRED");
    }
  });

  it("rejects missing health readiness or Hatchet startup before PostgreSQL is healthy", async () => {
    const source = await readFile("compose.dev.yaml", "utf8");
    expect(() => validateDevPostgresCompose(
      source.replace("pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB", "true")
    )).toThrow("DEV_POSTGRES_HEALTHCHECK_REQUIRED");
    expect(() => validateDevPostgresCompose(
      source.replace("condition: service_healthy", "condition: service_started")
    )).toThrow("DEV_POSTGRES_HEALTH_DEPENDENCY_REQUIRED");
  });

  it("runs hatchet-lite as a dedicated non-superuser role that owns its database (L7-F2)", async () => {
    const [source, initialisation] = await Promise.all([
      readFile("compose.dev.yaml", "utf8"),
      readFile("deploy/postgres/init-hatchet.sql", "utf8")
    ]);
    expect(initialisation).toContain("CREATE ROLE debateai_dev_hatchet");
    expect(initialisation).toContain("NOSUPERUSER");
    expect(initialisation).toContain("CREATE DATABASE hatchet OWNER debateai_dev_hatchet");
    // The password is interpolated by psql from the container environment, which
    // compose fills from the 0600 custody file. Never a literal in the repository.
    expect(initialisation).not.toMatch(/PASSWORD\s+'/iu);
    expect(initialisation).toContain("\\getenv");

    const databaseUrl = source.match(/^      DATABASE_URL: (.+)$/mu)?.[1];
    expect(databaseUrl).toContain("postgresql://debateai_dev_hatchet:");
    expect(databaseUrl).toContain("${HATCHET_DATABASE_PASSWORD:?");
    expect(databaseUrl).toContain("@postgres:5432/hatchet?sslmode=disable");
    // The bootstrap superuser must not travel to hatchet-lite.
    expect(source).not.toContain("postgresql://debateai:");
  });

  it("pins the postgres image by digest while keeping the ruled-major interpolation (L6-F14)", async () => {
    const source = await readFile("compose.dev.yaml", "utf8");
    const postgresImage = source.match(/^    image: (postgres:[^\n]+)$/m)?.[1];
    expect(postgresImage).toMatch(/^postgres:\$\{POSTGRES_MAJOR_VERSION:\?[^}]+\}@sha256:[0-9a-f]{64}$/);
    const images = [...source.matchAll(/^    image: ([^\n]+)$/gm)].map((match) => match[1]);
    expect(images).toHaveLength(3); // postgres, hatchet-lite, vllm
    for (const reference of images) expect(reference).toMatch(/@sha256:[0-9a-f]{64}$/);
    const digest = postgresImage!.match(/@(sha256:[0-9a-f]{64})$/)![1];
    expect(await readFile("deploy/IMAGE-PINS.md", "utf8")).toContain(digest);
  });
});
