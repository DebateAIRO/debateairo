/**
 * DL7-F6. The host and query of a PRODUCTION operator credential URL — the support CLIs'
 * credential files and the principal provisioner's input, whose support-config URL is
 * published verbatim as the support CLIs' credential.
 *
 * The VPS `pg_hba.conf` admits exactly two connection shapes and rejects plaintext TCP
 * (`deploy/postgres/pg_hba.conf.template`): the unix socket, and TLS on loopback. So exactly
 * three shapes are accepted, and nothing else:
 *
 * - no query at all, and ONLY to a loopback host (`localhost`, `127.0.0.1`, `[::1]`): plaintext
 *   TCP that never leaves the machine, for hosts whose pg_hba admits it. The VPS pg_hba does
 *   NOT (its last two lines reject it); an off-box or private address with no query is refused
 *   here, because it would send the password in the clear across a network;
 * - `host=` one of the PostgreSQL socket directories the kit uses (`/var/run/postgresql`,
 *   `/run/postgresql`) alone, on host `localhost` — the shape every URL in
 *   `deploy/vps/env/*.env.example` uses. Any other directory is refused: a socket in a
 *   directory someone else can write to is a socket someone else can impersonate;
 * - `sslmode=verify-full` with `sslrootcert=` an absolute path, and nothing else — verified TLS,
 *   the rule `assertProductionFloors` applies to an off-box `*_DATABASE_URL`.
 *
 * The query is read RAW, before any percent-decoding: an encoded name (`%68ost`), an encoded
 * value, an upper-case name or value, an empty or repeated parameter, a `..` segment, and every
 * weaker `sslmode` (`disable`, `require`, `no-verify`, `uselibpqcompat`, …) are refused.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SOCKET_DIRECTORIES = new Set(["/var/run/postgresql", "/run/postgresql"]);

function rawParameters(search: string): ReadonlyMap<string, string> | null {
  const parameters = new Map<string, string>();
  for (const pair of search.slice(1).split("&")) {
    const separator = pair.indexOf("=");
    if (separator < 1) return null;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!/^[a-z]+$/u.test(name) || value === "" || /[%+\s\0]/u.test(value)
      || parameters.has(name)) {
      return null;
    }
    parameters.set(name, value);
  }
  return parameters;
}

function isPinnedAbsolutePath(value: string): boolean {
  return value.startsWith("/") && !value.includes(",")
    && !value.split("/").some((segment) => segment === "..");
}

export function acceptsProductionDatabaseUrlQuery(url: URL): boolean {
  if (url.search === "") return LOOPBACK_HOSTS.has(url.hostname);
  const parameters = rawParameters(url.search);
  if (parameters === null) return false;
  const names = [...parameters.keys()].sort();
  if (names.length === 1 && names[0] === "host") {
    return url.hostname === "localhost" && url.port === ""
      && SOCKET_DIRECTORIES.has(parameters.get("host") ?? "");
  }
  if (names.length === 2 && names[0] === "sslmode" && names[1] === "sslrootcert") {
    return url.hostname.length > 0 && parameters.get("sslmode") === "verify-full"
      && isPinnedAbsolutePath(parameters.get("sslrootcert") ?? "");
  }
  return false;
}
