// Runs ONLY as the postgres OS user, started by unlock-team-tools.mjs through the reviewed
// postgres-peer channel: peer packet on FD3, argv exactly `--credential-fd 3`, environment
// exactly PATH/LANG/LC_ALL/TZ. Control (and, for open, the password) arrive on stdin only.
//
// It changes exactly one thing: the existing debateai_prod_staff_recovery login's password and
// expiry. No grants, no ownership, no other role. SQL is ported from the reviewed task-12 root
// actor (open/close), plus `extend`, which moves only the expiry forward (never past 5 minutes).
import { userInfo } from 'node:os';
import { pathToFileURL } from 'node:url';
import { exactKeys, strictJson } from '../../preview-auth-dev/v1/custody.mjs';
import { LAYOUT } from './common.mjs';
import { loadPinnedRelease } from './prestart.mjs';
import { verifyReleaseForImport } from './release-guard.mjs';

const ENGINE = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}\/dialectical-engine$/;
const LIMIT_MS = 5 * 60 * 1000;
const refuse = code => { throw Object.assign(new Error(code), { code }); };

export function parseCreatorInput(bytes, now = Date.now()) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > 1024) throw new Error('size');
    const split = bytes.indexOf(0x0a);
    if (split < 1) throw new Error('header');
    const header = strictJson(bytes.subarray(0, split));
    const rest = bytes.subarray(split + 1);
    const mode = header?.mode;
    exactKeys(header, mode === 'close' ? ['mode', 'engine'] : ['mode', 'validUntil', 'engine']);
    if (!['open', 'extend', 'close'].includes(mode) || !ENGINE.test(header.engine)) throw new Error('mode');
    let validUntil = null;
    if (mode !== 'close') {
      const ahead = Date.parse(header.validUntil) - now;
      if (typeof header.validUntil !== 'string' || new Date(header.validUntil).toISOString() !== header.validUntil || !(ahead > 0 && ahead <= LIMIT_MS)) throw new Error('lease');
      validUntil = header.validUntil;
    }
    let password = null;
    if (mode === 'open') {
      if (rest.length !== 65 || rest[64] !== 0x0a || !/^[0-9a-f]{64}$/.test(rest.subarray(0, 64).toString('latin1'))) throw new Error('password');
      password = Buffer.from(rest.subarray(0, 64));
    } else if (rest.length !== 0) throw new Error('secret');
    return { mode, validUntil, engine: header.engine, password };
  } catch { return refuse('STAFF_JIT_INPUT_REFUSED'); }
}

/** The three release modules this actor loads, in load order. */
export function creatorImportPaths(engine) {
  return [`${engine}/node_modules/tsx/dist/esm/api/index.mjs`, `${engine}/packages/db/src/migration-lineage.ts`, `${engine}/deploy/preview-auth-dev/v1/native-peer.mjs`];
}

/**
 * This actor is the database superuser's OS identity, so it does not take the release on the
 * caller's word: it reads the pinned API release itself, requires the engine it was handed to be
 * exactly that release, and runs the launchers' source check before importing anything from it.
 */
export async function verifyCreatorRelease({ engine, loadPinned = () => loadPinnedRelease({ service: 'api' }), guard = verifyReleaseForImport }) {
  try {
    const { entry, plan } = await loadPinned();
    if (engine !== `${entry.sourceRoot}/dialectical-engine`) refuse('STAFF_JIT_RELEASE_REFUSED');
    const importPaths = creatorImportPaths(engine);
    await guard({ plan, importPaths });
    return importPaths;
  } catch { return refuse('STAFF_JIT_RELEASE_REFUSED'); }
}

async function originalCreator(client) {
  const rows = (await client.query(`SELECT session_user::text session,current_user::text role,current_database() database,
    current_setting('port')::int port,current_setting('cluster_name') cluster,current_setting('data_directory') directory,
    (current_setting('server_version_num')::int/10000) major FROM pg_roles WHERE rolname=current_user`)).rows;
  const r = rows[0];
  if (rows.length !== 1 || r.session !== 'postgres' || r.role !== 'debateai_prod_migrator' || r.database !== 'debateai' || r.port !== 5434
    || r.cluster !== 'debateai-v3-preview-15fccd74' || r.directory !== '/var/lib/postgresql/18/v3-preview' || r.major !== 18) refuse('STAFF_JIT_CREATOR_REFUSED');
}

async function principalState(client) {
  const rows = (await client.query(`SELECT r.rolcanlogin,r.rolinherit,
    NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) no_elevated_powers,
    a.rolpassword IS NULL password_null,r.rolvaliduntil='-infinity'::timestamptz expired_minus_infinity,
    COALESCE(r.rolvaliduntil>clock_timestamp(),false) open_now,
    (SELECT count(*)::int FROM pg_stat_activity WHERE usename=r.rolname) sessions,
    (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) memberships,
    (SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid AND p.rolname='debateai_staff_recovery' AND NOT m.admin_option AND m.inherit_option AND m.set_option) exact_capability,
    (SELECT count(*)::int FROM pg_auth_members WHERE roleid=r.oid) members
    FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname='debateai_prod_staff_recovery'`)).rows;
  const r = rows[0];
  if (rows.length !== 1 || !r.rolcanlogin || !r.rolinherit || !r.no_elevated_powers || r.memberships !== 1 || r.exact_capability !== 1 || r.members !== 0) refuse('STAFF_JIT_PRINCIPAL_REFUSED');
  return r;
}

async function bounded(client, validUntil) {
  const ok = (await client.query(`SELECT $1::timestamptz>clock_timestamp() AND $1::timestamptz<=clock_timestamp()+interval '5 minutes' ok`, [validUntil])).rows[0]?.ok;
  if (ok !== true) refuse('STAFF_JIT_LEASE_REFUSED');
}
async function confirmBounded(client) {
  const ok = (await client.query(`SELECT rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes' ok FROM pg_roles WHERE rolname='debateai_prod_staff_recovery'`)).rows[0]?.ok;
  if (ok !== true) refuse('STAFF_JIT_LEASE_REFUSED');
}

export async function closeLogin(client) {
  await originalCreator(client);
  await principalState(client);
  await client.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'");
  const until = Date.now() + 5000;
  let state;
  do { state = await principalState(client); if (state.sessions === 0) break; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < until);
  if (!state.password_null || !state.expired_minus_infinity || state.sessions !== 0) refuse('STAFF_JIT_CLOSE_REFUSED');
  return { passwordNull: true, expiredMinusInfinity: true, noSessions: true, capabilitiesPreserved: true };
}

async function openLogin(client, password, validUntil) {
  let changed = false;
  try {
    await originalCreator(client);
    const before = await principalState(client);
    if (!before.password_null || !before.expired_minus_infinity || before.sessions !== 0) refuse('STAFF_JIT_ALREADY_OPEN');
    // Session-local logging protection before any password-bearing statement. No global change.
    await client.query("SET log_statement='none'"); await client.query('SET log_parameter_max_length=0');
    await client.query('SET log_parameter_max_length_on_error=0'); await client.query("SET log_min_error_statement='panic'");
    await client.query("SET password_encryption='scram-sha-256'");
    await bounded(client, validUntil);
    const statement = (await client.query(`SELECT format('ALTER ROLE debateai_prod_staff_recovery PASSWORD %L VALID UNTIL %L',$1::text,$2::timestamptz::text) statement`, [password.toString('latin1'), validUntil])).rows[0]?.statement;
    if (typeof statement !== 'string') refuse('STAFF_JIT_OPEN_REFUSED');
    changed = true;
    await client.query(statement);
    await confirmBounded(client);
    return { existingRoleOpened: true, passwordExported: false, capabilitiesChanged: false };
  } catch (error) {
    if (changed) await closeLogin(client).catch(() => undefined);
    throw error;
  } finally { password.fill(0); }
}

async function extendLogin(client, validUntil) {
  await originalCreator(client);
  const state = await principalState(client);
  // Only a window that is still open may be extended; a lapsed one stays closed.
  if (state.password_null || !state.open_now) refuse('STAFF_JIT_NOT_OPEN');
  await bounded(client, validUntil);
  const statement = (await client.query(`SELECT format('ALTER ROLE debateai_prod_staff_recovery VALID UNTIL %L',$1::timestamptz::text) statement`, [validUntil])).rows[0]?.statement;
  if (typeof statement !== 'string') refuse('STAFF_JIT_EXTEND_REFUSED');
  await client.query(statement);
  await confirmBounded(client);
  return { validUntilExtended: true };
}

async function readStdin() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 1024) refuse('STAFF_JIT_INPUT_REFUSED'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

async function main() {
  if (process.platform !== 'linux' || process.getuid?.() === 0 || userInfo().username !== 'postgres'
    || Object.keys(process.env).sort().join(',') !== 'LANG,LC_ALL,PATH,TZ' || process.argv.slice(2).join(',') !== '--credential-fd,3') refuse('STAFF_JIT_ACTOR_REFUSED');
  const raw = await readStdin();
  let input;
  try { input = parseCreatorInput(raw); } finally { raw.fill(0); }
  try {
    const [tsxPath, lineagePath, peerPath] = await verifyCreatorRelease({ engine: input.engine });
    const { tsImport } = await import(pathToFileURL(tsxPath).href);
    const lineage = await tsImport(lineagePath, import.meta.url);
    const migration = await lineage.loadMigrationPlan();
    const { withActiveNativePool } = await import(pathToFileURL(peerPath).href);
    const result = await withActiveNativePool({ publicPeerModule: LAYOUT.peerModule, auth106Names: migration.manifest.cohorts.auth106 }, async pool => {
      const client = await pool.connect();
      try {
        if (input.mode === 'open') return await openLogin(client, input.password, input.validUntil);
        if (input.mode === 'extend') return await extendLogin(client, input.validUntil);
        return await closeLogin(client);
      } finally { client.release(); }
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { input.password?.fill(0); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch { process.exitCode = 1; /* No output: the caller treats silence + exit 1 as refusal. */ }
}
