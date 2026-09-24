// tests/unit/dl7-f6-support-cli-url-grammar.test.ts
// DL7-F6: the production support CLIs could not reach the VPS database. Their credential grammar
// refused every query string, and the VPS pg_hba admits only two shapes — the unix socket
// (`?host=/var/run/postgresql`) and verified TLS on loopback
// (`?sslmode=verify-full&sslrootcert=…`) — both of which need one. A URL with no query is
// plaintext TCP, which pg_hba rejects. Each loader is driven through a real private credential
// file, exactly as an operator's command reads it.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProductionSupportConfigCliCredentials } from
  "../../apps/runner/src/support-config-cli-credentials.js";
import { loadProductionSupportStatusCliCredentials } from
  "../../apps/runner/src/support-status-cli-credentials.js";

const SECRET = "s".repeat(40);
const SOCKET = "?host=/var/run/postgresql";
const VERIFIED_TLS = "?sslmode=verify-full&sslrootcert=/etc/debateai/postgres-tls/ca.crt";

const ACCEPTED = [
  ["no query (today's shape)", ""],
  ["the unix socket", SOCKET],
  ["verified TLS on loopback", VERIFIED_TLS],
  ["verified TLS, parameters in the other order",
    "?sslrootcert=/etc/debateai/postgres-tls/ca.crt&sslmode=verify-full"]
] as const;

const REFUSED = [
  ["sslmode=disable", "?sslmode=disable"],
  ["sslmode=require (unverified)", "?sslmode=require"],
  ["sslmode=no-verify", "?sslmode=no-verify"],
  ["verify-full without a root certificate", "?sslmode=verify-full"],
  ["a relative root certificate", "?sslmode=verify-full&sslrootcert=ca.crt"],
  ["verify-full plus a downgrade flag",
    `${VERIFIED_TLS}&uselibpqcompat=true`],
  ["a relative socket directory", "?host=var/run/postgresql"],
  ["a socket plus a TLS downgrade", `${SOCKET}&sslmode=disable`],
  ["a repeated host", `${SOCKET}&host=/tmp`],
  ["a host list", "?host=/var/run/postgresql,/tmp"],
  ["an options parameter", "?options=-c%20statement_timeout%3D0"]
] as const;

let root: string;
let counter = 0;

async function privateFile(contents: string): Promise<string> {
  counter += 1;
  const path = join(root, `credential-${counter}.json`);
  await writeFile(path, contents, { mode: 0o600 });
  return path;
}

function statusEnvelope(query: string): string {
  return JSON.stringify({
    format: "debateai.production-database-principal-credentials.v1",
    credentials: [{
      principalId: "api-support",
      databaseUrl: `postgresql://debateai_prod_api_support:${SECRET}@localhost/debateai${query}`
    }]
  });
}

function configCredential(query: string): string {
  return JSON.stringify({
    databaseUrl: `postgresql://debateai_prod_support_config_operator:${SECRET}@localhost/debateai${query}`,
    validUntil: new Date(Date.now() + 10 * 60 * 1_000).toISOString()
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dl7-f6-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("DL7-F6: the support-status / support-shred data credential", () => {
  it.each(ACCEPTED)("accepts %s", async (_name, query) => {
    const loaded = await loadProductionSupportStatusCliCredentials(
      await privateFile(statusEnvelope(query))
    );
    expect(loaded.supportDatabaseUrl.endsWith(`/debateai${query}`)).toBe(true);
  });

  it.each(REFUSED)("refuses %s", async (_name, query) => {
    await expect(loadProductionSupportStatusCliCredentials(
      await privateFile(statusEnvelope(query))
    )).rejects.toThrow("SUPPORT_STATUS_DATABASE_URL_INVALID");
  });
});

describe("DL7-F6: the JIT support-config operator credential", () => {
  it.each(ACCEPTED)("accepts %s", async (_name, query) => {
    const loaded = await loadProductionSupportConfigCliCredentials(
      await privateFile(configCredential(query))
    );
    expect(loaded.databaseUrl.endsWith(`/debateai${query}`)).toBe(true);
  });

  it.each(REFUSED)("refuses %s", async (_name, query) => {
    await expect(loadProductionSupportConfigCliCredentials(
      await privateFile(configCredential(query))
    )).rejects.toThrow("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  });
});
