import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  FIRST_PARTY_ROUTES,
  TOOL_REGISTRY
} from "../../apps/api/src/support/tools.js";
import { SUPPORT_ROUTE_PATHS } from "../../apps/api/src/support/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const forbiddenImports =
  /(?:registration|mfa|auth\/recovery|mail-channel|sessions|account-erasure|legacy-claim|packages\/crypto|db\/src\/identity)/u;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /[.](?:[cm]?[jt]sx?)$/u.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function importedSpecifiers(file: string, source: string): readonly string[] {
  void file;
  return [...source.matchAll(
    /(?:\b(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?|\bimport\s*\()(["'])([^"']+)\1/gmu
  )].map((match) => match[2] ?? "");
}

describe("SUP-01 support capability boundary", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
  }, 120_000);

  afterAll(async () => database?.stop(), 120_000);

  it("pins sixteen support relations plus one inaccessible integrity guard", async () => {
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
      "_shred_integrity_guard", "abuse_event", "admission_event", "case", "case_event", "case_key", "case_message", "message",
      "public_incident", "rating", "relay_call", "relay_waiter", "relay_waiter_event", "session", "session_key", "shred_audit", "tool_call"
    ].map((table_name) => ({
      table_name,
      can_select: table_name !== "_shred_integrity_guard",
      can_insert: table_name !== "_shred_integrity_guard",
      can_update: false,
      can_delete: false
    })));

    const columnUpdates = await database.pool.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT relation.relname AS table_name,attribute.attname AS column_name
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
      WHERE namespace.nspname='support'
        AND relation.relkind='r'
        AND attribute.attnum>0
        AND NOT attribute.attisdropped
        AND has_column_privilege(
          'debateai_support',relation.oid,attribute.attname,'UPDATE'
        )
      ORDER BY relation.relname,attribute.attname
    `);
    expect(columnUpdates.rows).toEqual([
      { table_name: "case", column_name: "shredded_at" },
      { table_name: "case", column_name: "state" },
      { table_name: "case", column_name: "summary_at" },
      { table_name: "case", column_name: "summary_authoritative" },
      { table_name: "case", column_name: "summary_ciphertext" },
      { table_name: "case", column_name: "summary_status" },
      { table_name: "case_key", column_name: "destroyed_at" },
      { table_name: "case_key", column_name: "wrapped_key" },
      { table_name: "public_incident", column_name: "ended_at" },
      { table_name: "session", column_name: "consent_own_context_at" },
      { table_name: "session", column_name: "shredded_at" },
      { table_name: "session_key", column_name: "destroyed_at" },
      { table_name: "session_key", column_name: "wrapped_key" }
    ]);

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
    expect(source).not.toMatch(/(?:https?:\/\/|process[.]env)/u);
    const boundarySource = (await Promise.all(files.filter((file) =>
      !file.endsWith("response-policy.ts") && !file.endsWith("model-references.ts")
    ).map((file) => readFile(file,"utf8")))).join("\n");
    // Persisted locale validation is the same narrow programmer/data-shape
    // boundary as model-references.ts. Pin that one exact loud TypeError while
    // continuing to reject every other generic Error/TypeError in support code.
    expect(boundarySource.match(/throw\s+new\s+(?:Error|TypeError)\b[^;]*;/gu) ?? []).toEqual([
      'throw new TypeError("SUPPORT_LANGUAGE_INVALID");'
    ]);
    expect(boundarySource).toContain(
      'if (!isSupportLanguage(value)) throw new TypeError("SUPPORT_LANGUAGE_INVALID");'
    );
    expect(source).toContain("extends TypedDomainError");
    const keySource = await readFile("apps/api/src/support/keys.ts","utf8");
    expect(keySource).toContain('import { TypedDomainError } from "@debateai/kernel"');
    expect(keySource).toContain("class SupportKeyError extends TypedDomainError");

    const runner = `${await readFile("apps/runner/src/support-switch-cli.ts", "utf8")}\n${
      await readFile("apps/runner/src/support-status-cli.ts", "utf8")}`;
    expect(runner).not.toMatch(
      /(?:process[.]env|MIGRATION_DATABASE_URL|\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?register[.]|register_version_id_seq|https?:\/\/)/iu
    );
    expect(runner).toContain("RegisterPublicationPort");
    expect(runner).toContain("SupportStatusRepositoryPort");
  });

  it("keeps support database message operations outside the plaintext and key boundary", async () => {
    const file = "packages/db/src/support.ts";
    const source = await readFile(file,"utf8");
    const imports = importedSpecifiers(file,source);
    expect(imports.filter((specifier) =>
      /(?:@debateai\/crypto|packages\/crypto|apps\/api\/src\/support|support\/keys)/u
        .test(specifier)
    )).toEqual([]);
    expect(source).not.toMatch(/\b(?:SupportKeyPort|unwrapDataKey)\b/u);
    expect(source).not.toMatch(
      /UPDATE\s+support[.]session\s+SET\s+state\s*=\s*['"]LOCKED/iu
    );
    const supportApi = `${await readFile("apps/api/src/support/index.ts","utf8")}\n${
      await readFile("apps/api/src/support/session.ts","utf8")}`;
    expect(supportApi).not.toContain("finalizeInjectionLock");
  });

  it("composes the API support data plane from its dedicated credential", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("environment.SUPPORT_DATABASE_URL");
    expect(main).toContain("createSupportKeyPort({");
    expect(main).toContain("supportKekPath: environment.SUPPORT_KEK_PATH");
    expect(main).toContain("environment.KEK_PATH");
    expect(main).toContain("environment.CORPUS_KEK_PATH");
    expect(main).toContain("environment.BLIND_INDEX_KEY_PATH");
    expect(main).toContain("environment.AUDIT_SOURCE_IP_SALT_PATH");
    expect(main).toContain("].filter((path): path is string => path !== undefined)");
    expect(main).not.toContain(
      "createSupportKeyPort({ supportKekPath: environment.KEK_PATH })"
    );
    expect(main).toContain("assertSupportDatabaseRole");
    expect(main).toContain("PostgresSupportSessionRepository");
    expect(main).toContain("PostgresSupportMessageRepository");
    expect(main).toContain("PostgresSupportStatusRepository");
    expect(main).toContain("createSupportMessageCipher");
    expect(main).toContain("assertSupportKeyCoverage(supportPool)");
    expect(main).toContain("createSupportConfigurationPort");
    expect(main).toContain("support: {");
    expect(main).toContain("installStartupResourceOwner");
    expect(main.indexOf("installStartupResourceOwner({"))
      .toBeLessThan(main.indexOf("assertSupportDatabaseRole(pool, supportPool)"));
    expect(main).toContain('startup.run("support-attestation"');
    expect(main).toContain('startup.run("listen"');
    expect(main.match(/\{ end: \(\) => supportKeys[.]close\(\) \}/gu) ?? []).toHaveLength(1);
    expect(main.indexOf("const supportKeys = await createSupportKeyPort"))
      .toBeLessThan(main.indexOf('startup.run("listen"'));
  });

  it("exposes exactly the support routes and no zone route", () => {
    expect(SUPPORT_ROUTE_PATHS).toEqual([
      "POST /v1/support/sessions",
      "GET /v1/support/sessions/{id}",
      "POST /v1/support/sessions/{id}/messages",
      "POST /v1/support/messages/{id}/rating",
      "POST /v1/support/sessions/{id}/escalate",
      "GET /v1/support/cases",
      "GET /v1/support/cases/{token}",
      "POST /v1/support/cases/{token}/messages",
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

  it("indexes immutable abuse events by session and class without widening privileges", async () => {
    const source = await readFile("migrations/0054_support_keys_audit.sql", "utf8");
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS support_abuse_event_session_class_idx\s+ON support[.]abuse_event\s*\(session_id,class\)/iu
    );
    const index = await database.pool.query<{
      indisunique: boolean;
      index_definition: string;
      index_owner: string;
      table_owner: string;
    }>(`
      SELECT indexed.indisunique,
        pg_catalog.pg_get_indexdef(index_relation.oid) AS index_definition,
        index_owner.rolname AS index_owner,
        table_owner.rolname AS table_owner
      FROM pg_catalog.pg_index AS indexed
      JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid=indexed.indexrelid
      JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid=indexed.indrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=index_relation.relnamespace
      JOIN pg_catalog.pg_roles AS index_owner ON index_owner.oid=index_relation.relowner
      JOIN pg_catalog.pg_roles AS table_owner ON table_owner.oid=table_relation.relowner
      WHERE namespace.nspname='support'
        AND index_relation.relname='support_abuse_event_session_class_idx'
        AND table_relation.relname='abuse_event'
    `);
    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      indisunique: false,
      index_owner: index.rows[0]?.table_owner
    });
    expect(index.rows[0]?.index_definition).toMatch(/\(session_id, class\)$/u);
    expect(await database.pool.query(`
      SELECT has_table_privilege('debateai_support','support.abuse_event','UPDATE') AS update,
        has_table_privilege('debateai_support','support.abuse_event','DELETE') AS delete
    `).then((result) => result.rows)).toEqual([{ update: false, delete: false }]);
  });

  it("creates the composed support contracts and the one internal guard relation", async () => {
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
      "_shred_integrity_guard", "abuse_event", "admission_event", "case", "case_event", "case_key", "case_message",
      "inbox", "message", "public_incident", "rating",
      "relay_call", "relay_waiter", "relay_waiter_event", "session", "session_key", "shred_audit", "tool_call"
    ]);
    expect(byTable.get("message")).toContain("content_ciphertext");
    expect(byTable.get("message")).not.toContain("content");
    expect(byTable.get("case")).toContain("transcript_snapshot_ciphertext");
    expect(byTable.get("case")).not.toContain("transcript_snapshot");
    expect(byTable.get("session_key")).toContain("wrapped_key");
    expect(byTable.get("case_key")).toContain("wrapped_key");
    expect(byTable.get("shred_audit")).toContain("keys_destroyed");
    expect(byTable.get("tool_call")).toEqual([
      "tool_call_id", "session_id", "name", "args_sha256", "result", "at"
    ]);
    expect(byTable.get("_shred_integrity_guard")).toContain("mutation_generation");
    expect(byTable.get("case")).toContain("token_sha256");
    expect(byTable.get("case")).not.toContain("token");
  });

  it("keeps the support assistant imported only by the help page and out of every zone route", async () => {
    const files = await sourceFiles("apps/ui");
    const importers = (await Promise.all(files.map(async (file) => ({
      file,
      imports: importedSpecifiers(file,await readFile(file,"utf8"))
    })))).filter(({ imports }) => imports.some((specifier) =>
      /(?:components\/support\/Assistant|support\/Assistant[.]js$)/u.test(specifier)
    )).map(({ file }) => file);
    expect(importers).toEqual(["apps/ui/app/help/page.tsx"]);
    for (const path of [
      "apps/ui/app/layout.tsx",
      "apps/ui/app/login/page.tsx",
      "apps/ui/app/sign-up/page.tsx",
      "apps/ui/app/verify-email/page.tsx",
      "apps/ui/app/enroll-mfa/page.tsx",
      "apps/ui/app/settings/page.tsx"
    ]) {
      expect(importedSpecifiers(path,await readFile(path,"utf8")))
        .not.toContain("@/components/support/Assistant");
    }
  });
});
