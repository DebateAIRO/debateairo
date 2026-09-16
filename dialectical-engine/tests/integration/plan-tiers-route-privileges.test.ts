import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication } from "@debateai/api";
import { createPool, migrate, type Pool } from "@debateai/db";
import {
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText
} from "@debateai/register";
import {
  createTestAskAdmissionPoolFacades,
  startTestDatabase,
  type TestDatabase
} from "../support/testDatabase.js";

const REGISTER_VERSION = 1;
const SESSION = {
  session_id: "11111111-1111-4111-8111-111111111111"
} as never;
const ROSTERS = Object.freeze({
  free: ["free-runtime-a", "free-runtime-b"],
  premium: ["premium-runtime-a", "premium-runtime-b", "premium-runtime-c"]
});

let database: TestDatabase;
let runtimePool: Pool;
let application: PostgresAskApplication;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createPostgresRegisterPublicationPort(database.pool).importHistorical({
    registerVersion: parseRegisterVersionText(String(REGISTER_VERSION)),
    rows: [{
      rowKey: "planTierRosters",
      valueJsonText: parseCanonicalRegisterJson(Buffer.from(JSON.stringify(ROSTERS))),
      sourceRef: "fixture:plan-tier-runtime-role"
    }]
  });

  runtimePool = createPool(database.connectionString, { max: 1 });
  await runtimePool.query("SET ROLE debateai_runtime");
  application = new PostgresAskApplication(
    runtimePool,
    { dispatch: async () => undefined },
    { registerVersion: REGISTER_VERSION } as never,
    undefined,
    database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
  );
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await database?.stop();
});

describe("GET /v1/plan-tiers database privileges", () => {
  it("reads only the sealed roster as debateai_runtime while the operator deployment read remains 42501", async () => {
    await expect(application.readPlanTierRosters(SESSION)).resolves.toEqual(ROSTERS);

    await expect(application.readDeployment(SESSION)).rejects.toMatchObject({ code: "42501" });
  });
});
