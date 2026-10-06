/**
 * A19 — how long sealing a scorecard at the 64 KiB bound takes, on a real
 * (embedded) PostgreSQL.
 *
 * The database re-canonicalises every row character by character
 * (register._canonical_json_value, migrations/0055), at a cost that grows with
 * the square of the size: ~100 KB took ~84 s on a quiet machine, which is why
 * the owners set the scorecard bound at 64 KiB on 2026-09-27
 * (`MODEL_SCORECARD_MAX_BYTES`). This row seals the largest example that fits
 * the bound and must finish in under a minute (measured 36-38 s).
 *
 * It is a WALL-CLOCK row, so it lives in its own file (review Minor 4): on a
 * slow or busy host only this file turns red, never the functional rows in
 * ./model-scorecard-register.test.ts. Like every integration file, it is
 * outside the CI gate (`test:ci-gate` runs tests/unit and tests/architecture).
 * Run it alone, on a quiet machine, when the number matters.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  MODEL_SCORECARD_MAX_BYTES,
  readEngineVersion,
  readModelScorecard,
  registerVersionToSafeLegacyNumber
} from "../../packages/register/src/index.js";
import {
  HOSTED_REGISTER_FILE_FORMAT,
  createPostgresHostedRegisterOperations,
  parseHostedRegisterFile,
  parseHostedScorecardFile,
  planHostedRegisterPublication,
  publishHostedRegister
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

/** Two vetted vendors on fixture names: the same register file ./model-scorecard-register.test.ts publishes. */
function hostedFile(): Record<string, unknown> {
  const target = (name: string, input: number, output: number) => ({
    provider_ref: `vendor:${name}`,
    base_url: `https://api.${name}-vendor-fixture.com/v1`,
    model: `${name}-large`,
    authorization_file: `/etc/debateai/runner/providers/${name}.header`,
    input_price_micros_per_million: input,
    output_price_micros_per_million: output
  });
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
    providerTargets: [target("alpha", 3_000_000, 15_000_000), target("beta", 1_000_000, 4_000_000)]
  };
}

describe("A19 · sealing a scorecard at the 64 KiB bound on PostgreSQL", () => {
  it("seals a scorecard just under the 64 KiB bound in under a minute, and says how long that took", async () => {
    const big = await compatibleExampleScorecard(4, MODEL_SCORECARD_MAX_BYTES);
    const bytes = Buffer.byteLength(JSON.stringify(big), "utf8");
    expect(bytes).toBeGreaterThan(MODEL_SCORECARD_MAX_BYTES - 1_024);
    expect(bytes).toBeLessThanOrEqual(MODEL_SCORECARD_MAX_BYTES);
    const operations = createPostgresHostedRegisterOperations(database.pool);
    const engine = await readEngineVersion();
    // Pre-flight fix F34: plan first, so the clock times the SEAL alone, not the planning.
    const plan = await planHostedRegisterPublication(
      parseHostedRegisterFile(Buffer.from(JSON.stringify(hostedFile()), "utf8")),
      parseHostedScorecardFile(Buffer.from(JSON.stringify(big), "utf8"), engine)
    );
    const started = performance.now();
    const published = await publishHostedRegister({ plan, operations });
    const elapsedMs = Math.round(performance.now() - started);
    console.info(`A19_SCORECARD_SEAL bytes=${bytes} elapsed_ms=${elapsedMs}`);
    expect(published.outcome).toBe("CREATED");
    await expect(readModelScorecard(
      database.pool, registerVersionToSafeLegacyNumber(published.registerVersion), engine
    )).resolves.toMatchObject({ state: "VALID" });
    expect(elapsedMs).toBeLessThan(60_000);
  }, 120_000);
});
