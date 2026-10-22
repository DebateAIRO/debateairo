// A release's key and slot, wherever its server keeps them (side-by-side plan D16b). Node built-ins only: this file is
// installed in the root-owned operator directory, which has no node_modules of its own.
//
// Plain words: the retirement tools (D6), the switch (D10) and the check (D11) all need to know which release key and
// which slot a release label names. They ask here and nowhere else, so the same tools serve both servers:
//   - the preview (layout.releaseSource 'lock'): root's release lock, read exactly as before (prestart.mjs readLock);
//   - the public server ('overlay'): the release's own overlay /etc/debateai/releases/<label>/api.env, written once by
//     the operator (deploy/vps/README.md §5 step 3): RELEASE_KEY, and API_PORT, which names the slot. Its code is
//     /opt/debateai/releases/<label>. Every overlay folder under that root is one release (an archived release's folder
//     was moved out, README §5 step 14).
// An overlay holds only values release-env.mjs lets a release change (DERIVED_KEYS.api), its key's number is its
// REGISTER_VERSION, and its API port is one slot's: anything else is refused, never guessed. Values read from it never
// leave this file but the key, the slot and the label.
import { lstat, readdir } from 'node:fs/promises';
import { readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { PREVIEW_SLOTS } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { LAYOUT, RELEASE_LABEL } from './common.mjs';
import { readLock } from './prestart.mjs';
import { DERIVED_KEYS } from './release-env.mjs';
import { RELEASE_KEY_PATTERN } from './release-table.mjs';

/** The overlay that names a release's key and slot (the API's: it alone carries API_PORT). */
export const OVERLAY_FILE = 'api.env';
/** The two slots of a layout; the preview's unless the layout names its own (side-by-side spec §6). */
export const slotsOf = layout => layout.slots ?? PREVIEW_SLOTS;

class ReleaseInfoRefusal extends Error { constructor(code) { super(code); this.name = 'ReleaseInfoRefusal'; this.code = code; } }
const refuse = code => { throw new ReleaseInfoRefusal(code); };
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
const fromOverlays = layout => layout.releaseSource === 'overlay';

/** One overlay, read as root holds it (0640, owner root, no link, every folder up to the overlay root root's). */
async function readOverlay(label, layout) {
  const root = layout.releaseOverlayRoot;
  const path = `${root}/${label}/${OVERLAY_FILE}`;
  const missing = await lstat(path).then(() => false, error => error?.code === 'ENOENT');
  if (missing) refuse('RELEASE_OVERLAY_MISSING');
  let values;
  try {
    values = await readEnvironmentFile(path, { root, uid: layout.ownerUid ?? 0, mode: 0o640 });
  } catch { refuse('RELEASE_OVERLAY_UNREADABLE'); }
  const keys = Object.keys(values);
  const releaseKey = values.RELEASE_KEY;
  if (!keys.every(key => DERIVED_KEYS.api.includes(key)) || typeof releaseKey !== 'string' || !RELEASE_KEY_PATTERN.test(releaseKey)
    || values.REGISTER_VERSION !== /^r([1-9][0-9]*)-/.exec(releaseKey)[1]) refuse('RELEASE_OVERLAY_REFUSED');
  const slots = slotsOf(layout);
  const slot = Object.keys(slots).find(name => slots[name].apiPort === values.API_PORT) ?? refuse('RELEASE_OVERLAY_REFUSED');
  return Object.freeze({ releaseKey, slot, sourceRoot: `${layout.releasesRoot}/${label}` });
}

/**
 * Every release the server knows, label → { releaseKey, slot, … }, in the lock's order (preview) or by label (public
 * server). The preview's entries also carry the lock's API source manifest digest (`apiManifestSha256`, null without
 * one), the public server's their folder (`sourceRoot`): what the release check (D11) compares the older manifest with.
 * `deps.readLock` replaces the lock reader (tests); a missing overlay root is a server with no release yet.
 */
export async function releaseInfos({ layout = LAYOUT, deps = {} } = {}) {
  if (!fromOverlays(layout)) {
    const { lock } = await (deps.readLock ?? readLock)(layout);
    return Object.freeze(Object.fromEntries(Object.entries(lock.releases).map(([label, release]) => [label, Object.freeze({
      releaseKey: release.releaseKey, slot: release.slot, apiManifestSha256: release.services?.api?.sourceManifestSha256 ?? null
    })])));
  }
  let names;
  try { names = await readdir(layout.releaseOverlayRoot); } catch (error) { return error?.code === 'ENOENT' ? Object.freeze({}) : refuse('RELEASE_OVERLAY_UNREADABLE'); }
  const releases = {};
  for (const name of names.sort()) {
    // The name first: an entry that is not a release label is never looked at.
    if (!isLabel(name)) refuse('RELEASE_OVERLAY_REFUSED');
    const stat = await lstat(`${layout.releaseOverlayRoot}/${name}`).catch(() => refuse('RELEASE_OVERLAY_UNREADABLE'));
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuse('RELEASE_OVERLAY_REFUSED');
    releases[name] = await readOverlay(name, layout);
  }
  return Object.freeze(releases);
}

/**
 * One release label's { releaseKey, slot, … }. A label that is not a release label refuses ARGUMENTS_REFUSED before
 * anything is read; a label the server does not know refuses RELEASE_LOCK_RELEASE_MISSING (preview) or
 * RELEASE_OVERLAY_MISSING (public server).
 */
export async function releaseInfo({ label, layout = LAYOUT, deps = {} }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  if (fromOverlays(layout)) return readOverlay(label, layout);
  const releases = await releaseInfos({ layout, deps });
  return Object.hasOwn(releases, label) ? releases[label] : refuse('RELEASE_LOCK_RELEASE_MISSING');
}
