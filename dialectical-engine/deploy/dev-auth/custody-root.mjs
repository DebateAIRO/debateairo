// Single resolver for the development key-custody root (F-05, L2-F1, L2-F2).
// Default: <repository>/.local/dev-auth. Override: DEBATEAI_DEV_CUSTODY_ROOT (absolute).
// Fail-closed: a custody root inside a cloud-synced folder is refused, so the
// source tree may stay synced between machines while keys never sync (R4).
import { realpathSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
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
  constructor(code, detail, options) {
    super(`${code}: ${detail}`, options);
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
 *
 * V-21(c): this is the ONLY place the rule is spelled. Every dev launcher asks
 * here and translates the refusal into the typed code it reports, so a change to
 * the policy cannot reach one command and miss another.
 *
 * An environment with no `process.getuid` cannot prove ownership, so it is
 * refused rather than waved through: an unprovable owner is not a safe one.
 */
export async function assertDevCustodyDirectory(directory) {
  const path = resolve(directory);
  const metadata = await lstat(path).catch(() => null);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (metadata === null
    || uid === null
    || metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || metadata.uid !== uid
    || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new DevCustodyRootError(
      "DEV_AUTH_CUSTODY_ROOT_INVALID",
      `${path} must be a directory you own with mode 0700; it is not repaired for you.`
    );
  }
}

/**
 * The create arm of the same policy, for the commands that build the custody
 * tree before they read it: create the directory at 0700 when it is absent, then
 * apply `assertDevCustodyDirectory` unchanged. An existing directory is never
 * chmod-ed back, so a drifted mode still surfaces (L7-F10). Not recursive: a
 * missing parent is a refusal, not something to invent.
 *
 * The filesystem error is kept as the refusal's `cause`: "you may not write
 * here" (EACCES) and "the mode drifted" are different faults with different
 * remedies, and a typed code that discards the errno spells them the same way.
 */
export async function ensureDevCustodyDirectory(directory) {
  const path = resolve(directory);
  try {
    await mkdir(path, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw new DevCustodyRootError(
        "DEV_AUTH_CUSTODY_ROOT_INVALID",
        `${path} could not be created as a directory you own with mode 0700.`,
        { cause: error }
      );
    }
  }
  await assertDevCustodyDirectory(path);
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
