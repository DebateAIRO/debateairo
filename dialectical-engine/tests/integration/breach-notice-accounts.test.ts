import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt, FileUserDekStore, generateDek, loadKek } from "@debateai/crypto";
import { migrate, type Pool } from "@debateai/db";
import { parseBreachNoticeEnvironment } from "@debateai/register";
import { seedDevelopmentDeploymentRegister } from "../../apps/runner/src/dev-deployment-register.js";
import { PostgresBreachNoticeAccounts } from "../../apps/api/src/breach-notice/accounts.js";
import { openBreachNoticeSite, runBreachNoticeCli } from "../../apps/api/src/breach-notice/cli.js";
import { assertBillingOperatorConnection } from "../../apps/api/src/billing/operator-connection.js";
import { parseAccountList, selectAccounts } from "../../apps/api/src/breach-notice/selection.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// The breach-notice command's two database reads (apps/api/src/breach-notice/accounts.ts), against the real migrations
// and on the login the command uses on the server: the API's system login, provisioned by the product's own provisioner.
// And the runbook's BREACHLIST step (docs/operations/breach-runbook.md part 6.2): its SQL is read out of the runbook and
// run here, so the list it writes is the list the command reads. The last block runs the whole command as the server
// would: the register's mail limit, real key files, the day's count in the database, and the development mail capture in
// the mail program's place. Every address and number here is a made-up test value.

const timeout = 600_000;
const RUNBOOK = "docs/operations/breach-runbook.md";

let database: TestDatabase;
let logins: RlsLogins;
let system: Pool;
let root: string;
let registerVersion: string;
let A: RlsTestAccount, B: RlsTestAccount, C: RlsTestAccount;
const deks = new Map<string, Buffer>();
const users = Object.freeze({
  exists: async (userId: string) => deks.has(userId),
  load: async (userId: string) => Buffer.from(deks.get(userId) ?? (() => { throw new TypeError("NO_KEY"); })()),
  store: async () => { throw new TypeError("UNUSED"); }
}) as never;

/** The account's address under a key this test keeps, with the AAD sign-up writes it under. */
async function giveAddress(account: RlsTestAccount, address: string): Promise<void> {
  const dek = generateDek();
  deks.set(account.userId, Buffer.from(dek));
  await database.pool.query(`UPDATE identity."user" SET email_ciphertext=$2::jsonb WHERE user_id=$1`, [account.userId, JSON.stringify(encrypt(dek,
    Buffer.from(address), ["identity", "user.email_ciphertext", account.userId, "run:none", account.userId, `user-dek:${account.userId}`, "1"]))]);
}

async function acceptTerms(account: RlsTestAccount, locale: string, acceptedAt: string): Promise<void> {
  await database.pool.query(`INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,
      evidence_ciphertext,key_id) VALUES($1,$2,'TERMS','2.3',$3,$4,'SIGN_UP',$5,$6,$7)`,
  [randomUUID(), account.ownerRef, "a".repeat(64), locale, acceptedAt, Buffer.alloc(40, 1), "0".repeat(16)]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  root = mkdtempSync(join(tmpdir(), "debateai-breach-notice-"));
  mkdirSync(join(root, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  registerVersion = (await seedDevelopmentDeploymentRegister({
    adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot: root
  })).registerVersion;
  logins = await provisionRlsLogins(database);
  system = (await logins.production()).loginPool("api-system", 1);
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  C = await seedSessionAccount(database.pool, "C");
  await giveAddress(A, "anna@example.test");
  await giveAddress(B, "ben@example.test");
  await acceptTerms(A, "ro", "2026-10-01T10:00:00Z");
  await acceptTerms(A, "fi", "2026-11-01T10:00:00Z");
  // A language no mail is written in: it never decides the mail's language.
  await acceptTerms(A, "zz", "2026-11-10T10:00:00Z");
  await database.pool.query("INSERT INTO identity.registration_region(user_id,country_code,us_state) VALUES($1,'KR',NULL),($2,'US','NY')", [A.userId, B.userId]);
}, timeout);

afterAll(async () => {
  await logins?.end();
  await database?.stop();
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
}, timeout);

describe("the breach-notice command's reads, on the API's system login", () => {
  it("is the login the command insists on in production", async () => {
    await expect(assertBillingOperatorConnection(system, { production: true, readOnly: false })).resolves.toBeUndefined();
  }, timeout);

  it("reads each account's state and language: the Terms last accepted in a language mail is written in, English when there is none", async () => {
    const accounts = new PostgresBreachNoticeAccounts(system, users);
    const facts = await accounts.facts([A.userId, B.userId, C.userId, randomUUID()]);
    expect([...facts].sort(([left], [right]) => (left < right ? -1 : 1))).toEqual([
      [A.userId, { state: "active", language: "fi" }],
      [B.userId, { state: "active", language: "en" }],
      [C.userId, { state: "active", language: "en" }]
    ].sort(([left], [right]) => (String(left) < String(right) ? -1 : 1)));
  }, timeout);

  it("opens the address the account has now, and answers nothing for an account with no key or no row", async () => {
    const accounts = new PostgresBreachNoticeAccounts(system, users);
    expect(await accounts.address(A.userId)).toBe("anna@example.test");
    await giveAddress(A, "anna.new@example.test");
    expect(await accounts.address(A.userId)).toBe("anna.new@example.test");
    // C's key is not in the store: the account is on its way out, its key already destroyed.
    expect(await accounts.address(C.userId)).toBeNull();
    expect(await accounts.address(randomUUID())).toBeNull();
  }, timeout);

  it("the API's logins cannot read the declared countries, which is why the list is a file", async () => {
    const rows = (await database.pool.query<{ login: string; can: boolean }>(`SELECT login, has_table_privilege(login, 'identity.registration_region', 'SELECT') AS can
      FROM unnest(ARRAY['debateai_prod_api_system','debateai_prod_api_runtime']) AS login`)).rows;
    expect(rows).toEqual([{ login: "debateai_prod_api_system", can: false }, { login: "debateai_prod_api_runtime", can: false }]);
    await expect(system.query("SELECT count(*) FROM identity.registration_region")).rejects.toMatchObject({ code: "42501" });
  }, timeout);
});

describe("the whole command, as the server runs it", () => {
  const CAPTURE = resolve("deploy/dev-auth/sendmail-capture.mjs");
  const CAPTURE_DIR = "DEBATEAI_DEV_MAIL_CAPTURE_DIR";
  const captured = (): string[] => {
    try {
      return readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml")).map((name) => readFileSync(join(root, "mail", name), "utf8"));
    } catch { return []; }
  };
  const headerOf = (message: string, name: string): string | undefined => new RegExp(`^${name}: (.*)\r$`, "mu").exec(message)?.[1];

  it("prints the plan, then writes to each chosen account once, counts each mail against the day and keeps the log", async () => {
    const original = process.env[CAPTURE_DIR];
    process.env[CAPTURE_DIR] = join(root, "mail");
    try {
      // Key files as the server holds them: the master key, the blocked-address key, and each account's own key under the master key.
      const keys = join(root, "keys");
      mkdirSync(keys, { mode: 0o700 });
      for (const name of ["kek.key", "blind-index.key"]) {
        writeFileSync(join(keys, name), randomBytes(32), { mode: 0o600 });
        chmodSync(join(keys, name), 0o600);
      }
      const store = new FileUserDekStore(join(root, "user-deks"), loadKek(join(keys, "kek.key")));
      await giveAddress(A, "anna@example.test");
      for (const account of [A, B]) await store.store(account.userId, deks.get(account.userId)!);
      await database.pool.query("DELETE FROM identity.outbound_mail_daily_count");

      const production = await logins.production();
      const environment = parseBreachNoticeEnvironment({
        DATABASE_URL: production.url("api-runtime"), API_SYSTEM_DATABASE_URL: production.url("api-system"), NODE_ENV: "test",
        REGISTER_VERSION: registerVersion, KEK_PATH: join(keys, "kek.key"), USER_DEK_STORE_PATH: join(root, "user-deks"),
        BLIND_INDEX_KEY_PATH: join(keys, "blind-index.key"), MAIL_SENDMAIL_PATH: CAPTURE, MAIL_FROM: "noreply@localhost.test"
      });
      const texts = join(root, "texts"), out = join(root, "out"), list = join(root, "accounts.txt");
      mkdirSync(texts);
      mkdirSync(out);
      writeFileSync(join(texts, "en.txt"), "Subject: Notice of Data Breach\n\nWhat happened.\n\nWrite to privacy@dezbatere.ro.\n");
      writeFileSync(join(texts, "fi.txt"), "Subject: Ilmoitus tietoturvaloukkauksesta\n\nMitä tapahtui.\n\nKirjoita osoitteeseen privacy@dezbatere.ro.\n");
      writeFileSync(list, `${A.userId}|KR|-\n${B.userId}|US|NY\n${C.userId}|-|-\n`);
      const run = async (args: readonly string[]) => {
        let stdout = "", stderr = "";
        const code = await runBreachNoticeCli(["--accounts", list, "--texts", texts, "--out", out, ...args],
          { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } },
          () => openBreachNoticeSite(environment, (line) => { stderr += line; }));
        return { code, stdout, stderr };
      };
      const sentToday = async (): Promise<unknown> =>
        (await database.pool.query("SELECT standard_sent, security_sent FROM identity.outbound_mail_daily_count")).rows;

      const plan = await run(["--country", "KR", "--us-state", "NY"]);
      expect({ code: plan.code, stderr: plan.stderr }).toEqual({ code: 0, stderr: "" });
      expect(plan.stdout).toContain("Accounts chosen: 2");
      expect(plan.stdout).toContain("Today's mail limit is 2000; 0 were handed over so far today, so there is room for 2000.");
      expect(plan.stdout).toContain("Nothing was sent.");
      expect(captured()).toHaveLength(0);
      expect(await sentToday()).toEqual([]);

      const sent = await run(["--country", "KR", "--us-state", "NY", "--confirm"]);
      expect({ code: sent.code, stderr: sent.stderr }, sent.stdout).toEqual({ code: 0, stderr: "" });
      const mails = captured();
      expect(mails.map((message) => [headerOf(message, "To"), headerOf(message, "Content-Language"), headerOf(message, "From")]).sort()).toEqual([
        ["anna@example.test", "fi", "noreply@localhost.test"],
        ["ben@example.test", "en", "noreply@localhost.test"]
      ]);
      expect(await sentToday()).toEqual([{ standard_sent: 0, security_sent: 2 }]);
      expect(readFileSync(join(out, "sent-accounts.txt"), "utf8").trim().split("\n").sort()).toEqual([A.userId, B.userId].sort());
      const log = readFileSync(join(out, "breach-notice-log.md"), "utf8");
      expect(log).toContain("Written to in this run: 2");
      expect(log).toContain("| KR | 1 | 1 | 0 | 0 |");
      expect(log).toContain("| US-NY | 1 | 1 | 0 | 0 |");
      expect(`${log}${sent.stdout}`).not.toMatch(/@example\.test/u);
      expect(log).not.toContain(A.userId);

      // The same people again, now with everyone: nobody is written to twice. The account with no key left is counted under its
      // reason, and does not keep the job open: there is nobody left to write to.
      const again = await run(["--all", "--confirm"]);
      expect(again.code, again.stdout).toBe(0);
      expect(again.stdout).not.toContain("NOT EVERYONE WAS WRITTEN TO");
      expect(captured()).toHaveLength(2);
      expect(await sentToday()).toEqual([{ standard_sent: 0, security_sent: 2 }]);
      expect(again.stdout).toContain("Written to in an earlier run: 2");
      expect(again.stdout).toContain("| The account no longer exists | 1 |");
    } finally {
      if (original === undefined) delete process.env[CAPTURE_DIR];
      else process.env[CAPTURE_DIR] = original;
    }
  }, timeout);
});

describe("the runbook's BREACHLIST step", () => {
  it("writes the list the command reads: every account that is not deleted, with its declared country and state", async () => {
    const runbook = readFileSync(RUNBOOK, "utf8");
    const step = /# BREACHLIST:[\s\S]*?psqlq "(SELECT [^\n]*?)" > "\$W\/accounts\.txt"/u.exec(runbook)?.[1];
    expect(step, "the runbook's BREACHLIST step").toBeDefined();
    const sql = step!.replaceAll('\\"', '"');
    expect(sql).not.toMatch(/[`$\\]/u);
    await database.pool.query(`UPDATE identity."user" SET state='deleted' WHERE user_id=$1`, [C.userId]).catch(() => undefined);
    const deleted = (await database.pool.query<{ state: string }>(`SELECT state FROM identity."user" WHERE user_id=$1`, [C.userId])).rows[0]?.state === "deleted";
    // psql -XAt prints one row a line, the fields joined by "|".
    const result = await database.pool.query({ text: sql, rowMode: "array" });
    const list = parseAccountList(`${(result.rows as unknown[][]).map((row) => row.join("|")).join("\n")}\n`);
    const mine = list.filter((account) => [A.userId, B.userId, C.userId].includes(account.userId));
    expect(mine).toEqual([
      { userId: A.userId, country: "KR", usState: null },
      { userId: B.userId, country: "US", usState: "NY" },
      ...(deleted ? [] : [{ userId: C.userId, country: null, usState: null }])
    ].sort((left, right) => (left.userId < right.userId ? -1 : 1)));
    expect(selectAccounts(list, { all: false, countries: ["KR"], usStates: ["NY"], undeclared: false, ids: null }).chosen.map((account) => account.userId).sort())
      .toEqual([A.userId, B.userId].sort());
  }, timeout);
});
