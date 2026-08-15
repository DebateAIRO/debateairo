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
  normalizeDomainName,
  EvaluatorMeteringRepository,
  deriveRelativeCostCellsV1,
  runEvaluatorQuestionTagger
} from "../../packages/evaluator/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import {
  runAskTimeEvaluatorTag,
  runEvaluatorTagReconciliation
} from "../../apps/evaluator-worker/src/index.js";

let database: TestDatabase;

const APPROVED_STARTER_DOMAINS = [
  "Agriculture & Food",
  "Arts & Culture",
  "Business & Management",
  "Computing & Software",
  "Economics",
  "Education",
  "Engineering",
  "Environment & Climate",
  "Ethics & Philosophy",
  "Finance & Investing",
  "Geography",
  "Government & Public Policy",
  "Health & Medicine",
  "History",
  "Law & Justice",
  "Linguistics & Languages",
  "Mathematics",
  "Media & Communication",
  "Natural Sciences",
  "Politics & Elections",
  "Psychology",
  "Religion & Spirituality",
  "Security & Defense",
  "Society & Demographics",
  "Sports & Recreation",
  "Technology & Innovation"
] as const;

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

describe("domain registry repository", () => {
  it("persists a typed REFUSED receipt for a blank proposal", async () => {
    const runId = await insertEvaluatorRun("blank proposal receipt");
    const repository = new DomainRegistryRepository(database.pool);

    const result = await repository.admitProposal({
      runId,
      proposedName: "   ",
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: "test:proposal:blank"
    });

    expect(result).toMatchObject({ decision: "REFUSED", domainId: null });
    const receipt = await database.pool.query<{
      proposed_name: string;
      normalized_name: string;
      decision: string;
      reason: string;
    }>(`SELECT proposed_name, normalized_name, decision, reason
        FROM evaluator.domain_admission WHERE domain_admission_id=$1`, [result.domainAdmissionId]);
    expect(receipt.rows).toEqual([{
      proposed_name: "   ",
      normalized_name: "",
      decision: "REFUSED",
      reason: "EVALUATOR_DOMAIN_PROPOSAL_BLANK"
    }]);
  });

  it("records a direct existing-domain id selection", async () => {
    const runId = await insertEvaluatorRun("existing domain id selection");
    const repository = new DomainRegistryRepository(database.pool);
    const domain = (await repository.listDomains()).find((row) => row.canonicalName === "Mathematics");
    if (domain === undefined) throw new Error("Expected migrated Mathematics starter domain");

    const result = await repository.admitExistingDomainSelection({
      runId,
      domainId: domain.domainId,
      provider: "provider:test",
      modelId: "model:test",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: "test:selection:math"
    });

    expect(result).toMatchObject({ decision: "MATCHED_EXISTING", domainId: domain.domainId });
  });

  it("tags through the evaluator landing without mutating memory.question_key", async () => {
    const runId = await insertEvaluatorRun("memory no-op tagger");
    await database.pool.query(`
      INSERT INTO memory.question_key (
        run_id, canonical_question_text, caller_scope, asker_scope,
        settlement_act, question_type, declared_field, normalized_binding,
        frozen_terms, frozen_query_set_hash, as_of, policy_version,
        key_version, at_seq
      ) VALUES ($1,'memory no-op tagger','ASKER','asker:evaluator-domain',
        NULL,NULL,NULL,'{}'::jsonb,'[]'::jsonb,NULL,now(),1,1,ledger.allocate_sequence())
    `, [runId]);
    const before = await database.pool.query(
      "SELECT * FROM memory.question_key WHERE run_id=$1",
      [runId]
    );
    const domain = (await new DomainRegistryRepository(database.pool).listDomains())
      .find((row) => row.canonicalName === "Mathematics");
    if (domain === undefined) throw new Error("Expected migrated Mathematics starter domain");
    const artifactRef = await insertTaggerRawArtifact(runId);

    await expect(runEvaluatorQuestionTagger({
      runId,
      rawQuestion: "memory no-op tagger",
      family: {
        rowKey: "evaluatorProviderFamily",
        registerVersion: 1,
        sourceRef: "register:test:evaluator-family",
        value: {
          kind: "EVALUATOR_PROVIDER_FAMILY",
          providerRef: EVALUATOR_PROVIDER_REF,
          adapterKind: "vllm-openai-compatible-http",
          maker: EVALUATOR_MAKER,
          chatBaseUrl: "http://vllm:8000/v1",
          modelsPath: "/models",
          deadlineMs: 250,
          source: "LOCAL_CONTAINER_NO_AUTH"
        }
      },
      deployment: { configuredProviders: [] },
      provider: { call: async () => ({
        rawArtifactRef: artifactRef,
        ledgerEntryRef: "ledger:test:tagger",
        content: JSON.stringify({ decision: "SELECT_EXISTING", domain_id: domain.domainId }),
        provider: "openai-compatible-http",
        model: "local/evaluator",
        maker: EVALUATOR_MAKER,
        modelVersion: "local/evaluator"
      }) },
      repository: new DomainRegistryRepository(database.pool),
      bound: { maxAttempts: 1, tokenCeiling: 128, deadlineMs: 250 },
      basis: "TAGGER",
      provenanceRef: "test:tagger:memory-no-op"
    })).resolves.toMatchObject({ state: "TAGGED", domainId: domain.domainId });

    const after = await database.pool.query(
      "SELECT * FROM memory.question_key WHERE run_id=$1",
      [runId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("keeps a container-down ask untagged and reconciles it later", async () => {
    const runId = await insertEvaluatorRun("reconcile evaluator tag later");
    const domain = (await new DomainRegistryRepository(database.pool).listDomains())
      .find((row) => row.canonicalName === "Mathematics");
    if (domain === undefined) throw new Error("Expected migrated Mathematics starter domain");
    const family = evaluatorFamilyFixture();
    const common = {
      pool: database.pool,
      runId,
      family,
      deployment: { configuredProviders: [] },
      bound: { maxAttempts: 1, tokenCeiling: 128, deadlineMs: 25 },
      provenanceRef: "test:tagger:reconciliation"
    } as const;

    await expect(runAskTimeEvaluatorTag({
      ...common,
      provider: { call: async () => { throw new Error("container down"); } }
    })).resolves.toEqual({ state: "UNTAGGED", reason: "TAGGER_PROVIDER_FAILED" });
    await expect(new DomainRegistryRepository(database.pool).readQuestionDomain(runId)).resolves.toBeNull();

    const artifactRef = await insertTaggerRawArtifact(runId);
    await expect(runEvaluatorTagReconciliation({
      ...common,
      provider: { call: async () => ({
        rawArtifactRef: artifactRef,
        ledgerEntryRef: "ledger:test:reconciled-tagger",
        content: JSON.stringify({ decision: "SELECT_EXISTING", domain_id: domain.domainId }),
        provider: "openai-compatible-http",
        model: "local/evaluator",
        maker: EVALUATOR_MAKER,
        modelVersion: "local/evaluator"
      }) }
    })).resolves.toMatchObject({ state: "TAGGED", domainId: domain.domainId });
    await expect(new DomainRegistryRepository(database.pool).readQuestionDomain(runId))
      .resolves.toMatchObject({ assignmentBasis: "BACKFILL", domainId: domain.domainId });
  });

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
    expect(persisted.filter((row) =>
      row.provenanceRef === "mission:model-evaluator:V-approved-starter-list"
    ).map((row) => row.canonicalName)).toEqual(APPROVED_STARTER_DOMAINS);
    expect(persisted.filter((row) =>
      row.provenanceRef !== "mission:model-evaluator:V-approved-starter-list"
    ).map((row) => [row.normalizedName, row.origin])).toEqual([
      ["climate science", "GROWN"],
      ["software engineering", "STARTER"]
    ]);
  });

  it("backfills the dedicated question link once and keeps domain identity append-only", async () => {
    const runId = await insertEvaluatorRun("domain backfill landing");
    const repository = new DomainRegistryRepository(database.pool);
    const domain = (await repository.listDomains()).find((row) => row.canonicalName === "Mathematics");
    if (domain === undefined) throw new Error("Expected migrated Mathematics starter domain");
    expect(domain).toMatchObject({
      origin: "STARTER",
      provenanceRef: "mission:model-evaluator:V-approved-starter-list"
    });
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

  it("applies 0024 via migrate and matches every approved starter name through admission", async () => {
    const scratch = await startTestDatabase();
    try {
      await migrate(scratch.pool);
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
      expect(seeded.rows.map((row) => row.canonical_name)).toEqual(APPROVED_STARTER_DOMAINS);
      expect(seeded.rows.map((row) => row.origin)).toEqual(
        APPROVED_STARTER_DOMAINS.map(() => "STARTER")
      );
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

async function insertTaggerRawArtifact(runId: string): Promise<string> {
  const result = await database.pool.query<{ raw_artifact_id: string }>(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id,
      maker, model_version, raw_text, metadata_json, parse_status, input_hash,
      contract_hash, content_hash, at_seq
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), $1, $2, 'openai-compatible-http',
      'local/evaluator', $3, 'local/evaluator', '{}', '{}'::jsonb, 'PARSED',
      repeat('b', 64), repeat('c', 64), repeat('a', 64), ledger.allocate_sequence()
    ) RETURNING raw_artifact_id
  `, [runId, EVALUATOR_PROVIDER_REF, EVALUATOR_MAKER]);
  return result.rows[0]!.raw_artifact_id;
}

function evaluatorFamilyFixture() {
  return {
    rowKey: "evaluatorProviderFamily" as const,
    registerVersion: 1,
    sourceRef: "register:test:evaluator-family",
    value: {
      kind: "EVALUATOR_PROVIDER_FAMILY" as const,
      providerRef: EVALUATOR_PROVIDER_REF,
      adapterKind: "vllm-openai-compatible-http" as const,
      maker: EVALUATOR_MAKER,
      chatBaseUrl: "http://vllm:8000/v1",
      modelsPath: "/models",
      deadlineMs: 250,
      source: "LOCAL_CONTAINER_NO_AUTH" as const
    }
  };
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
