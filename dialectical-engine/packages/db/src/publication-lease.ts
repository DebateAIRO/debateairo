import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool,PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";

const PUBLICATION_LEASE_NAMESPACE = "debateai:publication-content-lease:v1:" as const;
const publicationLeaseScope = new AsyncLocalStorage<Readonly<{
  pool: Pool;
  lease: PublicationContentLease;
}>>();

export interface PublicationContentLease {
  readonly publicationRefs: readonly string[];
  readonly client: PoolClient;
  release(): Promise<void>;
}

export async function acquirePublicationContentLease(
  pool: Pool,
  requestedPublicationRefs: readonly string[]
): Promise<PublicationContentLease> {
  const publicationRefs = Object.freeze([...new Set(requestedPublicationRefs)].sort());
  if (publicationRefs.length === 0) throw new TypeError("PUBLICATION_LEASE_REF_REQUIRED");
  const client = await pool.connect();
  const acquired: string[] = [];
  let released = false;
  let backendFailure: Error | undefined;
  const reportBackendFailure = (error:Error):void => { backendFailure ??= error; };
  client.on("error",reportBackendFailure);
  const unlock = async (): Promise<void> => {
    if (released) return;
    released = true;
    let failure: unknown = backendFailure;
    if (failure === undefined) {
      for (const publicationRef of [...acquired].reverse()) {
        try {
          const result = await client.query<{ unlocked: boolean }>(
            "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
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
    for (const publicationRef of publicationRefs) {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended($1,0))",
        [`${PUBLICATION_LEASE_NAMESPACE}${publicationRef}`]
      );
      acquired.push(publicationRef);
    }
    return Object.freeze({ publicationRefs,client,release:unlock });
  } catch (error) {
    await unlock().catch(() => undefined);
    throw error;
  }
}

export async function withPublicationContentLease<T>(
  pool: Pool,
  publicationRefs: readonly string[],
  use: (lease: PublicationContentLease) => Promise<T>
): Promise<T> {
  const requested = [...new Set(publicationRefs)].sort();
  const current = publicationLeaseScope.getStore();
  if (current?.pool === pool) {
    if (!requested.every((publicationRef) =>
      current.lease.publicationRefs.includes(publicationRef))) {
      throw new TypedDomainError(
        "PUBLICATION_LEASE_SCOPE_EXPANSION_FORBIDDEN",
        "A nested public-content lease cannot expand its publication scope"
      );
    }
    return use(current.lease);
  }
  const lease = await acquirePublicationContentLease(pool,requested);
  try {
    return await publicationLeaseScope.run(
      Object.freeze({ pool,lease }),
      () => use(lease)
    );
  } finally {
    await lease.release();
  }
}
