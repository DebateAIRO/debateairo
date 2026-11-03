// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGION_COUNTRIES } from "@debateai/kernel";
import { PricingPlaceForm } from "../../apps/ui/components/billing/PricingPlaceForm.js";
import authEnglish from "../../apps/ui/messages/en/auth.json" with { type: "json" };
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

/**
 * Terms §12: the pricing page's place form is sign-up's own region picker (continents, then the countries we serve),
 * with the postal code asked only while the picked country prices its tax by it (the US and Canada, as at checkout).
 */
type Place = Readonly<{ country: string | null; postal_code: string | null; status: string }>;

let root: Root;
let host: HTMLDivElement;
const query = <T extends Element>(selector: string): T | null => host.querySelector<T>(selector);

async function mount(place: Place, typedPostalCode?: string): Promise<void> {
  await act(async () => root.render(
    <PricingPlaceForm key={JSON.stringify(place)}
      catalog={billingEnglish} regionCatalog={authEnglish} locale="en"
      place={place as Parameters<typeof PricingPlaceForm>[0]["place"]} typedPostalCode={typedPostalCode}
    />
  ));
}
async function click(selector: string): Promise<void> {
  const target = query<HTMLElement>(selector);
  expect(target, `missing ${selector}`).not.toBeNull();
  await act(async () => target!.click());
}
async function pick(continent: string, code: string): Promise<void> {
  await click("#pricing-region-trigger");
  // With a country picked, the picker opens on its continent, as at sign-up.
  if (query(".regionBack") !== null) await click(".regionBack");
  await click(`.regionContinent[data-continent="${continent}"]`);
  await click(`.regionCountry[data-code="${code}"]`);
}
const sentCountry = () => query<HTMLInputElement>('input[type="hidden"][name="country"]')?.value ?? null;
const submit = () => query<HTMLButtonElement>('[data-pricing-place] button[type="submit"]')!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Terms §12 the pricing page's place picker", () => {
  it("is sign-up's region picker, labelled for the pricing page, with no state select", async () => {
    await mount({ country: null, postal_code: null, status: "COUNTRY_NEEDED" });
    expect(query('label[for="pricing-region-trigger"]')?.textContent).toBe(billingEnglish["billing.checkout.country"]);
    expect(query("#signup-region-trigger")).toBeNull();
    expect(sentCountry()).toBeNull();
    expect(submit().disabled).toBe(true);
    await click("#pricing-region-trigger");
    // The continents, then the countries we serve, as at sign-up.
    expect([...host.querySelectorAll(".regionContinent")].length).toBe(7);
    await click('.regionContinent[data-continent="Europe"]');
    expect([...host.querySelectorAll(".regionCountry")].length)
      .toBe(REGION_COUNTRIES.filter((country) => country.continent === "Europe").length);
    await click('.regionCountry[data-code="DE"]');
    expect(query("#pricing-region-value")?.textContent).toBe("Germany");
    expect(sentCountry()).toBe("DE");
    expect(submit().disabled).toBe(false);
    expect(query("#pricing-postal-code")).toBeNull();
    // Sign-up's state select never shows here: the US is priced by its postal code.
    await pick("North America", "US");
    expect(query("#pricing-region-state")).toBeNull();
    expect(query("#pricing-postal-code")).not.toBeNull();
  });

  it("asks the postal code only while the US or Canada is picked, so another country is never held back by it", async () => {
    await mount({ country: "US", postal_code: null, status: "POSTAL_CODE_NEEDED" });
    expect(sentCountry()).toBe("US");
    const postal = query<HTMLInputElement>("#pricing-postal-code")!;
    expect([postal.name, postal.required]).toEqual(["postal_code", false]);
    await pick("Europe", "RO");
    expect(sentCountry()).toBe("RO");
    expect(query("#pricing-postal-code")).toBeNull();
    await pick("North America", "CA");
    expect(query<HTMLInputElement>("#pricing-postal-code")?.value).toBe("");
  });

  it("gives back a postal code that did not fit, with its error, until another country is picked", async () => {
    await mount({ country: "US", postal_code: null, status: "POSTAL_CODE_INVALID" }, "ABCDE");
    expect(query<HTMLInputElement>("#pricing-postal-code")?.value).toBe("ABCDE");
    expect(query("#pricing-postal-code")?.getAttribute("aria-invalid")).toBe("true");
    expect(query("#pricing-postal-code-error")?.textContent).toBe(billingEnglish["billing.checkout.postalCodeInvalid"]);
    await pick("North America", "CA");
    expect(query<HTMLInputElement>("#pricing-postal-code")?.value).toBe("");
    expect(query("#pricing-postal-code")?.getAttribute("aria-invalid")).toBe("false");
    expect(query("#pricing-postal-code-error")).toBeNull();
  });

  it("starts from the priced place, even a country its grid does not list, and sends it again", async () => {
    await mount({ country: "US", postal_code: "75201", status: "PRICED" });
    expect([sentCountry(), query<HTMLInputElement>("#pricing-postal-code")?.value]).toEqual(["US", "75201"]);
    // A connection's country outside the countries we serve: the picker names it, as the cards do.
    await mount({ country: "PR", postal_code: null, status: "PRICED" });
    expect([query("#pricing-region-value")?.textContent, sentCountry(), submit().disabled]).toEqual(["Puerto Rico", "PR", false]);
  });

  it("sends the country once: with scripts, the picker's field only", async () => {
    await mount({ country: "DE", postal_code: null, status: "PRICED" });
    const form = query<HTMLFormElement>("[data-pricing-place]")!;
    expect([...new FormData(form).getAll("country")]).toEqual(["DE"]);
    await pick("Europe", "RO");
    expect([...new FormData(form).getAll("country")]).toEqual(["RO"]);
  });
});
