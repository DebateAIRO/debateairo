import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import {
  buildAlgorithmRegisterRows,
  parseCanonicalRegisterJson,
  parseRegisterVersionText
} from "@debateai/register";
import { startTestDatabase } from "../support/testDatabase.js";
import {
  importHistoricalRegisterFixture,
  publishReplacementRegisterFixture,
  readLegacyDevelopmentV4Rows
} from "../support/registerFixtures.js";

const root = process.cwd();
const element = {
  provider_ref: "vendor:a", adapter_kind: "openai-compatible-http", maker: "Acme",
  vetting: { data_use_terms_reviewed_on: "2026-09-01", retention_terms_reviewed_on: "2026-09-01", named_in_privacy_notice: true },
  base_url: "https://api.acme.example/v1", model: "acme-large",
  runner_authorization_file: "/etc/debateai/runner/providers/acme.header",
  api_authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000, output_price_micros_per_million: 2000
};
const roster = (providers = [element]) => JSON.stringify({ providers });
const runnerLine = 'PES_HOSTED_TARGETS_RUNNER_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/runner/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const apiLine = 'PES_HOSTED_TARGETS_API_V1=[{"provider_ref":"vendor:a","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}]';
const receiptLine = 'PES_HOSTED_PROVIDER_SET_RECEIPT_V1={"registerVersion":"5","rowCount":32,"snapshotSha256":"579690d7a51248ea486632c347c32ee0dbd99814206f1a5c05d85c7d405931c9"}';
const publishedOutput = `${runnerLine}\n${apiLine}\n${receiptLine}\n`;
const builtValue = '{"kind":"CONFIGURED_PROVIDER_SET","providers":[{"adapterKind":"openai-compatible-http","maker":"Acme","providerRef":"vendor:a","vetting":{"dataUseTermsReviewedOn":"2026-09-01","namedInPrivacyNotice":true,"retentionTermsReviewedOn":"2026-09-01"}}],"requiredDistinctMakers":1,"setVersion":2}';
const suffix = " + V-9 ruled 2026-09-22 (V, chat): versioned configuredProviderSet row carrying each vendor's V-9(4) vetting record, superseding the sealed row without altering it";
const builtSource = "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" + suffix;
const roleSource = "provider-env-selection/S01#acceptance-role-rows";
type Result = { exitCode: number | null; stdout: string; stderr: string };
type Receipt = { registerVersion: string; rowCount: number; snapshotSha256: string };
let database: Awaited<ReturnType<typeof startTestDatabase>> | undefined;
let firstOutput: string | undefined;
let credentialReceipt: Receipt | undefined;
const directories: string[] = [];

async function scratch() {
  const directory = await mkdtemp(join(tmpdir(), "pes-s01-int-"));
  directories.push(directory);
  return directory;
}

async function run(rosterText: string, overrides: Record<string, string | undefined> = {}): Promise<Result> {
  const file = join(await scratch(), "roster.json");
  await writeFile(file, rosterText);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME,
    REGISTER_VERSION: "4", MIGRATION_DATABASE_URL: database!.connectionString,
    DEBATEAI_DEPLOYMENT_MODE: "hosted", PROVIDER_HOSTED_ROSTER_PATH: file
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"),
      join(root, "apps/runner/src/hosted-provider-set-publish-cli.ts")],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", exitCode => resolve({ exitCode, stdout, stderr }));
  });
}

async function rowsAt(version: string) {
  const result = await database!.pool.query<{ row_key: string; value_json_text: string; source_ref: string }>(
    "SELECT row_key,value_json::text AS value_json_text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
    [version]
  );
  return result.rows.map(row => ({ ...row,
    value_json_text: parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8")) }));
}

function receipt(result: Result): Receipt {
  const line = result.stdout.trimEnd().split("\n")[2]!;
  return JSON.parse(line.slice("PES_HOSTED_PROVIDER_SET_RECEIPT_V1=".length)) as Receipt;
}

function refused(result: Result, message: string) {
  expect(result).toEqual({ exitCode: 1, stdout: "", stderr: `${message}\n` });
}

function roleRows(synthesizer: string, evaluator: string) {
  return buildAlgorithmRegisterRows({ deploymentSourceRef: roleSource,
    synthesizerRoleRef: synthesizer, evaluatorRoleRef: evaluator,
    providerFamilies: [{ familyRef: "acme", providerRefs: ["vendor:a"] }] }).map(row => ({
    rowKey: row.rowKey,
    valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(row.value), "utf8")),
    sourceRef: ["synthesizerRoleRef", "evaluatorRoleRef"].includes(row.rowKey) ? roleSource : row.sourceRef
  }));
}

describe("PES S01 hosted provider-set operator command", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    await importHistoricalRegisterFixture(database.pool, 4, await readLegacyDevelopmentV4Rows());
  }, 60_000);
  afterAll(async () => {
    try { await database?.stop(); }
    finally { await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true }))); }
  }, 60_000);

  // I1 property: local mode must win over invalid database input (an eager pool load breaks it).
  it("not-hosted is refused before the database input is read", async () => {
    refused(await run(roster(), { DEBATEAI_DEPLOYMENT_MODE: "local", MIGRATION_DATABASE_URL: "not-a-url" }),
      "PES_PUBLISH_SET_NOT_HOSTED:local");
  });
  // I2 property: the entry must forward both mode inputs and the resolver's exact refusal.
  it("a mode that does not resolve prints the shipped code verbatim", async () => {
    refused(await run(roster(), { DEBATEAI_DEPLOYMENT_MODE: undefined, NODE_ENV: "production" }),
      "DEPLOYMENT_MODE_UNRESOLVED");
    refused(await run(roster(), { DEBATEAI_DEPLOYMENT_MODE: "HOSTED" }), "DEPLOYMENT_MODE_INVALID");
  });
  // I3 property: a duplicate roster must fail before database validation, after a valid mode.
  it("roster-invalid is refused before the database input is read", async () => {
    refused(await run(roster([element, element]), { MIGRATION_DATABASE_URL: "not-a-url" }),
      "PES_PUBLISH_ROSTER_INVALID:vendor:a");
  });
  // I4 property: a parser error must not expose roster text or credential paths.
  it("a roster that is not JSON is refused without a byte of its text", async () => {
    refused(await run('{"providers":[{"runner_authorization_file":/etc/debateai/runner/providers/acme.header}]}'),
      "PES_PUBLISH_ROSTER_INVALID:");
  });
  // I5 property: the query must bind the named version, and a missing row must not publish.
  it("base-row-absent prints the version and publishes nothing", async () => {
    refused(await run(roster(), { REGISTER_VERSION: "999" }), "PES_PUBLISH_BASE_ROW_ABSENT:999");
    expect(await rowsAt("5")).toEqual([]);
  });
  // I6 property: vetting content reaches the builder after the shape gate and before publication.
  it("unvetted prints the shipped builder's line and publishes nothing", async () => {
    refused(await run(roster([{ ...element, vetting: { ...element.vetting, named_in_privacy_notice: false } }])),
      "PROVIDER_VENDOR_NOT_VETTED:vendor:a");
    expect(await rowsAt("5")).toEqual([]);
  });
  // I7 property: the self-check's own code must survive the entry's error path without a write.
  it("targets-rejected prints the parser's code and publishes nothing", async () => {
    refused(await run(roster([{ ...element, base_url: "https://api.acme.example/v2" }])),
      "PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
    expect(await rowsAt("5")).toEqual([]);
  });
  // I8 property: the successful machine output is exactly the independently measured three lines.
  it("published prints exactly the three lines of R1.8", async () => {
    const result = await run(roster());
    expect(result).toEqual({ exitCode: 0, stdout: publishedOutput, stderr: "" });
    firstOutput = result.stdout;
  });
  // I9 property: selecting or mapping incomplete base rows cannot silently discard their content.
  it("the new version carries the other 31 rows byte for byte and the hosted row", async () => {
    const base = await rowsAt("4");
    const published = await rowsAt("5");
    expect(base).toHaveLength(32);
    expect(published.map(row => row.row_key)).toEqual(base.map(row => row.row_key));
    expect(published.filter(row => row.row_key !== "configuredProviderSet"))
      .toEqual(base.filter(row => row.row_key !== "configuredProviderSet"));
    expect(published.find(row => row.row_key === "configuredProviderSet")).toEqual({
      row_key: "configuredProviderSet", value_json_text: builtValue, source_ref: builtSource });
  });
  // I10 property: credentials are never read or copied; each service receives only its own path.
  it("no credential byte leaves the command, and each credential path appears only on its targets line", async () => {
    const directory = await scratch();
    const runner = join(directory, "runner.header");
    const api = join(directory, "api.header");
    await Promise.all([runner, api].map(file => writeFile(file, "Bearer pes-s01-sentinel-7f3a", { mode: 0o600 })));
    const result = await run(roster([{ ...element, runner_authorization_file: runner, api_authorization_file: api }]),
      { REGISTER_VERSION: "5" });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const published = receipt(result);
    const rows = await rowsAt(published.registerVersion);
    expect(result.stdout + result.stderr + JSON.stringify(rows)).not.toContain("pes-s01-sentinel-7f3a");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(result.stdout.split(runner)).toHaveLength(2);
    expect(result.stdout.split(api)).toHaveLength(2);
    expect(lines[0]).toBe(runnerLine.replace(element.runner_authorization_file, runner));
    expect(lines[1]).toBe(apiLine.replace(element.api_authorization_file, api));
    for (const file of [runner, api]) {
      expect(lines[2]).not.toContain(file);
      expect(JSON.stringify(rows)).not.toContain(file);
    }
    credentialReceipt = published;
  });
  // I11 property: republication reads the prior provenance, without appending a second suffix.
  it("a republication from the hosted row appends the suffix once", async () => {
    const row = (await rowsAt(credentialReceipt!.registerVersion)).find(row => row.row_key === "configuredProviderSet");
    expect(row?.source_ref).toBe(builtSource);
    expect(row?.source_ref.split(suffix)).toHaveLength(2);
  });
  // I12 property: an identical request keeps its publication identity and its original receipt.
  it("an identical re-run returns the first receipt", async () => {
    const result = await run(roster());
    expect(result).toEqual({ exitCode: 0, stdout: firstOutput, stderr: "" });
  });
  // I13 property: production's loopback floor admits this database and uses the selected newer base.
  it("NODE_ENV=production against a loopback database publishes", async () => {
    const result = await run(roster(), { NODE_ENV: "production", REGISTER_VERSION: credentialReceipt!.registerVersion });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.split("\n").slice(0, 2)).toEqual([runnerLine, apiLine]);
    expect(BigInt(receipt(result).registerVersion)).toBeGreaterThan(BigInt(credentialReceipt!.registerVersion));
  });
  // I14 property: an existing later head never replaces the operator's explicitly named base.
  it("the base is the version REGISTER_VERSION names", async () => {
    const result = await run(roster([{ ...element, maker: "Acme Labs" }]), { REGISTER_VERSION: "4" });
    expect(result.exitCode).toBe(0);
    const version = receipt(result).registerVersion;
    const { rows } = await database!.pool.query("SELECT base_register_version::text AS base FROM register.register_version WHERE register_version=$1", [version]);
    expect(rows).toEqual([{ base: "4" }]);
  });
  // I15 property: the entry loads role rows too; the valid synthesizer must not steal the evaluator refusal.
  it("role-provider-dropped: a base whose evaluator row names a dropped provider is refused, nothing written", async () => {
    const seeded = await publishReplacementRegisterFixture(database!.pool, parseRegisterVersionText("5"),
      roleRows("vendor:a", "vendor:z"), roleSource);
    const before = await database!.pool.query("SELECT count(*)::text AS n FROM register.register_version");
    refused(await run(roster(), { REGISTER_VERSION: seeded.registerVersion }), "PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef");
    const after = await database!.pool.query("SELECT count(*)::text AS n FROM register.register_version");
    expect(after.rows).toEqual(before.rows);
  });
  // I16 property: valid role rows survive byte for byte, with the complete 49-row snapshot and named base.
  it("a base whose role rows name roster providers publishes, and both role rows are carried forward byte for byte", async () => {
    const seeded = await publishReplacementRegisterFixture(database!.pool, parseRegisterVersionText("5"),
      roleRows("vendor:a", "vendor:a"), roleSource);
    const result = await run(roster(), { REGISTER_VERSION: seeded.registerVersion });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const published = receipt(result);
    expect(published.rowCount).toBe(49);
    const roles = (rows: Awaited<ReturnType<typeof rowsAt>>) => rows.filter(row =>
      ["synthesizerRoleRef", "evaluatorRoleRef"].includes(row.row_key));
    expect(roles(await rowsAt(published.registerVersion))).toEqual(roles(await rowsAt(seeded.registerVersion)));
    const { rows } = await database!.pool.query("SELECT base_register_version::text AS base FROM register.register_version WHERE register_version=$1", [published.registerVersion]);
    expect(rows).toEqual([{ base: seeded.registerVersion }]);
  });
});
