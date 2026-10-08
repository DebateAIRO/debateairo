import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { LEDGER_OUTCOMES } from "@debateai/kernel";
import {
  auditArchitecture,
  auditEdgeManifest,
  auditMigrationReplaySafety,
  auditNumericSourceLiteralExports,
  auditOrphans,
  auditSurfaceAttachmentLiterals,
  auditSurfaceReachability,
  auditSourceRules,
  surfaceReachabilityTarget
} from "../../tools/orphan-audit/src/index.js";

describe("P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law", () => {
  it("BUG-01 T14 keeps the ruled ledger outcome vocabulary unchanged", () => {
    expect(LEDGER_OUTCOMES).toEqual([
      "OK", "FAILED", "BLOCKED", "TIMED_OUT", "REFUSED", "SKIPPED_BY_BUDGET"
    ]);
  });

  // 28 -> 27: the `web` edge row retired with its surface (apps/ui replaces it —
  // .hermes/reports/2026-09-01-algorithm-live-loop/PROGRESS.md:32,
  // DECISIONS.md:810), and its unguarded manifest read was what made this audit
  // throw ENOENT instead of reporting.
  //
  // SYNC3 fix round 1. This was ONE row whose single `violations` assertion
  // carried dev's three undeclared obs-capture edges (V's ticketed debt F31)
  // AND every other edge row and structural rules 1-5. Listed by name as known
  // red, it hid ANY new violation — ours included — behind dev's three. The
  // three are now named exactly and live alone in the next row; everything else
  // must be empty in this one, which runs. A new obs-capture edge from any other
  // app is not one of the three and still fails here.
  const DEV_F31_OBS_CAPTURE_EDGES: readonly string[] = Object.freeze([
    "apps/api -> obs-capture is not a declared edge",
    "apps/runner -> obs-capture is not a declared edge",
    "apps/scheduler -> obs-capture is not a declared edge"
  ]);

  // 27 -> 28: the verdict story's `story` package row.
  // 28 -> 29: the legal-manifest package row (A26(a)).
  // 29 -> 30: the geo package row (A26(a)).
  // 30 -> 31: the billing-core package row (A26(a)).
  // 31 -> 32: the first card processor's package row (A26(a)).
  // 32 -> 33: the tax-quaderno package row (A26(a)).
  // 33 -> 34: the invoice-smartbill package row (A26(a)).
  // 34 -> 35: the mail-templates package row (A26(a)).
  // 35 -> 36: the `scorecard` package row (model-scorecard design, 2026-09-26; merged by
  // paid plans S1a, A26(a)). @debateai/scorecard depends on the kernel alone; register, serve,
  // api and runner name it in their own rows.
  // 36 -> 37: the payments-netopia package row (NETOPIA spec §2.4).
  // 37 -> 36: the first card processor's package row, removed with it (NETOPIA spec §2.19).
  it("matches all 36 dependency-edge rows and structural rules 1–5, dev's three F31 edges apart", async () => {
    const report = await auditArchitecture();
    expect(report.edgeRowsChecked).toBe(36);
    expect(report.violations.filter((violation) => !DEV_F31_OBS_CAPTURE_EDGES.includes(violation)))
      .toEqual([]);
  });

  it("dev's F31 debt: apps/api, apps/runner and apps/scheduler declare their obs-capture edge", async () => {
    const report = await auditArchitecture();
    expect(report.violations.filter((violation) => DEV_F31_OBS_CAPTURE_EDGES.includes(violation)))
      .toEqual([]);
  });

  // PROPERTY: a declared edge row whose directory ships no package.json is
  // REPORTED as a violation and never thrown. A crashed audit does not report
  // zero violations, it reports NOTHING — that is exactly how the retired `web`
  // row hid five real edge violations for the whole merge window, and why the
  // records that counted three were guessing. The second half pins the other
  // direction: a row that DOES ship a manifest must stay silent, so a guard
  // that reports every row cannot pass.
  it("reports a declared edge row with no manifest instead of throwing", async () => {
    const missing = await auditEdgeManifest("bogus", "packages/does-not-exist");
    expect(missing.violations).toEqual(["bogus has no manifest at packages/does-not-exist"]);
    expect(missing.dependencies).toEqual([]);
    const present = await auditEdgeManifest("kernel", "packages/kernel");
    expect(present.violations).toEqual([]);
  });

  it("enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates", async () => {
    const report = await auditSourceRules();
    expect(report.blocking).toEqual([
      "packages/obs-capture/install/api.ts reads the process environment outside the register loader",
      "packages/obs-capture/install/runner.ts reads the process environment outside the register loader",
      "packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader"
    ]);
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

  // The source-purity law's numeric arm (J10(b) in tools/orphan-audit). `30_000` is the number
  // 30000 written with digit separators, the house style for large numbers, so a separator must
  // not carry an export past the law. Until 2026-10-04 one did: the rule's `\d+` stopped at the
  // `_`, and six exports written that way were never seen (.hermes/TOOLING-TRAPS.md, "The
  // source-purity law does not see a NUMERIC SEPARATOR").
  it("refuses an exported numeric literal written with digit separators, as it refuses one without", () => {
    const refused = (name: string) => [`${name} exports a numeric source literal instead of a register/law carrier`];
    expect(auditNumericSourceLiteralExports("apps/api/src/plain.ts", "export const PLAIN_MS = 30000;\n"))
      .toEqual(refused("apps/api/src/plain.ts"));
    for (const literal of ["30_000", "-1_000", "1_000.250_5"]) {
      expect(auditNumericSourceLiteralExports("apps/api/src/separated.ts", `export const SEPARATED = ${literal};\n`), literal)
        .toEqual(refused("apps/api/src/separated.ts"));
    }
    // Controls. The law is about EXPORTS: the same number kept module-private is lawful, so a rule
    // that refused every file could not pass. Both exemptions hold with separators too, and the
    // J10(b) one stays narrow: a second numeric export in that file is still refused.
    expect(auditNumericSourceLiteralExports("apps/api/src/private.ts", "const PRIVATE_MS = 30_000;\n")).toEqual([]);
    expect(auditNumericSourceLiteralExports("packages/published-arithmetic/src/index.ts", "export const SCALE = 1_000;\n"))
      .toEqual([]);
    expect(auditNumericSourceLiteralExports("packages/contract/src/index.ts", "export const EXPANSION_DEPTH_MAX = 5;\n"))
      .toEqual([]);
    expect(auditNumericSourceLiteralExports(
      "packages/contract/src/index.ts",
      "export const EXPANSION_DEPTH_MAX = 5;\nexport const OTHER_LIMIT = 1_000;\n"
    )).toEqual(refused("packages/contract/src/index.ts"));
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

  it("accepts only exact enclosing dollar-quoted guards for replayed constraints", () => {
    const guardedAnonymous = auditMigrationReplaySafety("migrations/guarded-anonymous.sql", `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_value') THEN
          ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
        END IF;
      END
      $$;
    `);
    const guardedNamed = auditMigrationReplaySafety("migrations/guarded-named.sql", `
      DO $install$
      BEGIN
        -- A different dollar tag is inert inside this exact-tag block: $decoy$.
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_value') THEN
          ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
        END IF;
      END
      $install$;
    `);

    expect(guardedAnonymous).toEqual([]);
    expect(guardedNamed).toEqual([]);

    const unsafe = {
      missingGuard: `
        DO $install$ BEGIN
          -- IF NOT EXISTS (SELECT 1 WHERE conname = 'example_value') THEN
          ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
        END $install$;
      `,
      stringDecoyGuard: `
        DO $install$ BEGIN
          PERFORM 'IF NOT EXISTS';
          PERFORM 'example_value';
          ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
        END $install$;
      `,
      wrongName: `
        DO $install$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'other_fk') THEN
            ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
          END IF;
        END $install$;
      `,
      outsideGuardedBlock: `
        DO $install$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_value') THEN
            PERFORM 1;
          END IF;
        END $install$;
        ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
      `,
      mismatchedTag: `
        DO $open$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_value') THEN
            ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
          END IF;
        END $shut$;
      `,
      bareAddition: `
        ALTER TABLE core.example ADD CONSTRAINT example_value CHECK (value <> '');
      `
    } as const;

    for (const [name, source] of Object.entries(unsafe)) {
      expect(auditMigrationReplaySafety(`migrations/${name}.sql`, source), name).toEqual([
        expect.stringContaining("unguarded ADD CONSTRAINT example_value")
      ]);
    }
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
      expect.objectContaining({ package: "packages/judgement.createTypedNonAnswer" }),
      expect.objectContaining({ package: "packages/battery/decision.decideSplitClassification" }),
      expect.objectContaining({ package: "packages/ledger.LedgerRepository.recordDecision" }),
      expect.objectContaining({ package: "packages/graph.GraphWriter.spawnPendingChild" }),
      expect.objectContaining({ package: "packages/valuation.resolveDeepeningReentry" }),
      expect.objectContaining({ package: "packages/battery/decision.certifyDefeaterCompleteness" }),
      expect.objectContaining({ package: "packages/battery/decision.resolveRegeneration" }),
      expect.objectContaining({ package: "packages/battery/decision.selectRivalCarver" })
    ]));
    // T3 / S2-2: the four panel surfaces are production-reachable now that the
    // runner's per-node judgement path calls them. Attachment is DERIVED from
    // reachability, so these rows flip only when the wiring is really there.
    expect(report.s04Surface).toEqual([
      expect.objectContaining({ package: "packages/judgement.runJudgePanel", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.measureDispersion", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.applyCorrelatedErrorDiscount", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/judgement.applyDeclaredDisagreement", attachment: "ATTACHED" }),
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
      expect.objectContaining({ package: "packages/battery/decision.decideSplitClassification", attachment: "UNATTACHED" }),
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
      expect.objectContaining({ package: "packages/register.computeStructuralCeilingBasis", attachment: "ATTACHED" }),
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
