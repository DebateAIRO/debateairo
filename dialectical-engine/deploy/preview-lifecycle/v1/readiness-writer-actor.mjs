// Runs ONLY as the dedicated OS user debateai-readiness, started by unlock-team-tools.mjs (root)
// through setpriv: that user's uid and gid, no supplementary groups, no capabilities, no new
// privileges, an EMPTY environment, no arguments. The control object arrives on stdin only.
//
// Plain words: the team unlock writes the "ready" row as the database login
// debateai_staff_readiness_writer, which has no password. PostgreSQL lets that login in by asking
// the operating system who is calling ("peer"), and the preview's pg_ident maps exactly this OS
// user to it, never root. So root never talks to the database as that login itself: for each
// call it starts this small process as debateai-readiness, which
//   1. opens ONE fresh connection on the preview's local socket,
//   2. proves who it is on that connection (exactly the readiness login, no switched role, the
//      socket, the preview database and port, no special powers, no memberships),
//   3. runs exactly one call: check (nothing written), publish (write the ready row) or revoke
//      (withdraw it), the same two SELECT staff.* calls the db package's readiness publisher makes,
//   4. ends the connection and prints one JSON line.
// It loads one thing from the pinned release: `pg`, from the exact path root verified before
// starting it (release-guard.mjs). Nothing else from the release, no tsx.
import { createRequire } from 'node:module';
import { userInfo } from 'node:os';
import { isAbsolute, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exactKeys, strictJson } from '../../preview-auth-dev/v1/custody.mjs';
import { LAYOUT } from './common.mjs';

export const READINESS_OS_USER = 'debateai-readiness';
export const READINESS_WRITER_ROLE = 'debateai_staff_readiness_writer';
export const READINESS_RESULT_SCHEMA = 'preview-lifecycle-readiness-v1';
const ENGINE = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}\/dialectical-engine$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const CODE = /^STAFF_(READINESS|DB_HOST)_[A-Z_]{2,60}$/;
const refuse = code => { throw Object.assign(new Error(code), { code }); };

/** A socket folder only: peer logins exist only on the Unix socket, so a TCP host is refused. */
function socketHost(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || !/^\/[A-Za-z0-9/._-]+$/.test(value) || value.split('/').includes('..')) refuse('STAFF_DB_HOST_REFUSED');
  return value;
}

/**
 * The driver gets a "password" that refuses to be read: a server that asks for one (its pg_hba
 * still sends this login to a scram/password line) gets nothing, and the driver never looks for
 * one in ~/.pgpass or the environment. One connection, never pooled.
 */
export function readinessClientOptions({ host, layout = LAYOUT }) {
  return { host: socketHost(host), port: layout.pgPort, database: layout.database, user: READINESS_WRITER_ROLE,
    password: () => refuse('STAFF_READINESS_PASSWORD_REQUESTED'), ssl: false,
    connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000, application_name: 'preview-team-unlock' };
}

const FIELDS = {
  check: [],
  publish: ['configSha256', 'generation', 'ackAdapterId', 'rehearsalId', 'evidenceExpiresAt'],
  revoke: ['generation']
};

export function parseReadinessControl(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > 4096) throw new Error('size');
    const value = strictJson(bytes);
    const fields = Object.hasOwn(FIELDS, value?.op) ? FIELDS[value.op] : null;
    if (!fields) throw new Error('op');
    exactKeys(value, ['op', 'engine', 'pgPath', 'host', ...fields]);
    if (!ENGINE.test(value.engine) || typeof value.pgPath !== 'string' || normalize(value.pgPath) !== value.pgPath
      || !value.pgPath.startsWith(`${value.engine}/node_modules/`) || !value.pgPath.endsWith('.js')) throw new Error('release');
    socketHost(value.host);
    if (value.op === 'publish') {
      const at = Date.parse(value.evidenceExpiresAt);
      if (!HASH.test(value.configSha256) || !UUID.test(value.generation) || !UUID.test(value.rehearsalId)
        || typeof value.ackAdapterId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.ackAdapterId)
        || typeof value.evidenceExpiresAt !== 'string' || !Number.isFinite(at) || new Date(at).toISOString() !== value.evidenceExpiresAt) throw new Error('publish');
    }
    if (value.op === 'revoke' && !UUID.test(value.generation)) throw new Error('revoke');
    return value;
  } catch { return refuse('STAFF_READINESS_INPUT_REFUSED'); }
}

/** Who this connection really is: the readiness role itself (no SET ROLE), on the preview socket, with no powers and no memberships. */
export const PEER_IDENTITY_SQL = `SELECT session_user::text session,current_user::text role,current_database() database,current_setting('port')::int port,
  inet_client_addr() IS NULL unix_socket,r.rolcanlogin can_login,
  NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) no_elevated_powers,
  (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)::int memberships
  FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`;
export const peerIdentityAccepted = (row, layout = LAYOUT) => row?.session === READINESS_WRITER_ROLE && row.role === READINESS_WRITER_ROLE
  && row.database === layout.database && row.port === layout.pgPort && row.unix_socket === true && row.can_login === true
  && row.no_elevated_powers === true && row.memberships === 0;

const CALLS = {
  publish: { sql: 'SELECT staff.publish_independent_alert_readiness($1,$2,$3,$4,$5) AS value', params: c => [c.configSha256, c.generation, c.ackAdapterId, c.rehearsalId, c.evidenceExpiresAt] },
  revoke: { sql: 'SELECT staff.revoke_independent_alert_readiness($1) AS value', params: c => [c.generation] }
};

/** A refusal this file raised keeps its name; SQLSTATE class 28 (no pg_hba line, no pg_ident mapping for this OS user, no such role) is named for the operator. */
function connectRefusal(error) {
  if (typeof error?.code === 'string' && CODE.test(error.code)) return error;
  if (typeof error?.code === 'string' && error.code.startsWith('28')) return Object.assign(new Error('STAFF_READINESS_PEER_AUTH_REFUSED'), { code: 'STAFF_READINESS_PEER_AUTH_REFUSED' });
  return Object.assign(new Error('STAFF_READINESS_DATABASE_UNAVAILABLE'), { code: 'STAFF_READINESS_DATABASE_UNAVAILABLE' });
}

/** Ends the connection, but never waits more than 2 s for it (the process exits right after anyway). */
async function endWithin(client) {
  let timer;
  await Promise.race([Promise.resolve().then(() => client.end()).catch(() => undefined), new Promise(resolve => { timer = setTimeout(resolve, 2000); timer.unref?.(); })]);
  clearTimeout(timer);
}

/**
 * One call on one fresh connection. The identity check runs on THIS connection before anything
 * else; nothing is reused, so every connection is checked. `check` writes nothing.
 * Returns true/false: the database's own answer (`check`: the identity was accepted).
 */
export async function runReadinessOperation({ Client, control, layout = LAYOUT }) {
  const client = new Client(readinessClientOptions({ host: control.host, layout }));
  try {
    try { await client.connect(); } catch (error) { throw connectRefusal(error); }
    const rows = (await client.query(PEER_IDENTITY_SQL)).rows;
    if (rows.length !== 1 || !peerIdentityAccepted(rows[0], layout)) refuse('STAFF_READINESS_IDENTITY_REFUSED');
    if (control.op === 'check') return true;
    const call = CALLS[control.op] ?? refuse('STAFF_READINESS_INPUT_REFUSED');
    const result = await client.query(call.sql, call.params(control));
    return result.rows[0]?.value === true;
  } finally { await endWithin(client); }
}

/** The process this file must be: Linux, debateai-readiness (not root, not the root group), only its own group, nothing in its environment, no arguments. */
function assertIdentity() {
  const gid = process.getgid?.();
  if (process.platform !== 'linux' || process.getuid?.() === 0 || process.geteuid?.() === 0 || gid === 0 || process.getegid?.() === 0
    || userInfo().username !== READINESS_OS_USER || Object.keys(process.env).length !== 0 || process.argv.length !== 2 || process.execArgv.length !== 0
    || process.getgroups().some(group => group !== gid)) refuse('STAFF_READINESS_ACTOR_REFUSED');
}

async function readStdin() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 4096) refuse('STAFF_READINESS_INPUT_REFUSED'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

/**
 * The release's pg, from the exact path root verified. This user has no groups, so a release whose
 * files are not readable by others fails here; that gets its own name for the operator.
 */
export function requirePg(pgPath, load = createRequire(import.meta.url)) {
  try { return load(pgPath); } catch { return refuse('STAFF_READINESS_RELEASE_UNREADABLE'); }
}

async function main() {
  assertIdentity();
  const control = parseReadinessControl(await readStdin());
  return runReadinessOperation({ Client: requirePg(control.pgPath).Client, control });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exactly one line on stdout, nothing on stderr: a value (exit 0) or a named refusal (exit 1).
  let line, code;
  try {
    line = { schema: READINESS_RESULT_SCHEMA, ok: true, value: await main() }; code = 0;
  } catch (error) {
    line = { schema: READINESS_RESULT_SCHEMA, ok: false, code: typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'STAFF_READINESS_ACTOR_REFUSED' }; code = 1;
  }
  // Exit once the line is written, even if a refused connection's socket still lingers.
  process.exitCode = code;
  process.stdout.write(`${JSON.stringify(line)}\n`, () => process.exit(code));
}
