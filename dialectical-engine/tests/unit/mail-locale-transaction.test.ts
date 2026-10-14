import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { CatalogLocaleCodeSchema, LocaleCodeSchema } from "../../packages/contract/src/locale.js";
import {
  MAIL_LOCALE_SETTING,
  assertMailLocale,
  withMailLocale
} from "../../packages/db/src/mail-locale.js";

// A recording pool: every connect, statement, run step and release is one ordered event.
// A unit test has no database, so the pool and client are the one unavoidable fake here.
// failSql makes one statement reject, to exercise the failure path; releases records each release argument.
function recordingPool(failSql?: { sql: string; error: unknown }) {
  const events: string[] = [];
  const releases: unknown[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      events.push(params === undefined ? sql : `${sql} ${JSON.stringify(params)}`);
      if (failSql !== undefined && sql === failSql.sql) throw failSql.error;
      return { rows: [] };
    },
    release: (err?: unknown) => {
      releases.push(err);
      events.push(err === undefined ? "release" : "release(discard)");
    }
  };
  const pool = {
    connect: async () => {
      events.push("connect");
      return client;
    }
  };
  return { client, events, releases, pool: pool as unknown as Pool };
}

const CONTRACT_MAIL_LOCALES = [...CatalogLocaleCodeSchema.options, "en-US", "en-GB"];

describe("mail-locale values", () => {
  it("names the transaction setting debateai.mail_locale", () => {
    expect(MAIL_LOCALE_SETTING).toBe("debateai.mail_locale");
  });

  it("accepts exactly the 37 contract values (35 catalogue codes plus en-US and en-GB)", () => {
    expect(CatalogLocaleCodeSchema.options).toHaveLength(35);
    expect(CONTRACT_MAIL_LOCALES).toHaveLength(37);
    for (const value of CONTRACT_MAIL_LOCALES) {
      expect(LocaleCodeSchema.safeParse(value).success).toBe(true);
      expect(assertMailLocale(value)).toBe(value);
    }
  });

  it("accepts exactly the 37 among every value of the shape ll or ll-CC, so no added value of that shape passes", () => {
    // The contract's values are two lowercase letters, or two lowercase letters, a hyphen and two capitals.
    // Every value of that shape is checked, so the list is pinned with no exported set. Other shapes are
    // covered only by the sampled refusals above (UNVERIFIED beyond that sample).
    const LOWER = "abcdefghijklmnopqrstuvwxyz";
    const UPPER = LOWER.toUpperCase();
    const accepts = (value: string): boolean => {
      try {
        assertMailLocale(value);
        return true;
      } catch {
        return false;
      }
    };
    const accepted: string[] = [];
    for (const a of LOWER) {
      for (const b of LOWER) {
        const plain = `${a}${b}`;
        if (accepts(plain)) accepted.push(plain);
        for (const c of UPPER) {
          for (const d of UPPER) {
            const region = `${plain}-${c}${d}`;
            if (accepts(region)) accepted.push(region);
          }
        }
      }
    }
    expect(accepted.sort()).toEqual([...CONTRACT_MAIL_LOCALES].sort());
  });

  it("refuses any value outside the 37 with TypeError MAIL_LOCALE_INVALID", () => {
    for (const value of ["", "EN", "en_US", "en-AU", "de-AT", "pt-BR", " de", "de ", "xx", "auto"]) {
      expect(() => assertMailLocale(value)).toThrow(TypeError);
      expect(() => assertMailLocale(value)).toThrow("MAIL_LOCALE_INVALID");
    }
  });
});

describe("withMailLocale", () => {
  it("runs BEGIN, set_config with the checked value, the run on the same client, then COMMIT", async () => {
    const { client, events, pool } = recordingPool();
    let seenClient: unknown;
    const result = await withMailLocale(pool, "de", async (c) => {
      seenClient = c;
      events.push("run");
      return "done";
    });

    expect(result).toBe("done");
    expect(seenClient).toBe(client);
    expect(events).toEqual([
      "connect",
      "BEGIN",
      `SELECT set_config($1, $2, true) ${JSON.stringify([MAIL_LOCALE_SETTING, "de"])}`,
      "run",
      "COMMIT",
      "release"
    ]);
  });

  it("issues ROLLBACK, rethrows the same error and releases the client when the run throws", async () => {
    const { events, pool } = recordingPool();
    const boom = new Error("insert failed");

    await expect(
      withMailLocale(pool, "fr", async () => {
        events.push("run");
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(events).toEqual([
      "connect",
      "BEGIN",
      `SELECT set_config($1, $2, true) ${JSON.stringify([MAIL_LOCALE_SETTING, "fr"])}`,
      "run",
      "ROLLBACK",
      "release"
    ]);
  });

  it("when ROLLBACK itself rejects, rethrows the original error and releases the client as discarded", async () => {
    const rollbackError = new Error("connection terminated");
    const { events, releases, pool } = recordingPool({ sql: "ROLLBACK", error: rollbackError });
    const boom = new Error("insert failed");

    await expect(
      withMailLocale(pool, "fr", async () => {
        events.push("run");
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(events).toEqual([
      "connect",
      "BEGIN",
      `SELECT set_config($1, $2, true) ${JSON.stringify([MAIL_LOCALE_SETTING, "fr"])}`,
      "run",
      "ROLLBACK",
      "release(discard)"
    ]);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toBeTruthy();
  });

  it("when ROLLBACK rejects with a value that is not an Error, the client is still released as discarded", async () => {
    const { events, releases, pool } = recordingPool({ sql: "ROLLBACK", error: undefined });
    const boom = new Error("insert failed");

    await expect(
      withMailLocale(pool, "fr", async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(events[events.length - 1]).toBe("release(discard)");
    expect(releases).toHaveLength(1);
    expect(releases[0]).toBeTruthy();
  });

  it("refuses a value outside the 37 before it connects and runs nothing", async () => {
    const { events, pool } = recordingPool();
    let ran = false;

    await expect(
      withMailLocale(pool, "xx", async () => {
        ran = true;
      })
    ).rejects.toThrow("MAIL_LOCALE_INVALID");

    expect(events).toEqual([]);
    expect(ran).toBe(false);
  });
});
