import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool,PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { LEASE_LOCK_WAITS } from "./pool-budget.js";
import { accountContextSource, sameAccountContextSource, type AccountContextSource } from "./account-context.js";

const PUBLICATION_LEASE_NAMESPACE = "debateai:publication-content-lease:v1:" as const;
const publicationLeaseScope = new AsyncLocalStorage<Readonly<{
  pool: Pool;
  lease: PublicationContentLease;
}>>();
// NV-31: the client each live publication lease holds (compared by lease). Module-local like the scope: on the API
// every publication lease is taken through the API's own @debateai/db instance (main.ts); a duplicate instance
// would only fail open to a second connection, never route to another lease's session.
const livePublicationLeases = new WeakMap<PoolClient, PublicationContentLease>();
// NV-31 with row security: the account-context source of the checkout that gave each lease its client (index.ts
// routeLeaseBodyQueries compares a body statement's own source with it).
const publicationLeaseSources = new WeakMap<PublicationContentLease, AccountContextSource>();

/**
 * Security fixes run 3, K10 (NV-21): readers (the public page, the evaluator) take the lease SHARED; only key
 * destruction and account erasure take it EXCLUSIVE. Neither waits without a bound (LEASE_LOCK_WAITS).
 */
export type PublicationLeaseMode = "shared" | "exclusive";

export interface PublicationContentLease {
  readonly publicationRefs: readonly string[];
  readonly mode: PublicationLeaseMode;
  readonly client: PoolClient;
  release(): Promise<void>;
}

function leaseContended(): TypedDomainError {
  return new TypedDomainError("PUBLICATION_LEASE_CONTENDED", "The public content lease could not be taken in time");
}

/**
 * SHARED: a try-lock per ref; a refusal (an exclusive holder, or one waiting in PostgreSQL's queue) puts the
 * connection back and tries again every 10 ms, for at most LEASE_LOCK_WAITS.sharedMs, then PUBLICATION_LEASE_CONTENDED.
 * EXCLUSIVE: waits in PostgreSQL's queue, so readers cannot starve it, under a transaction-local lock_timeout of
 * LEASE_LOCK_WAITS.exclusiveMs. The session advisory lock outlives that transaction's COMMIT; lock_timeout does not.
 */
export async function acquirePublicationContentLease(
  pool: Pool,
  requestedPublicationRefs: readonly string[],
  mode: PublicationLeaseMode = "exclusive"
): Promise<PublicationContentLease> {
  const publicationRefs = Object.freeze([...new Set(requestedPublicationRefs)].sort());
  if (publicationRefs.length === 0) throw new TypeError("PUBLICATION_LEASE_REF_REQUIRED");
  const deadline = performance.now() + LEASE_LOCK_WAITS.sharedMs;
  for (;;) {
    const source = accountContextSource(pool);
    const client = await pool.connect();
    const acquired: string[] = [];
    let released = false;
    let backendFailure: Error | undefined;
    const reportBackendFailure = (error:Error):void => { backendFailure ??= error; };
    client.on("error",reportBackendFailure);
    const unlock = async (): Promise<void> => {
      if (released) return;
      released = true;
      livePublicationLeases.delete(client);
      let failure: unknown = backendFailure;
      if (failure === undefined) {
        for (const publicationRef of [...acquired].reverse()) {
          try {
            // A shared hold is released only by the shared unlock, an exclusive one only by the exclusive unlock.
            const result = await client.query<{ unlocked: boolean }>(
              mode === "shared"
                ? "SELECT pg_advisory_unlock_shared(hashtextextended($1,0)) AS unlocked"
                : "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
              [`${PUBLICATION_LEASE_NAMESPACE}${publicationRef}`]
            );
            if (result.rows[0]?.unlocked !== true) {
              failure ??= new TypeError("PUBLICATION_LEASE_UNLOCK_FAILED");
            }
          } catch (error) {
            failure ??= error;
          }
        }
      }
      client.removeListener("error",reportBackendFailure);
      if (failure === undefined) client.release();
      else client.release(failure instanceof Error
        ? failure : new Error("PUBLICATION_LEASE_UNLOCK_FAILED"));
      if (failure !== undefined) throw failure;
    };
    try {
      if (mode === "shared") {
        let contended = false;
        for (const publicationRef of publicationRefs) {
          const result = await client.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock_shared(hashtextextended($1,0)) AS acquired",
            [`${PUBLICATION_LEASE_NAMESPACE}${publicationRef}`]
          );
          // Only a granted ref is unlocked later; the first refusal ends this pass.
          if (result.rows[0]?.acquired !== true) {
            contended = true;
            break;
          }
          acquired.push(publicationRef);
        }
        if (!contended) {
          const lease = Object.freeze({ publicationRefs,mode,client,release:unlock });
          publicationLeaseSources.set(lease,source);
          livePublicationLeases.set(client,lease);
          return lease;
        }
        await unlock();
        if (performance.now() >= deadline) throw leaseContended();
        await new Promise<void>((resolve) => setTimeout(resolve,10));
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('lock_timeout',$1,true)",[`${LEASE_LOCK_WAITS.exclusiveMs}ms`]);
        for (const publicationRef of publicationRefs) {
          await client.query(
            "SELECT pg_advisory_lock(hashtextextended($1,0))",
            [`${PUBLICATION_LEASE_NAMESPACE}${publicationRef}`]
          );
          acquired.push(publicationRef);
        }
        await client.query("COMMIT");
      } catch (error) {
        // Session locks taken before a timeout survive the ROLLBACK; the outer catch unlocks them.
        await client.query("ROLLBACK").catch(() => undefined);
        throw typeof error === "object" && error !== null && (error as { code?: unknown }).code === "55P03"
          ? leaseContended() : error;
      }
      const lease = Object.freeze({ publicationRefs,mode,client,release:unlock });
      publicationLeaseSources.set(lease,source);
      livePublicationLeases.set(client,lease);
      return lease;
    } catch (error) {
      await unlock().catch(() => undefined);
      throw error;
    }
  }
}

export async function withPublicationContentLease<T>(
  pool: Pool,
  publicationRefs: readonly string[],
  use: (lease: PublicationContentLease) => Promise<T>,
  mode: PublicationLeaseMode = "exclusive"
): Promise<T> {
  const requested = [...new Set(publicationRefs)].sort();
  const current = publicationLeaseScope.getStore();
  if (current?.pool === pool) {
    // A shared scope is never upgraded: an exclusive request nested in a reader would wait on its own shared hold.
    if (mode === "exclusive" && current.lease.mode === "shared") {
      throw new TypedDomainError(
        "PUBLICATION_LEASE_SCOPE_EXPANSION_FORBIDDEN",
        "A nested public-content lease cannot expand its publication scope"
      );
    }
    if (!requested.every((publicationRef) =>
      current.lease.publicationRefs.includes(publicationRef))) {
      throw new TypedDomainError(
        "PUBLICATION_LEASE_SCOPE_EXPANSION_FORBIDDEN",
        "A nested public-content lease cannot expand its publication scope"
      );
    }
    return use(current.lease);
  }
  const lease = await acquirePublicationContentLease(pool,requested,mode);
  try {
    return await publicationLeaseScope.run(
      Object.freeze({ pool,lease }),
      () => use(lease)
    );
  } finally {
    await lease.release();
  }
}

/**
 * The live publication lease client the calling async context holds, if its checkout had `source` (NV-31's query
 * router, with row security): the lease of the pool the statement is on, or of that pool's cross-account target when
 * the statement is routed there (a shared lease is taken on the target, X10), and only under the same account context.
 */
export function publicationLeaseClientFor(source: AccountContextSource): PoolClient | undefined {
  const current = publicationLeaseScope.getStore();
  return current !== undefined && livePublicationLeases.get(current.lease.client) === current.lease
    && sameAccountContextSource(publicationLeaseSources.get(current.lease), source)
    ? current.lease.client : undefined;
}
