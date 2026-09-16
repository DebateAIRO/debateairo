/**
 * REV-S03-p2-security-data-safety — the reviewer's OWN probes, built from the CLAIM.
 * Temporary: written at review head d35a9634, deleted before the seat's handoff.
 * No socket to any provider, no .local read: every key value below is this seat's fake.
 */
import { describe, expect, it } from "vitest";
import { buildApi as buildApiBase, type AskApplication } from "@debateai/api";
import { PlanTierRostersSchema } from "@debateai/contract";
import { validateModelConfig } from "@debateai/model-config";
import { startClaudeRelay } from "../../acceptance/claude-relay.js";
import { startGrokRelay } from "../../acceptance/grok-relay.js";
import {
  buildDevelopmentDeploymentRegisterRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import { parseDevelopmentProviderPanelTargets } from "../../apps/runner/src/dev-provider-panel.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const FAKE_KEY = "FAKEKEY-rev-s03-p2-security-DO-NOT-USE";
const USER_IDENTITY = testHttpIdentity("rev-s03-p2-security");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

function log(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line);
}

function buildApi(application: unknown) {
  return buildApiBase({
    application: application as AskApplication,
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
}

/** The narrowest application the route touches: only readPlanTierRosters is called. */
function rosterApplication(read: () => Promise<unknown>): unknown {
  return { readPlanTierRosters: read, readDeployment: async () => ({}) };
}

// ---------------------------------------------------------------------------
// CHARGE 3 — the `model` value's path from config/models.yaml to a CLI argv
// ---------------------------------------------------------------------------

function cliFile(grokModel: string, claudeModel = "claude-opus-5"): unknown {
  return {
    free: [
      { cli: "claude", model: claudeModel },
      { cli: "grok", model: grokModel }
    ],
    premium: [
      { cli: "claude", model: claudeModel },
      { cli: "grok", model: grokModel }
    ]
  };
}

function loaderAdmitsModel(model: string): boolean {
  try {
    validateModelConfig(cliFile(model), { isCliInstalled: () => true });
    return true;
  } catch {
    return false;
  }
}

const HOSTILE_MODELS: readonly { readonly label: string; readonly value: string }[] = Object.freeze([
  { label: "ordinary id", value: "grok-4.6-build" },
  { label: "leading dash (bare flag)", value: "--disable-web-search" },
  { label: "leading dash with =value", value: "--mcp-config=/tmp/rev-s03-p2-evil.json" },
  { label: "single dash", value: "-c" },
  { label: "embedded space", value: "grok-4.6-build --sandbox danger-full-access" },
  { label: "shell metacharacters", value: "grok;id`whoami`$(id)|cat" },
  { label: "newline", value: "grok-4.6-build\n--sandbox\ndanger-full-access" },
  { label: "path traversal", value: "../../../../etc/passwd" }
]);

describe("PROBE P1 — what the file loader admits as a cli `model`", () => {
  it("records the admission of every hostile model value", () => {
    const table = HOSTILE_MODELS.map(({ label, value }) => ({
      label,
      admitted: loaderAdmitsModel(value)
    }));
    log(`P1_LOADER_ADMISSION=${JSON.stringify(table, null, 1)}`);
    // The CLAIM under test: the loader's only bound is "non-empty string".
    expect(table.every((row) => row.admitted)).toBe(true);
    expect(loaderAdmitsModel("")).toBe(false);
  });
});

const GROK_CAPTURE_SCRIPT = [
  'console.log(JSON.stringify({',
  '  text: JSON.stringify({ argumentList: process.argv }),',
  '  stopReason: "end_turn",',
  '  modelUsage: { "grok-4.6-build": {} }',
  '}));'
].join("");

const CLAUDE_CAPTURE_SCRIPT = [
  'console.log(JSON.stringify({',
  '  is_error: false, result: JSON.stringify({ argumentList: process.argv }),',
  '  modelUsage: { "claude-opus-5": {} }',
  '}));'
].join("");

async function capturedArgv(
  start: (options: Record<string, unknown>) => Promise<{
    readonly baseUrl: string;
    readonly authorizationHeader: string;
    close(): Promise<void>;
  }>,
  script: string,
  options: Record<string, unknown>
): Promise<readonly string[]> {
  const relay = await start({
    ...options,
    port: 0,
    timeoutMs: 5_000,
    testOnlyCommand: { binary: process.execPath, prefixArguments: ["-e", script, "--"] }
  });
  try {
    const response = await fetch(`${relay.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: relay.authorizationHeader },
      body: JSON.stringify({ model: "ignored-by-relay", messages: [{ role: "user", content: "Assert argv." }] })
    });
    const completion = await response.json() as { choices: readonly { message: { content: string } }[] };
    const relayed = JSON.parse(completion.choices[0]!.message.content) as { argumentList: readonly string[] };
    return relayed.argumentList;
  } finally {
    await relay.close();
  }
}

describe("PROBE P2 — the argv the relays actually build for a hostile `model`", () => {
  it("shows the Grok argv for every value the loader admits", async () => {
    const rows: { label: string; refusedBeforeArgv: boolean; argvTail: readonly string[] }[] = [];
    for (const { label, value } of HOSTILE_MODELS) {
      let argv: readonly string[] | undefined;
      let refused = false;
      try {
        argv = await capturedArgv(
          startGrokRelay as never, GROK_CAPTURE_SCRIPT, { model: value, sandboxProfile: "none" }
        );
      } catch {
        refused = true;
      }
      const index = argv === undefined ? -1 : argv.lastIndexOf("--model");
      rows.push({
        label,
        refusedBeforeArgv: refused,
        argvTail: argv === undefined || index === -1 ? [] : argv.slice(index)
      });
    }
    log(`P2_GROK_ARGV=${JSON.stringify(rows, null, 1)}`);
    // Recorded, not asserted as desired: this probe exists to show what reaches argv.
    expect(rows).toHaveLength(HOSTILE_MODELS.length);
  }, 120_000);

  it("shows whether the Claude relay refuses the same values before argv", async () => {
    const rows: { label: string; refusedBeforeArgv: boolean; code: string; argvTail: readonly string[] }[] = [];
    for (const { label, value } of HOSTILE_MODELS) {
      let argv: readonly string[] | undefined;
      let code = "";
      try {
        argv = await capturedArgv(startClaudeRelay as never, CLAUDE_CAPTURE_SCRIPT, { model: value });
      } catch (error: unknown) {
        code = String(error);
      }
      const index = argv === undefined ? -1 : argv.lastIndexOf("--model");
      rows.push({
        label,
        refusedBeforeArgv: argv === undefined,
        code: code.includes("CLAUDE_CLI_MODEL_INVALID") ? "CLAUDE_CLI_MODEL_INVALID" : code.slice(0, 60),
        argvTail: argv === undefined || index === -1 ? [] : argv.slice(index)
      });
    }
    log(`P2_CLAUDE_ARGV=${JSON.stringify(rows, null, 1)}`);
    expect(rows).toHaveLength(HOSTILE_MODELS.length);
  }, 120_000);
});

describe("PROBE P3 — the alias path is unchanged", () => {
  it("still builds --model <alias> when no full id is supplied, and the id wins when both are", async () => {
    const aliasOnly = await capturedArgv(
      startClaudeRelay as never, CLAUDE_CAPTURE_SCRIPT, { modelAlias: "sonnet" }
    );
    const both = await capturedArgv(
      startClaudeRelay as never, CLAUDE_CAPTURE_SCRIPT, { model: "claude-opus-5", modelAlias: "sonnet" }
    );
    const aliasValue = aliasOnly[aliasOnly.lastIndexOf("--model") + 1];
    const bothValue = both[both.lastIndexOf("--model") + 1];
    log(`P3_ALIAS_ONLY=${aliasValue} P3_BOTH=${bothValue}`);
    expect(aliasValue).toBe("sonnet");
    expect(bothValue).toBe("claude-opus-5");

    const hostileAlias = await Promise.resolve()
      .then(() => capturedArgv(startClaudeRelay as never, CLAUDE_CAPTURE_SCRIPT, { modelAlias: "--sandbox" }))
      .then(() => "NO_THROW", (error: unknown) => String(error));
    log(`P3_HOSTILE_ALIAS=${hostileAlias.slice(0, 80)}`);
    expect(String(hostileAlias)).toContain("CLAUDE_CLI_MODEL_ALIAS_INVALID");
  }, 120_000);
});

// ---------------------------------------------------------------------------
// CHARGE 2 — GET /v1/plan-tiers
// ---------------------------------------------------------------------------

describe("PROBE P4 — the new route's policy and projection", () => {
  it("refuses an unauthenticated request with 401 and no body beyond the code", async () => {
    const api = buildApi(rosterApplication(async () => ({ free: ["a"], premium: ["b"] })));
    const anonymous = await api.inject({ method: "GET", url: "/v1/plan-tiers" });
    const retiredHeader = await api.inject({
      method: "GET", url: "/v1/plan-tiers", headers: { "x-user-dev-token": "rev-s03-p2" }
    });
    log(`P4_ANON=${anonymous.statusCode} ${anonymous.body}`);
    log(`P4_RETIRED_HEADER=${retiredHeader.statusCode} ${retiredHeader.body}`);
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(retiredHeader.statusCode).toBe(401);
    await api.close();
  });

  it("carries exactly the two id lists and nothing else", async () => {
    const api = buildApi(rosterApplication(async () => ({
      free: ["free-a", "free-b"], premium: ["premium-a", "premium-b"]
    })));
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    log(`P4_OK=${response.statusCode} ${response.body}`);
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object).sort()).toEqual(["free", "premium"]);
    await api.close();
  });

  it("REFUSES rather than forwards an operator-only member smuggled beside the two lists", async () => {
    const api = buildApi(rosterApplication(async () => ({
      free: ["free-a"], premium: ["premium-a"],
      register_version: 9,
      authorization_header: `Bearer ${FAKE_KEY}`,
      provider_targets: [{ base_url: "https://api.z.ai", key: FAKE_KEY }]
    })));
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    log(`P4_EXTRA_MEMBERS=${response.statusCode} ${response.body}`);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(FAKE_KEY);
    expect(response.body).not.toContain("authorization_header");
    expect(response.body).not.toContain("register_version");
    expect(response.body).not.toContain("provider_targets");
    // The 500 envelope must carry no free-text message at all.
    expect(Object.keys(response.json() as object).sort()).toEqual(["correlation_id", "error"]);
    await api.close();
  });

  it("does not echo the upstream failure text when the sealed read throws", async () => {
    const api = buildApi(rosterApplication(async () => {
      throw new Error(`REGISTER_OPEN_FAILED host=127.0.0.1:55432 secret=${FAKE_KEY}`);
    }));
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    log(`P4_THROWN=${response.statusCode} ${response.body}`);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(FAKE_KEY);
    expect(response.body).not.toContain("55432");
    await api.close();
  });

  it("refuses the route entirely when the application declares no roster reader", async () => {
    const api = buildApi({ readDeployment: async () => ({}) });
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    log(`P4_NO_READER=${response.statusCode} ${response.body}`);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("No sealed plan-tier roster row exists");
    await api.close();
  });

  it("pins the strict schema's own refusals", () => {
    const extra = Object.freeze({ free: ["a"], premium: ["b"], hidden: [FAKE_KEY] });
    const blank = Object.freeze({ free: [""], premium: ["b"] });
    const padded = PlanTierRostersSchema.safeParse({ free: ["  spaced  "], premium: ["b"] });
    log(`P4_SCHEMA extra=${PlanTierRostersSchema.safeParse(extra).success} ` +
      `blank=${PlanTierRostersSchema.safeParse(blank).success} ` +
      `padded=${padded.success} paddedValue=${JSON.stringify(padded.success ? padded.data.free : null)}`);
    expect(PlanTierRostersSchema.safeParse(extra).success).toBe(false);
    expect(PlanTierRostersSchema.safeParse(blank).success).toBe(false);
  });
});

describe("PROBE E (pass-1, re-run at d35a9634) — the register rows carry no bearer", () => {
  it("greps every published value for this seat's fake key", () => {
    const configuredProviders = [
      { providerRef: "development:openai-free-api", adapterKind: "openai-compatible-http" as const, maker: "OpenAI" },
      { providerRef: "development:zai-free-api", adapterKind: "openai-compatible-http" as const, maker: "Z.AI" }
    ];
    const panel = parseDevelopmentProviderPanelTargets(
      JSON.stringify([
        {
          provider_ref: "development:openai-free-api",
          base_url: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          authorization_header: `Bearer ${FAKE_KEY}`
        },
        {
          provider_ref: "development:zai-free-api",
          base_url: "https://api.z.ai/api/coding/paas/v4",
          model: "glm-5.3-flash",
          authorization_header: `Bearer ${FAKE_KEY}`
        }
      ]),
      configuredProviders
    );
    const config = validateModelConfig({
      free: [
        { api: "openai", model: "gpt-5.6-luna", base_url: "https://api.openai.com/v1", key: "OPENAI_API_KEY" },
        { api: "zai", model: "glm-5.3-flash", base_url: "https://api.z.ai/api/coding/paas/v4", key: "ZAI_API_KEY" }
      ],
      premium: [
        { api: "openai", model: "gpt-5.6-luna", base_url: "https://api.openai.com/v1", key: "OPENAI_API_KEY" },
        { api: "zai", model: "glm-5.3-flash", base_url: "https://api.z.ai/api/coding/paas/v4", key: "ZAI_API_KEY" }
      ]
    }, { isCliInstalled: () => true });
    const rows = buildDevelopmentDeploymentRegisterRows(panel, developmentPlanTierRosters(config));
    const serialized = JSON.stringify(rows);
    log(`E_REGISTER_ROWS=${serialized}`);
    log(`E_PANEL_TARGETS_JSON_CARRIES_KEY=${panel.targetsJson.includes(FAKE_KEY)}`);
    const rosterRow = rows.find((row) => row.rowKey === "planTierRosters" || row.row_key === "planTierRosters");
    log(`E_ROSTER_ROW_SERVED_BY_THE_NEW_ROUTE=${JSON.stringify(rosterRow)}`);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain("Bearer");
  });
});
