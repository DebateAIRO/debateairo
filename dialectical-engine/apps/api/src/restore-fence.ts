import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import type {
  PostgresRestoreFenceRepository,
  RestoreFenceHostToken,
  RestoreFenceSettlement
} from "../../../packages/db/src/restore-fence.js";

/**
 * NV-07: the host half of the restore fence. A 32-byte random token lives in two places: one row in the database
 * (identity.restore_fence, carried by every dump and cold copy) and this file (RESTORE_FENCE_PATH), which no backup
 * captures. Every settle advances both; a restore brings back an older row, so the two disagree and the settle revokes
 * every long-lived bearer and holds public reads before the API answers anything (0125 [NV-07]).
 */

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

function refuse(code: string): never {
  throw new TypeError(code);
}

/** `inner` is `outer` or below it (both absolute and normalised). */
function within(inner: string, outer: string): boolean {
  return inner === outer || inner.startsWith(outer.endsWith("/") ? outer : `${outer}/`);
}

/** Two folders overlap when one is, or sits inside, the other. */
function overlaps(left: string, right: string): boolean {
  const a = normalize(left).replace(/(.)\/+$/u, "$1");
  const b = normalize(right).replace(/(.)\/+$/u, "$1");
  return within(a, b) || within(b, a);
}

/**
 * The fence file's path, or null when the fence is off (local mode without the setting). Hosted mode requires it. Its
 * folder must be the API's own: never a captured store (backup.sh archives the user-DEK, publication-key and audit-key
 * stores; the export store and the notice spool have their own purge rules) and never a secret file's folder, so no
 * copy of either can carry, and no restore of either can roll back, the host half.
 */
export function resolveRestoreFencePath(environment: Readonly<{
  DEPLOYMENT_MODE: "hosted" | "local";
  RESTORE_FENCE_PATH?: string | undefined;
  USER_DEK_STORE_PATH: string;
  PUBLICATION_KEY_STORE_PATH?: string | undefined;
  AUDIT_KEY_STORE_PATH: string;
  DATA_EXPORT_STORE_PATH?: string | undefined;
  BILLING_NOTICE_SPOOL_PATH?: string | undefined;
  KEK_PATH: string;
  BLIND_INDEX_KEY_PATH: string;
  AUDIT_SOURCE_IP_SALT_PATH: string;
  SUPPORT_KEK_PATH: string;
  RECORDS_KEY_PATH: string;
  CORPUS_KEK_PATH?: string | undefined;
  CONTENT_BLIND_INDEX_KEY_PATH?: string | undefined;
  KEK_PREVIOUS_PATH?: string | undefined;
  CORPUS_KEK_PREVIOUS_PATH?: string | undefined;
  SUPPORT_KEK_PREVIOUS_PATH?: string | undefined;
}>, extraSecretPaths: readonly string[]): string | null {
  const path = environment.RESTORE_FENCE_PATH;
  if (path === undefined) {
    if (environment.DEPLOYMENT_MODE === "hosted") refuse("RESTORE_FENCE_PATH_REQUIRED");
    return null;
  }
  if (!isAbsolute(path) || normalize(path) !== path || path.endsWith("/") || basename(path) === "") {
    refuse("RESTORE_FENCE_PATH_INVALID");
  }
  const folder = dirname(path);
  const stores = [environment.USER_DEK_STORE_PATH, environment.PUBLICATION_KEY_STORE_PATH, environment.AUDIT_KEY_STORE_PATH,
    environment.DATA_EXPORT_STORE_PATH, environment.BILLING_NOTICE_SPOOL_PATH];
  const secrets = [environment.KEK_PATH, environment.BLIND_INDEX_KEY_PATH, environment.AUDIT_SOURCE_IP_SALT_PATH,
    environment.SUPPORT_KEK_PATH, environment.RECORDS_KEY_PATH, environment.CORPUS_KEK_PATH,
    environment.CONTENT_BLIND_INDEX_KEY_PATH, environment.KEK_PREVIOUS_PATH, environment.CORPUS_KEK_PREVIOUS_PATH,
    environment.SUPPORT_KEK_PREVIOUS_PATH, ...extraSecretPaths];
  const custody = [
    ...stores.filter((store): store is string => store !== undefined),
    ...secrets.filter((secret): secret is string => secret !== undefined).map((secret) => dirname(secret))
  ];
  if (custody.some((held) => overlaps(folder, held))) refuse("RESTORE_FENCE_PATH_INSIDE_CUSTODY");
  return path;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : undefined;
}

export class FileRestoreFence {
  readonly #path: string;
  readonly #folder: string;
  readonly #repository: Pick<PostgresRestoreFenceRepository, "settle">;
  readonly #uidOption: number | undefined;
  readonly #token: () => string;
  /** Public reads fail closed until the first settle says otherwise. */
  #held = true;

  constructor(options: Readonly<{
    path: string;
    repository: Pick<PostgresRestoreFenceRepository, "settle">;
    uid?: number;
    token?: () => string;
  }>) {
    this.#path = options.path;
    this.#folder = dirname(options.path);
    this.#repository = options.repository;
    this.#uidOption = options.uid;
    this.#token = options.token ?? (() => randomBytes(32).toString("base64url"));
  }

  /** True while a detected restore holds public reads (and before the first settle); the owner releases it in SQL. */
  publicReadsHeld(): boolean {
    return this.#held;
  }

  async settle(): Promise<RestoreFenceSettlement> {
    const result = await this.#repository.settle({
      readHostToken: () => this.#read(),
      nextToken: this.#token(),
      commitHostToken: (token) => this.#write(token)
    });
    this.#held = result.publicHold;
    return result;
  }

  #uid(): number {
    if (this.#uidOption !== undefined) return this.#uidOption;
    if (typeof process.getuid !== "function") refuse("RESTORE_FENCE_DIRECTORY_INSECURE");
    return process.getuid();
  }

  /** Called by the repository only once it holds the fence row's lock. */
  async #read(): Promise<RestoreFenceHostToken> {
    const uid = this.#uid();
    let folder;
    try {
      folder = await lstat(this.#folder);
    } catch (error) {
      if (errorCode(error) === "ENOENT") refuse("RESTORE_FENCE_DIRECTORY_MISSING");
      throw error;
    }
    if (folder.isSymbolicLink() || !folder.isDirectory() || folder.uid !== uid || (folder.mode & 0o077) !== 0) {
      refuse("RESTORE_FENCE_DIRECTORY_INSECURE");
    }
    // O_NOFOLLOW refuses a link in the file's place; O_NONBLOCK keeps a FIFO there from hanging the read.
    let handle;
    try {
      handle = await open(this.#path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") return null;
      if (code === "ELOOP" || code === "EMLINK") refuse("RESTORE_FENCE_FILE_INSECURE");
      throw error;
    }
    try {
      const file = await handle.stat();
      if (!file.isFile() || file.uid !== uid || (file.mode & 0o077) !== 0) refuse("RESTORE_FENCE_FILE_INSECURE");
      if (file.size > 256) return "MARKER";
      const text = (await handle.readFile("utf8")).replace(/\n$/u, "");
      return TOKEN.test(text) ? text : "MARKER";
    } finally {
      await handle.close();
    }
  }

  /** Atomic replace: a private tmp file in the same folder, fsync'd, renamed over the fence, then the folder fsync'd. */
  async #write(token: string): Promise<void> {
    const tmp = join(this.#folder, `.fence-${randomUUID()}.tmp`);
    try {
      const handle = await open(tmp, "wx", 0o600);
      try {
        await handle.writeFile(`${token}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, this.#path);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
    const folder = await open(this.#folder, "r");
    try {
      await folder.sync();
    } catch (error) {
      const code = errorCode(error);
      if (code !== "EISDIR" && code !== "EINVAL" && code !== "EPERM") throw error;
    } finally {
      await folder.close();
    }
  }
}

/** One journal line for an initialisation or a detected restore (none for an advance); never a token or a path. */
export function restoreFenceJournalLine(settlement: RestoreFenceSettlement): string | null {
  if (settlement.outcome === "ADVANCED") return null;
  return JSON.stringify({
    event: "api.restore_fence",
    outcome: settlement.outcome,
    publicHold: settlement.publicHold,
    revoked: settlement.revoked
  });
}
