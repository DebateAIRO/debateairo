// debateai-preview-team-unlock.service — started on demand:
//   systemctl start debateai-preview-team-unlock
//
// Plain words: team (staff) actions need two fresh proofs that the independent security alert
// path works: an acknowledged test alert (valid 5 minutes) and a database "ready" row (valid
// 30 seconds). This tool keeps both fresh for ONE hour (owner ruling), then locks again.
//
// How (interim, until a narrow dedicated role exists): it opens the existing staff recovery
// login with a random password that lives only in this process's memory, keeps that login's
// expiry rolling at most 4 minutes ahead (the database itself refuses anything over 5), and
// writes the ready row every 10 seconds. At the end, on SIGTERM/SIGINT, and again from
// ExecStopPost even after a crash, the login is reset to PASSWORD NULL VALID UNTIL '-infinity'.
//
//   unlock-team-tools.mjs run     the one-hour window (systemd ExecStart)
//   unlock-team-tools.mjs reset   reset the login only (systemd ExecStopPost; safe to repeat)
import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exactKeys, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { LAYOUT, atomicWrite, ensureDirectory, logLine, peerShimArgv, runBounded } from './common.mjs';
import { loadPinnedRelease, readLock } from './prestart.mjs';

export const WINDOW_MS = 60 * 60 * 1000;
export const PUBLISH_EVERY_MS = 10_000;
/** The database accepts the recovery login only while it expires within 5 minutes; stay under it. */
export const LEASE_MS = 4 * 60 * 1000;
export const ROLL_EVERY_MS = 2 * 60 * 1000;
export const REFRESH_BEFORE_MS = 60_000;
const DATABASE_JIT_LIMIT_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;

class UnlockRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new UnlockRefusal(code); };
const reasonOf = error => (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.code) ? error.code : 'UNEXPECTED');
const abortableSleep = (ms, signal) => new Promise(resolve => {
  if (signal?.aborted) { resolve(); return; }
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
  signal?.addEventListener('abort', done, { once: true });
});

/** SIGTERM (systemctl stop, RuntimeMaxSec) and SIGINT both end the window through one abort. */
export function installSignalAbort(emitter = process) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  emitter.once('SIGTERM', abort);
  emitter.once('SIGINT', abort);
  return controller;
}

/**
 * The window. Writer and evidence are interfaces so a later migration can swap the interim
 * recovery-login writer for a narrow dedicated role without touching this loop.
 *   writer:   open({validUntil}) extend({validUntil}) publish(ready) revoke(generation) close()
 *   evidence: refresh() current() -> {configSha256,generation,ackAdapterId,rehearsalId,evidenceExpiresAt}|null
 */
export async function runUnlockWindow({ writer, evidence, deps = {}, windowMs = WINDOW_MS, publishEveryMs = PUBLISH_EVERY_MS, leaseMs = LEASE_MS, rollEveryMs = ROLL_EVERY_MS, refreshBeforeMs = REFRESH_BEFORE_MS }) {
  const now = deps.now ?? Date.now, log = deps.log ?? (event => logLine(process.stdout, event));
  const sleep = deps.sleep ?? abortableSleep, signal = deps.signal ?? new AbortController().signal;
  const startedAt = now(), endsAt = startedAt + windowMs;
  const lease = at => new Date(Math.min(at + leaseMs, endsAt));
  let publishes = 0, generation = null, outcome, reason, roleReset = false;
  log({ event: 'PREVIEW_TEAM_TOOLS_UNLOCKED', until: new Date(endsAt).toISOString(), writer: writer.kind, windowMinutes: Math.round(windowMs / 60000) });
  try {
    if (signal.aborted) refuse('STOPPED_BEFORE_START');
    await writer.open({ validUntil: lease(startedAt) });
    let rolledAt = startedAt;
    for (;;) {
      const at = now();
      if (at >= endsAt || signal.aborted) break;
      if (at - rolledAt >= rollEveryMs) { await writer.extend({ validUntil: lease(at) }); rolledAt = at; }
      let ready = await evidence.current();
      if (!ready || ready.evidenceExpiresAt.getTime() - at < refreshBeforeMs) {
        const previous = ready;
        await evidence.refresh();
        ready = await evidence.current();
        // A refresh that the loaded wrapper cannot see means the API cannot see it either.
        if (!ready || (previous && ready.rehearsalId === previous.rehearsalId && ready.evidenceExpiresAt.getTime() <= previous.evidenceExpiresAt.getTime())) refuse('EVIDENCE_UNAVAILABLE');
      }
      if (ready.evidenceExpiresAt.getTime() <= now()) refuse('EVIDENCE_UNAVAILABLE');
      if (await writer.publish(ready) !== true) refuse('PUBLISH_REFUSED');
      generation = ready.generation; publishes++;
      await sleep(Math.min(publishEveryMs, Math.max(0, endsAt - now())), signal);
    }
    outcome = signal.aborted ? 'STOPPED' : 'WINDOW_ENDED';
  } catch (error) {
    outcome = signal.aborted ? 'STOPPED' : 'FAILED';
    reason = reasonOf(error);
  } finally {
    // Lock: withdraw the ready row at once, then always reset the login.
    if (generation !== null) { try { await writer.revoke(generation); } catch { /* the row expires within 30 s anyway */ } }
    try { const closed = await writer.close(); roleReset = closed?.passwordNull === true && closed?.expiredMinusInfinity === true; } catch { roleReset = false; }
    log({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome, ...(reason ? { reason } : {}), publishes, roleReset, at: new Date(now()).toISOString() });
  }
  return { outcome, ...(reason ? { reason } : {}), publishes, roleReset };
}

/** ExecStopPost: idempotent reset, needs no password and opens no pool. */
export async function runReset({ writer, log = event => logLine(process.stdout, event) }) {
  let roleReset = false;
  try { const closed = await writer.reset(); roleReset = closed?.passwordNull === true && closed?.expiredMinusInfinity === true; } catch { roleReset = false; }
  log({ event: 'PREVIEW_TEAM_TOOLS_RESET', roleReset });
  return { roleReset };
}

/**
 * INTERIM writer: the existing debateai_prod_staff_recovery login (migration 0088 grants it the
 * readiness functions), opened just in time by the postgres-peer creator actor. The 32 random
 * bytes go to the actor on its private stdin only; never argv, environment, file or log.
 */
export function createInterimLoginWriter({ runCreator, createPool, createPublisher, randomBytes = cryptoRandomBytes, now = Date.now }) {
  let pool = null, publisher = null, secret = null, password = null;
  const checkLease = validUntil => {
    const ahead = validUntil?.getTime?.() - now();
    if (!(ahead > 0 && ahead <= DATABASE_JIT_LIMIT_MS)) refuse('STAFF_JIT_LEASE_REFUSED');
    return validUntil.toISOString();
  };
  const forget = () => { secret?.fill(0); password?.fill(0); };
  const closeRole = async () => {
    const closed = await runCreator({ mode: 'close' }, null);
    if (closed?.passwordNull !== true || closed?.expiredMinusInfinity !== true || closed?.noSessions !== true) refuse('STAFF_JIT_CLOSE_REFUSED');
    return closed;
  };
  return {
    kind: 'interim-recovery-login',
    async open({ validUntil }) {
      const until = checkLease(validUntil);
      secret = randomBytes(32);
      password = Buffer.from(secret.toString('hex'));
      const opened = await runCreator({ mode: 'open', validUntil: until }, password);
      if (opened?.existingRoleOpened !== true) refuse('STAFF_JIT_OPEN_REFUSED');
      // The pool driver keeps its own string copy for reconnects; ours is zeroed right away.
      pool = await createPool(password.toString());
      forget();
      publisher = createPublisher(pool);
    },
    async extend({ validUntil }) {
      const extended = await runCreator({ mode: 'extend', validUntil: checkLease(validUntil) }, null);
      if (extended?.validUntilExtended !== true) refuse('STAFF_JIT_EXTEND_REFUSED');
    },
    publish: ready => (publisher ? publisher.publish(ready) : refuse('STAFF_JIT_NOT_OPEN')),
    revoke: generation => (publisher ? publisher.revoke(generation) : false),
    async close() {
      try { await pool?.end(); } catch { /* the role reset below is what matters */ } finally { pool = null; publisher = null; forget(); }
      return closeRole();
    },
    reset: closeRole
  };
}

/** The installed wrapper names exactly one absolute evidence file; that is what it (and the API) reads. */
export function findEvidencePath(text) {
  if (typeof text !== 'string' || (text.match(/evidencePath/g) ?? []).length !== 1) refuse('EVIDENCE_PATH_REFUSED');
  const match = /["']?evidencePath["']?\s*:\s*(?:"([^"\\\n]+)"|'([^'\\\n]+)')(?=\s*[,}])/.exec(text);
  const path = match?.[1] ?? match?.[2];
  if (!path || !isAbsolute(path) || normalize(path) !== path) refuse('EVIDENCE_PATH_REFUSED');
  return path;
}

const PROOF_KEYS = ['configSha256', 'generation', 'rehearsalId', 'expiresAt', 'probeDeliveryId', 'probeMessageSha256'];
function validProof(proof, at) {
  try {
    exactKeys(proof, PROOF_KEYS);
    const ahead = Date.parse(proof.expiresAt) - at;
    const [delivery, purpose, ...extra] = String(proof.probeDeliveryId).split(':');
    if (!HASH.test(proof.configSha256) || !UUID.test(proof.generation) || !UUID.test(proof.rehearsalId) || !HASH.test(proof.probeMessageSha256)
      || !UUID.test(delivery) || purpose !== 'INDEPENDENT_METADATA_ALERT' || extra.length || !(ahead > 0 && ahead <= 300_000)
      || new Date(proof.expiresAt).toISOString() !== proof.expiresAt) throw new Error('proof');
    return proof;
  } catch { return refuse('SELF_CAPTURE_REFUSED'); }
}

async function readExistingProof(path, owner) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== owner.uid || (stat.mode & 0o022) !== 0 || stat.nlink !== 1 || stat.size > 4096) throw new Error('custody');
    const bytes = await readFile(path);
    const value = strictJson(bytes);
    if (typeof value?.schema !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.schema)) throw new Error('schema');
    return { bytes, schema: value.schema, custody: { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 } };
  } catch { return refuse('EVIDENCE_FILE_REFUSED'); }
}

/**
 * Evidence: a genuine local self-capture (a real probe alert to the local capture receiver,
 * acknowledged by it) produces a new proof, written where the installed wrapper reads it,
 * with the existing file's schema, owner and mode. The previous proof is archived once.
 */
export function createSelfCaptureEvidence({ readWrapperText, runSelfCapture, readCurrent, archiveDir, owner = { uid: 0, gid: 0 }, now = Date.now }) {
  let archived = false;
  return {
    async refresh() {
      const path = findEvidencePath(await readWrapperText());
      const existing = await readExistingProof(path, owner);
      const proof = validProof(await runSelfCapture(), now());
      if (!archived) {
        await ensureDirectory(archiveDir, { mode: 0o700, uid: owner.uid });
        await atomicWrite(join(archiveDir, `${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${basename(path)}`), existing.bytes, { mode: 0o600, uid: owner.uid, gid: owner.gid });
        archived = true;
      }
      const bytes = Buffer.from(JSON.stringify({ schema: existing.schema, ...Object.fromEntries(PROOF_KEYS.map(key => [key, proof[key]])) }));
      await atomicWrite(path, bytes, existing.custody);
    },
    current: readCurrent
  };
}

// ---------------------------------------------------------------------------------------------
// Server wiring below: not reachable from tests (needs the server, root, the release package).

const SOURCE_ROOT = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
const here = dirname(fileURLToPath(import.meta.url));

async function bounded(argv, options, code) {
  const result = await runBounded(argv, { maxOutputBytes: 65536, ...options });
  if (result.timedOut || result.overflow || result.error || result.code !== 0 || result.stderr.length > 0) refuse(code);
  try { return strictJson(result.stdout); } catch { return refuse(code); }
}

/** postgres OS user, peer packet on FD3 (as the reviewed root actors), control + secret on stdin. */
function creatorRunner({ engine, nodePath }) {
  return async (control, secret) => {
    const header = Buffer.from(`${JSON.stringify({ ...control, engine })}\n`);
    const stdin = secret ? Buffer.concat([header, secret, Buffer.from('\n')]) : header;
    try {
      const argv = peerShimArgv({ sh: LAYOUT.sh, packet: LAYOUT.peerPacket, command: [LAYOUT.runuser, '-u', 'postgres', '--', LAYOUT.env, '-i',
        `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', nodePath, join(here, 'jit-creator-actor.mjs'), '--credential-fd', '3'] });
      return await bounded(argv, { cwd: engine, env: {}, stdin, timeoutMs: 60_000 }, control.mode === 'open' ? 'STAFF_JIT_OPEN_REFUSED' : control.mode === 'extend' ? 'STAFF_JIT_EXTEND_REFUSED' : 'STAFF_JIT_CLOSE_REFUSED');
    } finally { stdin.fill(0); }
  };
}

/** The API service identity: its uid/gid plus the user's groups and the unit's SupplementaryGroups. */
async function apiIdentity(plan) {
  const text = async argv => { const r = await runBounded(argv, { env: {}, timeoutMs: 5000, maxOutputBytes: 16384 }); if (r.code !== 0) refuse('API_IDENTITY_REFUSED'); return r.stdout.toString('utf8').trim(); };
  const name = (await text([LAYOUT.getent, 'passwd', String(plan.serviceUid)])).split(':')[0];
  const groups = new Set((await text([LAYOUT.id, '-G', name])).split(/\s+/).map(Number));
  for (const group of (await text([LAYOUT.systemctl, 'show', '--value', '-p', 'SupplementaryGroups', 'debateai-preview-api.service'])).split(/\s+/).filter(Boolean)) {
    groups.add(Number((await text([LAYOUT.getent, 'group', group])).split(':')[2]));
  }
  groups.add(plan.serviceGid);
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(name) || [...groups].some(gid => !Number.isSafeInteger(gid) || gid < 1)) refuse('API_IDENTITY_REFUSED');
  return { uid: plan.serviceUid, gid: plan.serviceGid, groups: [...groups].sort((a, b) => a - b) };
}

async function readCa() {
  return withPrivateBytes(LAYOUT.postgresCa, { root: dirname(LAYOUT.postgresCa), uid: 0, mode: 0o644, maxBytes: 65536 }, raw => Buffer.from(raw).toString('utf8'));
}

async function serverDeps() {
  const { entry, plan } = await loadPinnedRelease({ service: 'api' });
  if (!SOURCE_ROOT.test(entry.sourceRoot)) refuse('RELEASE_REFUSED');
  const engine = `${entry.sourceRoot}/dialectical-engine`, nodePath = process.execPath;
  const configured = await readEnvironmentFile(plan.environment.path, plan.environment);
  const staff = { configPath: configured.STAFF_INDEPENDENT_ALERT_CONFIG_PATH, operatorPath: configured.STAFF_ALERT_OPERATOR_MODULE_PATH, operatorSha256: configured.STAFF_ALERT_OPERATOR_MODULE_SHA256 };
  for (const key of Object.keys(configured)) configured[key] = '';
  if (![staff.configPath, staff.operatorPath].every(path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path) || !HASH.test(staff.operatorSha256 ?? '')) refuse('STAFF_CONFIGURATION_REQUIRED');
  return { entry, plan, engine, nodePath, staff };
}

async function runServer() {
  const { plan, engine, nodePath, staff } = await serverDeps();
  const { tsImport } = await import(pathToFileURL(`${engine}/node_modules/tsx/dist/esm/api/index.mjs`).href);
  const [db, alerts, runtime] = await Promise.all([tsImport(`${engine}/packages/db/src/index.ts`, import.meta.url), tsImport(`${engine}/apps/api/src/staff/alerts.ts`, import.meta.url), tsImport(`${engine}/apps/api/src/staff/runtime.ts`, import.meta.url)]);
  const operator = await runtime.loadStaffAlertOperator({ path: staff.operatorPath, sha256: staff.operatorSha256 });
  try {
    const configuration = new alerts.RootStaffAlertConfiguration({ path: staff.configPath, acknowledgements: operator.acknowledgements, timeoutMs: 2000 });
    const pg = createRequire(`${engine}/package.json`)('pg');
    const ca = await readCa();
    const writer = createInterimLoginWriter({
      runCreator: creatorRunner({ engine, nodePath }),
      createPool: async password => {
        const pool = new pg.Pool({ host: '127.0.0.1', ssl: { ca, rejectUnauthorized: true }, port: LAYOUT.pgPort, database: LAYOUT.database, user: 'debateai_prod_staff_recovery', password,
          max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000, idleTimeoutMillis: 1000, application_name: 'preview-team-unlock' });
        try {
          const rows = (await pool.query(`SELECT session_user::text session,current_user::text role,current_database() database,current_setting('port')::int port,
            rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes' bounded,
            NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) no_elevated_powers FROM pg_roles WHERE rolname=session_user`)).rows;
          const row = rows[0];
          if (rows.length !== 1 || row.session !== 'debateai_prod_staff_recovery' || row.role !== 'debateai_prod_staff_recovery' || row.database !== LAYOUT.database || row.port !== LAYOUT.pgPort || !row.bounded || !row.no_elevated_powers) refuse('STAFF_JIT_IDENTITY_REFUSED');
          return pool;
        } catch (error) { await pool.end().catch(() => undefined); throw error; }
      },
      createPublisher: pool => new db.PostgresStaffIndependentReadinessPublisher(pool)
    });
    const identity = await apiIdentity(plan);
    const evidence = createSelfCaptureEvidence({
      readWrapperText: () => withPrivateBytes(staff.operatorPath, { root: dirname(staff.operatorPath), uid: 0, mode: [0o644, 0o640, 0o600, 0o755, 0o750], maxBytes: 65536 }, raw => Buffer.from(raw).toString('utf8')),
      runSelfCapture: async () => {
        const argv = [LAYOUT.setpriv, `--reuid=${identity.uid}`, `--regid=${identity.gid}`, `--groups=${identity.groups.join(',')}`, '--inh-caps=-all', '--', LAYOUT.env, '-i',
          `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'TSX_DISABLE_CACHE=1', nodePath, join(here, 'self-capture-actor.mjs')];
        const value = await bounded(argv, { cwd: engine, env: {}, stdin: Buffer.from(JSON.stringify({ engine, ...staff })), timeoutMs: 30_000 }, 'SELF_CAPTURE_REFUSED');
        if (value?.schema !== 'preview-lifecycle-self-capture-v1') refuse('SELF_CAPTURE_REFUSED');
        return value.proof;
      },
      readCurrent: async () => {
        const trusted = await configuration.read();
        return trusted && { configSha256: trusted.binding.configSha256, generation: trusted.binding.generation, ackAdapterId: trusted.config.ackAdapterId, rehearsalId: trusted.evidence.rehearsalId, evidenceExpiresAt: trusted.evidence.expiresAt };
      },
      archiveDir: join(LAYOUT.stateDir, 'evidence-archive')
    });
    await ensureDirectory(LAYOUT.stateDir, { mode: 0o700, uid: 0 });
    const controller = installSignalAbort(process);
    return await runUnlockWindow({ writer, evidence, deps: { signal: controller.signal } });
  } finally { await operator.close?.().catch?.(() => undefined); }
}

async function resetServer() {
  // Needs only the pinned API release root (for the reviewed peer channel); no plan, no staff config.
  const { lock } = await readLock(LAYOUT);
  const sourceRoot = lock.services.api?.sourceRoot ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
  if (!SOURCE_ROOT.test(sourceRoot)) refuse('RELEASE_REFUSED');
  return runReset({ writer: createInterimLoginWriter({ runCreator: creatorRunner({ engine: `${sourceRoot}/dialectical-engine`, nodePath: process.execPath }), createPool: () => refuse('RESET_ONLY'), createPublisher: () => refuse('RESET_ONLY') }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  try {
    if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.argv.length !== 3 || !['run', 'reset'].includes(command)) refuse('ACTOR_REFUSED');
    const result = command === 'run' ? await runServer() : await resetServer();
    if (!result.roleReset) process.exitCode = 1;
  } catch (error) {
    logLine(process.stderr, { event: command === 'reset' ? 'PREVIEW_TEAM_TOOLS_RESET' : 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'FAILED', reason: reasonOf(error), roleReset: false });
    process.exitCode = 1;
  }
}
