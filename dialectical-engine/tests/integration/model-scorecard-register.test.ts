/**
 * A19 — the hosted model scorecard on a real (embedded) PostgreSQL.
 *
 * Proves that:
 *  - `--scorecard` seals ONE additive `modelScorecard` row that the register
 *    reader reads back VALID;
 *  - a new scorecard is a NEW version, while every earlier version still reads
 *    exactly what it sealed;
 *  - a publication without `--scorecard` seals a version where it is ABSENT;
 *  - the boot check refuses a version whose scorecard row the engine refuses;
 *  - sealing a scorecard just under the 64 KiB scorecard bound works in under
 *    a minute, and how long it takes (M3's open measurement: the database
 *    re-canonicalises every row character by character, at a cost that grows
 *    with the square of the size; at ~100 KB it took ~84 s, which is why the
 *    owners set the bound at 64 KiB on 2026-09-27).
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  MODEL_SCORECARD_MAX_BYTES,
  MODEL_SCORECARD_ROW_KEY,
  parseCanonicalRegisterJson,
  readEngineVersion,
  readModelScorecard,
  registerVersionToSafeLegacyNumber,
  type RegisterVersionText
} from "../../packages/register/src/index.js";
import {
  HOSTED_REGISTER_FILE_FORMAT,
  createPostgresHostedRegisterOperations,
  hostedRegisterRefusalCode,
  parseHostedRegisterFile,
  parseHostedScorecardFile,
  planHostedRegisterPublication,
  publishHostedRegister,
  verifyHostedRegisterBootReadiness
} from "../../apps/runner/src/hosted-register-publish.js";
import { compatibleExampleScorecard } from "../support/modelScorecardFixture.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
});

const VETTING = Object.freeze({
  dataUseTermsReviewedOn: "2026-09-24",
  retentionTermsReviewedOn: "2026-09-24",
  namedInPrivacyNotice: true
});

function hostedFile(): Record<string, unknown> {
  return {
    format: HOSTED_REGISTER_FILE_FORMAT,
    sourceRef: "a19 integration: hosted register with a model scorecard",
    configuredProviderSet: {
      requiredDistinctMakers: 2,
      providers: [
        { providerRef: "vendor:alpha", adapterKind: "openai-compatible-http", maker: "Alpha", vetting: VETTING },
        { providerRef: "vendor:beta", adapterKind: "openai-compatible-http", maker: "Beta", vetting: VETTING }
      ]
    },
    costEnvelopePolicy: {
      kind: "COST_ENVELOPE_POLICY",
      currency: "USD",
      minor_units_per_unit: 1_000_000,
      per_run_ceiling_micros: 250_000,
      daily_ceiling_micros: 2_000_000,
      provisional: true,
      provisional_reason: "PROVISIONAL first hosted run ceiling under V-28"
    },
    providerTargets: [
      {
        provider_ref: "vendor:alpha",
        base_url: "https://api.alpha-vendor-fixture.com/v1",
        model: "alpha-large",
        authorization_file: "/etc/debateai/runner/providers/alpha.header",
        input_price_micros_per_million: 3_000_000,
        output_price_micros_per_million: 15_000_000
      },
      {
        provider_ref: "vendor:beta",
        base_url: "https://api.beta-vendor-fixture.com/v1",
        model: "beta-large",
        authorization_file: "/etc/debateai/runner/providers/beta.header",
        input_price_micros_per_million: 1_000_000,
        output_price_micros_per_million: 4_000_000
      }
    ]
  };
}

async function planWith(scorecard: Record<string, unknown> | null) {
  const file = parseHostedRegisterFile(Buffer.from(JSON.stringify(hostedFile()), "utf8"));
  return planHostedRegisterPublication(file, scorecard === null ? null : parseHostedScorecardFile(
    Buffer.from(JSON.stringify(scorecard), "utf8"), await readEngineVersion()
  ));
}

async function sealedRows(registerVersion: RegisterVersionText) {
  return (await database.pool.query<{ row_key: string; v: string; source_ref: string }>(
    "SELECT row_key,value_json::text AS v,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
    [registerVersion]
  )).rows;
}

async function scorecardAt(registerVersion: RegisterVersionText) {
  return readModelScorecard(
    database.pool, registerVersionToSafeLegacyNumber(registerVersion), await readEngineVersion()
  );
}

describe("A19 · the hosted model scorecard on PostgreSQL", () => {
  it("seals the operator's scorecard as ONE additive row the register reader reads back VALID", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const published = await publishHostedRegister({ plan: await planWith(await compatibleExampleScorecard(4)), operations });
    await expect(scorecardAt(published.registerVersion))
      .resolves.toMatchObject({ state: "VALID", scorecard: { scorecardVersion: 4 } });
    const rows = (await sealedRows(published.registerVersion)).filter((row) => row.row_key === MODEL_SCORECARD_ROW_KEY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source_ref).toMatch(/ \| modelScorecard v4 sha256:[0-9a-f]{64}$/u);
  }, 120_000);

  it("supersedes cleanly: each scorecard is its own version, one without reads ABSENT, no sealed version changes", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const first = await publishHostedRegister({ plan: await planWith(await compatibleExampleScorecard(4)), operations });
    const firstRows = await sealedRows(first.registerVersion);
    const second = await publishHostedRegister({ plan: await planWith(await compatibleExampleScorecard(5)), operations });
    const withdrawn = await publishHostedRegister({ plan: await planWith(null), operations });
    expect(new Set([first.registerVersion, second.registerVersion, withdrawn.registerVersion]).size).toBe(3);
    await expect(scorecardAt(first.registerVersion))
      .resolves.toMatchObject({ state: "VALID", scorecard: { scorecardVersion: 4 } });
    await expect(scorecardAt(second.registerVersion))
      .resolves.toMatchObject({ state: "VALID", scorecard: { scorecardVersion: 5 } });
    await expect(scorecardAt(withdrawn.registerVersion)).resolves.toEqual({ state: "ABSENT" });
    expect(await sealedRows(first.registerVersion)).toEqual(firstRows);
    // Optional by design: the manifest of required rows never names it.
    const required = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM register.required_row WHERE row_key=$1", [MODEL_SCORECARD_ROW_KEY]
    );
    expect(required.rows[0]!.count).toBe("0");
  }, 120_000);

  it("replays an identical register file and scorecard as the version that already holds them", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const first = await publishHostedRegister({ plan: await planWith(await compatibleExampleScorecard(4)), operations });
    const again = await publishHostedRegister({ plan: await planWith(await compatibleExampleScorecard(4)), operations });
    expect(again).toMatchObject({ outcome: "REPLAYED", registerVersion: first.registerVersion });
  }, 120_000);

  it("refuses at the boot check a sealed version whose scorecard row the engine refuses", async () => {
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const plan = await planWith(null);
    await operations.importHistoricalBootstrap(plan.bootstrap);
    // Sealed by hand, around the command's own refusal, to reach the reader's.
    const receipt = await operations.publishGeneral({
      publicationId: randomUUID(),
      baseRegisterVersion: plan.baseRegisterVersion,
      rows: [...plan.rows, Object.freeze({
        rowKey: MODEL_SCORECARD_ROW_KEY,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify({ kind: "NOT_A_SCORECARD" }), "utf8")),
        sourceRef: "a19 integration: a malformed scorecard sealed by hand"
      })],
      sourceRef: "a19 integration: malformed scorecard",
      deployment: "hosted"
    });
    const code = await verifyHostedRegisterBootReadiness(
      database.pool, receipt.registerVersion, JSON.stringify(hostedFile().providerTargets)
    ).then(() => "NO_REFUSAL", hostedRegisterRefusalCode);
    expect(code).toBe("HOSTED_REGISTER_MODEL_SCORECARD_REFUSED:SCHEMA_INVALID");
  }, 120_000);

  it("seals a scorecard just under the 64 KiB bound in under a minute, and says how long that took", async () => {
    const big = await compatibleExampleScorecard(4, MODEL_SCORECARD_MAX_BYTES);
    const bytes = Buffer.byteLength(JSON.stringify(big), "utf8");
    expect(bytes).toBeGreaterThan(MODEL_SCORECARD_MAX_BYTES - 1_024);
    expect(bytes).toBeLessThanOrEqual(MODEL_SCORECARD_MAX_BYTES);
    const operations = createPostgresHostedRegisterOperations(database.pool);
    // Pre-flight fix F34: plan first, so the clock times the SEAL alone, not the planning.
    const plan = await planWith(big);
    const started = performance.now();
    const published = await publishHostedRegister({ plan, operations });
    const elapsedMs = Math.round(performance.now() - started);
    console.info(`A19_SCORECARD_SEAL bytes=${bytes} elapsed_ms=${elapsedMs}`);
    expect(published.outcome).toBe("CREATED");
    await expect(scorecardAt(published.registerVersion)).resolves.toMatchObject({ state: "VALID" });
    expect(elapsedMs).toBeLessThan(60_000);
  }, 120_000);
});
