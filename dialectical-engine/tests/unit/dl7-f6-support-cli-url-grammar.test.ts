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

// Each case is [name, query, host]. The host defaults to `localhost`.
const ACCEPTED: ReadonlyArray<readonly [string, string, string?]> = [
  ["no query, on loopback localhost (today's shape)", ""],
  ["no query, on 127.0.0.1", "", "127.0.0.1"],
  ["no query, on ::1", "", "[::1]"],
  ["the unix socket the kit uses", SOCKET],
  ["the Debian/Ubuntu socket directory", "?host=/run/postgresql"],
  ["verified TLS on loopback", VERIFIED_TLS, "127.0.0.1"],
  ["verified TLS, parameters in the other order",
    "?sslrootcert=/etc/debateai/postgres-tls/ca.crt&sslmode=verify-full", "127.0.0.1"]
];

const REFUSED: ReadonlyArray<readonly [string, string, string?]> = [
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
  ["an options parameter", "?options=-c%20statement_timeout%3D0"],
  // Fix round 1 (review of Task 14): the grammar is pinned, not merely "absolute".
  ["a socket path that climbs out with ..", "?host=/var/run/postgresql/../../tmp"],
  ["a percent-encoded parameter name", "?%68ost=/var/run/postgresql"],
  ["a percent-encoded socket path", "?host=%2Fvar%2Frun%2Fpostgresql"],
  ["sslrootcert=system (the platform store, not the kit's CA)",
    "?sslmode=verify-full&sslrootcert=system"],
  ["an upper-case parameter name", "?HOST=/var/run/postgresql"],
  ["an upper-case sslmode value", "?sslmode=VERIFY-FULL&sslrootcert=/etc/debateai/postgres-tls/ca.crt"],
  ["a world-writable socket directory", "?host=/tmp"],
  ["an arbitrary absolute socket directory", "?host=/home/operator/sockets"],
  ["an empty parameter", `${SOCKET}&`],
  ["no query to an off-box host (plaintext TCP)", "", "db.example.com"],
  ["no query to a private address", "", "10.0.0.5"],
  ["the socket shape on a non-loopback host name", SOCKET, "db.example.com"]
];

let root: string;
let counter = 0;

async function privateFile(contents: string): Promise<string> {
  counter += 1;
  const path = join(root, `credential-${counter}.json`);
  await writeFile(path, contents, { mode: 0o600 });
  return path;
}

function statusEnvelope(query: string, host = "localhost"): string {
  return JSON.stringify({
    format: "debateai.production-database-principal-credentials.v1",
    credentials: [{
      principalId: "api-support",
      databaseUrl: `postgresql://debateai_prod_api_support:${SECRET}@${host}/debateai${query}`
    }]
  });
}

function configCredential(query: string, host = "localhost"): string {
  return JSON.stringify({
    databaseUrl: `postgresql://debateai_prod_support_config_operator:${SECRET}@${host}/debateai${query}`,
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
  it.each(ACCEPTED)("accepts %s", async (_name, query, host) => {
    const loaded = await loadProductionSupportStatusCliCredentials(
      await privateFile(statusEnvelope(query, host))
    );
    expect(loaded.supportDatabaseUrl.endsWith(`/debateai${query}`)).toBe(true);
  });

  it.each(REFUSED)("refuses %s", async (_name, query, host) => {
    await expect(loadProductionSupportStatusCliCredentials(
      await privateFile(statusEnvelope(query, host))
    )).rejects.toThrow("SUPPORT_STATUS_DATABASE_URL_INVALID");
  });
});

describe("DL7-F6: the JIT support-config operator credential", () => {
  it.each(ACCEPTED)("accepts %s", async (_name, query, host) => {
    const loaded = await loadProductionSupportConfigCliCredentials(
      await privateFile(configCredential(query, host))
    );
    expect(loaded.databaseUrl.endsWith(`/debateai${query}`)).toBe(true);
  });

  it.each(REFUSED)("refuses %s", async (_name, query, host) => {
    await expect(loadProductionSupportConfigCliCredentials(
      await privateFile(configCredential(query, host))
    )).rejects.toThrow("SUPPORT_CONFIG_DATABASE_URL_INVALID");
  });
});
