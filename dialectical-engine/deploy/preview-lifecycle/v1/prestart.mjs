// Root ExecStartPre for debateai-preview-api / -ui / -runner (systemd `ExecStartPre=+`).
//
// Plain words: before every start or restart, re-run the reviewed database check, store its
// fresh receipt next to a copy of the pinned launch plan, and start only the release the owner
// pinned. The launcher then re-checks every byte exactly as before; nothing here relaxes it.
//
//   prestart.mjs --service api|ui|runner  refresh proof + plan (systemd runs this)
//   prestart.mjs pin --from <plan>        pin a NEW reviewed release (operator, once per release)
//   prestart.mjs dropin --service api|ui|runner  print the release drop-in for the pinned release
//
// The runner may be pinned and given a release drop-in, but it is NOT in debateai-preview.target:
// it starts only by hand (deploy/preview-auth-dev/v1/debateai-preview-runner.service).
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exactKeys, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { readPublicArtifact, validateLaunchPlan as reviewedValidateLaunchPlan } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { validateNativeAttestation } from '../../preview-auth-dev/v1/native-attestation.mjs';
import { validatePublication } from '../../preview-auth-dev/v1/runtime-receipt.mjs';
import { LAYOUT, atomicWrite, canonicalJson, ensureDirectory, logLine, peerShimArgv, runBounded, sha256 } from './common.mjs';

export const LOCK_SCHEMA = 'preview-lifecycle-release-lock-v1';
export const RELEASE_DROPIN_NAME = 'zzzzzzzzzz-lifecycle-release.conf';
const SERVICES = ['api', 'ui', 'runner'];
const SOURCE_ROOT = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const GIT = /^[a-f0-9]{40}$/;
const ENTRY_KEYS = ['basePlan', 'nativePlanSha256', 'sourceRoot', 'sourceRevision', 'sourceTree', 'serviceUid', 'serviceGid', 'sourceManifestSha256', 'uiBuildSha256', 'operatorManifestSha256', 'publication', 'pinnedAt'];
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
const artifactsRoot = layout => layout.artifactsRoot ?? '/opt/debateai-v3-preview/artifacts';
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const planPathPattern = layout => new RegExp(`^${escape(artifactsRoot(layout))}/[a-z0-9-]+/(api|ui|runner)-launch\\.json$`);

/** Bounded, no-follow, owner/mode-checked read through the reviewed custody reader. */
async function readProtectedJson(path, { root, mode, maxBytes, layout, code }) {
  const { uid, gid } = layoutOwner(layout);
  try {
    return await withPrivateBytes(path, { root, uid, gid, mode, maxBytes }, raw => ({ value: strictJson(raw), sha256: sha256(raw) }));
  } catch { return refuse(code); }
}

function validEntry(entry, service, layout) {
  exactKeys(entry, ENTRY_KEYS);
  exactKeys(entry.basePlan, ['path', 'sha256']);
  const match = planPathPattern(layout).exec(entry.basePlan.path);
  if (!match || match[1] !== service || entry.basePlan.path.startsWith(`${layout.currentDir}/`) || !HASH.test(entry.basePlan.sha256)
    || !HASH.test(entry.nativePlanSha256) || !SOURCE_ROOT.test(entry.sourceRoot) || !GIT.test(entry.sourceRevision) || !GIT.test(entry.sourceTree)
    || !Number.isSafeInteger(entry.serviceUid) || entry.serviceUid < 1 || !Number.isSafeInteger(entry.serviceGid) || entry.serviceGid < 1
    || !HASH.test(entry.sourceManifestSha256) || !HASH.test(entry.operatorManifestSha256)
    || (service === 'ui' ? !HASH.test(entry.uiBuildSha256 ?? '') : entry.uiBuildSha256 !== null)
    || entry.publication === null || typeof entry.publication !== 'object' || Object.getPrototypeOf(entry.publication) !== Object.prototype
    || typeof entry.pinnedAt !== 'string' || !Number.isFinite(Date.parse(entry.pinnedAt))) throw new Error('entry');
  validatePublication(entry.publication);
}

/** Strict: exact keys at every level, known services only, every hash/identity well formed. */
export function validateReleaseLock(value, layout = LAYOUT) {
  try {
    exactKeys(value, ['schema', 'services']);
    if (value.schema !== LOCK_SCHEMA || !value.services || Object.getPrototypeOf(value.services) !== Object.prototype) throw new Error('schema');
    const services = Object.keys(value.services);
    if (services.length < 1 || services.some(service => !SERVICES.includes(service))) throw new Error('services');
    for (const service of services) validEntry(value.services[service], service, layout);
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

/** Only the reviewed verify operation may ever run automatically; it must describe the pinned release. */
export function checkNativePlan(nativePlan, entry) {
  const fields = [];
  if (nativePlan?.schema !== 'preview-auth-dev-native-plan-v1') fields.push('schema');
  if (nativePlan?.operation !== 'verify') fields.push('operation');
  if (!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(nativePlan?.sourceRoot ?? '')) fields.push('sourceRoot');
  for (const key of ['sourceRevision', 'sourceTree', 'operatorManifestSha256']) if (nativePlan?.[key] !== entry[key]) fields.push(key);
  if (canonicalJson(nativePlan?.approval?.publication ?? null) !== canonicalJson(entry.publication)) fields.push('publication');
  return fields;
}

export async function readLock(layout = LAYOUT) {
  const { value, sha256: lockSha256 } = await readProtectedJson(layout.lockPath, { root: layout.lockRoot, mode: 0o644, maxBytes: 65536, layout, code: 'RELEASE_LOCK_UNREADABLE' });
  return { lock: validateReleaseLock(value, layout), lockSha256 };
}
const readNativePlan = layout => readProtectedJson(layout.nativePlanPath, { root: layout.nativePlanRoot, mode: 0o644, maxBytes: 32768, layout, code: 'NATIVE_PLAN_UNREADABLE' });
const readPlan = (path, layout) => readProtectedJson(path, { root: dirname(path), mode: 0o644, maxBytes: 32768, layout, code: 'BASE_PLAN_UNREADABLE' });

/** Exact argv of the canonical verifier: release native-operator, as postgres, peer packet on FD3. */
export function nativeVerifyArgv({ layout, nodePath, sourceRoot }) {
  const entry = `${sourceRoot}/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs`;
  return peerShimArgv({ sh: layout.sh, packet: layout.peerPacket, command: [layout.runuser, '-u', 'postgres', '--', layout.env, '-i',
    `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', nodePath, entry, '--credential-fd', '3'] });
}

export async function runNativeVerify({ layout, nodePath, sourceRoot, run = runBounded, timeoutMs = NATIVE_VERIFY_TIMEOUT_MS }) {
  if (!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(sourceRoot)) refuse('NATIVE_VERIFY_REFUSED');
  const result = await run(nativeVerifyArgv({ layout, nodePath, sourceRoot }), { cwd: `${sourceRoot}/dialectical-engine`, env: {}, timeoutMs, maxOutputBytes: 262144 });
  if (result.timedOut) refuse('NATIVE_VERIFY_TIMEOUT');
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

export const RUNNER_UNIT = 'debateai-preview-runner.service';
const tokens = value => (value ?? '').split(/\s+/).filter(Boolean).sort().join(' ');
/**
 * The runner's confinement lives in its reviewed unit file; an older drop-in (the live host has
 * 42-provider-sdk-interfaces.conf, 99-provider-high-v1.conf, zzzz-glm-clarification-v1.conf) could
 * replace ExecStart or widen it. So before any database work the loaded unit must be exactly the
 * reviewed file plus the one generated release drop-in, with loopback-only IP and the four
 * reviewed address families, as systemd itself reports them.
 */
export async function checkRunnerUnit({ layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.systemctl, 'show', RUNNER_UNIT, '--property=FragmentPath', '--property=DropInPaths',
    '--property=IPAddressAllow', '--property=IPAddressDeny', '--property=RestrictAddressFamilies', '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 16384 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) refuse('RUNNER_UNIT_UNREADABLE');
  const shown = {};
  for (const line of String(result.stdout).split('\n').filter(Boolean)) {
    const at = line.indexOf('=');
    if (at < 1 || Object.hasOwn(shown, line.slice(0, at))) refuse('RUNNER_UNIT_UNREADABLE');
    shown[line.slice(0, at)] = line.slice(at + 1);
  }
  const unitDir = layout.systemdUnitDir ?? '/etc/systemd/system';
  const fields = [];
  if (shown.FragmentPath !== `${unitDir}/${RUNNER_UNIT}`) fields.push('FragmentPath');
  if (shown.DropInPaths !== `${unitDir}/${RUNNER_UNIT}.d/${RELEASE_DROPIN_NAME}`) fields.push('DropInPaths');
  if (tokens(shown.IPAddressAllow) !== tokens('127.0.0.0/8 ::1/128')) fields.push('IPAddressAllow');
  if (tokens(shown.IPAddressDeny) !== tokens('0.0.0.0/0 ::/0')) fields.push('IPAddressDeny');
  if (tokens(shown.RestrictAddressFamilies) !== tokens('AF_UNIX AF_INET AF_INET6 AF_NETLINK')) fields.push('RestrictAddressFamilies');
  if (fields.length) refuse('RUNNER_UNIT_REFUSED', fields);
}

/** Lock -> pinned base plan (hash-checked, schema-checked, field-for-field equal to the lock). */
export async function loadPinnedRelease({ service, layout = LAYOUT, validateLaunchPlan: validatePlan = reviewedValidateLaunchPlan }) {
  if (!SERVICES.includes(service)) refuse('SERVICE_REFUSED');
  const { lock, lockSha256 } = await readLock(layout);
  const entry = lock.services[service] ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
  const base = await readPlan(entry.basePlan.path, layout);
  if (base.sha256 !== entry.basePlan.sha256) refuse('BASE_PLAN_HASH_MISMATCH');
  try { validatePlan(base.value); } catch { refuse('BASE_PLAN_INVALID'); }
  if (base.value.service !== service) refuse('BASE_PLAN_INVALID');
  const mismatched = compareLaunchPlanToLock(base.value, entry);
  if (mismatched.length) refuse('RELEASE_LOCK_MISMATCH', mismatched);
  return { entry, plan: base.value, lockSha256 };
}

/**
 * The ExecStartPre body. Order matters: every cheap gate runs before the database is touched;
 * then a bounded wait for PostgreSQL (after a reboot it may still be starting); the slow
 * verifier runs last so the proof is as young as possible when ExecStart begins.
 */
export async function runPrestart({ service, layout = LAYOUT, deps = {} }) {
  const now = deps.now ?? Date.now;
  const validatePlan = deps.validateLaunchPlan ?? reviewedValidateLaunchPlan;
  const startedAt = now();
  const { entry, plan: basePlan, lockSha256 } = await loadPinnedRelease({ service, layout, validateLaunchPlan: validatePlan });
  if (service === 'runner') await (deps.checkRunnerUnit ?? (() => checkRunnerUnit({ layout })))();
  const nativePlan = await readNativePlan(layout);
  if (nativePlan.sha256 !== entry.nativePlanSha256) refuse('NATIVE_PLAN_HASH_MISMATCH');
  const nativeProblems = checkNativePlan(nativePlan.value, entry);
  if (nativeProblems.length) refuse('NATIVE_PLAN_MISMATCH', nativeProblems);
  let nativeSourceSha256;
  try { nativeSourceSha256 = await (deps.readSourceNativeSha256 ?? (async plan => (await readPublicArtifact(plan.sourceManifest, 'source')).nativeSha256))(basePlan); } catch { refuse('SOURCE_MANIFEST_UNREADABLE'); }

  const postgres = await (deps.waitForPostgres ?? (() => waitForPostgres({ layout })))();

  const verifyStartedAt = now();
  const proof = await (deps.verifyNative ?? (input => runNativeVerify({ layout, nodePath: process.execPath, ...input })))({ sourceRoot: nativePlan.value.sourceRoot });
  const verifiedAt = now();
  // The verifier re-reads native-plan.json itself; the proof only counts if it read the bytes checked above.
  const nativePlanAfter = await readNativePlan(layout).catch(() => refuse('NATIVE_PLAN_CHANGED'));
  if (nativePlanAfter.sha256 !== nativePlan.sha256) refuse('NATIVE_PLAN_CHANGED');
  try {
    validateNativeAttestation(proof, { sourceRevision: entry.sourceRevision, sourceTree: entry.sourceTree, nativeSourceSha256, publication: entry.publication }, verifiedAt);
  } catch { refuse('NATIVE_ATTESTATION_INVALID'); }

  const { uid, gid } = layoutOwner(layout);
  await ensureDirectory(layout.currentDir, { mode: 0o755, uid }).catch(() => refuse('CURRENT_DIRECTORY_REFUSED'));
  const attestationBytes = Buffer.from(JSON.stringify(proof));
  const attestationPath = join(layout.currentDir, `${service}-native.json`);
  const plan = { ...basePlan, nativeAttestation: { path: attestationPath, sha256: sha256(attestationBytes) } };
  try { validatePlan(plan); } catch { refuse('REGENERATED_PLAN_INVALID'); }
  const planBytes = Buffer.from(JSON.stringify(plan));
  // Attestation first: a crash in between leaves the old plan naming the old proof, which the launcher refuses.
  await atomicWrite(attestationPath, attestationBytes, { mode: 0o644, uid, gid }).catch(() => refuse('WRITE_REFUSED'));
  await atomicWrite(join(layout.currentDir, `${service}-launch.json`), planBytes, { mode: 0o644, uid, gid }).catch(() => refuse('WRITE_REFUSED'));
  const attestationAgeMs = now() - Date.parse(proof.verifiedAt);
  if (!(attestationAgeMs <= MAX_ATTESTATION_AGE_AT_WRITE_MS)) refuse('ATTESTATION_TOO_OLD');
  return {
    event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service, registerVersion: entry.publication.registerVersion, sourceRevision: entry.sourceRevision,
    lockSha256, planSha256: sha256(planBytes), attestationSha256: plan.nativeAttestation.sha256,
    postgresWaitMs: postgres.waitedMs, verifyMs: verifiedAt - verifyStartedAt, totalMs: now() - startedAt, attestationAgeMs
  };
}

/** Operator command for a NEW release: record exactly what may restart unattended. */
export async function pinRelease({ planPath, layout = LAYOUT, deps = {}, now = Date.now }) {
  const validatePlan = deps.validateLaunchPlan ?? reviewedValidateLaunchPlan;
  if (typeof planPath !== 'string' || !planPathPattern(layout).test(planPath) || planPath.startsWith(`${layout.currentDir}/`)) refuse('PIN_SOURCE_REFUSED');
  const base = await readPlan(planPath, layout);
  try { validatePlan(base.value); } catch { refuse('BASE_PLAN_INVALID'); }
  const plan = base.value;
  if (!planPath.endsWith(`/${plan.service}-launch.json`) || !SERVICES.includes(plan.service)) refuse('PIN_SOURCE_REFUSED');
  const nativePlan = await readNativePlan(layout);
  const entry = {
    basePlan: { path: planPath, sha256: base.sha256 }, nativePlanSha256: nativePlan.sha256,
    sourceRoot: plan.sourceRoot, sourceRevision: plan.sourceRevision, sourceTree: plan.sourceTree, serviceUid: plan.serviceUid, serviceGid: plan.serviceGid,
    sourceManifestSha256: plan.sourceManifest.sha256, uiBuildSha256: plan.uiBuild?.sha256 ?? null, operatorManifestSha256: plan.operatorManifestSha256,
    publication: plan.publication, pinnedAt: new Date(now()).toISOString()
  };
  const nativeProblems = checkNativePlan(nativePlan.value, entry);
  if (nativeProblems.length) refuse('NATIVE_PLAN_MISMATCH', nativeProblems);
  const { uid, gid } = layoutOwner(layout);
  // Only a missing lock may be created from scratch; a damaged one needs the operator's eyes first.
  const present = await lstat(layout.lockPath).then(() => true, error => (error.code === 'ENOENT' ? false : refuse('RELEASE_LOCK_UNREADABLE')));
  const services = present ? (await readLock(layout)).lock.services : {};
  const lock = validateReleaseLock({ schema: LOCK_SCHEMA, services: { ...services, [plan.service]: entry } }, layout);
  await ensureDirectory(layout.lockRoot, { mode: 0o755, uid }).catch(() => refuse('LOCK_DIRECTORY_REFUSED'));
  const bytes = Buffer.from(`${JSON.stringify(lock)}\n`);
  await atomicWrite(layout.lockPath, bytes, { mode: 0o644, uid, gid });
  return { event: 'PREVIEW_LIFECYCLE_RELEASE_PINNED', service: plan.service, sourceRevision: plan.sourceRevision, registerVersion: plan.publication.registerVersion, basePlanSha256: base.sha256, lockSha256: sha256(bytes) };
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
/** The release-specific drop-in. It sorts after every existing release drop-in so its ExecStart= reset wins. */
export function renderReleaseDropin({ service, entry, lockSha256, nodePath, prestartPath, layout = LAYOUT }) {
  if (!SERVICES.includes(service) || ![nodePath, prestartPath, entry.sourceRoot, layout.currentDir, layout.env].every(path => UNIT_SAFE.test(path))) refuse('DROPIN_REFUSED');
  const engine = `${entry.sourceRoot}/dialectical-engine`;
  return [
    `# Generated by: prestart.mjs dropin --service ${service}`,
    `# Release lock sha256 ${lockSha256}; source ${entry.sourceRevision}; register ${entry.publication.registerVersion}.`,
    `# Install as /etc/systemd/system/debateai-preview-${service}.service.d/${RELEASE_DROPIN_NAME}`,
    '# It sorts after zzzzzzzzz-auth-dev-task12-final.conf, so the ExecStart= reset below wins.',
    '# It also repeats the restart settings of 50-lifecycle.conf: an older drop-in with Restart=no sorts after 50-.',
    '[Unit]',
    ...LIFECYCLE_RESTART.unit.map(([key, value]) => `${key}=${value}`),
    '[Service]',
    ...LIFECYCLE_RESTART.service.map(([key, value]) => `${key}=${value}`),
    `WorkingDirectory=${service === 'ui' ? `${engine}/apps/ui` : engine}`,
    // `+` runs as root but would inherit the service's Environment=/EnvironmentFile= (NODE_OPTIONS,
    // secrets). env -i starts node with PATH only; prestart reads nothing else from the environment.
    `ExecStartPre=+${layout.env} -i ${CLEAN_PATH} ${nodePath} ${prestartPath} --service ${service}`,
    'ExecStart=',
    // The runner launcher's default is prepare-only; starting it is the explicit --start mode.
    `ExecStart=${nodePath} ${engine}/deploy/preview-auth-dev/v1/launch-${service}.mjs ${service === 'runner' ? '--start ' : ''}--plan ${layout.currentDir}/${service}-launch.json`,
    ''
  ].join('\n');
}

async function main(argv) {
  const [first, second, third, ...rest] = argv;
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || rest.length) refuse('ACTOR_REFUSED');
  if (first === '--service' && third === undefined) return runPrestart({ service: second });
  if (first === 'pin' && second === '--from' && typeof third === 'string') return pinRelease({ planPath: third });
  if (first === 'dropin' && second === '--service' && typeof third === 'string') {
    const { lock, lockSha256 } = await readLock(LAYOUT);
    const entry = lock.services[third] ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
    process.stdout.write(renderReleaseDropin({ service: third, entry, lockSha256, nodePath: process.execPath, prestartPath: fileURLToPath(import.meta.url) }));
    return null;
  }
  return refuse('ARGUMENTS_REFUSED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = process.argv[2] === '--service' ? process.argv[3] : undefined;
  try {
    const result = await main(process.argv.slice(2));
    if (result) logLine(process.stdout, result);
  } catch (error) {
    logLine(process.stderr, { event: 'PREVIEW_LIFECYCLE_PRESTART_REFUSED', ...(service ? { service } : {}), reason: error instanceof Refusal ? error.code : 'UNEXPECTED', ...(error?.fields ? { fields: error.fields } : {}) });
    process.exitCode = 1;
  }
}
