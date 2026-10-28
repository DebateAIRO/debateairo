/**
 * Row-level security S01, PLAN S8.2 (SPEC-v4 R43, P2, P3; DECISIONS D44, D57, D68): the test-only seam
 * `createRlsTestAccounts` on a throwaway embedded database, called with the T1 pools `loginApiPools(db)` builds the way
 * apps/api/src/main.ts builds `pool` and `authorizationPool` (never the harness superuser), and the CLI's refuse rule.
 *
 * S8.2-a both accounts end in the state a finished sign-up and a given first-debate consent leave; during the call the
 *        T1 pools open no connection and every system connection reports its own session_user (D57).
 * S8.2-b the 0600 file under the custody root holds exactly e-mail, password, otpauth URI and two unused recovery codes
 *        per account, and the returned object holds none of the secrets.
 * S8.2-c A signs in through SessionService with the file's password and a TOTP code computed from the file's URI.
 * S8.2-d the CLI under the profiles unset, "default" and "support-preview" exits non-zero, prints
 *        RLS_TEST_ACCOUNTS_REFUSED <reason>, writes nothing and opens no database connection.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { AcceptanceRepository, migrate } from "@debateai/db";
import { decodeBase32, totpCodeAtStep } from "@debateai/crypto";
import { loadBootstrapRegister, persistBootstrapRegister } from "@debateai/register";
import { RepositoryLegalAcceptanceApplication } from "../../apps/api/src/legal.js";
import {
  createRlsTestAccounts,
  openRlsAccountServices,
  type RlsAccountServices,
  type RlsTestAccountsFile
} from "../../tools/rls/test-accounts.js";
import { loginApiPools, provisionRlsLogins, type ApiTestPools } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIELDS = ["EMAIL", "PASSWORD", "OTPAUTH_URI", "RECOVERY_CODE_1", "RECOVERY_CODE_2"] as const;
const SOURCE = Object.freeze({ ip: "127.0.0.1", userAgent: "rls-test-accounts.test", requestId: "rls-test-accounts.test" });

type Watched = "runtime" | "authorization" | "system" | "authorizationSystem";

let database: TestDatabase;
let pools: ApiTestPools;
let custodyRoot: string;
let registerVersion: number;
let services: RlsAccountServices;
let made: RlsTestAccountsFile;
let fileValues: ReadonlyMap<string, string>;
const connects: Record<Watched, number> = { runtime: 0, authorization: 0, system: 0, authorizationSystem: 0 };
const sessionUsers: Record<Watched, string[]> = { runtime: [], authorization: [], system: [], authorizationSystem: [] };
const sessionUserReads: Promise<unknown>[] = [];
const directories: string[] = [];

async function privateDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await chmod(directory, 0o700);
  directories.push(directory);
  return directory;
}

/** The custody layout apps/runner/src/dev-secret-files.ts writes (the four files the seam reads, and the DEK store). */
async function throwawayCustodyRoot(): Promise<string> {
  const root = await privateDirectory("rls-test-accounts-custody-");
  for (const directory of ["secrets", "user-deks"]) await mkdir(join(root, directory), { mode: 0o700 });
  for (const file of ["kek.bin", "blind-index-key.bin", "audit-source-ip-salt.bin", "records-key.bin"]) {
    await writeFile(join(root, "secrets", file), randomBytes(32), { mode: 0o600 });
  }
  return root;
}

function parseFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.split("\n").filter((line) => line !== "").map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)] as const;
  }));
}

async function superuser<T extends Record<string, unknown>>(text: string, values: unknown[]): Promise<T[]> {
  return (await database.pool.query<T>(text, values)).rows;
}

async function waitForStepAfter(userId: string): Promise<number> {
  const [factor] = await superuser<{ step: string | null }>(
    "SELECT last_accepted_step::text AS step FROM identity.mfa_factor WHERE user_id=$1 AND factor_type='totp' AND state='active'",
    [userId]);
  const last = Number.parseInt(factor?.step ?? "-1", 10);
  for (;;) {
    const step = Math.floor(Date.now() / 30_000);
    if (step > last) return step;
    await new Promise((resolve) => setTimeout(resolve, (step + 1) * 30_000 - Date.now() + 50));
  }
}

function account(label: "A" | "B"): Readonly<{ email: string; password: string; uri: string; codes: readonly string[] }> {
  return Object.freeze({
    email: fileValues.get(`RLS_${label}_EMAIL`)!,
    password: fileValues.get(`RLS_${label}_PASSWORD`)!,
    uri: fileValues.get(`RLS_${label}_OTPAUTH_URI`)!,
    codes: Object.freeze([fileValues.get(`RLS_${label}_RECOVERY_CODE_1`)!, fileValues.get(`RLS_${label}_RECOVERY_CODE_2`)!])
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(database.pool, bootstrap);
  registerVersion = bootstrap.registerVersion;
  pools = await loginApiPools(database);
  custodyRoot = await throwawayCustodyRoot();
  // Each connection a watched pool opens during the call: its backend's session user, read by the superuser from
  // pg_stat_activity while the backend is alive (the connection itself is never queried, so nothing is interleaved).
  const listeners = (Object.keys(connects) as Watched[]).map((field) => {
    const listener = (client: PoolClient): void => {
      connects[field] += 1;
      sessionUserReads.push(database.pool.query<{ user: string }>(
        "SELECT usename::text AS user FROM pg_stat_activity WHERE pid = $1",
        [(client as unknown as { processID?: number | null }).processID ?? -1])
        .then((result) => { sessionUsers[field].push(result.rows[0]?.user ?? "<gone>"); }));
    };
    pools[field].on("connect", listener);
    return () => { pools[field].off("connect", listener); };
  });
  try {
    made = await createRlsTestAccounts({ runtime: pools.runtime, authorization: pools.authorization },
      { custodyRoot, registerVersion });
  } finally {
    for (const detach of listeners) detach();
  }
  await Promise.all(sessionUserReads);
  fileValues = parseFile(await readFile(made.path, "utf8"));
  services = await openRlsAccountServices({ runtime: pools.runtime, authorization: pools.authorization },
    { custodyRoot, registerVersion });
}, 420_000);

afterAll(async () => {
  await services?.close();
  if (database !== undefined) await (await provisionRlsLogins(database)).end();
  await database?.stop();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("rls:test-accounts — the seam on a throwaway database (PLAN S8.2)", () => {
  it("S8.2-a both accounts: state active, e-mail verified, no legal document left to accept, region and age recorded, TOTP active, readSensitiveDataConsent = \"given\"; during the call the runtime and authorization pools' own connections number 0 (totalCount 0) and every connection the system and authorizationSystem pools open reports session_user debateai_dev_api_system or debateai_dev_authorization_system", async () => {
    expect(made.accounts.map(({ label }) => label)).toEqual(["A", "B"]);
    expect(connects.runtime).toBe(0);
    expect(connects.authorization).toBe(0);
    expect(pools.runtime.totalCount).toBe(0);
    expect(pools.authorization.totalCount).toBe(0);
    expect(connects.system).toBeGreaterThan(0);
    expect(connects.authorizationSystem).toBeGreaterThan(0);
    expect([...new Set(sessionUsers.system)]).toEqual(["debateai_dev_api_system"]);
    expect([...new Set(sessionUsers.authorizationSystem)]).toEqual(["debateai_dev_authorization_system"]);
    const recordsKey = await readFile(join(custodyRoot, "secrets", "records-key.bin"));
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: new AcceptanceRepository(database.pool), recordsKey, owedWithoutRecord: true
    });
    for (const record of made.accounts) {
      const [user] = await superuser<{ state: string; owner_ref: string }>(
        `SELECT state,owner_ref::text AS owner_ref FROM identity."user" WHERE user_id=$1`, [record.userId]);
      expect(user?.state, record.label).toBe("active");
      expect(await superuser(`SELECT state,verified_at IS NOT NULL AS verified FROM identity.channel_binding
        WHERE user_id=$1 AND channel_type='email'`, [record.userId]), record.label)
        .toEqual([{ state: "verified", verified: true }]);
      expect(await legal.status(user!.owner_ref, "en"), record.label).toEqual([]);
      expect(await superuser("SELECT country_code,us_state FROM identity.registration_region WHERE user_id=$1",
        [record.userId]), record.label).toEqual([{ country_code: "RO", us_state: null }]);
      expect(await superuser("SELECT identity.read_age_check_outcome($1) AS outcome", [record.userId]), record.label)
        .toEqual([{ outcome: "passed" }]);
      expect(await superuser("SELECT factor_type,state FROM identity.mfa_factor WHERE user_id=$1", [record.userId]),
        record.label).toEqual([{ factor_type: "totp", state: "active" }]);
      expect(await services.sessions.readSensitiveDataConsent({
        session: { asker_id: `owner:${user!.owner_ref}`, session_id: "unused", caller_scope: "ASKER",
          ownership_provenance: "server_session", provisional_identity_model: false },
        userId: record.userId, ownerRef: user!.owner_ref, tokenHash: "unused", csrfTokenHash: "unused", authKind: "cookie"
      }), record.label).toBe("given");
    }
  });

  it("S8.2-b the file is 0600 under the custody root with exactly those fields and two unused recovery codes each", async () => {
    expect(dirname(made.path)).toBe(custodyRoot);
    expect((await stat(made.path)).mode & 0o777).toBe(0o600);
    expect([...fileValues.keys()]).toEqual(["A", "B"].flatMap((label) => FIELDS.map((field) => `RLS_${label}_${field}`)));
    for (const record of made.accounts) {
      const { email, password, uri, codes } = account(record.label);
      expect(email).toBe(record.email);
      expect(uri).toMatch(/^otpauth:\/\/totp\/[^?]+\?(?:.+&)?secret=[A-Z2-7]{32}(?:&|$)/u);
      expect(new Set(codes).size).toBe(2);
      for (const secret of [password, uri, ...codes]) expect(JSON.stringify(made)).not.toContain(secret);
      for (const code of codes) {
        const begun = await services.sessions.beginLogin({ email, password }, SOURCE);
        const login = await services.sessions.completeLogin({ challengeToken: begun.challengeToken, code }, SOURCE);
        expect(login.status, `${record.label} recovery code`).toBe("authenticated");
      }
      expect(await superuser(`SELECT count(*)::int AS consumed FROM identity.recovery_code
        WHERE user_id=$1 AND consumed_at IS NOT NULL`, [record.userId]), record.label).toEqual([{ consumed: 2 }]);
    }
  }, 120_000);

  it("S8.2-c a sign-in with A's password and a TOTP code computed from the URI succeeds through SessionService", async () => {
    const a = made.accounts[0];
    const { email, password, uri } = account("A");
    const secret = decodeBase32(new URL(uri).searchParams.get("secret")!);
    const step = await waitForStepAfter(a.userId);
    const begun = await services.sessions.beginLogin({ email, password }, SOURCE);
    const login = await services.sessions.completeLogin({ challengeToken: begun.challengeToken, code: totpCodeAtStep(secret, step) }, SOURCE);
    expect(login.status).toBe("authenticated");
    const session = await services.sessions.authenticate(login.sessionToken, SOURCE);
    expect(session?.userId).toBe(a.userId);
  }, 180_000);

  it.each([["unset", undefined, "debateai-v3"], ["default", "default", "debateai-v3"],
    ["support-preview", "support-preview", "debateai-v3-support-preview"]] as const)(
    "S8.2-d the CLI with the profile %s exits non-zero, prints RLS_TEST_ACCOUNTS_REFUSED <reason>, writes nothing, and opens no database connection",
    async (_name, profile, project) => {
      const root = await privateDirectory("rls-test-accounts-refused-");
      const probe = await privateDirectory("rls-test-accounts-probe-");
      const connectLog = join(probe, "connects.log");
      const hook = join(probe, "connect-hook.mjs");
      // Every TCP connect to a local host is recorded and refused before a packet leaves (the CLI must reach none).
      await writeFile(hook, `import net from "node:net";
import { appendFileSync } from "node:fs";
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect() hands its normalized [options, callback] pair over as one array argument.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === "object" && first !== null ? first : { port: first, host: args[1] };
  const host = options.host ?? "localhost";
  if (options.path === undefined && options.port !== undefined && ["127.0.0.1", "localhost", "::1"].includes(host)) {
    appendFileSync(${JSON.stringify(connectLog)}, JSON.stringify({ host, port: options.port }) + "\\n");
    process.nextTick(() => this.destroy(new Error("RLS_TEST_CONNECT_REFUSED")));
    return this;
  }
  return original.apply(this, args);
};
`);
      const environment: NodeJS.ProcessEnv = { ...process.env, DEBATEAI_DEV_CUSTODY_ROOT: root,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(hook).href}`.trim() };
      delete environment.DEBATEAI_DEV_AUTH_STACK_PROFILE;
      if (profile !== undefined) environment.DEBATEAI_DEV_AUTH_STACK_PROFILE = profile;
      const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
        // --reporter=silent: pnpm's own "[ELIFECYCLE] Command failed" line would otherwise join the CLI's stdout.
        const child = spawn("pnpm", ["--reporter=silent", "run", "rls:test-accounts"], { cwd: PRODUCT_ROOT, env: environment,
          stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, stdout }));
      });
      expect(result.code).not.toBe(0);
      expect(result.code).not.toBeNull();
      expect(result.stdout).toBe(`RLS_TEST_ACCOUNTS_REFUSED compose_project=${project}\n`);
      expect(await readdir(root)).toEqual([]);
      await expect(readFile(connectLog, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    }, 60_000);
});
