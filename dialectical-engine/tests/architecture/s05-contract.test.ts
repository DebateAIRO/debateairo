import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { CLAIM_TYPES } from "@debateai/kernel";

const s04Rework = new URL("../../migrations/0005_s04_rework.sql", import.meta.url);
const s05Migration = new URL("../../migrations/0006_s05.sql", import.meta.url);
const s05ReworkMigration = new URL("../../migrations/0007_s05_rework.sql", import.meta.url);
const s00Migration = new URL("../../migrations/0000_s00.sql", import.meta.url);

describe("S05 architecture and S04 carry-forward contract", () => {
  it("scopes claim-type parity to 0005 and keeps SQL/runtime member validation aligned", async () => {
    const sql = await readFile(s04Rework, "utf8");
    for (const claimType of CLAIM_TYPES) expect(sql).toContain(`'${claimType}'`);
    expect(sql).toContain("BETWEEN 0 AND 1");
    expect(sql).toContain("length(btrim(");
  });

  it("adds append-only S05 projection carriers without a fourth conformance state", async () => {
    const sql = await readFile(s05Migration, "utf8");
    for (const carrier of [
      "segment_suppression", "condition_mark", "condition_mark_node", "shadow_suppression", "abstention"
    ]) expect(sql).toContain(`serve.${carrier}`);
    expect(sql).toContain("band_ceiling");
    expect(sql).toContain("answer_band_ceiling_pair");
    expect(sql).toContain("JUDGED', 'SAMPLED_PASSED', 'NOT_SAMPLED");
    expect(sql).toContain("STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED");
    expect(sql).toContain("Forward-apply S04 review parity");
    expect(sql).not.toContain("SUPERSEDED");
  });

  it("DR-130 keeps serve_state to the ruled three and forward-corrects old blocked rows", async () => {
    const [s00, rework] = await Promise.all([
      readFile(s00Migration, "utf8"),
      readFile(s05ReworkMigration, "utf8")
    ]);
    expect(s00).toContain("serve_state IN ('COMPOSED', 'RECOMPOSED_ONCE', 'COMPONENTS_ONLY')");
    expect(s00).not.toContain("serve_state IN ('BLOCKED'");
    expect(rework).toContain("UPDATE serve.answer");
    expect(rework).toContain("serve_state = 'COMPONENTS_ONLY'");
    expect(rework).toContain("answer_serve_state_check");
    expect(rework).toContain("'COMPOSED', 'RECOMPOSED_ONCE', 'COMPONENTS_ONLY'");
  });
});
