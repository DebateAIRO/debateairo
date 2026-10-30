/**
 * Row-level security S01, V-16 (default binding; REV-S01-p1-product §7, W2 of probes/REV-S01-p1-product/fixtures/
 * rev-product-walk.test.ts): V's two TEST accounts, made by the R43 seam (`createRlsTestAccounts`, V-6) on the T1 pools
 * `loginApiPools` builds as apps/api/src/main.ts builds them, each sign in over HTTP — POST /v1/auth/login with the
 * password, then with a TOTP code computed from the account's otpauth URI — and every gate route the app reads before
 * it shows a page answers "nothing owed" under the real logins: GET /v1/session, the age confirmation (apps/ui/app/
 * page.tsx), the sensitive-data consent, the legal status (LegalAcceptGate's must_accept) and Settings' session list.
 * None of these routes is requested by an R21 file (PLAN.md §8 rows 58, 69, 71, 79).
 *
 * The property: inside a signed-in request the database derives the request's account from its session credential, so
 * the account's own rows are visible on the T1 login. With the credential dropped (REV mutant M1:
 * setRequestCredential stores null, packages/db/src/account-context.ts) the legal status lists TERMS and PRIVACY as
 * owed and the session list is empty, and this test fails.
 *
 * W1 of the probe (main.ts's database-roles attestations run outside a request on the wired pools) is left out: what
 * those attestations measure is COR-B1's surface (t_25f52da5), FIX-S01-p1b's.
 */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AcceptanceRepository, migrate } from "@debateai/db";
import { decodeBase32, totpCodeAtStep } from "@debateai/crypto";
import { loadBootstrapRegister, persistBootstrapRegister } from "@debateai/register";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RepositoryLegalAcceptanceApplication } from "../../apps/api/src/legal.js";
import {
  createRlsTestAccounts, openRlsAccountServices, readRlsTestAccountsFile, rlsWaitForTotpStepAfter,
  type RlsAccountServices, type RlsTestAccountSecrets, type RlsTestAccountsFile
} from "../../tools/rls/test-accounts.js";
import { loginApiPools, provisionRlsLogins, type ApiTestPools } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const ORIGIN = "https://localhost:5200";
let database: TestDatabase;
let pools: ApiTestPools;
let custodyRoot: string;
let made: RlsTestAccountsFile;
let secrets: Readonly<Record<"A" | "B", RlsTestAccountSecrets>>;
let services: RlsAccountServices;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(database.pool, bootstrap);
  pools = await loginApiPools(database);
  custodyRoot = await mkdtemp(join(tmpdir(), "rls-walk-custody-"));
  await chmod(custodyRoot, 0o700);
  for (const directory of ["secrets", "user-deks"]) await mkdir(join(custodyRoot, directory), { mode: 0o700 });
  for (const file of ["kek.bin", "blind-index-key.bin", "audit-source-ip-salt.bin", "records-key.bin"]) {
    await writeFile(join(custodyRoot, "secrets", file), randomBytes(32), { mode: 0o600 });
  }
  const options = { custodyRoot, registerVersion: bootstrap.registerVersion };
  made = await createRlsTestAccounts({ runtime: pools.runtime, authorization: pools.authorization }, options);
  secrets = await readRlsTestAccountsFile(made.path);
  services = await openRlsAccountServices({ runtime: pools.runtime, authorization: pools.authorization }, options);
}, 420_000);

afterAll(async () => {
  await services?.close();
  if (database !== undefined) await (await provisionRlsLogins(database)).end();
  await database?.stop();
  if (custodyRoot !== undefined) await rm(custodyRoot, { recursive: true, force: true });
});

/** The account's last accepted TOTP step (superuser read; -1 when none), so the code this test sends is a fresh one. */
async function lastAcceptedStep(userId: string): Promise<number> {
  return Number((await database.pool.query<{ step: string | null }>(
    "SELECT last_accepted_step::text AS step FROM identity.mfa_factor WHERE user_id=$1 AND factor_type='totp' AND state='active'",
    [userId])).rows[0]?.step ?? "-1");
}

/** Live sessions of the account in the database (superuser: every row), as Settings' list counts them. */
async function liveSessions(userId: string): Promise<number> {
  return Number((await database.pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL
       AND idle_expires_at>clock_timestamp() AND LEAST(absolute_expires_at,created_at+interval '720 hours')>clock_timestamp()`,
    [userId])).rows[0]!.n);
}

describe("V-16: V's two TEST accounts sign in on the real logins and meet no dialog", () => {
  it("A and B sign in over HTTP (password, then a TOTP code) and every gate route the app reads before a page answers that nothing is owed", async () => {
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: new AcceptanceRepository(pools.runtime),
      recordsKey: await readFile(join(custodyRoot, "secrets", "records-key.bin")),
      owedWithoutRecord: true
    });
    const api = buildApi({ application: {} as AskApplication, allowedOrigin: ORIGIN, sessions: services.sessions as never, legal } as never);
    try {
      const after = Math.max(await lastAcceptedStep(made.accounts[0].userId), await lastAcceptedStep(made.accounts[1].userId));
      const step = await rlsWaitForTotpStepAfter(after, services.totpPeriodSeconds);
      for (const record of made.accounts) {
        const account = secrets[record.label];
        const secret = decodeBase32(new URL(account.otpauthUri).searchParams.get("secret")!);
        const headers = { origin: ORIGIN, "user-agent": "rls-test-accounts-walk" };
        const first = await api.inject({ method: "POST", url: "/v1/auth/login", headers,
          payload: { email: account.email, password: account.password } });
        expect(first.statusCode, `${record.label} password ${first.body}`).toBe(202);
        const second = await api.inject({ method: "POST", url: "/v1/auth/login", headers,
          payload: { challenge_token: first.json<{ challenge_token: string }>().challenge_token, code: totpCodeAtStep(secret, step) } });
        expect(second.statusCode, `${record.label} second factor ${second.body}`).toBe(200);
        const cookie = (second.headers["set-cookie"] as string[]).map((value) => value.split(";")[0]).join("; ");
        const read = (url: string) => api.inject({ method: "GET", url, headers: { ...headers, cookie } });

        const session = await read("/v1/session");
        expect(session.statusCode, `${record.label} /v1/session ${session.body}`).toBe(200);
        const age = await read("/v1/auth/age-confirmation");
        expect(age.statusCode, `${record.label} age ${age.body}`).toBe(200);
        expect(age.json()).toEqual({ status: "confirmed" });
        const consent = await read("/v1/account/sensitive-data-consent");
        expect(consent.statusCode, `${record.label} consent ${consent.body}`).toBe(200);
        expect(consent.json()).toEqual({ status: "given" });
        const legalStatus = await read("/v1/account/legal-status?locale=en");
        expect(legalStatus.statusCode, `${record.label} legal-status ${legalStatus.body}`).toBe(200);
        expect(legalStatus.json()).toEqual({ must_accept: [] });
        const sessions = await read("/v1/auth/sessions");
        expect(sessions.statusCode, `${record.label} sessions ${sessions.body}`).toBe(200);
        const live = await liveSessions(record.userId);
        expect(live).toBeGreaterThan(0);
        expect(sessions.json<{ sessions: readonly unknown[] }>().sessions).toHaveLength(live);
      }
    } finally {
      await api.close();
    }
  }, 240_000);
});
