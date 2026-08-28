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
});
