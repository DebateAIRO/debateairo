import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseRegisterVersionText,
  persistBootstrapRegister,
  type RegisterPublicationRow
} from "../../packages/register/src/index.js";
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT } from "../../packages/judgement/src/prompts.js";
import {
  ACCEPTANCE_REGISTER_SOURCE_REF,
  buildAcceptanceRegisterPublicationRows,
  seedAcceptanceRegister
} from "../../acceptance/seed-register.js";
import {
  buildDevelopmentDeploymentRegisterPublicationRows,
  DEVELOPMENT_ALGORITHM_SOURCE_REF,
  seedDevelopmentDeploymentRegister
} from "../../apps/runner/src/dev-deployment-register.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";

const OLD_HASHES: Readonly<Record<string, string>> = {
  judgeContractHash: "a".repeat(64),
  composerContractHash: "b".repeat(64),
  conformanceContractHash: "c".repeat(64)
};
// PLAN §7.3: keep the same census as the operator acceptance.
const CENSUS = "SELECT version.register_version::text AS register_version, version.row_count, count(row.row_key)::int AS actual_rows, version.sealed FROM register.register_version AS version LEFT JOIN register.register_row AS row USING (register_version) GROUP BY version.register_version, version.row_count, version.sealed ORDER BY version.register_version";
type CensusRow = {
  register_version: string;
  row_count: number;
  actual_rows: number;
  sealed: boolean;
};

let database: TestDatabase;
let repositoryRoot: string | undefined;

function withOldHashes(rows: readonly RegisterPublicationRow[], sourceRef: string) {
  return rows.map((row) => OLD_HASHES[row.rowKey] === undefined
    ? row
    : registerFixtureRow(row.rowKey, OLD_HASHES[row.rowKey], sourceRef));
}
async function census(): Promise<CensusRow[]> {
  return (await database.pool.query<CensusRow>(CENSUS)).rows;
}

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  try {
    if (database !== undefined) await database.stop();
  } finally {
    if (repositoryRoot !== undefined) {
      await rm(repositoryRoot, { recursive: true, force: true });
      repositoryRoot = undefined;
    }
  }
});

describe("S01 R8 register reseeding", () => {
  // Property: re-seeding a standing ceremony v3 preserves its census and old
  // hashes, and seals exactly v4 with the receipt's complete row count.
  // Catches: pin left at 3; attempted history mutation; incomplete new seal.
  it("R8-ceremony — seals version 4 beside unchanged version 3", async () => {
    await importHistoricalRegisterFixture(database.pool, 3, withOldHashes(
      await buildAcceptanceRegisterPublicationRows(), ACCEPTANCE_REGISTER_SOURCE_REF
    ));
    const before = await census();

    const receipt = await seedAcceptanceRegister(database.pool);

    const after = await census();
    expect(after.filter((row) => row.register_version === "3")).toEqual(before);
    const historicalHashes = await database.pool.query<{ row_key: string; value_json: string }>(
      "SELECT row_key, value_json FROM register.register_row WHERE register_version=3 AND row_key=ANY($1::text[]) ORDER BY row_key",
      [Object.keys(OLD_HASHES)]
    );
    expect(historicalHashes.rows).toEqual([
      { row_key: "composerContractHash", value_json: "b".repeat(64) },
      { row_key: "conformanceContractHash", value_json: "c".repeat(64) },
      { row_key: "judgeContractHash", value_json: "a".repeat(64) }
    ]);
    expect(after.filter((row) => row.register_version === "4")).toEqual([{
      register_version: "4", sealed: true,
      row_count: receipt.rowCount, actual_rows: receipt.rowCount
    }]);
    expect(after.map((row) => row.register_version)).toEqual(["3", "4"]);
  }, 120_000);

  // Property: new prompt hashes mint a later development publication without
  // changing any prior census, and repeating the same seed mints nothing.
  // Catches: editing history, retaining an old prompt hash, random publication IDs.
  it("R8-dev — preserves history, publishes current hashes once, and replays the seed", async () => {
    const bootstrap = await loadBootstrapRegister();
    await persistBootstrapRegister(database.pool, bootstrap);
    await createPostgresRegisterPublicationPort(database.pool).publishGeneral({
      publicationId: "12345678-1234-5123-a123-123456789abc",
      baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)),
      rows: withOldHashes(
        await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL),
        DEVELOPMENT_ALGORITHM_SOURCE_REF
      ),
      sourceRef: DEVELOPMENT_ALGORITHM_SOURCE_REF,
      deployment: "local"
    });
    const before = await census();
    repositoryRoot = await mkdtemp(join(tmpdir(), "hs-s01-reseed-"));
    await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
    const input = {
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    };

    const receipt = await seedDevelopmentDeploymentRegister(input);

    const after = await census();
    const earlier = new Set(before.map((row) => row.register_version));
    expect(after.filter((row) => earlier.has(row.register_version))).toEqual(before);
    expect(before.every((row) => BigInt(receipt.registerVersion) > BigInt(row.register_version))).toBe(true);
    expect(after.filter((row) => !earlier.has(row.register_version))).toEqual([{
      register_version: receipt.registerVersion, sealed: true,
      row_count: receipt.rowCount, actual_rows: receipt.rowCount
    }]);
    const currentHash = await database.pool.query<{ value_json: string }>(
      "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key='judgeContractHash'",
      [receipt.registerVersion]
    );
    expect(currentHash.rows).toEqual([{
      value_json: createHash("sha256").update(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).digest("hex")
    }]);

    const repeated = await seedDevelopmentDeploymentRegister(input);
    expect(repeated.registerVersion).toBe(receipt.registerVersion);
    expect(await census()).toEqual(after);
  }, 120_000);
});
