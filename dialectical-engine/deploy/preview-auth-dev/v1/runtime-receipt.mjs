import { readFile } from 'node:fs/promises';
import { exactKeys, refuse, strictJson } from './custody.mjs';
import { RELEASE_KEY_PATTERN } from './environment.mjs';
const HASH = /^[0-9a-f]{64}$/;
const GIT = /^[0-9a-f]{40}$/;
const VERSION = /^[1-9][0-9]{0,15}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The two deployment modes the preview may run (environment.mjs narrowEnvironment; hosted: owner rulings 2026-10-13). */
const MODES = Object.freeze(['local', 'hosted']);
const BINDING = ['sourceRevision','sourceTree','sourceManifestSha256','operatorManifestSha256','contractSha256','apiMainSha256'];
const KEYS = ['schemaVersion','service',...BINDING,'pid','uid','bootId','startTicks','selectedRegisterVersion','releaseKey','nativeRequestSha256','nativeSnapshotSha256','deploymentMode'];
/**
 * Side-by-side uploads spec 2026-10-21 §1: the release a preview process runs as is
 * r<selected register version>-<first 12 hex of the plan's source revision>, so its startup event
 * names exactly the release the plan bound, never another (v2 events: API and runner alike).
 */
const planReleaseKey = (selectedRegisterVersion, sourceRevision) =>
  typeof sourceRevision === 'string' ? `r${selectedRegisterVersion}-${sourceRevision.slice(0, 12)}` : null;
/** launch-plan.mjs RELEASE_LABEL's body (kept here: launch-plan.mjs imports this file); preview-auth-dev-operator.test.ts pins the two equal. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?';
/** Side-by-side spec §10: the one unit a release's API or runner runs in, its own instance `debateai-preview-<service>@<label>.service`. */
export const PREVIEW_INSTANCE_UNITS = Object.freeze({
  api: new RegExp(`^debateai-preview-api@${LABEL}\\.service$`),
  runner: new RegExp(`^debateai-preview-runner@${LABEL}\\.service$`)
});
export function validatePublication(receipt) {
  if (!receipt || receipt.publicationKind !== 'GENERAL' || !UUID.test(receipt.publicationId)
    || !VERSION.test(receipt.registerVersion) || !VERSION.test(receipt.baseRegisterVersion)
    || BigInt(receipt.registerVersion) <= BigInt(receipt.baseRegisterVersion)
    || !HASH.test(receipt.requestSha256) || !HASH.test(receipt.snapshotSha256)
    || !Number.isSafeInteger(receipt.rowCount) || receipt.rowCount < 1
    || !Number.isFinite(new Date(receipt.recordedAt).getTime())) refuse('PREVIEW_NATIVE_RECEIPT_REFUSED');
  return receipt;
}
export function validateRuntimeEvent(event) {
  exactKeys(event, KEYS, 'PREVIEW_RUNTIME_RECEIPT_REFUSED');
  if (event.schemaVersion !== 'preview-auth-dev-startup-v2' || event.service !== 'api'
    || !GIT.test(event.sourceRevision) || !GIT.test(event.sourceTree)
    || BINDING.slice(2).some(key => !HASH.test(event[key]))
    || !Number.isSafeInteger(event.pid) || event.pid < 1 || !Number.isSafeInteger(event.uid) || event.uid < 1
    || !UUID.test(event.bootId) || !/^[1-9][0-9]{0,19}$/.test(event.startTicks)
    || !VERSION.test(event.selectedRegisterVersion) || !MODES.includes(event.deploymentMode)
    || event.releaseKey !== planReleaseKey(event.selectedRegisterVersion, event.sourceRevision)
    || !HASH.test(event.nativeRequestSha256) || !HASH.test(event.nativeSnapshotSha256)) refuse('PREVIEW_RUNTIME_RECEIPT_REFUSED');
  return Object.freeze({ ...event });
}
export async function linuxProcessIdentity() {
  if (process.platform !== 'linux' || !process.getuid || process.getuid() === 0) refuse('PREVIEW_LINUX_ACTOR_REQUIRED');
  const bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'ascii')).trim();
  const stat = await readFile('/proc/self/stat', 'ascii');
  const close = stat.lastIndexOf(')');
  // The comm field may contain spaces or parentheses; starttime is field22 (index19 after comm).
  const startTicks = stat.slice(close + 2).split(' ')[19];
  return { pid: process.pid, uid: process.getuid(), bootId, startTicks };
}
/**
 * The process's normalized selection, read before and after main: register version, release key and mode. The key
 * must be a release key of the plan's register version (side-by-side spec §1); that it names the plan's own source
 * revision is checked by the event validators.
 */
function selected(source, publication) {
  const version = String(source.REGISTER_VERSION), releaseKey = source.RELEASE_KEY;
  if (!VERSION.test(version) || !Number.isSafeInteger(Number(version)) || version !== publication.registerVersion
    || typeof releaseKey !== 'string' || !RELEASE_KEY_PATTERN.test(releaseKey) || !releaseKey.startsWith(`r${publication.registerVersion}-`)
    || !MODES.includes(source.DEBATEAI_DEPLOYMENT_MODE)) refuse('PREVIEW_RUNTIME_SELECTION_REFUSED');
  return { selectedRegisterVersion: version, releaseKey, deploymentMode: source.DEBATEAI_DEPLOYMENT_MODE };
}
/** Pure orchestration seam; the executable supplies the real main import and Linux identity. */
export async function afterApiListen({ binding, publication, identity, readSelection, importMain, emit }) {
  validatePublication(publication); exactKeys(binding, BINDING, 'PREVIEW_RUNTIME_BINDING_REFUSED');
  const before = selected(readSelection(), publication);
  const event = validateRuntimeEvent({ schemaVersion:'preview-auth-dev-startup-v2', service:'api', ...binding, ...identity,
    ...before, nativeRequestSha256:publication.requestSha256, nativeSnapshotSha256:publication.snapshotSha256 });
  await importMain();
  const after = selected(readSelection(), publication);
  if (JSON.stringify(before) !== JSON.stringify(after)) refuse('PREVIEW_RUNTIME_SELECTION_REFUSED');
  emit(event);
  return event;
}
export function parseRuntimeEvent(line) {
  if (typeof line !== 'string' || Buffer.byteLength(line) > 4096 || !line.startsWith('PREVIEW_API_STARTED ')) refuse('PREVIEW_RUNTIME_RECEIPT_REFUSED');
  return validateRuntimeEvent(strictJson(Buffer.from(line.slice('PREVIEW_API_STARTED '.length))));
}
/** Root's independent readback for the API: the event must match this release's live instance unit, process and key (side-by-side spec §1, §10). */
export function verifyRuntimeReadback(event, observed, facts) {
  validateRuntimeEvent(event); validateRuntimeEvent(observed); validatePublication(facts.publication);
  if (KEYS.some(key => event[key] !== observed[key]) || facts.unit !== facts.expectedUnit
    || typeof facts.expectedUnit !== 'string' || !PREVIEW_INSTANCE_UNITS.api.test(facts.expectedUnit) || event.releaseKey !== facts.releaseKey
    || facts.rootMatched !== true || facts.listenerMatched !== true
    || ![200,401,403].includes(facts.httpStatus) || event.selectedRegisterVersion !== facts.publication.registerVersion
    || event.nativeRequestSha256 !== facts.publication.requestSha256 || event.nativeSnapshotSha256 !== facts.publication.snapshotSha256) refuse('PREVIEW_RUNTIME_READBACK_REFUSED');
  return Object.freeze({ selectionVerified: true, service:'api', registerVersion:event.selectedRegisterVersion, pid:event.pid });
}
// The runner has no listener. Its startup evidence is the in-process readiness message the real
// main announces after its worker is ready and its start-up re-dispatch has finished.
const RUNNER_BINDING = ['sourceRevision','sourceTree','sourceManifestSha256','operatorManifestSha256','contractSha256','runnerMainSha256'];
const RUNNER_KEYS = ['schemaVersion','service',...RUNNER_BINDING,'pid','uid','bootId','startTicks','selectedRegisterVersion','releaseKey','nativeRequestSha256','nativeSnapshotSha256','deploymentMode','startupDispatched'];
/** The exact keys of the runner's ready message (apps/runner/src/runner-ready.ts RunnerReadyMessage). */
const RUNNER_READY_KEYS = ['kind','registerVersion','releaseKey','startupDispatched','worker'];
export function validateRunnerRuntimeEvent(event) {
  exactKeys(event, RUNNER_KEYS, 'PREVIEW_RUNTIME_RECEIPT_REFUSED');
  if (event.schemaVersion !== 'preview-auth-dev-runner-startup-v2' || event.service !== 'runner'
    || !GIT.test(event.sourceRevision) || !GIT.test(event.sourceTree)
    || RUNNER_BINDING.slice(2).some(key => !HASH.test(event[key]))
    || !Number.isSafeInteger(event.pid) || event.pid < 1 || !Number.isSafeInteger(event.uid) || event.uid < 1
    || !UUID.test(event.bootId) || !/^[1-9][0-9]{0,19}$/.test(event.startTicks)
    || !VERSION.test(event.selectedRegisterVersion) || !MODES.includes(event.deploymentMode)
    || event.releaseKey !== planReleaseKey(event.selectedRegisterVersion, event.sourceRevision)
    || !HASH.test(event.nativeRequestSha256) || !HASH.test(event.nativeSnapshotSha256)
    || !Number.isSafeInteger(event.startupDispatched) || event.startupDispatched < 0 || event.startupDispatched > 100) refuse('PREVIEW_RUNTIME_RECEIPT_REFUSED');
  return Object.freeze({ ...event });
}
/**
 * Pure orchestration seam; the executable supplies the real main import, its readiness
 * subscription and the Linux identity. Emits only after the real main announced readiness and
 * the normalized register selection is unchanged. A main that fails or ends before readiness
 * emits nothing. Returns the event and the still-running main, whose later failure the caller sees.
 */
export const RUNNER_READY_DEADLINE_MS = 120_000;
export async function afterRunnerReady({ binding, publication, identity, readSelection, importMain, subscribeReady, emit, readyDeadlineMs = RUNNER_READY_DEADLINE_MS }) {
  validatePublication(publication); exactKeys(binding, RUNNER_BINDING, 'PREVIEW_RUNTIME_BINDING_REFUSED');
  const before = selected(readSelection(), publication);
  // Every field but the count is checked before main runs, exactly as the API's event is. The release
  // key is the runner's own RELEASE_KEY, which must be the plan's (side-by-side spec §1): its register
  // pin and the first 12 hex of its source revision.
  const draft = validateRunnerRuntimeEvent({ schemaVersion:'preview-auth-dev-runner-startup-v2', service:'runner', ...binding, ...identity,
    ...before, nativeRequestSha256:publication.requestSha256, nativeSnapshotSha256:publication.snapshotSha256, startupDispatched:0 });
  let announce;
  const announced = new Promise(resolve => { announce = resolve; });
  const unsubscribe = subscribeReady(message => announce(message));
  let message, running, deadline;
  try {
    running = Promise.resolve().then(importMain);
    // Before readiness any end of main (failure included) is the one code below, never its text.
    // A failure after readiness is the caller's, through `running`.
    running.catch(() => {});
    const ended = running.then(() => null, () => null);
    // Readiness must come within the deadline (worker ready in 30 s, then at most 100 re-dispatches).
    const late = new Promise(resolve => { deadline = setTimeout(() => resolve(null), readyDeadlineMs); });
    const first = await Promise.race([announced.then(value => ({ value })), ended, late]);
    if (first === null) refuse('PREVIEW_RUNNER_NOT_READY');
    message = first.value;
  } finally { clearTimeout(deadline); unsubscribe(); }
  // A ready line without the release key, or naming another release, is not this plan's runner ready (spec §1).
  if (!message || Object.getPrototypeOf(message) !== Object.prototype
    || Object.keys(message).sort().join('\0') !== RUNNER_READY_KEYS.join('\0')
    || message.kind !== 'DEBATEAI_RUNNER_READY' || message.registerVersion !== before.selectedRegisterVersion
    || message.releaseKey !== before.releaseKey) refuse('PREVIEW_RUNNER_NOT_READY');
  const after = selected(readSelection(), publication);
  if (JSON.stringify(before) !== JSON.stringify(after)) refuse('PREVIEW_RUNTIME_SELECTION_REFUSED');
  const event = validateRunnerRuntimeEvent({ ...draft, startupDispatched:message.startupDispatched });
  emit(event);
  return { event, running };
}
export function parseRunnerRuntimeEvent(line) {
  if (typeof line !== 'string' || Buffer.byteLength(line) > 4096 || !line.startsWith('PREVIEW_RUNNER_STARTED ')) refuse('PREVIEW_RUNTIME_RECEIPT_REFUSED');
  return validateRunnerRuntimeEvent(strictJson(Buffer.from(line.slice('PREVIEW_RUNNER_STARTED '.length))));
}
/** Root's independent readback for the runner: the event must match this release's live instance unit, process, selection and key (side-by-side spec §1, §10). */
export function verifyRunnerRuntimeReadback(event, observed, facts) {
  validateRunnerRuntimeEvent(event); validateRunnerRuntimeEvent(observed); validatePublication(facts.publication);
  if (RUNNER_KEYS.filter(key => key !== 'startupDispatched').some(key => event[key] !== observed[key]) || facts.unit !== facts.expectedUnit
    || typeof facts.expectedUnit !== 'string' || !PREVIEW_INSTANCE_UNITS.runner.test(facts.expectedUnit) || event.releaseKey !== facts.releaseKey
    || facts.rootMatched !== true || facts.mainPidMatched !== true
    || event.selectedRegisterVersion !== facts.publication.registerVersion
    || event.nativeRequestSha256 !== facts.publication.requestSha256 || event.nativeSnapshotSha256 !== facts.publication.snapshotSha256) refuse('PREVIEW_RUNTIME_READBACK_REFUSED');
  return Object.freeze({ selectionVerified: true, service:'runner', registerVersion:event.selectedRegisterVersion, pid:event.pid });
}
