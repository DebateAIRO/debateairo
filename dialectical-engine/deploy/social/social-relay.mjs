import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createPrivateKey, sign } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const invalid = () => { throw new Error('SOCIAL_OPERATION_INVALID'); };
const unavailable = () => new Error('SOCIAL_TRANSPORT_UNAVAILABLE');
const scalar = (x, max = 4096) => typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
function exact(input, fields) { return input !== null && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join(',') === fields.sort().join(','); }
function requestJson(url, method, headers, body, signal, requestImplementation) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, value) => { if (done) return; done = true; signal.removeEventListener('abort', aborted); error ? reject(unavailable()) : resolve(value); };
    const req = requestImplementation(url, { method, headers: { accept: 'application/json', ...headers }, agent: false, maxHeaderSize: 4096 }, response => {
      if (response.statusCode !== 200) { response.destroy(); finish(true); return; }
      const chunks = []; let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 65536) { response.destroy(); req.destroy(); finish(true); } else chunks.push(chunk); });
      response.on('error', () => finish(true)); response.on('aborted', () => finish(true));
      response.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (value === null || typeof value !== 'object' || Array.isArray(value) || value.error !== undefined) { finish(true); return; } finish(false, value); } catch { finish(true); } });
    });
    const aborted = () => { req.destroy(); finish(true); };
    req.on('error', () => finish(true)); if (signal.aborted) { aborted(); return; } signal.addEventListener('abort', aborted, { once: true }); req.end(body);
  });
}
function appleClientSecret(config) {
  if (config.clientSecret !== undefined) return config.clientSecret;
  const key = createPrivateKey(config.privateKey);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw unavailable();
  const now = Math.floor(Date.now() / 1000);
  const input = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ iss: config.teamId, sub: config.clientId, aud: 'https://appleid.apple.com', iat: now, exp: now + 300 })).toString('base64url');
  return input + '.' + sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
/** Destinations and methods come only from these finite source-defined operations. */
export async function fixedSocialOperation(configuration, input, signal, requestImplementation = httpsRequest) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const operation = input.operation;
  if (operation === 'google.keys' || operation === 'apple.keys') {
    if (!exact(input, ['operation'])) return invalid();
    const provider = operation.split('.')[0]; if (!configuration[provider]) throw unavailable();
    return requestJson(provider === 'google' ? 'https://www.googleapis.com/oauth2/v3/certs' : 'https://appleid.apple.com/auth/keys', 'GET', {}, '', signal, requestImplementation);
  }
  if (!['google.exchange', 'apple.exchange', 'facebook.exchange', 'x.exchange'].includes(operation)) return invalid();
  const provider = operation.split('.')[0], pkce = provider === 'google' || provider === 'x';
  if (!exact(input, pkce ? ['operation', 'code', 'verifier'] : ['operation', 'code']) || !scalar(input.code)
    || (pkce && (typeof input.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.verifier)))) return invalid();
  const config = configuration[provider]; if (!config) throw unavailable();
  const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.callback, code: input.code });
  if (pkce) form.set('code_verifier', input.verifier);
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  let response;
  if (provider === 'facebook') {
    form.delete('grant_type'); form.set('client_secret', config.clientSecret);
    response = await requestJson('https://graph.facebook.com/v26.0/oauth/access_token?' + form, 'GET', {}, '', signal, requestImplementation);
  } else {
    if (provider === 'x') headers.authorization = 'Basic ' + Buffer.from(encodeURIComponent(config.clientId) + ':' + encodeURIComponent(config.clientSecret)).toString('base64');
    else form.set('client_secret', provider === 'apple' ? appleClientSecret(config) : config.clientSecret);
    response = await requestJson(provider === 'google' ? 'https://oauth2.googleapis.com/token' : provider === 'apple' ? 'https://appleid.apple.com/auth/token' : 'https://api.x.com/2/oauth2/token', 'POST', headers, form.toString(), signal, requestImplementation);
  }
  if (provider === 'google' || provider === 'apple') { if (!scalar(response.id_token, 16384)) throw unavailable(); return { id_token: response.id_token }; }
  if (!scalar(response.access_token) || typeof response.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') throw unavailable();
  const userHeaders = { authorization: 'Bearer ' + response.access_token };
  if (provider === 'x') {
    if (typeof response.scope !== 'string' || !['tweet.read', 'users.read', 'users.email'].every(scope => response.scope.split(' ').includes(scope))) throw unavailable();
    const user = await requestJson('https://api.x.com/2/users/me?user.fields=id%2Cname%2Cconfirmed_email', 'GET', userHeaders, '', signal, requestImplementation);
    return { user, scope: response.scope, token_type: 'bearer' };
  }
  const debug = await requestJson('https://graph.facebook.com/v26.0/debug_token?' + new URLSearchParams({ input_token: response.access_token, access_token: config.clientId + '|' + config.clientSecret }), 'GET', {}, '', signal, requestImplementation);
  const data = debug.data, now = Date.now() / 1000;
  if (!data || data.app_id !== config.clientId || data.is_valid !== true || !scalar(data.user_id, 255) || !(data.expires_at > now) || !(data.data_access_expires_at > now)
    || !Array.isArray(data.scopes) || !['public_profile', 'email'].every(scope => data.scopes.includes(scope))) throw unavailable();
  const user = await requestJson('https://graph.facebook.com/v26.0/me?fields=id%2Cname%2Cemail', 'GET', userHeaders, '', signal, requestImplementation);
  if (user.id !== data.user_id) throw unavailable();
  return { debug: data, user };
}
export function createSocialRelay(configuration, exchange = fixedSocialOperation) {
  let active = 0;
  return createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, async (request, response) => {
    const send = (status, value) => { if (!response.writableEnded && !response.destroyed) { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); } };
    if (request.method !== 'POST' || request.url !== '/social' || request.headers['content-type'] !== 'application/json') { request.resume(); send(400, { error: 'SOCIAL_OPERATION_INVALID' }); return; }
    if (active >= 32) { request.resume(); send(503, { error: 'SOCIAL_TRANSPORT_UNAVAILABLE' }); return; }
    active++; const controller = new AbortController(); const deadline = setTimeout(() => { controller.abort(); send(503, { error: 'SOCIAL_TRANSPORT_UNAVAILABLE' }); request.destroy(); }, 5000);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 8192) { send(413, { error: 'SOCIAL_OPERATION_INVALID' }); return; } chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (exact(input, ['operation']) && input.operation === 'capabilities') {
        // Meta remains source-disabled pending its web code-injection contract certification.
        send(200, { providers: Object.entries(configuration).filter(([provider, value]) => provider !== 'facebook' && value.access === 'existing-approved').map(([provider, value]) => ({ provider, clientId: value.clientId, appScope: value.appScope, callback: value.callback })) }); return;
      }
      const result = await exchange(configuration, input, controller.signal);
      if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw unavailable(); send(200, result);
    } catch { send(503, { error: 'SOCIAL_TRANSPORT_UNAVAILABLE' }); }
    finally { clearTimeout(deadline); active--; }
  });
}
const allowedEnvironment = new Set(['NODE_ENV', 'SOCIAL_SOCKET_PATH', 'CREDENTIALS_DIRECTORY', 'RUNTIME_DIRECTORY', 'PATH', 'LANG', 'LC_ALL', 'TZ', 'USER', 'LOGNAME', 'HOME', 'SHELL', 'INVOCATION_ID', 'JOURNAL_STREAM', 'SYSTEMD_EXEC_PID', 'MEMORY_PRESSURE_WATCH', 'MEMORY_PRESSURE_WRITE']);
export function socialRelayEnvironment(source) {
  if (Object.keys(source).some(k => !allowedEnvironment.has(k)) || source.NODE_ENV !== 'production'
    || !/^\/run\/debateai-social\/[A-Za-z0-9_-]+\.sock$/.test(source.SOCIAL_SOCKET_PATH ?? '')
    || typeof source.CREDENTIALS_DIRECTORY !== 'string' || !source.CREDENTIALS_DIRECTORY.startsWith('/') || source.CREDENTIALS_DIRECTORY.split('/').some(p => p === '..' || p === '.') || source.CREDENTIALS_DIRECTORY.includes('\0')) throw new TypeError('SOCIAL_CUSTODY_INVALID');
  return { socketPath: source.SOCIAL_SOCKET_PATH, credentialsPath: join(source.CREDENTIALS_DIRECTORY, 'social-providers') };
}
export async function loadSocialCredentials(path) {
  const parent = await lstat(join(path, '..'));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 || parent.uid !== process.getuid?.()) throw new TypeError('SOCIAL_CUSTODY_INVALID');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size < 2 || stat.size > 32768) throw new TypeError('SOCIAL_CUSTODY_INVALID');
    const input = JSON.parse(await file.readFile('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 4) throw new TypeError('SOCIAL_CUSTODY_INVALID');
    for (const [provider, config] of Object.entries(input)) {
      if (!['google', 'apple', 'facebook', 'x'].includes(provider) || !scalar(config.clientId, 256) || !scalar(config.appScope, 256) || config.access !== 'existing-approved') throw new TypeError('SOCIAL_CUSTODY_INVALID');
      const callback = new URL(config.callback); if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== `/v1/auth/social/${provider}/callback` || callback.hostname === 'localhost' || /^\d+(\.\d+){3}$/.test(callback.hostname)) throw new TypeError('SOCIAL_CUSTODY_INVALID');
      if (provider === 'apple') { if (!exact(config, ['clientId', 'appScope', 'callback', 'access', 'teamId', 'keyId', 'privateKey']) || config.appScope !== config.teamId + '.' + config.clientId || !/^[A-Z0-9]{10}$/.test(config.teamId) || !/^[A-Z0-9]{10}$/.test(config.keyId) || typeof config.privateKey !== 'string' || config.privateKey.length>8192 || config.privateKey.length<100) throw new TypeError('SOCIAL_CUSTODY_INVALID'); appleClientSecret(config); }
      else if (!exact(config, ['clientId', 'appScope', 'callback', 'access', 'clientSecret']) || !scalar(config.clientSecret, 2048)) throw new TypeError('SOCIAL_CUSTODY_INVALID');
    }
    return input;
  } finally { await file.close(); }
}
async function main() {
  const config = socialRelayEnvironment(process.env); for (const key of Object.keys(process.env)) delete process.env[key];
  const credentials = await loadSocialCredentials(config.credentialsPath), server = createSocialRelay(credentials);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.socketPath, resolve); }); await chmod(config.socketPath, 0o660);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('SOCIAL_RELAY_STARTUP_FAILED'); process.exitCode = 1; });
