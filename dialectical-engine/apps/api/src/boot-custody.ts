import { destroyKek, type KekHandle } from "@debateai/crypto";

export interface BootCustodyClosable {
  end(): Promise<void>;
}

interface BootCustodyLogger {
  error(message: string): unknown;
}

export interface BootCustody {
  /** Registers one closable resource and returns it, so composition reads naturally. */
  hold<T extends BootCustodyClosable>(resource: T): T;
  /** Registers one KEK handle and returns it. */
  holdKek(handle: KekHandle): KekHandle;
  /** Runs one boot stage; on rejection, closes everything held so far and rethrows. */
  run<T>(stage: string, operation: () => Promise<T>): Promise<T>;
  /** Hands ownership to the startup resource owner. Idempotent. */
  release(): void;
}

/**
 * DL7-F7. Custody of the boot's secrets before the startup resource owner can
 * exist.
 *
 * `installStartupResourceOwner` needs the Fastify instance, which is built last,
 * so about fifteen awaited stages — the register policy reads, the Argon2 pool
 * handshake, the session service, the support key port — ran with the private
 * KEK, the corpus KEK and the support KEK already in memory and nothing
 * responsible for them. A rejection in any of those stages (a mis-published
 * register answering `ADMISSION_POLICY_UNRESOLVED` is the realistic one) ended
 * the process by top-level rejection: every key un-zeroed, every pool open,
 * residual paged to swap.
 *
 * This ledger takes custody from the first key load and gives it up the moment
 * the startup owner is installed, so there is never more than one owner. It is
 * deliberately not a second shutdown order: it closes what the boot has made so
 * far, in reverse, and keys last — after every pool that borrows from them, the
 * same rule `drainGracefulShutdownResources` follows. It reports one structured
 * line naming the STAGE, never the failure's own text, which can carry a path
 * or a value (constraint 6); the original failure is what the caller sees.
 */
export function installBootCustody(options: Readonly<{
  logger?: BootCustodyLogger;
}> = {}): BootCustody {
  const logger = options.logger ?? console;
  const closables: BootCustodyClosable[] = [];
  const kekHandles: KekHandle[] = [];
  let released = false;
  let closed = false;

  async function close(stage: string): Promise<void> {
    if (closed) return;
    closed = true;
    // Newest first: a resource can only depend on ones made before it.
    for (const resource of [...closables].reverse()) {
      try {
        await resource.end();
      } catch {
        // One resource that will not close must not leak every key behind it.
      }
    }
    for (const handle of [...kekHandles].reverse()) {
      try {
        destroyKek(handle);
      } catch {
        // Nothing downstream can act on a failed zeroisation.
      }
    }
    try {
      logger.error(JSON.stringify(Object.freeze({ event: "api.boot.failed", stage })));
    } catch {
      // Reporting must never replace the boot failure itself.
    }
  }

  return Object.freeze({
    hold<T extends BootCustodyClosable>(resource: T): T {
      if (!released) closables.push(resource);
      return resource;
    },
    holdKek(handle: KekHandle): KekHandle {
      if (!released) kekHandles.push(handle);
      return handle;
    },
    async run<T>(stage: string, operation: () => Promise<T>): Promise<T> {
      if (released) return operation();
      try {
        return await operation();
      } catch (failure) {
        await close(stage);
        throw failure;
      }
    },
    release(): void {
      released = true;
      closables.length = 0;
      kekHandles.length = 0;
    }
  });
}
