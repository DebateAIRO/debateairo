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
//
// Notices (debateai-preview-notice@<kind>-<code>.service, `--notice <kind>-<code>`): the same
// owner-only mail path for two fixed spending-gate events, started by the gate's watchers:
// "gate-halted-<reason>" (the gate stopped taking paid calls) and "gate-addresses-mismatch"
// (DeepInfra's addresses no longer match the gate's allow-list). Each carries the one command
// that fixes it. Fixed wording, no amounts; at most one per notice name per 30 minutes.
import { constants } from 'node:fs';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exactKeys, protectedPath, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { LAYOUT, atomicWrite, ensureDirectory, logLine, runBounded, sha256 } from './common.mjs';

export const ALERT_WINDOW_MS = 30 * 60 * 1000;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9:_.@\\-]{0,200}\.(service|socket|timer|target|mount|path)$/;
const ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;

const NOTICE = /^(gate-halted|gate-addresses)-([a-z0-9_]{1,64})$/;
const GATE_FOLDER = '/opt/debateai-v3-preview/operator/team-budget-v2';
const GATE_UNIT = 'debateai-preview-provider-budget.service';
const ADDRESS_UNIT = 'debateai-preview-gate-addresses.service';
/** The fixed wording and the one fixing command of each notice kind. */
const NOTICES = Object.freeze({
  'gate-halted': code => ({
    subject: `Preview: spending gate stopped: ${code}`,
    lead: `The preview spending gate stopped taking paid model calls. Reason code: ${code}. Debates on the preview fail until it is re-opened. Check the reason first (deploy/preview-gate/v2/README.md, "Re-open after a halt"; status shows today's spend and every halt). Then re-open it with the one command below.`,
    command: `/usr/bin/python3 -I ${GATE_FOLDER}/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-team-authority-v2 --go /etc/debateai-v3-preview/provider-team-go-v2.json`,
    lookAt: GATE_UNIT, journal: null
  }),
  'gate-addresses': code => ({
    subject: `Preview: spending gate address list needs an update (${code})`,
    lead: 'The hourly address check of the spending gate failed. Usually the addresses of api.deepinfra.com no longer match the gate\'s allow-list, and paid calls can fail until it is updated; the journal lines below say which case it is (DEEPINFRA_ADDRESSES_CHANGED, or another error such as an unreadable list). This email blanks addresses; to see the new ones, run the journalctl line under "What to look at" and check that they are DeepInfra\'s. Then run the one command below. It adds today\'s DNS answer to the list and restarts the gate.',
    command: `/usr/bin/python3 -I ${GATE_FOLDER}/deepinfra_addresses.py update --dropin /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf && systemctl restart debateai-preview-provider-budget`,
    lookAt: ADDRESS_UNIT, journal: ADDRESS_UNIT
  })
});
/** `<kind>-<code>` -> { kind, code, unit } for the two notice kinds; anything else null. */
export function parseNotice(text) {
  const match = typeof text === 'string' ? NOTICE.exec(text) : null;
  return match ? { kind: match[1], code: match[2], unit: `debateai-preview-notice@${text}.service` } : null;
}

class AlertRefusal extends Error { constructor(code, fields) { super(code); this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new AlertRefusal(code, fields); };
const octal = mode => `0${(mode & 0o777).toString(8).padStart(3, '0')}`;

/**
 * The alert's own owner list (README install step 2): {"version":1,"ownerSha256":["<hex>"]}, exactly
 * one lowercase hex SHA-256 fingerprint of the exact owner address bytes (alerts go to one primary
 * owner inbox). Nothing else is accepted: no other key, no duplicate key, no other version, no
 * second fingerprint.
 */
export const OWNER_LIST_VERSION = 1;
const DIGEST = /^[0-9a-f]{64}$/;
const OWNER_LIST_MAX_BYTES = 1024;
export function ownerDigestsFromList(value) {
  exactKeys(value, ['version', 'ownerSha256']);
  const list = value.ownerSha256;
  if (value.version !== OWNER_LIST_VERSION || !Array.isArray(list) || list.length !== 1
    || typeof list[0] !== 'string' || !DIGEST.test(list[0])) refuse('OWNER_ALERT_LIST_UNAVAILABLE');
  return new Set(list);
}

/**
 * The owner fingerprints the alert may mail. Server data, never source: only in the root-only file
 * LAYOUT.ownerAlertDigestsPath. Read through the custody reader (no-follow regular file, one link,
 * owner root:root, mode 0600 or 0400, at most 1 KiB, unchanged while read, its folder root-owned and
 * not group/other-writable, reached without any link). Anything else: no mail.
 */
export async function loadOwnerDigests({ layout = LAYOUT } = {}) {
  const path = layout.ownerAlertDigestsPath;
  try {
    return await withPrivateBytes(path, { root: dirname(path), uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0, mode: [0o600, 0o400], maxBytes: OWNER_LIST_MAX_BYTES },
      raw => ownerDigestsFromList(strictJson(raw)));
  } catch { return refuse('OWNER_ALERT_LIST_UNAVAILABLE'); }
}

/** Exactly one address on one line (an optional final newline), nothing else. */
export function parseRecipientAddress(raw) {
  let text;
  try { text = new TextDecoder('utf8', { fatal: true }).decode(raw); } catch { refuse('RECIPIENT_REFUSED'); }
  const address = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (address.length > 254 || !ADDRESS.test(address)) refuse('RECIPIENT_REFUSED');
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
  if (failure.kind === 'notice') return { subject: failure.notice.subject, lead: failure.notice.lead };
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
  const notice = failure.kind === 'notice' ? failure.notice : null;
  const look = notice ? notice.lookAt : unit;
  const body = [
    lead, '',
    ...(notice ? ['The one command (as root on the server):', `  ${notice.command}`, ''] : []),
    `Unit: ${unit}`, `Time (UTC): ${at.toISOString().slice(0, 19).replace('T', ' ')} UTC`, `Time (Bucharest): ${bucharest(at)}`, '',
    'What to look at on the server:', `  systemctl status ${look}`, `  journalctl -u ${look} -n 100`, '',
    ...(notice && lines.length === 0 ? [] : [`Last ${lines.length} journal lines (anything secret-looking replaced):`, ...lines.map(line => `  ${line}`), '']),
    notice ? 'You get at most one email per notice every 30 minutes.' : 'You get at most one email per unit every 30 minutes.'
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== (layout.ownerUid ?? 0) || stat.gid !== (layout.ownerGid ?? 0) || (stat.mode & 0o777) !== 0o600) {
    refuse('RECIPIENT_FILE_MODE_REFUSED', { mode: octal(stat.mode) });
  }
}

/** The one address in the root-only alert-recipient file (README install step 2), read with full custody. */
async function readRecipientAddress(layout) {
  await checkRecipientMode(layout);
  return withPrivateBytes(layout.alertRecipientPath, { root: dirname(layout.alertRecipientPath), uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0, mode: 0o600, maxBytes: 512 }, parseRecipientAddress)
    .catch(() => refuse('RECIPIENT_REFUSED'));
}

export async function readJournalTail(unit, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.journalctl, '-u', unit, '-n', '20', '--no-pager', '-o', 'short-iso', '-q'], { env: {}, timeoutMs: 5000, maxOutputBytes: 65536 });
  if (result.timedOut || result.error || result.code !== 0) return ['(journal not readable)'];
  return result.stdout.toString('utf8').split('\n').filter(Boolean).slice(-20);
}

export const TEST_UNIT = 'debateai-preview-alert-test.service';
/** `--unit <unit>` (systemd), `--notice <kind>-<code>` (gate watchers), `--test` (README test send) or `--install-owner-list` (README step 2); anything else is null. */
export function parseAlertArgs(argv) {
  if (argv.length === 1 && argv[0] === '--test') return { unit: TEST_UNIT, test: true };
  if (argv.length === 1 && argv[0] === '--install-owner-list') return { installOwnerList: true };
  if (argv.length === 2 && argv[0] === '--notice') {
    const notice = parseNotice(argv[1]);
    return notice ? { unit: notice.unit, test: false, notice } : null;
  }
  if (argv.length === 2 && argv[0] === '--unit' && typeof argv[1] === 'string') return { unit: argv[1], test: false };
  return null;
}

export async function runAlert({ unit, layout = LAYOUT, deps = {}, test = false, notice = null }) {
  const log = deps.log ?? (event => logLine(process.stdout, event));
  const now = deps.now ?? Date.now;
  const done = event => { log(event); return event; };
  try {
    if (typeof unit !== 'string' || !UNIT.test(unit)) refuse('UNIT_REFUSED');
    if (notice !== null && (parseNotice(`${notice.kind}-${notice.code}`)?.unit !== unit)) refuse('NOTICE_REFUSED');
    const failure = notice !== null ? { kind: 'notice', send: true, restarts: null, notice: NOTICES[notice.kind](notice.code) }
      : test ? { kind: 'test', send: true, restarts: null }
      : classifyFailure(await Promise.resolve().then(() => (deps.readUnitState ?? (name => readUnitState(name, { layout })))(unit)).catch(() => null));
    if (!failure.send) return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SKIPPED', unit, state: failure.kind, restarts: failure.restarts });
    const at = now();
    const lastSentAt = await readLastSent(layout, unit);
    if (!shouldSend(lastSentAt, at)) return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SUPPRESSED', unit, lastSentAt: new Date(lastSentAt).toISOString() });
    const owners = await loadOwnerDigests({ layout });
    const to = await readRecipientAddress(layout);
    if (!owners.has(sha256(to))) refuse('RECIPIENT_REFUSED');
    // A notice reads only its fixed source unit's journal (the address check), or none (a halt:
    // the gate's own lines carry per-call amounts, which a notice never mails).
    const journalUnit = failure.kind === 'notice' ? failure.notice.journal : unit;
    const lines = journalUnit === null ? [] : (await (deps.readJournal ?? (name => readJournalTail(name, { layout })))(journalUnit)).map(redactLine);
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

/**
 * Same folder as the target; written fully, synced, then hard-linked into place. link() never
 * replaces an existing name (EEXIST), so a list someone else created in the meantime is never
 * overwritten, and a reader sees no file or the whole file, never a partial one.
 */
async function createExclusive(path, bytes, { mode, uid, gid }, { linkFile = link, unlinkFile = unlink } = {}) {
  const folder = dirname(path);
  await protectedPath(path, { root: folder, uid }).catch(() => refuse('OWNER_ALERT_LIST_WRITE_REFUSED'));
  const temporary = join(folder, `.${basename(path)}.${randomBytes(8).toString('hex')}.tmp`);
  let handle, created = false, linking = false, linked = false;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    created = true;
    await handle.chown(uid, gid);
    await handle.chmod(mode);
    for (let offset = 0; offset < bytes.length;) offset += (await handle.write(bytes, offset)).bytesWritten;
    await handle.sync();
    await handle.close(); handle = undefined;
    linking = true;
    await linkFile(temporary, path);
    linking = false; linked = true;
    await unlinkFile(temporary); created = false;
    const directory = await open(folder, constants.O_RDONLY);
    try { await directory.sync(); } catch { /* Some platforms refuse fsync on a directory; link and unlink are already atomic. */ } finally { await directory.close(); }
  } catch (error) {
    if (error instanceof AlertRefusal) throw error;
    // Once linked, the list exists: say so, so the owner never reads "nothing was written".
    if (linked) refuse('OWNER_ALERT_LIST_INSTALLED_CLEANUP_FAILED');
    refuse(linking && error?.code === 'EEXIST' ? 'OWNER_ALERT_LIST_EXISTS' : 'OWNER_ALERT_LIST_WRITE_REFUSED');
  } finally {
    await handle?.close().catch(() => undefined);
    if (created) await unlinkFile(temporary).catch(() => undefined);
  }
}

/**
 * `alert.mjs --install-owner-list` (root, README install step 2): builds the owner list ON THE
 * SERVER from the address already typed into alert-recipient, so the address is typed once and
 * never appears in a command, and its fingerprint is never shown. Prints exactly one line: a fixed
 * code plus the file's mode, or a fixed failure reason. Never the address, never the fingerprint.
 * - list missing: create it root:root 0600 with this one fingerprint.
 * - list present, valid, already holding this fingerprint: nothing to do (ALREADY_INSTALLED).
 * - list present but different or broken: refuse; replacing an owner list is a deliberate
 *   `rm` by the owner first, never a side effect of this command.
 */
export async function installOwnerList({ layout = LAYOUT, deps = {} } = {}) {
  const log = deps.log ?? (event => logLine(process.stdout, event));
  const done = event => { log(event); return event; };
  try {
    const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0, path = layout.ownerAlertDigestsPath;
    const fingerprint = sha256(await readRecipientAddress(layout));
    const existing = await lstat(path).catch(error => (error?.code === 'ENOENT' ? null : refuse('OWNER_ALERT_LIST_WRITE_REFUSED')));
    if (existing) {
      if (!(await loadOwnerDigests({ layout })).has(fingerprint)) refuse('OWNER_ALERT_LIST_EXISTS');
      return done({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_ALREADY_INSTALLED', mode: octal(existing.mode) });
    }
    const bytes = Buffer.from(`${JSON.stringify({ version: OWNER_LIST_VERSION, ownerSha256: [fingerprint] })}\n`, 'utf8');
    try { await createExclusive(path, bytes, { mode: 0o600, uid, gid }, { linkFile: deps.link, unlinkFile: deps.unlink }); } finally { bytes.fill(0); }
    // Read back exactly as the alert reads it: the list must pass custody and hold this fingerprint.
    const written = await loadOwnerDigests({ layout }).catch(() => refuse('OWNER_ALERT_LIST_INSTALLED_CLEANUP_FAILED'));
    if (!written.has(fingerprint)) refuse('OWNER_ALERT_LIST_INSTALLED_CLEANUP_FAILED');
    return done({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_INSTALLED', mode: octal((await lstat(path)).mode) });
  } catch (error) {
    return done({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', reason: error instanceof AlertRefusal ? error.code : 'UNEXPECTED', ...(error instanceof AlertRefusal && error.fields ? error.fields : {}) });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseAlertArgs(process.argv.slice(2));
  const actor = process.platform === 'linux' && process.getuid?.() === 0;
  if (args?.installOwnerList) {
    // The owner runs this by hand: a failure exits non-zero so it cannot be missed.
    const event = actor ? await installOwnerList() : (logLine(process.stdout, { event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', reason: 'ACTOR_REFUSED' }), { event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED' });
    if (event.event === 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED') process.exitCode = 1;
  } else if (!actor || !args) logLine(process.stdout, { event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: null, reason: 'ACTOR_REFUSED' });
  else await runAlert(args);
  // Quiet by design: the alert unit itself never fails and never triggers another alert.
}
