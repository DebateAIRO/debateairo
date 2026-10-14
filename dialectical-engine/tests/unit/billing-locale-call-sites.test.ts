import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S01-C06 (V-6, R-19, B7): the three billing send sites send the CATALOG locale, so en-US and en-GB reach the API as
 * `en` (the contract regex /^[a-z]{2}$/ refuses `en-GB`). The two pages keep their isLocale read and are not edited.
 * A source-level pin on the send calls: it names the call sites, not what a rendered page shows.
 */
const SEND_FILES = {
  checkout: "apps/ui/components/billing/CheckoutFlow.tsx",
  upgrade: "apps/ui/components/billing/SubscriptionControls.tsx",
  cardChange: "apps/ui/components/billing/CardChangeFlow.tsx"
} as const;
const PAGES = ["apps/ui/app/checkout/page.tsx", "apps/ui/app/settings/card/page.tsx"] as const;

const read = (path: string): string => readFileSync(resolve(path), "utf8");

/** One send call's text: from its opening to the first `});` after it, so a raw `locale` elsewhere in the file cannot pass. */
function sendCall(source: string, opening: string): string {
  const start = source.indexOf(opening);
  expect(start, `${opening} is in the file`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("});", start);
  expect(end, `${opening} closes`).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

describe("S01-C06 V-6: the billing send sites send the catalog locale", () => {
  it("CheckoutFlow sends catalogLocale(locale) as the checkout's locale", () => {
    const call = sendCall(read(SEND_FILES.checkout), "client.startBillingCheckout({");
    expect(call).toContain("locale: catalogLocale(locale)");
  });

  it("SubscriptionControls sends catalogLocale(locale) as the upgrade's locale", () => {
    const call = sendCall(read(SEND_FILES.upgrade), "client.upgradeSubscription(");
    expect(call).toContain("locale: catalogLocale(locale)");
  });

  it("CardChangeFlow sends catalogLocale(locale) as the card change's locale", () => {
    const call = sendCall(read(SEND_FILES.cardChange), "client.startCardChange({");
    expect(call).toContain("locale: catalogLocale(locale)");
  });

  it("each send file imports catalogLocale from the locale module (not a local copy of the rule)", () => {
    for (const file of Object.values(SEND_FILES)) {
      expect(read(file), file).toMatch(/import \{[^}]*\bcatalogLocale\b[^}]*\} from "@\/lib\/i18n\/locales"/u);
    }
  });

  it("the checkout page and the card page keep their isLocale read (B7: the pages are not edited)", () => {
    for (const page of PAGES) {
      expect(read(page), page).toContain("isLocale(requestedLocale)");
    }
  });
});
