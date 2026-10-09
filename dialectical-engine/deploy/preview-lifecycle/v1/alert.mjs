// debateai-preview-alert@<unit>.service: one plain email to the owner when a preview unit
// has failed and systemd stopped restarting it.
//
// Plain words: the alert first asks systemd how the unit is doing (Result, NRestarts, state).
// If systemd gave up, the owner gets "Preview: <unit> gave up after N restarts", the time in UTC
// and in Bucharest, and the last 20 log lines with anything that looks like a secret blanked out.
// If systemd is still restarting it after a crash, no email: a crash that heals itself never
// emails (RestartMode=direct does not even start this unit for it); it shows in the journal and in
// NRestarts. An unreadable state still emails: an alert is never lost.
// At most one email per unit per 30 minutes. If mail itself fails, the reason goes to the
// journal and the alert exits quietly (an alert must never break anything else).
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { recipientPolicyFromInstallation } from '../../preview-mail/v4-20261005/sendmail-owned-preview.mjs';
import { LAYOUT, atomicWrite, ensureDirectory, logLine, runBounded, sha256 } from './common.mjs';

export const ALERT_WINDOW_MS = 30 * 60 * 1000;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9:_.@\\-]{0,200}\.(service|socket|timer|target|mount|path)$/;
const ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;

class AlertRefusal extends Error { constructor(code, fields) { super(code); this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new AlertRefusal(code, fields); };

/**
 * The four recipient fingerprints the preview mail is already allowed to reach. The allow-list is
 * server data, never source: it lives only in the root-owned installation file the preview mail
 * wrapper reads (`recipientSha256`: alias -> SHA-256 of the exact address bytes). Read through the
 * custody reader (no-follow regular file, one link, owner-only mode, unchanged while read, its
 * folder owned by the same owner and not group/other-writable, reached without any link) and
 * checked with the mail wrapper's own schema check. Anything else: no mail.
 */
export async function loadApprovedRecipientDigests({ path = LAYOUT.mailRecipientInstallationPath, ownerUid = 0 } = {}) {
  try {
    return await withPrivateBytes(path, { root: dirname(path), uid: ownerUid, mode: [0o600, 0o400], maxBytes: 1024 }, raw => {
      const installation = strictJson(raw);
      recipientPolicyFromInstallation(installation);
      return new Set(Object.values(installation.recipientSha256));
    });
  } catch { return refuse('RECIPIENT_ALLOW_LIST_UNAVAILABLE'); }
}

/** Exactly one address, one line, and one the preview is already allowed to mail. */
export function parseRecipient(raw, approvedDigests) {
  let text;
  try { text = new TextDecoder('utf8', { fatal: true }).decode(raw); } catch { refuse('RECIPIENT_REFUSED'); }
  const address = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (address.length > 254 || !ADDRESS.test(address) || !approvedDigests.has(sha256(address))) refuse('RECIPIENT_REFUSED');
  return address;
}

// A secret-bearing key: password, DB_PASSWORD, PGPASSWORD, client_secret, access_token,
// NETOPIA_API_KEY, x-api-key, sessionId, ... (any [A-Za-z0-9_] around the core word). The
// separator also covers JSON ("key":"value", "key" : "value").
const SECRET_WORD = String.raw`(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|session|dsn)`;
const SECRET_KEY = String.raw`[A-Za-z0-9_]*${SECRET_WORD}[A-Za-z0-9_]*`;
// A whole value: a double-quoted string with backslash escapes, a single-quoted string, or a bare
// word up to a space, quote, comma, semicolon, ampersand or closing brace. A quoted value cut
// before its closing quote runs to the end of the line, so no part of it is ever shown.
const QUOTED = String.raw`"(?:[^"\\]|\\[\s\S])*(?:"|\\?$)|'[^']*(?:'|$)`;
const VALUE = String.raw`${QUOTED}|(?!\[REDACTED\])[^\s"',;&}]+`;
/** The value blanked; a quoted value keeps its quotes. */
const blank = value => {
  const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
  return quote ? `${quote}[REDACTED]${value.length > 1 && value.endsWith(quote) ? quote : ''}` : '[REDACTED]';
};
// Credentials inside URLs: scheme://user:password@host, scheme://token@host, also with spaces or
// an @ in the password (up to the last @ before the first slash).
const URL_USERINFO = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/]*@/gi;
const RULES = [
  [URL_USERINFO, '$1[REDACTED]@'],
  // Whole header-style values (they may contain spaces).
  [/(?<![A-Za-z0-9_-])(proxy-authorization|authorization|set-cookie|cookie)(\s*[=:]\s*)(?!")(.*)$/gi, '$1$2[REDACTED]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, '$1 [REDACTED]'],
  // key=value, key: value, "key": "value", key='value'.
  [new RegExp(String.raw`(?<![A-Za-z0-9_])(${SECRET_KEY})("?\s*[=:]\s*)(${VALUE})`, 'gi'), (_, key, separator, value) => `${key}${separator}${blank(value)}`],
  // Flags with a plain space: --password value, -password value, --db-password 'value'.
  [new RegExp(String.raw`(?<![A-Za-z0-9_-])(--?[A-Za-z0-9_-]*${SECRET_WORD}[A-Za-z0-9_-]*)(\s+)(${VALUE})`, 'gi'), (_, flag, space, value) => `${flag}${space}${blank(value)}`],
  // -p value (mysql style). Kept readable when the value is a number (psql/pg_isready -p is the
  // port), a path (mkdir -p) or the next flag.
  [new RegExp(String.raw`(?<![A-Za-z0-9_-])(-p)(\s+)(${VALUE})`, 'g'), (match, flag, space, value) => (/^(?:\d+|[/-][\s\S]*)$/.test(value) ? match : `${flag}${space}${blank(value)}`)],
  // SQL: ALTER/CREATE ROLE ... PASSWORD 'literal'.
  [new RegExp(String.raw`(?<![A-Za-z0-9_])(password)(\s+)(${QUOTED})`, 'gi'), (_, word, space, value) => `${word}${space}${blank(value)}`],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED]'],
  [/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\b(?!127\.)(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]'],
  // Long hex, also right after an underscore or dash (where \b does not see a boundary).
  [/(?<![A-Za-z0-9])[a-fA-F0-9]{32,}(?![A-Za-z0-9])/g, '[HEX]'],
  // Random-looking blobs (base64, base64url, tokens): 32+ characters that mix upper case, lower
  // case and digits, or end in base64 padding. Names, paths and codes do not.
  [/(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{32,}(={1,2}(?![A-Za-z0-9+/=_-])|(?![A-Za-z0-9+/=_-]))/g,
    match => (match.endsWith('=') || (/[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9]/.test(match)) ? '[TOKEN]' : match)]
];
/** Only this much of a line is ever examined; the email shows at most 300 characters of it anyway. */
const MAX_EXAMINED = 2048;
const stripControl = text => text.replace(/[\u0000-\u001f\u007f]/g, '');
/** %XX runs decoded (so URL-encoded JSON is seen); a malformed run decodes only its ASCII escapes. */
const percentDecode = text => text.replace(/(?:%[0-9A-Fa-f]{2})+/g, run => {
  try { return decodeURIComponent(run); } catch { return run.replace(/%([0-7][0-9A-Fa-f])/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))); }
});
/** Blank anything secret-looking, drop control bytes, keep each line short. */
export function redactLine(line) {
  let text = String(line);
  if (text.length > MAX_EXAMINED) {
    const cutsToken = !/\s/.test(text[MAX_EXAMINED]);
    text = text.slice(0, MAX_EXAMINED);
    // Never keep the start of a token cut at the limit: drop it back to the last whitespace.
    if (cutsToken) { let end = text.length; while (end > 0 && !/\s/.test(text[end - 1])) end--; text = text.slice(0, Math.max(0, end - 1)); }
  }
  // Userinfo first on the raw text: decoding could turn an encoded / or @ in a password into a delimiter.
  text = stripControl(percentDecode(stripControl(text).replace(URL_USERINFO, '$1[REDACTED]@')));
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.slice(0, 300);
}

const STATE_KEYS = { Result: 'result', NRestarts: 'nRestarts', ActiveState: 'activeState', SubState: 'subState' };
/** `systemctl show` for the four fields that tell "gave up" from "restarting"; argv only, no shell. null when unreadable. */
export async function readUnitState(unit, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.systemctl, 'show', unit, '--property=Result,NRestarts,ActiveState,SubState', '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) return null;
  const state = {};
  for (const line of result.stdout.toString('utf8').split('\n').filter(Boolean)) {
    const at = line.indexOf('='), key = STATE_KEYS[line.slice(0, at)], value = line.slice(at + 1);
    if (!key || key in state) return null;
    if (key === 'nRestarts') { if (!/^\d{1,6}$/.test(value)) return null; state[key] = Number(value); }
    else if (/^[a-z][a-z-]{0,39}$/.test(value)) state[key] = value;
    else return null;
  }
  return Object.keys(state).length === 4 ? { result: state.result, nRestarts: state.nRestarts, activeState: state.activeState, subState: state.subState } : null;
}

const STILL_COMING_BACK = new Set(['activating', 'active', 'reloading']);
/**
 * gave-up: failed, or the start limit was hit -> always email.
 * restarting: systemd is bringing it back by itself -> no email.
 * unknown: state unreadable or unusual -> email (fail safe).
 */
export function classifyFailure(state) {
  if (!state) return { kind: 'unknown', send: true, restarts: null };
  const { result, nRestarts: restarts } = state;
  if (result === 'start-limit-hit' || state.activeState === 'failed') return { kind: 'gave-up', send: true, restarts, result };
  if (state.subState === 'auto-restart' || STILL_COMING_BACK.has(state.activeState)) {
    return { kind: 'restarting', send: false, restarts };
  }
  return { kind: 'unknown', send: true, restarts, result };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
function wording(unit, failure) {
  if (failure.kind === 'test') return {
    subject: 'Preview: test alert (nothing failed)',
    lead: `This is a test of the preview failure email, sent by hand with alert.mjs --test (unit name ${unit} is a placeholder). Nothing failed.`
  };
  if (failure.kind === 'gave-up') {
    const why = failure.result === 'start-limit-hit' ? 'start limit reached' : `result: ${failure.result}`;
    return failure.restarts > 0
      ? { subject: `Preview: ${unit} gave up after ${plural(failure.restarts, 'restart')}`, lead: `The private preview service ${unit} stopped, and systemd gave up after ${plural(failure.restarts, 'automatic restart')} (${why}).` }
      : { subject: `Preview: ${unit} failed and stayed down`, lead: `The private preview service ${unit} failed and was not restarted automatically (${why}).` };
  }
  return { subject: `Preview: ${unit} failed`, lead: `The private preview service ${unit} failed. Its current state could not be read, so check it on the server.` };
}

function bucharest(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
    .formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName ?? ''}`.trim();
}

export function composeAlert({ unit, at, lines, from, to, failure = { kind: 'unknown', send: true, restarts: null } }) {
  if (!UNIT.test(unit) || !ADDRESS.test(to) || !ADDRESS.test(from)) refuse('MESSAGE_REFUSED');
  const { subject, lead } = wording(unit, failure);
  const head = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Date: ${at.toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', 'Auto-Submitted: auto-generated'];
  const body = [
    lead, '',
    `Unit: ${unit}`, `Time (UTC): ${at.toISOString().slice(0, 19).replace('T', ' ')} UTC`, `Time (Bucharest): ${bucharest(at)}`, '',
    'What to look at on the server:', `  systemctl status ${unit}`, `  journalctl -u ${unit} -n 100`, '',
    `Last ${lines.length} journal lines (anything secret-looking replaced):`, ...lines.map(line => `  ${line}`), '',
    'You get at most one email per unit every 30 minutes.'
  ];
  return Buffer.from(`${head.join('\r\n')}\r\n\r\n${body.join('\r\n')}\r\n`, 'utf8');
}

export function shouldSend(lastSentAt, now) { return lastSentAt === null || !(now - lastSentAt < ALERT_WINDOW_MS); }

const stateFolder = layout => join(layout.stateDir, 'alert-state');
const statePath = (layout, unit) => join(stateFolder(layout), `${unit.replace(/[^A-Za-z0-9._@-]/g, '_')}.json`);
async function readLastSent(layout, unit) {
  const path = statePath(layout, unit);
  if (!await lstat(path).then(() => true, () => false)) return null;
  try {
    return await withPrivateBytes(path, { root: stateFolder(layout), uid: layout.ownerUid ?? 0, mode: 0o600, maxBytes: 1024 }, raw => {
      const value = strictJson(raw);
      return value?.unit === unit && Number.isSafeInteger(value.lastSentAt) ? value.lastSentAt : null;
    });
  } catch { return null; }
}
async function recordSent(layout, unit, at) {
  const uid = layout.ownerUid ?? 0;
  await ensureDirectory(layout.stateDir, { mode: 0o700, uid });
  await ensureDirectory(stateFolder(layout), { mode: 0o700, uid });
  await atomicWrite(statePath(layout, unit), Buffer.from(JSON.stringify({ unit, lastSentAt: at })), { mode: 0o600, uid, gid: layout.ownerGid ?? 0 });
}

/**
 * sendmail -t: recipients come from the To: header, so no address appears in any process list.
 * -odi: deliver (or queue) before exiting, never in a forked background process: runBounded
 * kills the whole process group once sendmail exits, which would cut a background delivery.
 */
export async function submitMail(message, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.sendmail, '-t', '-i', '-odi', '-f', layout.mailFrom], { env: { PATH: '/usr/sbin:/usr/bin:/bin' }, stdin: message, timeoutMs: 15000, maxOutputBytes: 4096 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) {
    throw Object.assign(new Error('MAIL_FAILED'), { mail: { exitCode: Number.isInteger(result.code) ? result.code : null, signal: typeof result.signal === 'string' ? result.signal : null, timedOut: result.timedOut === true } });
  }
}

/** Checked before the custody read so a wrong mode (an editor that saves by rename) is named in the journal. */
async function checkRecipientMode(layout) {
  const stat = await lstat(layout.alertRecipientPath).catch(() => refuse('RECIPIENT_REFUSED'));
  const mode = stat.mode & 0o777;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== (layout.ownerUid ?? 0) || stat.gid !== (layout.ownerGid ?? 0) || mode !== 0o600) {
    refuse('RECIPIENT_FILE_MODE_REFUSED', { mode: `0${mode.toString(8).padStart(3, '0')}` });
  }
}

export async function readJournalTail(unit, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.journalctl, '-u', unit, '-n', '20', '--no-pager', '-o', 'short-iso', '-q'], { env: {}, timeoutMs: 5000, maxOutputBytes: 65536 });
  if (result.timedOut || result.error || result.code !== 0) return ['(journal not readable)'];
  return result.stdout.toString('utf8').split('\n').filter(Boolean).slice(-20);
}

export const TEST_UNIT = 'debateai-preview-alert-test.service';
/** `--unit <unit>` (systemd) or `--test` (README test send); anything else is null. */
export function parseAlertArgs(argv) {
  if (argv.length === 1 && argv[0] === '--test') return { unit: TEST_UNIT, test: true };
  if (argv.length === 2 && argv[0] === '--unit' && typeof argv[1] === 'string') return { unit: argv[1], test: false };
  return null;
}

export async function runAlert({ unit, layout = LAYOUT, deps = {}, test = false }) {
  const log = deps.log ?? (event => logLine(process.stdout, event));
  const now = deps.now ?? Date.now;
  const done = event => { log(event); return event; };
  try {
    if (typeof unit !== 'string' || !UNIT.test(unit)) refuse('UNIT_REFUSED');
    const failure = test ? { kind: 'test', send: true, restarts: null }
      : classifyFailure(await Promise.resolve().then(() => (deps.readUnitState ?? (name => readUnitState(name, { layout })))(unit)).catch(() => null));
    if (!failure.send) return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SKIPPED', unit, state: failure.kind, restarts: failure.restarts });
    const at = now();
    const lastSentAt = await readLastSent(layout, unit);
    if (!shouldSend(lastSentAt, at)) return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SUPPRESSED', unit, lastSentAt: new Date(lastSentAt).toISOString() });
    const approved = await loadApprovedRecipientDigests({ path: layout.mailRecipientInstallationPath, ownerUid: layout.ownerUid ?? 0 });
    await checkRecipientMode(layout);
    const to = await withPrivateBytes(layout.alertRecipientPath, { root: dirname(layout.alertRecipientPath), uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0, mode: 0o600, maxBytes: 512 }, raw => parseRecipient(raw, approved))
      .catch(() => refuse('RECIPIENT_REFUSED'));
    const lines = (await (deps.readJournal ?? (name => readJournalTail(name, { layout })))(unit)).map(redactLine);
    const message = composeAlert({ unit, at: new Date(at), lines, from: layout.mailFrom, to, failure });
    try { await (deps.sendmail ?? (bytes => submitMail(bytes, { layout })))(message); } catch (error) {
      // Its own event: "the email did not go out" must stand out from every refusal before it.
      return done({ event: 'PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED', unit, reason: 'MAIL_FAILED', exitCode: error?.mail?.exitCode ?? null, signal: error?.mail?.signal ?? null, timedOut: error?.mail?.timedOut ?? false });
    }
    await recordSent(layout, unit, at).catch(() => undefined);
    return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SENT', unit });
  } catch (error) {
    return done({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: typeof unit === 'string' && UNIT.test(unit) ? unit : null, reason: error instanceof AlertRefusal ? error.code : 'UNEXPECTED', ...(error instanceof AlertRefusal && error.fields ? error.fields : {}) });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseAlertArgs(process.argv.slice(2));
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || !args) logLine(process.stdout, { event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: null, reason: 'ACTOR_REFUSED' });
  else await runAlert(args);
  // Quiet by design: the alert unit itself never fails and never triggers another alert.
}
