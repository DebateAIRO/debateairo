// tests/unit/region-served-countries.test.ts
// The Region list against the country rules: a country the rules let sign up must be one a person can pick.
// Iceland and Liechtenstein were served but missing from the list until 0154 (owner request, 3 November 2026).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGION_COUNTRY_CODES } from "@debateai/kernel";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue, type CountryPolicy } from "@debateai/register";

const fromCode = countryPolicyFromValue(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
/** The country member an operator merges into the live hosted register (deploy/vps/README.md "Country data"). */
const example = JSON.parse(readFileSync(new URL("../../deploy/vps/register/country-policy.example.json", import.meta.url), "utf8")) as { countryPolicy: unknown };
const fromExample = countryPolicyFromValue(example.countryPolicy, "country-policy.example.json");
const servedBy = (policy: CountryPolicy): string[] =>
  Object.entries(policy.countries).filter(([, rule]) => rule.signup).map(([code]) => code).sort();
const listed = new Set(REGION_COUNTRY_CODES);

describe("Region list against the country rules", () => {
  it("R1 lists every country the code's rules let sign up", () => {
    expect(servedBy(fromCode).filter((code) => !listed.has(code))).toEqual([]);
  });

  it("R2 lists every country the hosted example lets sign up", () => {
    expect(servedBy(fromExample).filter((code) => !listed.has(code))).toEqual([]);
  });

  it("R3 the default rule closes sign-up, so an unlisted country is never served by omission", () => {
    expect(fromCode.defaultRule.signup).toBe(false);
    expect(fromExample.defaultRule.signup).toBe(false);
  });

  it("R4 covers the two that went missing: Iceland and Liechtenstein, both offered", () => {
    expect(servedBy(fromCode)).toEqual(expect.arrayContaining(["IS", "LI"]));
    expect(fromCode.countries.IS).toMatchObject({ signup: true, pay: true });
    expect(fromCode.countries.LI).toMatchObject({ signup: true, pay: true });
    expect(listed.has("IS") && listed.has("LI")).toBe(true);
  });
});
