// Root ExecStartPre for debateai-preview-api@<label> / -ui@<label> / -runner@<label> (systemd `ExecStartPre=+`).
//
// Plain words: before every start or restart, re-run the reviewed database check, store its
// fresh receipt next to a copy of the pinned launch plan, and start only a release the owner
// pinned. The launcher then re-checks every byte exactly as before; nothing here relaxes it.
// Side-by-side spec §10: the lock pins up to four releases, one entry per service per release,
// and every per-release file, folder and unit instance is named by the release label.
//
//   prestart.mjs --service api|ui|runner --label <label>  refresh proof + plan (systemd runs this)
//   prestart.mjs pin --from <plan>                         pin one service of a reviewed release (operator)
//   prestart.mjs dropin --service api|ui|runner --label <label>  print that instance's release drop-in
//   prestart.mjs accept-ahead --label <label> --from <file>       record the newer release's database-ahead file
//   prestart.mjs unpin --label <label>                     drop a RETIRED release from the lock (the archive, D12)
//
// The runner may be pinned and given a release drop-in, but it is NOT in debateai-preview.target.
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exactKeys, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { RELEASE_KEY_PATTERN, expectedReleaseKey } from '../../preview-auth-dev/v1/environment.mjs';
import { RELEASE_LABEL, labelOfSourceRoot, readPublicArtifact, slotOfPorts, validateLaunchPlan as reviewedValidateLaunchPlan } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { validateNativeAttestation } from '../../preview-auth-dev/v1/native-attestation.mjs';
import { DATABASE_AHEAD_MAX_BYTES, DATABASE_AHEAD_SCHEMA, validateDatabaseAheadFile } from '../../preview-auth-dev/v1/database-ahead.mjs';
import { validatePublication } from '../../preview-auth-dev/v1/runtime-receipt.mjs';
import { LAYOUT, atomicWrite, canonicalJson, currentDirFor, databaseAheadPathFor, ensureDirectory, logLine, nativePlanPathFor, peerShimArgv, runBounded, sha256, unitNameFor } from './common.mjs';
import { readCurrentRelease, readReleaseState } from './release-table.mjs';

export const LOCK_SCHEMA = 'preview-lifecycle-release-lock-v2';
export { DATABASE_AHEAD_SCHEMA };
export const RELEASE_DROPIN_NAME = 'zzzzzzzzzz-lifecycle-release.conf';
const SERVICES = ['api', 'ui', 'runner'];
const FRONT = ['api', 'ui'];
const SLOTS = ['A', 'B'];
/** Side-by-side spec §10: the release before, the current one, the next, and one being archived. */
const MAX_RELEASES = 4;
/** The folder every release's code lives in; release-archive.mjs moves a retired release's folders out of it. */
export const RELEASES_ROOT = '/opt/debateai-v3-preview/releases';
const SOURCE_ROOT = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const GIT = /^[a-f0-9]{40}$/;
const RELEASE_KEYS = ['releaseKey', 'slot', 'databaseAhead', 'services'];
const ENTRY_KEYS = ['basePlan', 'nativePlanSha256', 'sourceRoot', 'sourceRevision', 'sourceTree', 'serviceUid', 'serviceGid', 'sourceManifestSha256', 'uiBuildSha256', 'operatorManifestSha256', 'publication', 'pinnedAt'];
/**
 * Side-by-side spec §4: a website or API starts only for a release that is (or is about to be) served;
 * a runner also for a DRAINING one (it still owns that release's open debates, database-ahead restart).
 */
export const STARTABLE = Object.freeze({ api: ['STAGED', 'CURRENT'], ui: ['STAGED', 'CURRENT'], runner: ['STAGED', 'CURRENT', 'DRAINING'] });
/** Side-by-side plan D: MemoryMax runner 3G (systemd shows bytes). */
export const RUNNER_MEMORY_MAX = '3221225472';
/** A fresh proof must still be young when the launcher reads it after its source re-hash. */
export const MAX_ATTESTATION_AGE_AT_WRITE_MS = 60_000;
export const NATIVE_VERIFY_TIMEOUT_MS = 150_000;
/** After a reboot the API/UI can start before PostgreSQL accepts connections; wait at most this long. */
export const POSTGRES_WAIT_MS = 60_000;
const POSTGRES_POLL_MS = 2000;

class Refusal extends Error {
  constructor(code, fields) { super(code); this.code = code; if (fields) this.fields = fields; }
}
const refuse = (code, fields) => { throw new Refusal(code, fields); };
const layoutOwner = layout => ({ uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0 });
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const planPathPattern = layout => new RegExp(`^${escape(layout.artifactsRoot)}/([a-z0-9-]+)/(api|ui|runner)-launch\\.json$`);
/** Every release's regenerated plans live in a lifecycle-current* folder; a base plan never does. */
const underLifecycleCurrent = (path, layout) => path.startsWith(`${layout.artifactsRoot}/lifecycle-current`);
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
/** Own keys only: a label such as `constructor` must never reach Object.prototype. */
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
/** The API folder of a release, where its native operator lives (side-by-side spec §10). */
const nativeSourceRootFor = label => `${RELEASES_ROOT}/auth-dev-candidate-${label}-api`;

/** Bounded, no-follow, owner/mode-checked read through the reviewed custody reader. */
async function readProtectedJson(path, { root, mode, maxBytes, layout, code }) {
  const { uid, gid } = layoutOwner(layout);
  try {
    return await withPrivateBytes(path, { root, uid, gid, mode, maxBytes }, raw => ({ value: strictJson(raw), sha256: sha256(raw) }));
  } catch { return refuse(code); }
}

function validEntry(entry, service, label, layout) {
  exactKeys(entry, ENTRY_KEYS);
  exactKeys(entry.basePlan, ['path', 'sha256']);
  const match = planPathPattern(layout).exec(entry.basePlan.path);
  if (!match || match[2] !== service || underLifecycleCurrent(entry.basePlan.path, layout) || !HASH.test(entry.basePlan.sha256)
    || !HASH.test(entry.nativePlanSha256) || !SOURCE_ROOT.test(entry.sourceRoot) || !GIT.test(entry.sourceRevision) || !GIT.test(entry.sourceTree)
    || !Number.isSafeInteger(entry.serviceUid) || entry.serviceUid < 1 || !Number.isSafeInteger(entry.serviceGid) || entry.serviceGid < 1
    || !HASH.test(entry.sourceManifestSha256) || !HASH.test(entry.operatorManifestSha256)
    || (service === 'ui' ? !HASH.test(entry.uiBuildSha256 ?? '') : entry.uiBuildSha256 !== null)
    || !isPlainObject(entry.publication)
    || typeof entry.pinnedAt !== 'string' || !Number.isFinite(Date.parse(entry.pinnedAt))) throw new Error('entry');
  if (labelOfSourceRoot(entry.sourceRoot, service) !== label) throw new Error('label');
  validatePublication(entry.publication);
  return entry;
}

/** One release: its key is its publication's and revision's, its services share one revision, tree and publication. */
function validRelease(release, label, layout) {
  exactKeys(release, RELEASE_KEYS);
  if (!RELEASE_KEY_PATTERN.test(release.releaseKey ?? '') || !SLOTS.includes(release.slot) || !isPlainObject(release.services)) throw new Error('release');
  if (release.databaseAhead !== null) {
    exactKeys(release.databaseAhead, ['path', 'sha256', 'newerLabel']);
    const { path, sha256: digest, newerLabel } = release.databaseAhead;
    if (path !== databaseAheadPathFor(layout, label) || !HASH.test(digest) || !isLabel(newerLabel) || newerLabel === label) throw new Error('ahead');
  }
  const services = Object.keys(release.services);
  if (services.length < 1 || services.some(service => !SERVICES.includes(service))) throw new Error('services');
  const [first, ...rest] = services.map(service => validEntry(release.services[service], service, label, layout));
  if (rest.some(entry => entry.sourceRevision !== first.sourceRevision || entry.sourceTree !== first.sourceTree || canonicalJson(entry.publication) !== canonicalJson(first.publication))) throw new Error('release');
  if (release.releaseKey !== expectedReleaseKey(first.publication, first.sourceRevision)) throw new Error('key');
}

/**
 * Strict: exact keys at every level, 1..4 releases under release labels, known services only, every
 * hash/identity well formed, every entry in its own label's folders, one release key per label.
 */
export function validateReleaseLock(value, layout = LAYOUT) {
  try {
    exactKeys(value, ['schema', 'releases']);
    if (value.schema !== LOCK_SCHEMA || !isPlainObject(value.releases)) throw new Error('schema');
    const labels = Object.keys(value.releases);
    if (labels.length < 1 || labels.length > MAX_RELEASES || !labels.every(isLabel)) throw new Error('releases');
    for (const label of labels) validRelease(value.releases[label], label, layout);
    if (new Set(labels.map(label => value.releases[label].releaseKey)).size !== labels.length) throw new Error('keys');
    return value;
  } catch { return refuse('RELEASE_LOCK_INVALID'); }
}

/** The fields the task pins: manifest, UI build, register publication, operator digest, identity. */
export function compareLaunchPlanToLock(plan, entry) {
  const observed = {
    sourceRoot: plan.sourceRoot, sourceRevision: plan.sourceRevision, sourceTree: plan.sourceTree, serviceUid: plan.serviceUid, serviceGid: plan.serviceGid,
    sourceManifestSha256: plan.sourceManifest?.sha256, uiBuildSha256: plan.uiBuild?.sha256 ?? null, operatorManifestSha256: plan.operatorManifestSha256,
    publication: canonicalJson(plan.publication)
  };
  return Object.keys(observed).filter(field => observed[field] !== (field === 'publication' ? canonicalJson(entry.publication) : entry[field]));
}

/**
 * Only the reviewed verify operation may ever run automatically; it must describe the pinned release.
 * With a `label`, the plan must also be that release's own (its API folder holds the native operator).
 */
export function checkNativePlan(nativePlan, entry, label) {
  const fields = [];
  if (nativePlan?.schema !== 'preview-auth-dev-native-plan-v1') fields.push('schema');
  if (nativePlan?.operation !== 'verify') fields.push('operation');
  const sourceRoot = nativePlan?.sourceRoot ?? '';
  if (!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(sourceRoot) || (label !== undefined && sourceRoot !== nativeSourceRootFor(label))) fields.push('sourceRoot');
  for (const key of ['sourceRevision', 'sourceTree', 'operatorManifestSha256']) if (nativePlan?.[key] !== entry[key]) fields.push(key);
  if (canonicalJson(nativePlan?.approval?.publication ?? null) !== canonicalJson(entry.publication)) fields.push('publication');
  return fields;
}

export async function readLock(layout = LAYOUT) {
  const { value, sha256: lockSha256 } = await readProtectedJson(layout.lockPath, { root: layout.lockRoot, mode: 0o644, maxBytes: 65536, layout, code: 'RELEASE_LOCK_UNREADABLE' });
  return { lock: validateReleaseLock(value, layout), lockSha256 };
}
const readNativePlan = (layout, label) => readProtectedJson(nativePlanPathFor(layout, label), { root: layout.nativePlanRoot, mode: 0o644, maxBytes: 32768, layout, code: 'NATIVE_PLAN_UNREADABLE' });
const readPlan = (path, layout) => readProtectedJson(path, { root: dirname(path), mode: 0o644, maxBytes: 32768, layout, code: 'BASE_PLAN_UNREADABLE' });

/** Validate, then write the lock root-owned and atomically; returns the new lock's sha256. */
async function writeLock(lock, layout) {
  const { uid, gid } = layoutOwner(layout);
  const bytes = Buffer.from(`${JSON.stringify(validateReleaseLock(lock, layout))}\n`);
  await ensureDirectory(layout.lockRoot, { mode: 0o755, uid }).catch(() => refuse('LOCK_DIRECTORY_REFUSED'));
  await atomicWrite(layout.lockPath, bytes, { mode: 0o644, uid, gid });
  return sha256(bytes);
}

/** The one line native-operator.mjs prints when verify finds a forward step the database lacks (verify-native.ts). */
const PENDING_FORWARD_STEP_LINE = /^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: (\d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63})\. Verify never applies a migration; run the native operator with operation apply-and-plan first\.\n$/;

/**
 * The one line native-operator.mjs prints when verify finds steps a newer release added and no database-ahead file was
 * handed to it (verify-native.ts NativeVerifyDatabaseAheadError, side-by-side spec §5).
 */
const DATABASE_AHEAD_LINE = /^PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD: the database has steps this release does not know: (\d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63})\. Pin the newer release's database-ahead file with prestart\.mjs accept-ahead first\.\n$/;

/**
 * Exact argv of the canonical verifier: release native-operator, as postgres, peer packet on FD3. `databaseAhead`
 * (side-by-side spec §5) adds `--database-ahead`: the operator then reads this release's pinned database-ahead file.
 */
export function nativeVerifyArgv({ layout, nodePath, sourceRoot, databaseAhead = false }) {
  const entry = `${sourceRoot}/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs`;
  return peerShimArgv({ sh: layout.sh, packet: layout.peerPacket, command: [layout.runuser, '-u', 'postgres', '--', layout.env, '-i',
    `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', nodePath, entry, '--credential-fd', '3', ...(databaseAhead ? ['--database-ahead'] : [])] });
}

export async function runNativeVerify({ layout, nodePath, sourceRoot, databaseAhead = false, run = runBounded, timeoutMs = NATIVE_VERIFY_TIMEOUT_MS }) {
  if (!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(sourceRoot) || typeof databaseAhead !== 'boolean') refuse('NATIVE_VERIFY_REFUSED');
  const result = await run(nativeVerifyArgv({ layout, nodePath, sourceRoot, databaseAhead }), { cwd: `${sourceRoot}/dialectical-engine`, env: {}, timeoutMs, maxOutputBytes: 262144 });
  if (result.timedOut) refuse('NATIVE_VERIFY_TIMEOUT');
  // Verify never applies a migration (verify-native.ts). A release whose forward step is not applied yet is refused
  // with its own reason, so the journal says what to do: the operator runs the native operator's apply-and-plan.
  const refused = !result.overflow && !result.error && result.code !== 0;
  const pending = refused ? PENDING_FORWARD_STEP_LINE.exec(String(result.stderr)) : null;
  if (pending) refuse('NATIVE_VERIFY_PENDING_FORWARD_STEP', { next: 'apply-and-plan', pending: pending[1].split(', ') });
  // Side-by-side spec §5: a database a newer release moved forward, with no database-ahead file pinned on this release:
  // the operator pins the newer release's file (prestart.mjs accept-ahead), then the restart verifies again.
  const ahead = refused ? DATABASE_AHEAD_LINE.exec(String(result.stderr)) : null;
  if (ahead) refuse('NATIVE_VERIFY_DATABASE_AHEAD', { next: 'accept-ahead', extra: ahead[1].split(', ') });
  if (result.overflow || result.error || result.code !== 0 || result.stderr.length > 0) refuse('NATIVE_VERIFY_REFUSED');
  try { return strictJson(result.stdout); } catch { return refuse('NATIVE_VERIFY_REFUSED'); }
}

/** pg_isready on the preview's own socket: no login, no password, no shell, empty environment. */
export function pgReadyArgv(layout) {
  return [`${layout.pgBin}/pg_isready`, `--host=${layout.pgSocketDir}`, `--port=${layout.pgPort}`, `--dbname=${layout.database}`, '--timeout=2', '--quiet'];
}

/** Bounded: polls every 2 s and refuses with POSTGRES_NOT_READY once 60 s would be exceeded. */
export async function waitForPostgres({ layout = LAYOUT, run = runBounded, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = POSTGRES_WAIT_MS, intervalMs = POSTGRES_POLL_MS } = {}) {
  const startedAt = now();
  for (let attempts = 1; ; attempts++) {
    const result = await run(pgReadyArgv(layout), { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
    if (!result.timedOut && !result.overflow && !result.error && result.code === 0) return { waitedMs: now() - startedAt, attempts };
    if (now() - startedAt + intervalMs > timeoutMs) refuse('POSTGRES_NOT_READY');
    await sleep(intervalMs);
  }
}

const tokens = value => (value ?? '').split(/\s+/).filter(Boolean).sort().join(' ');
/** `systemctl show <unit> --property=…` as systemd itself reports it; each property at most once. */
async function showUnit({ unit, properties, layout, run, code }) {
  const result = await run([layout.systemctl, 'show', unit, ...properties.map(property => `--property=${property}`), '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 16384 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) refuse(code);
  const shown = {};
  for (const line of String(result.stdout).split('\n').filter(Boolean)) {
    const at = line.indexOf('=');
    if (at < 1 || Object.hasOwn(shown, line.slice(0, at))) refuse(code);
    shown[line.slice(0, at)] = line.slice(at + 1);
  }
  return shown;
}

/**
 * The runner's confinement lives in its reviewed unit template; an older drop-in (the live host has
 * 42-provider-sdk-interfaces.conf, 99-provider-high-v1.conf, zzzz-glm-clarification-v1.conf) could
 * replace ExecStart or widen it. So before any database work the loaded instance must be exactly the
 * reviewed template plus the one generated instance release drop-in, with loopback-only IP, the four
 * reviewed address families and the runner's memory limit, as systemd itself reports them.
 */
export async function checkRunnerUnit({ label, layout = LAYOUT, run = runBounded }) {
  const unit = unitNameFor(layout, 'runner', label);
  const shown = await showUnit({ unit, properties: ['FragmentPath', 'DropInPaths', 'IPAddressAllow', 'IPAddressDeny', 'RestrictAddressFamilies', 'MemoryMax'], layout, run, code: 'RUNNER_UNIT_UNREADABLE' });
  const unitDir = unitDirOf(layout);
  const fields = [];
  if (shown.FragmentPath !== `${unitDir}/${layout.unitPrefix}runner@.service`) fields.push('FragmentPath');
  if (shown.DropInPaths !== `${unitDir}/${unit}.d/${RELEASE_DROPIN_NAME}`) fields.push('DropInPaths');
  if (tokens(shown.IPAddressAllow) !== tokens('127.0.0.0/8 ::1/128')) fields.push('IPAddressAllow');
  if (tokens(shown.IPAddressDeny) !== tokens('0.0.0.0/0 ::/0')) fields.push('IPAddressDeny');
  if (tokens(shown.RestrictAddressFamilies) !== tokens('AF_UNIX AF_INET AF_INET6 AF_NETLINK')) fields.push('RestrictAddressFamilies');
  if (shown.MemoryMax !== RUNNER_MEMORY_MAX) fields.push('MemoryMax');
  if (fields.length) refuse('RUNNER_UNIT_REFUSED', fields);
}

/**
 * Website and API instances: the instance loads the reviewed template file itself (not the old fixed unit,
 * not a runtime or instance-only file of the same name), every drop-in comes from the template's folder,
 * except the one instance release drop-in, which must be there (it is what points the instance at its own
 * release). The website is bound to its own release's API instance.
 */
export async function checkFrontUnit({ service, label, layout = LAYOUT, run = runBounded }) {
  if (!FRONT.includes(service)) refuse('SERVICE_REFUSED');
  const unit = unitNameFor(layout, service, label);
  const shown = await showUnit({ unit, properties: service === 'ui' ? ['FragmentPath', 'DropInPaths', 'BindsTo'] : ['FragmentPath', 'DropInPaths'], layout, run, code: 'FRONT_UNIT_UNREADABLE' });
  const unitDir = unitDirOf(layout);
  const templateDir = `${unitDir}/${layout.unitPrefix}${service}@.service.d/`;
  const releaseDropin = `${unitDir}/${unit}.d/${RELEASE_DROPIN_NAME}`;
  const fromTemplate = path => path.startsWith(templateDir) && /^[A-Za-z0-9._-]+\.conf$/.test(path.slice(templateDir.length));
  const paths = (shown.DropInPaths ?? '').split(/\s+/).filter(Boolean);
  const fields = [];
  if (shown.FragmentPath !== `${unitDir}/${layout.unitPrefix}${service}@.service`) fields.push('FragmentPath');
  if (!paths.includes(releaseDropin) || !paths.every(path => path === releaseDropin || fromTemplate(path))) fields.push('DropInPaths');
  if (service === 'ui' && shown.BindsTo !== unitNameFor(layout, 'api', label)) fields.push('BindsTo');
  if (fields.length) refuse('FRONT_UNIT_REFUSED', fields);
}

const UNIT_STATES = ['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'refreshing'];
/** True unless systemd says the unit is inactive or failed: a starting or stopping website still holds its port. */
export async function unitIsActive({ unit, layout = LAYOUT, run = runBounded }) {
  const result = await run([layout.systemctl, 'show', unit, '--property=ActiveState', '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) refuse('UNIT_STATE_UNREADABLE');
  const match = /^ActiveState=([a-z]+)\n?$/.exec(String(result.stdout));
  if (!match || !UNIT_STATES.includes(match[1])) refuse('UNIT_STATE_UNREADABLE');
  return !['inactive', 'failed'].includes(match[1]);
}

/**
 * Lock -> the release's pinned base plan (hash-checked, schema-checked, field-for-field equal to the
 * lock, its ports the release's slot). `lock` is returned too, so later gates read the same bytes.
 */
export async function loadPinnedRelease({ service, label, layout = LAYOUT, validateLaunchPlan: validatePlan = reviewedValidateLaunchPlan }) {
  if (!SERVICES.includes(service)) refuse('SERVICE_REFUSED');
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const { lock, lockSha256 } = await readLock(layout);
  const release = own(lock.releases, label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
  const entry = own(release.services, service) ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
  const base = await readPlan(entry.basePlan.path, layout);
  if (base.sha256 !== entry.basePlan.sha256) refuse('BASE_PLAN_HASH_MISMATCH');
  try { validatePlan(base.value); } catch { refuse('BASE_PLAN_INVALID'); }
  if (base.value.service !== service) refuse('BASE_PLAN_INVALID');
  const mismatched = compareLaunchPlanToLock(base.value, entry);
  let slot = null;
  try { slot = slotOfPorts(base.value.uiPort, base.value.apiPort); } catch { /* reported as a slot mismatch below */ }
  if (slot !== release.slot) mismatched.push('slot');
  if (mismatched.length) refuse('RELEASE_LOCK_MISMATCH', mismatched);
  return { release, entry, plan: base.value, lockSha256, lock };
}

/**
 * The ExecStartPre body. Order matters: every cheap gate runs before the database is touched;
 * then a bounded wait for PostgreSQL (after a reboot it may still be starting); then the release
 * table must say this release may start (side-by-side spec §4) and, for a website or API, no other
 * live release may hold its slot (§6); the slow verifier runs last so the proof is as young as
 * possible when ExecStart begins.
 */
export async function runPrestart({ service, label, layout = LAYOUT, deps = {} }) {
  const now = deps.now ?? Date.now;
  const validatePlan = deps.validateLaunchPlan ?? reviewedValidateLaunchPlan;
  const startedAt = now();
  const { release, entry, plan: basePlan, lockSha256, lock } = await loadPinnedRelease({ service, label, layout, validateLaunchPlan: validatePlan });
  if (service === 'runner') await (deps.checkRunnerUnit ?? checkRunnerUnit)({ label, layout });
  else await (deps.checkFrontUnit ?? checkFrontUnit)({ service, label, layout });
  const nativePlan = await readNativePlan(layout, label);
  if (nativePlan.sha256 !== entry.nativePlanSha256) refuse('NATIVE_PLAN_HASH_MISMATCH');
  const nativeProblems = checkNativePlan(nativePlan.value, entry, label);
  if (nativeProblems.length) refuse('NATIVE_PLAN_MISMATCH', nativeProblems);
  let nativeSourceSha256;
  try { nativeSourceSha256 = await (deps.readSourceNativeSha256 ?? (async plan => (await readPublicArtifact(plan.sourceManifest, 'source')).nativeSha256))(basePlan); } catch { refuse('SOURCE_MANIFEST_UNREADABLE'); }

  const postgres = await (deps.waitForPostgres ?? (() => waitForPostgres({ layout })))();

  // RELEASE_TABLE_UNREADABLE (and any other typed refusal of the reader) passes through as is.
  const { state } = await (deps.readReleaseState ?? (input => readReleaseState({ ...input, layout })))({ releaseKey: release.releaseKey });
  if (!STARTABLE[service].includes(state)) refuse('RELEASE_STATE_REFUSED', { state });
  if (service !== 'runner') {
    const isActive = deps.isActive ?? (unit => unitIsActive({ unit, layout }));
    for (const other of Object.keys(lock.releases)) {
      if (other === label || lock.releases[other].slot !== release.slot) continue;
      for (const front of FRONT) if (await isActive(unitNameFor(layout, front, other))) refuse('SLOT_IN_USE', { label: other });
    }
  }

  const verifyStartedAt = now();
  // Side-by-side spec §5: database-ahead mode exactly when the lock pins a database-ahead file on this release.
  const proof = await (deps.verifyNative ?? (input => runNativeVerify({ layout, nodePath: process.execPath, ...input })))({ sourceRoot: nativePlan.value.sourceRoot, databaseAhead: release.databaseAhead !== null });
  const verifiedAt = now();
  // The verifier re-reads the native plan itself; the proof only counts if it read the bytes checked above.
  const nativePlanAfter = await readNativePlan(layout, label).catch(() => refuse('NATIVE_PLAN_CHANGED'));
  if (nativePlanAfter.sha256 !== nativePlan.sha256) refuse('NATIVE_PLAN_CHANGED');
  try {
    // A proof made beside a newer database must name exactly the file the lock pinned (none pinned: it must not name one).
    validateNativeAttestation(proof, { sourceRevision: entry.sourceRevision, sourceTree: entry.sourceTree, nativeSourceSha256, publication: entry.publication, databaseAheadSha256: release.databaseAhead?.sha256 ?? null }, verifiedAt);
  } catch { refuse('NATIVE_ATTESTATION_INVALID'); }

  const { uid, gid } = layoutOwner(layout);
  const currentDir = currentDirFor(layout, label);
  await ensureDirectory(currentDir, { mode: 0o755, uid }).catch(() => refuse('CURRENT_DIRECTORY_REFUSED'));
  const attestationBytes = Buffer.from(JSON.stringify(proof));
  const attestationPath = join(currentDir, `${service}-native.json`);
  const plan = { ...basePlan, nativeAttestation: { path: attestationPath, sha256: sha256(attestationBytes) } };
  try { validatePlan(plan); } catch { refuse('REGENERATED_PLAN_INVALID'); }
  const planBytes = Buffer.from(JSON.stringify(plan));
  // Attestation first: a crash in between leaves the old plan naming the old proof, which the launcher refuses.
  await atomicWrite(attestationPath, attestationBytes, { mode: 0o644, uid, gid }).catch(() => refuse('WRITE_REFUSED'));
  await atomicWrite(join(currentDir, `${service}-launch.json`), planBytes, { mode: 0o644, uid, gid }).catch(() => refuse('WRITE_REFUSED'));
  const attestationAgeMs = now() - Date.parse(proof.verifiedAt);
  if (!(attestationAgeMs <= MAX_ATTESTATION_AGE_AT_WRITE_MS)) refuse('ATTESTATION_TOO_OLD');
  return {
    event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service, label, releaseKey: release.releaseKey, registerVersion: entry.publication.registerVersion, sourceRevision: entry.sourceRevision,
    lockSha256, planSha256: sha256(planBytes), attestationSha256: plan.nativeAttestation.sha256,
    postgresWaitMs: postgres.waitedMs, verifyMs: verifiedAt - verifyStartedAt, totalMs: now() - startedAt, attestationAgeMs
  };
}

/**
 * Operator command, once per service of a NEW release: record exactly what may restart unattended.
 * Adds or replaces only `releases[<label>].services[<service>]`; every other label stays byte-for-byte.
 * A v1 lock on disk refuses RELEASE_LOCK_INVALID: the transition moves it aside first.
 */
export async function pinRelease({ planPath, layout = LAYOUT, deps = {}, now = Date.now }) {
  const validatePlan = deps.validateLaunchPlan ?? reviewedValidateLaunchPlan;
  if (typeof planPath !== 'string' || !planPathPattern(layout).test(planPath) || underLifecycleCurrent(planPath, layout)) refuse('PIN_SOURCE_REFUSED');
  const base = await readPlan(planPath, layout);
  try { validatePlan(base.value); } catch { refuse('BASE_PLAN_INVALID'); }
  const plan = base.value;
  if (!planPath.endsWith(`/${plan.service}-launch.json`) || !SERVICES.includes(plan.service)) refuse('PIN_SOURCE_REFUSED');
  let label, slot;
  try { label = labelOfSourceRoot(plan.sourceRoot, plan.service); slot = slotOfPorts(plan.uiPort, plan.apiPort); } catch { refuse('BASE_PLAN_INVALID'); }
  const nativePlan = await readNativePlan(layout, label);
  const entry = {
    basePlan: { path: planPath, sha256: base.sha256 }, nativePlanSha256: nativePlan.sha256,
    sourceRoot: plan.sourceRoot, sourceRevision: plan.sourceRevision, sourceTree: plan.sourceTree, serviceUid: plan.serviceUid, serviceGid: plan.serviceGid,
    sourceManifestSha256: plan.sourceManifest.sha256, uiBuildSha256: plan.uiBuild?.sha256 ?? null, operatorManifestSha256: plan.operatorManifestSha256,
    publication: plan.publication, pinnedAt: new Date(now()).toISOString()
  };
  const nativeProblems = checkNativePlan(nativePlan.value, entry, label);
  if (nativeProblems.length) refuse('NATIVE_PLAN_MISMATCH', nativeProblems);
  // Only a missing lock may be created from scratch; a damaged (or v1) one needs the operator's eyes first.
  const present = await lstat(layout.lockPath).then(() => true, error => (error.code === 'ENOENT' ? false : refuse('RELEASE_LOCK_UNREADABLE')));
  const releases = present ? (await readLock(layout)).lock.releases : {};
  const existing = own(releases, label) ?? null;
  const others = existing ? Object.keys(existing.services).filter(service => service !== plan.service).map(service => existing.services[service]) : [];
  let release;
  if (others.length) {
    const conflicts = [];
    if (others[0].sourceRevision !== entry.sourceRevision) conflicts.push('sourceRevision');
    if (canonicalJson(others[0].publication) !== canonicalJson(entry.publication)) conflicts.push('publication');
    if (existing.slot !== slot) conflicts.push('slot');
    if (conflicts.length) refuse('PIN_RELEASE_CONFLICT', conflicts);
    release = { ...existing, services: { ...existing.services, [plan.service]: entry } };
  } else {
    // The release's first (or only re-pinned) service decides its key and slot; a database-ahead record survives only for the same key.
    const releaseKey = expectedReleaseKey(plan.publication, plan.sourceRevision);
    release = { releaseKey, slot, databaseAhead: existing?.releaseKey === releaseKey ? existing.databaseAhead : null, services: { [plan.service]: entry } };
  }
  const lockSha256 = await writeLock({ schema: LOCK_SCHEMA, releases: { ...releases, [label]: release } }, layout);
  return { event: 'PREVIEW_LIFECYCLE_RELEASE_PINNED', service: plan.service, label, releaseKey: release.releaseKey, slot: release.slot, sourceRevision: plan.sourceRevision, registerVersion: plan.publication.registerVersion, basePlanSha256: base.sha256, lockSha256 };
}

/**
 * Side-by-side spec §5: the older release may (re)start beside a newer database only with the newer
 * release's root-owned list of extra steps. Checks the whole file (database-ahead.mjs), that the newer release it
 * names is pinned in the lock at the revision it names, and records its path
 * and hash on the older release; the native verify (D5) re-reads it, checks the steps against the newer
 * release's source manifest and the database, and its proof must name this hash.
 */
export async function acceptAhead({ label, fromPath, layout = LAYOUT }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  if (fromPath !== databaseAheadPathFor(layout, label)) refuse('DATABASE_AHEAD_REFUSED');
  const { lock } = await readLock(layout);
  const release = own(lock.releases, label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
  const file = await readProtectedJson(fromPath, { root: layout.nativePlanRoot, mode: 0o644, maxBytes: DATABASE_AHEAD_MAX_BYTES, layout, code: 'DATABASE_AHEAD_UNREADABLE' });
  const ahead = file.value;
  const revision = Object.values(release.services)[0].sourceRevision;
  try { validateDatabaseAheadFile(ahead); } catch { refuse('DATABASE_AHEAD_REFUSED'); }
  if (ahead.olderLabel !== label || ahead.olderSourceRevision !== revision || ahead.newerLabel === label) refuse('DATABASE_AHEAD_REFUSED');
  // The newer release is one root pinned, at the revision the file names (D5 review).
  const newer = own(lock.releases, ahead.newerLabel);
  if (!newer || Object.values(newer.services)[0].sourceRevision !== ahead.newerSourceRevision) refuse('DATABASE_AHEAD_REFUSED');
  const databaseAhead = { path: fromPath, sha256: file.sha256, newerLabel: ahead.newerLabel };
  const lockSha256 = await writeLock({ ...lock, releases: { ...lock.releases, [label]: { ...release, databaseAhead } } }, layout);
  return { event: 'PREVIEW_LIFECYCLE_DATABASE_AHEAD_PINNED', label, releaseKey: release.releaseKey, newerLabel: ahead.newerLabel, databaseAheadSha256: file.sha256, lockSha256 };
}

/** Drop a release the release table calls RETIRED from the lock (the archive step, D12). Never another state. */
export async function unpinRelease({ label, layout = LAYOUT, deps = {} }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const { lock } = await readLock(layout);
  const release = own(lock.releases, label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
  const { state } = await (deps.readReleaseState ?? (input => readReleaseState({ ...input, layout })))({ releaseKey: release.releaseKey });
  if (state !== 'RETIRED') refuse('RELEASE_STATE_REFUSED', { state });
  const releases = Object.fromEntries(Object.entries(lock.releases).filter(([other]) => other !== label));
  const lockSha256 = await writeLock({ ...lock, releases }, layout);
  return { event: 'PREVIEW_LIFECYCLE_RELEASE_UNPINNED', label, releaseKey: release.releaseKey, lockSha256 };
}

/** The lock label of the release the release table names current (the unlock and the creator run its API release). */
export async function currentLabel({ layout = LAYOUT, run = runBounded, readLock: read = readLock, readCurrent = readCurrentRelease } = {}) {
  const { lock } = await read(layout);
  const current = await readCurrent({ layout, run });
  const labels = current ? Object.keys(lock.releases).filter(label => lock.releases[label].releaseKey === current.releaseKey) : [];
  if (labels.length !== 1) refuse('CURRENT_RELEASE_UNPINNED');
  return labels[0];
}

const UNIT_SAFE = /^\/[A-Za-z0-9/._-]+$/;
const CLEAN_PATH = 'PATH=/usr/sbin:/usr/bin:/sbin:/bin';
/**
 * The restart settings of systemd/<api|ui>.service.d/50-lifecycle.conf, repeated in the release
 * drop-in. Older release drop-ins on the server set `Restart=no` and sort after `50-`, so they
 * would cancel the automatic restart; the ten-z drop-in sorts last, so these values win.
 * tests/unit/preview-lifecycle-units.test.ts keeps them equal to both 50-lifecycle.conf files.
 */
export const LIFECYCLE_RESTART = Object.freeze({
  unit: Object.freeze([['StartLimitIntervalSec', '900'], ['StartLimitBurst', '4'], ['OnFailure', 'debateai-preview-alert@%n.service']]),
  service: Object.freeze([['Restart', 'on-failure'], ['RestartMode', 'direct'], ['RestartSec', '30'], ['TimeoutStartSec', '300']])
});
/**
 * The instance's release drop-in. systemd sorts the drop-ins of an instance and of its template
 * together by file name; this one sorts last, so its ExecStart= reset wins.
 */
export function renderReleaseDropin({ service, label, entry, lockSha256, nodePath, prestartPath, layout = LAYOUT }) {
  let ownRelease = false;
  try { ownRelease = isLabel(label) && labelOfSourceRoot(entry.sourceRoot, service) === label; } catch { /* refused below */ }
  if (!SERVICES.includes(service) || !ownRelease || ![nodePath, prestartPath, entry.sourceRoot, layout.artifactsRoot, layout.env].every(path => UNIT_SAFE.test(path))) refuse('DROPIN_REFUSED');
  const engine = `${entry.sourceRoot}/dialectical-engine`;
  // The runner keeps its reviewed unit's Restart=no (a crash mid-call halts the spending gate, and an
  // automatic start would re-dispatch queued debates without a fresh ask): no restart keys for it.
  const restart = service === 'runner'
    ? ['# The runner keeps Restart=no from its reviewed unit file; it is never restarted automatically.', '[Service]']
    : ['# It also repeats the restart settings of 50-lifecycle.conf: an older drop-in with Restart=no sorts after 50-.',
      '[Unit]', ...LIFECYCLE_RESTART.unit.map(([key, value]) => `${key}=${value}`),
      '[Service]', ...LIFECYCLE_RESTART.service.map(([key, value]) => `${key}=${value}`)];
  return [
    `# Generated by: prestart.mjs dropin --service ${service} --label ${label}`,
    `# Release lock sha256 ${lockSha256}; source ${entry.sourceRevision}; register ${entry.publication.registerVersion}.`,
    `# Install as ${unitDirOf(layout)}/${unitNameFor(layout, service, label)}.d/${RELEASE_DROPIN_NAME}`,
    '# It sorts after every other drop-in of this instance and its template, so the ExecStart= reset below wins.',
    ...restart,
    `WorkingDirectory=${service === 'ui' ? `${engine}/apps/ui` : engine}`,
    // `+` runs as root but would inherit the service's Environment=/EnvironmentFile= (NODE_OPTIONS,
    // secrets). env -i starts node with PATH only; prestart reads nothing else from the environment.
    `ExecStartPre=+${layout.env} -i ${CLEAN_PATH} ${nodePath} ${prestartPath} --service ${service} --label ${label}`,
    'ExecStart=',
    // The runner launcher's default is prepare-only; starting it is the explicit --start mode.
    `ExecStart=${nodePath} ${engine}/deploy/preview-auth-dev/v1/launch-${service}.mjs ${service === 'runner' ? '--start ' : ''}--plan ${currentDirFor(layout, label)}/${service}-launch.json`,
    ''
  ].join('\n');
}

/** Exact argv shapes only; a label that is not a release label refuses before any path, unit or database is touched. */
function parseArguments(argv) {
  const [first, second, third, fourth, fifth] = argv;
  const n = argv.length;
  const isService = value => SERVICES.includes(value);
  const isPath = value => typeof value === 'string' && value.length > 0;
  if (n === 4 && first === '--service' && isService(second) && third === '--label' && isLabel(fourth)) return { command: 'prestart', service: second, label: fourth };
  if (n === 3 && first === 'pin' && second === '--from' && isPath(third)) return { command: 'pin', planPath: third };
  if (n === 5 && first === 'dropin' && second === '--service' && isService(third) && fourth === '--label' && isLabel(fifth)) return { command: 'dropin', service: third, label: fifth };
  if (n === 5 && first === 'accept-ahead' && second === '--label' && isLabel(third) && fourth === '--from' && isPath(fifth)) return { command: 'accept-ahead', label: third, fromPath: fifth };
  if (n === 3 && first === 'unpin' && second === '--label' && isLabel(third)) return { command: 'unpin', label: third };
  return refuse('ARGUMENTS_REFUSED');
}

export async function main(argv, { platform = process.platform, uid = process.getuid?.() } = {}) {
  const args = parseArguments(argv);
  if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
  if (args.command === 'prestart') return runPrestart({ service: args.service, label: args.label });
  if (args.command === 'pin') return pinRelease({ planPath: args.planPath });
  if (args.command === 'accept-ahead') return acceptAhead({ label: args.label, fromPath: args.fromPath });
  if (args.command === 'unpin') return unpinRelease({ label: args.label });
  const { lock, lockSha256 } = await readLock(LAYOUT);
  const release = own(lock.releases, args.label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
  const entry = own(release.services, args.service) ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
  process.stdout.write(renderReleaseDropin({ service: args.service, label: args.label, entry, lockSha256, nodePath: process.execPath, prestartPath: fileURLToPath(import.meta.url) }));
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Only checked values reach the journal (content-free logs).
  let context = {};
  try { const { service, label } = parseArguments(process.argv.slice(2)); context = { ...(service ? { service } : {}), ...(label ? { label } : {}) }; } catch { /* refused again by main */ }
  try {
    const result = await main(process.argv.slice(2));
    if (result) logLine(process.stdout, result);
  } catch (error) {
    logLine(process.stderr, { event: 'PREVIEW_LIFECYCLE_PRESTART_REFUSED', ...context, reason: error instanceof Refusal ? error.code : 'UNEXPECTED', ...(error?.fields ? { fields: error.fields } : {}) });
    process.exitCode = 1;
  }
}
