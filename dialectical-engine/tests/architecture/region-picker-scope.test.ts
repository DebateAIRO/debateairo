import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migration = "migrations/0095_registration_region.sql";
const forwardContract = "migrations/0107_auth_dev_integration.sql";
const verifier = "migrations/lineage/verify-effective-capabilities.sql";
// PR-54: the verifier that supersedes the sealed one once forward step 0111 is applied keeps its checks unchanged.
const supersedingVerifier = "migrations/lineage/verify-effective-capabilities-111.sql";
// row-level-security S01 (SPEC-v4 R34): the slice's verifier supersedes that one once forward step 0126 is applied, and
// every check it makes on the region table and its two writers appears unchanged in it.
const rlsVerifier = "migrations/lineage/verify-effective-capabilities-126.sql";
const writer = "packages/db/src/identity.ts";
const socialWriter = "packages/db/src/social-identity.ts";
const exportMigration = "migrations/0115_data_export.sql";
const exportSnapshot = "apps/api/src/data-export/snapshot.ts";
const exportTypes = "apps/api/src/data-export/types.ts";
// Italy clause approval S01: 0125 names record_registration_region only in a comment (its writer's grant follows that
// writer's); its bytes are sha-pinned by the lineage, so it is listed here rather than edited.
const italyApprovalMigration = "migrations/0125_italy_specific_approval.sql";

function productionFiles(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "migrations", "apps", "packages"], {
    cwd: root,
    encoding: "utf8"
  }).split("\n").filter((path) => /\.(?:[cm]?[jt]sx?|sql)$/.test(path));
}

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("registration region scope", () => {
  it("S1 keeps region writes in the two bounded account-creation paths and reads in the verifier", () => {
    const references = productionFiles().filter((path) => source(path).includes("registration_region"));
    expect(references.sort()).toEqual([
      migration, forwardContract, verifier, supersedingVerifier, rlsVerifier, writer, socialWriter,
      exportMigration, exportSnapshot, exportTypes, italyApprovalMigration,
    ].sort());

    // The export reads this account's declared region; it never creates or changes a region row.
    expect(source(exportMigration)).toMatch(/FROM identity\.registration_region r WHERE r\.user_id=v_user/);
    expect(source(exportMigration)).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i);
    // 0125 neither reads nor writes the table.
    expect(source(italyApprovalMigration)).not.toMatch(/\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i);
    expect(source(exportSnapshot)).toContain('registration_region: raw.registration_region == null ? null : project(');
    expect(source(exportTypes)).toContain("registration_region: Row | null");

    const contractSource = source(forwardContract);
    expect(source(verifier)).toContain("identity.record_registration_region(uuid,text,text)");
    expect(source(supersedingVerifier)).toContain("identity.record_registration_region(uuid,text,text)");
    expect(source(rlsVerifier)).toContain("identity.record_registration_region(uuid,text,text)");
    const socialHelper = /CREATE OR REPLACE FUNCTION identity\.record_social_registration_region\([\s\S]*?END \$\$;/i.exec(contractSource)?.[0];
    expect(socialHelper).toContain('INSERT INTO identity.registration_region(user_id,country_code,us_state)');
    expect(contractSource.replace(socialHelper!, '')).not.toMatch(/\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i);

    const writerSource = source(writer);
    expect(writerSource).toContain("SELECT identity.record_registration_region($1,$2,$3)");
    expect(writerSource).not.toMatch(/\b(?:FROM|JOIN)\s+identity\.registration_region\b/i);
    const socialSource=source(socialWriter);
    expect(socialSource).toContain('SELECT identity.record_social_registration_region($1::uuid,$2::text,$3::text,$4::text,$5::text)');
    expect(socialSource).not.toMatch(/\b(?:FROM|JOIN|INSERT\s+INTO)\s+identity\.registration_region\b/i);
    expect(source(verifier)).not.toMatch(/\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i);
    // Each successor verifier reads the region table only through the privilege functions, as the sealed one does.
    for (const successor of [supersedingVerifier, rlsVerifier]) {
      expect(source(successor), successor).not.toMatch(/\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i);
    }
  });

  it("S2 does not backfill region rows during migration", () => {
    const sql = source(migration).replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const definition = sql.match(/\bAS\s+\$\$([\s\S]*?)\$\$\s*;/i);
    if (!definition) throw new Error("registration writer function missing from migration");
    const outsideWriter = sql.replace(definition[0], "");
    expect(outsideWriter).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|MERGE|COPY|DO|CALL|PERFORM|WITH|DELETE\s+FROM)\b/i);
    expect(definition[1]!.match(/\bSELECT\b/gi)).toHaveLength(1);
    expect(definition[1]!.match(/\bINSERT\b/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b[^;]*\bSELECT\b/i);
  });
});
