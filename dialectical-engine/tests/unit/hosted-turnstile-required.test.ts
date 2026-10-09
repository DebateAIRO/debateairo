import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "@debateai/register";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/**
 * Auth API hardening (2026-10-09, item 6): a hosted API without the Turnstile
 * relay address cannot verify a single sign-up proof, so every sign-up would
 * fail closed with TURNSTILE_UNAVAILABLE — a silent outage. Hosted mode now
 * refuses to boot instead; local mode keeps the address optional.
 */
const hostedBase = Object.freeze({
  DEBATEAI_DEPLOYMENT_MODE: "hosted",
  GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
  TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt"
});

describe("hosted Turnstile relay address", () => {
  it("refuses a hosted boot without TURNSTILE_SOCKET_PATH, naming the missing setting", () => {
    expect(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), ...hostedBase }))
      .toThrow("TURNSTILE_SOCKET_PATH_REQUIRED");
  });

  it("boots hosted with the relay address present", () => {
    const environment = parseApiEnvironment({
      ...validApiEnvironmentFixture(), ...hostedBase,
      TURNSTILE_SOCKET_PATH: "/run/debateai-turnstile/siteverify.sock"
    });
    expect(environment.DEPLOYMENT_MODE).toBe("hosted");
    expect(environment.TURNSTILE_SOCKET_PATH).toBe("/run/debateai-turnstile/siteverify.sock");
  });

  it("keeps the relay address optional in local mode", () => {
    const environment = parseApiEnvironment(validApiEnvironmentFixture());
    expect(environment.DEPLOYMENT_MODE).toBe("local");
    expect(environment.TURNSTILE_SOCKET_PATH).toBeUndefined();
  });
});
