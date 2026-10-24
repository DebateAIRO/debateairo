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
 * queued checkout's callback runs in another one). The credential is sent only by a pool that has a target.
 */
export function accountContextRoute(pool: Pool): AccountContextRoute {
  const target = state.pools.get(pool)?.target;
  if (target === undefined) return { kind: "own", credential: null };
  const scope = state.scope.getStore();
  if (scope !== undefined && state.frame.getStore() === undefined) return { kind: "own", credential: scope.credential };
  return { kind: "target", target };
}

/** createPool only: runs a routed `query` or `connect` on the target's own connections (never routed a second time). */
export function onCrossAccountTarget(target: Pool, method: "query" | "connect", args: unknown[]): unknown {
  const routing = state.pools.get(target);
  if (routing !== undefined) return method === "query" ? routing.ownQuery(...args) : routing.ownConnect(...args);
  const untyped = target as unknown as Record<"query" | "connect", (...values: unknown[]) => unknown>;
  return untyped[method](...args);
}
