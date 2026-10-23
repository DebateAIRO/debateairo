// Step 1 (owner, 2026-10-08): on the private preview only the team may start debates.
// The team is PREVIEW_TEAM_USER_IDS_JSON: a JSON array of 0..20 distinct lowercase UUIDs
// (identity user ids). Malformed refuses to boot; set without the preview configuration
// refuses to boot (it must never silently apply to the real site); missing or empty with
// the preview boots and refuses every ask at request time (fail closed).
import { describe, expect, it } from "vitest";
import { API_ENVIRONMENT_KEYS, parseApiEnvironment, parseRunnerEnvironment } from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture, validRunnerEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

const PREVIEW = JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
});
const ALICE = "0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const BOB = "9f8e7d6c-5b4a-4321-9876-543210fedcba";
const uuid = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

function parse(extra: Record<string, string>) {
  return parseApiEnvironment({ ...validApiEnvironmentFixture(), ...extra }) as ReturnType<typeof parseApiEnvironment>
    & Readonly<{ PREVIEW_TEAM_USER_IDS?: readonly string[] }>;
}

describe("PREVIEW_TEAM_USER_IDS_JSON", () => {
  it("is an optional key of the API's strict environment shape", () => {
    expect(API_ENVIRONMENT_KEYS.optional).toContain("PREVIEW_TEAM_USER_IDS_JSON");
    expect(API_ENVIRONMENT_KEYS.required).not.toContain("PREVIEW_TEAM_USER_IDS_JSON");
  });

  it("parses a valid team list on the preview into a frozen list of the same ids", () => {
    const parsed = parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE, BOB]) });
    expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([ALICE, BOB]);
    expect(Object.isFrozen(parsed.PREVIEW_TEAM_USER_IDS)).toBe(true);
  });

  it("accepts twenty members, the most a team list may hold", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => uuid(index + 1));
    expect(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify(twenty) })
      .PREVIEW_TEAM_USER_IDS).toEqual(twenty);
  });

  it.each([
    ["not JSON", "not-json"],
    ["an object", JSON.stringify({ ids: [ALICE] })],
    ["a bare string", JSON.stringify(ALICE)],
    ["null", "null"],
    ["an uppercase id", JSON.stringify([ALICE.toUpperCase()])],
    ["a padded id", JSON.stringify([` ${ALICE}`])],
    ["a braced id", JSON.stringify([`{${ALICE}}`])],
    ["a non-UUID", JSON.stringify(["owner:alice"])],
    ["a number", JSON.stringify([7])],
    ["a duplicate", JSON.stringify([ALICE, BOB, ALICE])],
    ["twenty-one members", JSON.stringify(Array.from({ length: 21 }, (_, index) => uuid(index + 1)))]
  ])("refuses to boot on %s", (_name, value) => {
    expect(() => parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: value }))
      .toThrow("PREVIEW_TEAM_USER_IDS_INVALID");
  });

  it.each([
    ["a team", JSON.stringify([ALICE])],
    ["an empty list", "[]"],
    ["an empty value", ""]
  ])("refuses to boot when it is set (%s) without the preview configuration", (_name, value) => {
    expect(() => parse({ PREVIEW_TEAM_USER_IDS_JSON: value })).toThrow("PREVIEW_TEAM_USER_IDS_WITHOUT_PREVIEW");
  });

  it.each([
    ["missing", {}],
    ["an empty list", { PREVIEW_TEAM_USER_IDS_JSON: "[]" }],
    ["an empty value", { PREVIEW_TEAM_USER_IDS_JSON: "" }]
  ])("boots on the preview when it is %s, with an empty team (every ask refused later)", (_name, extra) => {
    const parsed = parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, ...extra });
    expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([]);
    expect(Object.isFrozen(parsed.PREVIEW_TEAM_USER_IDS)).toBe(true);
  });

  it("is absent on the real site, where no team rule exists", () => {
    expect(parse({}).PREVIEW_TEAM_USER_IDS).toBeUndefined();
  });
});

// Side-by-side §13 ADDITION D14 (owner 2026-10-22): the same variable may carry only the gate part (the sockets-only
// form); the line-up then lives in the settings version (previewLineUpPolicy). Both processes parse it into the gate part
// (PREVIEW_GATE_SETTINGS) and the env line-up (PREVIEW_ENV_LINE_UP, null for the sockets-only form);
// PREVIEW_PROVIDER_TEST_CONFIG stays exactly today's parse of the two old forms and is undefined for the new one.
describe("the env setting's three forms, in both parsed environments (addition D14)", () => {
  const GLM = "zai-org/GLM-5.3-Flash", DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash", QWEN = "Qwen/Qwen3.8-Flash";
  const DEEPINFRA_SOCKET = "/run/debateai-v3-preview/provider-budget.sock";
  const ANTHROPIC_SOCKET = "/run/debateai-v3-preview/anthropic-budget-v1.sock";
  const GATE = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: DEEPINFRA_SOCKET, scope_id: "fixture" };
  const SOCKETS_ONLY = JSON.stringify({ ...GATE, anthropic_budget_socket: ANTHROPIC_SOCKET });
  const ROSTERS = JSON.stringify({ ...GATE, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, QWEN],
    thinking_levels: { [QWEN]: { level: "low" } } });
  const parsers = [
    ["API", (extra: Record<string, string>) => parseApiEnvironment({ ...validApiEnvironmentFixture(), ...extra })],
    ["runner", (extra: Record<string, string>) => parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), ...extra })]
  ] as const;

  it.each(parsers)("%s: the sockets-only form carries the gate part, no env line-up, no old config, and admits the team", (_name, parseWith) => {
    const parsed = parseWith({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: SOCKETS_ONLY, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]) });
    expect(parsed.PREVIEW_GATE_SETTINGS).toEqual({ ...GATE, anthropic_budget_socket: ANTHROPIC_SOCKET });
    expect(Object.isFrozen(parsed.PREVIEW_GATE_SETTINGS)).toBe(true);
    expect(parsed.PREVIEW_ENV_LINE_UP).toBeNull();
    expect(parsed.PREVIEW_PROVIDER_TEST_CONFIG).toBeUndefined();
    expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([ALICE]);
    // Without the team value the preview still boots with an empty team (every ask refused later), as today.
    expect(parseWith({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: JSON.stringify(GATE) }).PREVIEW_TEAM_USER_IDS).toEqual([]);
  });

  it.each(parsers)("%s: an old-form value carries all three, the env line-up equal to its rosters and table", (_name, parseWith) => {
    for (const [source, free, premium, table] of [
      [PREVIEW, [GLM], [GLM], null],
      [ROSTERS, [GLM, DEEPSEEK], [GLM, DEEPSEEK, QWEN], { [QWEN]: { level: "low" } }]
    ] as const) {
      const parsed = parseWith({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: source, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([BOB]) });
      expect(parsed.PREVIEW_GATE_SETTINGS).toEqual(GATE);
      expect(parsed.PREVIEW_PROVIDER_TEST_CONFIG?.free_model_ids).toEqual(free);
      expect(parsed.PREVIEW_PROVIDER_TEST_CONFIG?.premium_model_ids).toEqual(premium);
      expect(parsed.PREVIEW_ENV_LINE_UP).toEqual({ free_model_ids: free, premium_model_ids: premium, thinking_levels: table });
      expect(parsed.PREVIEW_ENV_LINE_UP?.free_model_ids).toEqual(parsed.PREVIEW_PROVIDER_TEST_CONFIG?.free_model_ids);
      expect(parsed.PREVIEW_ENV_LINE_UP?.thinking_levels ?? undefined).toEqual(parsed.PREVIEW_PROVIDER_TEST_CONFIG?.thinking_levels);
      expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([BOB]);
    }
  });

  it.each(parsers)("%s: without the variable all three are absent, and a team value still refuses to boot", (_name, parseWith) => {
    const parsed = parseWith({});
    expect(parsed.PREVIEW_GATE_SETTINGS).toBeUndefined();
    expect(parsed.PREVIEW_ENV_LINE_UP).toBeUndefined();
    expect(parsed.PREVIEW_PROVIDER_TEST_CONFIG).toBeUndefined();
    expect(() => parseWith({ PREVIEW_TEAM_USER_IDS_JSON: "[]" })).toThrow("PREVIEW_TEAM_USER_IDS_WITHOUT_PREVIEW");
  });

  it.each(parsers)("%s: a sockets-only value with a table (no line-up to apply it to) refuses to boot", (_name, parseWith) => {
    expect(() => parseWith({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: JSON.stringify({ ...GATE, thinking_levels: { [GLM]: { level: "high" } } }) }))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("the API entrypoint hands the team list to both consumers of the preview configuration", () => {
  it("every object that receives previewProviderTestConfig also receives the parsed team list", async () => {
    const { readFile } = await import("node:fs/promises");
    const ts = (await import("typescript-classic")).default;
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
    const carriers: string[] = [];
    const visit = (node: import("typescript-classic").Node): void => {
      if (ts.isObjectLiteralExpression(node)
        && node.properties.some((property) => ts.isPropertyAssignment(property) && property.name.getText(ast) === "previewProviderTestConfig")) {
        const team = node.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(ast) === "previewTeamUserIds");
        carriers.push(team !== undefined && ts.isPropertyAssignment(team) ? team.initializer.getText(ast) : "MISSING");
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    // buildApi (the route gate) carries both in one literal. Side-by-side spec §13 (S9): PostgresAskApplication (the
    // submit gate) takes the version's composed config from the one mapping and the team list right beside it, keyed on
    // the env's gate part (ruling R25), which every accepted preview form carries.
    expect(carriers).toEqual(["environment.PREVIEW_TEAM_USER_IDS ?? []"]);
    expect(source).toContain("  ...admissionSettingsOfVersion(siteAdmission),\n"
      + "  // Step 1: the preview's team; keyed on the env's gate part (ruling R25).\n"
      + "  ...(previewGate === undefined ? {} : { previewTeamUserIds: environment.PREVIEW_TEAM_USER_IDS ?? [] }),");
    expect(source).toContain("const previewGate = environment.PREVIEW_GATE_SETTINGS;");
  });
});
