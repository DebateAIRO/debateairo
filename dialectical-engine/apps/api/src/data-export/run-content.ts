import { decryptLeasedContentForRun, prepareLeasedContentEncryptionForRun, type Pool } from "@debateai/db";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { ExportDecryptors } from "./snapshot.js";

const erased = (error: unknown): boolean => error instanceof TypedDomainError && error.code === "PRIVATE_CONTENT_ERASED";

/**
 * The export's opener of one debate's web values (0132): every envelope under the run's key, inside one private-content
 * lease on the runtime pool that carries the content cipher (main.ts `pool`), as the owner's reads open them. A debate
 * whose private content is erased meanwhile answers null (exported UNRECOVERABLE), as the publication review's reader
 * does; every other failure fails the export.
 */
export function runContentOpener(pool: Pool): ExportDecryptors["openRunContent"] {
  return async (runId, items) => {
    let leased: Awaited<ReturnType<typeof prepareLeasedContentEncryptionForRun>>;
    try {
      leased = await prepareLeasedContentEncryptionForRun(pool, runId);
    } catch (error) {
      if (erased(error)) return null;
      throw error;
    }
    try {
      const values = items.map((item) =>
        decryptLeasedContentForRun<unknown>(leased, item.carrier, item.primaryKey, item.envelope as CryptoEnvelope, null));
      await leased.assertLive();
      return values;
    } catch (error) {
      if (erased(error)) return null;
      throw error;
    } finally {
      await leased.close();
    }
  };
}
