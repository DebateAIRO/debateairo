// tests/unit/billing-provider-only-mode.test.ts
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  billingModeOf,
  incompleteNetopiaKey,
  loadNetopiaConnectors,
  type TrustedKeyFileOwners
} from "../../apps/api/src/billing/connectors.js";
import { testNetopiaKeys } from "../support/netopia-notice.js";

const POS = ["PROV", "0001", "0002", "0003", "0004"].join("-");
const NETOPIA_KEY = ["provider", "only", "key", "fixture"].join("-");
const keys = testNetopiaKeys();
const OWN: TrustedKeyFileOwners = Object.freeze({ ownerUid: process.getuid!(), apiUid: -1 });
const SET = {
  NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com", NETOPIA_POS_SIGNATURE: POS,
  NETOPIA_API_KEY_PATH: "/etc/debateai/api/billing/netopia-api-key",
  NETOPIA_IPN_KEYS_PATH: "/etc/debateai/api/billing/netopia-ipn-keys.pem"
} as const;

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function netopiaFiles(): string {
  const root = mkdtempSync(join(tmpdir(), "n8-provider-only-"));
  chmodSync(root, 0o700);
  roots.push(root);
  writeFileSync(join(root, "netopia-api-key"), `${NETOPIA_KEY}\n`);
  chmodSync(join(root, "netopia-api-key"), 0o600);
  writeFileSync(join(root, "netopia-ipn-keys.pem"), keys.publicPem);
  chmodSync(join(root, "netopia-ipn-keys.pem"), 0o644);
  return root;
}

describe("N8 — the provider-only mode (spec §2.7.3, ruling C-9)", () => {
  it("is ON only when hosted and switched on; PROVIDER_ONLY when hosted, off, and NETOPIA's four are all set", () => {
    expect(billingModeOf({ hosted: false, billingEnabled: true, environment: SET })).toBe("OFF");
    expect(billingModeOf({ hosted: false, billingEnabled: false, environment: SET })).toBe("OFF");
    expect(billingModeOf({ hosted: true, billingEnabled: true, environment: {} })).toBe("ON");
    expect(billingModeOf({ hosted: true, billingEnabled: true, environment: SET })).toBe("ON");
    expect(billingModeOf({ hosted: true, billingEnabled: false, environment: SET })).toBe("PROVIDER_ONLY");
    expect(billingModeOf({ hosted: true, billingEnabled: false, environment: {} })).toBe("OFF");
    expect(billingModeOf({ hosted: true, billingEnabled: false, environment: { ...SET, NETOPIA_API_KEY_PATH: undefined } }))
      .toBe("OFF");
    expect(billingModeOf({ hosted: true, billingEnabled: false, environment: { ...SET, NETOPIA_POS_SIGNATURE: "  " } }))
      .toBe("OFF");
  });

  it("names the first missing NETOPIA key only when the group is set in part", () => {
    expect(incompleteNetopiaKey({})).toBeNull();
    expect(incompleteNetopiaKey(SET)).toBeNull();
    expect(incompleteNetopiaKey({ NETOPIA_POS_SIGNATURE: POS })).toBe("NETOPIA_API_BASE_URL");
    expect(incompleteNetopiaKey({ ...SET, NETOPIA_IPN_KEYS_PATH: undefined })).toBe("NETOPIA_IPN_KEYS_PATH");
  });

  it("builds the NETOPIA connector alone: no Quaderno, SmartBill or owner file is read", () => {
    const root = netopiaFiles();
    const connectors = loadNetopiaConnectors({
      environment: {
        netopiaApiBaseUrl: "https://secure.mobilpay.ro/pay", netopiaPosSignature: POS,
        netopiaApiKeyPath: join(root, "netopia-api-key"), netopiaIpnKeysPath: join(root, "netopia-ipn-keys.pem"),
        publicAppUrl: "https://dezbatere.test"
      },
      recordsKey: Buffer.alloc(32, 5), trustedKeyOwners: OWN
    });
    expect(connectors.paymentEnvironment).toBe("live");
    expect(connectors.payments.provider).toBe("netopia");
    expect(connectors.noticeTrust).toEqual({ posSignature: POS, keys: expect.any(Array) });
    expect(connectors.noticeTrust.keys).toHaveLength(1);
    expect(connectors.publicAppUrl).toBe("https://dezbatere.test");
    expect(Object.keys(connectors).sort()).toEqual(["noticeTrust", "paymentEnvironment", "payments", "publicAppUrl", "recordsKey"]);
  });

  it("accepts a loopback http base only when the development fakes ask for it, and then as the sandbox", () => {
    const root = netopiaFiles();
    const environment = {
      netopiaApiBaseUrl: "http://127.0.0.1:8802", netopiaPosSignature: POS,
      netopiaApiKeyPath: join(root, "netopia-api-key"), netopiaIpnKeysPath: join(root, "netopia-ipn-keys.pem"),
      publicAppUrl: "https://dezbatere.test"
    };
    expect(() => loadNetopiaConnectors({ environment, recordsKey: Buffer.alloc(32), trustedKeyOwners: OWN }))
      .toThrow("BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL");
    expect(() => loadNetopiaConnectors({
      environment: { ...environment, netopiaApiBaseUrl: "http://dev.example.test:8802" }, recordsKey: Buffer.alloc(32),
      trustedKeyOwners: OWN, allowLoopbackBase: true
    })).toThrow("BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL");
    const connectors = loadNetopiaConnectors({
      environment, recordsKey: Buffer.alloc(32), trustedKeyOwners: OWN, allowLoopbackBase: true
    });
    expect(connectors.paymentEnvironment).toBe("sandbox");
  });
});
