// PREVIEW_ASKS_OPEN_TO: who may start debates on the preview instead of the team. Absent, the team rule is unchanged.
// "everyone" and "everyone-with-test-payments" let any signed-in account ask; a session without a user id is still
// refused. The API and the runner parse it with the same shared parser, so both decide alike, and every refusal is a
// TypeError whose message is its code, which the launchers print by name.
import { describe, expect, it } from "vitest";
import {
  parsePreviewAsksOpenTo, parsePreviewProviderTestConfig, previewAskAdmits, previewTeamAdmits, PREVIEW_ASKS_OPEN_TO_VALUES
} from "@debateai/providers";
import * as runtime from "../../packages/register/src/runtime-environment.js";
import { fixtureReleaseKey, validApiEnvironmentFixture, validRunnerEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

const env = await import("../../deploy/" + "preview-auth-dev/v1/environment.mjs");
const refusals = await import("../../deploy/" + "preview-auth-dev/v1/startup-refusals.mjs");

const PREVIEW = JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
});
const ALICE = "0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const HOSTED_API = Object.freeze({
  DEBATEAI_DEPLOYMENT_MODE: "hosted",
  GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
  TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt",
  TURNSTILE_SOCKET_PATH: "/run/debateai-turnstile/siteverify.sock"
});
type Parsed = Readonly<{ PREVIEW_ASKS_OPEN?: string; PREVIEW_TEAM_USER_IDS?: readonly string[] }>;
const parsers = [
  ["api", (extra: Record<string, string>, hosted = true): Parsed =>
    runtime.parseApiEnvironment({ ...validApiEnvironmentFixture(), ...(hosted ? HOSTED_API : {}), ...extra }) as Parsed],
  ["runner", (extra: Record<string, string>, hosted = true): Parsed =>
    runtime.parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), ...(hosted ? { DEBATEAI_DEPLOYMENT_MODE: "hosted" } : {}), ...extra }) as Parsed]
] as const;

describe("PREVIEW_ASKS_OPEN_TO in both environment shapes", () => {
  it("is an optional key of the API's and the runner's strict shapes, never a required one", () => {
    for (const keys of [runtime.API_ENVIRONMENT_KEYS, runtime.RUNNER_ENVIRONMENT_KEYS]) {
      expect(keys.optional).toContain("PREVIEW_ASKS_OPEN_TO");
      expect(keys.required).not.toContain("PREVIEW_ASKS_OPEN_TO");
    }
  });

  it.each(parsers)("%s: absent, the team rule is exactly today's", (_name, parse) => {
    const parsed = parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]) });
    expect(parsed.PREVIEW_ASKS_OPEN).toBeUndefined();
    expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([ALICE]);
    expect(parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW }).PREVIEW_ASKS_OPEN).toBeUndefined();
    expect(parse({}, false).PREVIEW_ASKS_OPEN).toBeUndefined();
  });

  it.each(parsers)("%s: each accepted value on the hosted preview with no team key opens asks, and the team is empty", (_name, parse) => {
    for (const value of ["everyone", "everyone-with-test-payments"]) {
      const parsed = parse({ PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: value });
      expect(parsed.PREVIEW_ASKS_OPEN).toBe(value);
      expect(parsed.PREVIEW_TEAM_USER_IDS).toEqual([]);
    }
  });

  const refusalTable: ReadonlyArray<readonly [string, Record<string, string>, boolean, string]> = [
    ["'true'", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: "true" }, true, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["'Everyone'", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: "Everyone" }, true, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["an empty value", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: "" }, true, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["a padded value", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: " everyone" }, true, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["'everyone-with-test-payment'", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: "everyone-with-test-payment" }, true, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["no preview configuration", { PREVIEW_ASKS_OPEN_TO: "everyone" }, true, "PREVIEW_ASKS_OPEN_TO_WITHOUT_PREVIEW"],
    ["a team key of '[]'", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: "[]", PREVIEW_ASKS_OPEN_TO: "everyone" }, true, "PREVIEW_ASKS_OPEN_TO_WITH_TEAM"],
    ["a team of one", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]), PREVIEW_ASKS_OPEN_TO: "everyone-with-test-payments" }, true, "PREVIEW_ASKS_OPEN_TO_WITH_TEAM"],
    ["local mode", { PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_ASKS_OPEN_TO: "everyone" }, false, "PREVIEW_ASKS_OPEN_TO_NOT_HOSTED"]
  ];
  it.each(parsers)("%s: refuses to boot, naming the code", (_name, parse) => {
    for (const [label, extra, hosted, code] of refusalTable) {
      expect(() => parse(extra, hosted), label).toThrow(new RegExp(`^${code}$`));
    }
  });

  it("every parser code is a named refusal the launchers print, and none carries a value", () => {
    for (const code of ["INVALID", "WITHOUT_PREVIEW", "WITH_TEAM", "NOT_HOSTED", "WITHOUT_ROOM", "SANDBOX_BILLING", "TEST_PAYMENTS_NOT_SANDBOX"]) {
      expect(refusals.isNamedRefusal(`PREVIEW_ASKS_OPEN_TO_${code}`), code).toBe(true);
    }
  });

  it("the shared parser, alone: the order of its rules and its two values", () => {
    const open = { previewConfigured: true, teamKeyPresent: false, hosted: true };
    expect(PREVIEW_ASKS_OPEN_TO_VALUES).toEqual(["everyone", "everyone-with-test-payments"]);
    expect(parsePreviewAsksOpenTo(undefined, { previewConfigured: false, teamKeyPresent: true, hosted: false })).toBeUndefined();
    expect(parsePreviewAsksOpenTo("everyone", open)).toBe("everyone");
    expect(parsePreviewAsksOpenTo("everyone-with-test-payments", open)).toBe("everyone-with-test-payments");
    // A bad value is named before the context is looked at.
    expect(() => parsePreviewAsksOpenTo("all", { previewConfigured: false, teamKeyPresent: true, hosted: false })).toThrow("PREVIEW_ASKS_OPEN_TO_INVALID");
    expect(() => parsePreviewAsksOpenTo("everyone", { previewConfigured: false, teamKeyPresent: true, hosted: false })).toThrow("PREVIEW_ASKS_OPEN_TO_WITHOUT_PREVIEW");
    expect(() => parsePreviewAsksOpenTo("everyone", { ...open, teamKeyPresent: true, hosted: false })).toThrow("PREVIEW_ASKS_OPEN_TO_WITH_TEAM");
    expect(() => parsePreviewAsksOpenTo("everyone", { ...open, hosted: false })).toThrow("PREVIEW_ASKS_OPEN_TO_NOT_HOSTED");
  });
});

describe("previewAskAdmits", () => {
  const CONFIG = parsePreviewProviderTestConfig(PREVIEW)!;
  const OUTSIDER = "9f8e7d6c-5b4a-4321-9876-543210fedcba";
  it("off the preview: everyone, open or not", () => {
    for (const open of [undefined, true] as const) for (const user of [undefined, ALICE]) {
      expect(previewAskAdmits(undefined, undefined, open, user)).toBe(true);
    }
  });
  it("open: any signed-in account, whatever the team says; never a session without a user id", () => {
    expect(previewAskAdmits(CONFIG, [], true, OUTSIDER)).toBe(true);
    expect(previewAskAdmits(CONFIG, undefined, true, OUTSIDER)).toBe(true);
    expect(previewAskAdmits(CONFIG, [ALICE], true, OUTSIDER)).toBe(true);
    expect(previewAskAdmits(CONFIG, [], true, undefined)).toBe(false);
  });
  it("closed: exactly previewTeamAdmits", () => {
    for (const team of [undefined, [], [ALICE]]) for (const user of [undefined, ALICE, OUTSIDER]) {
      expect(previewAskAdmits(CONFIG, team, undefined, user)).toBe(previewTeamAdmits(CONFIG, team, user));
    }
  });
});

describe("the launchers name a refused value of PREVIEW_ASKS_OPEN_TO and pass an accepted one", () => {
  const native = { registerVersion: "12" };
  const approved = { apiPort: "3101", uiPort: "3100", mailExecutable: "/opt/release/mail-handoff.mjs", mailFrom: "noreply@dezbatere.ro",
    sourceRevision: "0123456789ab".padEnd(40, "c") };
  const GATE = JSON.stringify({ deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/team-budget-v2.sock", scope_id: "preview-team-v2-20261009" });
  const api = (extra: Record<string, string>): Record<string, string> => ({ ...validApiEnvironmentFixture(), NODE_ENV: "production",
    REGISTER_VERSION: "12", RELEASE_KEY: fixtureReleaseKey("12"), PUBLIC_APP_URL: "https://v3-preview.dezbatere.ro", API_PORT: "3101",
    API_HOST: "127.0.0.1", MAIL_SENDMAIL_PATH: approved.mailExecutable, MAIL_FROM: "noreply@dezbatere.ro", DEBATEAI_DEPLOYMENT_MODE: "hosted",
    PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
    TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt", TURNSTILE_SOCKET_PATH: "/run/debateai-preview-turnstile/siteverify.sock", ...extra });
  const runner = (extra: Record<string, string>): Record<string, string> => {
    const { VLLM_BASE_URL: _a, VLLM_MODEL: _b, VLLM_MAKER: _c, ...rest } = validRunnerEnvironmentFixture();
    const key = fixtureReleaseKey("12");
    return { ...rest, NODE_ENV: "production", REGISTER_VERSION: "12", RELEASE_KEY: key, DEBATEAI_DEPLOYMENT_MODE: "hosted",
      PREVIEW_PROVIDER_TEST_CONFIG_JSON: GATE, RUNNER_WORKER_ID: `debateai-preview-runner-${key}`, HATCHET_WORKER_NAME: `debateai-preview-runner-${key}`, ...extra };
  };
  const narrowed = (service: "api" | "runner", input: Record<string, string>) => env.narrowEnvironment(service, input, runtime, native, approved);
  const refusedLine = (service: "api" | "runner", input: Record<string, string>): string => {
    try { narrowed(service, input); } catch (error) {
      expect((error as Error).message).toBe("PREVIEW_ENVIRONMENT_REFUSED");
      return refusals.startupRefusedLine(service === "api" ? "PREVIEW_API_STARTUP_REFUSED" : "PREVIEW_RUNNER_STARTUP_REFUSED", error);
    }
    throw new Error("not refused");
  };

  it.each(["everyone", "everyone-with-test-payments"])("admits %s on the hosted preview with no team key, in both services", (value) => {
    expect(narrowed("api", api({ PREVIEW_ASKS_OPEN_TO: value })).environment.PREVIEW_ASKS_OPEN_TO).toBe(value);
    expect(narrowed("runner", runner({ PREVIEW_ASKS_OPEN_TO: value })).environment.PREVIEW_ASKS_OPEN_TO).toBe(value);
  });
  it.each([
    ["a value of neither form", { PREVIEW_ASKS_OPEN_TO: "yes" }, "PREVIEW_ASKS_OPEN_TO_INVALID"],
    ["a team beside it", { PREVIEW_ASKS_OPEN_TO: "everyone", PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]) }, "PREVIEW_ASKS_OPEN_TO_WITH_TEAM"]
  ])("refuses %s with the code on the launcher's line, and never the value", (_name, extra, code) => {
    for (const service of ["api", "runner"] as const) {
      const line = refusedLine(service, service === "api" ? api(extra) : runner(extra));
      expect(line).toBe(`${service === "api" ? "PREVIEW_API_STARTUP_REFUSED" : "PREVIEW_RUNNER_STARTUP_REFUSED"} ${code}`);
      expect(line).not.toContain(ALICE);
    }
  });
});
