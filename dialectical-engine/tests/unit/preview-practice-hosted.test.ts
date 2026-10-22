// The preview practice on a HOSTED preview (2026-10-14; owner: "make the practice tool available also for the hosted
// part, so I can still practice"). Pure rules, no database and no gate:
//  - a hosted settings export is read, and the hosted API's server-only settings (country files, NETOPIA, Quaderno,
//    SmartBill, the owner report) are set aside unread; a local export still refuses them exactly as before;
//  - `--register-next --hosted-billing '<JSON>'` composes the next version with publish kit v3, byte for byte what the
//    server's `native-plan --operation plan --hosted-billing` composes from the same inputs, on a local base (the first
//    hosted version) and on a hosted one; the plan's own validators check the inputs;
//  - a hosted base never composes with kit v2 (the server's HOSTED_BILLING_REQUIRED).
// The money wiring of the runner and the ask path is pinned against the two main.ts files in
// tests/unit/preview-practice-wiring-drift.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalRegisterJson,
  COST_ESTIMATE_START_POLICY_ROW_KEY,
  computeRegisterSnapshotSha256,
  loadBootstrapRegister,
  parseCanonicalRegisterJson
} from "@debateai/register";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import {
  buildPreviewSourceRowsV3,
  composePreviewSnapshotV3,
  STORY_COST_ENVELOPE_POLICY_ROW_KEY
} from "../../deploy/preview-auth-dev/v1/publish-register-v3.js";
import {
  composePracticeHostedNextRegisterVersion,
  composePracticeNextRegisterVersion,
  parsePracticeNextRegisterInputs,
  practiceBaseIsHosted,
  PRACTICE_REGISTER_EXPORT_SCHEMA,
  type PracticeRegisterExport
} from "../../tools/preview-practice/practice-register-import.js";
import { parsePracticeSettings, PRACTICE_HOSTED_SET_ASIDE_KEYS } from "../../tools/preview-practice/practice-settings.js";
import { runPractice } from "../../tools/preview-practice/practice.js";

type Row = { rowKey: string; valueJsonText: string; sourceRef: string };
const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const canonical = (value: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value))) as string;
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, "en"));
const owned = (): Row[] => [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
  .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
const runtime = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-13T12:00:00.000Z" };
/** The runbook's suggested inputs (pending the owner's yes): $3 per debate, $10 per day, the kit's room-read example. */
const ON = { billing: "on", perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000,
  askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } } as const;
const OFF = { ...ON, billing: "off" } as const;
const DEEPSEEK = { checker: "deepseek", deepseekEnabledOnGate: true } as const;
const value = (rows: readonly Row[], key: string) => JSON.parse(rows.find((row) => row.rowKey === key)!.valueJsonText);

/** The live register 12 shape (local, kit v2's source and the two base-owned rows), optionally with a DeepSeek checker. */
async function local12(checker?: typeof DEEPSEEK): Promise<Row[]> {
  return sorted([...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, checker) as unknown as Row[], ...owned()]);
}

function exportOf(base: readonly Row[], version = "12"): PracticeRegisterExport {
  return Object.freeze({
    schema: PRACTICE_REGISTER_EXPORT_SCHEMA,
    versions: Object.freeze([Object.freeze({ register_version: version, row_count: base.length, sealed: true,
      base_register_version: String(Number(version) - 1), publication_id: null, request_sha256: null,
      snapshot_sha256: computeRegisterSnapshotSha256(base as never), publication_kind: "GENERAL", recorded_at: null })]),
    rows: Object.freeze(base.map((row) => Object.freeze({ register_version: version, row_key: row.rowKey, value_json: row.valueJsonText,
      source_ref: row.sourceRef })))
  });
}

/** What the server's native operator composes for a plan with these inputs (native-operator.mjs, kit v3). */
async function serverPlan(base: readonly Row[], version: string, hosted: unknown, checker?: typeof DEEPSEEK, rotation?: "off") {
  const rows = await buildPreviewSourceRowsV3(await loadBootstrapRegister(), runtime, hosted, checker, rotation, null);
  return composePreviewSnapshotV3({ sourceRows: rows, baseRows: base as never, baseRegisterVersion: version,
    baseSnapshotSha256: computeRegisterSnapshotSha256(base as never) });
}

describe("hosted settings: read, with the server-only settings set aside unread", () => {
  const config = JSON.stringify({ deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
    premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash",
      "claude-haiku-5-5"], requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-hosted" });
  const base = (mode: "local" | "hosted") => [`PREVIEW_PROVIDER_TEST_CONFIG_JSON=${config}`, "PROVIDER_DISCOVERY_TARGETS_JSON=[]",
    "REGISTER_VERSION=13", `DEBATEAI_DEPLOYMENT_MODE=${mode}`, "NODE_ENV=production", "CLAIM_MS=3000000", "CLAIM_MARGIN_MS=60000",
    "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=k", "JUDGEMENT_PRODUCER=p", "PROPAGATION_NUMBER_KIND=k", "PROPAGATION_PRODUCER=p",
    "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00", "SETTLEMENT_WATCH_HANDLE=h"];
  /** The hosted api.env's billing and country lines, as runbook H6/H7 writes them. */
  const serverOnly = [
    "GEOIP_COUNTRY_DB_PATH=/var/lib/debateai-geoip/dbip-country-lite.mmdb", "TOR_EXIT_LIST_PATH=/var/lib/debateai-geoip/tor-exit-list.txt",
    "NETOPIA_API_BASE_URL=https://secure-sandbox.netopia-payments.com", "NETOPIA_API_KEY_PATH=/etc/debateai-v3-preview/billing/netopia-api-key",
    "NETOPIA_IPN_KEYS_PATH=/etc/debateai-v3-preview/billing/netopia-ipn-keys.pem", "NETOPIA_POS_SIGNATURE=TEST-TEST-TEST-TEST-TEST",
    "QUADERNO_API_BASE_URL=https://owner.sandbox-quadernoapp.com/api", "QUADERNO_API_KEY_PATH=/etc/debateai-v3-preview/billing/quaderno-api-key",
    "SMARTBILL_API_BASE_URL=https://smartbill.invalid", "SMARTBILL_CREDENTIALS_PATH=/etc/debateai-v3-preview/billing/smartbill-credentials",
    "SMARTBILL_SERIES=DBAI", "OWNER_REPORT_EMAIL_PATH=/etc/debateai-v3-preview/billing/owner-report-email"
  ];

  it("reads a hosted export as hosted, and a hosted export carrying the server-only settings keeps only their names", () => {
    // Side-by-side §1 (B6): a hosted practice names its release from the checkout's source revision.
    const sourceRevision = "0123456789ab".padEnd(40, "c");
    expect(parsePracticeSettings(base("hosted").join("\n"), { sourceRevision })).toMatchObject({
      runner: { DEPLOYMENT_MODE: "hosted", REGISTER_VERSION: 13, RELEASE_KEY: ["r13", "0123456789ab"].join("-") }, setAsideKeys: [] });
    const settings = parsePracticeSettings([...base("hosted"), ...serverOnly].join("\n"), { sourceRevision });
    expect(settings.runner.DEPLOYMENT_MODE).toBe("hosted");
    expect(settings.setAsideKeys).toEqual(serverOnly.map((line) => line.slice(0, line.indexOf("="))));
    // No value of theirs is kept anywhere in what the practice holds.
    const held = JSON.stringify(settings);
    for (const line of serverOnly) expect(held).not.toContain(line.slice(line.indexOf("=") + 1));
  });

  it("a local export still refuses each of them at its own line, exactly as any key outside the allow-list", () => {
    for (const line of serverOnly) {
      const lines = [...base("local"), line];
      expect(() => parsePracticeSettings(lines.join("\n"))).toThrow(`PRACTICE_SETTINGS_KEY_REFUSED: line ${String(lines.length)}`);
    }
    // ... even when it stands before the mode line, and with no mode line at all (NODE_ENV=development resolves local).
    expect(() => parsePracticeSettings([serverOnly[0]!, ...base("local")].join("\n"))).toThrow("PRACTICE_SETTINGS_KEY_REFUSED: line 1");
    const noMode = base("local").filter((line) => !line.startsWith("DEBATEAI_DEPLOYMENT_MODE=") && !line.startsWith("NODE_ENV="));
    expect(() => parsePracticeSettings([...noMode, serverOnly[2]!].join("\n"))).toThrow(`PRACTICE_SETTINGS_KEY_REFUSED: line ${String(noMode.length + 1)}`);
  });

  it("a set-aside value that holds a key, or a key given twice, refuses (a secret copied by mistake is never taken)", () => {
    const pasted = ["NETOPIA_POS_SIGNATURE", ["sk", "x".repeat(4) + "Q9".repeat(8)].join("-")].join("=");
    expect(() => parsePracticeSettings([...base("hosted"), pasted].join("\n"))).toThrow("PRACTICE_SETTINGS_VALUE_KEY_SHAPED: NETOPIA_POS_SIGNATURE");
    expect(() => parsePracticeSettings([...base("hosted"), serverOnly[0]!, serverOnly[0]!].join("\n")))
      .toThrow("PRACTICE_SETTINGS_KEY_DUPLICATE: GEOIP_COUNTRY_DB_PATH");
    // A database address stays refused in hosted mode too.
    expect(() => parsePracticeSettings([...base("hosted"), "DATABASE_URL=postgresql://x"].join("\n"))).toThrow("PRACTICE_SETTINGS_KEY_REFUSED");
  });

  it("the set-aside list is exactly the hosted API's country and billing settings in environment.mjs", () => {
    const environment = read("deploy/preview-auth-dev/v1/environment.mjs");
    const list = (name: string) => [...(new RegExp(`const ${name}=\\[([^\\]]+)\\]`, "u").exec(environment)?.[1] ?? "")
      .matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]!);
    const billing = [...list("NETOPIA_KEYS"), ...list("INVOICING_KEYS")];
    expect(billing.length).toBe(10);
    expect([...PRACTICE_HOSTED_SET_ASIDE_KEYS].sort()).toEqual([...billing, "GEOIP_COUNTRY_DB_PATH", "TOR_EXIT_LIST_PATH"].sort());
    expect(environment).toContain("if(configured.GEOIP_COUNTRY_DB_PATH!==fixed.GEOIP_COUNTRY_DB_PATH||configured.TOR_EXIT_LIST_PATH!==fixed.TOR_EXIT_LIST_PATH");
  });
});

describe("--register-next on the hosted preview: publish kit v3, as the server's plan composes it", () => {
  it("on the local register 12 (the first hosted version, runbook H6): byte for byte the server's proposal, billing off", async () => {
    const base = await local12();
    const next = await composePracticeHostedNextRegisterVersion(exportOf(base), OFF);
    const server = await serverPlan(base, "12", OFF);
    expect(next.rows).toEqual(server.rows);
    expect(next.snapshotSha256).toBe(server.snapshotSha256);
    expect(next.deltaSha256).toBe(server.deltaSha256);
    expect(next).toMatchObject({ composer: "preview-register-composer-v3", checker: "glm", roleRotation: "on", hostedBilling: OFF, notes: [],
      addedKeys: [COST_ESTIMATE_START_POLICY_ROW_KEY, STORY_COST_ENVELOPE_POLICY_ROW_KEY], changedKeys: ["admissionPolicy", "costEnvelopePolicy"] });
    expect(value(next.rows as readonly Row[], "costEnvelopePolicy")).toMatchObject({ per_run_ceiling_micros: 3_000_000, daily_ceiling_micros: 10_000_000 });
    expect(value(next.rows as readonly Row[], "billingPolicy").enabled).toBe(false);
  });

  it("then billing on over that hosted version (H7): only the billing row changes, as the runbook tells the owner to expect", async () => {
    const first = await serverPlan(await local12(), "12", OFF);
    const v13 = [...first.rows] as Row[];
    const document = exportOf(v13, "13");
    expect(practiceBaseIsHosted(document)).toBe(true);
    const next = await composePracticeHostedNextRegisterVersion(document, ON);
    const server = await serverPlan(v13, "13", ON);
    expect([next.snapshotSha256, next.deltaSha256]).toEqual([server.snapshotSha256, server.deltaSha256]);
    expect(next.addedKeys).toEqual([]);
    // The server's proposal adds nodeRuntimeVersion's source reference (it measures its runtime again; the practice
    // reads the base's): runbook H7's "billingPolicy ... and nodeRuntimeVersion's source reference".
    expect(next.changedKeys).toEqual(["billingPolicy"]);
    expect(value(next.rows as readonly Row[], "billingPolicy")).toMatchObject({ enabled: true });
    // The same inputs again change nothing: there is no next version to practise.
    await expect(composePracticeHostedNextRegisterVersion(document, OFF)).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
  });

  it("the plan's defaults, not the base's: a DeepSeek checker moves back to GLM unless --checker deepseek is given, and the practice says so", async () => {
    const base = await local12(DEEPSEEK);
    const defaulted = await composePracticeHostedNextRegisterVersion(exportOf(base), OFF);
    expect(defaulted.changedKeys).toContain("evaluatorRoleRef");
    expect(defaulted.deltaSha256).toBe((await serverPlan(base, "12", OFF)).deltaSha256);
    expect(defaulted.notes).toHaveLength(1);
    expect(defaulted.notes![0]).toContain("--checker deepseek --deepseek-enabled-on-gate yes");
    const kept = await composePracticeHostedNextRegisterVersion(exportOf(base), OFF, { checker: DEEPSEEK });
    expect(kept.changedKeys).not.toContain("evaluatorRoleRef");
    expect(kept.notes).toEqual([]);
    expect(kept.deltaSha256).toBe((await serverPlan(base, "12", OFF, DEEPSEEK)).deltaSha256);
  });

  it("the call-concurrency row as the plan gives it (--register-call-concurrency)", async () => {
    const base = await local12();
    const policy = { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, anthropic: 50, deepinfra: 150 } };
    const next = await composePracticeHostedNextRegisterVersion(exportOf(base), OFF, { callConcurrency: policy });
    expect(next.addedKeys).toContain("callConcurrencyPolicy");
    expect(value(next.rows as readonly Row[], "callConcurrencyPolicy")).toMatchObject(policy);
  });

  it("kit v2 refuses a hosted base (the server's HOSTED_BILLING_REQUIRED), and keeps reading a local base as before", async () => {
    const hostedBase = [...(await serverPlan(await local12(), "12", OFF)).rows] as Row[];
    await expect(composePracticeNextRegisterVersion(exportOf(hostedBase, "13")))
      .rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_HOSTED_BILLING_REQUIRED" });
    expect(practiceBaseIsHosted(exportOf(await local12()))).toBe(false);
  });

  it("the CLI picks kit v3 with --hosted-billing, runs it hosted, and refuses kit v2 on a hosted preview", () => {
    const cli = read("tools/preview-practice/practice.ts");
    expect(cli).toContain("nextInputs.kit === \"v3\" ? await composePracticeHostedNextRegisterVersion(register, nextInputs.hostedBilling!, nextInputs.choices)");
    expect(cli).toContain("if (nextInputs?.kit === \"v2\" && settings.runner.DEPLOYMENT_MODE === \"hosted\") {");
    const debate = read("tools/preview-practice/practice-debate.ts");
    expect(debate).toContain("...(receipt.codeNext.composer === undefined ? {} : { DEPLOYMENT_MODE: \"hosted\" as const })");
    expect(debate).toContain("nextReleaseKey(receipt.codeNext.composer === undefined ? input.settings.runner.DEPLOYMENT_MODE : \"hosted\")");
  });
});

describe("--register-next inputs: the release tool's own rules (native-operator.mjs validators)", () => {
  const hostedText = JSON.stringify(ON);
  it("--hosted-billing selects kit v3 and is checked by the plan's validator", async () => {
    expect(await parsePracticeNextRegisterInputs({})).toEqual({ kit: "v2", hostedBilling: null, choices: {} });
    expect(await parsePracticeNextRegisterInputs({ hostedBilling: hostedText })).toMatchObject({ kit: "v3", hostedBilling: ON });
    for (const bad of ["{", JSON.stringify({ ...ON, extra: 1 }), JSON.stringify({ ...ON, perRunCeilingMicros: 11_000_000 }),
      JSON.stringify({ ...ON, askRoomReads: { limit: 60, windowMs: 60_000 } })]) {
      await expect(parsePracticeNextRegisterInputs({ hostedBilling: bad }))
        .rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_INPUT_INVALID", message: "PRACTICE_REGISTER_NEXT_INPUT_INVALID: --hosted-billing" });
    }
  });

  it("--checker, --deepseek-enabled-on-gate and --role-rotation follow native-plan's rules", async () => {
    expect((await parsePracticeNextRegisterInputs({ checker: "deepseek", deepseekEnabledOnGate: "yes", roleRotation: "off" })).choices)
      .toEqual({ checker: DEEPSEEK, roleRotation: "off" });
    expect((await parsePracticeNextRegisterInputs({ checker: "glm" })).choices).toEqual({ checker: { checker: "glm" } });
    await expect(parsePracticeNextRegisterInputs({ checker: "deepseek" })).rejects.toMatchObject({ code: "CHECKER_DEEPSEEK_NOT_ENABLED_ON_GATE" });
    await expect(parsePracticeNextRegisterInputs({ checker: "mimo" })).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_INPUT_INVALID" });
    await expect(parsePracticeNextRegisterInputs({ deepseekEnabledOnGate: "yes" })).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_INPUT_INVALID" });
    await expect(parsePracticeNextRegisterInputs({ roleRotation: "maybe" })).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_INPUT_INVALID" });
  });

  it("--register-call-concurrency is the plan's JSON, put in the plan's key order", async () => {
    const parsed = await parsePracticeNextRegisterInputs({ callConcurrency: JSON.stringify({ perModelPerRunner: { deepinfra: 150, default: 50 },
      perDebate: 12, perModelPerDebate: 3 }) });
    expect(JSON.stringify(parsed.choices.callConcurrency)).toBe(JSON.stringify({ perDebate: 12, perModelPerDebate: 3,
      perModelPerRunner: { default: 50, deepinfra: 150 } }));
    await expect(parsePracticeNextRegisterInputs({ callConcurrency: JSON.stringify({ perDebate: 99, perModelPerDebate: 3,
      perModelPerRunner: { default: 50 } }) })).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_INPUT_INVALID" });
  });

  it("each of them needs --register-next, and is refused before anything is read", async () => {
    for (const [flag, text] of [["--hosted-billing", hostedText], ["--checker", "glm"], ["--role-rotation", "off"],
      ["--register-call-concurrency", "{}"], ["--deepseek-enabled-on-gate", "yes"]] as const) {
      const logged: string[] = [];
      const outcome = await runPractice(["debate", flag, text], {}, { log: (line) => logged.push(line) });
      expect(outcome.report).toMatchObject({ reasons: ["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"] });
      expect(logged).toContain(`practice could not run: PRACTICE_FLAG_VALUE_INVALID: ${flag} (with --register-next only)`);
    }
  });
});
