/**
 * V-3 — the operator's master-key rotation.
 *
 *   pnpm exec tsx apps/runner/src/rotate-kek-cli.ts
 *
 * Re-wraps every stored key under the CURRENT master keys, then verifies that
 * every record opens under those keys ALONE. Content is never re-encrypted.
 * The run is idempotent and resumable: a record already under the current key
 * is skipped, so an interrupted pass is finished by running it again.
 *
 * Exit 0 only on a clean verification pass. A non-zero unreadable count exits 1
 * and says in words that the previous key must not be retired.
 *
 * Every decision this file makes lives in ./rotate-kek.ts, which is unit-tested
 * without a database or a key file. This file only opens things.
 */
import { pathToFileURL } from "node:url";
import { createPool, PostgresSupportKeyRotationRepository } from "@debateai/db";
import {
  configureCustodyGroup,
  FilePublicationKeyStore,
  FileUserDekStore,
  loadKek
} from "@debateai/crypto";
import type { KekRing } from "@debateai/crypto";
import { loadKeyRotationEnvironment } from "@debateai/register";
import { createSupportKeyPort } from "../../api/src/support/keys.js";
import {
  renderRotationReport,
  rotateFileStore,
  rotateSupportKeys,
  rotationFailed
} from "./rotate-kek.js";
import type { RotationStoreReport } from "./rotate-kek.js";

function ring(currentPath: string, previousPath: string | undefined): KekRing {
  const current = loadKek(currentPath);
  return previousPath === undefined
    ? { current }
    : { current, previous: loadKek(previousPath) };
}

export async function runKeyRotation(): Promise<string> {
  const environment = loadKeyRotationEnvironment();
  // The rotation writes into the same custody trees the services read, so it
  // must honour the same contract (V-19) or it would leave records the runner
  // cannot open.
  configureCustodyGroup(environment.DEBATEAI_CUSTODY_GROUP);

  const reports: RotationStoreReport[] = [];
  reports.push(await rotateFileStore("user-deks", new FileUserDekStore(
    environment.USER_DEK_STORE_PATH,
    ring(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH)
  )));

  if (environment.CORPUS_KEK_PATH !== undefined
    && environment.PUBLICATION_KEY_STORE_PATH !== undefined) {
    reports.push(await rotateFileStore("publication-keys", new FilePublicationKeyStore(
      environment.PUBLICATION_KEY_STORE_PATH,
      ring(environment.CORPUS_KEK_PATH, environment.CORPUS_KEK_PREVIOUS_PATH)
    )));
  }

  const pool = createPool(environment.SUPPORT_DATABASE_URL);
  const keys = await createSupportKeyPort({
    supportKekPath: environment.SUPPORT_KEK_PATH,
    previousSupportKekPath: environment.SUPPORT_KEK_PREVIOUS_PATH,
    // The support KEK must never be one of the other master keys.
    protectedKeyPaths: [environment.KEK_PATH]
  });
  try {
    reports.push(await rotateSupportKeys(
      new PostgresSupportKeyRotationRepository(pool), keys
    ));
  } finally {
    await keys.close();
    await pool.end().catch(() => undefined);
  }

  const text = renderRotationReport(reports);
  if (rotationFailed(reports)) throw new KeyRotationFailed(text);
  return text;
}

export class KeyRotationFailed extends Error {
  readonly code = "KEYS_ROTATE_KEK_FAILED";

  constructor(readonly report: string) {
    super("KEYS_ROTATE_KEK_FAILED");
    this.name = "KeyRotationFailed";
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.stdout.write(`${await runKeyRotation()}\n`);
  } catch (error) {
    if (error instanceof KeyRotationFailed) {
      process.stdout.write(`${error.report}\n`);
      process.exitCode = 1;
    } else {
      // Never print the error itself: a stack from a key path could name one.
      const code = (error as { code?: unknown }).code;
      process.stderr.write(
        `KEYS_ROTATE_KEK_REFUSED ${typeof code === "string" ? code : "UNKNOWN"}\n`
      );
      process.exitCode = 1;
    }
  }
}
