import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  auditArchitecture,
  auditMigrationReplaySafety,
  auditOrphans,
  auditSurfaceAttachmentLiterals,
  auditSurfaceReachability,
  auditSourceRules,
  surfaceReachabilityTarget
} from "../../tools/orphan-audit/src/index.js";

describe("P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law", () => {
  it("matches all 27 dependency-edge rows and structural rules 1–5", async () => {
    const report = await auditArchitecture();
    expect(report.edgeRowsChecked).toBe(27);
    expect(report.violations).toEqual([]);
  });

  it("enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates", async () => {
    const report = await auditSourceRules();
    expect(report.blocking).toEqual([]);
  });

  it("derives surface attachment from production-entry reachability", async () => {
    const [reachability, report] = await Promise.all([
      auditSurfaceReachability(),
      auditOrphans()
    ]);

    expect(reachability.declaredEntryPointFiles).toEqual(expect.arrayContaining([
      "apps/api/src/main.ts",
      "apps/runner/src/main.ts",
      "apps/scheduler/src/cli.ts"
    ]));
    expect(reachability.reachableCallables).toContain("WalkingSkeletonRunner.executeWorkItem");
    // FAIR-01 (DR-140(b)): the runner's counter leg attaches the S02 edge
    // writer and the P8 operator resolver in production; the S08 packet
    // organs stay unattached under DR-141(4)'s Q42 refusal law.
    expect(reachability.reachableCallables).toContain("GraphWriter.addEdge");
    expect(reachability.reachableCallables).toContain("resolveScoringOperator");
    expect(reachability.reachableCallables).not.toContain("CritiqueRepository.recordCritiquePacket");
    expect(reachability.reachableCallables).not.toContain("WalkingSkeletonRunner.executeValueOverlay");
    expect(reachability.reachableCallables).not.toContain("buildValueOverlay");
    expect(reachability.reachableCallables).not.toContain("serveMixedAnswer");

    const reachable = new Set(reachability.reachableCallables);
    const surfaceRows = [
      ...report.s04Surface,
      ...report.s05Surface,
      ...report.s06Surface,
      ...report.s07Surface,
      ...report.s08Surface,
      ...report.s09Surface,
      ...report.s10Surface
    ];
    for (const row of surfaceRows) {
      expect(row.attachment).toBe(
        reachable.has(surfaceReachabilityTarget(row.package)) ? "ATTACHED" : "UNATTACHED"
      );
    }
  });

  it("rejects hand-authored surface attachment claims", () => {
    expect(auditSurfaceAttachmentLiterals("tools/orphan-audit/src/index.ts", `
      s10Surface: [{ package: "packages/valuation.buildValueOverlay", attachment: "ATTACHED", evidence: "manual" }]
    `)).toEqual([
      expect.stringContaining("hand-authors s*Surface attachment")
    ]);
  });

  it("rejects migration DDL that is unsafe when replayed outside the ledger", () => {
    const findings = auditMigrationReplaySafety("migrations/unsafe.sql", `
      ALTER TABLE core.example ADD COLUMN value text;
      ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
      CREATE FUNCTION core.example_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE UNIQUE INDEX example_value_lookup ON core.example (value);
    `);

    expect(findings).toHaveLength(4);
    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining("bare ADD COLUMN"),
      expect.stringContaining("unguarded ADD CONSTRAINT example_value"),
      expect.stringContaining("bare CREATE FUNCTION"),
      expect.stringContaining("bare CREATE UNIQUE INDEX")
    ]));
  });
});

describe("FX-ORPH-02 / FX-ORPH-03 / FX-ORPH-06 — reports are wired", () => {
  it("publishes the entry-point walk and an empty or itemized never-called list", async () => {
    const report = await auditOrphans();
    expect(report.entryPoints).toContain("apps/scheduler:job:replay-self-test");
    expect(report.entryPoints).toContain("apps/api:POST /v1/asks");
    expect(report.entryPoints).toContain("apps/api:GET /v1/runs/:id/events");
    expect(report.neverCalled).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/kernel.exhaustive" }),
      expect.objectContaining({ package: "packages/graph.constructEdge" }),
      expect.objectContaining({ package: "packages/judgement.runJudgePanel" }),
      expect.objectContaining({ package: "packages/judgement.measureDispersion" }),
      expect.objectContaining({ package: "packages/judgement.applyCorrelatedErrorDiscount" }),
      expect.objectContaining({ package: "packages/judgement.applyDeclaredDisagreement" }),
      expect.objectContaining({ package: "packages/judgement.createTypedNonAnswer" }),
      expect.objectContaining({ package: "packages/battery/decision.decide" }),
      expect.objectContaining({ package: "packages/ledger.LedgerRepository.recordDecision" }),
      expect.objectContaining({ package: "packages/graph.GraphWriter.spawnPendingChild" }),
      expect.objectContaining({ package: "packages/valuation.resolveDeepeningReentry" }),
      expect.objectContaining({ package: "packages/battery/decision.certifyDefeaterCompleteness" }),
      expect.objectContaining({ package: "packages/battery/decision.resolveRegeneration" }),
      expect.objectContaining({ package: "packages/battery/decision.selectRivalCarver" })
    ]));
    expect(report.s04Surface).toEqual([
      expect.objectContaining({ package: "packages/judgement.runJudgePanel", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.measureDispersion", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.applyCorrelatedErrorDiscount", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.applyDeclaredDisagreement", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.createTypedNonAnswer", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.resolveClaimType", attachment: "ATTACHED" })
    ]);
    expect(report.s05Surface).toEqual([
      expect.objectContaining({ package: "packages/serve.validateServeItems", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.sanitizeServeItem", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.reconcileServeItems", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.deriveWorkReadState", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.projectProvenance", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/serve.deriveHonestVerdict", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.foldServedNumberEvents", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.deriveAnswerServeState", attachment: "ATTACHED" })
    ]);
    expect(report.s06Surface).toHaveLength(9);
    expect(report.s07Surface).toEqual([
      expect.objectContaining({ package: "packages/battery/decision.decide", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/ledger.LedgerRepository.recordDecision", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/graph.GraphWriter.spawnPendingChild", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/graph.GraphRepository.readNodeLifecycleEvents", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/db.RunRepository.drainWaitsForCompletion", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/valuation.resolveDeepeningReentry", attachment: "UNATTACHED" })
    ]);
    expect(report.s09Surface).toEqual([
      expect.objectContaining({ package: "packages/budget.decideBudgetPressure", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/budget.BudgetRepository.countRunModelAttempts", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/register.resolveEffectiveRiskTier", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/register.readRunCostEnvelopePolicy", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.createEnvelopeExhaustedResult", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/serve.ServeRepository.persist.conditionMarks", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/budget.compareConvergence", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/register.readConvergenceControls", attachment: "UNATTACHED" })
    ]);
    expect(report.s10Surface).toEqual([
      expect.objectContaining({ package: "packages/valuation.buildValueOverlay", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/valuation.ValuationRepository", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/valuation.serveMixedAnswer", attachment: "UNATTACHED" })
    ]);
    expect(report.neverCalled).toContainEqual(expect.objectContaining({
      package: "apps/runner.WalkingSkeletonRunner.executeValueOverlay"
    }));
    expect(report.deferredGates.map((row) => row.fixture)).toEqual(["FX-DEF-01", "FX-DEF-02"]);
    expect(Array.isArray(report.neverCalled)).toBe(true);
    expect(report.advisory).toEqual(expect.arrayContaining([
      expect.objectContaining({ fixture: "FX-ORPH-03" }),
      expect.objectContaining({ fixture: "FX-ORPH-06" })
    ]));
  });
});

describe("S00 composition roots", () => {
  it("has executable API and runner process roots wired through register loaders", async () => {
    const [apiMain, runnerMain] = await Promise.all([
      readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8")
    ]);
    expect(apiMain).toContain("loadApiEnvironment");
    expect(apiMain).toContain(".listen(");
    expect(runnerMain).toContain("loadRunnerEnvironment");
    expect(runnerMain).toContain("new WalkingSkeletonRunner");
  });
});
