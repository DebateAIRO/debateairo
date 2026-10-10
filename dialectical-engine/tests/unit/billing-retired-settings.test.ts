import { describe, expect, it } from "vitest";
import {
  BILLING_ENVIRONMENT_KEYS, RETIRED_BILLING_SETTINGS, parseBillingInvoiceEnvironment, parseBillingWithdrawEnvironment,
  retiredBillingSettingsIn
} from "@debateai/register";

const operator = {
  DATABASE_URL: "postgres://billing@127.0.0.1:5432/debateai", REGISTER_VERSION: "7", NODE_ENV: "test"
} as const;

describe("N23 the removed card-processor settings (spec 2026-10-05 §2.17.1)", () => {
  it("lists the four removed API settings, none of which the billing group still reads", () => {
    expect(RETIRED_BILLING_SETTINGS).toHaveLength(4);
    expect(Object.isFrozen(RETIRED_BILLING_SETTINGS)).toBe(true);
    for (const key of RETIRED_BILLING_SETTINGS) {
      expect(key).toMatch(/^[A-Z][A-Z_]+$/u);
      expect(BILLING_ENVIRONMENT_KEYS as readonly string[]).not.toContain(key);
    }
    expect(BILLING_ENVIRONMENT_KEYS).toContain("NETOPIA_API_BASE_URL");
  });

  it("names each removed setting that is set, in the list's order, empty values included, and never a value", () => {
    const [first, second, third, fourth] = RETIRED_BILLING_SETTINGS;
    expect(retiredBillingSettingsIn({})).toEqual([]);
    expect(retiredBillingSettingsIn({ [fourth!]: "https://example.invalid", [first!]: "/etc/debateai/api/billing/old-key", PATH: "/bin" }))
      .toEqual([first, fourth]);
    expect(retiredBillingSettingsIn({ [second!]: "", [third!]: "1" })).toEqual([second, third]);
    const found = retiredBillingSettingsIn({ [first!]: "secret-looking-value" });
    expect(JSON.stringify(found)).not.toContain("secret-looking-value");
  });

  it("lets the owner commands tell the payment system apart by NETOPIA's base, and refuse without it", () => {
    const sandbox = "https://secure-sandbox.netopia-payments.com";
    expect(parseBillingWithdrawEnvironment({ ...operator, NETOPIA_API_BASE_URL: sandbox })).toMatchObject({ NETOPIA_API_BASE_URL: sandbox });
    expect(() => parseBillingWithdrawEnvironment({ ...operator })).toThrow();
    expect(parseBillingInvoiceEnvironment({ ...operator, NETOPIA_API_BASE_URL: sandbox, PUBLIC_APP_URL: "https://dezbatere.ro" }))
      .toMatchObject({ NETOPIA_API_BASE_URL: sandbox, PUBLIC_APP_URL: "https://dezbatere.ro" });
    expect(() => parseBillingInvoiceEnvironment({ ...operator, PUBLIC_APP_URL: "https://dezbatere.ro" })).toThrow();
    // A removed setting alone never satisfies them.
    expect(() => parseBillingWithdrawEnvironment({ ...operator, [RETIRED_BILLING_SETTINGS[3]!]: sandbox })).toThrow();
  });
});
