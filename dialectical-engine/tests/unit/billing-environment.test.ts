// tests/unit/billing-environment.test.ts
import { describe, expect, it } from "vitest";
import {
  BILLING_ENVIRONMENT_KEYS,
  NETOPIA_ENVIRONMENT_KEYS,
  RETIRED_BILLING_SETTINGS,
  parseApiEnvironment,
  readBillingEnvironmentGroup,
  readNetopiaEnvironmentGroup
} from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/** Made-up values (spec §2.2 rule 2): the POS signature is built from pieces. */
const POS = ["TEST", "AB12", "CD34", "EF56", "GH78"].join("-");
const BILLING: Readonly<Record<(typeof BILLING_ENVIRONMENT_KEYS)[number], string>> = {
  NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com",
  NETOPIA_POS_SIGNATURE: POS,
  NETOPIA_API_KEY_PATH: "/run/secrets/billing/netopia-api-key",
  NETOPIA_IPN_KEYS_PATH: "/run/secrets/billing/netopia-ipn-keys.pem",
  QUADERNO_API_KEY_PATH: "/run/secrets/billing/quaderno-api-key",
  QUADERNO_API_BASE_URL: "https://debateai.sandbox-quadernoapp.com/api",
  SMARTBILL_CREDENTIALS_PATH: "/run/secrets/billing/smartbill-credentials",
  SMARTBILL_API_BASE_URL: "https://ws.smartbill.ro/SBORO/api",
  SMARTBILL_SERIES: "DBT",
  OWNER_REPORT_EMAIL_PATH: "/run/secrets/billing/owner-report-email"
};
const parsed = (overrides: Readonly<Record<string, string | undefined>> = {}) =>
  parseApiEnvironment({ ...validApiEnvironmentFixture(), ...BILLING, ...overrides });

const NETOPIA_PART = {
  netopiaApiBaseUrl: "https://secure-sandbox.netopia-payments.com", netopiaPosSignature: POS,
  netopiaApiKeyPath: BILLING.NETOPIA_API_KEY_PATH, netopiaIpnKeysPath: BILLING.NETOPIA_IPN_KEYS_PATH
};

describe("N8 — the billing group of the API environment", () => {
  it("is optional in the shape: an environment without it still parses", () => {
    const environment = parseApiEnvironment(validApiEnvironmentFixture());
    expect(environment.NETOPIA_API_BASE_URL).toBeUndefined();
    expect(environment.NETOPIA_IPN_KEYS_PATH).toBeUndefined();
  });

  it("names ten keys, NETOPIA's four first; no removed key, no second public origin (R-7), no company CIF (R3-4)", () => {
    expect([...BILLING_ENVIRONMENT_KEYS]).toEqual([
      ...NETOPIA_ENVIRONMENT_KEYS, "QUADERNO_API_KEY_PATH", "QUADERNO_API_BASE_URL",
      "SMARTBILL_CREDENTIALS_PATH", "SMARTBILL_API_BASE_URL", "SMARTBILL_SERIES", "OWNER_REPORT_EMAIL_PATH"
    ]);
    expect([...NETOPIA_ENVIRONMENT_KEYS]).toEqual([
      "NETOPIA_API_BASE_URL", "NETOPIA_POS_SIGNATURE", "NETOPIA_API_KEY_PATH", "NETOPIA_IPN_KEYS_PATH"
    ]);
    for (const key of RETIRED_BILLING_SETTINGS) expect(BILLING_ENVIRONMENT_KEYS).not.toContain(key);
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("SMARTBILL_COMPANY_CIF");
    const environment = parseApiEnvironment({
      ...validApiEnvironmentFixture(), PUBLIC_SITE_ORIGIN: "https://elsewhere.test", SMARTBILL_COMPANY_CIF: "RO1"
    });
    expect(Object.keys(environment)).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(Object.keys(environment)).not.toContain("SMARTBILL_COMPANY_CIF");
  });

  it("reads a complete group, trimming trailing slashes, the origin from PUBLIC_APP_URL", () => {
    expect(readBillingEnvironmentGroup(parsed({
      PUBLIC_APP_URL: "https://debateai.test/app/", NETOPIA_API_BASE_URL: "https://secure.netopia-payments.com/api/"
    }))).toEqual({
      ...NETOPIA_PART, netopiaApiBaseUrl: "https://secure.netopia-payments.com/api",
      quadernoApiKeyPath: BILLING.QUADERNO_API_KEY_PATH, quadernoApiBaseUrl: BILLING.QUADERNO_API_BASE_URL,
      smartbillCredentialsPath: BILLING.SMARTBILL_CREDENTIALS_PATH, smartbillApiBaseUrl: BILLING.SMARTBILL_API_BASE_URL,
      smartbillSeries: "DBT", ownerReportEmailPath: BILLING.OWNER_REPORT_EMAIL_PATH, publicAppUrl: "https://debateai.test"
    });
  });

  it("drops a removed card-processor setting from the shape, so the group reads the same with it (spec §2.17.1)", () => {
    const removed = Object.fromEntries(RETIRED_BILLING_SETTINGS.map((key) => [key, "https://example.invalid/removed"]));
    const environment = parsed(removed);
    for (const key of RETIRED_BILLING_SETTINGS) expect(Object.keys(environment)).not.toContain(key);
    expect(readBillingEnvironmentGroup(environment)).toEqual(readBillingEnvironmentGroup(parsed()));
  });

  it.each(BILLING_ENVIRONMENT_KEYS.map((key) => [key]))("names %s when it is missing", (key) => {
    expect(() => readBillingEnvironmentGroup(parsed({ [key]: undefined })))
      .toThrow(`BILLING_CONFIGURATION_INCOMPLETE:${key}`);
  });

  it.each([
    ["NETOPIA_API_BASE_URL", "http://secure-sandbox.netopia-payments.com"],
    ["QUADERNO_API_BASE_URL", "http://debateai.quadernoapp.com/api"],
    ["SMARTBILL_API_BASE_URL", "http://ws.smartbill.ro/SBORO/api"],
    ["SMARTBILL_SERIES", "D B T"]
  ])("refuses %s = %s", (key, value) => {
    expect(() => readBillingEnvironmentGroup(parsed({ [key]: value }))).toThrow(`BILLING_CONFIGURATION_INVALID:${key}`);
  });

  it("reads NETOPIA's group alone (the provider-only mode), naming a missing key and refusing plain http", () => {
    expect(readNetopiaEnvironmentGroup(parsed({ PUBLIC_APP_URL: "https://debateai.test/" })))
      .toEqual({ ...NETOPIA_PART, publicAppUrl: "https://debateai.test" });
    for (const key of NETOPIA_ENVIRONMENT_KEYS) {
      expect(() => readNetopiaEnvironmentGroup(parsed({ [key]: undefined }))).toThrow(`BILLING_CONFIGURATION_INCOMPLETE:${key}`);
    }
    expect(() => readNetopiaEnvironmentGroup(parsed({ NETOPIA_API_BASE_URL: "http://secure.mobilpay.ro/pay" })))
      .toThrow("BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL");
  });
});
