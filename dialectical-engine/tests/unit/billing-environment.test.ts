// tests/unit/billing-environment.test.ts
import { describe, expect, it } from "vitest";
import {
  BILLING_ENVIRONMENT_KEYS,
  parseApiEnvironment,
  readBillingEnvironmentGroup
} from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

const BILLING: Readonly<Record<(typeof BILLING_ENVIRONMENT_KEYS)[number], string>> = {
  XMONEY_PRIVATE_KEY_PATH: "/run/secrets/billing/xmoney-private-key",
  XMONEY_PUBLIC_KEY: "pk_stage_0123456789",
  XMONEY_SITE_ID: "4242",
  XMONEY_API_BASE_URL: "https://api-stage.xmoney.com",
  QUADERNO_API_KEY_PATH: "/run/secrets/billing/quaderno-api-key",
  QUADERNO_API_BASE_URL: "https://debateai.sandbox-quadernoapp.com/api",
  SMARTBILL_CREDENTIALS_PATH: "/run/secrets/billing/smartbill-credentials",
  SMARTBILL_API_BASE_URL: "https://ws.smartbill.ro/SBORO/api",
  SMARTBILL_SERIES: "DBT",
  OWNER_REPORT_EMAIL_PATH: "/run/secrets/billing/owner-report-email"
};
const parsed = (overrides: Readonly<Record<string, string | undefined>> = {}) =>
  parseApiEnvironment({ ...validApiEnvironmentFixture(), ...BILLING, ...overrides });

describe("P6a — the billing group of the API environment", () => {
  it("is optional in the shape: an environment without it still parses", () => {
    const environment = parseApiEnvironment(validApiEnvironmentFixture());
    expect(environment.XMONEY_API_BASE_URL).toBeUndefined();
  });

  it("names ten keys, no second public origin (R-7) and no company CIF (RULINGS-R3 R3-4: it comes from COMPANY)", () => {
    expect(BILLING_ENVIRONMENT_KEYS).toHaveLength(10);
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(BILLING_ENVIRONMENT_KEYS).not.toContain("SMARTBILL_COMPANY_CIF");
    // The shape reads only its own keys, so a stray PUBLIC_SITE_ORIGIN or SMARTBILL_COMPANY_CIF in api.env is never read.
    const environment = parseApiEnvironment({
      ...validApiEnvironmentFixture(), PUBLIC_SITE_ORIGIN: "https://elsewhere.test", SMARTBILL_COMPANY_CIF: "RO1"
    });
    expect(Object.keys(environment)).not.toContain("PUBLIC_SITE_ORIGIN");
    expect(Object.keys(environment)).not.toContain("SMARTBILL_COMPANY_CIF");
  });

  it("reads a complete group, the public origin from PUBLIC_APP_URL", () => {
    expect(readBillingEnvironmentGroup(parsed({ PUBLIC_APP_URL: "https://debateai.test/app/" }))).toEqual({
      xmoneyPrivateKeyPath: BILLING.XMONEY_PRIVATE_KEY_PATH, xmoneyPublicKey: BILLING.XMONEY_PUBLIC_KEY,
      xmoneySiteId: "4242", xmoneyApiBaseUrl: "https://api-stage.xmoney.com",
      quadernoApiKeyPath: BILLING.QUADERNO_API_KEY_PATH, quadernoApiBaseUrl: BILLING.QUADERNO_API_BASE_URL,
      smartbillCredentialsPath: BILLING.SMARTBILL_CREDENTIALS_PATH, smartbillApiBaseUrl: BILLING.SMARTBILL_API_BASE_URL,
      smartbillSeries: "DBT",
      ownerReportEmailPath: BILLING.OWNER_REPORT_EMAIL_PATH, publicAppUrl: "https://debateai.test"
    });
  });

  it.each(BILLING_ENVIRONMENT_KEYS.map((key) => [key]))("names %s when it is missing", (key) => {
    expect(() => readBillingEnvironmentGroup(parsed({ [key]: undefined })))
      .toThrow(`BILLING_CONFIGURATION_INCOMPLETE:${key}`);
  });

  it.each([
    ["XMONEY_API_BASE_URL", "http://api-stage.xmoney.com"],
    ["XMONEY_API_BASE_URL", "https://xmoney.example"],
    ["QUADERNO_API_BASE_URL", "http://debateai.quadernoapp.com/api"],
    ["SMARTBILL_API_BASE_URL", "http://ws.smartbill.ro/SBORO/api"],
    ["XMONEY_SITE_ID", "site-1"],
    ["SMARTBILL_SERIES", "D B T"]
  ])("refuses %s = %s", (key, value) => {
    expect(() => readBillingEnvironmentGroup(parsed({ [key]: value }))).toThrow(`BILLING_CONFIGURATION_INVALID:${key}`);
  });
});
