/**
 * V-3 — the operator's master-key rotation. Named `pnpm keys:rotate-kek` once
 * that one-line script exists; until then:
 *
 *   pnpm exec tsx apps/runner/src/rotate-kek-cli.ts
 *
 * Re-wraps every stored key under the CURRENT master keys, then verifies that
 * every record opens under those keys ALONE. Content is never re-encrypted.
 * The run is idempotent and resumable: a record already under the current key
 * is skipped, so an interrupted pass is finished by running it again.
 *
 * Exit 0 only on a clean verification pass over every store it was asked to
 * cover. A non-zero unreadable count — or a store it could NOT cover — exits 1
 * and says in words that the previous key must not be retired.
 *
 * Every decision this file makes lives in ./rotate-kek.ts, which is unit-tested
 * without a database or a key file. This file only opens things.
 */
import { pathToFileURL } from "node:url";
import {
  assertSupportPrincipalRole,
  createPool,
  PostgresSupportKeyRotationRepository
} from "@debateai/db";
import {
  configureCustodyGroup,
  FilePublicationKeyStore,
  FileUserDekStore,
  kekId,
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
import type { DeclinedStore, RotationStoreReport } from "./rotate-kek.js";

export class KeyRotationFailed extends Error {
  readonly code = "KEYS_ROTATE_KEK_FAILED";

  constructor(readonly report: string) {
    super("KEYS_ROTATE_KEK_FAILED");
    this.name = "KeyRotationFailed";
  }
}

export class KeyRotationRefused extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "KeyRotationRefused";
  }
}

export type PublicationStoreDecision = Readonly<{
  covered: boolean;
  declined?: DeclinedStore;
}>;

/**
 * Whether the publication-key store is part of this rotation, mirroring the
 * rule the API itself applies (`assertProductionFloors`: the corpus pair is
 * required only when `PUBLICATION_ENABLED=true`).
 *
 *   enabled + pair        -> covered
 *   enabled + anything else -> FAILS; publication is on and its keys are not rotatable
 *   not enabled + neither -> declined BY CONFIGURATION, not a failure: a host
 *                            that never turned publication on must still be able
 *                            to reach KEYS_ROTATE_KEK_OK and retire its old key
 *   half-set              -> ALWAYS fails; half a pair is a misconfiguration
 *                            whatever the flag says
 */
export function publicationStoreDecision(input: Readonly<{
  publicationEnabled: boolean;
  corpusKekPath: string | undefined;
  publicationKeyStorePath: string | undefined;
}>): PublicationStoreDecision {
  const both = input.corpusKekPath !== undefined
    && input.publicationKeyStorePath !== undefined;
  const neither = input.corpusKekPath === undefined
    && input.publicationKeyStorePath === undefined;
  if (both) return Object.freeze({ covered: true });
  if (!neither) {
    return Object.freeze({
      covered: false,
      declined: Object.freeze({
        store: "publication-keys", code: "PUBLICATION_KEY_PATHS_INCOMPLETE", fatal: true
      })
    });
  }
  return Object.freeze({
    covered: false,
    declined: Object.freeze({
      store: "publication-keys",
      code: "PUBLICATION_KEY_PATHS_ABSENT",
      fatal: input.publicationEnabled
    })
  });
}

/**
 * The one line an unexpected refusal prints. The error itself is never printed:
 * a stack from a key path could name one. A refusal with no code says UNKNOWN
 * rather than inventing one.
 */
export function keyRotationRefusalLine(error: unknown): string {
  const code = (error as { readonly code?: unknown } | null)?.code;
  return `KEYS_ROTATE_KEK_REFUSED ${typeof code === "string" && code !== "" ? code : "UNKNOWN"}`;
}

function ring(currentPath: string, previousPath: string | undefined): KekRing {
  const current = loadKek(currentPath);
  return previousPath === undefined
    ? { current }
    : { current, previous: loadKek(previousPath) };
}

export async function runKeyRotation(): Promise<string> {
  // M5: every missing or malformed variable leaves by a typed code naming it,
  // rather than as a ZodError printed as UNKNOWN.
  let environment: ReturnType<typeof loadKeyRotationEnvironment>;
  try {
    environment = loadKeyRotationEnvironment();
  } catch (error) {
    throw new KeyRotationRefused(keyRotationEnvironmentCode(error));
  }
  // The rotation writes into the same custody trees the services read, so it
  // must honour the same contract (V-19) or it would leave records the runner
  // cannot open.
  configureCustodyGroup(environment.DEBATEAI_CUSTODY_GROUP);

  const reports: RotationStoreReport[] = [];
  const declined: DeclinedStore[] = [];

  const userKeks = ring(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH);
  reports.push(await rotateFileStore(
    "user-deks",
    new FileUserDekStore(environment.USER_DEK_STORE_PATH, userKeks),
    kekId(userKeks.current)
  ));

  const publication = publicationStoreDecision({
    publicationEnabled: environment.PUBLICATION_ENABLED === "true",
    corpusKekPath: environment.CORPUS_KEK_PATH,
    publicationKeyStorePath: environment.PUBLICATION_KEY_STORE_PATH
  });
  if (publication.covered) {
    const corpusKeks = ring(
      environment.CORPUS_KEK_PATH!, environment.CORPUS_KEK_PREVIOUS_PATH
    );
    reports.push(await rotateFileStore(
      "publication-keys",
      new FilePublicationKeyStore(environment.PUBLICATION_KEY_STORE_PATH!, corpusKeks),
      kekId(corpusKeks.current)
    ));
  } else if (publication.declined !== undefined) {
    declined.push(publication.declined);
  }

  const pool = createPool(environment.SUPPORT_DATABASE_URL);
  const keys = await createSupportKeyPort({
    supportKekPath: environment.SUPPORT_KEK_PATH,
    previousSupportKekPath: environment.SUPPORT_KEK_PREVIOUS_PATH,
    // The support KEK must never be one of the other master keys — the same
    // separation apps/api/src/main.ts asserts at boot, over the two keys this
    // command knows about. A rotation that pointed two domains at one key would
    // report a clean pass over a deployment that had quietly lost a boundary.
    protectedKeyPaths: [
      environment.KEK_PATH,
      ...(environment.CORPUS_KEK_PATH === undefined ? [] : [environment.CORPUS_KEK_PATH])
    ]
  });
  try {
    // M3, as ruled: this command writes two support key columns and opens no
    // other pool, so it asserts the SUPPORT role alone and never holds the
    // runtime credential. The API keeps the two-sided assertion, which is its
    // to make because it holds both.
    await assertSupportPrincipalRole(pool);
    reports.push(await rotateSupportKeys(
      new PostgresSupportKeyRotationRepository(pool), keys
    ));
  } finally {
    await keys.close();
    await pool.end().catch(() => undefined);
  }

  const text = renderRotationReport(reports, declined);
  if (rotationFailed(reports, declined)) throw new KeyRotationFailed(text);
  return text;
}

/**
 * Turns the register loader's rejection into a code that NAMES the variable.
 * A ZodError's issues carry the key; anything else keeps whatever typed code it
 * has. Nothing from the error's prose is printed, because a key path could be
 * in it.
 */
export function keyRotationEnvironmentCode(error: unknown): string {
  const issues = (error as { readonly issues?: unknown } | null)?.issues;
  if (Array.isArray(issues)) {
    const names = [...new Set(issues.flatMap((issue) => {
      const path = (issue as { readonly path?: unknown }).path;
      return Array.isArray(path) && typeof path[0] === "string" ? [path[0]] : [];
    }))].sort();
    if (names.length > 0) return `KEYS_ROTATE_KEK_ENVIRONMENT_INVALID:${names.join(",")}`;
  }
  const code = (error as { readonly code?: unknown } | null)?.code;
  return typeof code === "string" && code !== ""
    ? code
    : "KEYS_ROTATE_KEK_ENVIRONMENT_INVALID";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.stdout.write(`${await runKeyRotation()}\n`);
  } catch (error) {
    if (error instanceof KeyRotationFailed) {
      process.stdout.write(`${error.report}\n`);
      process.exitCode = 1;
    } else {
      process.stderr.write(`${keyRotationRefusalLine(error)}\n`);
      process.exitCode = 1;
    }
  }
}
