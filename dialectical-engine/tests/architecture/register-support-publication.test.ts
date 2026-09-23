import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname } from "node:path";
import { promisify } from "node:util";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";
import {
  AUTH_POLICY_REGISTER_ROWS,
  AUTH_POLICY_ROW_KEYS,
  MFA_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_REGISTER_ROW,
  SESSION_POLICY_REGISTER_ROW,
  buildBootstrapRegisterPublicationRows,
  canonicalRegisterJson,
  computeRegisterSnapshotSha256,
  loadBootstrapRegister
} from "../../packages/register/src/index.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from
  "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  readLegacyDevelopmentV4Rows,
  DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256,
  LEGACY_REGISTER_V1_SNAPSHOT_SHA256
} from "../support/registerFixtures.js";

const migrationPath = "migrations/0055_register_support_publication.sql";
const productionRunbookPath =
  "docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md";

async function migrationSource(): Promise<string> {
  return readFile(migrationPath, "utf8").catch(() => "");
}

const execFileAsync = promisify(execFile);
const CENSUS_ROOTS = Object.freeze([
  "apps", "packages", "acceptance", "tests", "tools", "scripts", "migrations"
]);
const CLOSED_WRITE_SURFACES = new Set([
  "migrations/0055_register_support_publication.sql",
  "packages/register/src/register-publication.ts",
  "tests/architecture/register-support-publication.test.ts",
  "tests/integration/register-support-publication.test.ts"
]);
const EXPECTED_DENIED_REGISTER_WRITE =
  "INSERT INTO register.register_row(register_version,row_key,value_json,source_ref) "
  + "VALUES(4,'operator-direct-dml','true'::jsonb,'deployment:forbidden')";
const DENIED_REGISTER_WRITE_CALLERS: ReadonlyMap<string, string> = new Map([
  ["tests/integration/dev-deployment-register.test.ts", "operatorPool"],
  ["tests/integration/production-database-principals.test.ts", "heldPool"]
] as const);

type StaticSql = Readonly<{ file: string; text: string }>;

function normalizedSql(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function isExpectedDeniedRegisterWrite(statement: StaticSql): boolean {
  return DENIED_REGISTER_WRITE_CALLERS.has(statement.file)
    && normalizedSql(statement.text) === EXPECTED_DENIED_REGISTER_WRITE;
}

function staticText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticText(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left);
    const right = staticText(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const member = staticText(span.expression);
      if (member === undefined) return undefined;
      text += member + span.literal.text;
    }
    return text;
  }
  if (ts.isTaggedTemplateExpression(node)) return staticText(node.template);
  return undefined;
}

function collectStaticSql(file: string, source: string): StaticSql[] {
  if (extname(file) === ".sql") return [{ file, text: source }];
  const scriptKind = extname(file) === ".js" || extname(file) === ".mjs"
    ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const statements: StaticSql[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExpression(node)) {
      const text = staticText(node);
      if (text !== undefined && /\bregister[.](?:register_row|register_version(?:_id_seq)?)\b/iu.test(text)) {
        statements.push({ file, text });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return statements;
}

async function repositoryCensus(): Promise<Readonly<{
  files: readonly string[];
  sql: readonly StaticSql[];
  sources: ReadonlyMap<string, string>;
}>> {
  const result = await execFileAsync("git", [
    "ls-files", "--cached", "--others", "--exclude-standard", "--", ...CENSUS_ROOTS
  ]);
  const files = result.stdout.split("\n").filter((file) => /[.](?:[cm]?[jt]s|sql)$/u.test(file));
  const entries = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const));
  const sources = new Map(entries);
  return Object.freeze({
    files: Object.freeze(files),
    sources,
    sql: Object.freeze(entries.flatMap(([file, source]) => collectStaticSql(file, source)))
  });
}

describe("REGISTER-SUPPORT-PUBLICATION schema source contract", () => {
  it("pins the reader-first rollout, explicit old-binary version, and forward-only containment recipe", async () => {
    const [runbook, runtimeEnvironment, apiMain, runnerMain, compatibilityTest,
      developmentTest, productionTest] = await Promise.all([
      readFile(productionRunbookPath, "utf8"),
      readFile("packages/register/src/runtime-environment.ts", "utf8"),
      readFile("apps/api/src/main.ts", "utf8"),
      readFile("apps/runner/src/main.ts", "utf8"),
      readFile("tests/integration/register-support-publication.test.ts", "utf8"),
      readFile("tests/integration/dev-deployment-register.test.ts", "utf8"),
      readFile("tests/integration/production-database-principals.test.ts", "utf8")
    ]);
    const rolloutStart = runbook.indexOf("## Support configuration rollout and forward-only rollback");
    expect(rolloutStart).toBeGreaterThanOrEqual(0);
    const rollout = runbook.slice(rolloutStart);
    const compactRollout = rollout.replace(/\s+/gu, " ");

    const orderedSteps = [
      "1. Apply `migrations/0055_register_support_publication.sql`",
      "2. Validate immutable v1/v4 history and the allocator",
      "3. Deploy schema-1 support readers",
      "4. Provision and test the support-configuration operator",
      "5. Publish the complete 16-key production snapshot disabled",
      "6. Capture the publication receipt and post-COMMIT acknowledgement"
    ];
    let cursor = -1;
    for (const step of orderedSteps) {
      const next = compactRollout.indexOf(step);
      expect(next, `missing rollout step: ${step}`).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(compactRollout).toContain("explicit deployed `REGISTER_VERSION`");
    expect(compactRollout).toContain("old binary must receive an explicit immutable `REGISTER_VERSION`");
    expect(compactRollout).toContain("publish OFF first");
    expect(compactRollout).toContain("NOLOGIN");
    expect(compactRollout).toContain("terminate established support-operator sessions");
    expect(compactRollout).toContain("remove the credential file");
    expect(compactRollout).toContain("Only after containment");
    expect(compactRollout).toContain("recorded time, not commit time");
    expect(rollout).not.toMatch(/(?:DELETE\s+FROM|DROP\s+(?:TABLE|FUNCTION|SCHEMA)|reverse\s+migration)/iu);

    const initializer = /<!-- SUPPORT-CONFIG-INITIALIZER-BEGIN -->([\s\S]*?)<!-- SUPPORT-CONFIG-INITIALIZER-END -->/u
      .exec(rollout)?.[1] ?? "";
    for (const binding of [
      "node --import tsx --input-type=module -",
      "/run/debateai/support-config/operator.json",
      "018e51cd-6ba7-4f42-8cb6-6b8292f2e031",
      "deployment:production-initial-off:change-2026-09-06",
      "withProductionSupportConfigCliConnection",
      "createPostgresRegisterPublicationPort(boundedOperatorPool).publishSupport",
      "parseRegisterVersionText(deployedBaseText)",
      "expectedSupportRegisterVersion: null",
      "schemaVersion: 1",
      "patch: SUPPORT_CONFIGURATION_KEYS.map",
      "support_enabled: \"false\"",
      "support_retention_policy: '\"keep\"'",
      "support_retention_ratified_by: \"null\"",
      "const receipt: SupportPublicationReceipt",
      "const commitAcknowledgedAt = new Date()",
      "SUPPORT_CONFIGURATION_INITIALIZED=",
      "supportSnapshotSha256: receipt.supportSnapshotSha256",
      "snapshotSha256: receipt.snapshotSha256",
      "recordedAt: receipt.recordedAt.toISOString()"
    ]) expect(initializer, `missing executable initializer binding: ${binding}`).toContain(binding);
    expect(initializer.match(/^  support_[a-z0-9_]+:/gmu)).toHaveLength(16);
    expect(initializer).not.toMatch(
      /(?:process[.]env|\bcurrent\b|\blatest\b|MIGRATION_DATABASE_URL|databaseUrl|password|token|publishGeneral|publish_support_configuration|[.]query\s*\()/iu
    );
    // VACUOUS-ORDERING GUARD: the binding loop above pins
    // "const commitAcknowledgedAt = new Date()" but not the connection call, so
    // a missing connection gave indexOf -1 and this comparison passed anyway.
    expect(initializer).toContain("await withProductionSupportConfigCliConnection");
    expect(initializer.indexOf("await withProductionSupportConfigCliConnection"))
      .toBeLessThan(initializer.indexOf("const commitAcknowledgedAt = new Date()"));

    const compatibilitySchedule = compatibilityTest.slice(
      compatibilityTest.indexOf('it("upgrades exact historical v1/v4 bytes'),
      compatibilityTest.indexOf('it("accepts legacy 755')
    );
    const developmentSchedule = developmentTest.slice(
      developmentTest.indexOf('it("initializes the complete 16-key development'),
      developmentTest.indexOf("it.each([", developmentTest.indexOf(
        'it("initializes the complete 16-key development'
      ))
    );
    const productionSchedule = productionTest.slice(
      productionTest.indexOf('it("publishes emergency off before cleanup'),
      productionTest.indexOf('it("makes NOLOGIN visible', productionTest.indexOf(
        'it("publishes emergency off before cleanup'
      ))
    );
    for (const binding of [
      "CREATE ROLE ${operatorRole} LOGIN INHERIT",
      "createPostgresRegisterPublicationPort(operatorPool)",
      "operatorPort.publishSupport",
      "completeSupportPatch(false)",
      "operatorPort.readSupportStatus"
    ]) expect(compatibilitySchedule, `compatibility schedule bypass: ${binding}`).toContain(binding);
    expect(compatibilitySchedule).not.toMatch(/const initial = await publishSupport[(]/u);
    for (const binding of [
      "provisionDevelopmentDatabasePrincipals",
      "createPool(developmentOperatorUrl(",
      "createPostgresRegisterPublicationPort(operatorPool)",
      "port.publishSupport",
      "SUPPORT_CONFIGURATION_KEYS.map",
      "operatorPool.query",
      "port.publishGeneral"
    ]) expect(developmentSchedule, `development initializer bypass: ${binding}`).toContain(binding);
    expect(developmentSchedule).not.toMatch(/register[.]publish_support_configuration|database[.]pool[.]connect/u);
    for (const binding of [
      "readLegacyDevelopmentV4Rows",
      "DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256",
      "rows: deterministicV4Rows",
      "createPostgresRegisterPublicationPort(heldPool)",
      "SUPPORT_CONFIGURATION_KEYS.map",
      "operatorRegister.publishSupport",
      "heldPool.query",
      "operatorRegister.publishGeneral"
    ]) expect(productionSchedule, `production initializer bypass: ${binding}`).toContain(binding);
    expect(productionSchedule).not.toMatch(/register[.]publish_support_configuration/u);

    const statusBlock = /```text\n([\s\S]*?)\n```/u.exec(rollout)?.[1] ?? "";
    for (const field of [
      "deployed_register_version", "active_support_register_version",
      "support_schema_version", "marker_recorded_at", "base_register_version",
      "publication_uuid", "changed_keys", "source_ref", "request_sha256",
      "support_snapshot_sha256", "snapshot_sha256", "support_rows",
      "refresh_deadline_ms", "calls_today", "kb_status", "relay_state",
      "retention_state"
    ]) expect(statusBlock).toContain(`${field}:`);
    expect(statusBlock).not.toMatch(/(?:password|connection[_ ]?url|token|transcript|ip_address|identity|raw_response)/iu);

    expect(runtimeEnvironment.match(/REGISTER_VERSION: legacyRegisterVersion/gu)).toHaveLength(2);
    expect(runtimeEnvironment).not.toMatch(
      /REGISTER_VERSION:\s*legacyRegisterVersion\s*[.]\s*(?:default|optional|catch)/u
    );
    expect(apiMain).toContain("environment.REGISTER_VERSION");
    expect(runnerMain.match(/environment[.]REGISTER_VERSION/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the support reader on one bounded isolated control-plane statement and preserves ordinary pools", async () => {
    const [databaseSource, supportSource, migration] = await Promise.all([
      readFile("packages/db/src/index.ts", "utf8"),
      readFile("packages/register/src/support-config.ts", "utf8"),
      migrationSource()
    ]);
    const ordinaryStart = databaseSource.indexOf("export function createPool(");
    const ordinaryEnd = databaseSource.indexOf("\n}\n", ordinaryStart) + 3;
    const ordinaryPoolBody = databaseSource.slice(ordinaryStart, ordinaryEnd);

    expect(databaseSource).toContain("export function createSupportControlPlanePool(");
    for (const option of [
      "max: 2", "connectionTimeoutMillis: 200",
      "statement_timeout: 700", "query_timeout: 750"
    ]) expect(databaseSource).toContain(option);
    expect(ordinaryPoolBody).not.toMatch(/SUPPORT|statement_timeout|query_timeout/iu);
    expect(supportSource).not.toContain("createPostgresRegisterPublicationPort");
    expect(supportSource).toContain("FROM register.read_support_configuration_status()");
    expect(supportSource.match(/client[.]query/gu)).toHaveLength(1);

    const selectorStart = migration.indexOf("FUNCTION register._current_support_register_version");
    const selectorEnd = migration.indexOf("$function$;", selectorStart);
    const selector = migration.slice(selectorStart, selectorEnd);
    const statusStart = migration.indexOf("FUNCTION register.read_support_configuration_status");
    const statusEnd = migration.indexOf("$function$;", statusStart);
    const status = migration.slice(statusStart, statusEnd);
    for (const invariant of [
      "WHERE version.sealed",
      "version.publication_kind = 'SUPPORT_CONFIGURATION'",
      "ORDER BY version.register_version DESC",
      "LIMIT 1"
    ]) expect(selector).toContain(invariant);
    expect(selector).not.toContain("snapshot_sha256");
    expect(selector).not.toContain("schema_version");
    for (const invariant of [
      "JOIN register.register_version AS version USING (register_version)",
      "annotated.snapshot_sha256::text",
      "register._snapshot_sha256(annotated.register_version)",
      "annotated.marker_value ->> 'target_register_version'",
      "annotated.marker_schema_version",
      "register._support_snapshot_sha256(annotated.register_version)",
      ") = 16",
      "integrity_valid boolean"
    ]) expect(status).toContain(invariant);
    expect(supportSource).toContain("schema_version,integrity_valid");
    expect(supportSource).not.toContain("1::integer AS schema_version");
  });

  it("keeps every future API support module behind the injected port boundary", async () => {
    const result = await execFileAsync("git", [
      "ls-files", "--cached", "--others", "--exclude-standard", "--", "apps/api/src/support"
    ]);
    const files = result.stdout.split("\n").filter((file) => /[.][cm]?[jt]s$/u.test(file));
    const violations = (await Promise.all(files.map(async (file) => ({
      file,
      source: await readFile(file, "utf8")
    })))).filter(({ source }) =>
      /(?:from\s+["']pg["']|@debateai\/db|createPool|PoolClient|RegisterPublicationPort|createPostgresRegisterPublicationPort|publishSupport)/u.test(source)
    ).map(({ file }) => file);
    expect(violations).toEqual([]);
  });

  it("keeps support operator credentials on the bounded dedicated file loader", async () => {
    const [loader, apiEnvironment] = await Promise.all([
      readFile("apps/runner/src/support-config-cli-credentials.ts", "utf8"),
      readFile("apps/runner/src/dev-api-environment.ts", "utf8")
    ]);
    expect(loader).toContain("O_NOFOLLOW");
    expect(loader).toContain("metadata.uid !== currentUid()");
    expect(loader).toContain("metadata.nlink !== 1");
    expect(loader).toContain("PRIVATE_FILE_MODE");
    expect(loader).toContain("PRIVATE_DIRECTORY_MODE");
    expect(loader).toContain("MAX_DEVELOPMENT_CREDENTIAL_FILE_BYTES");
    expect(loader).toContain("MAX_PRODUCTION_CREDENTIAL_FILE_BYTES");
    expect(loader).toContain("SUPPORT_CONFIG_OPERATOR_DATABASE_URL");
    expect(loader).toContain("debateai_dev_support_config_operator");
    expect(loader).toContain("debateai_prod_support_config_operator");
    expect(loader).toContain("loadProductionSupportConfigCliCredentials");
    expect(loader).toContain("withProductionSupportConfigCliConnection");
    expect(loader).toContain("connectionTimeoutMillis");
    expect(loader).toContain("statement_timeout");
    expect(loader).toContain("query_timeout");
    expect(loader).toContain("await pool.end()");
    expect(loader).not.toMatch(/process[.]env|MIGRATION_DATABASE_URL/u);

    const keyList = apiEnvironment.slice(
      apiEnvironment.indexOf("DEVELOPMENT_API_ENVIRONMENT_KEYS"),
      apiEnvironment.indexOf("] as const", apiEnvironment.indexOf("DEVELOPMENT_API_ENVIRONMENT_KEYS"))
    );
    expect(keyList).not.toContain("SUPPORT_CONFIG_OPERATOR_DATABASE_URL");
    expect(apiEnvironment).not.toContain('databases.get("SUPPORT_CONFIG_OPERATOR_DATABASE_URL")');
  });

  it("pins the exact pre-migration legacy v1 and deterministic test-panel v4 snapshots", () => {
    expect(LEGACY_REGISTER_V1_SNAPSHOT_SHA256)
      .toBe("8fde270cae50e99ea7ff723f50c26a64833a72347838ed4aee0eb9cbfea3104b");
    expect(DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256)
      .toBe("42b90bca671d96d6e1c53de5c3115ca2ab7a5e11b33ad0d9eb0437f44a32c6eb");
  });

  it("preserves the exact legacy hashes while the actual port input owns all 248 policy decimals", async () => {
    const bootstrap = await loadBootstrapRegister();
    const historicalRows = buildBootstrapRegisterPublicationRows(bootstrap);
    const developmentRows = await buildDevelopmentDeploymentRegisterPublicationRows(
      bootstrap,
      TEST_DEVELOPMENT_PROVIDER_PANEL
    );
    expect(historicalRows).toHaveLength(14);
    // W10/3 x T16: 47 -> 49. The development deployment now seals the two
    // synthesis-role cost rows `synthesizerCallBound` and `evaluatorCallBound`
    // (migrations/0064_synthesis_role_cost_rows.sql, minted through T16's
    // mechanism in `buildAlgorithmRegisterRows`), and this pin counts the rows
    // the publication port actually emits. MEASURED, not inferred: the port
    // emits 49 with no duplicate keys, and 47 with exactly those two keys
    // removed — so the two W10 rows are the whole delta and nothing else moved.
    //
    // The three neighbouring counts are deliberately UNCHANGED: `historicalRows`
    // is the bootstrap set and `readLegacyDevelopmentV4Rows` an on-disk legacy
    // snapshot, neither of which a new deployment row can reach.
    //
    // DEV-SYNC 2026-09-18 x B10: 49 -> 50. The security hardening seals one more
    // deployment row, `admissionPolicy` (ask / public-read / recovery-start
    // budgets; packages/register/src/session-policy.ts). It is a DEPLOYMENT row
    // and deliberately not a bootstrap row, so `historicalRows` stays 14 and its
    // legacy hash below is untouched. MEASURED: the port emits 50 with no
    // duplicate keys, and 49 with exactly `admissionPolicy` removed.
    //
    // TASK 11 x V-28: 50 -> 51. The deployment now also seals `costEnvelopePolicy`
    // (the per-run and daily spending ceilings, in money;
    // packages/register/src/cost-envelope-policy.ts). It is a DEPLOYMENT row for
    // the same reason `admissionPolicy` is, so `historicalRows` stays 14 and the
    // legacy hash below is untouched. MEASURED: the port emits 51 with no
    // duplicate keys, and 50 with exactly `costEnvelopePolicy` removed.
    expect(developmentRows).toHaveLength(51);
    expect(developmentRows.filter((row) => row.rowKey !== "admissionPolicy")).toHaveLength(50);
    expect(developmentRows.filter((row) => row.rowKey !== "costEnvelopePolicy")).toHaveLength(50);
    expect(await readLegacyDevelopmentV4Rows()).toHaveLength(32);
    expect(computeRegisterSnapshotSha256(historicalRows)).toBe(LEGACY_REGISTER_V1_SNAPSHOT_SHA256);
    expect(computeRegisterSnapshotSha256(await readLegacyDevelopmentV4Rows()))
      .toBe(DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256);

    const policyKeys = new Set([
      ...AUTH_POLICY_ROW_KEYS,
      "mfaPolicy", "sessionPolicy", "recoveryPolicy", "productRolePolicy"
    ]);
    const countNumbers = (value: unknown): number => {
      if (typeof value === "number") return 1;
      if (Array.isArray(value)) return value.reduce((sum, member) => sum + countNumbers(member), 0);
      if (value !== null && typeof value === "object") {
        return Object.values(value).reduce((sum, member) => sum + countNumbers(member), 0);
      }
      return 0;
    };
    const policyRows = historicalRows.filter((row) => policyKeys.has(row.rowKey));
    expect(policyRows.reduce(
      (sum, row) => sum + countNumbers(JSON.parse(row.valueJsonText)),
      0
    )).toBe(248);

    const publicationPolicyRows = [
      ...AUTH_POLICY_REGISTER_ROWS,
      MFA_POLICY_REGISTER_ROW,
      SESSION_POLICY_REGISTER_ROW,
      RECOVERY_POLICY_REGISTER_ROW,
      PRODUCT_ROLE_POLICY_REGISTER_ROW
    ];
    const inspectAst = (value: unknown): Readonly<{ decimals: number; numbers: number }> => {
      if (typeof value === "number") return { decimals: 0, numbers: 1 };
      if (Array.isArray(value)) return value.reduce(
        (total, member) => {
          const found = inspectAst(member);
          return { decimals: total.decimals + found.decimals, numbers: total.numbers + found.numbers };
        },
        { decimals: 0, numbers: 0 }
      );
      if (value !== null && typeof value === "object") {
        if ((value as { kind?: unknown }).kind === "DECIMAL") return { decimals: 1, numbers: 0 };
        return Object.values(value).reduce(
          (total, member) => {
            const found = inspectAst(member);
            return { decimals: total.decimals + found.decimals, numbers: total.numbers + found.numbers };
          },
          { decimals: 0, numbers: 0 }
        );
      }
      return { decimals: 0, numbers: 0 };
    };
    const policyAstCensus = inspectAst(publicationPolicyRows.map((row) => row.valueAst));
    expect(policyAstCensus).toEqual({ decimals: 248, numbers: 0 });

    const readerObject = JSON.parse(policyRows[0]!.valueJsonText) as Record<string, unknown>;
    expect(() => canonicalRegisterJson(readerObject as never))
      .toThrowError("CANONICAL_REGISTER_JSON_AST_INVALID");
  });

  it("recognizes hostile static SQL concatenation, interpolation, and tagged builders", () => {
    const source = [
      "const a = 'INSERT INTO register.' + 'register_row VALUES (5,1,2,3)';",
      "const b = `SELECT * FROM register.${'register_version'} ORDER BY register_version DESC LIMIT 1`;",
      "const c = sql`SELECT nextval(${'register.register_version_id_seq'})`;"
    ].join("\n");
    const found = collectStaticSql("hostile.ts", source).map(({ text }) => text);
    expect(found).toEqual(expect.arrayContaining([
      "INSERT INTO register.register_row VALUES (5,1,2,3)",
      "SELECT * FROM register.register_version ORDER BY register_version DESC LIMIT 1"
    ]));
    expect(found.some((text) => text.includes("register.register_version_id_seq"))).toBe(true);
  });

  it("classifies every register relation access and bans open writers, latest selection, and unsafe version coercion", async () => {
    const census = await repositoryCensus();
    expect(census.files).toContain("tests/support/registerFixtures.ts");
    const deniedRegisterWrites = census.sql.filter(isExpectedDeniedRegisterWrite);
    expect(deniedRegisterWrites.map(({ file }) => file).sort())
      .toEqual([...DENIED_REGISTER_WRITE_CALLERS.keys()].sort());
    for (const [file, caller] of DENIED_REGISTER_WRITE_CALLERS) {
      const source = census.sources.get(file) ?? "";
      const marker = source.indexOf("'operator-direct-dml'");
      const proofStart = source.lastIndexOf("await expect(", marker);
      const proofEnd = source.indexOf(";", marker);
      const proof = source.slice(proofStart, proofEnd + 1);
      expect(marker, `missing denied register DML marker: ${file}`).toBeGreaterThanOrEqual(0);
      expect(proofStart, `denied register DML is not awaited: ${file}`).toBeGreaterThanOrEqual(0);
      expect(proof, `wrong denied register DML caller: ${file}`).toContain(`${caller}.query`);
      expect(proof, `denied register DML lacks SQLSTATE 42501 binding: ${file}`)
        .toMatch(/[.]rejects[.]toMatchObject\(\{\s*code:\s*"42501"\s*\}\)/u);
    }
    const directWrites = census.sql.filter(({ file, text }) =>
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+register[.](?:register_row|register_version)\b/iu.test(text)
      && !isExpectedDeniedRegisterWrite({ file, text })
      && !CLOSED_WRITE_SURFACES.has(file)
      && !/^migrations\/(?:00(?:0[0-9]|[1-4][0-9]|5[0-4]))/u.test(file)
    ).map(({ file }) => file);
    expect([...new Set(directWrites)]).toEqual([]);

    const relationAccesses = census.sql.flatMap(({ file, text }) => {
      const kinds = [] as Array<"READ" | "WRITE">;
      if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+register[.](?:register_row|register_version)\b/iu.test(text)) {
        kinds.push("WRITE");
      }
      if (/\b(?:FROM|JOIN)\s+register[.](?:register_row|register_version)\b/iu.test(text)) {
        kinds.push("READ");
      }
      return kinds.map((kind) => ({ file, text, kind }));
    });
    const unclassified = relationAccesses.filter(({ file, text, kind }) => {
      if (/^migrations\//u.test(file)) return false;
      if (kind === "WRITE") {
        return !CLOSED_WRITE_SURFACES.has(file) && !isExpectedDeniedRegisterWrite({ file, text });
      }
      if (/^(?:tests|acceptance)\//u.test(file)) return false;
      return !/\b(?:[a-z_]+[.])?register_version\s*=\s*\$[0-9]+/iu.test(text)
        && !/\bregister_version\s*=\s*[1-4]\b/iu.test(text);
    }).map(({ file, kind }) => `${kind}:${file}`);
    expect([...new Set(unclassified)]).toEqual([]);

    const latestReads = census.sql.filter(({ file, text }) =>
      /(?:max\s*\(\s*register_version\s*\)|ORDER\s+BY\s+register_version\s+DESC\s+LIMIT\s+1)/iu.test(text)
      && file !== migrationPath
      && file !== "tests/architecture/register-support-publication.test.ts"
      && file !== "tests/integration/register-support-publication.test.ts"
    ).map(({ file }) => file);
    expect([...new Set(latestReads)]).toEqual([]);

    const sequenceUsers = census.sql.filter(({ file, text }) =>
      /register_version_id_seq|nextval\s*\(/iu.test(text)
      && file !== migrationPath
      && file !== "tests/architecture/register-support-publication.test.ts"
      && file !== "tests/integration/register-support-publication.test.ts"
      && !/^migrations\/(?:00(?:0[0-9]|[1-4][0-9]|5[0-4]))/u.test(file)
    ).map(({ file }) => file);
    expect([...new Set(sequenceUsers)]).toEqual([]);

    const futureLiteralVersions = census.sql.flatMap(({ file, text }) => {
      if (/^migrations\//u.test(file)
        || file === "tests/architecture/register-support-publication.test.ts"
        || file === "tests/integration/register-support-publication.test.ts") return [];
      return [...text.matchAll(/\bregister_version\s*=\s*([0-9]+)\b/giu)]
        .filter((match) => Number(match[1]) > 4)
        .map(() => file);
    });
    expect([...new Set(futureLiteralVersions)]).toEqual([]);

    const unsafeConversions = [...census.sources].flatMap(([file, source]) => {
      if (file === "packages/register/src/register-publication.ts") return [];
      return /(?:\bNumber|\bparseInt|\bparseFloat)\s*\([^)]*(?:register_version|registerVersion)/u.test(source)
        ? [file] : [];
    });
    expect([...new Set(unsafeConversions)]).toEqual([]);

    const fixedFutureEnvironment = [...census.sources].flatMap(([file, source]) =>
      /^(?:apps|packages|acceptance)\//u.test(file)
        && /\b(?:REGISTER_VERSION|registerVersion)\s*[:=]\s*(?:["']5["']|5\b)/u.test(source)
        ? [file] : []
    );
    expect([...new Set(fixedFutureEnvironment)]).toEqual([]);

    const markerCapableGenericCalls = [...census.sources].flatMap(([file, source]) =>
      /^(?:apps|packages|acceptance)\//u.test(file)
        && file !== "packages/register/src/register-publication.ts"
        && /publishGeneral/u.test(source)
        && /supportActivation/u.test(source)
        ? [file] : []
    );
    expect([...new Set(markerCapableGenericCalls)]).toEqual([]);
  });
  it("defines the allocated replay-safe schema and closed SQL capabilities", async () => {
    const source = await migrationSource();

    expect(source).toContain("register_version_id_seq");
    for (const column of [
      "base_register_version bigint",
      "publication_id uuid",
      "request_sha256 char(64)",
      "snapshot_sha256 char(64)",
      "publication_kind text",
      "recorded_at timestamptz"
    ]) expect(source).toContain(column);
    for (const object of [
      "register_row_register_version_fk",
      "register_version_base_register_version_fk",
      "register_version_publication_kind_check",
      "_assert_register_base_integrity",
      "allocate_register_version",
      "import_historical_register_version",
      "publish_register_version",
      "publish_support_configuration",
      "read_support_configuration_status"
    ]) expect(source).toContain(object);
    expect(source).toContain("debateai:register-publication:v3");
    expect(source).toContain("debateai:register-version:");
    expect(source).toContain("SECURITY DEFINER");
    expect(source).toContain("SET search_path = pg_catalog, register");
    expect(source).toContain("debateai_register_publication_owner");
    expect(source).toContain("debateai_support_config_operator");
    expect(source).toMatch(/NOINHERIT\s+NOLOGIN|NOLOGIN\s+NOINHERIT/iu);
    expect(source).toMatch(/REVOKE\s+INSERT[\s\S]+FROM\s+PUBLIC/iu);
    expect(source).toMatch(/REVOKE\s+INSERT[\s\S]+FROM\s+debateai_runtime/iu);
    expect(source).toMatch(/REVOKE\s+ALL[\s\S]+allocate_register_version[\s\S]+FROM\s+PUBLIC/iu);
  });

  it("forbids destructive, reverse-history, and credential-bearing migration SQL", async () => {
    const source = await migrationSource();
    const executable = source
      .replace(/--[^\n]*/gu, "")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/NOLOGIN/giu, "")
      .replace(/SUPPORT_CONFIG_VERSION_ROLLBACK/giu, "");

    expect(executable).not.toMatch(/\b(?:DROP|DELETE|CASCADE|PASSWORD|LOGIN)\b/iu);
    expect(executable).not.toMatch(/\b(?:UPDATE|ALTER)\b[\s\S]{0,160}\bregister_version\b[\s\S]{0,160}\b(?:SET|RESTART)\b/iu);
  });

  it("discovers exactly the allocated migration and the exact SQL port signatures", async () => {
    expect((await readdir("migrations")).filter((name) => /^0055_register_support_publication[.]sql$/u.test(name)))
      .toEqual(["0055_register_support_publication.sql"]);
    const compact = (await migrationSource()).replace(/\s+/gu, " ");
    for (const signature of [
      /register[.]publish_register_version\s*\( p_publication_id uuid, p_request_sha256 char\(64\), p_base_register_version bigint, p_rows jsonb, p_source_ref text \)/u,
      /register[.]publish_support_configuration\s*\( p_publication_id uuid, p_request_sha256 char\(64\), p_expected_support_register_version bigint, p_base_register_version bigint, p_schema_version integer, p_patch jsonb, p_source_ref text \)/u,
      /register[.]read_support_configuration_status\s*\(\)/u
    ]) expect(compact).toMatch(signature);
    expect(compact).toContain("greatest( 4::bigint, coalesce(pg_catalog.max(register_version), 0::bigint) ) + 1");
    expect(compact).toContain("v_existing_next := v_last_value::numeric + CASE WHEN v_is_called THEN 1 ELSE 0 END");
    expect(compact).toContain("pg_catalog.setval( 'register.register_version_id_seq'::regclass, v_required_next, false )");
  });

  it("takes the global lock before every per-version lock and records time afterward", async () => {
    const source = await migrationSource();
    const block = (name: string): string => {
      const start = source.indexOf(`FUNCTION register.${name}`);
      const end = source.indexOf("$function$;", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    for (const functionName of [
      "_register_row_insert_guard", "_register_version_seal_guard",
      "_assert_register_base_integrity",
      "import_historical_register_version", "publish_register_version",
      "publish_support_configuration"
    ]) {
      const body = block(functionName);
      const globalLock = body.indexOf("debateai:register-publication:v3");
      const versionLock = body.indexOf("debateai:register-version:");
      expect(globalLock).toBeGreaterThan(-1);
      expect(versionLock).toBeGreaterThan(globalLock);
      if (functionName.startsWith("publish_")) {
        expect(body.indexOf("clock_timestamp()")).toBeGreaterThan(versionLock);
      }
    }
  });

  it("pins canonical framing, the exact catalogue, marker-last sealing, and drift mutants", async () => {
    const source = await migrationSource();
    expect(source).toContain("pg_catalog.int8send(");
    expect(source).toContain("pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8'))::bigint");
    expect(source).toContain("ORDER BY pg_catalog.convert_to(row_value.row_key, 'UTF8')");
    expect(source).toContain("REGISTER_PUBLICATION_DEFINITION_DRIFT: functions");
    expect(source).toContain("REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator sequence");
    expect(source).toContain("REGISTER_PUBLICATION_BASE_INVALID");
    expect(source).toContain("v_actual_changed_keys");
    expect(source).toContain("debateai_runtime','debateai_replay','debateai_support");
    expect(source).toContain("'SUPPORT_MARKER:' || v_version::text");
    expect(source.indexOf("VALUES (v_version,'supportActivation',v_marker,p_source_ref)"))
      .toBeLessThan(source.indexOf("'SEAL:SUPPORT_CONFIGURATION:' || v_version::text"));
    const catalogue = [
      "support_enabled", "support_model_ref", "support_relay_concurrency",
      "support_daily_call_cap", "support_limit_anon_msgs_10m",
      "support_limit_anon_msgs_24h", "support_limit_anon_sessions_1h",
      "support_limit_session_msgs", "support_limit_msg_chars",
      "support_limit_account_msgs_10m", "support_limit_account_msgs_24h",
      "support_queue_depth", "support_lock_after_injections",
      "support_ip_cooldown_minutes", "support_retention_policy",
      "support_retention_ratified_by"
    ];
    const keyBlock = source.slice(
      source.indexOf("FUNCTION register._support_keys"),
      source.indexOf("$function$;", source.indexOf("FUNCTION register._support_keys"))
    );
    for (const key of catalogue) expect(keyBlock).toContain(`'${key}'`);
    expect((keyBlock.match(/'support_[a-z0-9_]+'/gu) ?? [])).toHaveLength(16);
  });

  it("declares closed volatile security-definer surfaces and explicit grants", async () => {
    const source = await migrationSource();
    for (const name of [
      "_register_row_insert_guard", "_register_version_seal_guard",
      "_assert_register_base_integrity",
      "allocate_register_version", "import_historical_register_version",
      "publish_register_version", "publish_support_configuration",
      "read_support_configuration_status"
    ]) {
      const start = source.indexOf(`FUNCTION register.${name}`);
      const end = source.indexOf("$function$;", start);
      const declaration = source.slice(start, end);
      expect(declaration).toContain("VOLATILE");
      expect(declaration).toContain("SECURITY DEFINER");
      expect(declaration).toContain("SET search_path = pg_catalog, register");
    }
    expect(source).toMatch(/REVOKE ALL ON FUNCTION register[.]publish_support_configuration[\s\S]+FROM debateai_runtime,debateai_replay/iu);
    expect(source).toMatch(/GRANT EXECUTE ON FUNCTION register[.]publish_support_configuration[\s\S]+TO debateai_support_config_operator/iu);
    expect(source).toMatch(/REVOKE ALL ON FUNCTION register[.]publish_register_version[\s\S]+FROM debateai_replay,debateai_support_config_operator/iu);
  });
});
