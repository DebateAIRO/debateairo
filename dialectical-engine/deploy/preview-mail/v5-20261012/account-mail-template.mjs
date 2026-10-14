// Task9 revision: canonical account-mail contract with consumer recovery purposes. Dependency-free: an immutable copy
// is reviewed beside the preview wrapper; it never imports mutable app/config code.
// S01 C12 (R-07, R-30..R-33, D-62): the copy is the caller's, `input.copy(key)` (copyOf in @debateai/mail-templates).
// This file prints no sentence of its own; the brand line and the footer domain are the only literals left.
export const ACCOUNT_MAIL_BOUNDARY = 'dialectical-account-v1';
export const ACCOUNT_MAIL_LOCALES = Object.freeze(['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB']);
export const ACCOUNT_MAIL_TEMPLATES = Object.freeze(['verification-v1','recovery-v1','security-scheduled-v1','security-cancelled-v1','security-completion-v1','email-change-confirm-v1','email-change-notice-v1','email-change-unavailable-v1','consumer-recovery-v1','security-method-changed-v1','security-codes-regenerated-v1','security-recovery-proved-v1','security-recovery-completed-v1','security-recovery-code-used-v1']);
// The paragraph slots of each template, in print order; the copy key is auth.acc.<template>.<slot> (names of record:
// commands/auth-keys.expected). Every template also reads .subject, and the five with a link read .action.
const ACCOUNT_COPY_PARAGRAPHS = Object.freeze({
  'verification-v1': ['p1', 'p2', 'p3', 'p4'],
  'consumer-recovery-v1': ['p1', 'p2', 'p3', 'p4'],
  'security-method-changed-v1': ['p1', 'p2'],
  'security-codes-regenerated-v1': ['p1', 'p2', 'p3'],
  'security-recovery-proved-v1': ['p1', 'p2', 'p3'],
  'security-recovery-code-used-v1': ['p1', 'p2', 'p3'],
  'security-recovery-completed-v1': ['p1', 'p2', 'p3'],
  'recovery-v1': ['p1', 'p2', 'p3', 'p4'],
  'security-scheduled-v1': ['p1', 'p2'],
  'security-cancelled-v1': ['p1', 'p2'],
  'security-completion-v1': ['p1', 'p2'],
  'email-change-confirm-v1': ['p1', 'p2', 'p3'],
  'email-change-notice-v1': ['p1', 'p2', 'p3', 'p4'],
  'email-change-unavailable-v1': ['p1', 'p2']
});
const invalid = () => { throw new TypeError('MAIL_INPUT_INVALID'); };
export function singleRecipient(value) {
  return typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value) && !/[,;\u0000-\u001f\u007f]/.test(value);
}
export function normalizeMailDisplay(display = { locale: 'en', timeZone: null }) {
  if (!display || !ACCOUNT_MAIL_LOCALES.includes(display.locale)) invalid();
  let timeZone = null;
  if (typeof display.timeZone === 'string' && display.timeZone.length <= 128 && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(display.timeZone)) {
    try { timeZone = new Intl.DateTimeFormat('en', { timeZone: display.timeZone }).resolvedOptions().timeZone; } catch { /* Explicit UTC fallback. */ }
  }
  return Object.freeze({ locale: display.locale, timeZone });
}
export function accountMailRuntime() {
  return ['node','icu','tz','cldr','unicode'].map(key => `${key}=${process.versions[key] ?? 'unavailable'}`).join(';');
}
function expiryDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value;
}
function localExpiry(date, display) {
  const timeZone = display.timeZone ?? 'UTC';
  const locale = display.locale === 'en' ? 'en-GB' : display.locale;
  const text = new Intl.DateTimeFormat(locale, { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(expiryDate(date));
  return `${text} (${timeZone})`;
}
// The catalogue code of a display locale (catalogLocale, R-07): the two English entries share the English copy.
function catalogCode(locale) {
  return locale === 'en-US' || locale === 'en-GB' ? 'en' : locale;
}
function credentialUrl(value, path, fragment) {
  if (!(value instanceof URL) || value.protocol !== 'https:' || value.username || value.password || value.search || value.pathname !== path || !fragment.test(value.hash)) invalid();
  return value.href;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
// One copy value, read once: a missing or empty value refuses the mail, so no sentence is ever printed blank.
function readCopy(copyOfKey, key) {
  const text = copyOfKey(key);
  if (typeof text !== 'string' || text === '') throw new TypeError('MAIL_COPY_MISSING');
  return text;
}
// The placeholders of one copy sentence: {recipient}, {expiry}, {newEmail}. A placeholder without a value refuses the mail.
function fillCopy(text, values) {
  return text.replace(/\{(recipient|expiry|newEmail)\}/g, (_, name) => {
    if (values[name] === undefined || values[name] === null) invalid();
    return values[name];
  });
}
// R-33: a plain-text part carries no bidi control character (`dir` changes only the HTML). Intl writes the Hebrew offset
// of an expiry with U+200E marks; the HTML keeps them, and the plain part is stripped where it is joined (T-N6).
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/g;
function plainPartText(value) { return value.replace(BIDI_CONTROLS, ''); }
export function renderAccountEmail(input) {
  if (!input || !ACCOUNT_MAIL_TEMPLATES.includes(input.template) || typeof input.recipient !== 'string' || input.recipient.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(input.recipient) || /[,;\u0000-\u001f\u007f]/.test(input.recipient) || typeof input.copy !== 'function') invalid();
  const display = normalizeMailDisplay(input.display);
  const copyOfKey = input.copy;
  const language = catalogCode(display.locale);
  const direction = language === 'ar' || language === 'he' ? 'rtl' : 'ltr';
  const expiry = input.template === 'email-change-unavailable-v1' ? null : localExpiry(input.expiresAt, display);
  const values = { recipient: input.recipient, expiry, newEmail: input.newEmail };
  let link = null;
  switch (input.template) {
    case 'verification-v1':
      link = credentialUrl(input.url, '/verify-email', /^#token=[A-Za-z0-9_-]{43}$/);
      break;
    case 'consumer-recovery-v1':
      link = credentialUrl(input.url, '/recover', /^#token=[A-Za-z0-9_-]{43}$/);
      break;
    case 'recovery-v1':
      link = credentialUrl(input.url, '/verify-recovery-email', /^#token=[A-Za-z0-9_-]{43}$/);
      break;
    case 'email-change-confirm-v1':
      link = credentialUrl(input.url, '/settings', /^#email-change=confirm&token=[A-Za-z0-9_-]{43}$/);
      break;
    case 'email-change-notice-v1':
      if (!singleRecipient(input.newEmail)) invalid();
      link = credentialUrl(input.url, '/settings', /^#email-change=cancel&token=[A-Za-z0-9_-]{43}$/);
      break;
    default:
      break;
  }
  const subject = readCopy(copyOfKey, `auth.acc.${input.template}.subject`);
  const paragraphs = ACCOUNT_COPY_PARAGRAPHS[input.template].map(slot => fillCopy(readCopy(copyOfKey, `auth.acc.${input.template}.${slot}`), values));
  const action = link === null ? null : readCopy(copyOfKey, `auth.acc.${input.template}.action`);
  const text = plainPartText([ 'Dialectical Engine', ...paragraphs, ...(link ? [action + ':', link] : []) ].join('\r\n\r\n') + '\r\n');
  const button = link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;background:#b89b5e;color:#242424;text-decoration:none;font-weight:bold;border-radius:4px">${escapeHtml(action)}</a></p><p>${escapeHtml(readCopy(copyOfKey, 'auth.acc.button'))}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : '';
  const html = `<!doctype html><html lang="${language}" dir="${direction}"><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f7f3e8;color:#242424;font-family:Arial,sans-serif"><main style="max-width:600px;margin:32px auto;padding:32px;border-top:4px solid #b89b5e"><p style="font-size:22px;font-weight:bold">Dialectical Engine</p><h1 style="font-size:24px">${escapeHtml(subject)}</h1>${paragraphs.map(sentence => `<p style="line-height:1.6">${expiry === null ? escapeHtml(sentence) : escapeHtml(sentence).replace(escapeHtml(expiry), `<span lang="${escapeHtml(display.locale)}">${escapeHtml(expiry)}</span>`)}</p>`).join('')}${button}<p style="font-size:12px">dezbatere.ro</p></main></body></html>\r\n`;
  return Object.freeze({ subject, text, html });
}
function base64Lines(value) {
  return Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
}
// C16 (V-24): the same rule as mail-mime.ts encodeHeaderText (ASCII unchanged; RFC 2047 B-words). Copied, not imported:
// this file is a dependency-free byte copy beside the v5 wrapper.
function encodeHeaderText(value) {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words = [];
  let chunk = '';
  for (const character of value) {
    if (Buffer.byteLength(chunk + character, 'utf8') > 45) { words.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk !== '') words.push(chunk);
  return words.map(word => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join(' ');
}
export function serializeAccountMail(input, from) {
  if (!input || !singleRecipient(input.recipient)) invalid();
  if (typeof from !== 'string' || !/^noreply@[A-Za-z0-9.-]+$/.test(from)) invalid();
  const mail = renderAccountEmail(input), display = normalizeMailDisplay(input.display);
  const security = input.template.startsWith('security-');
  if (security && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.messageId ?? '')) invalid();
  if (!security && input.messageId !== undefined) invalid();
  const headers = [`From: dezbatere.ro <${from}>`, `To: ${input.recipient}`, ...(security ? [`Message-ID: <${input.messageId}@debateai.local>`] : []), `Subject: ${encodeHeaderText(mail.subject)}`, `Content-Language: ${catalogCode(display.locale)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${ACCOUNT_MAIL_BOUNDARY}"`, `X-Account-Template: ${input.template}`, `X-Account-Expires: ${input.template === 'email-change-unavailable-v1' ? 'none' : expiryDate(input.expiresAt).getTime()}`, `X-Account-Locale: ${display.locale}`, `X-Account-Time-Zone: ${display.timeZone ?? 'UTC'}`, `X-Account-Runtime: ${accountMailRuntime()}`, ...(input.template === 'email-change-notice-v1' ? [`X-Account-New-Email: ${input.newEmail}`] : [])];
  const part = (kind, copy) => [`--${ACCOUNT_MAIL_BOUNDARY}`, `Content-Type: text/${kind}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(copy)].join('\r\n');
  return [...headers, '', part('plain', mail.text), part('html', mail.html), `--${ACCOUNT_MAIL_BOUNDARY}--`, ''].join('\r\n');
}
