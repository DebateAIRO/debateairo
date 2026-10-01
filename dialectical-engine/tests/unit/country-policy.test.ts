import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  COUNTRY_POLICY_ROW_KEY,
  countryPolicyFromValue,
  countryRule,
  loadBootstrapRegister,
  readCountryPolicy,
  type CountryPolicy
} from "@debateai/register";
import { decideAsk, decideCardCountry, decidePayment, decideSignup } from "@debateai/geo";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { parseHostedRegisterFile, planHostedRegisterPublication } from "../../apps/runner/src/hosted-register-publish.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

const EU27 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const GROUPS = [
  { codes: [...EU27, "NO", "IS"], rule: { signup: true, pay: true, reason: "OFFERED", blocked: false } },
  { codes: ["US", "CA", "AU", "NZ", "SG", "JP"], rule: { signup: true, pay: true, reason: "OFFERED", blocked: false } },
  { codes: ["LI"], rule: { signup: true, pay: false, reason: "TAX_NOT_READY", blocked: false } },
  { codes: ["GB", "KR"], rule: { signup: true, pay: false, reason: "TAX_NOT_READY", blocked: false } },
  { codes: ["CH", "IL", "TW", "UA"], rule: { signup: false, pay: false, reason: "NOT_OFFERED", blocked: false } },
  { codes: ["TR", "BR", "ID", "SA", "IN", "AE", "MX", "AR", "CO", "CL", "TH", "PH"], rule: { signup: false, pay: false, reason: "TERMS_EXCLUDED", blocked: false } },
  { codes: ["RU", "BY", "KP"], rule: { signup: false, pay: false, reason: "SANCTIONS", blocked: true } },
  { codes: ["CN", "HK", "MO", "IR", "CU", "SY", "VE", "VN"], rule: { signup: false, pay: false, reason: "PROVIDER_UNSUPPORTED", blocked: true } }
] as const;
const policy: CountryPolicy = countryPolicyFromValue(
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
/**
 * Final review I-3: the kit's main example publishes NO country gate (it is what §4 step 4b copies into
 * the live hosted file); the §1.5 switches live in their own example, holding exactly that one member,
 * merged in only once the gate's preconditions hold (deploy/vps/README.md "Country data").
 */
const HOSTED_EXAMPLE = "deploy/vps/register/hosted-register.example.json";
const COUNTRY_POLICY_EXAMPLE = "deploy/vps/register/country-policy.example.json";
const readExample = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
/** The hosted file an operator writes to turn the gate on: the main example plus the country member. */
const gatedExample = async (): Promise<Record<string, unknown>> =>
  ({ ...(await readExample(HOSTED_EXAMPLE)), ...(await readExample(COUNTRY_POLICY_EXAMPLE)) });

function invalid(mutate: (value: Record<string, unknown>) => void): string | undefined {
  const value = structuredClone(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value) as unknown as Record<string, unknown>;
  mutate(value);
  try {
    countryPolicyFromValue(value, "test");
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("countryPolicy v1 (paid plans G2, spec §1.5 and §2.3.3)", () => {
  it("holds exactly the §1.5 switches, every code listed explicitly, and closes everything else", () => {
    expect(COUNTRY_POLICY_ROW_KEY).toBe("countryPolicy");
    expect(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.kind).toBe("COUNTRY_POLICY");
    const listed = GROUPS.flatMap((group) => group.codes);
    expect(new Set(listed).size).toBe(65);
    expect(Object.keys(policy.countries).sort()).toEqual([...listed].sort());
    for (const group of GROUPS) {
      for (const code of group.codes) expect(countryRule(policy, code), code).toEqual(group.rule);
    }
    expect(policy.defaultRule).toEqual({ signup: false, pay: false, reason: "NOT_OFFERED", blocked: false });
    expect(countryRule(policy, "ZW")).toEqual(policy.defaultRule);
    expect(countryRule(policy, "ro")).toEqual(countryRule(policy, "RO"));
    expect(policy.unknownIp).toBe("REFUSE");
    expect(policy.tor).toBe("REFUSE");
  });

  it("refuses a country that pays without sign-up, a blocked country with a switch on, and a bad code", () => {
    expect(invalid((value) => { (value.countries as Record<string, unknown>).FR = { signup: false, pay: true, reason: "OFFERED" }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { (value.countries as Record<string, unknown>).RU = { signup: true, pay: false, reason: "SANCTIONS", blocked: true }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { (value.countries as Record<string, unknown>).ro = { signup: true, pay: true, reason: "OFFERED" }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { (value.countries as Record<string, unknown>).XX = { signup: true, pay: true, reason: "OFFERED" }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { value.default_rule = { signup: false, pay: false, reason: "SANCTIONS", blocked: true }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { value.tor = "ALLOW"; })).toBe("COUNTRY_POLICY_INVALID");
    const blankSourceRef = (() => {
      try {
        countryPolicyFromValue(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, " ");
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    })();
    expect(blankSourceRef).toBe("COUNTRY_POLICY_INVALID");
  });

  it("reads null for a version that never published the row, and refuses a malformed one", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(readCountryPolicy({ query } as never, 7)).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("register.register_row"), [7, "countryPolicy"]);
    query.mockResolvedValueOnce({ rows: [{ value_json: COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, source_ref: "ref" }] });
    await expect(readCountryPolicy({ query } as never, 7)).resolves.toMatchObject({ unknownIp: "REFUSE" });
    query.mockResolvedValueOnce({ rows: [{ value_json: { kind: "COUNTRY_POLICY" }, source_ref: "ref" }] });
    await expect(readCountryPolicy({ query } as never, 7)).rejects.toMatchObject({ code: "COUNTRY_POLICY_INVALID" });
  });

  it("decides sign-up: Tor, unknown, then the IP country's switch", () => {
    expect(decideSignup(policy, { ipCountry: "RO", tor: false })).toEqual({ kind: "ALLOW" });
    expect(decideSignup(policy, { ipCountry: "GB", tor: false })).toEqual({ kind: "ALLOW" });
    for (const country of ["CH", "TR", "RU", "ZW"]) {
      expect(decideSignup(policy, { ipCountry: country, tor: false }), country)
        .toEqual({ kind: "REFUSE", code: "COUNTRY_SIGNUP_UNAVAILABLE" });
    }
    expect(decideSignup(policy, { ipCountry: "XX", tor: false })).toEqual({ kind: "REFUSE", code: "COUNTRY_UNKNOWN" });
    // Owner's amendment of 1 October 2026: the nine countries the Terms do not list are closed as
    // Terms-excluded, not blocked; the UK and South Korea, which the Terms list, stay open.
    for (const country of ["SA", "IN", "PH"]) {
      expect(decideSignup(policy, { ipCountry: country, tor: false }), country)
        .toEqual({ kind: "REFUSE", code: "COUNTRY_SIGNUP_UNAVAILABLE" });
      expect(countryRule(policy, country), country)
        .toEqual({ signup: false, pay: false, reason: "TERMS_EXCLUDED", blocked: false });
      expect(decideAsk(policy, { ipCountry: country }), country).toEqual({ kind: "ALLOW" });
    }
    expect(decideSignup(policy, { ipCountry: "KR", tor: false })).toEqual({ kind: "ALLOW" });
    expect(decideSignup(policy, { ipCountry: "RO", tor: true })).toEqual({ kind: "REFUSE", code: "TOR_REFUSED" });
    expect(decideSignup(policy, { ipCountry: "XX", tor: true })).toEqual({ kind: "REFUSE", code: "TOR_REFUSED" });
  });

  it("decides payment in the spec's order, the first matching rule deciding", () => {
    const pay = (ipCountry: string, declaredCountry: string, tor = false) =>
      decidePayment(policy, { ipCountry, tor, declaredCountry });
    // 1. the declared country's pay switch is off — even over Tor and an unknown address
    expect(pay("RO", "GB")).toEqual({ kind: "REFUSE", code: "COUNTRY_PAYMENT_UNAVAILABLE" });
    expect(pay("XX", "LI", true)).toEqual({ kind: "REFUSE", code: "COUNTRY_PAYMENT_UNAVAILABLE" });
    // 2. unknown address, or Tor (Tor wins when both)
    expect(pay("XX", "RO")).toEqual({ kind: "REFUSE", code: "COUNTRY_UNKNOWN" });
    expect(pay("DE", "RO", true)).toEqual({ kind: "REFUSE", code: "TOR_REFUSED" });
    expect(pay("XX", "RO", true)).toEqual({ kind: "REFUSE", code: "TOR_REFUSED" });
    // 3. the address is in an always-blocked country
    expect(pay("RU", "RO")).toEqual({ kind: "REFUSE", code: "COUNTRY_BLOCKED" });
    // 4. the address matches the declared country
    expect(pay("RO", "RO")).toEqual({ kind: "ALLOW" });
    expect(pay("US", "us")).toEqual({ kind: "ALLOW" });
    // 5. otherwise: a Romanian resident on holiday somewhere not offered
    expect(pay("TR", "RO")).toEqual({ kind: "CONFIRM_COUNTRY" });
    expect(pay("FR", "RO")).toEqual({ kind: "CONFIRM_COUNTRY" });
  });

  it("decides the card's country without refusing on a mismatch alone", () => {
    expect(decideCardCountry(policy, { declaredCountry: "RO", cardCountry: "RO" })).toBe("OK");
    expect(decideCardCountry(policy, { declaredCountry: "RO", cardCountry: "de" })).toBe("MISMATCH");
    expect(decideCardCountry(policy, { declaredCountry: "RO", cardCountry: null })).toBe("MISMATCH");
    expect(decideCardCountry(policy, { declaredCountry: "RO", cardCountry: "IR" })).toBe("BLOCKED");
  });

  it("decides a new debate: only the always-blocked list refuses", () => {
    expect(decideAsk(policy, { ipCountry: "RU" })).toEqual({ kind: "REFUSE", code: "COUNTRY_ASK_BLOCKED" });
    expect(decideAsk(policy, { ipCountry: "VN" })).toEqual({ kind: "REFUSE", code: "COUNTRY_ASK_BLOCKED" });
    for (const country of ["RO", "TR", "CH", "XX", "ZW"]) {
      expect(decideAsk(policy, { ipCountry: country }), country).toEqual({ kind: "ALLOW" });
    }
  });

  it("is published by the development seeder and by the hosted file, with the same value", async () => {
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(), TEST_DEVELOPMENT_PROVIDER_PANEL
    );
    const seeded = rows.filter((row) => row.rowKey === COUNTRY_POLICY_ROW_KEY);
    expect(seeded).toHaveLength(1);
    expect(JSON.parse(seeded[0]!.valueJsonText)).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value);

    const switches = await readExample(COUNTRY_POLICY_EXAMPLE);
    expect(Object.keys(switches)).toEqual(["countryPolicy"]);
    expect(switches.countryPolicy).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value);
    const example = await gatedExample();
    expect(example.countryPolicy).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value);
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(example), "utf8")));
    const published = plan.rows.filter((row) => row.rowKey === COUNTRY_POLICY_ROW_KEY);
    expect(published).toHaveLength(1);
    expect(JSON.parse(published[0]!.valueJsonText)).toEqual(example.countryPolicy);

    const bad = structuredClone(example) as { countryPolicy: { countries: Record<string, unknown> } };
    bad.countryPolicy.countries.FR = { signup: false, pay: true, reason: "OFFERED" };
    await expect(planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(bad), "utf8"))))
      .rejects.toMatchObject({ code: "COUNTRY_POLICY_INVALID" });
  });

  it("publishes NO countryPolicy row from a hosted file without the member: absent row, no gate (A14)", async () => {
    const withRow = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(await gatedExample()), "utf8")));
    expect(withRow.rows.filter((row) => row.rowKey === COUNTRY_POLICY_ROW_KEY)).toHaveLength(1);
    // The kit's default is no gate: the main example carries no countryPolicy member (final review I-3),
    // and neither does an older v1 file republished to change a provider target, say.
    const older = await readExample(HOSTED_EXAMPLE);
    expect(Object.hasOwn(older, "countryPolicy")).toBe(false);
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(older), "utf8")));
    expect(plan.rows.some((row) => row.rowKey === COUNTRY_POLICY_ROW_KEY)).toBe(false);
    expect(plan.rows).toHaveLength(withRow.rows.length - 1);
  });

  it("refuses a hosted file whose countryPolicy member is present with the value null: null is not \"left out\"", async () => {
    const withNull: Record<string, unknown> = { ...(await readExample(HOSTED_EXAMPLE)), countryPolicy: null };
    expect(Object.hasOwn(withNull, "countryPolicy")).toBe(true);
    const bytes = Buffer.from(JSON.stringify(withNull), "utf8");
    await expect((async () => planHostedRegisterPublication(parseHostedRegisterFile(bytes)))())
      .rejects.toMatchObject({ code: "COUNTRY_POLICY_INVALID" });
  });
});
