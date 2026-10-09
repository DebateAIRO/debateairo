// debateai-preview-team-unlock.service — started on demand:
//   systemctl start debateai-preview-team-unlock
//
// Plain words: team (staff) actions need two fresh proofs that the independent security alert
// path works: an acknowledged test alert (valid 5 minutes) and a database "ready" row (valid
// 30 seconds). This tool keeps both fresh for ONE hour (owner ruling), then locks again.
//
// How (default, from the auth DB batch step on): the ready row is written as
// debateai_staff_readiness_writer, a login with no password that can only write and withdraw it.
// PostgreSQL admits it by peer authentication on the preview's Unix socket, and the preview's
// pg_ident maps ONE OS user to it: the dedicated system user debateai-readiness (no shell, no
// home), never root. So this root process never connects as that login: for every database call
// it starts readiness-writer-actor.mjs as debateai-readiness (setpriv: its uid/gid, no groups, no
// capabilities, empty environment), which opens one fresh connection, proves its identity on it,
// runs the one call and exits. Nothing is minted, extended or reset; the ready row is written
// every 10 seconds and withdrawn at the end and on SIGTERM/SIGINT.
//
// Fallback (only when the unit names PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login, until
// the server has the auth DB batch step, the dedicated user and the two lines): it opens the
// existing staff recovery login with a random password that lives only in this process's memory,
// keeps that login's expiry rolling at most 4 minutes ahead (the database itself refuses anything
// over 5), and resets the login to PASSWORD NULL VALID UNTIL '-infinity' at the end. It refuses
// to start (STAFF_WRITER_FALLBACK_NOT_NEEDED) once the dedicated-user path already works.
//
// Whichever writer ran, ExecStopPost resets the recovery login again, even after a crash: it
// needs no password and changes nothing when the login is already closed.
//
//   unlock-team-tools.mjs run     the one-hour window (systemd ExecStart)
//   unlock-team-tools.mjs reset   reset the recovery login only (systemd ExecStopPost; safe to repeat)
import { lstat } from 'node:fs/promises';
import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exactKeys, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { LAYOUT, atomicWrite, ensureDirectory, logLine, peerShimArgv, runBounded } from './common.mjs';
import { loadPinnedRelease, readLock } from './prestart.mjs';
import { READINESS_OS_USER, READINESS_RESULT_SCHEMA, READINESS_WRITER_ROLE } from './readiness-writer-actor.mjs';
import { verifyReleaseForImport } from './release-guard.mjs';

export { READINESS_OS_USER, READINESS_WRITER_ROLE };

export const WINDOW_MS = 60 * 60 * 1000;
export const PUBLISH_EVERY_MS = 10_000;
/** The database accepts the recovery login only while it expires within 5 minutes; stay under it. */
export const LEASE_MS = 4 * 60 * 1000;
export const ROLL_EVERY_MS = 2 * 60 * 1000;
export const REFRESH_BEFORE_MS = 60_000;
/** No renewal this close to the end: the current lease already reaches it, and a slow renewal could fail the clean end. */
export const NO_RENEWAL_BEFORE_END_MS = 30_000;
const DATABASE_JIT_LIMIT_MS = 5 * 60 * 1000;
export const PEER_WRITER = 'peer-readiness-writer';
export const INTERIM_WRITER = 'interim-recovery-login';
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

/**
 * SIGTERM (systemctl stop, RuntimeMaxSec) and SIGINT both end the window through one abort.
 * The listeners stay installed: a repeated signal must not fall through to Node's default exit
 * while the login is being reset.
 */
export function installSignalAbort(emitter = process) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  emitter.on('SIGTERM', abort);
  emitter.on('SIGINT', abort);
  return controller;
}

/**
 * What "locked again" means for each writer, reported under its own name so neither pretends:
 *   interim (the default reading): the login was reset to PASSWORD NULL VALID UNTIL '-infinity' -> roleReset
 *   peer: the role has no password or expiry to take back; its lock is no connection left open
 *         (every call was its own child that ended its connection and exited; the ready row was
 *         withdrawn, or lapses within 30 s) -> locked
 */
const lockOf = (writer, closed) => (writer.kind === PEER_WRITER
  ? { locked: closed?.connectionsClosed === true }
  : { roleReset: closed?.passwordNull === true && closed?.expiredMinusInfinity === true });

/**
 * The window. Writer and evidence are interfaces, so the dedicated peer writer and the interim
 * recovery-login writer share this loop unchanged.
 *   writer:   open({validUntil}) extend({validUntil}) publish(ready) revoke(generation) close() reset()
 *   evidence: refresh() current() -> {configSha256,generation,ackAdapterId,rehearsalId,evidenceExpiresAt}|null
 */
export async function runUnlockWindow({ writer, evidence, deps = {}, windowMs = WINDOW_MS, publishEveryMs = PUBLISH_EVERY_MS, leaseMs = LEASE_MS, rollEveryMs = ROLL_EVERY_MS, refreshBeforeMs = REFRESH_BEFORE_MS }) {
  const now = deps.now ?? Date.now, log = deps.log ?? (event => logLine(process.stdout, event));
  const sleep = deps.sleep ?? abortableSleep, signal = deps.signal ?? new AbortController().signal;
  const startedAt = now(), endsAt = startedAt + windowMs;
  const lease = at => new Date(Math.min(at + leaseMs, endsAt));
  let publishes = 0, generation = null, outcome, reason, lock = lockOf(writer, null);
  log({ event: 'PREVIEW_TEAM_TOOLS_UNLOCKED', until: new Date(endsAt).toISOString(), writer: writer.kind, windowMinutes: Math.round(windowMs / 60000) });
  try {
    if (signal.aborted) refuse('STOPPED_BEFORE_START');
    await writer.open({ validUntil: lease(startedAt) });
    let rolledAt = startedAt;
    for (;;) {
      const at = now();
      if (at >= endsAt || signal.aborted) break;
      if (at - rolledAt >= rollEveryMs && endsAt - at >= NO_RENEWAL_BEFORE_END_MS) { await writer.extend({ validUntil: lease(at) }); rolledAt = at; }
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
    // Lock: withdraw the ready row at once, then always close the writer (the interim one resets the login).
    if (generation !== null) { try { await writer.revoke(generation); } catch { /* the row expires within 30 s anyway */ } }
    try { lock = lockOf(writer, await writer.close()); } catch { lock = lockOf(writer, null); }
    log({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome, ...(reason ? { reason } : {}), publishes, ...lock, at: new Date(now()).toISOString() });
  }
  return { outcome, ...(reason ? { reason } : {}), publishes, ...lock };
}

/** ExecStopPost: idempotent reset, needs no password and opens no pool. A failure has its own event. */
export async function runReset({ writer, log = event => logLine(process.stdout, event) }) {
  if (writer.kind === PEER_WRITER) {
    // The peer role has nothing to reset; say exactly that instead of a roleReset it never did.
    let nothingToReset = false, reason = null;
    try {
      nothingToReset = (await writer.reset())?.nothingToReset === true;
      if (!nothingToReset) reason = 'RESET_ANSWER_UNEXPECTED';
    } catch (error) { reason = reasonOf(error); }
    log(nothingToReset ? { event: 'PREVIEW_TEAM_TOOLS_RESET', nothingToReset } : { event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', nothingToReset, reason });
    return { nothingToReset };
  }
  let roleReset = false, reason = null;
  try {
    const closed = await writer.reset();
    roleReset = closed?.passwordNull === true && closed?.expiredMinusInfinity === true;
    if (!roleReset) reason = 'ROLE_NOT_RESET';
  } catch (error) { roleReset = false; reason = reasonOf(error); }
  log(roleReset ? { event: 'PREVIEW_TEAM_TOOLS_RESET', roleReset } : { event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset, reason });
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

/**
 * DEFAULT writer: debateai_staff_readiness_writer, a LOGIN role with PASSWORD NULL that may only
 * publish and revoke the ready row. Every database call is `runActor(op, fields)`: one child
 * process as the dedicated OS user, one fresh connection, its identity checked on that
 * connection, one call, then the child exits. So this writer has no secret, no lease to roll, no
 * pool and no role to reset: open() is an identity check that writes nothing, extend() does
 * nothing, close() reports whether any call is still running, reset() has nothing to do.
 */
export function createPeerReadinessWriter({ runActor }) {
  let open = false, running = 0;
  const call = async (op, fields) => { running++; try { return await runActor(op, fields); } finally { running--; } };
  return {
    kind: PEER_WRITER,
    async open() {
      if (await call('check', {}) !== true) refuse('STAFF_READINESS_IDENTITY_REFUSED');
      open = true;
    },
    async extend() { /* no lease: the role has no expiry and no password */ },
    async publish(ready) {
      if (!open) refuse('STAFF_READINESS_NOT_OPEN');
      const fields = { configSha256: ready.configSha256, generation: ready.generation, ackAdapterId: ready.ackAdapterId, rehearsalId: ready.rehearsalId, evidenceExpiresAt: ready.evidenceExpiresAt.toISOString() };
      return await call('publish', fields) === true;
    },
    revoke: async generation => (open ? await call('revoke', { generation }) === true : false),
    async close() {
      open = false;
      return { connectionsClosed: running === 0 };
    },
    reset: async () => ({ nothingToReset: true })
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

const EVIDENCE_MODES = [0o400, 0o440, 0o444, 0o600, 0o640, 0o644];
/**
 * Through the reviewed custody reader: no-follow open, the same file before and after the read,
 * one link, owner, exact mode, and its folder owned by the same owner, not group/other-writable,
 * reached without any link (so the later in-place rewrite lands where the wrapper reads).
 */
async function readExistingProof(path, owner) {
  try {
    return await withPrivateBytes(path, { root: dirname(path), uid: owner.uid, mode: EVIDENCE_MODES, maxBytes: 4096 }, async raw => {
      const value = strictJson(raw);
      if (typeof value?.schema !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.schema)) throw new Error('schema');
      const stat = await lstat(path);
      return { bytes: Buffer.from(raw), schema: value.schema, custody: { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 } };
    });
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

/**
 * Where the writer connects. Default: the preview's own Unix socket: peer for the readiness
 * writer (the preview-only pg_hba/pg_ident lines of README step 7), SCRAM for the interim
 * recovery login (`local` only, as in deploy/postgres/pg_hba.conf.template).
 * PREVIEW_LIFECYCLE_STAFF_DB_HOST (only from the unit's own `env -i` ExecStart line; the
 * process inherits no other environment) may name another socket folder, or, for the
 * interim login only, loopback (127.0.0.1 / ::1) when the server's pg_hba has a matching hostssl
 * line; TCP always verifies TLS with the preview CA. The peer writer refuses TCP.
 */
export function resolveStaffDbHost(value, layout = LAYOUT) {
  if (value === undefined || value === '') return { host: layout.pgSocketDir, tls: false };
  if (value === '127.0.0.1' || value === '::1') return { host: value, tls: true };
  if (typeof value === 'string' && isAbsolute(value) && normalize(value) === value && /^\/[A-Za-z0-9/._-]+$/.test(value) && !value.split('/').includes('..')) return { host: value, tls: false };
  return refuse('STAFF_DB_HOST_REFUSED');
}

export function staffPoolOptions({ target, password, ca, layout = LAYOUT }) {
  if (target.tls && (typeof ca !== 'string' || !ca)) refuse('STAFF_DB_HOST_REFUSED');
  return { host: target.host, port: layout.pgPort, database: layout.database, user: 'debateai_prod_staff_recovery', password,
    ssl: target.tls ? { ca, rejectUnauthorized: true } : false,
    max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000, idleTimeoutMillis: 1000, application_name: 'preview-team-unlock' };
}

/**
 * PREVIEW_LIFECYCLE_STAFF_WRITER, only from the unit's own `env -i` ExecStart line: unset (or the
 * default's own name) -> the peer writer; exactly `interim-recovery-login` -> the fallback, until
 * the server has the auth DB batch step, the dedicated OS user and the pg_ident/pg_hba lines.
 * Anything else is refused.
 */
export function resolveStaffWriterKind(value) {
  if (value === undefined || value === '' || value === PEER_WRITER) return PEER_WRITER;
  if (value === INTERIM_WRITER) return INTERIM_WRITER;
  return refuse('STAFF_WRITER_REFUSED');
}

/** Shells that let nobody log in. An empty shell field means /bin/sh, so it is refused too. */
const NO_LOGIN_SHELLS = ['/usr/sbin/nologin', '/sbin/nologin', '/bin/false', '/usr/bin/false'];

/**
 * The dedicated OS user's passwd entry: exactly `debateai-readiness`, a real uid and gid that are
 * neither root's (0) nor the shared nobody (65534), and a shell that lets nobody log in. Missing
 * (getent exit 2) has its own name: README step 7 creates it.
 */
export function parseReadinessUser(text) {
  const lines = String(text).split('\n').filter(Boolean);
  const fields = lines.length === 1 ? lines[0].split(':') : [];
  const [name, , uidText, gidText, , , shell] = fields;
  const id = value => (/^[0-9]{1,10}$/.test(value ?? '') ? Number(value) : NaN);
  const uid = id(uidText), gid = id(gidText);
  if (fields.length !== 7 || name !== READINESS_OS_USER || !(uid >= 1 && uid < 4294967295) || !(gid >= 1 && gid < 4294967295)
    || uid === 65534 || gid === 65534 || !NO_LOGIN_SHELLS.includes(shell)) refuse('STAFF_READINESS_USER_REFUSED');
  return { name, uid, gid };
}

export async function lookupReadinessUser({ run = runBounded, layout = LAYOUT } = {}) {
  const result = await run([layout.getent, 'passwd', READINESS_OS_USER], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.timedOut || result.overflow || result.error || result.stderr?.length) refuse('STAFF_READINESS_USER_REFUSED');
  if (result.code === 2) refuse('STAFF_READINESS_USER_MISSING');
  if (result.code !== 0) refuse('STAFF_READINESS_USER_REFUSED');
  return parseReadinessUser(result.stdout.toString('utf8'));
}

/** One readiness child: start, connect, check, one call, exit. Generous for a cold node start; the ready row lasts 30 s. */
export const READINESS_ACTOR_TIMEOUT_MS = 15_000;
const READINESS_CODE = /^STAFF_(READINESS|DB_HOST)_[A-Z_]{2,60}$/;

/**
 * The only way this root process reaches the readiness login: a child as the dedicated OS user,
 * through setpriv (its uid and gid, no supplementary groups, no inheritable capabilities, no new
 * privileges), then `env -i` with NOTHING set, then node and readiness-writer-actor.mjs. The user
 * is checked here once more, so nothing is ever started as uid or gid 0. The control object goes
 * on stdin only. One call per child; the answer is its one JSON line.
 */
export function readinessActorRunner({ user, host, engine, pgPath, nodePath, run = runBounded, layout = LAYOUT }) {
  if (user?.name !== READINESS_OS_USER || !Number.isSafeInteger(user.uid) || !Number.isSafeInteger(user.gid) || user.uid < 1 || user.gid < 1) refuse('STAFF_READINESS_USER_REFUSED');
  const argv = [layout.setpriv, `--reuid=${user.uid}`, `--regid=${user.gid}`, '--clear-groups', '--inh-caps=-all', '--no-new-privs', '--', layout.env, '-i', nodePath, join(here, 'readiness-writer-actor.mjs')];
  return async (op, fields) => {
    const result = await run(argv, { cwd: '/', env: {}, stdin: Buffer.from(JSON.stringify({ op, engine, pgPath, host, ...fields })), timeoutMs: READINESS_ACTOR_TIMEOUT_MS, maxOutputBytes: 4096 });
    let answer;
    try {
      if (result.timedOut || result.overflow || result.error || result.stderr.length > 0) throw new Error('child');
      answer = strictJson(result.stdout);
      exactKeys(answer, answer?.ok === true ? ['schema', 'ok', 'value'] : ['schema', 'ok', 'code']);
      if (answer.schema !== READINESS_RESULT_SCHEMA) throw new Error('schema');
    } catch { return refuse('STAFF_READINESS_ACTOR_REFUSED'); }
    if (answer.ok === true && result.code === 0 && typeof answer.value === 'boolean') return answer.value;
    if (answer.ok === false && result.code === 1 && typeof answer.code === 'string' && READINESS_CODE.test(answer.code)) refuse(answer.code);
    return refuse('STAFF_READINESS_ACTOR_REFUSED');
  };
}

/** Does the dedicated-user path work right now (the user exists, its child connects and passes the identity check)? Writes nothing. */
export async function peerWriterWorks({ lookupReadinessUser: lookup, readinessRunner, host }) {
  try { return await readinessRunner({ user: await lookup(), host })('check', {}) === true; } catch { return false; }
}

/** Opens a pool and keeps it only if the one identity row is accepted; otherwise ends it and refuses with `code`. */
async function openCheckedPool({ Pool, options, sql, accepted, code }) {
  const pool = new Pool(options);
  try {
    const rows = (await pool.query(sql)).rows;
    if (rows.length !== 1 || !accepted(rows[0])) refuse(code);
    return pool;
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}

const INTERIM_IDENTITY_SQL = `SELECT session_user::text session,current_user::text role,current_database() database,current_setting('port')::int port,
  rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes' bounded,
  NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) no_elevated_powers FROM pg_roles WHERE rolname=session_user`;
const interimIdentityAccepted = (row, layout) => row.session === 'debateai_prod_staff_recovery' && row.role === 'debateai_prod_staff_recovery'
  && row.database === layout.database && row.port === layout.pgPort && !!row.bounded && !!row.no_elevated_powers;

/**
 * The writer the window uses. Everything is checked before anything connects: the writer name,
 * the host, and (peer) that the host is a socket, then the dedicated OS user. The peer writer
 * never opens a pool in this root process: `readinessRunner({ user, host })` starts one child per
 * call. The fallback is refused while the dedicated-user path already works (it would hand out a
 * temporary password for nothing). The CA is read only for the interim writer over loopback TLS.
 * `runCreator` is handed only to the interim writer.
 */
export async function buildStaffWriter({ env, Pool, createPublisher, runCreator, readCa, randomBytes, now, lookupReadinessUser: lookup, readinessRunner, layout = LAYOUT }) {
  const kind = resolveStaffWriterKind(env.PREVIEW_LIFECYCLE_STAFF_WRITER);
  const target = resolveStaffDbHost(env.PREVIEW_LIFECYCLE_STAFF_DB_HOST, layout);
  if (kind === PEER_WRITER) {
    // Peer authentication exists only on the Unix socket.
    if (target.tls) refuse('STAFF_DB_HOST_REFUSED');
    const user = await lookup();
    return createPeerReadinessWriter({ runActor: readinessRunner({ user, host: target.host }) });
  }
  if (await peerWriterWorks({ lookupReadinessUser: lookup, readinessRunner, host: target.tls ? layout.pgSocketDir : target.host })) refuse('STAFF_WRITER_FALLBACK_NOT_NEEDED');
  const ca = target.tls ? await readCa() : null;
  return createInterimLoginWriter({
    runCreator, createPublisher, ...(randomBytes ? { randomBytes } : {}), ...(now ? { now } : {}),
    createPool: password => openCheckedPool({ Pool, options: staffPoolOptions({ target, password, ca, layout }), sql: INTERIM_IDENTITY_SQL, accepted: row => interimIdentityAccepted(row, layout), code: 'STAFF_JIT_IDENTITY_REFUSED' })
  });
}

/** Every release module root loads, in load order: tsx, the db package, the staff alert code, pg. */
export function unlockImportPaths(engine, pgPath) {
  return [`${engine}/node_modules/tsx/dist/esm/api/index.mjs`, `${engine}/packages/db/src/index.ts`, `${engine}/apps/api/src/staff/alerts.ts`, `${engine}/apps/api/src/staff/runtime.ts`, pgPath];
}

async function importReleaseModules([tsxPath, dbPath, alertsPath, runtimePath, pgPath], engine) {
  const { tsImport } = await import(pathToFileURL(tsxPath).href);
  const [db, alerts, runtime] = await Promise.all([tsImport(dbPath, import.meta.url), tsImport(alertsPath, import.meta.url), tsImport(runtimePath, import.meta.url)]);
  return { db, alerts, runtime, pg: createRequire(`${engine}/package.json`)(pgPath) };
}

/**
 * Root runs release code here, so the release is verified first (the launchers' own source check
 * plus root-only import paths). `resolve` only reads package.json files; nothing runs before the check.
 */
export async function loadReleaseModules({ plan, engine, resolvePg = () => createRequire(`${engine}/package.json`).resolve('pg'), guard = verifyReleaseForImport, load = importReleaseModules }) {
  const paths = unlockImportPaths(engine, resolvePg());
  await guard({ plan, importPaths: paths });
  // pgPath: the verified file the readiness child (the dedicated OS user) requires, and nothing else.
  return { ...(await load(paths, engine)), pgPath: paths.at(-1) };
}

// ---------------------------------------------------------------------------------------------
// Server wiring below: needs the server, root and the release package (only creatorRunner is
// reachable from tests, through its injected runner).

const SOURCE_ROOT = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
const here = dirname(fileURLToPath(import.meta.url));

async function bounded(argv, options, code, run = runBounded) {
  const result = await run(argv, { maxOutputBytes: 65536, ...options });
  if (result.timedOut || result.overflow || result.error || result.code !== 0 || result.stderr.length > 0) refuse(code);
  try { return strictJson(result.stdout); } catch { return refuse(code); }
}

/**
 * One database actor call may take this long. Each call (open, every 2-minute renewal, close,
 * reset) re-verifies the whole pinned API release as postgres before importing anything from it;
 * nothing is cached between calls, so a release file changed after the open is never loaded by a
 * later call. That re-hash (about the verifier's 12 s) is most of the call; 120 s leaves room for a
 * slow or cold disk. README install step 5 measures it.
 */
export const CREATOR_TIMEOUT_MS = 120_000;

/** postgres OS user, peer packet on FD3 (as the reviewed root actors), control + secret on stdin. */
export function creatorRunner({ engine, nodePath, run = runBounded }) {
  return async (control, secret) => {
    const header = Buffer.from(`${JSON.stringify({ ...control, engine })}\n`);
    const stdin = secret ? Buffer.concat([header, secret, Buffer.from('\n')]) : header;
    try {
      const argv = peerShimArgv({ sh: LAYOUT.sh, packet: LAYOUT.peerPacket, command: [LAYOUT.runuser, '-u', 'postgres', '--', LAYOUT.env, '-i',
        `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', nodePath, join(here, 'jit-creator-actor.mjs'), '--credential-fd', '3'] });
      return await bounded(argv, { cwd: engine, env: {}, stdin, timeoutMs: CREATOR_TIMEOUT_MS }, control.mode === 'open' ? 'STAFF_JIT_OPEN_REFUSED' : control.mode === 'extend' ? 'STAFF_JIT_EXTEND_REFUSED' : 'STAFF_JIT_CLOSE_REFUSED', run);
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
  // The writer choice and host are checked before the release is loaded: a typo fails at once.
  resolveStaffWriterKind(process.env.PREVIEW_LIFECYCLE_STAFF_WRITER);
  const { plan, engine, nodePath, staff } = await serverDeps();
  const { db, alerts, runtime, pg, pgPath } = await loadReleaseModules({ plan, engine });
  const operator = await runtime.loadStaffAlertOperator({ path: staff.operatorPath, sha256: staff.operatorSha256 });
  try {
    const configuration = new alerts.RootStaffAlertConfiguration({ path: staff.configPath, acknowledgements: operator.acknowledgements, timeoutMs: 2000 });
    const writer = await buildStaffWriter({
      env: { PREVIEW_LIFECYCLE_STAFF_WRITER: process.env.PREVIEW_LIFECYCLE_STAFF_WRITER, PREVIEW_LIFECYCLE_STAFF_DB_HOST: process.env.PREVIEW_LIFECYCLE_STAFF_DB_HOST },
      // Pool and publisher: the interim writer only (its password login). The readiness login is
      // reached only through the dedicated-user child, which requires the verified pgPath.
      Pool: pg.Pool,
      runCreator: creatorRunner({ engine, nodePath }),
      readCa,
      createPublisher: pool => new db.PostgresStaffIndependentReadinessPublisher(pool),
      lookupReadinessUser: () => lookupReadinessUser(),
      readinessRunner: ({ user, host }) => readinessActorRunner({ user, host, engine, pgPath, nodePath })
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
  } finally { await Promise.resolve().then(() => operator.close?.()).catch(() => undefined); }
}

async function resetServer() {
  // Always the recovery login, whichever writer the window used: idempotent, needs no password,
  // and it also closes a login an earlier fallback run left open by crashing.
  // Needs only the pinned API release root (for the reviewed peer channel); no plan, no staff config.
  const { lock } = await readLock(LAYOUT);
  const sourceRoot = lock.services.api?.sourceRoot ?? refuse('RELEASE_LOCK_SERVICE_MISSING');
  if (!SOURCE_ROOT.test(sourceRoot)) refuse('RELEASE_REFUSED');
  return runReset({ writer: createInterimLoginWriter({ runCreator: creatorRunner({ engine: `${sourceRoot}/dialectical-engine`, nodePath: process.execPath }), createPool: () => refuse('RESET_ONLY'), createPublisher: () => refuse('RESET_ONLY') }) });
}

/**
 * The exit code systemd sees. Non-zero whenever the tools may not be locked again (the interim
 * login not reset, the peer pool not closed), and whenever the window itself ended FAILED (for
 * example EVIDENCE_UNAVAILABLE) even though the lock worked: either marks the unit failed, so
 * OnFailure= sends the alert.
 */
export async function runCommand(command, { platform = process.platform, uid = process.getuid?.(), runServer: run = runServer, resetServer: reset = resetServer, log = event => logLine(process.stderr, event) } = {}) {
  try {
    if (platform !== 'linux' || uid !== 0 || !['run', 'reset'].includes(command)) refuse('ACTOR_REFUSED');
    const result = command === 'run' ? await run() : await reset();
    const lockedAgain = result?.roleReset === true || result?.locked === true || result?.nothingToReset === true;
    return lockedAgain && result?.outcome !== 'FAILED' ? 0 : 1;
  } catch (error) {
    log(command === 'reset'
      ? { event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset: false, reason: reasonOf(error) }
      : { event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'FAILED', reason: reasonOf(error), roleReset: false });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCommand(process.argv.length === 3 ? process.argv[2] : null);
}
