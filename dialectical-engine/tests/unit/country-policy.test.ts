import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  COUNTRY_POLICY_ROW_KEY,
  countryPolicyFromValue,
  countryRule,
  declaredRegionRule,
  loadBootstrapRegister,
  readCountryPolicy,
  regionRule,
  type CountryPolicy
} from "@debateai/register";
import { PAYMENT_REGION_IDS } from "@debateai/kernel";
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
  { codes: ["KR", "CH", "TW", "MD"], rule: { signup: true, pay: false, reason: "TAX_NOT_READY", blocked: false } },
  { codes: ["GB", "UA"], rule: { signup: false, pay: false, reason: "NOT_OFFERED", blocked: false } },
  { codes: ["TR", "BR", "ID", "SA", "IN", "AE", "MX", "AR", "CO", "CL", "TH", "PH", "IL"], rule: { signup: false, pay: false, reason: "TERMS_EXCLUDED", blocked: false } },
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
    expect(new Set(listed).size).toBe(66);
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

  it("closes Tennessee by the Terms (owner's amendment of 8 October 2026) and leaves every other state on the US rule", () => {
    const excluded = { signup: false, pay: false, reason: "TERMS_EXCLUDED", blocked: false };
    expect(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.us_states).toEqual({ TN: { signup: false, pay: false, reason: "TERMS_EXCLUDED" } });
    expect(policy.usStates).toEqual({ TN: excluded });
    expect(declaredRegionRule(policy, { country: "US", usState: "TN" })).toEqual(excluded);
    expect(declaredRegionRule(policy, { country: "US", usState: "TX" })).toEqual(countryRule(policy, "US"));
    expect(declaredRegionRule(policy, { country: "RO", usState: null })).toEqual(countryRule(policy, "RO"));
    // A state is declared, never seen in an address: Tennessee does not touch new debates or IP sign-up.
    expect(policy.usStates.TN!.blocked).toBe(false);
    expect(decideSignup(policy, { ipCountry: "US", tor: false })).toEqual({ kind: "ALLOW" });
  });

  it("refuses a state outside the picker's list, a blocked state, and keeps a row without us_states valid", () => {
    expect(invalid((value) => { value.us_states = { ZZ: { signup: false, pay: false, reason: "TERMS_EXCLUDED" } }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { value.us_states = { tn: { signup: false, pay: false, reason: "TERMS_EXCLUDED" } }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { value.us_states = { TN: { signup: false, pay: false, reason: "SANCTIONS", blocked: true } }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { value.us_states = { TN: { signup: false, pay: true, reason: "OFFERED" } }; }))
      .toBe("COUNTRY_POLICY_INVALID");
    expect(invalid((value) => { delete value.us_states; })).toBeUndefined();
    const { us_states: _states, ...older } = COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    expect(countryPolicyFromValue(older, "older").usStates).toEqual({});
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
    for (const country of ["GB", "UA", "TR", "RU", "ZW"]) {
      expect(decideSignup(policy, { ipCountry: country, tor: false }), country)
        .toEqual({ kind: "REFUSE", code: "COUNTRY_SIGNUP_UNAVAILABLE" });
    }
    expect(decideSignup(policy, { ipCountry: "XX", tor: false })).toEqual({ kind: "REFUSE", code: "COUNTRY_UNKNOWN" });
    // Owner's amendment of 2 October 2026: the UK ships after launch, not yet — not offered, not blocked.
    expect(countryRule(policy, "GB")).toEqual({ signup: false, pay: false, reason: "NOT_OFFERED", blocked: false });
    // Owner's amendment of 1 October 2026: the nine countries the Terms do not list are closed as
    // Terms-excluded, not blocked; South Korea, which the Terms list, stays open. Since the owner's
    // amendment of 9 October 2026, Israel is closed the same way.
    for (const country of ["SA", "IN", "PH", "IL"]) {
      expect(decideSignup(policy, { ipCountry: country, tor: false }), country)
        .toEqual({ kind: "REFUSE", code: "COUNTRY_SIGNUP_UNAVAILABLE" });
      expect(countryRule(policy, country), country)
        .toEqual({ signup: false, pay: false, reason: "TERMS_EXCLUDED", blocked: false });
      expect(decideAsk(policy, { ipCountry: country }), country).toEqual({ kind: "ALLOW" });
    }
    expect(decideSignup(policy, { ipCountry: "KR", tor: false })).toEqual({ kind: "ALLOW" });
    // Owner's amendment of 1 October 2026: Switzerland, Taiwan and Moldova open for sign-up;
    // payment stays off until each country's tax registration is checked.
    for (const country of ["CH", "TW", "MD"]) {
      expect(decideSignup(policy, { ipCountry: country, tor: false }), country).toEqual({ kind: "ALLOW" });
      expect(countryRule(policy, country), country)
        .toEqual({ signup: true, pay: false, reason: "TAX_NOT_READY", blocked: false });
      expect(decidePayment(policy, { ipCountry: country, tor: false, declaredCountry: country }), country)
        .toEqual({ kind: "REFUSE", code: "COUNTRY_PAYMENT_UNAVAILABLE" });
    }
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

/**
 * Payment region blocks (spec 2026-10-20 §2 and §7): the owner's launch list of 20 October 2026, spelled out here
 * on purpose (never derived from the code), so a changed code row fails this test.
 */
const CLOSED = { pay: false, reason: "TAX_NOT_READY" } as const;
const LAUNCH_REGIONS = {
  "CA-SK": CLOSED, "CA-MB": CLOSED,
  "US-DC": CLOSED, "US-HI": CLOSED, "US-MD": CLOSED, "US-RI": CLOSED, "US-VT": CLOSED, "US-WV": CLOSED, "US-NJ": CLOSED,
  "US-OH": { pay: false, reason: "TAX_NOT_READY", buyers: "business" },
  "ES-CN": CLOSED, "ES-CE": CLOSED, "ES-ML": CLOSED,
  "FR-971": CLOSED, "FR-972": CLOSED, "FR-973": CLOSED, "FR-974": CLOSED, "FR-976": CLOSED,
  "FI-01": CLOSED, "GR-69": CLOSED, "IT-LIVIGNO": CLOSED, "IT-CAMPIONE": CLOSED, "DE-HELGOLAND": CLOSED, "DE-BUESINGEN": CLOSED
} as const;

function invalidRegions(regions: unknown): string | undefined {
  return invalid((value) => { value.regions = regions; });
}

describe("countryPolicy regions (payment region blocks, spec 2026-10-20 §7)", () => {
  it("carries exactly the owner's launch list of 20 October 2026, every id a known region", () => {
    expect(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.regions).toEqual(LAUNCH_REGIONS);
    expect(Object.keys(LAUNCH_REGIONS)).toHaveLength(24);
    for (const id of Object.keys(LAUNCH_REGIONS)) expect(PAYMENT_REGION_IDS, id).toContain(id);
  });

  it("parses a value with regions: buyers defaults to all, and regionRule reads one region or null", () => {
    const closed = { pay: false, reason: "TAX_NOT_READY", buyers: "all" };
    expect(Object.keys(policy.regions).sort()).toEqual(Object.keys(LAUNCH_REGIONS).sort());
    expect(regionRule(policy, "US-MD")).toEqual(closed);
    expect(regionRule(policy, "CA-SK")).toEqual(closed);
    expect(regionRule(policy, "ES-CN")).toEqual(closed);
    expect(regionRule(policy, "US-OH")).toEqual({ pay: false, reason: "TAX_NOT_READY", buyers: "business" });
    // An open region, and a string that is no region id at all, have no rule: the country's rule decides.
    expect(regionRule(policy, "US-TX")).toBeNull();
    expect(regionRule(policy, "CA-ON")).toBeNull();
    expect(regionRule(policy, "toString")).toBeNull();
    // A pay switch that is on is a valid rule too (nothing refuses it), and is read back as written.
    const open = countryPolicyFromValue(
      { ...COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, regions: { "US-MD": { pay: true, reason: "OFFERED" } } }, "test"
    );
    expect(open.regions).toEqual({ "US-MD": { pay: true, reason: "OFFERED", buyers: "all" } });
  });

  it("still parses a value without regions, the shape of every older sealed version, with regions = {}", () => {
    expect(invalid((value) => { delete value.regions; })).toBeUndefined();
    const { regions: _regions, ...older } = COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    const parsed = countryPolicyFromValue(older, "older");
    expect(parsed.regions).toEqual({});
    expect(regionRule(parsed, "US-MD")).toBeNull();
  });

  it("refuses an id the code does not know: a made-up one, the wrong case, half of the shared Canadian id", () => {
    expect(invalidRegions({ "CA-NT-NU": CLOSED, "IT-LIVIGNO": CLOSED })).toBeUndefined();
    for (const id of ["US-ZZ", "us-md", "ES-CANARY", "CA-NT", "CA-NU", "US", "FR-975", ""]) {
      expect(invalidRegions({ [id]: CLOSED }), id).toBe("COUNTRY_POLICY_INVALID");
    }
  });

  it("refuses a region rule with blocked or signup: sign-up is never gated by region", () => {
    expect(invalidRegions({ "US-MD": CLOSED })).toBeUndefined();
    for (const extra of [{ blocked: true }, { blocked: false }, { signup: true }, { signup: false }]) {
      expect(invalidRegions({ "US-MD": { ...CLOSED, ...extra } }), JSON.stringify(extra)).toBe("COUNTRY_POLICY_INVALID");
    }
  });

  it("refuses buyers other than \"business\" (absent means all buyers), and any other malformed rule", () => {
    for (const buyers of ["all", "consumer", "BUSINESS", null, true]) {
      expect(invalidRegions({ "US-OH": { ...CLOSED, buyers } }), String(buyers)).toBe("COUNTRY_POLICY_INVALID");
    }
    expect(invalidRegions({ "US-MD": { reason: "TAX_NOT_READY" } })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({ "US-MD": { pay: false } })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({ "US-MD": { pay: "false", reason: "TAX_NOT_READY" } })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({ "US-MD": { pay: false, reason: "CLOSED" } })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({ "US-MD": { ...CLOSED, note: "x" } })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({ "US-MD": null })).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions(null)).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions([])).toBe("COUNTRY_POLICY_INVALID");
    expect(invalidRegions({})).toBeUndefined();
  });

  it("the hosted kit's country-policy.example.json parses, and its regions equal the code row's", async () => {
    const switches = await readExample(COUNTRY_POLICY_EXAMPLE) as { countryPolicy: { regions?: unknown } };
    const parsed = countryPolicyFromValue(switches.countryPolicy, "example");
    expect(switches.countryPolicy.regions).toEqual(LAUNCH_REGIONS);
    expect(switches.countryPolicy.regions).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.regions);
    expect(parsed.regions).toEqual(policy.regions);
  });
});
