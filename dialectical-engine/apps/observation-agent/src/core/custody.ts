import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertDevCustodyDirectory } from "../../../../deploy/dev-auth/custody-root.mjs";
import { ObservationError } from "./errors.js";

/**
 * DL7-F1. The Hatchet tenant token was read with a plain `readFile`: no symlink
 * refusal, no owner check, no mode check — the one secret the agent hands to a
 * remote party was the one file it never vetted. The custody rule is the
 * project's, not a second opinion: the directory check is
 * {@link assertDevCustodyDirectory} from the dev-auth custody loader, reused
 * verbatim, and the file itself must be a plain, private, singly-linked file
 * this uid owns.
 */
const PRIVATE_FILE_MODE = 0o600;
const MAX_SECRET_FILE_BYTES = 64 * 1024;

export const OBSERVATION_SECRET_CUSTODY_INVALID = "OBSERVATION_SECRET_CUSTODY_INVALID";

function currentUid(): number | null {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

/**
 * The contents of a custody-checked secret file. Never trimmed, never repaired,
 * never named in the failure: the caller gets a typed code and the path it
 * already knows.
 */
export async function readCustodiedSecretFile(path: string): Promise<string> {
  const secretPath = resolve(path);
  try {
    await assertDevCustodyDirectory(dirname(secretPath));
  } catch (error) {
    throw new ObservationError(OBSERVATION_SECRET_CUSTODY_INVALID, error);
  }
  let handle;
  try {
    handle = await open(secretPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new ObservationError(OBSERVATION_SECRET_CUSTODY_INVALID, error);
  }
  try {
    const metadata = await handle.stat();
    const uid = currentUid();
    if (!metadata.isFile()
      || metadata.nlink !== 1
      || (uid !== null && metadata.uid !== uid)
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > MAX_SECRET_FILE_BYTES) {
      throw new ObservationError(OBSERVATION_SECRET_CUSTODY_INVALID);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
