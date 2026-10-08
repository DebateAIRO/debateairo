import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migration = "migrations/0095_registration_region.sql";
const forwardContract = "migrations/0107_auth_dev_integration.sql";
const verifier = "migrations/lineage/verify-effective-capabilities.sql";
// PR-54: the verifier that supersedes the sealed one once forward step 0109 is applied keeps its checks unchanged.
const supersedingVerifier = "migrations/lineage/verify-effective-capabilities-109.sql";
const writer = "packages/db/src/identity.ts";
const socialWriter = "packages/db/src/social-identity.ts";

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
    expect(references.sort()).toEqual([migration, forwardContract, verifier, supersedingVerifier, writer, socialWriter].sort());

    const contractSource = source(forwardContract);
    expect(source(verifier)).toContain("identity.record_registration_region(uuid,text,text)");
    expect(source(supersedingVerifier)).toContain("identity.record_registration_region(uuid,text,text)");
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
