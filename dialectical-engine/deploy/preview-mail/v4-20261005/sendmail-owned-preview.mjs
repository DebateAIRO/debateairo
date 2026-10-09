#!/usr/local/bin/node
import { createHash } from 'node:crypto';
import { openSync, fstatSync, lstatSync, readSync, realpathSync, closeSync, constants } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ACCOUNT_MAIL_BOUNDARY, ACCOUNT_MAIL_TEMPLATES, serializeAccountMail, normalizeMailDisplay, accountMailRuntime } from './account-mail-template.mjs';

const FROM = 'noreply@dezbatere.ro';
const digest = value => createHash('sha256').update(value).digest('hex');
// The recipient allow-list is installation data, never source: only these alias names are public.
const RECIPIENT_ALIASES = Object.freeze(['recovery-notice-secondary', 'verification-direct-and-recovery-proof', 'verification-forward-primary', 'verification-forward-secondary']);
export function createRecipientPolicy(recipientSha256, verificationForwardTarget) {
  if (!recipientSha256 || typeof recipientSha256 !== 'object' || Object.getPrototypeOf(recipientSha256) !== Object.prototype
    || Object.keys(recipientSha256).sort().join(',') !== RECIPIENT_ALIASES.join(',')
    || RECIPIENT_ALIASES.some(alias => typeof recipientSha256[alias] !== 'string' || !/^[0-9a-f]{64}$/.test(recipientSha256[alias]))) throw fail('INSTALLATION_CONFIG');
  if (typeof verificationForwardTarget !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(verificationForwardTarget)
    || digest(verificationForwardTarget) !== recipientSha256['verification-forward-secondary']) throw fail('INSTALLATION_CONFIG');
  return function policy(template, recipient) {
  const hash = digest(recipient), aliases = recipientSha256;
  const proof = hash === aliases['verification-direct-and-recovery-proof'];
  if (template === 'verification-v1') {
    if (hash === aliases['verification-forward-primary'] || hash === aliases['verification-forward-secondary']) return verificationForwardTarget;
    if (proof) return recipient;
  } else if (['recovery-v1','email-change-confirm-v1','email-change-notice-v1','consumer-recovery-v1'].includes(template)) {
    if (proof) return recipient;
  } else if (ACCOUNT_MAIL_TEMPLATES.includes(template) && (template.startsWith('security-') || template === 'email-change-unavailable-v1')) {
    if (proof || hash === aliases['recovery-notice-secondary']) return recipient;
  }
  throw fail('PURPOSE_RECIPIENT_REFUSED');
}
}
const INSTALLATION_PATH = '/etc/debateai/preview-mail-recipient-installation.json';
// Sole recipient source: { recipientSha256: {four aliases: lowercase SHA-256 hex}, verificationForwardTarget }.
export function recipientPolicyFromInstallation(input) {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).sort().join(',') !== 'recipientSha256,verificationForwardTarget') throw fail('INSTALLATION_CONFIG');
  return createRecipientPolicy(input.recipientSha256, input.verificationForwardTarget);
}
// JSON.parse keeps the last of two duplicate keys. Parse the grammar first and refuse ambiguity at every depth.
// Same rule as preview-auth-dev/v1/custody.mjs strictJson, copied because this folder installs on its own.
function strictInstallationJson(bytes) {
  const refuse = () => { throw fail('INSTALLATION_CONFIG'); };
  const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.startsWith('﻿')) refuse();
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[i] ?? '\0')) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return JSON.parse(text.slice(start, i));
      if (c === '\\') i++;
      else if (c.charCodeAt(0) < 32) refuse();
    }
    refuse();
  };
  const value = depth => {
    if (depth > 4) refuse();
    ws();
    if (text[i] === '"') return string();
    if (text[i] === '{') {
      i++; ws(); const keys = new Set();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws(); if (text[i] !== '"') refuse(); const key = string();
        if (keys.has(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') refuse(); keys.add(key);
        ws(); if (text[i++] !== ':') refuse(); value(depth + 1); ws();
        const end = text[i++]; if (end === '}') return; if (end !== ',') refuse();
      }
    }
    if (text[i] === '[') {
      i++; ws(); if (text[i] === ']') { i++; return; }
      for (;;) { value(depth + 1); ws(); const end = text[i++]; if (end === ']') return; if (end !== ',') refuse(); }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));
    if (!token) refuse(); i += token[0].length;
  };
  value(0); ws(); if (i !== text.length) refuse();
  return JSON.parse(text);
}
const sameFile = (a, b) => ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key]);
// Internal test seam only; the executable always reads the fixed root-owned path.
// Custody as in preview-auth-dev/v1/custody.mjs withPrivateBytes: the parent directory is reached through no
// symlink, is owned by the file's owner and is not group/other-writable; the file is a no-follow regular file
// that does not change while it is read.
export function readInstalledRecipientPolicy(path = INSTALLATION_PATH, ownerUid = 0) {
  let fd, bytes;
  try {
    const parent = dirname(path);
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(parent) !== parent) throw fail('INSTALLATION_CONFIG');
    const folder = lstatSync(parent);
    if (!folder.isDirectory() || folder.uid !== ownerUid || (folder.mode & 0o022) !== 0) throw fail('INSTALLATION_CONFIG');
    const beforePath = lstatSync(path);
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = fstatSync(fd);
    if (!st.isFile() || !sameFile(st, beforePath) || st.uid !== ownerUid || (st.mode & 0o077) !== 0
      || st.nlink !== 1 || st.size < 1 || st.size > 1024) throw fail('INSTALLATION_CONFIG');
    bytes = Buffer.alloc(1025);
    let length = 0;
    for (;;) {
      const read = readSync(fd, bytes, length, bytes.length - length, length);
      if (read === 0) break;
      length += read;
      if (length > 1024) throw fail('INSTALLATION_CONFIG');
    }
    if (length !== st.size || !sameFile(st, fstatSync(fd)) || !sameFile(st, lstatSync(path))) throw fail('INSTALLATION_CONFIG');
    return recipientPolicyFromInstallation(strictInstallationJson(bytes.subarray(0, length)));
  } catch { throw fail('INSTALLATION_CONFIG'); }
  finally { bytes?.fill(0); if (fd !== undefined) closeSync(fd); }
}
export function recipientForPurpose(template, recipient) {
  return readInstalledRecipientPolicy()(template, recipient);
}
const MAX_BYTES = 262144;
const TOTAL_MS = 4500; // Reserve cleanup before Source's immutable 5000ms transport deadline.
const CHILD_MS = 4000;
const GRACE_MS = 100;
const fail = code => new Error('OWNED_PREVIEW_MAIL_' + code);

export function validateInvocation(argv) {
  if (!Array.isArray(argv) || argv.length !== 4 || argv[0] !== '-i' || argv[1] !== '-t'
    || argv[2] !== '-f' || argv[3] !== FROM) throw fail('ARGUMENT_REFUSED');
}

// Accept only a canonical frozen purpose template, never arbitrary multipart HTML.
export function ownedForwardingMessage(message, recipientPolicy = recipientForPurpose) {
  if (!Buffer.isBuffer(message) || message.length < 1 || message.length > MAX_BYTES) throw fail('BOUND_REFUSED');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(message); } catch { throw fail('MIME_REFUSED'); }
  const at = text.indexOf('\r\n\r\n');
  if (at < 0 || text.startsWith('\ufeff') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw fail('MIME_REFUSED');
  const lines = text.slice(0, at).split('\r\n'), headers = new Map();
  if (lines.length < 10 || lines.length > 12 || lines[0] !== `From: dezbatere.ro <${FROM}>`
    || !lines[1]?.startsWith('To: ')) throw fail('HEADER_REFUSED');
  for (const line of lines) {
    const field = /^([A-Za-z][A-Za-z-]*): ([^\r\n\u0000-\u001f\u007f]+)$/.exec(line);
    if (!field || headers.has(field[1])) throw fail('HEADER_REFUSED');
    headers.set(field[1], field[2]);
  }
  const template = headers.get('X-Account-Template');
  if (!ACCOUNT_MAIL_TEMPLATES.includes(template) || headers.get('MIME-Version') !== '1.0'
    || headers.get('Content-Type') !== `multipart/alternative; boundary="${ACCOUNT_MAIL_BOUNDARY}"`
    || headers.get('X-Account-Runtime') !== accountMailRuntime()) throw fail('HEADER_REFUSED');
  const recipient = recipientPolicy(template, headers.get('To'));
  const body = text.slice(at + 4);
  const marker = `--${ACCOUNT_MAIL_BOUNDARY}`;
  const parts = body.split(marker);
  if (parts.length !== 4 || parts[0] !== '' || parts[3] !== '--\r\n') throw fail('MIME_REFUSED');
  const decoded = [];
  for (const [index, kind] of ['plain', 'html'].entries()) {
    const prefix = `\r\nContent-Type: text/${kind}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    if (!parts[index + 1].startsWith(prefix) || !parts[index + 1].endsWith('\r\n')) throw fail('MIME_REFUSED');
    const encoded = parts[index + 1].slice(prefix.length, -2);
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) throw fail('MIME_REFUSED');
    try { decoded.push(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(encoded.replaceAll('\r\n', ''), 'base64'))); }
    catch { throw fail('MIME_REFUSED'); }
  }
  try {
    const display = normalizeMailDisplay({ locale: headers.get('X-Account-Locale'), timeZone: headers.get('X-Account-Time-Zone') === 'UTC' ? null : headers.get('X-Account-Time-Zone') });
    if ((display.timeZone ?? 'UTC') !== headers.get('X-Account-Time-Zone')) throw fail('TEMPLATE_REFUSED');
    const input = { template, recipient: headers.get('To'), display };
    const expires = headers.get('X-Account-Expires');
    if (template === 'email-change-unavailable-v1') { if (expires !== 'none') throw fail('TEMPLATE_REFUSED'); }
    else {
      if (!/^-?(?:0|[1-9][0-9]{0,15})$/.test(expires ?? '')) throw fail('TEMPLATE_REFUSED');
      input.expiresAt = new Date(Number(expires));
    }
    const urlLines = decoded[0].split('\r\n').filter(line => /^https?:/.test(line));
    // Each bearer purpose has its own path/action grammar. Notification purposes have no links.
    const grammars = {
      'verification-v1': /^https:\/\/v3-preview\.dezbatere\.ro\/verify-email#token=[A-Za-z0-9_-]{43}$/,
      'consumer-recovery-v1': /^https:\/\/v3-preview\.dezbatere\.ro\/recover#token=[A-Za-z0-9_-]{43}$/,
      'recovery-v1': /^https:\/\/v3-preview\.dezbatere\.ro\/verify-recovery-email#token=[A-Za-z0-9_-]{43}$/,
      'email-change-confirm-v1': /^https:\/\/v3-preview\.dezbatere\.ro\/settings#email-change=confirm&token=[A-Za-z0-9_-]{43}$/,
      'email-change-notice-v1': /^https:\/\/v3-preview\.dezbatere\.ro\/settings#email-change=cancel&token=[A-Za-z0-9_-]{43}$/
    };
    const grammar = grammars[template];
    if (grammar) {
      if (urlLines.length !== 1 || !grammar.test(urlLines[0])) throw fail('TEMPLATE_REFUSED');
      input.url = new URL(urlLines[0]);
    } else if (urlLines.length !== 0) throw fail('TEMPLATE_REFUSED');
    if (template.startsWith('security-')) {
      const id = /^<([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@debateai\.local>$/i.exec(headers.get('Message-ID') ?? '');
      if (!id) throw fail('TEMPLATE_REFUSED');
      input.messageId = id[1];
    }
    if (template === 'email-change-notice-v1') input.newEmail = headers.get('X-Account-New-Email');
    const expected = Buffer.from(serializeAccountMail(input, FROM));
    if (!expected.equals(message)) throw fail('TEMPLATE_REFUSED');
  } catch { throw fail('TEMPLATE_REFUSED'); }
  // Headers are byte-bounded independently of Unicode body copy. Only To changes.
  const begin = Buffer.byteLength(lines[0] + '\r\n');
  const end = begin + Buffer.byteLength(lines[1]);
  return Buffer.concat([message.subarray(0, begin), Buffer.from(`To: ${recipient}`), message.subarray(end)]);
}

export function cleanSubmissionEnvironment(ambient = {}) {
  const result = { PATH: '/usr/sbin:/usr/bin:/bin' };
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (typeof ambient[name] === 'string' && /^[A-Za-z0-9_.@-]{1,96}$/.test(ambient[name])) result[name] = ambient[name];
  }
  return result;
}

export async function readBounded(stream, { deadline = Date.now() + TOTAL_MS } = {}) {
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const chunks = [];
        let total = 0;
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.length;
          if (total > MAX_BYTES) { stream.destroy?.(); throw fail('BOUND_REFUSED'); }
          chunks.push(bytes);
        }
        if (total === 0) throw fail('BOUND_REFUSED');
        return Buffer.concat(chunks, total);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { stream.destroy?.(); reject(fail('INPUT_TIMEOUT')); }, Math.max(1, deadline - Date.now()));
      })
    ]);
  } finally { clearTimeout(timer); }
}

// Stub seams are internal exports only; the executable has no configurable destination, MTA, timeouts or environment file.
export async function submitVerification({ argv, message, ambient = {}, signal,
  deadline = Date.now() + TOTAL_MS, childTimeoutMs = CHILD_MS, killGraceMs = GRACE_MS,
  installationPath = INSTALLATION_PATH, installationOwnerUid = 0,
  recipientPolicy = (template, recipient) => readInstalledRecipientPolicy(installationPath, installationOwnerUid)(template, recipient),
  spawnImpl = spawn, killGroup = (pid, name) => process.kill(-pid, name) }) {
  validateInvocation(argv);
  const forwarded = ownedForwardingMessage(message, recipientPolicy);
  let child, timer, killTimer, forceTimer, reason;
  try {
    if (signal?.aborted) throw fail('CANCELLED');
    const remaining = deadline - Date.now();
    if (remaining <= 2 * killGraceMs) throw fail('TIMEOUT');
    await new Promise((resolve, reject) => {
      let settled = false, groupKillAttempted = false;
      const clean = () => { clearTimeout(timer); clearTimeout(killTimer); clearTimeout(forceTimer); signal?.removeEventListener('abort', cancelled); };
      const finish = (code, termination) => {
        if (settled) return;
        // Parent close can precede postdrop descendant exit; retain group cleanup on every reason path.
        if (reason && !groupKillAttempted) return;
        settled = true; clean();
        if (reason) reject(reason);
        else if (code === 0 && termination === null) resolve();
        else reject(fail('SUBMIT_REFUSED'));
      };
      const kill = name => { if (Number.isInteger(child?.pid)) { try { killGroup(child.pid, name); } catch {} } };
      const stop = error => {
        if (settled || reason) return;
        reason = error; child.stdin?.destroy(); kill('SIGTERM');
        killTimer = setTimeout(() => {
          kill('SIGKILL'); groupKillAttempted = true; finish(null, 'SIGKILL');
        }, killGraceMs);
        // Bound even a lost/stalled close event after killing only this new child process group.
        forceTimer = setTimeout(() => {
          if (!groupKillAttempted) { kill('SIGKILL'); groupKillAttempted = true; }
          finish(null, 'SIGKILL');
        }, 2 * killGraceMs);
      };
      const cancelled = () => stop(fail('CANCELLED'));
      try {
        child = spawnImpl('/usr/sbin/sendmail', ['-i', '-f', FROM, '--', forwarded.toString('utf8').split('\r\n')[1].slice(4)], {
          stdio: ['pipe', 'ignore', 'ignore'], env: cleanSubmissionEnvironment(ambient), shell: false, detached: true
        });
      } catch { finish(null, null); return; }
      child.once('error', () => stop(fail('SUBMIT_REFUSED')));
      child.once('close', finish);
      child.stdin.once('error', () => stop(fail('SUBMIT_REFUSED')));
      signal?.addEventListener('abort', cancelled, { once: true });
      timer = setTimeout(() => stop(fail('TIMEOUT')), Math.min(childTimeoutMs, remaining - 2 * killGraceMs));
      child.stdin.end(forwarded);
    });
  } finally {
    clearTimeout(timer); clearTimeout(killTimer); clearTimeout(forceTimer);
    forwarded.fill(0);
  }
}

async function main() {
  const deadline = Date.now() + TOTAL_MS;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  let message;
  try {
    validateInvocation(process.argv.slice(2));
    message = await readBounded(process.stdin, { deadline });
    await submitVerification({ argv: process.argv.slice(2), message, ambient: process.env, signal: controller.signal, deadline });
  } catch {
    process.stderr.write('OWNED_PREVIEW_MAIL_REFUSED\n');
    process.exitCode = 1;
  } finally {
    message?.fill(0); process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
