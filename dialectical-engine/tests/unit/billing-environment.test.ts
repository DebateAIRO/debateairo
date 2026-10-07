// tests/unit/billing-environment.test.ts
import { describe, expect, it } from "vitest";
import {
  BILLING_ENVIRONMENT_KEYS,
  NETOPIA_ENVIRONMENT_KEYS,
  XMONEY_ENVIRONMENT_KEYS,
  parseApiEnvironment,
  readBillingEnvironmentGroup,
  readNetopiaEnvironmentGroup,
  readXMoneyEnvironmentGroup
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
const XMONEY: Readonly<Record<(typeof XMONEY_ENVIRONMENT_KEYS)[number], string>> = {
  XMONEY_PRIVATE_KEY_PATH: "/run/secrets/billing/xmoney-private-key",
  XMONEY_PUBLIC_KEY: "pk_stage_0123456789",
  XMONEY_SITE_ID: "4242",
  XMONEY_API_BASE_URL: "https://api-stage.xmoney.com"
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
    expect(environment.XMONEY_API_BASE_URL).toBeUndefined();
  });

  it("names ten keys, NETOPIA's four first; no xMoney key, no second public origin (R-7), no company CIF (R3-4)", () => {
    expect([...BILLING_ENVIRONMENT_KEYS]).toEqual([
      ...NETOPIA_ENVIRONMENT_KEYS, "QUADERNO_API_KEY_PATH", "QUADERNO_API_BASE_URL",
      "SMARTBILL_CREDENTIALS_PATH", "SMARTBILL_API_BASE_URL", "SMARTBILL_SERIES", "OWNER_REPORT_EMAIL_PATH"
    ]);
    expect([...NETOPIA_ENVIRONMENT_KEYS]).toEqual([
      "NETOPIA_API_BASE_URL", "NETOPIA_POS_SIGNATURE", "NETOPIA_API_KEY_PATH", "NETOPIA_IPN_KEYS_PATH"
    ]);
    for (const key of XMONEY_ENVIRONMENT_KEYS) expect(BILLING_ENVIRONMENT_KEYS).not.toContain(key);
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("SMARTBILL_COMPANY_CIF");
    const environment = parseApiEnvironment({
      ...validApiEnvironmentFixture(), PUBLIC_SITE_ORIGIN: "https://elsewhere.test", SMARTBILL_COMPANY_CIF: "RO1"
    });
    expect(Object.keys(environment)).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(Object.keys(environment)).not.toContain("SMARTBILL_COMPANY_CIF");
  });

  it("reads a complete group with no xMoney settings, trimming trailing slashes, the origin from PUBLIC_APP_URL", () => {
    expect(readBillingEnvironmentGroup(parsed({
      PUBLIC_APP_URL: "https://debateai.test/app/", NETOPIA_API_BASE_URL: "https://secure.netopia-payments.com/api/"
    }))).toEqual({
      ...NETOPIA_PART, netopiaApiBaseUrl: "https://secure.netopia-payments.com/api",
      quadernoApiKeyPath: BILLING.QUADERNO_API_KEY_PATH, quadernoApiBaseUrl: BILLING.QUADERNO_API_BASE_URL,
      smartbillCredentialsPath: BILLING.SMARTBILL_CREDENTIALS_PATH, smartbillApiBaseUrl: BILLING.SMARTBILL_API_BASE_URL,
      smartbillSeries: "DBT", ownerReportEmailPath: BILLING.OWNER_REPORT_EMAIL_PATH, publicAppUrl: "https://debateai.test",
      xmoney: null
    });
  });

  it("still reads xMoney's four settings when they are all set (until N23 removes them)", () => {
    expect(readBillingEnvironmentGroup(parsed(XMONEY)).xmoney).toEqual({
      xmoneyPrivateKeyPath: XMONEY.XMONEY_PRIVATE_KEY_PATH, xmoneyPublicKey: XMONEY.XMONEY_PUBLIC_KEY,
      xmoneySiteId: "4242", xmoneyApiBaseUrl: "https://api-stage.xmoney.com"
    });
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

  it("reads no xMoney group when none of its keys is set, and refuses one set only in part", () => {
    expect(readXMoneyEnvironmentGroup(parsed())).toBeNull();
    expect(() => readXMoneyEnvironmentGroup(parsed({ XMONEY_SITE_ID: "4242" })))
      .toThrow("BILLING_CONFIGURATION_INCOMPLETE:XMONEY_PRIVATE_KEY_PATH");
    for (const [key, value] of [
      ["XMONEY_API_BASE_URL", "http://api-stage.xmoney.com"],
      ["XMONEY_API_BASE_URL", "https://xmoney.example"],
      ["XMONEY_SITE_ID", "site-1"]
    ] as const) {
      expect(() => readXMoneyEnvironmentGroup(parsed({ ...XMONEY, [key]: value }))).toThrow(`BILLING_CONFIGURATION_INVALID:${key}`);
    }
  });
});
