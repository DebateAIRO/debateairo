import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, Session } from "@debateai/contract";
import { migrate, ProviderProbeRepository } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  DomainRegistryRepository,
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  normalizeDomainName
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

describe("domain registry repository", () => {
  it("records exact, rejected near-duplicate, and grown admission decisions", async () => {
    const runId = await insertEvaluatorRun("domain admission decisions");
    const repository = new DomainRegistryRepository(database.pool);
    const starter = await insertStarterDomain("Software Engineering", "test:starter:software");

    await expect(repository.admitProposal({
      runId,
      proposedName: "SOFTWARE   ENGINEERING",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: "test:proposal:exact"
    })).resolves.toMatchObject({ decision: "MATCHED_EXISTING", domainId: starter.domainId });

    await expect(repository.admitProposal({
      runId,
      proposedName: "Software Engineer",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: "test:proposal:near"
    })).resolves.toMatchObject({ decision: "REJECTED_NEAR_DUPLICATE", domainId: null });

    const grown = await repository.admitProposal({
      runId,
      proposedName: "Climate Science",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: await insertRawArtifact(runId, "artifact:domain:climate"),
      provenanceRef: "test:proposal:new"
    });
    expect(grown).toMatchObject({ decision: "ADMITTED_NEW" });
    const persisted = await repository.listDomains();
    expect(persisted.map((row) => [row.normalizedName, row.origin])).toEqual([
      ["climate science", "GROWN"],
      ["software engineering", "STARTER"]
    ]);
  });

  it("backfills the dedicated question link once and keeps domain identity append-only", async () => {
    const runId = await insertEvaluatorRun("domain backfill landing");
    const repository = new DomainRegistryRepository(database.pool);
    const domain = await insertStarterDomain("Mathematics", "test:starter:mathematics");
    const admission = await repository.admitProposal({
      runId,
      proposedName: "Mathematics",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: "test:proposal:math"
    });

    await repository.assignQuestionDomain({
      runId,
      domainId: domain.domainId,
      domainAdmissionId: admission.domainAdmissionId,
      basis: "BACKFILL",
      rawArtifactRef: null
    });
    await expect(repository.assignQuestionDomain({
      runId,
      domainId: domain.domainId,
      domainAdmissionId: admission.domainAdmissionId,
      basis: "BACKFILL",
      rawArtifactRef: null
    })).rejects.toThrow();
    await expect(database.pool.query(
      "UPDATE evaluator.question_domain SET domain_id=domain_id WHERE run_id=$1",
      [runId]
    )).rejects.toThrow(/append-only or immutable table question_domain rejects UPDATE/);
    await expect(repository.readQuestionDomain(runId)).resolves.toMatchObject({
      runId,
      domainId: domain.domainId,
      assignmentBasis: "BACKFILL"
    });
  });

  it("serializes concurrent near-duplicate proposals into one grown domain", async () => {
    const runId = await insertEvaluatorRun("concurrent domain proposal");
    const rawArtifactRef = await insertRawArtifact(runId, "artifact:domain:robotics");
    const repository = new DomainRegistryRepository(database.pool);
    const input = {
      runId,
      proposedName: "Robotics",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef,
      provenanceRef: "test:proposal:robotics"
    } as const;

    const results = await Promise.all([
      repository.admitProposal(input),
      repository.admitProposal({ ...input, proposedName: "Robotic" })
    ]);
    expect(results.map((result) => result.decision).sort()).toEqual([
      "ADMITTED_NEW",
      "REJECTED_NEAR_DUPLICATE"
    ]);
    const count = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.domain
      WHERE normalized_name IN ('robotics', 'robotic')
    `);
    expect(count.rows[0]!.count).toBe("1");
  });

  it("applies pending 0024 and matches every approved starter name through admission", async () => {
    const scratch = await startTestDatabase();
    try {
      await migrate(scratch.pool);
      const seedSql = await readFile(
        new URL("../../migrations/pending/0024_evaluator_domain_seed.sql", import.meta.url),
        "utf8"
      );
      await scratch.pool.query(seedSql);
      const seeded = await scratch.pool.query<{
        canonical_name: string;
        normalized_name: string;
        origin: string;
      }>(`
        SELECT canonical_name, normalized_name, origin
        FROM evaluator.domain
        WHERE provenance_ref='mission:model-evaluator:V-approved-starter-list'
        ORDER BY canonical_name
      `);
      expect(seeded.rows).toHaveLength(26);
      expect(new Set(seeded.rows.map((row) => row.origin))).toEqual(new Set(["STARTER"]));
      expect(seeded.rows.map((row) => row.normalized_name)).toEqual(
        seeded.rows.map((row) => normalizeDomainName(row.canonical_name))
      );

      const repository = new DomainRegistryRepository(scratch.pool);
      const runId = await insertEvaluatorRun("approved starter-list round trip", scratch.pool);
      const decisions = [];
      for (const row of seeded.rows) {
        const admission = await repository.admitProposal({
          runId,
          proposedName: row.canonical_name,
          provider: "provider:test",
          modelId: "model:test",
          modelVersion: "v1",
          rawArtifactRef: null,
          provenanceRef: `test:starter-roundtrip:${row.normalized_name}`
        });
        decisions.push({ name: row.canonical_name, decision: admission.decision });
      }
      expect(decisions).toEqual(seeded.rows.map((row) => ({
        name: row.canonical_name,
        decision: "MATCHED_EXISTING"
      })));
    } finally {
      await scratch.stop();
    }
  });
});

async function insertEvaluatorRun(questionLine: string, pool: Pool = database.pool): Promise<string> {
  const result = await pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier,
      risk_tier, tier_source, tier_provenance_ref, composition_budget_tier,
      depth_params, agent_count, discovered_panel, stranger_sample_rate,
      envelope_basis, register_version, battery_version, ask_contract, created_at_seq
    ) VALUES (
      $1, 'asker:evaluator-domain', gen_random_uuid()::text, 'ASKER', now(), 'casual',
      'casual', 'ASKER', 'test', 'low', '{}'::jsonb, 1, $2::jsonb, 0,
      '{}'::jsonb, 1, 'test', '{}'::jsonb, ledger.allocate_sequence()
    ) RETURNING run_id
  `, [questionLine, JSON.stringify(fixtureDiscoveredPanel(1))]);
  return result.rows[0]!.run_id;
}

async function insertRawArtifact(runId: string, callSite: string): Promise<string> {
  const result = await database.pool.query<{ raw_artifact_id: string }>(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id,
      maker, model_version, raw_text, metadata_json, parse_status, input_hash,
      contract_hash, content_hash, at_seq
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), $1, 'provider:test', 'provider:test',
      'model:test', 'maker:evaluator-domain', 'v1', $2, '{}'::jsonb, 'PARSED',
      repeat('b', 64), repeat('c', 64), repeat('a', 64), ledger.allocate_sequence()
    ) RETURNING raw_artifact_id
  `, [runId, callSite]);
  return result.rows[0]!.raw_artifact_id;
}

async function insertStarterDomain(canonicalName: string, provenanceRef: string): Promise<{
  readonly domainId: string;
}> {
  const result = await database.pool.query<{ domain_id: string }>(`
    INSERT INTO evaluator.domain (
      canonical_name, normalized_name, origin, guardrail_version,
      provenance_ref, admitted_at, at_seq
    ) VALUES ($1, lower($1), 'STARTER', 1, $2, now(), ledger.allocate_sequence())
    RETURNING domain_id
  `, [canonicalName, provenanceRef]);
  return { domainId: result.rows[0]!.domain_id };
}

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
