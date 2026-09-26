// ARCH-FIX-PES-S01-p2 PROPOSED CODE (Revision 2: SPEC-v4 R1.12 role seed + `role-provider-dropped`, §5 step 6
// UNVERIFIED and the one exit rule of V-12/V-13) — not product code. The module PLAN step S01-22 asks BUILD to write at
// acceptance/pes-s01-publish-set-acceptance.ts. Kept here only so `tsc` can check the plan's code block.

/** SPEC-v3 §5 "ROSTER ELEMENT E, exactly as written here". */
export const PES_S01_ELEMENT_E = Object.freeze({
  provider_ref: "vendor:a",
  adapter_kind: "openai-compatible-http",
  maker: "Acme",
  vetting: Object.freeze({
    data_use_terms_reviewed_on: "2026-09-01",
    retention_terms_reviewed_on: "2026-09-01",
    named_in_privacy_notice: true
  }),
  base_url: "https://api.acme.example/v1",
  model: "acme-large",
  runner_authorization_file: "/etc/debateai/runner/providers/acme.header",
  api_authorization_file: "/etc/debateai/api/providers/acme.header",
  input_price_micros_per_million: 1000,
  output_price_micros_per_million: 2000
});

export type PesS01Case = Readonly<{
  name: string;
  elements: readonly unknown[];
  environment: Readonly<Record<string, string>>;
  line: string | null;
}>;

const E = PES_S01_ELEMENT_E;

/** SPEC-v3 §5's case table, in its order; `line: null` is the `published` case (the three lines of R1.8). */
export const PES_S01_CASES: readonly PesS01Case[] = Object.freeze([
  { name: "not-hosted", elements: [E], environment: { DEBATEAI_DEPLOYMENT_MODE: "local" },
    line: "PES_PUBLISH_SET_NOT_HOSTED:local" },
  { name: "roster-invalid", elements: [E, E], environment: {}, line: "PES_PUBLISH_ROSTER_INVALID:vendor:a" },
  { name: "base-row-absent", elements: [E], environment: { REGISTER_VERSION: "999" },
    line: "PES_PUBLISH_BASE_ROW_ABSENT:999" },
  { name: "unvetted", elements: [{ ...E, vetting: { ...E.vetting, named_in_privacy_notice: false } }],
    environment: {}, line: "PROVIDER_VENDOR_NOT_VETTED:vendor:a" },
  { name: "targets-rejected", elements: [{ ...E, base_url: "https://api.acme.example/v2" }], environment: {},
    line: "PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID" },
  { name: "published", elements: [E], environment: {}, line: null },
  { name: "role-provider-dropped", elements: [E], environment: {},
    line: "PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef" }
]);

import {
  buildAlgorithmRegisterRows,
  parseCanonicalRegisterJson,
  type RegisterPublicationRow
} from "@debateai/register";

/** SPEC-v4 R1.12: the two role rows added to the `published` version before `role-provider-dropped`. */
export const PES_S01_ROLE_ROWS_SOURCE_REF = "provider-env-selection/S01#acceptance-role-rows";
export const PES_S01_ROLE_ROWS: readonly Readonly<{ rowKey: string; value: Readonly<Record<string, unknown>> }>[] =
  Object.freeze([
    { rowKey: "synthesizerRoleRef", value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "vendor:a", provisional: true } },
    { rowKey: "evaluatorRoleRef", value: { kind: "EVALUATOR_ROLE_REF", providerRef: "vendor:z", provisional: true } }
  ]);

/** EXACT, measured through the shipped functions by ARCH-PES-S01 probe p1. */
export const PES_S01_EXPECTED_RUNNER_LINE = "PES_HOSTED_TARGETS_RUNNER_V1="
  + "[{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.acme.example/v1\",\"model\":\"acme-large\","
  + "\"authorization_file\":\"/etc/debateai/runner/providers/acme.header\","
  + "\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}]";
export const PES_S01_EXPECTED_API_LINE = "PES_HOSTED_TARGETS_API_V1="
  + "[{\"provider_ref\":\"vendor:a\",\"base_url\":\"https://api.acme.example/v1\",\"model\":\"acme-large\","
  + "\"authorization_file\":\"/etc/debateai/api/providers/acme.header\","
  + "\"input_price_micros_per_million\":1000,\"output_price_micros_per_million\":2000}]";

/** COMMON §6: the ports a scratch database may never be. */
export const PES_S01_NO_TOUCH_PORTS: readonly number[] = Object.freeze([
  3000, 3001, 4310, 8790, 8791, 8792, 8793, 8795, 8796, 55432
]);

/**
 * The role seed's rows (DECISIONS 2026-09-25, V-ROW NEW default): the two role rows EXACTLY as SPEC-v4 R1.12 names
 * them, plus the other 15 rows of the register's required-row manifest (migrations/0050, 0064 — the same 17 keys as
 * ALGORITHM_REGISTER_ROW_KEYS), taken from the shipped buildAlgorithmRegisterRows. A publication that adds a role row
 * without them is refused by the database with REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs
 * (migrations/0061's trigger; probe ARCH-FIX-PES-S01-p2/d2).
 */
export function buildPesS01RoleSeedRows(): readonly RegisterPublicationRow[] {
  const canonical = (value: unknown): RegisterPublicationRow["valueJsonText"] =>
    parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8"));
  const roleKeys = new Set(PES_S01_ROLE_ROWS.map((row) => row.rowKey));
  const others = buildAlgorithmRegisterRows({
    deploymentSourceRef: PES_S01_ROLE_ROWS_SOURCE_REF,
    synthesizerRoleRef: "vendor:a",
    evaluatorRoleRef: "vendor:z",
    providerFamilies: [{ familyRef: "acme", providerRefs: ["vendor:a"] }]
  }).filter((row) => !roleKeys.has(row.rowKey));
  return Object.freeze([
    ...PES_S01_ROLE_ROWS.map((row) => Object.freeze({
      rowKey: row.rowKey, valueJsonText: canonical(row.value), sourceRef: PES_S01_ROLE_ROWS_SOURCE_REF
    })),
    ...others.map((row) => Object.freeze({
      rowKey: row.rowKey, valueJsonText: canonical(row.value), sourceRef: row.sourceRef
    }))
  ]);
}

const RECEIPT_LINE = /^PES_HOSTED_PROVIDER_SET_RECEIPT_V1=(\{.*\})$/u;

export type PesS01ScratchDatabase = Readonly<{ connectionString: string; pool: unknown; stop(): Promise<void> }>;
export type PesS01CommandResult = Readonly<{ exitCode: number | null; stdout: string; stderr: string }>;
export type PesS01AcceptanceDependencies = Readonly<{
  startDatabase(): Promise<PesS01ScratchDatabase>;
  seedVersion4(pool: unknown): Promise<number>;
  /** Adds PES_S01_ROLE_ROWS to `version`; resolves the new version's text (the receipt's `registerVersion`). */
  seedRoleRows(pool: unknown, version: string): Promise<string>;
  writeRoster(caseName: string, text: string): Promise<string>;
  runPublishCommand(environment: Readonly<Record<string, string>>): Promise<PesS01CommandResult>;
  baseEnvironment: Readonly<Record<string, string>>;
  print(line: string): void;
}>;

function publishedVersionOf(result: PesS01CommandResult): string {
  const receipt = RECEIPT_LINE.exec(result.stdout.split("\n")[2] ?? "");
  return (JSON.parse(receipt![1]!) as Readonly<{ registerVersion: string }>).registerVersion;
}

function publishedHolds(result: PesS01CommandResult): boolean {
  if (result.exitCode !== 0 || result.stderr !== "") return false;
  const lines = result.stdout.split("\n");
  if (lines.length !== 4 || lines[3] !== "") return false;
  if (lines[0] !== PES_S01_EXPECTED_RUNNER_LINE || lines[1] !== PES_S01_EXPECTED_API_LINE) return false;
  const receipt = RECEIPT_LINE.exec(lines[2] ?? "");
  if (receipt === null) return false;
  const value = JSON.parse(receipt[1]!) as Readonly<Record<string, unknown>>;
  const version = value.registerVersion;
  const digest = value.snapshotSha256;
  return JSON.stringify(Object.keys(value)) === JSON.stringify(["registerVersion", "rowCount", "snapshotSha256"])
    && typeof version === "string" && /^[1-9][0-9]*$/u.test(version) && BigInt(version) > 4n
    && value.rowCount === 32
    && typeof digest === "string" && /^[0-9a-f]{64}$/u.test(digest);
}

/** One line: the error's own text with every line break read as a space (SPEC-v4 §5 step 6). */
function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*[\r\n]+\s*/gu, " ").trim();
}

/** Resolves the exit code: 0 on PASS, 1 on FAIL and on UNVERIFIED (V-12/V-13, SPEC-v4 §5 step 6). */
export async function runPesS01PublishSetAcceptance(dependencies: PesS01AcceptanceDependencies): Promise<0 | 1> {
  let database: PesS01ScratchDatabase;
  try {
    database = await dependencies.startDatabase();
  } catch (error) {
    // The one UNVERIFIED outcome: the scratch database could not start. Nothing to stop.
    dependencies.print(`PES-S01-ACCEPT: UNVERIFIED ${oneLine(error)}`);
    return 1;
  }
  let failed: string | undefined;
  try {
    const port = Number(new URL(database.connectionString).port);
    const rowCount = await dependencies.seedVersion4(database.pool);
    dependencies.print(`PES-S01 SCRATCH-DB port=${port} seeded-version=4 rows=${rowCount}`);
    if (!(port > 4400) || PES_S01_NO_TOUCH_PORTS.includes(port) || rowCount !== 32) failed = "scratch-db";
    let publishedVersion: string | undefined;
    for (const testCase of PES_S01_CASES) {
      let holds = false;
      try {
        const environment: Record<string, string> = { ...testCase.environment };
        if (testCase.name === "role-provider-dropped") {
          if (publishedVersion === undefined) throw new TypeError("PES_S01_NO_PUBLISHED_VERSION");
          const roleVersion = await dependencies.seedRoleRows(database.pool, publishedVersion);
          dependencies.print(`PES-S01 ROLE-SEED version=${roleVersion}`);
          environment.REGISTER_VERSION = roleVersion;
        }
        const rosterPath = await dependencies.writeRoster(
          testCase.name, JSON.stringify({ providers: testCase.elements })
        );
        const result = await dependencies.runPublishCommand({
          ...dependencies.baseEnvironment,
          REGISTER_VERSION: "4",
          MIGRATION_DATABASE_URL: database.connectionString,
          DEBATEAI_DEPLOYMENT_MODE: "hosted",
          PROVIDER_HOSTED_ROSTER_PATH: rosterPath,
          ...environment
        });
        const noBearer = !result.stdout.includes("Bearer") && !result.stderr.includes("Bearer");
        if (testCase.line === null) {
          holds = noBearer && publishedHolds(result);
          if (holds) publishedVersion = publishedVersionOf(result);
          dependencies.print(`PES-S01 CASE ${testCase.name}`);
          for (const line of result.stdout.split("\n").filter((line) => line !== "")) dependencies.print(line);
        } else {
          holds = noBearer && result.exitCode !== 0 && result.stdout === ""
            && result.stderr === `${testCase.line}\n`;
          dependencies.print(`PES-S01 CASE ${testCase.name} ${result.stderr.trimEnd().split("\n").at(-1) ?? ""}`);
        }
      } catch {
        dependencies.print(`PES-S01 CASE ${testCase.name} PES-S01-CASE-ERROR`);
      }
      if (!holds) failed ??= testCase.name;
    }
  } catch {
    failed ??= "scratch-db";
  } finally {
    try {
      await database.stop();
      dependencies.print("PES-S01 SCRATCH-DB STOPPED");
    } catch {
      failed ??= "scratch-db";
    }
  }
  dependencies.print(failed === undefined ? "PES-S01-ACCEPT: PASS" : `PES-S01-ACCEPT: FAIL ${failed}`);
  return failed === undefined ? 0 : 1;
}
