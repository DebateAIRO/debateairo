import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { N1_GRANDFATHERED_THROUGH, parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditN1GrandfatheredCount,
  auditNumericSourceLiteralExports,
  auditSourceRules,
  definedFunctionNames,
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
const KEEPS: N1AuditContext = { earlierFunctions: new Set<string>(), keepsVerifier: true };
const expandFindings = (body: string, context: N1AuditContext = KEEPS): readonly string[] =>
  auditMigrationN1Compatibility(PROBE, `${HEADER}${body}\n`, context);
const repository = (path: string): string => new URL(`../../${path}`, import.meta.url).pathname;

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
        { earlierFunctions: new Set(["core.reject_mutation"]), keepsVerifier: true }
      ],
      ["CREATE OR REPLACE VIEW core.run_waiting_v AS SELECT 1 AS one;", "N1_FORBIDDEN_REPLACE"],
      ["CREATE TRIGGER t BEFORE INSERT ON core.run FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();", "N1_FORBIDDEN_TRIGGER"],
      ["CREATE INDEX IF NOT EXISTS i ON core.run (a);", "N1_STRONG_LOCK_INDEX"],
      ["ALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0);", "N1_STRONG_LOCK_CONSTRAINT"],
      ["ALTER TABLE core.run ADD CONSTRAINT u UNIQUE (a) NOT VALID;", "N1_STRONG_LOCK_CONSTRAINT"],
      [
        "ALTER TABLE core.run ADD CONSTRAINT c CHECK (a > 0) NOT VALID;\nALTER TABLE core.run VALIDATE CONSTRAINT c;",
        "N1_STRONG_LOCK_VALIDATE"
      ],
      ["UPDATE core.run SET a = 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["DELETE FROM core.run WHERE a = 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["INSERT INTO core.run (a) SELECT 1;", "N1_STRONG_LOCK_BACKFILL"],
      ["LOCK TABLE core.run;", "N1_STRONG_LOCK_LOCK_TABLE"],
      ["REINDEX TABLE core.run;", "N1_STRONG_LOCK_LOCK_TABLE"],
      ["DO $x$ BEGIN EXECUTE 'DROP TABLE core.run'; END $x$;", "N1_DYNAMIC_SQL"]
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
        "ALTER TABLE core.run ADD COLUMN IF NOT EXISTS w int NOT NULL DEFAULT 0;"
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
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(" N1_FORBIDDEN_DROP ");
    // Unreviewed, a guard pair on a table the release before uses is a drop and a new trigger there.
    expect(expandFindings("DROP TRIGGER IF EXISTS g ON core.run;\nCREATE TRIGGER g BEFORE UPDATE ON core.run FOR EACH ROW EXECUTE FUNCTION f();")
      .map((finding) => finding.split(" ")[1])).toEqual(["N1_FORBIDDEN_DROP", "N1_FORBIDDEN_TRIGGER"]);
  });

  it("header findings", () => {
    const none = auditMigrationN1Compatibility(PROBE, "-- probe\nSELECT 1;\n", KEEPS);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatch(/^migrations\/0199_probe\.sql:1 N1_HEADER_INVALID EXPAND_OR_DRAINED$/u);
    expect(auditMigrationN1Compatibility(PROBE, `${HEADER}SELECT 1;\n`, { earlierFunctions: new Set(), keepsVerifier: false }))
      .toEqual([`${PROBE}:1 N1_KEEPS_VERIFIER_MISMATCH the header says true, the lineage manifest says false`]);
    expect(auditMigrationN1Compatibility(PROBE, `${HEADER}SELECT 1;\n`, { earlierFunctions: new Set(), keepsVerifier: null }))
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
