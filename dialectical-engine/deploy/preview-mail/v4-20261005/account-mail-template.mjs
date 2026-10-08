// Task9 revision: canonical account-mail contract with consumer recovery purposes. Dependency-free: an immutable copy
// is reviewed beside the preview wrapper; it never imports mutable app/config code.
export const ACCOUNT_MAIL_BOUNDARY = 'dialectical-account-v1';
export const ACCOUNT_MAIL_LOCALES = Object.freeze(['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB']);
export const ACCOUNT_MAIL_TEMPLATES = Object.freeze(['verification-v1','recovery-v1','security-scheduled-v1','security-cancelled-v1','security-completion-v1','email-change-confirm-v1','email-change-notice-v1','email-change-unavailable-v1','consumer-recovery-v1','security-method-changed-v1','security-codes-regenerated-v1','security-recovery-proved-v1','security-recovery-completed-v1']);
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
  const copy = new Intl.DateTimeFormat(locale, { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(expiryDate(date));
  return `${copy} (${timeZone})`;
}
function credentialUrl(value, path, fragment) {
  if (!(value instanceof URL) || value.protocol !== 'https:' || value.username || value.password || value.search || value.pathname !== path || !fragment.test(value.hash)) invalid();
  return value.href;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
export function renderAccountEmail(input) {
  if (!input || !ACCOUNT_MAIL_TEMPLATES.includes(input.template) || typeof input.recipient !== 'string' || input.recipient.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(input.recipient) || /[,;\u0000-\u001f\u007f]/.test(input.recipient)) invalid();
  const display = normalizeMailDisplay(input.display);
  const expiry = input.template === 'email-change-unavailable-v1' ? null : localExpiry(input.expiresAt, display);
  let subject, paragraphs, link = null, action = null;
  switch (input.template) {
    case 'verification-v1':
      subject = 'Verify your email for Dialectical Engine';
      link = credentialUrl(input.url, '/verify-email', /^#token=[A-Za-z0-9_-]{43}$/);
      action = 'Verify your email';
      paragraphs = [`Verify ${input.recipient} for your Dialectical Engine account.`, `This verification link is valid for 24 hours and expires at ${expiry}.`, 'If you cannot find this message, check your spam folder.', 'If you did not create this account, ignore this message.'];
      break;
    case 'consumer-recovery-v1':
      subject = 'Recover your Dialectical Engine account';
      link = credentialUrl(input.url, '/recover', /^#token=[A-Za-z0-9_-]{43}$/);
      action = 'Continue account recovery';
      paragraphs = [`This recovery link is valid for 15 minutes and expires at ${expiry}.`, 'You also need an unused saved recovery code. This email alone cannot recover your account.', 'After proving both, verify a replacement passkey or authenticator within five minutes.', 'If you did not request this, ignore this message.'];
      break;
    case 'security-method-changed-v1':
      subject = 'Your Dialectical Engine sign-in methods changed';
      paragraphs = [`A sign-in method change was recorded at ${expiry}.`, 'If you did not make this change, contact the site operator immediately.'];
      break;
    case 'security-codes-regenerated-v1':
      subject = 'Your Dialectical Engine recovery codes changed';
      paragraphs = [`New saved recovery codes were created at ${expiry}.`, 'Previous unused codes no longer work. No recovery code is included in this email.', 'If you did not make this change, contact the site operator immediately.'];
      break;
    case 'security-recovery-proved-v1':
      subject = 'Your Dialectical Engine account recovery started';
      paragraphs = [`Both recovery proofs were accepted at ${expiry}.`, 'Existing sessions have ended. Normal sign-in remains blocked until a replacement security method is verified.', 'If you did not begin recovery, contact the site operator immediately.'];
      break;
    case 'security-recovery-completed-v1':
      subject = 'Your Dialectical Engine account recovery completed';
      paragraphs = [`A replacement security method was verified at ${expiry}.`, 'Previous security methods and unused saved recovery codes no longer work.', 'If you did not complete recovery, contact the site operator immediately.'];
      break;
    case 'recovery-v1':
      subject = 'Confirm your Dialectical Engine recovery email';
      link = credentialUrl(input.url, '/verify-recovery-email', /^#token=[A-Za-z0-9_-]{43}$/);
      action = 'Confirm recovery email';
      paragraphs = [`Confirm ${input.recipient} as your optional recovery address.`, `This link expires at ${expiry}.`, 'Your existing verified recovery address stays active until confirmation.', 'If you did not ask for this, ignore this message.'];
      break;
    case 'security-scheduled-v1':
      subject = 'Dialectical Engine account deletion scheduled';
      paragraphs = [`Deletion is scheduled for ${expiry}.`, 'If you did not request this action, contact the site operator immediately.'];
      break;
    case 'security-cancelled-v1':
      subject = 'Dialectical Engine account deletion cancelled';
      paragraphs = ['The scheduled account deletion was cancelled.', 'If you did not request this action, contact the site operator immediately.'];
      break;
    case 'security-completion-v1':
      subject = 'Dialectical Engine account deletion is completing';
      paragraphs = ['Your account deletion has entered its irreversible completion step.', 'If you did not request this action, contact the site operator immediately.'];
      break;
    case 'email-change-confirm-v1':
      subject = 'Confirm your new Dialectical Engine email';
      link = credentialUrl(input.url, '/settings', /^#email-change=confirm&token=[A-Za-z0-9_-]{43}$/);
      action = 'Confirm new email';
      paragraphs = [`Confirm ${input.recipient} for your Dialectical Engine account.`, `This link expires at ${expiry}.`, 'If you did not ask for this, ignore this message. Nothing changes until the link is opened.'];
      break;
    case 'email-change-notice-v1':
      if (!singleRecipient(input.newEmail)) invalid();
      subject = 'Your Dialectical Engine email is being changed';
      link = credentialUrl(input.url, '/settings', /^#email-change=cancel&token=[A-Za-z0-9_-]{43}$/);
      action = 'Cancel email change';
      paragraphs = [`Someone signed in to your Dialectical Engine account asked to change its email to ${input.newEmail}.`, 'Your current address keeps working until the new one is confirmed.', "If this wasn't you, cancel the change by opening this link:", 'Then sign in and review your active sessions in Settings.'];
      break;
    case 'email-change-unavailable-v1':
      subject = 'Dialectical Engine email change';
      paragraphs = ['Someone asked to use this address for a Dialectical Engine account, but it already belongs to one.', 'Nothing was changed. If this was you, sign in with this address instead.'];
      break;
    default: invalid();
  }
  const text = [ 'Dialectical Engine', ...paragraphs, ...(link ? [action + ':', link] : []) ].join('\r\n\r\n') + '\r\n';
  const button = link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;background:#b89b5e;color:#242424;text-decoration:none;font-weight:bold;border-radius:4px">${escapeHtml(action)}</a></p><p>If the button does not work, open this complete link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f7f3e8;color:#242424;font-family:Arial,sans-serif"><main style="max-width:600px;margin:32px auto;padding:32px;border-top:4px solid #b89b5e"><p style="font-size:22px;font-weight:bold">Dialectical Engine</p><h1 style="font-size:24px">${escapeHtml(subject)}</h1>${paragraphs.map(copy => `<p style="line-height:1.6">${expiry === null ? escapeHtml(copy) : escapeHtml(copy).replace(escapeHtml(expiry), `<span lang="${escapeHtml(display.locale)}">${escapeHtml(expiry)}</span>`)}</p>`).join('')}${button}<p style="font-size:12px">dezbatere.ro</p></main></body></html>\r\n`;
  return Object.freeze({ subject, text, html });
}
function base64Lines(value) {
  return Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
}
export function serializeAccountMail(input, from) {
  if (!input || !singleRecipient(input.recipient)) invalid();
  if (typeof from !== 'string' || !/^noreply@[A-Za-z0-9.-]+$/.test(from)) invalid();
  const mail = renderAccountEmail(input), display = normalizeMailDisplay(input.display);
  const security = input.template.startsWith('security-');
  if (security && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.messageId ?? '')) invalid();
  if (!security && input.messageId !== undefined) invalid();
  const headers = [`From: dezbatere.ro <${from}>`, `To: ${input.recipient}`, ...(security ? [`Message-ID: <${input.messageId}@debateai.local>`] : []), `Subject: ${mail.subject}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${ACCOUNT_MAIL_BOUNDARY}"`, `X-Account-Template: ${input.template}`, `X-Account-Expires: ${input.template === 'email-change-unavailable-v1' ? 'none' : expiryDate(input.expiresAt).getTime()}`, `X-Account-Locale: ${display.locale}`, `X-Account-Time-Zone: ${display.timeZone ?? 'UTC'}`, `X-Account-Runtime: ${accountMailRuntime()}`, ...(input.template === 'email-change-notice-v1' ? [`X-Account-New-Email: ${input.newEmail}`] : [])];
  const part = (kind, copy) => [`--${ACCOUNT_MAIL_BOUNDARY}`, `Content-Type: text/${kind}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(copy)].join('\r\n');
  return [...headers, '', part('plain', mail.text), part('html', mail.html), `--${ACCOUNT_MAIL_BOUNDARY}--`, ''].join('\r\n');
}
