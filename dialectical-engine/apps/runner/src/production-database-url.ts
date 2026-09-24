/**
 * DL7-F6. The query part of a PRODUCTION operator credential URL — the support CLIs' credential
 * files and the principal provisioner's input, whose support-config URL is published verbatim as
 * the support CLIs' credential.
 *
 * The VPS `pg_hba.conf` admits exactly two connection shapes and rejects plaintext TCP
 * (`deploy/postgres/pg_hba.conf.template`): the unix socket, and TLS on loopback. The old grammar
 * refused every query string, which refused BOTH shapes — a URL with no query is plaintext TCP,
 * and pg_hba rejects it. So exactly three query shapes are accepted, and nothing else:
 *
 * - none at all — today's shape, kept for hosts whose pg_hba admits it;
 * - `host=<absolute socket directory>` alone, on host `localhost` — the unix socket, the shape
 *   every URL in `deploy/vps/env/*.env.example` uses;
 * - `sslmode=verify-full` with `sslrootcert=<absolute path>` and nothing else — verified TLS, the
 *   same rule `assertProductionFloors` applies to an off-box `*_DATABASE_URL`.
 *
 * Every other parameter, a repeated parameter, a relative path, a comma-separated host list and
 * every weaker `sslmode` (`disable`, `require`, `no-verify`, `uselibpqcompat`, …) is refused.
 */
export function acceptsProductionDatabaseUrlQuery(url: URL): boolean {
  if (url.search === "") return true;
  const parameters = [...url.searchParams.entries()];
  const names = parameters.map(([name]) => name).sort();
  if (new Set(names).size !== names.length) return false;
  const value = (name: string): string => url.searchParams.get(name) ?? "";
  const absolutePath = (candidate: string): boolean => candidate.startsWith("/")
    && !candidate.includes(",") && !/[\0\r\n]/u.test(candidate)
    && !candidate.split("/").includes("..");
  if (names.length === 1 && names[0] === "host") {
    return url.hostname === "localhost" && url.port === "" && absolutePath(value("host"));
  }
  if (names.length === 2 && names[0] === "sslmode" && names[1] === "sslrootcert") {
    return url.hostname.length > 0 && value("sslmode") === "verify-full"
      && absolutePath(value("sslrootcert"));
  }
  return false;
}
