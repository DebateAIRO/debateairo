import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import {
  ACCEPTANCE_ALGORITHM_SOURCE_REF,
  ACCEPTANCE_REGISTER_VERSION,
  buildAcceptanceAlgorithmRegisterRows,
  buildAcceptanceRegisterRows,
  resolveAcceptanceSynthesisRoleRefs,
  seedAcceptanceRegister
} from "./seed-register.js";
import {
  computeAcceptanceStructuralCeiling,
  parseAcceptanceRuntimeRows,
  readAcceptanceRuntimePolicy
} from "./runtime-policy.js";
import { loadAcceptanceCeremonyEnvironment } from "./main.js";

describe("ACC-01 acceptance runtime policy", () => {
  it("accepts the ruled DR-182 discovery freshness and one-attempt policy", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));

    expect(() => parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    })).not.toThrow();
  });

  it("accepts the ruled partial way-of-knowing share map without inventing absent shares", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));
    const parsed = parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    });

    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).toEqual({ REASONING: 0.5 });
    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).not.toHaveProperty("LOOKED_UP");
    expect(parsed.wayOfKnowingCeiling.cuts[0]?.minimumShares).not.toHaveProperty("RAN");
  });

  it("types the DR-177 provider roster with the third Grok/xAI maker and floor unchanged", async () => {
    const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((row) => [row.rowKey, row.value]));
    const parsed = parseAcceptanceRuntimeRows({
      riskTier: rows.riskTier,
      acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
      panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
      runDeathPolicy: rows.runDeathPolicy,
      hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
      compositionBundleBudget: rows.compositionBundleBudget,
      wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
      configuredProviderSet: rows.configuredProviderSet,
      judgeContractHash: rows.judgeContractHash,
      composerContractHash: rows.composerContractHash,
      conformanceContractHash: rows.conformanceContractHash,
      propagationContractHash: rows.propagationContractHash,
      serveContractHash: rows.serveContractHash
    });

    expect(parsed.configuredProviderSet.requiredDistinctMakers).toBe(1);
    expect(parsed.configuredProviderSet.providers).toEqual([
      { providerRef: "acceptance:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "acceptance:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "acceptance:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" }
    ]);
  });

  it("pins the live composition root to complete discovery and register-owned structural bounds", async () => {
    const [mainSource, policySource, panelProofSource, reviewProofSource] = await Promise.all([
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("./runtime-policy.ts", import.meta.url), "utf8"),
      readFile(new URL("./panel01-depth1-proof.ts", import.meta.url), "utf8"),
      readFile(new URL("./xrev01-depth1-proof.ts", import.meta.url), "utf8")
    ]);

    expect(mainSource).toContain("ProviderProbeRepository");
    expect(mainSource).toContain("resolveFreshDiscovery({");
    expect(mainSource).toContain("return toDiscoveredPanel(resolved.panel);");
    expect(mainSource).not.toMatch(/\.slice\(0,\s*2\)/);
    expect(mainSource).toContain("computeAcceptanceStructuralCeiling(policy, policy.providers.length, 5)");
    expect(mainSource).toContain(
      "computeAcceptanceStructuralCeiling(policy, basis.panelSize, Number(basis.depthParams.depth))"
    );
    expect(mainSource).not.toContain("computeStructuralCeilingBasis");
    expect(mainSource).not.toContain("deploymentMakerCapability: true");
    expect(policySource).toContain("panelDiscoveryPolicy");
    expect(policySource).not.toContain("const totalAttempts");
    expect(policySource).not.toContain("max_model_attempts: totalAttempts");
    expect(computeAcceptanceStructuralCeiling({
      bounds: {
        JUDGE: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 },
        COMPOSER: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 },
        CONFORMANCE: { maxAttempts: 3, tokenCeiling: 1, deadlineMs: 1 }
      },
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 },
      // T17: the sealed T16 envelope row, as `readAcceptanceRuntimePolicy`
      // resolves it. The acceptance ceiling reads its shape from the register,
      // never from engine constants re-declared at this call site.
      envelopeFormulaInputs: {
        registerVersion: 1,
        branchingFactor: 2,
        compositionSegmentCap: 2,
        fixedOrgansPerComposition: 4,
        maxRecompose: 2,
        reviewerCallsPerNode: 1,
        synthesizerMaxRounds: 3,
        evaluatorMaxRounds: 3,
        panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE",
        maxDepth: 5,
        sourceRefs: { envelopeFormulaInputs: "test-layer:envelope" }
      }
    }, 2, 1)).toMatchObject({
      max_model_attempts: 106,
      per_site_attempts: { judge: 3, organ: 3, panel_member: 3, cooldown_site: 4 },
      call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 },
      formula_version: "DR-184-v4"
    });
    for (const proofSource of [panelProofSource, reviewProofSource]) {
      expect(proofSource).toContain("structuralCeilingMaxModelAttempts");
      expect(proofSource).toContain("providerProbeEvidenceCount");
      expect(proofSource).not.toMatch(/M=2|\/42|DR159|RATIFIED_ENVELOPE/);
    }
  });

  it("requires an operator-supplied Grok relay port instead of inventing a number", () => {
    const source = {
      ACCEPTANCE_DB_PORT: "55432",
      ACCEPTANCE_API_HOST: "127.0.0.1",
      ACCEPTANCE_API_PORT: "8790",
      ACCEPTANCE_SHIM_PORT: "8791",
      ACCEPTANCE_GROK_RELAY_PORT: "8794",
      ACCEPTANCE_STRANGER_SAMPLE_RATE: "1",
      ACCEPTANCE_BATTERY_VERSION: "acceptance-test",
      ACCEPTANCE_SETTLEMENT_WATCH_HANDLE: "acceptance:test"
    };
    expect(loadAcceptanceCeremonyEnvironment(source).ACCEPTANCE_GROK_RELAY_PORT).toBe(8794);
    const { ACCEPTANCE_GROK_RELAY_PORT: _removed, ...withoutPort } = source;
    expect(() => loadAcceptanceCeremonyEnvironment(withoutPort)).toThrow();
  });
});

/**
 * T9 × board F33, on the ACCEPTANCE deployment. F33's shape is an optional
 * field on the shared runner settings object: one deployment loads and passes
 * the sealed family, the other never does, and because the field is optional
 * the compiler never asks. The dev deployment received this fix
 * (`apps/runner/src/main.ts`, "the SHIPPED entry point must LOAD and PASS every
 * register family the run reads"); the acceptance deployment did not, so every
 * acceptance path that reaches synthesis refused at claim time with
 * SYNTHESIS_ROLE_CONTROLS_UNRESOLVED.
 *
 * These two assertions are about the acceptance deployment's own policy READER,
 * because that is where the dev twin puts the same read and the same provenance
 * check (`dev-runner-policy.ts` — `readSynthesisRoleControls` then
 * `DEV_RUNNER_POLICY_PROVENANCE_INVALID`). A source-text assertion on the entry
 * point cannot see either property; this is the seam that can.
 */
describe("T9 × F33 — the acceptance runtime policy carries the sealed synthesis-role family", () => {
  let database: StandingDatabase;
  let dataDirectory: string;

  async function reservePort(): Promise<number> {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("TEST_PORT_RESOLUTION_FAILED");
    server.close();
    await once(server, "close");
    return address.port;
  }

  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-runtime-policy-"));
    database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
    await seedAcceptanceRegister(database.pool);
  });

  afterAll(async () => {
    await database?.stop();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  /**
   * PROPERTY: the acceptance deployment's runtime policy carries the SEALED
   * synthesizer/evaluator identities and the sealed evaluator loop bound, read
   * off the register at the acceptance register version — not restated, and not
   * absent. Expected values are derived from the same seeder that wrote the
   * rows, so the assertion cannot drift from the seed by being hand-copied.
   */
  it("reads the sealed synthesizer and evaluator identities and the sealed loop bound", async () => {
    const sealed = Object.fromEntries(
      buildAcceptanceAlgorithmRegisterRows().map((row) => [row.rowKey, row])
    );
    const expectedRefs = resolveAcceptanceSynthesisRoleRefs();
    const expectedRounds = (sealed.evaluatorLoopMaxRounds?.value as { maxRounds: number }).maxRounds;

    const policy = await readAcceptanceRuntimePolicy(database.pool);

    expect(policy.synthesisRolePolicy.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
    expect(policy.synthesisRolePolicy.synthesizerRoleRef).toBe(expectedRefs.synthesizerRoleRef);
    expect(policy.synthesisRolePolicy.evaluatorRoleRef).toBe(expectedRefs.evaluatorRoleRef);
    expect(policy.synthesisRolePolicy.evaluatorLoopMaxRounds).toBe(expectedRounds);
    expect(policy.synthesisRolePolicy.identicalRoleRefs)
      .toBe(expectedRefs.synthesizerRoleRef === expectedRefs.evaluatorRoleRef);
    // Every ref this deployment consumes is stamped with this deployment's own
    // algorithm provenance; the runner is handed the refs, never a restatement.
    for (const sourceRef of Object.values(policy.synthesisRolePolicy.sourceRefs)) {
      expect(sourceRef.startsWith(ACCEPTANCE_ALGORITHM_SOURCE_REF)).toBe(true);
    }
  });

  /**
   * PROPERTY: a T16 row sealed by a DIFFERENT deployment is REFUSED, not
   * consumed — for EVERY family this deployment reads, not just the one this
   * ticket added. `readFamily` in the shared reader only requires a non-empty
   * source_ref, so without a deployment-scoped check here a row written by
   * another deployment at the same register version reaches the runner, and in
   * the role families it names an identity this deployment never sealed.
   * `dev-runner-policy.ts` performs this check for its own families; codex r1
   * FOLLOW-UP 2 established the acceptance path reads FIVE, not four —
   * `envelopeFormulaInputs` is the fifth and also exposes `sourceRefs`.
   *
   * Each row is seeded foreign FROM THE START rather than mutated: `register_row`
   * is append-only (core.reject_mutation rejects UPDATE), and
   * `seedAcceptanceRegister` re-reads every row it wrote and refuses a mismatch.
   * Both are the system working; between them, the only way this deployment can
   * meet a foreign row is a register written by something other than its own
   * seeder — exactly the case under test, so each case builds that database.
   */
  const FOREIGN_SOURCE_REF = "some-other-deployment:T16-algorithm-register+J8";

  async function withRegister<T>(
    label: string,
    rows: readonly { rowKey: string; value: unknown; sourceRef: string }[],
    use: (pool: StandingDatabase["pool"]) => Promise<T>
  ): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), `debateai-acc-${label}-`));
    const database_ = await startStandingDatabase({ port: await reservePort(), dataDirectory: directory });
    try {
      for (const row of rows) {
        await database_.pool.query(
          `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [ACCEPTANCE_REGISTER_VERSION, row.rowKey, JSON.stringify(row.value), row.sourceRef]
        );
      }
      return await use(database_.pool);
    } finally {
      await database_.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }

  /** One representative row per T16 family the acceptance path reads. */
  const FAMILIES = Object.freeze([
    { family: "synthesis-role", rowKey: "synthesizerRoleRef" },
    { family: "envelope-formula", rowKey: "envelopeFormulaInputs" },
    { family: "panel-weighting", rowKey: "dispersionScale" },
    { family: "verdict-label", rowKey: "verdictMarginGamma" },
    { family: "adaptive-stopping", rowKey: "globalStopDelta" }
  ]);

  it.each(FAMILIES)(
    "refuses a $family row carrying another deployment's provenance",
    async ({ family, rowKey }) => {
      const rows = await buildAcceptanceRegisterRows();
      // The row key must really be in this deployment's seed, or the case would
      // swap nothing and assert against an unchanged register.
      expect(rows.some((row) => row.rowKey === rowKey)).toBe(true);
      const swapped = rows.map((row) => row.rowKey === rowKey
        ? { ...row, sourceRef: FOREIGN_SOURCE_REF }
        : row);
      expect(swapped.filter((row, index) => row.sourceRef !== rows[index]?.sourceRef)).toHaveLength(1);

      await withRegister(family, swapped, async (pool) => {
        await expect(readAcceptanceRuntimePolicy(pool))
          .rejects.toThrow("ACCEPTANCE_ALGORITHM_PROVENANCE_INVALID");
      });
    }
  );

  /**
   * The neighbouring case the refusal must NOT catch: the same rows, all sealed
   * by this deployment, resolve. Without this, a check that refused everything
   * would satisfy every case above and pin nothing.
   */
  it("accepts the same rows when every T16 family carries this deployment's provenance", async () => {
    await withRegister("own-provenance", await buildAcceptanceRegisterRows(), async (pool) => {
      const policy = await readAcceptanceRuntimePolicy(pool);
      expect(policy.synthesisRolePolicy.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
      // The other four families reach the runner off the same policy.
      expect(policy.panelPolicy.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
      expect(policy.verdictLabelPolicy.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
      expect(policy.stoppingPolicy.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
      expect(policy.envelopeFormulaInputs.registerVersion).toBe(ACCEPTANCE_REGISTER_VERSION);
    });
  });
});
