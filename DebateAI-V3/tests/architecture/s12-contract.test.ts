import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { LEDGER_ACTION_KINDS, LEDGER_ACTION_SCOPE } from "@debateai/kernel";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

describe("S12 / settlement and scorecard architecture", () => {
  it("lands append-only scorecard carriers and the separated settlement credential", async () => {
    const [migration, runtimeEnvironment] = await Promise.all([
      readFile(new URL("../../migrations/0015_s12.sql", import.meta.url), "utf8"),
      readFile(new URL("../../packages/register/src/runtime-environment.ts", import.meta.url), "utf8")
    ]);
    for (const table of ["scorecard.model_identity", "scorecard.session_assignment", "scorecard.scorecard_cell", "scorecard.routing_decision", "scorecard.answer_outcome"])
      expect(migration).toContain(table);
    expect(migration).toContain("reject_mutation");
    expect(migration).toContain("settlement_watch");
    expect(runtimeEnvironment).toContain("SETTLEMENT_DATABASE_URL");
  });

  it("keeps every S12 execution-ledger action in kernel/DDL parity and outside the item-symmetry census", async () => {
    const migration = await readFile(new URL("../../migrations/0015_s12.sql", import.meta.url), "utf8");
    const actions = [
      "SETTLEMENT_OUTCOME_RECORDED",
      "SETTLEMENT_ATTEMPT_SUPERSEDED",
      "SETTLEMENT_READ_BACK_VERIFIED",
      "SCORECARD_DERIVED_FROM_LEDGER"
    ] as const;
    for (const action of actions) {
      expect(LEDGER_ACTION_KINDS).toContain(action);
      expect(LEDGER_ACTION_SCOPE[action]).toBe("PRE_ITEM");
      expect(migration).toContain(`'${action}'`);
    }
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS ledger_entry_action_kind_closed");
  });

  it("publishes a real third scheduler job and derives its settlement attachment", async () => {
    const report = await auditOrphans();
    expect(report.entryPoints).toContain("apps/scheduler:job:settlement-watch");
    expect(report.entryPoints).not.toContain("apps/scheduler:job:settlement-watch (stub; invocation throws SCAFFOLD_ONLY)");
    expect(report.s12Surface).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/settlement.deriveScorecardCell", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/settlement.SettlementRepository.settle", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "apps/scheduler.runSettlementWatch", attachment: "ATTACHED" })
    ]));
  });
});
