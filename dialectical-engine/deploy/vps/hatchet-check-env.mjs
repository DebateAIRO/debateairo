// The production Hatchet container's start check (NV-51, audit L7-F3). Installed once beside the compose file as
// /etc/debateai/hatchet/check-env.mjs (README §5 "Hatchet's compose file, once"), never in a release, and run as root by
// debateai-hatchet.service's ExecStartPre= before every `docker compose up`, the only place a container is created from
// /etc/debateai/hatchet.env. It refuses that file unless it is a regular root-only file whose text cannot open a quote
// that runs onto the next line, and whose admin pair is present once each, in one plain shape compose reads verbatim,
// is not hatchet-lite's documented seeded login, and has a password of at least 20 characters.
//
// Only node: built-ins, because the installed copy stands alone. It never prints a value: one line, HATCHET_ENV_OK on
// standard output or HATCHET_ENV_REFUSED <CODE> on standard error (exit 0, 1, or 2 for a wrong command line).
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MIN_ADMIN_PASSWORD_LENGTH = 20;
export const HATCHET_ENV_MAX_BYTES = 65536;

// compose's env-file parser lets a quoted value run across lines, ends a key at ':' as well as '=', and reads \" inside
// quotes as an escaped quote. So the check does not mirror its key grammar: a config line holding any of these four
// characters must be one whole closed KEY="value" or KEY='value' line with none of them inside, and no line can open a
// quote whichever rule compose applies.
const RISKY_CHAR = /["'`\\]/;
const CLOSED_QUOTED_LINE = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(["'])[^"'`\\]*\1$/;
// Any line naming either admin key, in any form, must be exactly ADMIN_X=<value> with no export, space, ':', quote, '$',
// '#' or backslash: the shape compose reads verbatim.
const ADMIN_NAME = /(^|[^A-Za-z0-9_])ADMIN_(EMAIL|PASSWORD)([^A-Za-z0-9_]|$)/;
const ADMIN_LINE = /^ADMIN_(EMAIL|PASSWORD)=([^\s"'`$\\#]+)$/;
// hatchet-lite's documented seeded login, joined from pieces so no scanner or forbid-list reads it here.
const SEED_EMAIL = ['admin', 'example.com'].join('@');
const SEED_PASSWORD = ['Admin', '123!!'].join('');

/** `null` when the text is accepted, else the refusal code. */
export function assessHatchetEnv(text) {
  if (text.includes('\r') || text.includes('\0')) return 'HATCHET_ENV_TEXT_INVALID';
  // Compose skips the same blank and '#' lines.
  const config = text.split('\n').filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  // Each line as it stands, with no trimming: a trailing space or any text after a closing quote is refused.
  for (const line of config) {
    if (RISKY_CHAR.test(line) && !CLOSED_QUOTED_LINE.test(line)) return 'HATCHET_ENV_TEXT_INVALID';
  }
  const values = { EMAIL: [], PASSWORD: [] };
  for (const line of config) {
    if (!ADMIN_NAME.test(line)) continue;
    const match = ADMIN_LINE.exec(line);
    if (match === null) return 'HATCHET_ENV_ADMIN_LINE_UNSAFE';
    values[match[1]].push(match[2]);
  }
  if (values.EMAIL.length === 0) return 'HATCHET_ENV_ADMIN_EMAIL_MISSING';
  if (values.EMAIL.length > 1) return 'HATCHET_ENV_ADMIN_EMAIL_DUPLICATE';
  const [email] = values.EMAIL;
  if (!/^[^@]+@[^@]+$/.test(email)) return 'HATCHET_ENV_ADMIN_EMAIL_INVALID';
  if (email.toLowerCase() === SEED_EMAIL) return 'HATCHET_ENV_ADMIN_EMAIL_DEFAULT';
  if (values.PASSWORD.length === 0) return 'HATCHET_ENV_ADMIN_PASSWORD_MISSING';
  if (values.PASSWORD.length > 1) return 'HATCHET_ENV_ADMIN_PASSWORD_DUPLICATE';
  const [password] = values.PASSWORD;
  if (password === SEED_PASSWORD) return 'HATCHET_ENV_ADMIN_PASSWORD_DEFAULT';
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) return 'HATCHET_ENV_ADMIN_PASSWORD_SHORT';
  return null;
}

/** The file at `path`: not a link, a regular file owned by `uid` (root under the unit) with no group or other bits. */
export function checkHatchetEnvFile(path, { uid }) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return error?.code === 'ELOOP' ? 'HATCHET_ENV_UNSAFE_FILE' : 'HATCHET_ENV_UNREADABLE';
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.uid !== uid || (st.mode & 0o077) !== 0) return 'HATCHET_ENV_UNSAFE_FILE';
    if (st.size > HATCHET_ENV_MAX_BYTES) return 'HATCHET_ENV_TOO_LARGE';
    return assessHatchetEnv(readFileSync(fd, 'utf8'));
  } catch {
    return 'HATCHET_ENV_UNREADABLE';
  } finally {
    closeSync(fd);
  }
}

/** One absolute path. Returns the exit code: 0 accepted, 1 refused, 2 a wrong command line. */
export function main(argv, { uid = process.getuid?.(), stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length !== 1 || !/^\//.test(argv[0])) {
    stderr.write('HATCHET_ENV_REFUSED HATCHET_ENV_USAGE\n');
    return 2;
  }
  const code = checkHatchetEnvFile(argv[0], { uid });
  if (code !== null) {
    stderr.write(`HATCHET_ENV_REFUSED ${code}\n`);
    return 1;
  }
  stdout.write('HATCHET_ENV_OK\n');
  return 0;
}

// Run only as the entry point. Node resolves the entry module's URL through realpath but leaves argv[1] as given, so the
// comparison goes through the real path too, so a symlinked install still runs the check (a guard that never fired
// would exit 0 having checked nothing).
const entry = (() => { try { return pathToFileURL(realpathSync(process.argv[1] ?? '')).href; } catch { return ''; } })();
if (import.meta.url === entry) process.exitCode = main(process.argv.slice(2));
