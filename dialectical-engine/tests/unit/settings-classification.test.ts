/**
 * Side-by-side spec §13 (Phase 2, Task S2): the code-owned row classification and the mixed-row member map.
 *
 *  1. completeness: every register row key the code knows has a kind (never UNCLASSIFIED), and the table names no
 *     key the code does not know;
 *  2. the member map: for each MIXED row, site ∪ debate is exactly the row schema's member list, and disjoint;
 *  3. `compareSiteSettings` (spec §13 condition 2);
 *  4. `composeDebateCostEnvelope` (spec §9/§13: the debate's per-run members over the site's day and band);
 *  5. `debateCallLaneLimits` (the debate's lanes; perModelPerRunner is never read from it).
 */
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import * as registerModule from "@debateai/register";
import {
  ALGORITHM_REGISTER_ROW_FAMILIES,
  AUTH_POLICY_ROW_KEYS,
  BILLING_PLANS_MEMBERS,
  BOOTSTRAP_REGISTER_ROW_KEYS,
  CALL_CONCURRENCY_POLICY_MEMBERS,
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  COST_ENVELOPE_POLICY_MEMBERS,
  MIXED_SETTINGS_ROW_MEMBERS,
  SETTINGS_ROW_KINDS,
  STORY_ROW_KEYS,
  SUPPORT_CONFIGURATION_KEYS,
  compareSiteSettings,
  composeDebateCostEnvelope,
  costEnvelopePolicyFromValue,
  debateCallLaneLimits,
  parseCanonicalRegisterJson,
  readSettingsComparisonRows,
  settingsRowKind,
  type CanonicalRegisterJson,
  type SettingsComparisonRow
} from "@debateai/register";
import * as evaluatorModule from "../../packages/evaluator/src/index.js";
import { DEVELOPMENT_RUNNER_ROW_KEYS } from "../../apps/runner/src/dev-runner-policy.js";
import {
  PREVIEW_BASE_OWNED_KEYS,
  PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2,
  PREVIEW_SOURCE_ROW_KEYS_V2
} from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

/** Row keys an exported module value names: `*_ROW_KEY` strings, `*_ROW_KEYS` lists, `*_REGISTER_ROW(S)` rows. */
function rowKeysExportedBy(moduleExports: Readonly<Record<string, unknown>>): string[] {
  const found: string[] = [];
  const rowKeyOf = (value: unknown): string | null =>
    value !== null && typeof value === "object" && typeof (value as { rowKey?: unknown }).rowKey === "string"
      ? (value as { rowKey: string }).rowKey : null;
  for (const [name, value] of Object.entries(moduleExports)) {
    if (name.endsWith("ROW_KEY") && typeof value === "string") found.push(value);
    if (name.endsWith("ROW_KEYS") && Array.isArray(value)) found.push(...value.filter((key) => typeof key === "string"));
    if (name.endsWith("REGISTER_ROW") && rowKeyOf(value) !== null) found.push(rowKeyOf(value)!);
    if (name.endsWith("REGISTER_ROWS") && Array.isArray(value)) {
      for (const row of value) if (rowKeyOf(row) !== null) found.push(rowKeyOf(row)!);
    }
  }
  return found;
}

/** Every register row key known to code (Ruling R14 adds the evaluator rows and the two SQL-only/literal keys). */
function rowKeysKnownToCode(): Readonly<Record<string, readonly string[]>> {
  return {
    registerExports: rowKeysExportedBy(registerModule as Readonly<Record<string, unknown>>),
    evaluatorExports: rowKeysExportedBy(evaluatorModule as Readonly<Record<string, unknown>>),
    story: STORY_ROW_KEYS,
    auth: AUTH_POLICY_ROW_KEYS,
    bootstrap: BOOTSTRAP_REGISTER_ROW_KEYS,
    // supportActivation has no code constant: it is the support publication's activation row (0055).
    support: [...SUPPORT_CONFIGURATION_KEYS, "supportActivation"],
    algorithm: Object.values(ALGORITHM_REGISTER_ROW_FAMILIES).flatMap((keys) => [...keys]),
    developmentRunner: DEVELOPMENT_RUNNER_ROW_KEYS,
    previewSource: PREVIEW_SOURCE_ROW_KEYS_V2,
    previewOptional: PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2,
    previewBaseOwned: PREVIEW_BASE_OWNED_KEYS,
    // approvedOperatorVariants is sealed and read only in SQL (migrations 0049, 0120): no TypeScript constant.
    sqlOnly: ["approvedOperatorVariants"]
  };
}

const canonical = (value: unknown): CanonicalRegisterJson =>
  parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8"));
const row = (rowKey: string, value: unknown): SettingsComparisonRow => Object.freeze({ rowKey, valueJsonText: canonical(value) });

const COST_VALUE = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
const CALL_VALUE = Object.freeze({
  kind: "CALL_CONCURRENCY_POLICY", perDebate: 12, perModelPerDebate: 3,
  perModelPerRunner: Object.freeze({ default: 50, deepinfra: 150 })
});
const baseRows = (): SettingsComparisonRow[] => [
  row("rateLimitPolicy", { kind: "RATE_LIMIT_POLICY", windows: [1, 2, 3] }),
  row("costEnvelopePolicy", COST_VALUE),
  row("callConcurrencyPolicy", CALL_VALUE),
  row("billingPlans", { kind: "BILLING_PLANS", credit_currency: "USD", plans: [] }),
  row("verdictHighCut", { value: 0.7 }),
  row("mapContractHash", { hash: "a".repeat(64) })
];
const replaced = (rows: SettingsComparisonRow[], replacement: SettingsComparisonRow): SettingsComparisonRow[] =>
  rows.map((candidate) => candidate.rowKey === replacement.rowKey ? replacement : candidate);

describe("settings row classification (side-by-side spec §13)", () => {
  it("classifies every row key known to code, and names no key the code does not know", () => {
    const sources = rowKeysKnownToCode();
    const unclassified = Object.entries(sources).flatMap(([source, keys]) =>
      keys.filter((key) => settingsRowKind(key) === "UNCLASSIFIED").map((key) => `${source}:${key}`));
    expect(unclassified).toEqual([]);
    for (const keys of Object.values(sources)) expect(keys.length).toBeGreaterThan(0);
    const known = new Set(Object.values(sources).flat());
    expect(Object.keys(SETTINGS_ROW_KINDS).filter((key) => !known.has(key))).toEqual([]);
  });

  it("answers UNCLASSIFIED for an unknown key, including object-prototype names", () => {
    for (const key of ["previewSomethingNew", "__proto__", "toString", "constructor", ""]) {
      expect(settingsRowKind(key)).toBe("UNCLASSIFIED");
    }
    expect(settingsRowKind("costEnvelopePolicy")).toBe("MIXED");
    expect(settingsRowKind("rateLimitPolicy")).toBe("SITE");
    expect(settingsRowKind("verdictHighCut")).toBe("DEBATE");
    expect(settingsRowKind("engineContractHash")).toBe("CODE_BOUND");
    expect(Object.isFrozen(SETTINGS_ROW_KINDS)).toBe(true);
  });

  it("has a member map whose two lists are disjoint and together are exactly each MIXED row's schema members", () => {
    const schemaMembers: Readonly<Record<keyof typeof MIXED_SETTINGS_ROW_MEMBERS, readonly string[]>> = {
      costEnvelopePolicy: COST_ENVELOPE_POLICY_MEMBERS,
      billingPlans: BILLING_PLANS_MEMBERS,
      callConcurrencyPolicy: CALL_CONCURRENCY_POLICY_MEMBERS
    };
    const mixedRows = Object.entries(SETTINGS_ROW_KINDS).filter(([, kind]) => kind === "MIXED").map(([key]) => key);
    expect([...mixedRows].sort()).toEqual(Object.keys(MIXED_SETTINGS_ROW_MEMBERS).sort());
    for (const [rowKey, members] of Object.entries(MIXED_SETTINGS_ROW_MEMBERS)) {
      const { site, debate } = members;
      expect(site.filter((member) => debate.includes(member)), rowKey).toEqual([]);
      expect([...site, ...debate].sort(), rowKey)
        .toEqual([...schemaMembers[rowKey as keyof typeof schemaMembers]].sort());
      expect(Object.isFrozen(site) && Object.isFrozen(debate) && Object.isFrozen(members), rowKey).toBe(true);
    }
    expect(MIXED_SETTINGS_ROW_MEMBERS.billingPlans.debate).toEqual([]);
    expect([...MIXED_SETTINGS_ROW_MEMBERS.costEnvelopePolicy.debate].sort())
      .toEqual(["per_run_ceiling_micros", "serve_overrun_basis_points", "serve_reserve_basis_points"]);
    expect([...MIXED_SETTINGS_ROW_MEMBERS.callConcurrencyPolicy.debate].sort()).toEqual(["perDebate", "perModelPerDebate"]);
  });
});

describe("compareSiteSettings (spec §13 condition 2)", () => {
  it("finds nothing between equal versions", () => {
    expect(compareSiteSettings({ site: baseRows(), candidate: baseRows() })).toEqual([]);
  });

  it("names a changed SITE row", () => {
    const candidate = replaced(baseRows(), row("rateLimitPolicy", { kind: "RATE_LIMIT_POLICY", windows: [1, 2, 4] }));
    expect(compareSiteSettings({ site: baseRows(), candidate }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "rateLimitPolicy" }]);
  });

  it("lets the cost envelope's per-run members move and names a changed daily ceiling", () => {
    const perRun = replaced(baseRows(), row("costEnvelopePolicy", {
      ...COST_VALUE, per_run_ceiling_micros: 300000, serve_reserve_basis_points: 1000, serve_overrun_basis_points: 0
    }));
    expect(compareSiteSettings({ site: baseRows(), candidate: perRun })).toEqual([]);
    const daily = replaced(baseRows(), row("costEnvelopePolicy", { ...COST_VALUE, daily_ceiling_micros: 3000000 }));
    expect(compareSiteSettings({ site: baseRows(), candidate: daily }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "costEnvelopePolicy", member: "daily_ceiling_micros" }]);
  });

  it("treats an absent site member as null: dropping the band is a difference per band member", () => {
    const { admission_close_basis_points: _close, finish_up_to_basis_points: _finish, waiting_line_per_person: _line,
      ...withoutBand } = COST_VALUE;
    const candidate = replaced(baseRows(), row("costEnvelopePolicy", withoutBand));
    expect(compareSiteSettings({ site: baseRows(), candidate }).map((difference) => difference.member)).toEqual([
      "admission_close_basis_points", "finish_up_to_basis_points", "waiting_line_per_person"
    ]);
  });

  it("lets the debate's call lanes move and names a changed per-runner limit", () => {
    const lanes = replaced(baseRows(), row("callConcurrencyPolicy", { ...CALL_VALUE, perDebate: 20, perModelPerDebate: 5 }));
    expect(compareSiteSettings({ site: baseRows(), candidate: lanes })).toEqual([]);
    const perRunner = replaced(baseRows(), row("callConcurrencyPolicy", {
      ...CALL_VALUE, perModelPerRunner: { default: 50, deepinfra: 151 }
    }));
    expect(compareSiteSettings({ site: baseRows(), candidate: perRunner }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "callConcurrencyPolicy", member: "perModelPerRunner" }]);
  });

  it("compares the whole billing plans row (D4: no debate member today)", () => {
    const candidate = replaced(baseRows(), row("billingPlans", { kind: "BILLING_PLANS", credit_currency: "USD", plans: [1] }));
    expect(compareSiteSettings({ site: baseRows(), candidate }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "billingPlans", member: "plans" }]);
  });

  it("names a SITE row present in one version only, either way", () => {
    const withCountries = [...baseRows(), row("countryPolicy", { kind: "COUNTRY_POLICY" })];
    expect(compareSiteSettings({ site: baseRows(), candidate: withCountries }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "countryPolicy" }]);
    expect(compareSiteSettings({ site: withCountries, candidate: baseRows() }))
      .toEqual([{ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "countryPolicy" }]);
  });

  it("names every site member of a MIXED row present in one version only", () => {
    const withoutLanes = baseRows().filter((candidate) => candidate.rowKey !== "callConcurrencyPolicy");
    expect(compareSiteSettings({ site: withoutLanes, candidate: baseRows() })).toEqual([
      { code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "callConcurrencyPolicy", member: "kind" },
      { code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey: "callConcurrencyPolicy", member: "perModelPerRunner" }
    ]);
  });

  it("ignores DEBATE and CODE_BOUND rows, changed or present in one version only", () => {
    const candidate = [
      ...replaced(replaced(baseRows(), row("verdictHighCut", { value: 0.8 })), row("mapContractHash", { hash: "b".repeat(64) })),
      row("storyLoopMaxRounds", { value: 3 })
    ];
    expect(compareSiteSettings({ site: baseRows(), candidate })).toEqual([]);
  });

  it("names an unknown row key, and a MIXED member the map does not know", () => {
    const candidate = [...baseRows(), row("previewSomethingNew", { on: true })];
    expect(compareSiteSettings({ site: baseRows(), candidate }))
      .toEqual([{ code: "SETTINGS_ROW_UNCLASSIFIED", rowKey: "previewSomethingNew" }]);
    const extraMember = replaced(baseRows(), row("callConcurrencyPolicy", { ...CALL_VALUE, perStoryLane: 2 }));
    expect(compareSiteSettings({ site: baseRows(), candidate: extraMember }))
      .toEqual([{ code: "SETTINGS_ROW_UNCLASSIFIED", rowKey: "callConcurrencyPolicy", member: "perStoryLane" }]);
  });

  it("never minds key order inside a value (canonical text)", () => {
    const reordered = (rowKey: string, text: string): SettingsComparisonRow =>
      Object.freeze({ rowKey, valueJsonText: text as CanonicalRegisterJson });
    const candidate = replaced(replaced(baseRows(),
      reordered("rateLimitPolicy", "{ \"windows\": [1, 2, 3], \"kind\": \"RATE_LIMIT_POLICY\" }")),
      reordered("callConcurrencyPolicy", JSON.stringify({
        perModelPerRunner: { deepinfra: 150, default: 50 }, perModelPerDebate: 3, perDebate: 12, kind: "CALL_CONCURRENCY_POLICY"
      })));
    expect(compareSiteSettings({ site: baseRows(), candidate })).toEqual([]);
  });

  it("refuses a version that lists one row key twice", () => {
    expect(() => compareSiteSettings({ site: [...baseRows(), row("rateLimitPolicy", {})], candidate: baseRows() }))
      .toThrowError("SETTINGS_COMPARISON_ROWS_INVALID");
  });
});

describe("readSettingsComparisonRows", () => {
  const fakePool = (version: Readonly<{ sealed: boolean; row_count: number }> | null,
    rows: ReadonlyArray<Readonly<{ row_key: string; value_json_text: string }>>) => {
    const queries: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
    const pool = {
      query: async (text: string, values: readonly unknown[]) => {
        queries.push({ text, values });
        if (/FROM register\.register_version\b/u.test(text)) return { rows: version === null ? [] : [version] };
        return { rows };
      }
    } as unknown as Pick<Pool, "query">;
    return { pool, queries };
  };

  it("reads one sealed version's rows by its number, in canonical text", async () => {
    const { pool, queries } = fakePool({ sealed: true, row_count: 2 }, [
      { row_key: "rateLimitPolicy", value_json_text: "{\"windows\": [1, 2], \"kind\": \"R\"}" },
      { row_key: "verdictHighCut", value_json_text: "{\"value\": 0.7}" }
    ]);
    const rows = await readSettingsComparisonRows(pool, 17);
    expect(rows).toEqual([
      { rowKey: "rateLimitPolicy", valueJsonText: "{\"kind\":\"R\",\"windows\":[1,2]}" },
      { rowKey: "verdictHighCut", valueJsonText: "{\"value\":0.7}" }
    ]);
    expect(Object.isFrozen(rows) && rows.every((entry) => Object.isFrozen(entry))).toBe(true);
    for (const query of queries) {
      expect(query.values).toEqual([17]);
      expect(query.text).toMatch(/register_version\s*=\s*\$1/u);
      expect(query.text).not.toMatch(/max\s*\(|DESC|LIMIT|nextval\(/iu);
    }
  });

  it("refuses an unknown version, a row count that does not match, and a non-positive version", async () => {
    await expect(readSettingsComparisonRows(fakePool(null, []).pool, 17))
      .rejects.toMatchObject({ code: "SETTINGS_VERSION_KIND_INVALID" });
    await expect(readSettingsComparisonRows(fakePool({ sealed: true, row_count: 3 }, [
      { row_key: "verdictHighCut", value_json_text: "{\"value\": 0.7}" }
    ]).pool, 17)).rejects.toMatchObject({ code: "SETTINGS_VERSION_KIND_INVALID" });
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(readSettingsComparisonRows(fakePool({ sealed: true, row_count: 1 }, []).pool, bad))
        .rejects.toMatchObject({ code: "SETTINGS_VERSION_KIND_INVALID" });
    }
  });
});

describe("composeDebateCostEnvelope (spec §9/§13)", () => {
  const site = costEnvelopePolicyFromValue(COST_VALUE, "site-version");

  it("takes the per-run members from the debate and everything else from the site", () => {
    const debate = costEnvelopePolicyFromValue({
      kind: "COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1000000,
      per_run_ceiling_micros: 400000, daily_ceiling_micros: 9000000, provisional: false,
      provisional_reason: "debate version", serve_reserve_basis_points: 2500, serve_overrun_basis_points: 1000
    }, "debate-version");
    const composed = composeDebateCostEnvelope(site, debate);
    expect(composed).toMatchObject({
      perRunCeilingMicros: 400000, serveReserveBasisPoints: 2500, serveOverrunBasisPoints: 1000,
      dailyCeilingMicros: site.dailyCeilingMicros, currency: "USD", minorUnitsPerUnit: 1000000,
      provisional: site.provisional, provisionalReason: site.provisionalReason,
      closeBasisPoints: site.closeBasisPoints, finishBasisPoints: site.finishBasisPoints,
      waitingLinePerPerson: site.waitingLinePerPerson
    });
    expect(Object.isFrozen(composed)).toBe(true);
    expect(composeDebateCostEnvelope(site, site)).toEqual(site);
  });

  it("keeps the site's band absent when the site has none", () => {
    const { admission_close_basis_points: _close, finish_up_to_basis_points: _finish, waiting_line_per_person: _line,
      ...withoutBand } = COST_VALUE;
    const bandless = costEnvelopePolicyFromValue(withoutBand, "site-version");
    expect(composeDebateCostEnvelope(bandless, site))
      .toMatchObject({ closeBasisPoints: null, finishBasisPoints: null, waitingLinePerPerson: null });
  });

  it("throws the row's own refusal when the site's day cannot hold the debate's run", () => {
    const debate = costEnvelopePolicyFromValue({
      ...COST_VALUE, per_run_ceiling_micros: 1900000, daily_ceiling_micros: 3000000, serve_overrun_basis_points: 2000
    }, "debate-version");
    expect(() => composeDebateCostEnvelope(site, debate)).toThrow(expect.objectContaining({ code: "COST_ENVELOPE_POLICY_INVALID" }));
  });
});

describe("debateCallLaneLimits", () => {
  it("runs one call at a time when the debate's version has no row", () => {
    expect(debateCallLaneLimits({ state: "ABSENT" })).toEqual({ perDebate: 1, perModelPerDebate: 1 });
  });

  it("reads the debate's two lane members, and only those", () => {
    const limits = debateCallLaneLimits({
      state: "SET", policy: { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50 } }
    });
    expect(limits).toEqual({ perDebate: 12, perModelPerDebate: 3 });
    expect(Object.isFrozen(limits)).toBe(true);
  });
});
