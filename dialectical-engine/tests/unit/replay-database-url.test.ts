import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReplaySelfTestEnvironment } from "@debateai/register";
import { replayCeremonyDatabaseUrl } from "../../apps/replay/src/database-url.js";

const REMOTE_PLAIN = "postgresql://replay:pw@db.internal:5432/debateai";
const REMOTE_VERIFIED =
  "postgresql://replay:pw@db.internal:5432/debateai?sslmode=verify-full&sslrootcert=/etc/debateai/db-ca.pem";
const LOOPBACK = "postgresql://replay:pw@127.0.0.1:5432/debateai";
const UNIX_SOCKET = "postgresql:///debateai?host=/var/run/postgresql";
const REFUSAL = "DATABASE_URL_TLS_REQUIRED:REPLAY_CEREMONY_DATABASE_URL";

afterEach(() => vi.unstubAllEnvs());

describe("L5-F3 — the replay ceremony floors its argv database URL without leaving its isolation", () => {
  it("refuses a remote target without verified TLS", () => {
    expect(() => replayCeremonyDatabaseUrl(REMOTE_PLAIN)).toThrow(REFUSAL);
  });

  it("refuses a target that downgrades verify-full via uselibpqcompat", () => {
    expect(() => replayCeremonyDatabaseUrl(`${REMOTE_VERIFIED}&uselibpqcompat=true`)).toThrow(REFUSAL);
  });

  it("accepts a remote target that pins verify-full with a root certificate", () => {
    expect(replayCeremonyDatabaseUrl(REMOTE_VERIFIED)).toBe(REMOTE_VERIFIED);
  });

  it("accepts loopback and unix-socket targets", () => {
    expect(replayCeremonyDatabaseUrl(LOOPBACK)).toBe(LOOPBACK);
    expect(replayCeremonyDatabaseUrl(UNIX_SOCKET)).toBe(UNIX_SOCKET);
  });

  // The ceremony reads the production database by definition, so the floor is not an
  // environment-dependent courtesy: nothing in the process environment can relax it.
  it("is unconditional: no NODE_ENV relaxes it and it takes no environment argument", () => {
    expect(replayCeremonyDatabaseUrl.length).toBe(1);
    for (const nodeEnvironment of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", nodeEnvironment);
      expect(() => replayCeremonyDatabaseUrl(REMOTE_PLAIN), nodeEnvironment).toThrow(REFUSAL);
    }
  });

  it("refuses an argv value that is not a URL with a typed code", () => {
    expect(() => replayCeremonyDatabaseUrl("not-a-url")).toThrow("REPLAY_CEREMONY_DATABASE_URL_INVALID");
  });

  // Two copies of one rule drift unless something holds them together. apps/replay may not
  // import the register (structural law), so the tie lives here, where both are importable.
  it("returns the register's production verdict for every probe URL", () => {
    const probes = [
      REMOTE_PLAIN, REMOTE_VERIFIED, LOOPBACK, UNIX_SOCKET,
      `${REMOTE_VERIFIED}&uselibpqcompat=true`,
      `${REMOTE_VERIFIED}&ssl=0`,
      `${REMOTE_VERIFIED}&ssl=false`,
      "postgresql://replay:pw@db.internal:5432/debateai?sslmode=require",
      "postgresql://replay:pw@db.internal:5432/debateai?sslmode=verify-full",
      "postgresql://replay:pw@db.internal:5432/debateai?sslmode=verify-full&sslrootcert=%20",
      "postgresql://replay:pw@db.internal:5432/debateai?sslmode=no-verify&sslrootcert=/ca.pem",
      "postgresql://replay:pw@localhost:5432/debateai",
      "postgresql://replay:pw@[::1]:5432/debateai",
      "postgresql://replay:pw@LOCALHOST:5432/debateai",
      "postgresql:///debateai?host=/var/run/postgresql,db.internal",
      "postgresql://replay:pw@/debateai?host=/var/run/postgresql"
    ];
    const accepts = (check: () => unknown): boolean => {
      try { check(); return true; } catch { return false; }
    };
    for (const url of probes) {
      const register = accepts(() => parseReplaySelfTestEnvironment({
        REPLAY_SELF_TEST_DATABASE_URL: url, NODE_ENV: "production"
      }));
      expect(accepts(() => replayCeremonyDatabaseUrl(url)), url).toBe(register);
    }
  });
});
