// ARCH-PES-S01 PROPOSED CODE — not product code. The module PLAN step S01-22 asks BUILD to write at
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
  { name: "published", elements: [E], environment: {}, line: null }
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

const RECEIPT_LINE = /^PES_HOSTED_PROVIDER_SET_RECEIPT_V1=(\{.*\})$/u;

export type PesS01ScratchDatabase = Readonly<{ connectionString: string; pool: unknown; stop(): Promise<void> }>;
export type PesS01CommandResult = Readonly<{ exitCode: number | null; stdout: string; stderr: string }>;
export type PesS01AcceptanceDependencies = Readonly<{
  startDatabase(): Promise<PesS01ScratchDatabase>;
  seedVersion4(pool: unknown): Promise<number>;
  writeRoster(caseName: string, text: string): Promise<string>;
  runPublishCommand(environment: Readonly<Record<string, string>>): Promise<PesS01CommandResult>;
  baseEnvironment: Readonly<Record<string, string>>;
  print(line: string): void;
}>;

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

export async function runPesS01PublishSetAcceptance(dependencies: PesS01AcceptanceDependencies): Promise<boolean> {
  let failed: string | undefined;
  let database: PesS01ScratchDatabase | undefined;
  try {
    database = await dependencies.startDatabase();
    const port = Number(new URL(database.connectionString).port);
    const rowCount = await dependencies.seedVersion4(database.pool);
    dependencies.print(`PES-S01 SCRATCH-DB port=${port} seeded-version=4 rows=${rowCount}`);
    if (!(port > 4400) || PES_S01_NO_TOUCH_PORTS.includes(port) || rowCount !== 32) failed = "scratch-db";
    for (const testCase of PES_S01_CASES) {
      let holds = false;
      try {
        const rosterPath = await dependencies.writeRoster(
          testCase.name, JSON.stringify({ providers: testCase.elements })
        );
        const result = await dependencies.runPublishCommand({
          ...dependencies.baseEnvironment,
          REGISTER_VERSION: "4",
          MIGRATION_DATABASE_URL: database.connectionString,
          DEBATEAI_DEPLOYMENT_MODE: "hosted",
          PROVIDER_HOSTED_ROSTER_PATH: rosterPath,
          ...testCase.environment
        });
        const noBearer = !result.stdout.includes("Bearer") && !result.stderr.includes("Bearer");
        if (testCase.line === null) {
          holds = noBearer && publishedHolds(result);
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
    if (database !== undefined) {
      try {
        await database.stop();
        dependencies.print("PES-S01 SCRATCH-DB STOPPED");
      } catch {
        failed ??= "scratch-db";
      }
    }
  }
  dependencies.print(failed === undefined ? "PES-S01-ACCEPT: PASS" : `PES-S01-ACCEPT: FAIL ${failed}`);
  return failed === undefined;
}
