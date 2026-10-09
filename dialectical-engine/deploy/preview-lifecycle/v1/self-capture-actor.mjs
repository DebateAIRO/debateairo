// Runs as the API service identity (uid/gid/groups), started by unlock-team-tools.mjs.
//
// Plain words: send ONE real test alert through the configured alert sender to the LOCAL
// capture receiver, wait for that receiver to acknowledge the exact message, and print a new
// proof (hashes, ids and an expiry 5 minutes after the acknowledgement). It refuses unless the
// protected configuration points at the local capture address, so it can never email anyone.
// Ported from the reviewed task-12 genuine self-capture controller, minus its wrapper rewrite.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exactKeys, strictJson } from '../../preview-auth-dev/v1/custody.mjs';

const ENGINE = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}\/dialectical-engine$/;
export const LOCAL_CAPTURE_RECIPIENT = 'preview-security@capture.invalid';
const refuse = code => { throw Object.assign(new Error(code), { code }); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !/[\0\r\n]/.test(path);

export function parseSelfCaptureControl(bytes) {
  try {
    const value = exactKeys(strictJson(bytes), ['engine', 'configPath', 'operatorPath', 'operatorSha256']);
    if (!ENGINE.test(value.engine) || !absolute(value.configPath) || !absolute(value.operatorPath) || !/^[a-f0-9]{64}$/.test(value.operatorSha256)) throw new Error('control');
    return value;
  } catch { return refuse('SELF_CAPTURE_INPUT_REFUSED'); }
}

/** The probe may only ever go to the local capture receiver. */
export function assertLocalCaptureConfig(config) {
  if (config?.schema !== 'staff-independent-alert-config-v1' || config.recipient !== LOCAL_CAPTURE_RECIPIENT || !absolute(config.executable)) refuse('SELF_CAPTURE_NOT_LOCAL');
  return config;
}

/** Root-owned, not writable by others, no link anywhere on the path, bounded. */
async function protectedBytes(path, maxBytes) {
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const stat = await lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || await realpath(parent) !== parent) refuse('SELF_CAPTURE_CUSTODY_REFUSED');
    if (parent === dirname(parent)) break;
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.nlink !== 1 || stat.size < 2 || stat.size > maxBytes) refuse('SELF_CAPTURE_CUSTODY_REFUSED');
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) refuse('SELF_CAPTURE_CUSTODY_REFUSED');
    return bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

async function main() {
  if (process.platform !== 'linux' || process.getuid?.() === 0) refuse('SELF_CAPTURE_ACTOR_REFUSED');
  const chunks = [];
  for await (const chunk of process.stdin) { chunks.push(chunk); if (Buffer.concat(chunks).length > 4096) refuse('SELF_CAPTURE_INPUT_REFUSED'); }
  const control = parseSelfCaptureControl(Buffer.concat(chunks));
  const { tsImport } = await import(pathToFileURL(`${control.engine}/node_modules/tsx/dist/esm/api/index.mjs`).href);
  const [alerts, runtime] = await Promise.all([tsImport(`${control.engine}/apps/api/src/staff/alerts.ts`, import.meta.url), tsImport(`${control.engine}/apps/api/src/staff/runtime.ts`, import.meta.url)]);
  const operator = await runtime.loadStaffAlertOperator({ path: control.operatorPath, sha256: control.operatorSha256 });
  try {
    const configBytes = await protectedBytes(control.configPath, 4096);
    const config = assertLocalCaptureConfig(JSON.parse(configBytes.toString('utf8')));
    const selected = operator.acknowledgements.get(config.ackAdapterId) ?? refuse('SELF_CAPTURE_ADAPTER_REFUSED');
    const eventId = randomUUID(), operationId = randomUUID(), rehearsalId = randomUUID(), deliveryId = `${eventId}:INDEPENDENT_METADATA_ALERT`;
    const message = { schema: 'staff-security-metadata-v1', event: 'KEY_CHANGE', operationId, actorStaffId: null, subjectStaffId: null, reason: { code: 'KEY_MAINTENANCE', ticketRef: 'preview-readiness-rehearsal' } };
    let acknowledged = null, acknowledgedAt = null;
    const acknowledgement = {
      evidence: value => selected.evidence(value),
      acknowledge: async input => { const outcome = await selected.acknowledge(input); if (outcome === 'ACK') { acknowledged = { ...input }; acknowledgedAt = Date.now(); } return outcome; }
    };
    // The product's own bounded submission (-t -i, no shell, no address in argv) and ACK transport.
    const submission = new alerts.BoundedStaffSendmailSubmission({ executable: config.executable, from: config.from, recipient: config.recipient, timeoutMs: 5000 });
    const transport = new alerts.AcknowledgedStaffAlertTransport(submission, acknowledgement);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10_000);
    try { if (await transport.send(deliveryId, message, abort.signal) !== 'ACK' || !acknowledged || acknowledgedAt === null) refuse('SELF_CAPTURE_ACK_REQUIRED'); } finally { clearTimeout(timer); }
    if (acknowledged.deliveryId !== deliveryId || !/^[a-f0-9]{64}$/.test(acknowledged.messageSha256)) refuse('SELF_CAPTURE_ACK_REQUIRED');
    const proof = { configSha256: digest(configBytes), generation: config.generation, rehearsalId, expiresAt: new Date(acknowledgedAt + 300_000).toISOString(), probeDeliveryId: deliveryId, probeMessageSha256: acknowledged.messageSha256 };
    process.stdout.write(`${JSON.stringify({ schema: 'preview-lifecycle-self-capture-v1', proof })}\n`);
  } finally { await operator.close?.(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch { process.exitCode = 1; }
}
