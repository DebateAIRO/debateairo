// rekey-staff-key.mjs: run by root, by hand, when a staff member has no staff key that works under
// the name the site answers as (after the site was renamed):
//   rekey-staff-key.mjs arm-owner <sign-in code>            for the one active Owner
//   rekey-staff-key.mjs arm-user <user id> <sign-in code>   for another active staff member
// The sign-in code is the eight characters Settings shows under "Current session" in that
// person's own browser. The operator reads it there and types it here, so the permit is for
// exactly that sign-in and never for one somebody else made with a stolen password and code.
//
// Plain words: a staff key belongs to one site name, and an account that is already staff may not
// add a key with password and authenticator code alone (a stolen password must never add one). This
// tool is the operator's yes for ONE person and ONE key: it writes a permit in the database
// (migrations/0183_staff_rekey_permit.sql, staff.arm_rekey) that lasts at most 15 minutes, is bound
// to the sign-in the operator named, and is used up when that person's key ceremony starts.
// The person then enrols the key on the Team page with password and code, while the team tools are
// unlocked. The key change writes the usual audit row and sends the usual independent alert.
//
// How: only the staff recovery login may write a permit, and only while that login expires within
// 5 minutes (the database checks both). So this tool opens that login just in time through the
// same postgres-peer creator actor the team unlock's fallback uses (jit-creator-actor.mjs), with a
// random password that lives only in this process's memory, makes the one call, and resets the
// login to PASSWORD NULL VALID UNTIL '-infinity' before it ends. If the login is already open
// (the team unlock runs on its fallback writer), the creator refuses and nothing changes. The run
// is short, so SIGINT, SIGTERM and SIGHUP are held until it has reset the login.
//
// The name and origin come from the current release's API file and nowhere else: the staff screens
// must be on (STAFF_ACCESS_POLICY_VERSION=2) and the staff name lines must name the site the API
// answers as. One JSON line is printed; it carries no account id, no key and no password.
import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { publicSiteOf } from '../../preview-auth-dev/v1/public-origins.mjs';
import { LAYOUT, logLine } from './common.mjs';
import { verifyReleaseForImport } from './release-guard.mjs';
import { INTERIM_IDENTITY_SQL, creatorRunner, interimIdentityAccepted, loadCurrentApiRelease, openCheckedPool, resolveStaffDbHost, staffPoolOptions } from './unlock-team-tools.mjs';

/** The login is opened for this long: room for the creator's own release check (about 12 s) and one call, far under the database's 5 minutes. */
export const REKEY_LEASE_MS = 3 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A sign-in's code: the first eight characters of its id, as Settings shows it. */
const SIGN_IN_CODE = /^[0-9a-f]{8}$/;
const SOURCE_ROOT = /^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
/** The refusals of staff.arm_rekey and of its just-in-time guard, passed on by name; anything else is ARM_REFUSED. */
const ARM_CODE = /^STAFF_(REKEY_[A-Z_]{2,40}|RECOVERY_JIT_REQUIRED)$/;

class RekeyRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new RekeyRefusal(code); };
const reasonOf = error => (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.code) ? error.code : 'UNEXPECTED');

/** `arm-owner <code>`, or `arm-user <uuid> <code>`; nothing else. The Owner is named by null: the database finds the one active Owner itself. */
export function parseRekeyArguments(argv) {
  if (argv.length === 2 && argv[0] === 'arm-owner' && SIGN_IN_CODE.test(argv[1])) return { userId: null, signIn: argv[1] };
  if (argv.length === 3 && argv[0] === 'arm-user' && UUID.test(argv[1]) && SIGN_IN_CODE.test(argv[2])) return { userId: argv[1], signIn: argv[2] };
  return refuse('ARGUMENTS_REFUSED');
}

/**
 * The site a new staff key is for, from the API's own settings: the staff screens on, and the
 * staff origin and name exactly the listed site the API answers as (the launcher refuses to start
 * the API otherwise, PREVIEW_STAFF_ORIGIN_MISMATCH; this reads the file again so a file edited
 * since the last start is refused here too).
 */
export function staffSiteOf(configured) {
  const site = publicSiteOf(configured?.PUBLIC_APP_URL);
  if (!site) refuse('PUBLIC_NAME_REFUSED');
  if (configured.STAFF_ACCESS_POLICY_VERSION !== '2') refuse('STAFF_SCREENS_OFF');
  if (configured.STAFF_WEBAUTHN_ORIGIN !== site.origin || configured.STAFF_WEBAUTHN_RP_ID !== site.hostname || site.origin !== `https://${site.hostname}`) refuse('STAFF_NAME_MISMATCH');
  return { rpId: site.hostname, origin: site.origin };
}

function armed(value) {
  const expiresAt = new Date(value?.expiresAt), startedAt = new Date(value?.sessionStartedAt);
  if (typeof value?.permitId !== 'string' || !UUID.test(value.permitId) || !Number.isFinite(expiresAt.getTime()) || !Number.isFinite(startedAt.getTime())
    || !Number.isSafeInteger(value.otherSignIns) || value.otherSignIns < 0) refuse('ARM_ANSWER_REFUSED');
  return { expiresAt: expiresAt.toISOString(), signInStartedAt: startedAt.toISOString(), otherSignIns: value.otherSignIns };
}

/**
 * Open the login, make the one call, close the login. The login is closed whenever this run
 * opened it, whatever happened after; it is never closed when the open itself was refused (then
 * another tool holds it, or it was never opened).
 *   runCreator(control, secret)  the postgres-peer actor (open / close)
 *   createPool(passwordText)     a checked pool as the recovery login
 */
export async function armRekey({ target, site, runCreator, createPool, randomBytes = cryptoRandomBytes, now = Date.now }) {
  let pool = null, opened = false, result = null, failure = null, roleReset = null;
  const secret = randomBytes(32), password = Buffer.from(secret.toString('hex'));
  try {
    const validUntil = new Date(now() + REKEY_LEASE_MS).toISOString();
    const open = await runCreator({ mode: 'open', validUntil }, password);
    if (open?.existingRoleOpened !== true) refuse('STAFF_JIT_OPEN_REFUSED');
    opened = true;
    // The pool driver keeps its own copy for the one connection; ours is zeroed in the finally below.
    pool = await createPool(password.toString());
    let rows;
    try { rows = (await pool.query('SELECT staff.arm_rekey($1::uuid,$2,$3,$4) AS value', [target.userId, site.rpId, site.origin, target.signIn])).rows; }
    catch (error) { refuse(typeof error?.message === 'string' && ARM_CODE.test(error.message) ? error.message : 'ARM_REFUSED'); }
    if (rows.length !== 1) refuse('ARM_ANSWER_REFUSED');
    result = armed(rows[0].value);
  } catch (error) { failure = reasonOf(error); }
  finally {
    secret.fill(0); password.fill(0);
    try { await pool?.end(); } catch { /* the role reset below is what matters */ }
    if (opened) {
      try {
        const closed = await runCreator({ mode: 'close' }, null);
        roleReset = closed?.passwordNull === true && closed?.expiredMinusInfinity === true && closed?.noSessions === true;
      } catch { roleReset = false; }
    }
  }
  return failure === null ? { armed: true, ...result, name: site.rpId, roleReset } : { armed: false, reason: failure, roleReset };
}

// ---------------------------------------------------------------------------------------------
// Server wiring below: needs the server, root and the release package.

async function runServer(target) {
  const { entry, plan } = await loadCurrentApiRelease();
  if (!SOURCE_ROOT.test(entry.sourceRoot)) refuse('RELEASE_REFUSED');
  const engine = `${entry.sourceRoot}/dialectical-engine`;
  const configured = await readEnvironmentFile(plan.environment.path, plan.environment);
  let site;
  try { site = staffSiteOf(configured); } finally { for (const key of Object.keys(configured)) configured[key] = ''; }
  // Root loads one release file, the database driver, and only after the launchers' own source check.
  const pgPath = createRequire(`${engine}/package.json`).resolve('pg');
  await verifyReleaseForImport({ plan, importPaths: [pgPath] });
  const pg = createRequire(`${engine}/package.json`)(pgPath);
  // Always the preview's own local socket: a tool run by hand reads no host from its environment.
  const host = resolveStaffDbHost(undefined);
  return armRekey({
    target, site, runCreator: creatorRunner({ engine, nodePath: process.execPath }),
    createPool: password => openCheckedPool({ Pool: pg.Pool, options: { ...staffPoolOptions({ target: host, password, ca: null }), application_name: 'preview-staff-rekey' },
      sql: INTERIM_IDENTITY_SQL, accepted: row => interimIdentityAccepted(row, LAYOUT), code: 'STAFF_JIT_IDENTITY_REFUSED' })
  });
}

export const HELD_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

/**
 * One line, then the exit code: 0 only when a permit was armed AND the login was reset. A permit
 * armed with the login not reset still exits non-zero, so the operator resets it
 * (`unlock-team-tools.mjs reset`); the login's own expiry is at most three minutes away.
 */
export async function runCommand(argv, { platform = process.platform, uid = process.getuid?.(), run = runServer, log = event => logLine(process.stdout, event), signals = process } = {}) {
  // A signal must not end the process between opening the login and resetting it.
  const hold = () => {};
  for (const name of HELD_SIGNALS) signals.on(name, hold);
  try {
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = await run(parseRekeyArguments(argv));
    if (result?.armed === true) {
      log({ event: 'PREVIEW_STAFF_REKEY_ARMED', name: result.name, expiresAt: result.expiresAt, signInStartedAt: result.signInStartedAt, otherSignIns: result.otherSignIns, roleReset: result.roleReset === true });
      return result.roleReset === true ? 0 : 1;
    }
    log({ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: reasonOf({ code: result?.reason }), roleReset: result?.roleReset ?? null });
    return 1;
  } catch (error) {
    log({ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: reasonOf(error), roleReset: null });
    return 1;
  } finally { for (const name of HELD_SIGNALS) signals.off(name, hold); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCommand(process.argv.slice(2));
}
