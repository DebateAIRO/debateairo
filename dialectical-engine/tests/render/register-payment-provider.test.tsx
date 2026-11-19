import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../apps/ui/messages/en/legal.json";
import { LegalProvidersBody } from "../../apps/ui/components/legal/LegalBodies.js";
import {
  NETOPIA_PROVIDER,
  PROVIDER_PURPOSES,
  SUPPORT_PROVIDER,
  legalRegister,
  providerRegister
} from "../../apps/ui/lib/legal/pages.js";

/**
 * Privacy 3.15 (owner, 19 November 2026): the Register also lists the payment provider, NETOPIA Payments, the one row
 * that is not an AI provider. The AI rows are unchanged (`providerRegister`); `/providers` shows them and then
 * NETOPIA's row on every answer (`legalRegister`). Its row says what NETOPIA receives (the same list as Privacy §5),
 * "not applicable" for the AI-only facts, and "[to confirm]" for what the repo does not know. The intro still says AI
 * providers never receive email, account, IP or payment details, and says the last entry does. The plans are on sale,
 * so the row and the intro no longer say "once paid plans start", and both name the check of a new card, which sends
 * NETOPIA the same details as a payment.
 */
const catalogs: Readonly<Record<string, Record<string, string>>> = Object.fromEntries(
  readdirSync(resolve(process.cwd(), "apps/ui/messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z]{2}$/u.test(entry.name))
    .map((entry) => [entry.name, JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages", entry.name, "legal.json"), "utf8"))])
);
const escaped = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#x27;");

describe("the Register lists the payment provider after the AI providers", () => {
  it.each([["no answer", null], ["DeepInfra only", ["deepinfra"]], ["Anthropic and DeepInfra", ["anthropic", "deepinfra"]], ["an unknown host", ["host:api.acme.example"]]] as const)(
    "%s: the AI rows as before, then NETOPIA once, last", (_label, companies) => {
      const rows = legalRegister(companies);
      expect(rows.slice(0, -1)).toEqual(providerRegister(companies));
      expect(rows.at(-1)).toBe(NETOPIA_PROVIDER);
      expect(rows.filter((row) => row.key === "netopia")).toHaveLength(1);
      expect(providerRegister(companies)).not.toContain(NETOPIA_PROVIDER);
      expect(providerRegister(companies).at(-1)).toMatchObject({ key: SUPPORT_PROVIDER.key });
    });

  it("NETOPIA's row holds only what the repo supports", () => {
    expect(NETOPIA_PROVIDER).toMatchObject({
      key: "netopia", provider: "NETOPIA Payments", models: "", entity: "NETOPIA Financial Services S.A.",
      homeCountryKey: "legal.providers.romania", purposes: ["payments"], purposesConfirmed: true,
      locationKey: "legal.providers.unconfirmed", retentionKey: "legal.providers.unconfirmed",
      zeroRetention: "notApplicable", training: "notApplicable", basisKey: "legal.providers.euBasis", contact: "[…]", checkedOn: null
    });
    expect(PROVIDER_PURPOSES).toContain("payments");
  });

  it("English: the row's facts and the intro read as written", () => {
    const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={legalRegister(null)} />);
    expect(html).toContain('id="legal-provider-netopia"');
    expect(html).toContain("NETOPIA Financial Services S.A.");
    expect(html).toContain(escaped(en["legal.providers.purpose.payments"]));
    expect(html.split(escaped(en["legal.providers.notApplicable"])).length - 1, "zero retention and training").toBe(2);
    expect(html).toContain(escaped(en["legal.providers.euBasis"]));
    expect(en["legal.providers.purpose.payments"]).toBe("Your name, email address, phone number and billing address, a customer code that stays the same, our reference for the order, the amount, the currency and a short description, with each card payment and when you check a new card, and at a renewal the IP address you last paid from yourself — to take card payments and check new cards");
    expect(en["legal.providers.notApplicable"]).toBe("Not applicable — not an AI provider");
    expect(en["legal.providers.euBasis"]).toBe("None needed — a company in the European Union (Romania)");
    expect(en["legal.providers.intro"]).toContain("They never receive your email address, your account, your IP address or your payment details.");
    expect(en["legal.providers.intro"]).toContain("The last entry is not an AI provider: it is our payment provider, NETOPIA Payments, which takes card payments and checks new cards. It does receive your name, your email address, your phone number, your billing address and, at a renewal, an IP address, and its entry says what it receives and why.");
  });

  it.each(Object.keys(catalogs).map((code) => [code]))("%s: the three new keys are there and translated, and the intro names NETOPIA Payments", (code) => {
    const catalog = catalogs[code]!;
    for (const key of ["legal.providers.purpose.payments", "legal.providers.notApplicable", "legal.providers.euBasis"]) {
      expect(catalog[key]?.trim(), `${code}: ${key}`).toBeTruthy();
      if (code !== "en") expect(catalog[key], `${code}: ${key} is translated`).not.toBe((en as Record<string, string>)[key]);
    }
    expect(catalog["legal.providers.intro"], `${code}: the intro names the payment provider`).toContain("NETOPIA Payments");
    const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={legalRegister(["deepinfra"])} />);
    expect(html).toContain('id="legal-provider-netopia"');
    expect(html).not.toContain("legal.providers.");
  });

  it("has 35 catalogues", () => expect(Object.keys(catalogs)).toHaveLength(35));
});
