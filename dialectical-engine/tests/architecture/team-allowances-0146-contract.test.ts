import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";

/*
 * 0146 (R22 decision 32): the Owner's allowance for a member. It is drained (it replaces functions every release calls), keeps 0130's verifier, follows 0145, and its manifest pins the file's bytes.
 */
const root = resolve(import.meta.dirname, "../../migrations");
const sql = readFileSync(resolve(root, "0146_team_allowances.sql"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "lineage/team-allowances-forward0146.json"), "utf8")) as {
  migration: { name: string; sha256: string }; previous: { name: string }; verifier: { path: string } };

describe("0146 the Owner's allowances for team members", () => {
  it("is drained, keeps the verifier, follows 0145 and pins its own bytes", async () => {
    expect(sql).toMatch(/^-- n1: drained$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(manifest.previous.name).toBe("0145_web_researched_unsettled.sql");
    expect(manifest.verifier.path).toBe("lineage/verify-effective-capabilities-130.sql");
    expect(createHash("sha256").update(readFileSync(resolve(root, manifest.migration.name))).digest("hex")).toBe(manifest.migration.sha256);
    const chain = (await loadMigrationPlan()).forwardChain;
    expect(chain.at(-24)!.name).toBe("0146_team_allowances.sql");
    expect(chain.at(-24)!.previousName).toBe("0145_web_researched_unsettled.sql");
  });
  it("adds no billing relation, and gives the runtime role exactly the seven functions", () => {
    expect(sql).not.toMatch(/CREATE TABLE[^\n]*billing\./u);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION billing\.(?!guard_internal_grant_commit\()/u);
    expect(sql.match(/^GRANT .*$/gmu)).toEqual([
      "GRANT EXECUTE ON FUNCTION staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.read_member_allowance_command(jsonb,text,uuid,uuid) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.read_member_allowance_page(jsonb,text) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.claim_allowance_notices(integer) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.complete_allowance_notice(uuid,uuid,boolean) TO debateai_runtime;",
      "GRANT EXECUTE ON FUNCTION staff.allowance_notice_user(uuid,uuid) TO debateai_runtime;"
    ]);
  });
});
