import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { developmentReleaseKey } from "../../packages/kernel/src/release-key.js";
import { parseApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/**
 * Side-by-side uploads spec 2026-10-21 §1 (plan C task C1; INTERFACE "RELEASE_KEY", "Journal lines"): the API boots only
 * with the key of the release it is, checked by the one shared check (checkedReleaseKey, plan B2), and once it listens it
 * names that key in its ready line, `DEBATEAI_API_READY {"releaseKey":…,"port":…}`, exactly once.
 */
// The code parts are kept apart from the key name, so no line pairs a *_KEY name with a literal (gitleaks).
const DEVELOPMENT = "000000000000";
const CODE = "0123456789ab";

/** The hosted keys an API needs besides the mode (the same set v9-deployment-mode.test.ts uses). */
const HOSTED = Object.freeze({
  DEBATEAI_DEPLOYMENT_MODE: "hosted",
  GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
  TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt",
  TURNSTILE_SOCKET_PATH: "/run/debateai-turnstile/siteverify.sock"
});

/** The `code` of what `fn` throws; undefined when it returns. */
function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
}

function apiWith(overrides: Readonly<Record<string, string | undefined>>) {
  return parseApiEnvironment({ ...validApiEnvironmentFixture(), REGISTER_VERSION: "1", ...overrides });
}

describe("the API's release key at boot (side-by-side §1, plan C1)", () => {
  it("refuses an absent key as RELEASE_KEY_REQUIRED", () => {
    expect(codeOf(() => apiWith({ RELEASE_KEY: undefined }))).toBe("RELEASE_KEY_REQUIRED");
  });

  it("refuses an upper-case key, a short code part and legacy as RELEASE_KEY_INVALID", () => {
    for (const raw of [`R1-${DEVELOPMENT}`, `r1-${DEVELOPMENT.slice(1)}`, "legacy"]) {
      expect(codeOf(() => apiWith({ RELEASE_KEY: raw }))).toBe("RELEASE_KEY_INVALID");
    }
  });

  it("refuses a key whose number is not REGISTER_VERSION as RELEASE_KEY_REGISTER_MISMATCH", () => {
    expect(codeOf(() => apiWith({ RELEASE_KEY: `r2-${DEVELOPMENT}` }))).toBe("RELEASE_KEY_REGISTER_MISMATCH");
  });

  it("accepts a development key locally and carries it in the settings", () => {
    expect(apiWith({ RELEASE_KEY: `r1-${DEVELOPMENT}` }).RELEASE_KEY).toBe(`r1-${DEVELOPMENT}`);
  });

  it("refuses a development key on the hosted site and accepts a real code part there", () => {
    expect(codeOf(() => apiWith({ ...HOSTED, RELEASE_KEY: `r1-${DEVELOPMENT}` }))).toBe("RELEASE_KEY_INVALID");
    expect(apiWith({ ...HOSTED, RELEASE_KEY: `r1-${CODE}` }).RELEASE_KEY).toBe(`r1-${CODE}`);
  });

  it("the ask application refuses a key whose number is not its register version (RELEASE_KEY_REGISTER_MISMATCH)", () => {
    // Four distinct stand-ins: the constructor refuses shared pools before it reads any of them.
    const build = (releaseKey: string, registerVersion: number) => new PostgresAskApplication(
      {} as never, {} as never, { releaseKey, registerVersion } as unknown as RunCreationSettings, undefined, {} as never,
      { server: {} as never, legacy: {} as never }
    );
    expect(codeOf(() => build(`r2-${DEVELOPMENT}`, 1))).toBe("RELEASE_KEY_REGISTER_MISMATCH");
    expect(codeOf(() => build(`r1-${CODE}`, 17))).toBe("RELEASE_KEY_REGISTER_MISMATCH");
    expect(codeOf(() => build(`r17-${CODE}`, 17))).toBeUndefined();
    expect(codeOf(() => build("legacy", 17))).toBe("RELEASE_KEY_INVALID");
  });

  it("a development launcher runs as r<REGISTER_VERSION>-000000000000", () => {
    expect(developmentReleaseKey(17)).toBe(`r17-${DEVELOPMENT}`);
  });

  it("main.ts prints DEBATEAI_API_READY exactly once, after it listens", () => {
    const source = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const first = source.indexOf("DEBATEAI_API_READY");
    expect(first).toBeGreaterThan(-1);
    expect(source.indexOf("DEBATEAI_API_READY", first + 1)).toBe(-1);
    const listen = source.indexOf('startup.run("listen"');
    expect(listen).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(listen);
    expect(source).toContain(
      "console.info(`DEBATEAI_API_READY ${JSON.stringify({ releaseKey: environment.RELEASE_KEY, port: environment.API_PORT })}`)"
    );
  });
});
