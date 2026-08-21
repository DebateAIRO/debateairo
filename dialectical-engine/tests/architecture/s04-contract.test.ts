import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { CLAIM_TYPES } from "@debateai/kernel";

const migrationUrl = new URL("../../migrations/0004_s04.sql", import.meta.url);
const reworkMigrationUrl = new URL("../../migrations/0005_s04_rework.sql", import.meta.url);

describe("S04 DDL and runtime attachment contract", () => {
  it("FX-LG-16 carries claim typing, parse/schema distinction, and the full reduced receipt", async () => {
    const sql = `${await readFile(migrationUrl, "utf8")}\n${await readFile(reworkMigrationUrl, "utf8")}`;
    for (const claimType of CLAIM_TYPES) expect(sql).toContain(`'${claimType}'`);
    for (const status of ["PARSE_FAILED", "SCHEMA_FAILED"]) expect(sql).toContain(`'${status}'`);
    for (const column of [
      "uncertainty_ladder_position", "uncertainty_drivers", "score_caps", "holes",
      "branch_identifier", "reducer_version", "judge_weight_version",
      "selected_judgement_ref", "dispersion", "panel_contract_hashes", "disagreement"
    ]) expect(sql).toContain(column);
    expect(sql).toContain("reduced_judgement_ref uuid");
  });

  it("DR-128 mints only the claim-type composition structure and wires a loud register read", async () => {
    const [skeleton, sql, register, runnerMain] = await Promise.all([
      readFile(new URL("../../docs/architecture/05-register-skeleton.md", import.meta.url), "utf8"),
      readFile(reworkMigrationUrl, "utf8"),
      readFile(new URL("../../packages/register/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8")
    ]);
    expect(skeleton).toContain("`claimTypeCompositionMap`");
    expect(skeleton).toContain("`ClaimTypeCompositionMember`");
    expect(skeleton).toContain("RULED — DR-128");
    expect(sql).toContain("claimTypeCompositionMap");
    expect(sql).toContain("claim_type_composition_map_is_valid");
    expect(register).toContain('CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY = "claimTypeCompositionMap"');
    expect(register).toContain("readClaimTypeCompositionMap");
    expect(register).toContain("CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED");
    expect(runnerMain).toContain("readClaimTypeCompositionMap");
  });

  it("DR-077 records declared selection-rule provenance and attaches selection to the runner", async () => {
    const [sql, runner] = await Promise.all([
      Promise.all([readFile(migrationUrl, "utf8"), readFile(reworkMigrationUrl, "utf8")])
        .then((parts) => parts.join("\n")),
      readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8")
    ]);
    expect(sql).toContain("judgement_selection_rule_key");
    expect(sql).toContain("judgement_selection_rule_register_version");
    expect(sql).toContain("judgement_selection_rule_source_ref");
    expect(runner).toContain("reduceAssessment(");
    expect(runner).toContain("selectReducedJudgement(");
    expect(runner).toContain("recordReduced(");
  });
});
