import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "../../apps/ui/lib/billing/countries.js";

describe("P19 the checkout's country list", () => {
  it("lists the 249 assigned ISO 3166-1 codes once each", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
  });
});
