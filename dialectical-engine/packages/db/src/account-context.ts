import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool } from "pg";

/**
 * Row-level security S01 (PLAN §0.3, DECISIONS D27, D28, D29, D68): the account context a request carries to the
 * database. A request runs inside a request scope (`runInRequestScope`); once the API has authenticated its session it
 * records the raw session token (`setRequestCredential`). A pool `createPool` built with a cross-account target sends
 * that token at each checkout made for the request — `SELECT set_config('debateai.session_credential', $1, false)`, a
 * bind parameter — and clears it before the connection goes back (release rule, `index.ts`). Migration 0124's `rls.*`
 * definers hash it as `hashToken("session", …)` does and look it up in identity.session, so the database derives the
 * account itself (T8): no value the API login can write names another account.
 *
 * Routing (binding, §0.3): a statement goes to the pool's own connections iff a request scope is active AND no
 * `crossAccount(...)` frame is active; otherwise to the pool's cross-account target. A pool with no target behaves as
 * before this slice. The state is process-global: workspace packages can load distinct @debateai/db module instances
 * under tsx (the content-lease scope in index.ts has the same reason), and a frame opened in one must route the pools of
 * the other.
 *
 * What the routing rule asks of a caller outside a request (FIX-S01-p1b): a statement there runs as the TARGET's login,
 * so a read that answers for the connection's own principal — a boot role check, a capability probe — names the login
 * it means: `onOwnConnections` (the pool's own login) or `attestEveryRoute` (both). migrate() (index.ts) checks out
 * through `pool.connect()` and so must be given a pool with no target (SEC-N4; every product caller is swept by
 * tests/architecture/rls-db-cross-account-sites.test.ts).
 */
export const ACCOUNT_CREDENTIAL_SETTING = "debateai.session_credential";

/**
 * The readers a call site names (SPEC-v4 §6): X10, X18a-X18g, X18j, X20, X22, X23, X24 inside their reader methods in
 * packages/*; X21 in apps/api/src/preview-budget-estimate.ts; X11, X14, X18h in apps/api/src/main.ts. Background readers
 * (X8, X12, X13) run outside every request scope and need no id; X19 and X25 connect as api-system directly.
 */
export type CrossAccountReader = "X10" | "X11" | "X14" | "X18a" | "X18b" | "X18c" | "X18d" | "X18e" | "X18f" | "X18g"
  | "X18h" | "X18j" | "X20" | "X21" | "X22" | "X23" | "X24";

type RequestScope = { credential: string | null };

/** What createPool records for each pool it builds: its target, and how a routed statement reaches its own connections. */
export type AccountContextPoolRouting = {
  target: Pool | undefined;
  readonly ownQuery: (...args: unknown[]) => unknown;
  readonly ownConnect: (...args: unknown[]) => unknown;
};

export type AccountContextRoute =
  | Readonly<{ kind: "own"; credential: string | null }>
  | Readonly<{ kind: "target"; target: Pool }>;

type AccountContextState = Readonly<{
  scope: AsyncLocalStorage<RequestScope>;
  frame: AsyncLocalStorage<CrossAccountReader>;
  pools: WeakMap<Pool, AccountContextPoolRouting>;
}>;

const accountContextGlobals = globalThis as typeof globalThis & { __debateaiAccountContextV1?: AccountContextState };
const state: AccountContextState = accountContextGlobals.__debateaiAccountContextV1 ??= Object.freeze({
  scope: new AsyncLocalStorage<RequestScope>(),
  frame: new AsyncLocalStorage<CrossAccountReader>(),
  pools: new WeakMap<Pool, AccountContextPoolRouting>()
});

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,}$/u;

/** Opens a request scope with no credential; everything `fn` runs and awaits sees it. */
export function runInRequestScope<T>(fn: () => T): T {
  return state.scope.run({ credential: null }, fn);
}

/** True iff a request scope is active in the calling async context (the R21 test guard reads it; no product caller). */
export function requestScopeActive(): boolean {
  return state.scope.getStore() !== undefined;
}

/** Records the request's raw session token (or clears it with null). Refuses outside a scope and a malformed token. */
export function setRequestCredential(sessionToken: string | null): void {
  const scope = state.scope.getStore();
  if (scope === undefined) throw new TypeError("ACCOUNT_SCOPE_MISSING");
  if (sessionToken !== null && (typeof sessionToken !== "string" || !CREDENTIAL_PATTERN.test(sessionToken))) {
    throw new TypeError("ACCOUNT_CREDENTIAL_INVALID");
  }
  scope.credential = sessionToken;
}

/** Statements issued inside `fn` (and everything it awaits) on a pool with a cross-account target go to that target. */
export function crossAccount<T>(reader: CrossAccountReader, fn: () => T): T {
  return state.frame.run(reader, fn);
}

/** The pool's cross-account target, or the pool itself when it has none. */
export function crossAccountPool(pool: Pool, reader: CrossAccountReader): Pool {
  void reader;
  return state.pools.get(pool)?.target ?? pool;
}

/**
 * Gives a pool createPool built without the `crossAccount` option the target that option would have given, with the
 * same routing from then on (Revision 3, B8: main.ts's createPool lines stay byte-identical).
 */
export function setCrossAccountTarget(pool: Pool, target: Pool): void {
  const routing = state.pools.get(pool);
  if (routing === undefined) throw new TypeError("CROSS_ACCOUNT_POOL_UNKNOWN");
  if (routing.target !== undefined) throw new TypeError("CROSS_ACCOUNT_TARGET_ALREADY_SET");
  routing.target = target;
}

/** createPool only: records a pool it built. */
export function registerAccountContextPool(pool: Pool, routing: AccountContextPoolRouting): void {
  state.pools.set(pool, routing);
}

/**
 * createPool only: where a statement issued now on `pool` goes, read synchronously in the caller's async context (a
 * queued checkout's callback runs in another one). The credential is sent only by a pool that has a target — and such a
 * pool sends one on EVERY own checkout: the request's token, or "" (no account) in a scope with none yet, so the release
 * rule (index.ts, release rule v3) governs every client it hands out. An anonymous request's client released inside a
 * block is then destroyed, never handed to the next checkout — an account's — with the block still open (COR-N7).
 */
export function accountContextRoute(pool: Pool): AccountContextRoute {
  const target = state.pools.get(pool)?.target;
  if (target === undefined) return { kind: "own", credential: null };
  const scope = state.scope.getStore();
  if (scope !== undefined && state.frame.getStore() === undefined) return { kind: "own", credential: scope.credential ?? "" };
  return { kind: "target", target };
}

/**
 * Runs `fn` with its statements on each pool's OWN connections: an anonymous request scope (no credential) outside every
 * `crossAccount` frame, whatever the caller's context. For a read that must answer for the login a request runs as.
 */
export function onOwnConnections<T>(fn: () => T): T {
  return state.frame.exit(() => state.scope.run({ credential: null }, fn));
}

/**
 * COR-B1: runs a boot attestation on every login a statement on a T1 pool can run as — first on the pool's own
 * connections (the T1 login, as `onOwnConnections`), then outside every scope (its cross-account target, whatever the
 * frame: boot, background and crossAccount statements). Called once outside a scope, a role check on a pool with a
 * target reads the target's catalog only, so a misconfigured DATABASE_URL passed it. A pool with no target is attested
 * twice on itself.
 */
export async function attestEveryRoute(attest: () => Promise<unknown>): Promise<void> {
  await onOwnConnections(attest);
  await state.scope.exit(attest);
}

/**
 * The account reach of the login a connection runs as (`current_user`, the session's own login unless its role was
 * switched): superuser, BYPASSRLS, the marker role, a role the `rls_all_accounts` policies name (D29 iii), or the owner
 * of a row-secured relation each reach every account's rows. Catalog functions only; no account row is read.
 */
const LOGIN_REACH_SQL = `
  SELECT session_user <> current_user AS switched, role.rolsuper AS superuser, role.rolbypassrls AS bypass,
    COALESCE(pg_catalog.pg_has_role(current_user, to_regrole('debateai_rls_all_accounts'), 'MEMBER'), false) AS marker,
    COALESCE(pg_catalog.pg_has_role(current_user, to_regrole('debateai_rls_all_accounts'), 'USAGE'), false) AS marker_usage,
    EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS policy CROSS JOIN LATERAL unnest(policy.polroles) AS listed(role)
      WHERE policy.polname = 'rls_all_accounts' AND listed.role <> 0
        AND pg_catalog.pg_has_role(current_user, listed.role, 'MEMBER')) AS policy_role,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
      WHERE relation.relrowsecurity AND pg_catalog.pg_has_role(current_user, relation.relowner, 'MEMBER')) AS owner
  FROM pg_catalog.pg_roles AS role WHERE role.rolname = current_user`;

type LoginReach = Readonly<{
  switched: boolean; superuser: boolean; bypass: boolean; marker: boolean; marker_usage: boolean; policy_role: boolean;
  owner: boolean;
}>;

async function loginReach(pool: Pool): Promise<LoginReach | undefined> {
  return (await pool.query<LoginReach>(LOGIN_REACH_SQL)).rows[0];
}

/**
 * COR-B1, the boot attestation of the logins themselves (main.ts, boot.run("account-context-logins")). Every pool built
 * on a T1 URL is read on its own connections: its login must reach no other account — not superuser, no BYPASSRLS, not a
 * member of the marker or of a role the rls_all_accounts policies name, owner of no row-secured relation, its role not
 * switched — else RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS (an alias of a system login as DATABASE_URL passes the URL
 * compare of runtime-environment.ts and every role check, and is refused here). Every pool built on a system URL must
 * reach every account through the marker and nothing wider — it holds the marker's privileges, is not superuser and has
 * no BYPASSRLS — else RLS_SYSTEM_LOGIN_INVALID (also on a database without the marker role: row security not installed).
 */
export async function assertAccountContextLogins(input: Readonly<{
  requestPools: readonly Pool[];
  systemPools: readonly Pool[];
}>): Promise<void> {
  const [requests, systems] = await Promise.all([
    Promise.all(input.requestPools.map((pool) => onOwnConnections(() => loginReach(pool)))),
    Promise.all(input.systemPools.map((pool) => onOwnConnections(() => loginReach(pool))))
  ]);
  if (requests.some((reach) => reach === undefined || reach.switched || reach.superuser || reach.bypass
    || reach.marker || reach.policy_role || reach.owner)) {
    throw new TypeError("RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS");
  }
  if (systems.some((reach) => reach === undefined || !reach.marker_usage || reach.superuser || reach.bypass)) {
    throw new TypeError("RLS_SYSTEM_LOGIN_INVALID");
  }
}

/** createPool only: runs a routed `query` or `connect` on the target's own connections (never routed a second time). */
export function onCrossAccountTarget(target: Pool, method: "query" | "connect", args: unknown[]): unknown {
  const routing = state.pools.get(target);
  if (routing !== undefined) return method === "query" ? routing.ownQuery(...args) : routing.ownConnect(...args);
  const untyped = target as unknown as Record<"query" | "connect", (...values: unknown[]) => unknown>;
  return untyped[method](...args);
}
