import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, Session } from "@debateai/contract";
import { migrate, ProviderProbeRepository } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF
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
