import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import ts from "../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  FIRST_PARTY_ROUTES,
  TOOL_REGISTRY
} from "../../apps/api/src/support/tools.js";
import { SUPPORT_ROUTE_PATHS } from "../../apps/api/src/support/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const forbiddenImports =
  /(?:registration|mfa|recovery|mail-channel|sessions|account-erasure|legacy-claim|packages\/crypto|db\/src\/identity)/u;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /[.](?:[cm]?[jt]s)$/u.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function importedSpecifiers(file: string, source: string): readonly string[] {
  const kind = extname(file) === ".js" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return specifiers;
}

describe("SUP-01 support capability boundary", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
  }, 120_000);

  afterAll(async () => database?.stop(), 120_000);

  it("grants debateai_support only SELECT and INSERT on the five support tables", async () => {
    const role = await database.pool.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      memberships: string;
    }>(`
      SELECT role.rolcanlogin,role.rolinherit,
        (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.roleid=role.oid OR membership.member=role.oid) AS memberships
      FROM pg_catalog.pg_roles AS role WHERE role.rolname='debateai_support'
    `);
    expect(role.rows).toEqual([{ rolcanlogin: false, rolinherit: false, memberships: "0" }]);

    const rows = await database.pool.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(`
      SELECT table_name,
        has_table_privilege('debateai_support', format('support.%I', table_name), 'SELECT') AS can_select,
        has_table_privilege('debateai_support', format('support.%I', table_name), 'INSERT') AS can_insert,
        has_table_privilege('debateai_support', format('support.%I', table_name), 'UPDATE') AS can_update,
        has_table_privilege('debateai_support', format('support.%I', table_name), 'DELETE') AS can_delete
      FROM information_schema.tables
      WHERE table_schema='support' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(rows.rows).toEqual([
      "abuse_event", "case", "message", "session", "session_key"
    ].map((table_name) => ({
      table_name, can_select: true, can_insert: true, can_update: false, can_delete: false
    })));

    const outside = await database.pool.query<{ table_name: string; can_select: boolean; can_insert: boolean }>(`
      SELECT table_name,
        has_table_privilege('debateai_support', table_name, 'SELECT') AS can_select,
        has_table_privilege('debateai_support', table_name, 'INSERT') AS can_insert
      FROM unnest(ARRAY[
        'identity.user','core.run','serve.answer','register.register_row','obs.occurrence'
      ]) AS denied(table_name)
    `);
    expect(outside.rows).toEqual([
      "identity.user", "core.run", "serve.answer", "register.register_row", "obs.occurrence"
    ].map((table_name) => ({ table_name, can_select: false, can_insert: false })));
  });

  it("keeps the tool registry and first-party link set closed and frozen", () => {
    expect(Object.keys(TOOL_REGISTRY)).toEqual([
      "answer_from_corpus", "link_first_party", "refuse"
    ]);
    expect(Object.isFrozen(TOOL_REGISTRY)).toBe(true);
    expect(FIRST_PARTY_ROUTES).toEqual([
      "/", "/new", "/login", "/sign-up", "/settings", "/help", "/public/debate/{id}"
    ]);
    expect(Object.isFrozen(FIRST_PARTY_ROUTES)).toBe(true);
  });

  it("parses imports and rejects zone modules from support code and the corpus package", async () => {
    const files = [
      ...await sourceFiles("apps/api/src/support"),
      ...await sourceFiles("packages/support-kb")
    ];
    const imports = (await Promise.all(files.map(async (file) => ({
      file,
      specifiers: importedSpecifiers(file, await readFile(file, "utf8"))
    })))).flatMap(({ file, specifiers }) => specifiers.map((specifier) => ({ file, specifier })));
    expect(imports.filter(({ specifier }) => forbiddenImports.test(specifier))).toEqual([]);
  });

  it("keeps API support code behind injected ports with typed loud errors", async () => {
    const files = await sourceFiles("apps/api/src/support");
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(
      /(?:from\s+["']pg["']|@debateai\/db|createPool|PoolClient|RegisterPublicationPort|publishSupport)/u
    );
    expect(source).not.toMatch(/(?:https?:\/\/|process[.]env|throw\s+new\s+(?:Error|TypeError)\b)/u);
    expect(source).toContain("extends TypedDomainError");

    const runner = `${await readFile("apps/runner/src/support-switch-cli.ts", "utf8")}\n${
      await readFile("apps/runner/src/support-status-cli.ts", "utf8")}`;
    expect(runner).not.toMatch(
      /(?:process[.]env|MIGRATION_DATABASE_URL|\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?register[.]|register_version_id_seq|https?:\/\/)/iu
    );
    expect(runner).toContain("RegisterPublicationPort");
    expect(runner).toContain("SupportStatusRepositoryPort");
  });

  it("composes the API support data plane from its dedicated credential", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("environment.SUPPORT_DATABASE_URL");
    expect(main).toContain("assertSupportDatabaseRole");
    expect(main).toContain("PostgresSupportRepository");
    expect(main).toContain("createSupportConfigurationPort");
    expect(main).toContain("support: {");
    expect(main).toContain("installStartupResourceOwner");
    expect(main.indexOf("installStartupResourceOwner({"))
      .toBeLessThan(main.indexOf("assertSupportDatabaseRole(pool, supportPool)"));
    expect(main).toContain('startup.run("support-attestation"');
    expect(main).toContain('startup.run("listen"');
  });

  it("exposes exactly seven support routes and no zone route", () => {
    expect(SUPPORT_ROUTE_PATHS).toEqual([
      "POST /v1/support/sessions",
      "GET /v1/support/sessions/{id}",
      "POST /v1/support/sessions/{id}/messages",
      "POST /v1/support/messages/{id}/rating",
      "POST /v1/support/sessions/{id}/escalate",
      "GET /v1/support/cases/{token}",
      "GET /v1/support/status"
    ]);
    expect(SUPPORT_ROUTE_PATHS.some((route) =>
      /^\w+ \/v1\/(?:auth|account|debates|runs|answers|asks)(?:\/|$)/u.test(route)
    )).toBe(false);
  });

  it("keeps the migration support-domain-only, replayable, and forward-only", async () => {
    const source = await readFile("migrations/0050_support_foundation.sql", "utf8");
    expect(source).not.toMatch(/\b(?:DELETE|DROP)\b/iu);
    expect(source).not.toMatch(/\bregister[.]/iu);
    await expect(database.pool.query(source)).resolves.toBeDefined();
  });

  it("creates the five required table contracts with ciphertext-only transcript columns", async () => {
    const result = await database.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='support'
      ORDER BY table_name,ordinal_position
    `);
    const byTable = new Map<string, string[]>();
    for (const row of result.rows) {
      const columns = byTable.get(row.table_name) ?? [];
      columns.push(row.column_name);
      byTable.set(row.table_name, columns);
    }
    expect([...byTable.keys()].sort()).toEqual([
      "abuse_event", "case", "message", "session", "session_key"
    ]);
    expect(byTable.get("message")).toContain("content_ciphertext");
    expect(byTable.get("message")).not.toContain("content");
    expect(byTable.get("case")).toContain("transcript_snapshot_ciphertext");
    expect(byTable.get("case")).not.toContain("transcript_snapshot");
    expect(byTable.get("session_key")).toContain("wrapped_key");
    expect(byTable.get("case")).toContain("token_sha256");
    expect(byTable.get("case")).not.toContain("token");
  });
});
