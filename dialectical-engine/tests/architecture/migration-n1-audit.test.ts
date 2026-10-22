import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { N1_GRANDFATHERED_THROUGH, parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditN1GrandfatheredCount,
  auditNumericSourceLiteralExports,
  auditSourceRules,
  definedFunctionNames,
  definedRelationNames,
  N1_GRANDFATHERED_COUNT,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * The N-1 audit (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A8). Every migration after
 * 0122_engine_map_check.sql declares its n1 header (parseN1Header, A6), and an `expand` step holds nothing the release
 * before cannot run beside: no drop, rename, type change or new NOT NULL, no revoke or replace of what it reads, and no
 * strong lock on a table it uses. CI runs it through auditSourceRules, so a finding blocks the merge.
 */
const PROBE = "migrations/0199_probe.sql";
const HEADER = "-- probe\n-- n1: expand\n-- n1: keeps-verifier\n";
/** core.run is a table an earlier step created: the release before reads and writes it. */
const KEEPS: N1AuditContext = { earlierFunctions: new Set<string>(), earlierRelations: new Set(["core.run"]), keepsVerifier: true };
const context = (changes: Partial<N1AuditContext>): N1AuditContext => ({ ...KEEPS, ...changes });
const expandFindings = (body: string, context: N1AuditContext = KEEPS): readonly string[] =>
  auditMigrationN1Compatibility(PROBE, `${HEADER}${body}\n`, context);
const repository = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

describe("side-by-side §5: the N-1 audit", () => {
  it("the real tree is clean", async () => {
    const report = await auditSourceRules();
    expect(report.blocking.filter((row) => / N1_/u.test(row))).toEqual([]);
  }, 120_000);

  it("the grandfathered list is pinned", async () => {
    const names = (await readdir(repository("migrations"))).filter((name) => name.endsWith(".sql"));
    expect(names.filter((name) => name <= N1_GRANDFATHERED_THROUGH)).toHaveLength(N1_GRANDFATHERED_COUNT);
    expect(auditN1GrandfatheredCount(names)).toEqual([]);
    // A file slipped in before the cut-off would escape the audit, so the count drifts and the audit says so.
    expect(auditN1GrandfatheredCount([...names, "0099_late_arrival.sql"])).toEqual([
      `migrations:1 N1_GRANDFATHER_DRIFT ${N1_GRANDFATHERED_COUNT + 1} files sort at or before ${N1_GRANDFATHERED_THROUGH}, pinned ${N1_GRANDFATHERED_COUNT}`
    ]);
  });

  it("the pinned count is the one numeric export the source-purity law admits in its file", () => {
    const where = "tools/orphan-audit/src/migration-n1.ts";
    expect(auditNumericSourceLiteralExports(where, "export const N1_GRANDFATHERED_COUNT = 142;\n")).toEqual([]);
    expect(auditNumericSourceLiteralExports(where, "export const N1_OTHER = 7;\n"))
      .toEqual([`${where} exports a numeric source literal instead of a register/law carrier`]);
  });

  it("each forbidden expand shape is exactly one finding", () => {
    const seeded: ReadonlyArray<readonly [string, string, N1AuditContext?]> = [
      ["ALTER TABLE core.run DROP COLUMN x;", "N1_FORBIDDEN_DROP"],
      ["ALTER TABLE core.run RENAME COLUMN a TO b;", "N1_FORBIDDEN_RENAME"],
      ["ALTER TABLE core.run ALTER COLUMN a TYPE bigint;", "N1_FORBIDDEN_COLUMN_TYPE"],
      ["ALTER TABLE core.run ALTER COLUMN a SET DATA TYPE bigint;", "N1_FORBIDDEN_COLUMN_TYPE"],
      ["ALTER TABLE core.run ALTER COLUMN a SET NOT NULL;", "N1_FORBIDDEN_SET_NOT_NULL"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS z text NOT NULL;", "N1_FORBIDDEN_NOT_NULL_WITHOUT_DEFAULT"],
      ["REVOKE SELECT ON core.run FROM debateai_runtime;", "N1_FORBIDDEN_REVOKE"],
      [
        "CREATE OR REPLACE FUNCTION core.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;",
        "N1_FORBIDDEN_REPLACE",
        context({ earlierFunctions: new Set(["core.reject_mutation"]) })
      ],
      [
        "CREATE OR REPLACE VIEW core.run_waiting_v AS SELECT 1 AS one;", "N1_FORBIDDEN_REPLACE",
        context({ earlierRelations: new Set(["core.run", "core.run_waiting_v"]) })
      ],
      ["CREATE TRIGGER t BEFORE INSERT ON core.run FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();", "N1_FORBIDDEN_TRIGGER"],
      ["CREATE INDEX IF NOT EXISTS i ON core.run (a);", "N1_STRONG_LOCK_INDEX"],
      ["ALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0);", "N1_STRONG_LOCK_CONSTRAINT"],
      ["ALTER TABLE core.run ADD CONSTRAINT u UNIQUE (a) NOT VALID;", "N1_STRONG_LOCK_CONSTRAINT"],
      [
        "-- n1: reviewed the release before writes only positive values\nALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0) NOT VALID;\nALTER TABLE core.run VALIDATE CONSTRAINT c;",
        "N1_STRONG_LOCK_VALIDATE"
      ],
      ["UPDATE core.run SET a = 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["DELETE FROM core.run WHERE a = 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["INSERT INTO core.run (a) SELECT 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["LOCK TABLE core.run;", "N1_STRONG_LOCK_LOCK_TABLE"],
      ["REINDEX TABLE core.run;", "N1_STRONG_LOCK_LOCK_TABLE"],
      ["DO $x$ BEGIN EXECUTE 'DROP TABLE core.run'; END $x$;", "N1_DYNAMIC_SQL"],
      // A8 review, item 4: the statements that rewrite or empty a table, or block its reads.
      ["TRUNCATE core.run;", "N1_STRONG_LOCK_TRUNCATE"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS k uuid NOT NULL DEFAULT gen_random_uuid();", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS k bigint DEFAULT nextval('core.k_seq');", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS k bigserial;", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS k timestamptz DEFAULT clock_timestamp();", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run ADD COLUMN IF NOT EXISTS k int GENERATED ALWAYS AS (a + 1) STORED;", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run SET LOGGED;", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run SET UNLOGGED;", "N1_STRONG_LOCK_REWRITE"],
      ["ALTER TABLE core.run SET TABLESPACE fast;", "N1_STRONG_LOCK_REWRITE"],
      ["REFRESH MATERIALIZED VIEW core.run_totals;", "N1_STRONG_LOCK_REFRESH"],
      // A8 review, item 5: a new restriction on an existing table needs review, and some are never expand.
      ["ALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0) NOT VALID;", "N1_UNREVIEWED_RESTRICTION"],
      ["ALTER TABLE core.run ADD CONSTRAINT f FOREIGN KEY (a) REFERENCES core.other (id) NOT VALID;", "N1_UNREVIEWED_RESTRICTION"],
      ["ALTER TABLE core.run ENABLE ROW LEVEL SECURITY;", "N1_FORBIDDEN_ROW_SECURITY"],
      ["CREATE POLICY p ON core.run FOR SELECT USING (true);", "N1_FORBIDDEN_ROW_SECURITY"],
      ["CREATE RULE r AS ON INSERT TO core.run DO INSTEAD NOTHING;", "N1_FORBIDDEN_RULE"],
      ["ALTER TABLE core.run DISABLE TRIGGER run_guard;", "N1_FORBIDDEN_TRIGGER"],
      ["ALTER TABLE core.run ENABLE TRIGGER run_guard;", "N1_FORBIDDEN_TRIGGER"],
      // A8 review, item 3: CREATE TABLE IF NOT EXISTS of a table an earlier step made does not make it new.
      ["CREATE TABLE IF NOT EXISTS core.run (a int);\nCREATE INDEX IF NOT EXISTS i ON core.run (a);", "N1_STRONG_LOCK_INDEX"]
    ];
    for (const [body, code, context] of seeded) {
      const findings = expandFindings(body, context);
      expect(findings, body).toHaveLength(1);
      expect(findings[0], body).toContain(` ${code} `);
      // `${name}:${line} ${CODE} ${detail}`: the offending statement is the body's last line, after three header lines.
      expect(findings[0], body).toMatch(new RegExp(`^${PROBE}:${3 + body.split("\n").length} ${code} \\S`, "u"));
    }
  });

  it("allowed expand shapes give no finding", () => {
    const allowed = [
      [
        "CREATE TABLE IF NOT EXISTS core.probe (id uuid PRIMARY KEY, a int NOT NULL CHECK (a > 0), UNIQUE (a));",
        "CREATE INDEX IF NOT EXISTS probe_a_idx ON core.probe (a);",
        "DROP TRIGGER IF EXISTS probe_guard ON core.probe;",
        "CREATE TRIGGER probe_guard BEFORE UPDATE ON core.probe FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();",
        "REVOKE ALL ON core.probe FROM PUBLIC;"
      ],
      [
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS y text;",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS w int NOT NULL DEFAULT 0;",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS v text NOT NULL DEFAULT 'en';",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS u jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS t timestamptz NOT NULL DEFAULT now();",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS s timestamptz DEFAULT CURRENT_TIMESTAMP;",
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS r boolean NOT NULL DEFAULT false;"
      ],
      [
        "-- n1: reviewed every row the release before writes has a positive a",
        "ALTER TABLE core.run ADD CONSTRAINT p CHECK (a > 0) NOT VALID;",
        "REFRESH MATERIALIZED VIEW CONCURRENTLY core.run_totals;",
        "CREATE OR REPLACE VIEW core.new_v AS SELECT 1 AS one;",
        "CREATE TABLE IF NOT EXISTS core.fresh (a int);",
        "ALTER TABLE core.fresh ENABLE ROW LEVEL SECURITY;",
        "CREATE POLICY fresh_read ON core.fresh FOR SELECT USING (true);"
      ],
      ["CREATE INDEX CONCURRENTLY IF NOT EXISTS j ON core.run (a);"],
      [
        "-- n1: reviewed widens the check; the release before writes only values both accept",
        "ALTER TABLE core.run DROP CONSTRAINT IF EXISTS c;",
        "ALTER TABLE core.run ADD CONSTRAINT c CHECK (a >= 0) NOT VALID;"
      ],
      [
        "-- n1: reviewed the guard trigger is redefined with the same refusals",
        "DROP TRIGGER IF EXISTS run_guard ON core.run;",
        "CREATE TRIGGER run_guard BEFORE UPDATE ON core.run FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();"
      ],
      [
        "CREATE OR REPLACE FUNCTION core.probe_fn() RETURNS void LANGUAGE plpgsql AS $$",
        "BEGIN",
        "  UPDATE core.run SET a = 1;",
        "  EXECUTE 'SELECT 1';",
        "  DROP TABLE core.other;",
        "END $$;",
        "REVOKE ALL ON FUNCTION core.probe_fn() FROM PUBLIC;",
        "CREATE VIEW core.probe_v AS SELECT 1 AS one;"
      ],
      [
        "-- n1: reviewed reads its own new table only",
        "DO $x$ BEGIN EXECUTE format('SELECT %L', 'x'); END $x$;"
      ]
    ];
    for (const lines of allowed) {
      const body = lines.join("\n");
      expect(expandFindings(body), body).toEqual([]);
    }
  });

  it("a reviewed pair under another name is still a finding", () => {
    const findings = expandFindings([
      "-- n1: reviewed renames the check",
      "ALTER TABLE core.run DROP CONSTRAINT IF EXISTS c;",
      "ALTER TABLE core.run ADD CONSTRAINT d CHECK (a >= 0) NOT VALID;"
    ].join("\n"));
    // The drop is no pair, and the new constraint d is a restriction nobody reviewed (the line stands above the drop).
    expect(findings.map((finding) => finding.split(" ")[1])).toEqual(["N1_FORBIDDEN_DROP", "N1_UNREVIEWED_RESTRICTION"]);
    // Unreviewed, a guard pair on a table the release before uses is a drop and a new trigger there.
    expect(expandFindings("DROP TRIGGER IF EXISTS g ON core.run;\nCREATE TRIGGER g BEFORE UPDATE ON core.run FOR EACH ROW EXECUTE FUNCTION f();")
      .map((finding) => finding.split(" ")[1])).toEqual(["N1_FORBIDDEN_DROP", "N1_FORBIDDEN_TRIGGER"]);
  });

  // A8 review, item 1: a DO body runs when the step applies, so its statements are read like the file's own.
  it("a DO block's statements are checked, with or without EXECUTE", () => {
    const codes = (body: string): readonly string[] => expandFindings(body).map((finding) => finding.split(" ")[1]!);
    expect(codes([
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c') THEN",
      "  ALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0);",
      "END IF; END $$;"
    ].join("\n"))).toEqual(["N1_STRONG_LOCK_CONSTRAINT"]);
    expect(codes("DO $$ BEGIN UPDATE core.run SET a = 1; ALTER TABLE core.run DROP COLUMN x; END $$;"))
      .toEqual(["N1_STRONG_LOCK_BACKFILL", "N1_FORBIDDEN_DROP"]);
    expect(codes("DO $do$ BEGIN\n  IF true THEN TRUNCATE core.run; ELSE LOCK TABLE core.run; END IF;\nEND $do$;"))
      .toEqual(["N1_STRONG_LOCK_TRUNCATE", "N1_STRONG_LOCK_LOCK_TABLE"]);
    // Its own literals and nested bodies stay text; a reviewed EXECUTE still has its statements read.
    expect(codes("DO $$ BEGIN RAISE NOTICE 'DROP TABLE core.run; UPDATE core.run SET a = 1'; END $$;")).toEqual([]);
    expect(codes("-- n1: reviewed probe\nDO $$ BEGIN EXECUTE 'SELECT 1'; UPDATE core.run SET a = 1; END $$;")).toEqual(["N1_STRONG_LOCK_BACKFILL"]);
    // The line is the statement's own line in the file.
    expect(expandFindings("DO $$\nBEGIN\n  UPDATE core.run SET a = 1;\nEND $$;")[0]).toMatch(new RegExp(`^${PROBE}:6 N1_STRONG_LOCK_BACKFILL `, "u"));
  });

  // A8 review, item 2: one lexer pass, so a comment marker inside a literal hides nothing.
  it("a comment marker inside a literal hides no statement", () => {
    const codes = (body: string): readonly string[] => expandFindings(body).map((finding) => finding.split(" ")[1]!);
    expect(codes([
      "COMMENT ON COLUMN core.run.a IS 'release key -- side by side';",
      "ALTER TABLE core.run DROP COLUMN x;",
      "UPDATE core.run SET a = 1;"
    ].join("\n"))).toEqual(["N1_FORBIDDEN_DROP", "N1_STRONG_LOCK_BACKFILL"]);
    expect(codes("SELECT '/*';\nALTER TABLE core.run DROP COLUMN x;\nSELECT '*/';")).toEqual(["N1_FORBIDDEN_DROP"]);
    expect(codes("SELECT E'it\\'s -- not a comment';\nALTER TABLE core.run DROP COLUMN x;")).toEqual(["N1_FORBIDDEN_DROP"]);
    expect(codes("SELECT 'it''s /* still text';\nUPDATE core.run SET a = 1;")).toEqual(["N1_STRONG_LOCK_BACKFILL"]);
    // And the other way round: a quote inside a comment opens nothing.
    expect(codes("-- the run's columns\nALTER TABLE core.run DROP COLUMN x;\n/* it's */ UPDATE core.run SET a = 1;"))
      .toEqual(["N1_FORBIDDEN_DROP", "N1_STRONG_LOCK_BACKFILL"]);
  });

  // A8 review, item 6: a new overload of an earlier function's name does not make a revoke on that name new.
  it("a revoke on an earlier function is a finding even beside a new overload", () => {
    const findings = expandFindings(
      "CREATE OR REPLACE FUNCTION core.reject_mutation(p int) RETURNS int LANGUAGE sql AS $$ SELECT p $$;\nREVOKE ALL ON FUNCTION core.reject_mutation(int) FROM PUBLIC;",
      context({ earlierFunctions: new Set(["core.reject_mutation"]) })
    );
    expect(findings.map((finding) => finding.split(" ")[1])).toEqual(["N1_FORBIDDEN_REPLACE", "N1_FORBIDDEN_REVOKE"]);
  });

  it("header findings", () => {
    const none = auditMigrationN1Compatibility(PROBE, "-- probe\nSELECT 1;\n", KEEPS);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatch(/^migrations\/0199_probe\.sql:1 N1_HEADER_INVALID EXPAND_OR_DRAINED$/u);
    expect(auditMigrationN1Compatibility(PROBE, `${HEADER}SELECT 1;\n`, context({ keepsVerifier: false })))
      .toEqual([`${PROBE}:1 N1_KEEPS_VERIFIER_MISMATCH the header says true, the lineage manifest says false`]);
    expect(auditMigrationN1Compatibility(PROBE, `${HEADER}SELECT 1;\n`, context({ keepsVerifier: null })))
      .toEqual([`${PROBE}:1 N1_KEEPS_VERIFIER_MISMATCH the header says true, no lineage manifest names the file`]);
    expect(auditMigrationN1Compatibility(PROBE, "-- n1: drained\n-- n1: keeps-verifier\nDROP TABLE core.run;\n", KEEPS)).toEqual([]);
    expect(auditMigrationN1Compatibility("migrations/0050_old.sql", "DROP TABLE core.run;\nUPDATE core.run SET a = 1;\n", KEEPS))
      .toEqual([]);
    // A reviewed line needs a reason; a bare one is a misplaced declaration, refused like any other.
    expect(expandFindings("-- n1: reviewed\nSELECT 1;")).toEqual([`${PROBE}:1 N1_HEADER_INVALID UNKNOWN_DECLARATION`]);
  });

  it("names every function a migration defines, lower-case and schema-qualified as written", () => {
    expect(definedFunctionNames([
      "CREATE OR REPLACE FUNCTION Core.Reject_Mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN",
      "  EXECUTE 'CREATE FUNCTION core.hidden() RETURNS int AS $q$ SELECT 1 $q$ LANGUAGE sql';",
      "END $$;",
      "-- CREATE FUNCTION core.commented() …",
      "CREATE FUNCTION billing.read_x(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;"
    ].join("\n"))).toEqual(["core.reject_mutation", "billing.read_x"]);
    expect(definedRelationNames([
      "CREATE TABLE IF NOT EXISTS Core.Run (a int);",
      "CREATE OR REPLACE VIEW core.run_waiting_v AS SELECT 'CREATE TABLE core.hidden' AS x;",
      "CREATE MATERIALIZED VIEW IF NOT EXISTS core.run_totals AS SELECT 1;",
      "CREATE TABLE identity.\"user\" (id uuid);"
    ].join("\n"))).toEqual(["core.run", "identity._user_", "core.run_waiting_v", "core.run_totals"]);
  });

  // The server's release check (deploy/preview-lifecycle/v1/migration-steps.mjs, built in another lane) reads the same
  // header with its own reader. Both must look for these exact two lines.
  it("the migrator and the release check look for the same two header lines", () => {
    expect(parseN1Header("0199_probe.sql", "-- n1: expand\n-- n1: keeps-verifier\nSELECT 1;\n"))
      .toMatchObject({ expand: true, keepsVerifier: true });
    const parser = readFileSync(repository("packages/db/src/migration-n1.ts"), "utf8");
    expect(parser).toContain('"-- n1: expand"');
    expect(parser).toContain('"-- n1: keeps-verifier"');
  });

  it.skipIf(!existsSync(repository("deploy/preview-lifecycle/v1/migration-steps.mjs")))(
    "the server's release check reads the same two header lines",
    () => {
      const server = readFileSync(repository("deploy/preview-lifecycle/v1/migration-steps.mjs"), "utf8");
      expect(server).toContain("-- n1: expand");
      expect(server).toContain("-- n1: keeps-verifier");
    }
  );
});
