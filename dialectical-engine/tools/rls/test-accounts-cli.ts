/**
 * Row-level security S01 — `pnpm run rls:test-accounts` (PLAN S8.2; SPEC-v4 R43, P2, P3; DECISIONS D15, D22, D44, D53,
 * D57, D68). Makes V's TEST accounts A and B on the `rls` stack, and on no other database.
 *
 * It reads the stack profile and the custody root through loadDevelopmentCommandEnvironment() (the one reader of the
 * process environment, D53) as apps/runner/src/dev-database-principals-cli.ts does, and refuses — printing
 * `RLS_TEST_ACCOUNTS_REFUSED <reason>`, writing nothing and opening no database connection — unless the profile's
 * compose project is exactly `debateai-v3-rls` (V's `debateai-v3` and the live `debateai-v3-support-preview` included).
 * Then it builds the two pools as apps/api/src/main.ts wires `pool` and `authorizationPool` — the custody root's
 * DATABASE_URL / AUTHORIZATION_DATABASE_URL, each with its system login (API_SYSTEM_DATABASE_URL /
 * API_AUTHORIZATION_SYSTEM_DATABASE_URL) as cross-account target, every URL on 127.0.0.1 and the profile's Postgres
 * port — reads the register version the stack runs from the custody root's register receipt, calls the seam and prints
 * only `RLS_TEST_ACCOUNTS_FILE=<absolute path>`. Outside any request scope every statement runs on the system logins.
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { createPool, type Pool } from "@debateai/db";
import { loadDevelopmentCommandEnvironment, registerVersionToSafeLegacyNumber } from "@debateai/register";
import { loadDevelopmentAuthStackProfile } from "../../apps/runner/src/dev-auth-stack-profile.js";
import { readDevelopmentDeploymentRegisterReceipt } from "../../apps/runner/src/dev-deployment-register.js";
import { resolveDevCustodyRoot } from "../../deploy/dev-auth/custody-root.mjs";
import { createRlsTestAccounts } from "./proof.js";

/** The only compose project this command may reach (SPEC-v4 R43). */
const RLS_COMPOSE_PROJECT = "debateai-v3-rls";
const CREDENTIAL_FILE = "database-principals.env";
/** The four logins the two pools connect as, by the credential file's keys (apps/runner/src/dev-database-principals.ts). */
const LOGINS = Object.freeze({
  DATABASE_URL: "debateai_dev_runtime",
  API_SYSTEM_DATABASE_URL: "debateai_dev_api_system",
  AUTHORIZATION_DATABASE_URL: "debateai_dev_authorization",
  API_AUTHORIZATION_SYSTEM_DATABASE_URL: "debateai_dev_authorization_system"
} as const);

async function readCredentialFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => {
    throw new TypeError("RLS_TEST_ACCOUNTS_CREDENTIAL_MISSING");
  });
  try {
    const facts = await handle.stat();
    if (!facts.isFile() || facts.nlink !== 1 || (facts.mode & 0o777) !== 0o600 || facts.size < 1 || facts.size > 65_536
      || (typeof process.getuid === "function" && facts.uid !== process.getuid())) {
      throw new TypeError("RLS_TEST_ACCOUNTS_CREDENTIAL_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

/** The four URLs, each checked against its login, 127.0.0.1 and the profile's Postgres port. */
function databaseUrls(source: string, postgresPort: number): Readonly<Record<keyof typeof LOGINS, string>> {
  const values = new Map(source.split("\n").filter((line) => line !== "").map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)] as const;
  }));
  const urls = {} as Record<keyof typeof LOGINS, string>;
  for (const [key, login] of Object.entries(LOGINS) as [keyof typeof LOGINS, string][]) {
    const raw = values.get(key);
    let url: URL;
    try { url = new URL(raw ?? ""); } catch { throw new TypeError("RLS_TEST_ACCOUNTS_CREDENTIAL_INVALID"); }
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.hostname !== "127.0.0.1"
      || url.port !== String(postgresPort) || decodeURIComponent(url.username) !== login || url.search !== "") {
      throw new TypeError("RLS_TEST_ACCOUNTS_CREDENTIAL_INVALID");
    }
    urls[key] = raw!;
  }
  return Object.freeze(urls);
}

function code(error: unknown): string {
  const message = (error as { code?: unknown; message?: unknown })?.code ?? (error as { message?: unknown })?.message;
  return typeof message === "string" && /^[A-Z][A-Z0-9_]{2,63}$/u.test(message) ? message : "ERROR";
}

async function runRlsTestAccountsCli(out: (line: string) => void): Promise<number> {
  let environment: Readonly<Record<string, string>>;
  let profile: ReturnType<typeof loadDevelopmentAuthStackProfile>;
  try {
    environment = loadDevelopmentCommandEnvironment();
    profile = loadDevelopmentAuthStackProfile(environment);
  } catch {
    out("RLS_TEST_ACCOUNTS_REFUSED profile_invalid");
    return 2;
  }
  if (profile.composeProjectName !== RLS_COMPOSE_PROJECT) {
    out(`RLS_TEST_ACCOUNTS_REFUSED compose_project=${profile.composeProjectName}`);
    return 2;
  }
  const pools: Pool[] = [];
  try {
    const custodyRoot = resolveDevCustodyRoot(process.cwd(), environment);
    const urls = databaseUrls(await readCredentialFile(join(custodyRoot, CREDENTIAL_FILE)), profile.postgresPort);
    const registerVersion = registerVersionToSafeLegacyNumber(
      (await readDevelopmentDeploymentRegisterReceipt(process.cwd())).registerVersion);
    const pool = (url: string, options: Parameters<typeof createPool>[1] = {}): Pool => {
      const created = createPool(url, options);
      pools.push(created);
      return created;
    };
    const runtime = pool(urls.DATABASE_URL, { crossAccount: pool(urls.API_SYSTEM_DATABASE_URL) });
    const authorization = pool(urls.AUTHORIZATION_DATABASE_URL, { crossAccount: pool(urls.API_AUTHORIZATION_SYSTEM_DATABASE_URL) });
    const made = await createRlsTestAccounts({ runtime, authorization }, { custodyRoot, registerVersion });
    out(`RLS_TEST_ACCOUNTS_FILE=${made.path}`);
    return 0;
  } catch (error) {
    out(`RLS_TEST_ACCOUNTS_FAILED ${code(error)}`);
    return 1;
  } finally {
    for (const created of pools.reverse()) await created.end().catch(() => undefined);
  }
}

process.exitCode = await runRlsTestAccountsCli((line) => { console.log(line); });
