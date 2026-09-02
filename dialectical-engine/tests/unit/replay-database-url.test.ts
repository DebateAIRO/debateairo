import { describe, expect, it } from "vitest";
import { replayCeremonyDatabaseUrl } from "../../apps/replay/src/database-url.js";

const REMOTE_PLAIN = "postgresql://replay:pw@db.internal:5432/debateai";
const REMOTE_VERIFIED =
  "postgresql://replay:pw@db.internal:5432/debateai?sslmode=verify-full&sslrootcert=/etc/debateai/db-ca.pem";
const LOOPBACK = "postgresql://replay:pw@127.0.0.1:5432/debateai";

describe("L5-F3 — the replay ceremony's argv database URL goes through the production floors", () => {
  it("refuses a remote production target without verified TLS", () => {
    expect(() => replayCeremonyDatabaseUrl(REMOTE_PLAIN, { NODE_ENV: "production" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:REPLAY_SELF_TEST_DATABASE_URL");
  });

  it("refuses a production target that downgrades verify-full via uselibpqcompat", () => {
    expect(() => replayCeremonyDatabaseUrl(`${REMOTE_VERIFIED}&uselibpqcompat=true`, { NODE_ENV: "production" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:REPLAY_SELF_TEST_DATABASE_URL");
  });

  it("accepts a remote production target that pins verify-full with a root certificate", () => {
    expect(replayCeremonyDatabaseUrl(REMOTE_VERIFIED, { NODE_ENV: "production" })).toBe(REMOTE_VERIFIED);
  });

  it("accepts a loopback target in production and leaves non-production untouched", () => {
    expect(replayCeremonyDatabaseUrl(LOOPBACK, { NODE_ENV: "production" })).toBe(LOOPBACK);
    expect(replayCeremonyDatabaseUrl(REMOTE_PLAIN, { NODE_ENV: "development" })).toBe(REMOTE_PLAIN);
    expect(replayCeremonyDatabaseUrl(REMOTE_PLAIN, {})).toBe(REMOTE_PLAIN);
  });

  it("refuses an argv value that is not a URL at all", () => {
    expect(() => replayCeremonyDatabaseUrl("not-a-url", { NODE_ENV: "production" })).toThrow();
  });
});
