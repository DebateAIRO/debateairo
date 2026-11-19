// release-env.mjs `same` and PREVIEW_ASKS_OPEN_TO: a release's API and runner files must say the same, two releases
// side by side must too, and each file must pass the parser's own rules, so a file the launcher would refuse is named
// before any restart. A parity table holds release-env's verdict and the shared parser to one answer.
import { describe, expect, it } from "vitest";
import { parsePreviewAsksOpenTo } from "@debateai/providers";

const releaseEnv = await import("../../deploy/" + "preview-lifecycle/v1/release-env.mjs");
const sameChecks = releaseEnv.sameChecks as (releases: readonly unknown[]) => readonly Readonly<{ check: string; ok: boolean }>[];
const asksOpenValid = releaseEnv.asksOpenValid as (environment: Readonly<Record<string, string>>) => boolean;

const CONFIG = JSON.stringify({ deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-team-v2-20261009" });
const TEAM = JSON.stringify(["0b9c6c1e-5f3a-4f0e-9d6b-1a2b3c4d5e6f"]);
const OLD_KEY = ["r17", "aaaaaaaaaaaa"].join("-");
const NEW_KEY = ["r18", "0123456789ab"].join("-");
const PORTS = { A: { ui: "3100", api: "3101" }, B: { ui: "3200", api: "3201" } } as const;

type Env = Record<string, string>;
/** One release's three files: the team rule (team) or open asks (a value), on the hosted preview. */
function release(label: string, slot: "A" | "B", key: string, asks: Readonly<{ api?: Env; runner?: Env; both?: Env }> = {}) {
  const version = /^r(\d+)-/.exec(key)![1]!;
  const worker = `debateai-preview-runner-${key}`;
  const common = { DEBATEAI_DEPLOYMENT_MODE: "hosted", PREVIEW_PROVIDER_TEST_CONFIG_JSON: CONFIG, HATCHET_WORKFLOW_NAME: "debateai-preview-run",
    REGISTER_VERSION: version, RELEASE_KEY: key };
  const strip = (env: Env) => Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  return { label, slot,
    api: strip({ ...common, PREVIEW_TEAM_USER_IDS_JSON: TEAM, API_PORT: PORTS[slot].api, ...asks.both, ...asks.api }),
    runner: strip({ ...common, PREVIEW_TEAM_USER_IDS_JSON: TEAM, RUNNER_WORKER_ID: worker, HATCHET_WORKER_NAME: worker, ...asks.both, ...asks.runner }),
    ui: { RELEASE_KEY: key, PORT: PORTS[slot].ui, DIALECTICAL_API_BASE: `http://127.0.0.1:${PORTS[slot].api}` } };
}
/** An empty value here means "remove the key" (strip above). */
const OPEN = (value = "everyone"): Env => ({ PREVIEW_ASKS_OPEN_TO: value, PREVIEW_TEAM_USER_IDS_JSON: "" });
const bad = (results: readonly Readonly<{ check: string; ok: boolean }>[]) => results.filter((result) => !result.ok).map((result) => result.check);

describe("same: PREVIEW_ASKS_OPEN_TO", () => {
  it("both absent (today's default, and a drained upload's derive): every new check is OK", () => {
    const results = sameChecks([release("old-v1", "A", OLD_KEY), release("new-v1", "B", NEW_KEY)]);
    expect(bad(results)).toEqual([]);
    expect(results.map((result) => result.check)).toEqual(expect.arrayContaining([
      "SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:old-v1", "VALID_PREVIEW_ASKS_OPEN_TO:old-v1",
      "SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:new-v1", "VALID_PREVIEW_ASKS_OPEN_TO:new-v1", "SAME_PREVIEW_ASKS_OPEN_TO"]));
  });

  it.each(["everyone", "everyone-with-test-payments"])("both files %s with no team key: OK, alone or beside a release that says the same", (value) => {
    expect(bad(sameChecks([release("t", "A", NEW_KEY, { both: OPEN(value) })]))).toEqual([]);
    expect(bad(sameChecks([release("old-v1", "A", OLD_KEY, { both: OPEN(value) }), release("new-v1", "B", NEW_KEY, { both: OPEN(value) })]))).toEqual([]);
  });

  it("one file without the key: BAD SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:<label>", () => {
    // The runner keeps the team; the API opened. Both files are each valid, but they disagree (the team key differs too).
    expect(bad(sameChecks([release("t", "A", NEW_KEY, { api: OPEN() })])))
      .toEqual(["SAME_API_RUNNER_PREVIEW_TEAM_USER_IDS_JSON:t", "SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:t"]);
    expect(bad(sameChecks([release("t", "A", NEW_KEY, { both: OPEN(), runner: OPEN("everyone-with-test-payments") })])))
      .toEqual(["SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:t"]);
  });

  it("two releases that differ: BAD SAME_PREVIEW_ASKS_OPEN_TO", () => {
    expect(bad(sameChecks([release("old-v1", "A", OLD_KEY, { both: OPEN() }), release("new-v1", "B", NEW_KEY, { both: OPEN("everyone-with-test-payments") })])))
      .toEqual(["SAME_PREVIEW_ASKS_OPEN_TO"]);
    expect(bad(sameChecks([release("old-v1", "A", OLD_KEY), release("new-v1", "B", NEW_KEY, { both: OPEN() })])))
      .toEqual(["SAME_PREVIEW_TEAM_USER_IDS_JSON", "SAME_PREVIEW_ASKS_OPEN_TO"]);
  });

  it.each([
    ["a team key beside it", { PREVIEW_ASKS_OPEN_TO: "everyone" }],
    ["local mode", { ...OPEN(), DEBATEAI_DEPLOYMENT_MODE: "local" }],
    ["no preview configuration", { ...OPEN(), PREVIEW_PROVIDER_TEST_CONFIG_JSON: "" }],
    ["a value of neither form", OPEN("Everyone")]
  ])("%s in both files: BAD VALID_PREVIEW_ASKS_OPEN_TO:<label>", (_name, both) => {
    expect(bad(sameChecks([release("t", "A", NEW_KEY, { both })]))).toEqual(["VALID_PREVIEW_ASKS_OPEN_TO:t"]);
  });
});

describe("release-env and the shared parser give one verdict", () => {
  const rows: Env[] = [];
  for (const value of [undefined, "everyone", "everyone-with-test-payments", "Everyone", "true", "", "everyone "]) {
    for (const team of [undefined, "[]", TEAM]) for (const mode of ["hosted", "local"]) for (const config of [CONFIG, undefined]) {
      const env: Env = { DEBATEAI_DEPLOYMENT_MODE: mode };
      if (value !== undefined) env.PREVIEW_ASKS_OPEN_TO = value;
      if (team !== undefined) env.PREVIEW_TEAM_USER_IDS_JSON = team;
      if (config !== undefined) env.PREVIEW_PROVIDER_TEST_CONFIG_JSON = config;
      rows.push(env);
    }
  }
  it("over every combination of value, team key, mode and preview configuration", () => {
    for (const env of rows) {
      let parser: boolean;
      try {
        parsePreviewAsksOpenTo(env.PREVIEW_ASKS_OPEN_TO, { previewConfigured: env.PREVIEW_PROVIDER_TEST_CONFIG_JSON !== undefined,
          teamKeyPresent: env.PREVIEW_TEAM_USER_IDS_JSON !== undefined, hosted: env.DEBATEAI_DEPLOYMENT_MODE === "hosted" });
        parser = true;
      } catch {
        parser = false;
      }
      expect(asksOpenValid(env), JSON.stringify(env)).toBe(parser);
    }
    expect(rows).toHaveLength(7 * 3 * 2 * 2);
  });
});
