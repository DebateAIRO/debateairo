import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW,
  TAX_AUTHORITIES_ROW_KEY,
  readTaxAuthorities,
  taxAuthoritiesFromValue,
  taxAuthorityFor
} from "../../packages/register/src/index.js";
import {
  hostedRegisterRefusalCode,
  parseHostedRegisterFile,
  planHostedRegisterPublication
} from "../../apps/runner/src/hosted-register-publish.js";

const EXAMPLE = new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url);
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const PAYABLE_LATER_OR_NOW = [...EU, "NO", "IS", "US", "CA", "AU", "NZ", "SG", "JP",
  "GB", "KR", "IN", "AE", "SA", "MX", "AR", "CO", "CL", "TH", "PH"];

const dev = () => taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef);
const codeOf = (run: () => unknown): string => {
  try {
    run();
    return "NO_REFUSAL";
  } catch (error) {
    return (error as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("P16a taxAuthorities v1", () => {
  it("is the taxAuthorities row and parses as sealed", () => {
    expect(TAX_AUTHORITIES_ROW_KEY).toBe("taxAuthorities");
    expect(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.rowKey).toBe("taxAuthorities");
    const authorities = dev();
    expect(authorities.entries.map((entry) => entry.scheme)).toEqual([
      "RO_D300", "EU_REVERSE_CHARGE_D390", "EU_OSS", "NO_VOEC", "IS_VOES", "GB_HMRC", "US_STATE", "CA_GST", "AU_GST",
      "NZ_GST", "SG_GST", "JP_CONSUMPTION_TAX", "KR_VAT", "IN_GST", "AE_VAT", "SA_VAT", "MX_IVA", "AR_IVA", "CO_IVA",
      "CL_IVA", "TH_VAT", "PH_VAT"
    ]);
    expect(Object.isFrozen(authorities)).toBe(true);
  });

  it("names the authority for every country the site sells in, first match wins", () => {
    const authorities = dev();
    expect(taxAuthorityFor(authorities, "RO", "TAXABLE")?.scheme).toBe("RO_D300");
    expect(taxAuthorityFor(authorities, "DE", "REVERSE_CHARGE")?.scheme).toBe("EU_REVERSE_CHARGE_D390");
    expect(taxAuthorityFor(authorities, "DE", "TAXABLE")?.scheme).toBe("EU_OSS");
    expect(taxAuthorityFor(authorities, "GR", "TAXABLE")?.scheme).toBe("EU_OSS");
    expect(taxAuthorityFor(authorities, "US", "NOT_REGISTERED")?.scheme).toBe("US_STATE");
    expect(taxAuthorityFor(authorities, "GB", "TAXABLE")).toMatchObject({ scheme: "GB_HMRC", registration: "FROM_FIRST_SALE" });
    expect(taxAuthorityFor(authorities, "ZZ", "TAXABLE")).toBeNull();
    for (const country of PAYABLE_LATER_OR_NOW) {
      expect(taxAuthorityFor(authorities, country, "TAXABLE"), country).not.toBeNull();
    }
    expect(taxAuthorityFor(authorities, "DE", "TAXABLE")?.due).toEqual({ rule: "QUARTER_FOLLOWING_MONTH_END" });
    expect(taxAuthorityFor(authorities, "RO", "TAXABLE")?.due).toEqual({ rule: "FOLLOWING_MONTH_DAY", day: 25 });
  });

  it("refuses a repeated scheme, a lower-case country, an empty line and a missing provenance", () => {
    const value = TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value;
    const first = value.entries[0]!;
    expect(codeOf(() => taxAuthoritiesFromValue({ ...value, entries: [...value.entries, first] }, "x"))).toBe("TAX_AUTHORITIES_INVALID");
    expect(codeOf(() => taxAuthoritiesFromValue({ ...value, entries: [{ ...first, countries: ["ro"] }] }, "x"))).toBe("TAX_AUTHORITIES_INVALID");
    expect(codeOf(() => taxAuthoritiesFromValue({ ...value, entries: [{ ...first, where: " " }] }, "x"))).toBe("TAX_AUTHORITIES_INVALID");
    expect(codeOf(() => taxAuthoritiesFromValue(value, " "))).toBe("TAX_AUTHORITIES_INVALID");
  });

  it("reads null when the version has no such row, and the row when it has one", async () => {
    const pool = (row: unknown) => ({
      query: async () => ({ rows: row === null ? [] : [{ value_json: row, source_ref: "v1" }] })
    }) as never;
    expect(await readTaxAuthorities(pool(null), 3)).toBeNull();
    expect((await readTaxAuthorities(pool(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value), 3))?.entries).toHaveLength(22);
  });

  it("ships the same value in the hosted example, and lets the operator publish a corrected one", async () => {
    const example = JSON.parse(await readFile(EXAMPLE, "utf8")) as Record<string, unknown>;
    expect(example.taxAuthorities).toEqual(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value);
    // Left out of the hosted file, the code-owned row is published unchanged (the words P22's register README uses).
    const { taxAuthorities: _left, ...without } = example;
    const defaulted = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(without))));
    const published = defaulted.rows.find((candidate) => candidate.rowKey === "taxAuthorities");
    expect(JSON.parse(published!.valueJsonText)).toEqual(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value);
    const corrected = structuredClone(example) as { taxAuthorities: { fallback: { when: string } } };
    corrected.taxAuthorities.fallback.when = "Ask the accountant, then the owner.";
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(corrected))));
    const row = plan.rows.find((candidate) => candidate.rowKey === "taxAuthorities");
    expect(JSON.parse(row!.valueJsonText).fallback.when).toBe("Ask the accountant, then the owner.");
    const broken = structuredClone(example) as { taxAuthorities: { entries: unknown[] } };
    broken.taxAuthorities.entries = [];
    let code = "NO_REFUSAL";
    try {
      await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(broken))));
    } catch (error) {
      code = hostedRegisterRefusalCode(error);
    }
    expect(code).toBe("TAX_AUTHORITIES_INVALID");
  });
});
