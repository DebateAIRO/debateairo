// Single resolver for the development key-custody root (F-05, L2-F1, L2-F2).
// Default: <repository>/.local/dev-auth. Override: DEBATEAI_DEV_CUSTODY_ROOT (absolute).
// Fail-closed: a custody root inside a cloud-synced folder is refused, so the
// source tree may stay synced between machines while keys never sync (R4).
import { realpathSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export const DEV_CUSTODY_ROOT_ENV = "DEBATEAI_DEV_CUSTODY_ROOT";
const PRIVATE_DIRECTORY_MODE = 0o700;

function suggestedCustodyRoot() {
  return `${homedir()}/.debateai/dev-auth`;
}

// Matched per path segment after canonicalisation: the segment starts with the marker
// (case-insensitive) and the next character is absent or not a letter, so
// "OneDrive-adessoGroup", "OneDrive - adesso" and "Box Sync" match while "megan" and
// "boxes" do not. Explicit markers cover client folder names that are one word.
const CLOUD_SYNC_SEGMENT_PREFIXES = Object.freeze([
  "OneDrive",
  "Dropbox",
  "Nextcloud",
  "Proton Drive",
  "pCloud",
  "MEGA",
  "MEGAsync",
  "Google Drive",
  "GoogleDrive",
  "Box",
  "iCloud Drive"
].map((prefix) => prefix.toLowerCase()));

// Matched as two consecutive segments, case-insensitively.
const CLOUD_SYNC_SEGMENT_PAIRS = Object.freeze([
  Object.freeze(["Library", "CloudStorage"]),
  Object.freeze(["Library", "Mobile Documents"])
]);

export class DevCustodyRootError extends TypeError {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "DevCustodyRootError";
    this.code = code;
  }
}

// realpath of the deepest existing ancestor plus the not-yet-existing suffix, so a
// symlink anywhere above a custody root that is still to be created is seen through.
function canonicalPath(candidate) {
  let cursor = resolve(candidate);
  const suffix = [];
  while (true) {
    try {
      return join(realpathSync(cursor), ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      suffix.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function isLetter(character) {
  return character !== undefined && /\p{L}/u.test(character);
}

function findCloudSyncMarker(canonical) {
  const segments = canonical.split(/[\\/]+/u).filter((segment) => segment.length > 0);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const lowered = segment.toLowerCase();
    const next = segments[index + 1];
    for (const [head, tail] of CLOUD_SYNC_SEGMENT_PAIRS) {
      if (lowered === head.toLowerCase() && next?.toLowerCase() === tail.toLowerCase()) {
        return `${segment}/${next}`;
      }
    }
    if (CLOUD_SYNC_SEGMENT_PREFIXES.some((prefix) => (
      lowered.startsWith(prefix) && !isLetter(lowered[prefix.length])
    ))) {
      return segment;
    }
  }
  return undefined;
}

/**
 * Absolute custody root for development secrets. Honours DEBATEAI_DEV_CUSTODY_ROOT,
 * refuses a relative override (DEV_AUTH_CUSTODY_ROOT_RELATIVE) and any root that lives
 * in a cloud-synced folder (DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED). Returns the caller's
 * path (resolved, not canonicalised) so downstream lstat-based symlink refusals stay exact.
 */
export function resolveDevCustodyRoot(repositoryRoot, environment = process.env) {
  const override = environment[DEV_CUSTODY_ROOT_ENV]?.trim();
  const candidate = override !== undefined && override.length > 0
    ? override
    : resolve(repositoryRoot, ".local", "dev-auth");
  if (!isAbsolute(candidate)) {
    throw new DevCustodyRootError(
      "DEV_AUTH_CUSTODY_ROOT_RELATIVE",
      `${DEV_CUSTODY_ROOT_ENV} must be an absolute path, e.g. ${suggestedCustodyRoot()}.`
    );
  }
  const marker = findCloudSyncMarker(canonicalPath(candidate));
  if (marker !== undefined) {
    throw new DevCustodyRootError(
      "DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED",
      `dev key custody must not live in a cloud-synced folder (${marker}). `
      + `Set ${DEV_CUSTODY_ROOT_ENV} to a private absolute path, e.g. ${suggestedCustodyRoot()}; `
      + "the repository itself may stay synced."
    );
  }
  return resolve(candidate);
}

/**
 * One directory of the custody chain: a real directory, not a symlink, owned by
 * this uid, at exactly 0700. Never repaired — narrowing a drifted mode back
 * would hide the exposure event instead of surfacing it (L7-F10).
 */
export async function assertDevCustodyDirectory(directory) {
  const path = resolve(directory);
  const metadata = await lstat(path).catch(() => null);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (metadata === null
    || metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || (uid !== null && metadata.uid !== uid)
    || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new DevCustodyRootError(
      "DEV_AUTH_CUSTODY_ROOT_INVALID",
      `${path} must be a directory you own with mode 0700; it is not repaired for you.`
    );
  }
}

/**
 * The custody root and the parent it lives in, so a permissive parent is
 * refused by every command at the same point rather than passing one command
 * and failing another much later.
 */
export async function assertDevCustodyRootCustody(custodyRoot) {
  const root = resolve(custodyRoot);
  await assertDevCustodyDirectory(dirname(root));
  await assertDevCustodyDirectory(root);
}
