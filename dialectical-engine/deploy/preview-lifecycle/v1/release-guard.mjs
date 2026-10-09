// Before ANY import from the pinned release tree (root in unlock-team-tools.mjs, the postgres
// superuser in jit-creator-actor.mjs), run the same source check the reviewed launchers run.
//
// Plain words: root (or postgres) only loads release code after proving that every file of that
// release is still byte-for-byte what was reviewed and pinned, and that nobody but root could
// have changed the files it is about to load, or any folder above them up to the release root.
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, relative, sep } from 'node:path';
import { sha256 } from '../../preview-auth-dev/v1/custody.mjs';
import { readPublicArtifact } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { verifySourceManifest } from '../../preview-auth-dev/v1/source-manifest.mjs';

const OPERATOR_PREFIX = 'dialectical-engine/deploy/preview-auth-dev/v1/';
class ReleaseRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new ReleaseRefusal(code); };
const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.includes('\0');
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); };
const rootOnly = (stat, rootUid) => stat.uid === rootUid && (stat.mode & 0o022) === 0;

/** One directory on the way to an import: a real root-only folder, or a link that stays in the release and lands on one. */
async function checkDirectory(directory, sourceRoot, rootUid) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink()) {
    const target = await realpath(directory);
    if (!within(sourceRoot, target)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    const landed = await lstat(target);
    if (!landed.isDirectory() || !rootOnly(landed, rootUid)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    return;
  }
  if (!stat.isDirectory() || !rootOnly(stat, rootUid)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
}

/** The file, every folder of its named path and of its resolved path, up to and including the release root. */
export async function assertRootOnlyImport(path, { sourceRoot, rootUid = 0 }) {
  try {
    if (!absolute(path) || !absolute(sourceRoot) || !within(sourceRoot, path) || path === sourceRoot) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    if (await realpath(sourceRoot) !== sourceRoot) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    const resolved = await realpath(path);
    if (!within(sourceRoot, resolved)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    const file = await lstat(resolved);
    if (!file.isFile() || !rootOnly(file, rootUid)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
    for (const start of new Set([dirname(path), dirname(resolved)])) {
      for (let directory = start; ; directory = dirname(directory)) {
        await checkDirectory(directory, sourceRoot, rootUid);
        if (directory === sourceRoot) break;
        if (directory === dirname(directory)) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
      }
    }
  } catch { refuse('RELEASE_PATH_NOT_ROOT_ONLY'); }
}

/**
 * Exactly what launch-plan.mjs prepareLaunch does before a launcher imports anything (minus the
 * executing-entry binding, since this caller is not a release launcher): the pinned source
 * manifest, read through the launcher's reader (root-owned, hash-checked), verified as role
 * "api" against the release tree, plus the operator digest. Then each import path is root-only.
 */
export async function verifyReleaseForImport({ plan, importPaths, rootUid = 0, readArtifact = readPublicArtifact, verifyManifest = verifySourceManifest }) {
  let source;
  try {
    source = await readArtifact(plan.sourceManifest, 'source');
    if (source?.uid !== rootUid) refuse('RELEASE_UNVERIFIED');
    await verifyManifest(source, { sourceRevision: plan.sourceRevision, sourceTree: plan.sourceTree, sourceRoot: plan.sourceRoot, role: 'api', manifestSha256: plan.sourceManifest.sha256 });
    const operator = source.files.filter(file => file.path.startsWith(OPERATOR_PREFIX));
    if (sha256(JSON.stringify(operator)) !== plan.operatorManifestSha256) refuse('RELEASE_UNVERIFIED');
  } catch { refuse('RELEASE_UNVERIFIED'); }
  if (!Array.isArray(importPaths) || importPaths.length < 1) refuse('RELEASE_PATH_NOT_ROOT_ONLY');
  for (const path of importPaths) await assertRootOnlyImport(path, { sourceRoot: plan.sourceRoot, rootUid });
  return source;
}
