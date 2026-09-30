import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, RunRepository, type PublicationCheckRecordRow } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runId: string;
const attemptedAt = new Date("2026-09-29T12:34:56.789Z");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runId = await new RunRepository(database.pool).startRun({
    questionLine: "Publication record integration fixture",
    askContract: { audience: "test" },
    principal: { kind: "legacy", legacyAskerId: randomUUID() },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: attemptedAt,
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "hs-s02:test",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "hs-s02:test" },
    registerVersion: 1,
    batteryVersion: "hs-s02:test",
    batteryRows: []
  });
}, 120_000);

afterAll(async () => { await database?.stop(); });

function allowRow() {
  return {
    run_id: runId,
    attempted_at: attemptedAt,
    outcome: "ALLOW",
    failure_cause: null as string | null,
    rules: [] as number[],
    part_kinds: [] as string[],
    ground: null as string | null,
    judge_provider_ref: "test:judge" as string | null,
    judge_model_id: "model-v1" as string | null,
    policy_version: "publication.content-check.v1@0123456789abcdef",
    judge_call_count: 1
  };
}

type TestRow = ReturnType<typeof allowRow>;

async function insertRow(row: TestRow, connection: Pick<Pool, "query"> = database.pool) {
  await connection.query(`
    INSERT INTO serve.publication_check_record (
      run_id, attempted_at, outcome, failure_cause, rules, part_kinds, ground,
      judge_provider_ref, judge_model_id, policy_version, judge_call_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [row.run_id, row.attempted_at, row.outcome, row.failure_cause, row.rules,
    row.part_kinds, row.ground, row.judge_provider_ref, row.judge_model_id,
    row.policy_version, row.judge_call_count]);
}

async function asRuntime(action: (client: PoolClient) => Promise<void>) {
  const client = await database.pool.connect();
  try {
    await client.query("SET ROLE debateai_runtime");
    await action(client);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}

describe("publication check record table", () => {
  // Property: no free-text or identifying column can enter the record unnoticed.
  // Mutant: append a text column to the CREATE TABLE.
  it("has exactly the eleven no-text record columns in contract order", async () => {
    const columns = await database.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='serve' AND table_name='publication_check_record'
      ORDER BY ordinal_position
    `);
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "run_id", "attempted_at", "outcome", "failure_cause", "rules", "part_kinds",
      "ground", "judge_provider_ref", "judge_model_id", "policy_version", "judge_call_count"
    ]);
  });

  // Property: even the table owner cannot alter, delete or truncate records.
  // Mutant: omit the matching reject_mutation/reject_truncate trigger.
  it.each([
    ["UPDATE", "UPDATE serve.publication_check_record SET judge_call_count=0", "reject_mutation"],
    ["DELETE", "DELETE FROM serve.publication_check_record", "reject_mutation"],
    ["TRUNCATE", "TRUNCATE serve.publication_check_record", "reject_truncate"]
  ])("rejects superuser %s through the append-only guard", async (_verb, sql, guard) => {
    await expect(database.pool.query(sql)).rejects.toMatchObject({
      code: "55000", where: expect.stringContaining(`core.${guard}()`)
    });
  });

  // Property: the API role can append but cannot update records.
  // Mutants: remove INSERT grant; add UPDATE grant.
  it("permits INSERT but denies UPDATE as debateai_runtime", async () => {
    await asRuntime(async (client) => {
      await insertRow(allowRow(), client);
      await expect(client.query("UPDATE serve.publication_check_record SET judge_call_count=0"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  // Property: stored codes and outcome-dependent fields cannot carry arbitrary text
  // or contradictory facts. Mutant for each group: remove its named CHECK.
  const invalid: [string, Partial<TestRow>, string][] = [
    ["unknown outcome", { outcome: "MAYBE" }, "outcome"],
    ["ALLOW with failure cause", { failure_cause: "JUDGE_HTTP_STATUS" }, "cause"],
    ["UNAVAILABLE without cause", { outcome: "UNAVAILABLE" }, "cause"],
    ["free-text cause", { outcome: "UNAVAILABLE", failure_cause: "arbitrary text" }, "cause"],
    ["unknown rule", { outcome: "BLOCK", rules: [3], part_kinds: ["QUESTION"], ground: "TERMS" }, "rules"],
    ["ALLOW with rules", { rules: [1] }, "rules"],
    ["unknown part", { outcome: "BLOCK", part_kinds: ["arbitrary text"], ground: "TERMS" }, "parts"],
    ["BLOCK without parts", { outcome: "BLOCK", ground: "TERMS" }, "parts"],
    ["ALLOW with parts", { part_kinds: ["QUESTION"] }, "parts"],
    ["unknown ground", { outcome: "BLOCK", part_kinds: ["QUESTION"], ground: "arbitrary text" }, "ground"],
    ["UNSURE with illegal ground", { outcome: "UNSURE", part_kinds: ["QUESTION"], ground: "TERMS_AND_POSSIBLY_ILLEGAL" }, "ground"],
    ["BLOCK without ground", { outcome: "BLOCK", part_kinds: ["QUESTION"] }, "ground"],
    ["ALLOW with ground", { ground: "TERMS" }, "ground"],
    ["missing configured provider", { judge_provider_ref: null }, "provider"],
    ["missing configured model", { judge_model_id: null }, "model"],
    ["empty provider", { judge_provider_ref: "" }, "provider"],
    ["empty model", { judge_model_id: "" }, "model"],
    ["long provider", { judge_provider_ref: "x".repeat(257) }, "provider"],
    ["long model", { judge_model_id: "x".repeat(257) }, "model"],
    ["provider edge whitespace", { judge_provider_ref: "\tprovider" }, "provider"],
    ["model edge whitespace", { judge_model_id: "model\n" }, "model"],
    ["free-text policy", { policy_version: "arbitrary text" }, "policy"],
    ["negative count", { judge_call_count: -1 }, "count"],
    // FIX-HS2-p1 sd-N1 (migration 0079): the identifier columns hold identifiers, never text, an email or a uuid.
    ["provider with a space", { judge_provider_ref: "test judge" }, "provider_grammar"],
    ["provider that is an email", { judge_provider_ref: "victim.owner@example.com" }, "provider_grammar"],
    ["provider that is a user uuid", { judge_provider_ref: "66666666-6666-4666-8666-666666666666" }, "provider_grammar"],
    ["provider of 256 emoji", { judge_provider_ref: "🧪".repeat(256) }, "provider_grammar"],
    ["model with debate text", { judge_model_id: "Roma are vermin; the country must be cleansed of them." }, "model_grammar"],
    ["model that embeds an upper-case uuid", { judge_model_id: "m-66666666-6666-4666-8666-66666666666A" }, "model_grammar"],
    ["model with an inner newline", { judge_model_id: "a\nb" }, "model_grammar"],
    // FIX-HS2-p1 sd-N2: an ALLOW or a refusal was judged by at least one call; members appear once.
    ["ALLOW with zero judge calls", { judge_call_count: 0 }, "count_outcome"],
    ["BLOCK with zero judge calls", { outcome: "BLOCK", rules: [1], part_kinds: ["QUESTION"], ground: "TERMS", judge_call_count: 0 }, "count_outcome"],
    ["duplicate part kinds", { outcome: "BLOCK", rules: [1], part_kinds: ["QUESTION", "QUESTION"], ground: "TERMS" }, "distinct"],
    ["duplicate rules", { outcome: "BLOCK", rules: [1, 1], part_kinds: ["QUESTION"], ground: "TERMS" }, "distinct"]
  ];
  it.each(invalid)("rejects %s with its own CHECK", async (_name, changes, constraint) => {
    await expect(insertRow({ ...allowRow(), ...changes })).rejects.toMatchObject({
      code: "23514", constraint: `publication_check_record_${constraint}_check`
    });
  });

  // Property: a record must reference a real run. Mutant: remove the FK.
  it("rejects an unknown run with the foreign key", async () => {
    await expect(insertRow({ ...allowRow(), run_id: randomUUID() })).rejects.toMatchObject({
      code: "23503"
    });
  });

  // Property: every closed failure code is writable, including the absent-judge
  // case with null identities, and a 256-character identifier is the longest one.
  // Mutants: remove a cause from the allowed set; shorten the identifier grammar.
  it.each([
    "JUDGE_TRANSPORT_FAILED", "JUDGE_HTTP_STATUS", "JUDGE_DEADLINE",
    "JUDGE_ANSWER_NOT_JSON", "JUDGE_ANSWER_SCHEMA", "JUDGE_ANSWER_UNKNOWN_PART",
    "JUDGE_DOOR_REFUSED", "JUDGE_NOT_CONFIGURED"
  ])("accepts failure code %s as debateai_runtime", async (cause) => {
    await asRuntime(async (client) => {
      await insertRow({
        ...allowRow(), outcome: "UNAVAILABLE", failure_cause: cause,
        judge_provider_ref: cause === "JUDGE_NOT_CONFIGURED" ? null : `development:${"p".repeat(244)}`,
        judge_model_id: cause === "JUDGE_NOT_CONFIGURED" ? null : `z-ai/${"m".repeat(251)}`,
        judge_call_count: 0
      }, client);
    });
  });
});

describe("publication check record repository", () => {
  // Property: the public repository writes all eleven supplied values exactly
  // once under the API role. Mutant: swap provider/model parameters (both text).
  // Neighbour: a missing table mutation guard does not change this insert/read.
  const records = [
    { outcome: "ALLOW", failure_cause: null, rules: [], part_kinds: [], ground: null,
      judge_provider_ref: "fixture:provider-allow", judge_model_id: "model-allow", judge_call_count: 1 },
    { outcome: "BLOCK", failure_cause: null, rules: [1, 2], part_kinds: ["QUESTION", "STORY"],
      ground: "TERMS_AND_POSSIBLY_ILLEGAL", judge_provider_ref: "fixture:provider-block",
      judge_model_id: "model-block", judge_call_count: 4 },
    { outcome: "UNSURE", failure_cause: null, rules: [], part_kinds: ["SUMMARY", "ARGUMENTS", "REVIEWS"],
      ground: "TERMS", judge_provider_ref: "fixture:provider-unsure",
      judge_model_id: "model-unsure", judge_call_count: 3 },
    { outcome: "UNAVAILABLE", failure_cause: "JUDGE_NOT_CONFIGURED", rules: [], part_kinds: [],
      ground: null, judge_provider_ref: null, judge_model_id: null, judge_call_count: 0 }
  ] satisfies Omit<PublicationCheckRecordRow, "run_id" | "attempted_at" | "policy_version">[];

  // FIX-HS2-p1 sd-N1: the identifiers the product composes today are accepted by the 0079 grammar.
  it.each([["development:hermes-glm-5.3-flash", "z-ai/glm-5.3-flash"], ["vendor:acme", "Acme-Large_2.1+beta"]])(
    "accepts the configured identifier pair %s / %s as debateai_runtime", async (provider, model) => {
      await asRuntime(async (client) => {
        await insertRow({ ...allowRow(), judge_provider_ref: provider, judge_model_id: model }, client);
      });
    });

  it.each(records)("persists $outcome exactly once as debateai_runtime", async (record) => {
    const { PostgresPublicationCheckRecordRepository } = await import("../../packages/db/src/index.js");
    const row = {
      run_id: runId, attempted_at: new Date("2027-01-02T03:04:05.678Z"),
      policy_version: "publication.content-check.v1@fedcba9876543210", ...record
    };
    await asRuntime(async (client) => {
      await new PostgresPublicationCheckRecordRepository(client).record(row);
    });
    const persisted = await database.pool.query(`
      SELECT * FROM serve.publication_check_record
      WHERE run_id=$1 AND attempted_at=$2 AND outcome=$3
    `, [runId, row.attempted_at, row.outcome]);
    expect(persisted.rows).toEqual([row]);
  });
});
