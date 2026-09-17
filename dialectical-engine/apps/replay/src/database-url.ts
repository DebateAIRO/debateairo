/**
 * L5-F3: the ceremony's connection string arrives on `process.argv`, so it never passes the
 * register loader that floors every `*_DATABASE_URL` — a remote replay target could carry the
 * operator's credential and every replayed verdict in clear.
 *
 * apps/replay is the isolated verifier: its only workspace edge is `published-arithmetic`, and
 * only the register loader may read the process environment (tools/orphan-audit). So the floor
 * lives here, self-contained and UNCONDITIONAL: the ceremony reads the production database by
 * definition, and a rule no environment can relax needs no environment. The rule is the
 * register's (`databaseUrlSatisfiesTlsFloor`, packages/register/src/runtime-environment.ts);
 * tests/unit/replay-database-url.test.ts holds the two copies to the same verdicts.
 *
 * pg 8 / pg-connection-string 2.14 honour only the URL: `verify-full` checks chain + hostname,
 * a private CA needs `sslrootcert=`, `uselibpqcompat` downgrades `require` to unverified,
 * `no-verify` and `ssl=0` disable verification. Loopback and unix-socket hosts are exempt.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export function replayCeremonyDatabaseUrl(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new TypeError("REPLAY_CEREMONY_DATABASE_URL_INVALID");
  }
  const parameters = parsed.searchParams;
  const hosts = parsed.hostname === "" ? (parameters.get("host") ?? "").split(",") : [parsed.hostname];
  const local = hosts.every(
    (host) => host === "" || host.startsWith("/") || LOOPBACK_HOSTS.has(host.toLowerCase())
  );
  const verified = parameters.get("sslmode") === "verify-full"
    && (parameters.get("sslrootcert") ?? "").trim() !== ""
    && !parameters.has("uselibpqcompat")
    && !["0", "false"].includes(parameters.get("ssl") ?? "");
  if (!local && !verified) throw new TypeError("DATABASE_URL_TLS_REQUIRED:REPLAY_CEREMONY_DATABASE_URL");
  return databaseUrl;
}
