// tests/integration/registration-country-0191.test.ts
// Migration 0191 on real PostgreSQL: the API's billing role reads the country an account chose at sign-up, for that account's own
// request only, and learns nothing else about the region (never the US state). The reader runs on the API's request login inside the
// account's own request, as the billing routes run it. The region rows are written by the superuser, as the sign-up would leave them.
// Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, PostgresRegistrationCountryReader, migrate, type Pool } from "@debateai/db";
import { inAccountRequest, provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const READER = "identity.read_registration_country(uuid)";
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };

let database: TestDatabase;
let logins: RlsLogins;
/** The API's request login (api-runtime: debateai_billing_runtime), with its system twin as target, as main.ts builds `pool`. */
let request: Pool;
/** Chose Romania at sign-up. */
let ana: RlsTestAccount;
/** Chose the United States, Texas. */
let tex: RlsTestAccount;
/** Signed up before the Region field: no region row. */
let old: RlsTestAccount;
const opened: Pool[] = [];

/** The reader, asked on `pool` inside the request of `token` (null token: a request with no session). */
function asked(pool: Pool, token: string | null, ownerRef: string): Promise<string | null> {
  return inAccountRequest(token, () => new PostgresRegistrationCountryReader(pool).read(ownerRef));
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  request = logins.apiPools().runtime;
  ana = await seedSessionAccount(database.pool, "country-ana");
  tex = await seedSessionAccount(database.pool, "country-tex");
  old = await seedSessionAccount(database.pool, "country-old");
  await database.pool.query("INSERT INTO identity.registration_region(user_id,country_code,us_state) VALUES ($1,'RO',NULL),($2,'US','TX')",
    [ana.userId, tex.userId]);
}, 600_000);

afterAll(async () => {
  for (const pool of opened) await pool.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
});

describe("0191: the sign-up country, read for the request's own account", () => {
  it("answers the country of the request's own account, null with no sign-up region, and never the US state", async () => {
    expect(await asked(request, ana.token, ana.ownerRef)).toBe("RO");
    expect(await asked(request, tex.token, tex.ownerRef)).toBe("US");
    expect(await asked(request, old.token, old.ownerRef)).toBeNull();
  });

  it("refuses every connection that is not the account's own", async () => {
    await expect(asked(request, tex.token, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
    await expect(asked(request, null, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
    await expect(asked(request, ana.revokedToken, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
    await expect(asked(request, ana.expiredToken, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
    // The request login on a connection of its own, with no account named.
    const bare = createPool(logins.url("DATABASE_URL"), { max: 1 });
    opened.push(bare);
    await expect(asked(bare, null, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  });

  it("is the API's billing role's alone, a STABLE definer, and opens no way to the table", async () => {
    const grantees = (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
      WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [READER])).rows.map((row) => row.grantee);
    expect(grantees).toEqual(["debateai_billing_runtime"]);
    const roles = ["debateai_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker",
      "debateai_staff_security_owner", "debateai_content_provision", "debateai_rls_all_accounts"];
    expect((await database.pool.query<{ role: string }>("SELECT role FROM unnest($1::text[]) AS role WHERE has_function_privilege(role,$2,'EXECUTE')",
      [roles, READER])).rows).toEqual([]);
    for (const key of ["AUTHORIZATION_DATABASE_URL", "RUNNER_DATABASE_URL", "ERASURE_DATABASE_URL", "DATA_EXPORT_DATABASE_URL", "SUPPORT_DATABASE_URL"] as const) {
      const pool = createPool(logins.url(key), { max: 1 });
      opened.push(pool);
      await expect(pool.query("SELECT identity.read_registration_country($1)", [randomUUID()]), key).rejects.toMatchObject({ code: "42501" });
    }
    // The function is the only way: the billing role holds no right on the table itself.
    expect((await database.pool.query<{ privilege: string }>(`SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS privilege
      WHERE has_table_privilege('debateai_billing_runtime','identity.registration_region',privilege)`)).rows).toEqual([]);
    // Its shape: a STABLE definer with the search path pinned, owned as identity.read_age_check_outcome is.
    expect((await database.pool.query(`SELECT p.provolatile AS volatility, p.prosecdef AS definer, p.proconfig AS config,
        pg_get_userbyid(p.proowner) = (SELECT pg_get_userbyid(d.proowner) FROM pg_proc AS d WHERE d.oid='identity.read_age_check_outcome(uuid)'::regprocedure) AS same_owner
      FROM pg_proc AS p WHERE p.oid=$1::regprocedure`, [READER])).rows).toEqual([{ volatility: "s", definer: true, config: ["search_path=pg_catalog"], same_owner: true }]);
  });

  it("on the production logins: api-runtime reads its own account's country and is refused another's", async () => {
    const production = await logins.production();
    const system = createPool(production.url("api-system"), { max: 2 });
    const runtime = createPool(production.url("api-runtime"), { max: 2, crossAccount: system });
    opened.push(runtime, system);
    expect(await asked(runtime, ana.token, ana.ownerRef)).toBe("RO");
    await expect(asked(runtime, tex.token, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  }, 180_000);
});
