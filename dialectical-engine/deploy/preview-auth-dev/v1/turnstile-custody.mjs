import { dirname, basename } from 'node:path';
import { exactKeys, strictJson, withPrivateBytes, refuse } from './custody.mjs';
export const PREVIEW_SITE_KEY = '0x4AAAAAAFNg9KPm2tECytqZ';
export const PREVIEW_ORIGIN = 'https://v3-preview.dezbatere.ro';
export const PREVIEW_SOCKET = '/run/debateai-preview-turnstile/siteverify.sock';
export async function withExtractedSecret(raw, consume) {
  let secret;
  try {
    if (!Buffer.isBuffer(raw) || raw.length < 1 || raw.length > 2048) refuse();
    const input = exactKeys(strictJson(raw), ['schema','environment','hostname','siteKey','secretKey']);
    if (Object.values(input).some(value => typeof value !== 'string') || input.schema !== 'dialectical-turnstile-credentials-v1'
      || input.environment !== 'preview' || input.hostname !== 'v3-preview.dezbatere.ro' || input.siteKey !== PREVIEW_SITE_KEY
      || !/^[A-Za-z0-9_-]{20,2048}$/.test(input.secretKey) || /^[123]x0{30,}/.test(input.secretKey)) refuse();
    secret = Buffer.from(input.secretKey); input.secretKey = '';
    return await consume(secret);
  } catch { refuse('PREVIEW_TURNSTILE_REFUSED'); }
  finally { secret?.fill(0); }
}
/** Callback must be a nonlogging pipe writer; no filename/destination override or production fallback. */
export async function extractPreviewCredential(path, ownerUid, consume) {
  const parent = dirname(path);
  if(basename(path)!=='preview.json'||basename(parent)!=='private'||basename(dirname(parent))!=='turnstile-2026-10-04')refuse('PREVIEW_TURNSTILE_REFUSED');
  return withPrivateBytes(path, { root:parent, uid:ownerUid, mode:0o600, parentMode:0o700, maxBytes:2048 },
    raw => withExtractedSecret(raw, consume));
}
