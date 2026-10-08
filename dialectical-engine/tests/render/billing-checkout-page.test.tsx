import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as string | null,
  locale: "en",
  billingOn: true,
  ageOwed: false,
  sessionLive: true,
  sessionCheckedWith: [] as string[],
  ageAskedWith: [] as string[],
  consentMissingFor: null as string | null,
  flowProps: [] as Record<string, unknown>[],
  pollerProps: [] as Record<string, unknown>[]
}));

vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  const { NONCE_REQUEST_HEADER } = await import("../../apps/ui/content-security-policy.mjs");
  return {
    cookies: async () => ({
      get: (name: string) => name === "__Host-debateai-session" && mocks.session !== null
        ? { value: mocks.session }
        : name === LOCALE_COOKIE ? { value: mocks.locale } : undefined
    }),
    headers: async () => new Headers({
      "user-agent": "checkout-page-test", [NONCE_REQUEST_HEADER]: "AAAAAAAAAAAAAAAAAAAAAA==",
      "accept-language": "de-DE,de;q=0.9,en;q=0.8"
    })
  };
});
vi.mock("@/lib/billing/serverBilling", () => ({
  billingIsOn: async () => mocks.billingOn,
  sessionConfirmed: async (sessionToken: string) => { mocks.sessionCheckedWith.push(sessionToken); return mocks.sessionLive; },
  ageConfirmationOwed: async (sessionToken: string) => { mocks.ageAskedWith.push(sessionToken); return mocks.ageOwed; }
}));
vi.mock("@/components/billing/CheckoutFlow", () => ({
  CheckoutFlow: (props: Record<string, unknown>) => { mocks.flowProps.push(props); return null; }
}));
vi.mock("@/components/billing/ChargeStatusPoller", () => ({
  ChargeStatusPoller: (props: Record<string, unknown>) => { mocks.pollerProps.push(props); return null; }
}));
vi.mock("@debateai/legal-manifest", () => ({
  currentDocument: (kind: string, locale: string) => locale === mocks.consentMissingFor
    ? null
    : { version: `${kind}@${locale}`, sha256: "c".repeat(64) }
}));

import CheckoutPage from "../../apps/ui/app/checkout/page.js";
import CheckoutReturnPage from "../../apps/ui/app/checkout/return/page.js";
import { readNotFoundCalls, readRedirects, resetNotFoundCalls, resetRedirects } from "./stubs/next-navigation.js";

beforeEach(() => {
  mocks.session = null;
  mocks.locale = "en";
  mocks.billingOn = true;
  mocks.ageOwed = false;
  mocks.sessionLive = true;
  mocks.sessionCheckedWith = [];
  mocks.ageAskedWith = [];
  mocks.consentMissingFor = null;
  mocks.flowProps = [];
  mocks.pollerProps = [];
  resetRedirects();
  resetNotFoundCalls();
});

describe("P19 /checkout and /checkout/return", () => {
  it("sends a signed-out person to sign in and back to the same plan", async () => {
    await expect(CheckoutPage({ searchParams: Promise.resolve({ plan: "PRO" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/login?next=%2Fcheckout%3Fplan%3DPRO"]);
  });

  it("sends an account that still owes its one-time age check to the age gate first, and back to the same plan (R3-2)", async () => {
    mocks.session = "t".repeat(43);
    mocks.ageOwed = true;
    await expect(CheckoutPage({ searchParams: Promise.resolve({ plan: "PRO" }) })).rejects.toThrow("NEXT_REDIRECT");
    // The age gate's own interstitial and its own return path (ageConfirmationHref over the allow-listed /checkout).
    expect(readRedirects()).toEqual(["/?next=%2Fcheckout%3Fplan%3DPRO"]);
    expect(mocks.ageAskedWith).toEqual(["t".repeat(43)]);
    expect(mocks.flowProps).toHaveLength(0);
  });

  it("hands the flow the plan and the consent pairs of the reader's locale, and nothing of a card form", async () => {
    mocks.session = "t".repeat(43);
    mocks.locale = "de";
    renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({ plan: "PLUS" }) }));
    expect(mocks.flowProps).toHaveLength(1);
    expect(mocks.flowProps[0]).toMatchObject({
      planId: "PLUS",
      locale: "de",
      consents: {
        renewal: { version: "CONSENT_RENEWAL@de", sha256: "c".repeat(64) },
        immediateStart: { version: "CONSENT_IMMEDIATE_START@de", sha256: "c".repeat(64) }
      }
    });
    // The country comes from the connection through P8b's first quote, never from the browser's language.
    expect(Object.keys(mocks.flowProps[0]!)).not.toContain("suggestedCountry");
    expect(Object.keys(mocks.flowProps[0]!)).not.toContain("sdkOrigin");
  });

  it("is not found while billing is off, for the checkout and its return page alike", async () => {
    mocks.session = "t".repeat(43);
    mocks.billingOn = false;
    await expect(CheckoutPage({ searchParams: Promise.resolve({ plan: "PLUS" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CheckoutReturnPage({ searchParams: Promise.resolve({ charge: "0".repeat(32) }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readNotFoundCalls()).toBe(2);
    expect(mocks.flowProps).toHaveLength(0);
  });

  it("refuses an unknown or free plan in words, with a way back to the plans", async () => {
    mocks.session = "t".repeat(43);
    for (const plan of ["FREE", "GOLD", undefined]) {
      const html = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(plan === undefined ? {} : { plan }) }));
      expect(html).toContain("That plan doesn&#x27;t exist. Choose one on the pricing page.");
      expect(html).toContain('href="/pricing"');
    }
    expect(mocks.flowProps).toHaveLength(0);
  });

  it("never sends another locale's consent pair: without the reader's own pair the flow gets none (P8c would refuse it)", async () => {
    mocks.session = "t".repeat(43);
    mocks.locale = "de";
    mocks.consentMissingFor = "de";
    renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({ plan: "PLUS" }) }));
    expect(mocks.flowProps[0]).toMatchObject({ locale: "de", consents: null });
  });

  it("sends an expired or revoked session to sign in, from the checkout and its return page alike (spec §2.10)", async () => {
    mocks.session = "t".repeat(43);
    mocks.sessionLive = false;
    await expect(CheckoutPage({ searchParams: Promise.resolve({ plan: "PRO" }) })).rejects.toThrow("NEXT_REDIRECT");
    const ref = "0123456789abcdef0123456789abcdef";
    await expect(CheckoutReturnPage({ searchParams: Promise.resolve({ charge: ref }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([
      "/login?next=%2Fcheckout%3Fplan%3DPRO",
      `/login?next=%2Fcheckout%2Freturn%3Fcharge%3D${ref}`
    ]);
    expect(mocks.sessionCheckedWith).toEqual(["t".repeat(43), "t".repeat(43)]);
    expect(mocks.ageAskedWith).toHaveLength(0);
    expect(mocks.flowProps).toHaveLength(0);
    expect(mocks.pollerProps).toHaveLength(0);
  });

  it("is not found while billing is off for a signed-out visitor too, with no sign-in redirect (like /pricing)", async () => {
    mocks.billingOn = false;
    await expect(CheckoutPage({ searchParams: Promise.resolve({ plan: "PLUS" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CheckoutReturnPage({ searchParams: Promise.resolve({ charge: "0".repeat(32) }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readNotFoundCalls()).toBe(2);
    expect(readRedirects()).toEqual([]);
  });

  it("brings a signed-out visitor with an unknown plan back to plain /checkout, never to a plan they did not pick", async () => {
    for (const plan of ["GOLD", "pro"]) {
      resetRedirects();
      await expect(CheckoutPage({ searchParams: Promise.resolve({ plan }) })).rejects.toThrow("NEXT_REDIRECT");
      expect(readRedirects(), plan).toEqual(["/login?next=%2Fcheckout"]);
    }
  });

  it("the return page polls the server for the charge it names, and only for a well-formed one", async () => {
    mocks.session = "t".repeat(43);
    renderToStaticMarkup(await CheckoutReturnPage({ searchParams: Promise.resolve({ charge: "0123456789abcdef0123456789abcdef" }) }));
    expect(mocks.pollerProps[0]).toMatchObject({ chargeRef: "0123456789abcdef0123456789abcdef" });
    expect(mocks.pollerProps[0]).toMatchObject({ upgradeSuccessText: "Your upgrade is paid. Your new plan has started." });
    const bad = renderToStaticMarkup(await CheckoutReturnPage({ searchParams: Promise.resolve({ charge: "../x" }) }));
    expect(bad).toContain("Something went wrong. Please try again.");
    expect(mocks.pollerProps).toHaveLength(1);
  });
});
