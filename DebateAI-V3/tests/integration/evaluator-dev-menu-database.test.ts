import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PostgresEvaluatorDevMenuRepository } from "../../packages/evaluator/src/dev-menu.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;
let parkedRunId: string;
let availableProbeId: string;
const PINNED_NOW = new Date("2026-08-15T14:00:00.000Z");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);

  const run = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
      depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,
      register_version,battery_version,ask_contract,created_at_seq
    ) VALUES (
      'parked evaluator run','asker:devmenu','session:devmenu','ASKER',$1,'casual',
      'casual','ASKER','fixture:devmenu','low','{}'::jsonb,2,$2::jsonb,0,
      '{}'::jsonb,1,'test','{}'::jsonb,ledger.allocate_sequence()
    ) RETURNING run_id
  `, [PINNED_NOW, JSON.stringify(fixtureDiscoveredPanel(2))]);
  parkedRunId = run.rows[0]!.run_id;

  const artifactId = randomUUID();
  await database.pool.query(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,
      model_version,raw_text,metadata_json,parse_status,content_hash,input_hash,
      contract_hash,at_seq
    ) VALUES (
      $1,gen_random_uuid(),$2,'provider:evaluator-vllm','openai-compatible-http',
      'tagger:local','maker:evaluator-local-vllm','v1','{}','{}'::jsonb,'PARSED',
      $3,'fixture:input','fixture:contract',ledger.allocate_sequence()
    )
  `, [artifactId, parkedRunId, "d".repeat(64)]);
  const grown = await database.pool.query<{ domain_id: string }>(`
    INSERT INTO evaluator.domain (
      canonical_name,normalized_name,origin,proposed_by_provider,proposed_by_model_id,
      proposed_by_model_version,proposal_raw_artifact_ref,source_run_id,
      guardrail_version,provenance_ref,admitted_at,at_seq
    ) VALUES (
      'Robotics Policy','robotics policy','GROWN','openai-compatible-http','tagger:local',
      'v1',$1,$2,1,'fixture:grown-domain',$3,ledger.allocate_sequence()
    ) RETURNING domain_id
  `, [artifactId, parkedRunId, PINNED_NOW]);
  await database.pool.query(`
    INSERT INTO evaluator.observation (
      run_id,provider,model_id,model_version,domain_id,step,metric,value,outcome_json,
      truth_basis,source_kind,source_ref,source_raw_artifact_ref,answer_outcome_id,
      derivation_version,supersedes_observation_id,provenance_json,observed_at,at_seq
    ) VALUES (
      $1,'openai-compatible-http','model:profiled','v7',$2,'AUTHORING',
      'prowess.outcome.v1',0.75,NULL,'CONSENSUS','AUTHORED_NODE','fixture:observation',
      $3,NULL,1,NULL,'{}'::jsonb,$4,ledger.allocate_sequence()
    )
  `, [parkedRunId, grown.rows[0]!.domain_id, artifactId, PINNED_NOW]);
  const profile = await database.pool.query<{ profile_cell_id: string }>(`
    INSERT INTO evaluator.profile_cell (
      provider,model_id,model_version,domain_id,step,metric,as_of,value,n,
      interval_lower,interval_upper,consensus_count,settlement_count,addon_count,basis,
      derivation_version,derivation_input,derivation_hash,strategy_row_key,
      strategy_register_version,strategy_source_ref,at_seq
    ) VALUES (
      'openai-compatible-http','model:profiled','v7',$1,'AUTHORING','prowess.outcome.v1',
      $2,0.75,4,0.6,0.9,4,0,0,'MEASURED_PROCESS',7,'["fixture"]'::jsonb,$3,
      'evaluatorProfileStrategy',1,'fixture:strategy',ledger.allocate_sequence()
    ) RETURNING profile_cell_id
  `, [grown.rows[0]!.domain_id, PINNED_NOW, "e".repeat(64)]);
  await database.pool.query(`
    INSERT INTO evaluator.rank_snapshot (
      rank_kind,provider,model_id,model_version,domain_id,step,metric,ordinal,score,n,
      interval_lower,interval_upper,source_profile_cell_ids,source_hash,
      derivation_version,as_of,at_seq
    ) VALUES (
      'PROWESS','openai-compatible-http','model:profiled','v7',$1,'AUTHORING',
      'prowess.outcome.v1',1,0.75,4,0.6,0.9,$2::jsonb,$3,7,$4,ledger.allocate_sequence()
    )
  `, [grown.rows[0]!.domain_id, JSON.stringify([profile.rows[0]!.profile_cell_id]), "f".repeat(64), PINNED_NOW]);

  for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
    await database.pool.query(`
      INSERT INTO evaluator.pipeline_event (
        run_id,pipeline,pipeline_version,attempt_id,state,reason,input_hash,at_seq
      ) VALUES ($1,'HARVEST',1,gen_random_uuid(),'FAILED',$2,$3,ledger.allocate_sequence())
    `, [parkedRunId, `TERMINAL_HARVEST_FAILED:${ordinal}`, String(ordinal).padStart(64, "0")]);
  }

  const probe = await database.pool.query<{ vllm_probe_id: string }>(`
    INSERT INTO evaluator.vllm_probe (
      provider_ref,state,failure_code,started_at,finished_at,at_seq
    ) VALUES ('provider:evaluator-vllm','AVAILABLE',NULL,$1,$1,ledger.allocate_sequence())
    RETURNING vllm_probe_id
  `, [PINNED_NOW]);
  availableProbeId = probe.rows[0]!.vllm_probe_id;
  await database.pool.query(`
    INSERT INTO evaluator.vllm_catalog_model (vllm_probe_id,model_id,metadata_json,at_seq)
    VALUES
      ($1,'consumer:alpha','{"id":"consumer:alpha"}'::jsonb,ledger.allocate_sequence()),
      ($1,'consumer:beta','{"id":"consumer:beta"}'::jsonb,ledger.allocate_sequence())
  `, [availableProbeId]);
}, 120_000);

afterAll(async () => database?.stop());

describe("evaluator dev-menu projections", () => {
  it("shows real catalog, grown/starter provenance, harvested rows, profile ranks, parked receipts, and UNBOUND state", async () => {
    const view = await new PostgresEvaluatorDevMenuRepository(database.pool).readView(1);

    expect(view.catalog).toMatchObject({ state: "AVAILABLE", probeId: availableProbeId });
    expect(view.catalog.models.map((model) => model.modelId)).toEqual(["consumer:alpha", "consumer:beta"]);
    expect(view.domains.some((domain) => domain.origin === "STARTER")).toBe(true);
    expect(view.domains).toContainEqual(expect.objectContaining({
      canonicalName: "Robotics Policy",
      origin: "GROWN",
      provenanceRef: "fixture:grown-domain"
    }));
    expect(view.harvestedRows).toBe(1);
    expect(view.profiles).toContainEqual(expect.objectContaining({
      modelId: "model:profiled",
      derivationVersion: 7,
      rank: 1
    }));
    expect(view.parkedRuns).toEqual([expect.objectContaining({
      runId: parkedRunId,
      consecutiveFailures: 3,
      receipts: expect.arrayContaining([
        expect.objectContaining({ state: "FAILED", reason: "TERMINAL_HARVEST_FAILED:1" }),
        expect.objectContaining({ state: "FAILED", reason: "TERMINAL_HARVEST_FAILED:3" })
      ])
    })]);
    expect(view.dispatchBinding).toEqual(expect.objectContaining({ state: "UNBOUND" }));
  });

  it("persists only a model from the latest successful catalog probe with a pinned selection clock", async () => {
    const repository = new PostgresEvaluatorDevMenuRepository(database.pool);
    await expect(repository.selectConsumerModel({
      modelId: "consumer:alpha",
      selectedBy: "asker:devmenu",
      orderRef: "dev-menu:fixture",
      selectedAt: PINNED_NOW
    })).resolves.toMatchObject({ modelId: "consumer:alpha", selectedAt: PINNED_NOW });

    await expect(repository.selectConsumerModel({
      modelId: "consumer:not-enumerated",
      selectedBy: "asker:devmenu",
      orderRef: "dev-menu:fixture",
      selectedAt: PINNED_NOW
    })).rejects.toMatchObject({ code: "EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED" });
  });

  it("returns an explicit unavailable catalog and refuses stale selection when the container is down", async () => {
    await database.pool.query(`
      INSERT INTO evaluator.vllm_probe (
        provider_ref,state,failure_code,started_at,finished_at,at_seq
      ) VALUES ('provider:evaluator-vllm','UNAVAILABLE','ECONNREFUSED',$1,$1,ledger.allocate_sequence())
    `, [new Date(PINNED_NOW.getTime() + 1_000)]);
    const repository = new PostgresEvaluatorDevMenuRepository(database.pool);

    await expect(repository.readView(1)).resolves.toMatchObject({
      catalog: { state: "UNAVAILABLE", failureCode: "ECONNREFUSED", models: [] }
    });
    await expect(repository.selectConsumerModel({
      modelId: "consumer:alpha",
      selectedBy: "asker:devmenu",
      orderRef: "dev-menu:fixture",
      selectedAt: new Date(PINNED_NOW.getTime() + 1_000)
    })).rejects.toMatchObject({ code: "EVALUATOR_CATALOG_UNAVAILABLE" });
  });

  it("grants the dev-menu API role only the evaluator read surfaces and selection write", async () => {
    const privileges = await database.pool.query<{ table_name: string; privilege_type: string }>(`
      SELECT table_name,privilege_type FROM information_schema.table_privileges
      WHERE grantee='debateai_evaluator_api' AND table_schema='evaluator'
      ORDER BY table_name,privilege_type
    `);
    expect(privileges.rows).toEqual(expect.arrayContaining([
      { table_name: "pipeline_event", privilege_type: "SELECT" },
      { table_name: "observation", privilege_type: "SELECT" },
      { table_name: "consumer_selection", privilege_type: "INSERT" }
    ]));
    expect(privileges.rows).not.toContainEqual({ table_name: "shadow_decision", privilege_type: "SELECT" });
    expect(privileges.rows).not.toContainEqual({ table_name: "pipeline_event", privilege_type: "INSERT" });
    expect(privileges.rows).not.toContainEqual({ table_name: "shadow_decision", privilege_type: "INSERT" });
  });
});
