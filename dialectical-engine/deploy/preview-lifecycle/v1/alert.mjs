// debateai-preview-alert@<unit>.service: one plain email to the owner when a preview unit
// has failed and systemd stopped restarting it.
//
// Plain words: the owner gets "Preview: <unit> failed to restart", the time in UTC and in
// Bucharest, and the last 20 log lines with anything that looks like a secret blanked out.
// At most one email per unit per 30 minutes. If mail itself fails, the reason goes to the
// journal and the alert exits quietly (an alert must never break anything else).
import { readFile, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { LAYOUT, atomicWrite, ensureDirectory, logLine, runBounded, sha256 } from './common.mjs';

export const ALERT_WINDOW_MS = 30 * 60 * 1000;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9:_.@\\-]{0,200}\.(service|socket|timer|target|mount|path)$/;
const ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;

class AlertRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new AlertRefusal(code); };

/** The four recipient fingerprints already approved for preview mail (no address is stored in Git). */
export async function loadApprovedRecipientDigests() {
  const raw = await readFile(new URL('../../preview-mail/v4-20261005/recipient-bindings.json', import.meta.url));
  const bindings = strictJson(raw);
  const digests = Object.values(bindings?.recipientSha256 ?? {});
  if (bindings?.schema !== 'preview-mail-v4-purpose-binding' || digests.length < 1 || digests.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) refuse('RECIPIENT_REFUSED');
  return new Set(digests);
}

/** Exactly one address, one line, and one the preview is already allowed to mail. */
export function parseRecipient(raw, approvedDigests) {
  let text;
  try { text = new TextDecoder('utf8', { fatal: true }).decode(raw); } catch { refuse('RECIPIENT_REFUSED'); }
  const address = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (address.length > 254 || !ADDRESS.test(address) || !approvedDigests.has(sha256(address))) refuse('RECIPIENT_REFUSED');
  return address;
}

const RULES = [
  // Credentials inside URLs: scheme://user:password@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
  // Whole header-style values (they may contain spaces).
  [/\b(authorization|proxy-authorization|cookie|set-cookie)\b(\s*[=:]\s*).*$/gi, '$1$2[REDACTED]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, '$1 [REDACTED]'],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential)\b(\s*[=:]\s*)("?)[^\s"',;]+/gi, '$1$2$3[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\b(?!127\.)(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]'],
  [/\b[a-fA-F0-9]{32,}\b/g, '[HEX]'],
  // Random-looking tokens: long, and mixing upper case, lower case and digits (names and paths do not).
  [/(?<![A-Za-z0-9+_=-])[A-Za-z0-9+_-]{32,}={0,2}(?![A-Za-z0-9+_=-])/g, match => (/[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9]/.test(match) ? '[TOKEN]' : match)]
];
/** Blank anything secret-looking, drop control bytes, keep each line short. */
export function redactLine(line) {
  let text = String(line).replace(/[\u0000-\u001f\u007f]/g, '');
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.slice(0, 300);
}

function bucharest(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
    .formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName ?? ''}`.trim();
}

export function composeAlert({ unit, at, lines, from, to }) {
  if (!UNIT.test(unit) || !ADDRESS.test(to) || !ADDRESS.test(from)) refuse('MESSAGE_REFUSED');
  const head = [`From: ${from}`, `To: ${to}`, `Subject: Preview: ${unit} failed to restart`, `Date: ${at.toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', 'Auto-Submitted: auto-generated'];
  const body = [
    `The private preview service ${unit} stopped, and systemd has given up restarting it.`, '',
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

/** sendmail -t: recipients come from the To: header, so no address appears in any process list. */
export async function submitMail(message, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.sendmail, '-t', '-i', '-f', layout.mailFrom], { env: { PATH: '/usr/sbin:/usr/bin:/bin' }, stdin: message, timeoutMs: 15000, maxOutputBytes: 4096 });
  if (result.timedOut || result.overflow || result.error || result.code !== 0) throw new Error('MAIL_FAILED');
}

export async function readJournalTail(unit, { layout = LAYOUT, run = runBounded } = {}) {
  const result = await run([layout.journalctl, '-u', unit, '-n', '20', '--no-pager', '-o', 'short-iso', '-q'], { env: {}, timeoutMs: 5000, maxOutputBytes: 65536 });
  if (result.timedOut || result.error || result.code !== 0) return ['(journal not readable)'];
  return result.stdout.toString('utf8').split('\n').filter(Boolean).slice(-20);
}

export async function runAlert({ unit, layout = LAYOUT, deps = {} }) {
  const log = deps.log ?? (event => logLine(process.stdout, event));
  const now = deps.now ?? Date.now;
  const done = event => { log(event); return event; };
  try {
    if (typeof unit !== 'string' || !UNIT.test(unit)) refuse('UNIT_REFUSED');
    const at = now();
    const lastSentAt = await readLastSent(layout, unit);
    if (!shouldSend(lastSentAt, at)) return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SUPPRESSED', unit, lastSentAt: new Date(lastSentAt).toISOString() });
    const approved = deps.allowedDigests ?? await loadApprovedRecipientDigests();
    const to = await withPrivateBytes(layout.alertRecipientPath, { root: dirname(layout.alertRecipientPath), uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0, mode: 0o600, maxBytes: 512 }, raw => parseRecipient(raw, approved))
      .catch(() => refuse('RECIPIENT_REFUSED'));
    const lines = (await (deps.readJournal ?? (name => readJournalTail(name, { layout })))(unit)).map(redactLine);
    const message = composeAlert({ unit, at: new Date(at), lines, from: layout.mailFrom, to });
    try { await (deps.sendmail ?? (bytes => submitMail(bytes, { layout })))(message); } catch { refuse('MAIL_FAILED'); }
    await recordSent(layout, unit, at).catch(() => undefined);
    return done({ event: 'PREVIEW_LIFECYCLE_ALERT_SENT', unit });
  } catch (error) {
    return done({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: typeof unit === 'string' && UNIT.test(unit) ? unit : null, reason: error instanceof AlertRefusal ? error.code : 'UNEXPECTED' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, unit, ...rest] = process.argv.slice(2);
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || flag !== '--unit' || rest.length) logLine(process.stdout, { event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: null, reason: 'ACTOR_REFUSED' });
  else await runAlert({ unit });
  // Quiet by design: the alert unit itself never fails and never triggers another alert.
}
