import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, Session } from "@debateai/contract";
import { migrate, ProviderProbeRepository } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  EvaluatorMeteringRepository,
  deriveRelativeCostCellsV1
} from "../../packages/evaluator/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database.stop();
});

describe("0023 evaluator foundation migration", () => {
  it("projects usage and versioned relative cost into both evaluator metering tables", async () => {
    const artifactId = "00000000-0000-4000-8000-000000000801";
    const attemptId = "00000000-0000-4000-8000-000000000802";
    await database.pool.query(`
      INSERT INTO ledger.raw_artifact (
        raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id,
        maker, model_version, raw_text, metadata_json, parse_status, content_hash,
        input_hash, contract_hash, at_seq
      ) VALUES ($1,$2,NULL,'provider:test','openai-compatible-http','model:test',
        'maker:test','v1','{}','{}','PARSED',$3,'input','contract',ledger.allocate_sequence())
    `, [artifactId, attemptId, "a".repeat(64)]);
    const entries = await database.pool.query<{ ledger_entry_id: string }>(`
      INSERT INTO ledger.ledger_entry (
        sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
        stance_at_action, outcome, actor_ref, input_hash, contract_hash,
        raw_artifact_ref, started_at, finished_at
      ) VALUES
        (ledger.allocate_sequence(),NULL,$1,'MODEL_CALL','test:metered','node:metered',
          'UNASSIGNED','OK','provider:test','input','contract',$2,now(),now()),
        (ledger.allocate_sequence(),NULL,NULL,'MODEL_CALL','test:unmetered','node:unmetered',
          'UNASSIGNED','OK','provider:test','input','contract',NULL,now(),now())
      RETURNING ledger_entry_id
    `, [attemptId, artifactId]);
    const repository = new EvaluatorMeteringRepository(database.pool);
    await repository.recordCall({
      ledgerEntryId: entries.rows[0]!.ledger_entry_id, rawArtifactId: artifactId,
      provider: "xai", modelId: "grok", modelVersion: "v1", callSiteKey: "test:metered",
      runtimeClass: "PAID_REMOTE", usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, x_cost_usd: 0.01 }
    });
    await repository.recordCall({
      ledgerEntryId: entries.rows[1]!.ledger_entry_id, rawArtifactId: null,
      provider: "openai", modelId: "codex", modelVersion: "v1", callSiteKey: "test:unmetered",
      runtimeClass: "PAID_REMOTE", usage: null
    });
    const rows = await database.pool.query(`
      SELECT metering_status, prompt_tokens::int, completion_tokens::int,
             total_tokens::int, reported_vendor_amount, reported_vendor_unit, raw_usage
      FROM evaluator.model_call_usage WHERE call_site_key LIKE 'test:%' ORDER BY call_site_key
    `);
    expect(rows.rows).toEqual([
      expect.objectContaining({ metering_status: "METERED", prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, reported_vendor_amount: 0.01, reported_vendor_unit: "USD" }),
      { metering_status: "UNMETERED", prompt_tokens: null, completion_tokens: null, total_tokens: null, reported_vendor_amount: null, reported_vendor_unit: null, raw_usage: null }
    ]);

    const relativeCells = deriveRelativeCostCellsV1([
      { provider: "xai", modelId: "grok", modelVersion: "v1", runtimeClass: "PAID_REMOTE", usage: { x_cost_usd: 0.01 } }
    ], {
      windowStart: new Date("2026-08-14T10:00:00.000Z"),
      windowEnd: new Date("2026-08-14T11:00:00.000Z"),
      asOf: new Date("2026-08-14T11:05:00.000Z")
    });
    await repository.recordRelativeCostCells(relativeCells);
    const persistedRelative = await database.pool.query(`
      SELECT provider, model_id, model_version, window_start, window_end,
             relative_cost, comparability, metered_call_count, unmetered_call_count,
             source_unit_totals, normalization_basis, derivation_version::int,
             derivation_input, derivation_hash, as_of
      FROM evaluator.relative_cost_cell WHERE model_id='grok'
    `);
    expect(persistedRelative.rows).toEqual([{
      provider: "xai",
      model_id: "grok",
      model_version: "v1",
      window_start: relativeCells[0]!.windowStart,
      window_end: relativeCells[0]!.windowEnd,
      relative_cost: 1,
      comparability: "COMPARABLE",
      metered_call_count: 1,
      unmetered_call_count: 0,
      source_unit_totals: { tokens: 0, usd: 0.01 },
      normalization_basis: "relative-external-spend/v1",
      derivation_version: 1,
      derivation_input: relativeCells[0]!.derivationInput,
      derivation_hash: relativeCells[0]!.derivationHash,
      as_of: relativeCells[0]!.asOf
    }]);
  });
  it("creates every evaluator table under append-only mutation guards", async () => {
    const tables = await database.pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='evaluator' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "consumer_output", "consumer_selection", "domain", "domain_admission",
      "model_call_usage", "observation", "pipeline_event", "profile_cell",
      "question_domain", "rank_snapshot", "relative_cost_cell", "shadow_decision",
      "vllm_catalog_model", "vllm_probe"
    ]);
    const triggers = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.triggers
      WHERE trigger_schema='evaluator' AND event_manipulation IN ('UPDATE','DELETE')
        AND trigger_name='reject_mutation'
    `);
    expect(Number(triggers.rows[0]!.count)).toBe(28);
  });

  it("keeps consensus observations outside settlement and rejects mutation", async () => {
    const run = await database.pool.query<{ run_id: string }>(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier,
        risk_tier, tier_source, tier_provenance_ref, composition_budget_tier,
        depth_params, agent_count, discovered_panel, stranger_sample_rate,
        envelope_basis, register_version, battery_version, ask_contract, created_at_seq
      ) VALUES (
        'evaluator migration test', 'asker:test', 'session:test', 'ASKER', now(), 'casual',
        'casual', 'ASKER', 'test', 'low', '{}'::jsonb, 1, $1::jsonb, 0,
        '{}'::jsonb, 1, 'test', '{}'::jsonb, ledger.allocate_sequence()
      ) RETURNING run_id
    `, [JSON.stringify(fixtureDiscoveredPanel(1))]);
    const inserted = await database.pool.query<{ observation_id: string }>(`
      INSERT INTO evaluator.observation (
        run_id, provider, model_id, model_version, domain_id, step, metric,
        value, outcome_json, truth_basis, source_kind, source_ref,
        derivation_version, provenance_json, observed_at, at_seq
      ) VALUES (
        $1, 'provider:test', 'model:test', 'v1', NULL, 'JUDGING', 'bias.leniency.v1',
        0.25, NULL, 'CONSENSUS', 'REDUCED_JUDGEMENT', 'judgement:test',
        1, '{}'::jsonb, now(), ledger.allocate_sequence()
      ) RETURNING observation_id
    `, [run.rows[0]!.run_id]);
    await expect(database.pool.query(
      "UPDATE evaluator.observation SET value=0.5 WHERE observation_id=$1",
      [inserted.rows[0]!.observation_id]
    )).rejects.toThrow(/append-only or immutable table observation rejects UPDATE/);
    const forbiddenSettlementGrants = await database.pool.query<{
      grantee: string;
      privilege_type: string;
    }>(`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='scorecard' AND table_name='answer_outcome'
        AND privilege_type='INSERT' AND grantee LIKE 'debateai_evaluator_%'
      ORDER BY grantee
    `);
    expect(forbiddenSettlementGrants.rows).toEqual([]);
  });

  it("grants the API only evaluator reads plus consumer selection inserts", async () => {
    const privileges = await database.pool.query<{ table_name: string; privilege_type: string }>(`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='debateai_evaluator_api' AND table_schema='evaluator'
      ORDER BY table_name, privilege_type
    `);
    expect(privileges.rows).toContainEqual({ table_name: "consumer_selection", privilege_type: "INSERT" });
    expect(privileges.rows.some((row) =>
      row.privilege_type === "UPDATE" || row.privilege_type === "DELETE"
    )).toBe(false);
    expect(privileges.rows.some((row) =>
      row.privilege_type === "INSERT" && row.table_name !== "consumer_selection"
    )).toBe(false);
  });
});

describe("FR-0.6 AC5 persisted panel-isolation differential", () => {
  const absentVersion = 201;
  const healthyVersion = 202;
  const ask: AskRequest = {
    question_line: "Does evaluator configuration alter the debate panel?",
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "test:asker",
    composition_budget_tier: "medium",
    depth_params: { depth: 2 },
    decision_owner: "asker:test",
    action_owner: "asker:test",
    decision_scope: "test",
    caller_scope: "ASKER",
    as_of: "2026-08-14T00:00:00.000Z",
    steering_presets: [],
    steering_annotations: []
  };
  const session: Session = {
    asker_id: "asker:evaluator-panel-isolation",
    session_id: "session:evaluator-panel-isolation",
    caller_scope: "ASKER",
    ownership_provenance: "user_dev_token",
    provisional_identity_model: true
  };
  const productProviders = [
    { providerRef: "provider:product-a", adapterKind: "openai-compatible-http", maker: "maker:product-a" },
    { providerRef: "provider:product-b", adapterKind: "openai-compatible-http", maker: "maker:product-b" }
  ] as const;

  async function seedConfiguredProviders(
    registerVersion: number,
    providers: readonly { readonly providerRef: string; readonly adapterKind: string; readonly maker: string }[]
  ): Promise<void> {
    await database.pool.query(`
      INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
      VALUES ($1, 'configuredProviderSet', $2::jsonb, $3)
    `, [registerVersion, JSON.stringify({
      kind: "CONFIGURED_PROVIDER_SET",
      requiredDistinctMakers: 2,
      providers
    }), `fixture:evaluator-panel:${registerVersion}`]);
  }

  async function admitAndReadPersistedRun(registerVersion: number): Promise<{
    readonly panelBytes: string;
    readonly discoveredPanel: readonly { readonly provider_ref: string; readonly maker: string }[];
    readonly agentCount: number;
  }> {
    const deploymentMakers = await readDeploymentMakerCapability(database.pool, registerVersion);
    const probes = new ProviderProbeRepository(database.pool);
    const settings: RunCreationSettings = {
      strangerSampleRate: 0,
      registerVersion,
      batteryVersion: "test",
      settlementWatchHandle: "test",
      resolveDiscoveredPanel: async () => {
        const latest = await probes.readLatest(
          deploymentMakers.configuredProviders.map((provider) => provider.providerRef)
        );
        const now = Date.now();
        return Object.freeze(latest.flatMap((record) =>
          record.state === "HEALTHY" && record.modelId !== null
            && now - record.probedAt.getTime() <= 60_000
            ? [Object.freeze({
                provider_ref: record.providerRef,
                maker: record.maker,
                model_id: record.modelId,
                probe_evidence_ref: record.probeEvidenceRef,
                probed_at: record.probedAt.toISOString()
              })]
            : []
        ));
      },
      resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 2),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
        effectiveRiskTier, tierSource, tierProvenanceRef
      })
    };
    const application = new PostgresAskApplication(
      database.pool,
      { dispatch: async () => undefined },
      settings
    );
    const accepted = await application.submit(ask, session);
    const result = await database.pool.query<{
      panel_bytes: string;
      discovered_panel: readonly { readonly provider_ref: string; readonly maker: string }[];
      agent_count: number;
    }>(`
      SELECT encode(convert_to(discovered_panel::text, 'UTF8'), 'hex') AS panel_bytes,
             discovered_panel, agent_count
      FROM core.run WHERE run_id=$1
    `, [accepted.run_ref]);
    const row = result.rows[0]!;
    return Object.freeze({
      panelBytes: row.panel_bytes,
      discoveredPanel: row.discovered_panel,
      agentCount: row.agent_count
    });
  }

  it("persists byte-identical product membership and agent_count with evaluator healthy versus absent", async () => {
    const probedAt = new Date();
    const probes = new ProviderProbeRepository(database.pool);
    await seedConfiguredProviders(absentVersion, productProviders);
    await seedConfiguredProviders(healthyVersion, productProviders);
    await database.pool.query(`
      INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
      VALUES ($1, 'evaluatorProviderFamily', $2::jsonb, 'fixture:evaluator-family:healthy')
    `, [healthyVersion, JSON.stringify({
      kind: "EVALUATOR_PROVIDER_FAMILY",
      providerRef: EVALUATOR_PROVIDER_REF,
      adapterKind: "vllm-openai-compatible-http",
      maker: EVALUATOR_MAKER,
      chatBaseUrl: "http://vllm:8000/v1",
      modelsPath: "/models",
      deadlineMs: 250,
      source: "LOCAL_CONTAINER_NO_AUTH"
    })]);
    await database.pool.query(`
      INSERT INTO evaluator.vllm_probe (
        provider_ref, state, failure_code, started_at, finished_at, at_seq
      ) VALUES ($1, 'AVAILABLE', NULL, $2, $2, ledger.allocate_sequence())
    `, [EVALUATOR_PROVIDER_REF, probedAt]);
    for (const probe of [
      { probeEvidenceRef: "00000000-0000-4000-8000-000000000201", providerRef: "provider:product-a", maker: "maker:product-a", modelId: "model:product-a" },
      { probeEvidenceRef: "00000000-0000-4000-8000-000000000202", providerRef: "provider:product-b", maker: "maker:product-b", modelId: "model:product-b" },
      { probeEvidenceRef: "00000000-0000-4000-8000-000000000203", providerRef: EVALUATOR_PROVIDER_REF, maker: EVALUATOR_MAKER, modelId: "model:evaluator-local" }
    ]) {
      await probes.record({ ...probe, state: "HEALTHY", failureCode: null, probedAt });
    }

    const absent = await admitAndReadPersistedRun(absentVersion);
    const healthy = await admitAndReadPersistedRun(healthyVersion);

    expect(healthy.panelBytes).toBe(absent.panelBytes);
    expect(healthy.agentCount).toBe(absent.agentCount);
    expect(healthy.discoveredPanel.some((member) =>
      member.provider_ref === EVALUATOR_PROVIDER_REF || member.maker === EVALUATOR_MAKER
    )).toBe(false);
  });
});
