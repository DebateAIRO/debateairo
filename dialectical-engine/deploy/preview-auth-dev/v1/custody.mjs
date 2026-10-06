import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function refuse(code = 'PREVIEW_CUSTODY_REFUSED') { throw new TypeError(code); }
export function exactKeys(value, keys, code = 'PREVIEW_SCHEMA_REFUSED') {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) refuse(code);
  return value;
}
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..')) refuse('PREVIEW_PATH_REFUSED');
  return value;
}
export async function protectedPath(path, policy) {
  if (!isAbsolute(path) || resolve(path) !== path || !isAbsolute(policy.root) || resolve(policy.root) !== policy.root) refuse();
  const rel = relative(policy.root, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) refuse();
  // Realpath equality admits no alias. The controller canonicalizes its one approved alias before use.
  if (await realpath(policy.root) !== policy.root) refuse();
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const stat = await lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== (policy.parentUid ?? policy.uid)
      || (stat.mode & 0o022) !== 0 || (policy.parentMode !== undefined && (stat.mode & 0o777) !== policy.parentMode)) refuse();
    if (parent === policy.root) break;
    if (parent === dirname(parent)) refuse();
  }
}
function sameFile(a, b) {
  return ['dev','ino','uid','gid','mode','size','nlink','mtimeMs','ctimeMs'].every(key => a[key] === b[key]);
}
/** The callback is the sole material boundary. Raw backing storage is always zeroed. */
export async function withPrivateBytes(path, policy, consume) {
  let handle, bytes;
  try {
    if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 1 || policy.maxBytes > 67_108_864) refuse();
    await protectedPath(path, policy);
    const beforePath = await lstat(path);
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const modes = Array.isArray(policy.mode) ? policy.mode : [policy.mode];
    if (!before.isFile() || beforePath.isSymbolicLink() || !sameFile(before, beforePath) || before.uid !== policy.uid
      || (policy.gid !== undefined && before.gid !== policy.gid) || !modes.includes(before.mode & 0o777)
      || before.nlink !== 1 || before.size < 1 || before.size > policy.maxBytes) refuse();
    bytes = Buffer.alloc(policy.maxBytes + 1);
    let length = 0;
    for (;;) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
      if (length > policy.maxBytes) refuse();
    }
    const after = await handle.stat();
    if (length !== before.size || !sameFile(before, after) || !sameFile(after, await lstat(path))) refuse();
    return await consume(bytes.subarray(0, length));
  } catch { refuse(); }
  finally { bytes?.fill(0); await handle?.close(); }
}

/** JSON.parse alone loses duplicate keys. Parse the grammar first and reject ambiguity at every depth. */
export function strictJson(bytes, maxDepth = 32, options = {}) {
  try {
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>16777216||!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>32
      ||!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(key=>key!=='publicInventory')
      ||(options.publicInventory!==undefined&&typeof options.publicInventory!=='boolean'))refuse();
    const maxNodes=options.publicInventory===true?250000:100000;
    const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.startsWith('\ufeff')) refuse();
    let i = 0, nodes = 0;
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
      if (depth > maxDepth || ++nodes > maxNodes) refuse();
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
  } catch { refuse('PREVIEW_JSON_REFUSED'); }
}
