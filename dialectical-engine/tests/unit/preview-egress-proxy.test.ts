import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
const egress = await import('../../deploy/' + 'preview-auth-dev/v1/egress-proxy.mjs');
const execute = promisify(execFile);
const OPERATOR = resolve('deploy/preview-auth-dev/v1');

const closers: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); });
const listen = async (server: net.Server, at: number | string = 0) => {
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(typeof at === 'string' ? at : { host: '127.0.0.1', port: at }, () => done()); });
  closers.push(() => new Promise(done => server.close(() => done(undefined))));
  return typeof at === 'string' ? 0 : (server.address() as net.AddressInfo).port;
};
/** A stand-in for the vendor's address: records every byte it receives, answers nothing. */
async function upstream() {
  const received: Buffer[] = [];
  let connections = 0;
  const server = net.createServer(socket => { connections++; socket.on('data', chunk => received.push(Buffer.from(chunk))); socket.on('error', () => undefined); });
  const port = await listen(server);
  return { port, bytes: () => Buffer.concat(received), connections: () => connections, sockets: server };
}
/** One raw client exchange with the proxy: send `text`, collect everything until the proxy closes or `waitMs` passes. */
async function exchange(port: number, text: string, waitMs = 300) {
  return new Promise<string>(done => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let answer = '';
    socket.on('data', chunk => { answer += chunk.toString('latin1'); });
    socket.on('error', () => undefined);
    socket.on('close', () => done(answer));
    socket.write(text);
    setTimeout(() => { socket.destroy(); }, waitMs);
  });
}
const PUBLIC = [{ address: '93.184.216.34', family: 4 }];
async function proxy(options: Record<string, unknown> = {}) {
  const log: unknown[] = [], resolved: string[] = [], connected: unknown[] = [];
  const target = await upstream();
  const server = egress.createEgressProxy({
    resolve: async (host: string) => { resolved.push(host); return PUBLIC; },
    connect: (port: number, address: string) => { connected.push({ port, address }); return net.connect({ host: '127.0.0.1', port: target.port }); },
    log: (line: unknown) => log.push(line), ...options
  });
  const port = await listen(server);
  return { port, log, resolved, connected, target };
}

describe('the preview egress proxy: what it admits', () => {
  it.each([
    ['CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.1', 'secure-sandbox.netopia-payments.com'],
    ['CONNECT secure.sandbox.netopia-payments.com:443 HTTP/1.1', 'secure.sandbox.netopia-payments.com'],
    ['CONNECT dezbatere-test.sandbox-quadernoapp.com:443 HTTP/1.1', 'dezbatere-test.sandbox-quadernoapp.com'],
    ['CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.0', 'secure-sandbox.netopia-payments.com']
  ])('admits %s', (line, host) => expect(egress.admittedTarget(line)).toBe(host));
  it.each([
    'CONNECT secure.netopia-payments.com:443 HTTP/1.1',
    'CONNECT secure.mobilpay.ro:443 HTTP/1.1',
    'CONNECT dezbatere.quadernoapp.com:443 HTTP/1.1',
    'CONNECT a.b.sandbox-quadernoapp.com:443 HTTP/1.1',
    'CONNECT sandbox-quadernoapp.com:443 HTTP/1.1',
    'CONNECT x.sandbox-quadernoapp.com.evil.example:443 HTTP/1.1',
    'CONNECT secure-sandbox.netopia-payments.com:80 HTTP/1.1',
    'CONNECT secure-sandbox.netopia-payments.com:4430 HTTP/1.1',
    'CONNECT SECURE-SANDBOX.NETOPIA-PAYMENTS.COM:443 HTTP/1.1',
    'CONNECT secure-sandbox.netopia-payments.com.:443 HTTP/1.1',
    'CONNECT user@secure-sandbox.netopia-payments.com:443 HTTP/1.1',
    'CONNECT 93.184.216.34:443 HTTP/1.1',
    'GET https://secure-sandbox.netopia-payments.com/ HTTP/1.1',
    'CONNECT secure-sandbox.netopia-payments.com:443 HTTP/2',
    'CONNECT secure-sandbox.netopia-payments.com:443  HTTP/1.1',
    'smartbill.invalid:443'
  ])('refuses %s', line => expect(egress.admittedTarget(line)).toBeNull());
  it.each([
    ['93.184.216.34', 4, true], ['2606:2800:220:1:248:1893:25c8:1946', 6, true],
    ['127.0.0.1', 4, false], ['10.1.2.3', 4, false], ['172.20.0.1', 4, false], ['192.168.1.1', 4, false], ['169.254.169.254', 4, false],
    ['100.64.0.1', 4, false], ['0.0.0.0', 4, false], ['224.0.0.1', 4, false], ['198.18.0.1', 4, false], ['203.0.113.9', 4, false],
    ['::1', 6, false], ['::', 6, false], ['::ffff:127.0.0.1', 6, false], ['fd00::1', 6, false], ['fe80::1', 6, false], ['2002:a00:1::1', 6, false],
    ['64:ff9b::a00:1', 6, false], ['93.184.216.34', 6, false], ['not-an-address', 4, false]
  ])('the address %s (family %d) is public: %s', (address, family, expected) => expect(egress.isPublicAddress(address, family)).toBe(expected));
});

describe('the preview egress proxy: what it does', () => {
  it('opens an admitted CONNECT to the resolved public address on 443, then copies bytes both ways', async () => {
    const p = await proxy();
    const answer = await exchange(p.port, 'CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.1\r\nHost: secure-sandbox.netopia-payments.com:443\r\n\r\nclient-hello-bytes');
    expect(answer).toBe('HTTP/1.1 200 Connection Established\r\n\r\n');
    expect(p.resolved).toEqual(['secure-sandbox.netopia-payments.com']);
    expect(p.connected).toEqual([{ port: 443, address: '93.184.216.34' }]);
    expect(p.target.bytes().toString()).toBe('client-hello-bytes');
    expect(p.log).toEqual([{ event: 'preview.egress', host: 'secure-sandbox.netopia-payments.com', outcome: 'OPENED' }]);
  });
  it.each([
    ['a host outside the list', 'CONNECT api.openai.com:443 HTTP/1.1\r\n\r\n', 'api.openai.com', 'HOST_REFUSED'],
    ['a plain request', 'GET http://secure-sandbox.netopia-payments.com/ HTTP/1.1\r\nHost: x\r\n\r\n', null, 'HOST_REFUSED'],
    ['the dummy SmartBill address', 'CONNECT smartbill.invalid:443 HTTP/1.1\r\n\r\n', 'smartbill.invalid', 'HOST_REFUSED'],
    ['an oversized header', `CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.1\r\nX: ${'a'.repeat(9000)}`, null, 'HEADER_TOO_LARGE']
  ])('answers 403 to %s and connects nowhere', async (_name, text, host, outcome) => {
    const p = await proxy();
    const answer = await exchange(p.port, text);
    expect(answer).toBe('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    expect(p.connected).toEqual([]);
    expect(p.log).toEqual([{ event: 'preview.egress', host, outcome }]);
  });
  it.each([
    ['a name that resolves to an inside address', async () => [{ address: '10.0.0.5', family: 4 }, { address: '127.0.0.1', family: 4 }], 'ADDRESS_REFUSED'],
    ['a name that resolves to nothing usable', async () => [], 'ADDRESS_REFUSED'],
    ['a name that does not resolve', async () => { throw new Error('ENOTFOUND'); }, 'RESOLVE_FAILED']
  ])('answers 403 to %s', async (_name, resolveStub, outcome) => {
    const p = await proxy({ resolve: resolveStub });
    const answer = await exchange(p.port, 'CONNECT dezbatere-test.sandbox-quadernoapp.com:443 HTTP/1.1\r\n\r\n');
    expect(answer.startsWith('HTTP/1.1 403 Forbidden')).toBe(true);
    expect(p.connected).toEqual([]);
    expect(p.log).toEqual([{ event: 'preview.egress', host: 'dezbatere-test.sandbox-quadernoapp.com', outcome }]);
  });
  it('picks the first public address when a name has inside ones too', async () => {
    const p = await proxy({ resolve: async () => [{ address: '192.168.0.9', family: 4 }, { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }] });
    const answer = await exchange(p.port, 'CONNECT secure.sandbox.netopia-payments.com:443 HTTP/1.1\r\n\r\n');
    expect(answer).toBe('HTTP/1.1 200 Connection Established\r\n\r\n');
    expect(p.connected).toEqual([{ port: 443, address: '2606:2800:220:1:248:1893:25c8:1946' }]);
  });
  it('closes a client that never finishes its request line', async () => {
    const p = await proxy({ limits: { ...egress.PREVIEW_EGRESS_LIMITS, headerTimeoutMs: 50 } });
    const answer = await exchange(p.port, 'CONNECT secure-sandbox.netopia', 400);
    expect(answer.startsWith('HTTP/1.1 403 Forbidden')).toBe(true);
    expect(p.log).toEqual([{ event: 'preview.egress', host: null, outcome: 'HEADER_TIMEOUT' }]);
  });
  it('the installed file stands alone: node built-ins only, fixed loopback address, no arguments', () => {
    const text = readFileSync(join(OPERATOR, 'egress-proxy.mjs'), 'utf8');
    expect([...text.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1])).toEqual(['node:net', 'node:dns/promises', 'node:url']);
    expect([egress.PREVIEW_EGRESS_HOST, egress.PREVIEW_EGRESS_PORT]).toEqual(['127.0.0.1', 3180]);
  });
});

describe('debateai-preview-egress.service template', () => {
  const unit: Record<string, string[]> = {};
  let section = '';
  for (const raw of readFileSync(join(OPERATOR, 'debateai-preview-egress.service'), 'utf8').split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { section = line; continue; }
    const at = line.indexOf('='); (unit[section + line.slice(0, at)] ??= []).push(line.slice(at + 1));
  }
  it('runs the installed standalone copy with the preview\'s Node, as a throwaway user', () => {
    expect(unit['[Service]ExecStart']).toEqual(['/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/egress-v1/egress-proxy.mjs']);
    expect(unit['[Service]DynamicUser']).toEqual(['yes']);
    expect(unit['[Service]User']).toBeUndefined();
    expect(unit['[Service]EnvironmentFile']).toBeUndefined();
    expect(unit['[Service]LoadCredential']).toBeUndefined();
  });
  it('keeps every key, environment file and database path out of reach and denies the inside address ranges', () => {
    expect(unit['[Service]InaccessiblePaths']![0]!.split(' ')).toEqual(expect.arrayContaining(['-/etc/debateai', '-/etc/debateai-v3-preview', '-/var/lib/postgresql', '-/run/postgresql', '-/run/debateai-v3-preview']));
    expect(unit['[Service]IPAddressDeny']![0]!.split(' ')).toEqual(['10.0.0.0/8', '100.64.0.0/10', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7', 'fe80::/10', 'multicast']);
    expect(unit['[Service]IPAddressAllow']).toBeUndefined();
    expect(unit['[Service]RestrictAddressFamilies']).toEqual(['AF_UNIX AF_INET AF_INET6']);
    for (const key of ['NoNewPrivileges', 'ProtectKernelTunables', 'RestrictSUIDSGID', 'LockPersonality']) expect(unit[`[Service]${key}`]).toEqual(['true']);
    expect(unit['[Service]CapabilityBoundingSet']).toEqual(['']);
    expect(unit['[Service]ProtectSystem']).toEqual(['strict']);
  });
});

describe('Node 26 fetch through the egress proxy, as the hosted API launcher sets it', () => {
  it('sends an admitted https call through the proxy, keeps loopback and the spending gates\' Unix sockets direct, and refuses any other host', async () => {
    const p = await proxy();
    const direct = await upstream();
    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'egress-')));
    closers.push(() => rmSync(folder, { recursive: true, force: true }));
    const socketPath = join(folder, 'gate.sock');
    const gateRequests: string[] = [];
    const gate = createHttpServer((request, response) => { gateRequests.push(`${request.method} ${request.url}`); response.end('{"ok":true}'); });
    await listen(gate, socketPath);
    // The child installs exactly what launch-api.mjs installs (installHostedEgress), pointed at this test's proxy port.
    const child = join(folder, 'child.mjs');
    writeFileSync(child, `
import http from 'node:http';
import { installHostedEgress } from ${JSON.stringify(join(OPERATOR, 'environment.mjs'))};
const [proxyPort, directPort, socketPath] = process.argv.slice(2);
installHostedEgress('hosted', value => http.setGlobalProxyFromEnv({ ...value, HTTPS_PROXY: 'http://127.0.0.1:' + proxyPort }));
const outcome = async promise => { try { await promise; return 'answered'; } catch { return 'failed'; } };
const out = {};
out.netopia = await outcome(fetch('https://secure-sandbox.netopia-payments.com/api/payment/status', { signal: AbortSignal.timeout(1500) }));
out.other = await outcome(fetch('https://api.example.com/', { signal: AbortSignal.timeout(1500) }));
out.loopback = await outcome(fetch('https://127.0.0.1:' + directPort + '/', { signal: AbortSignal.timeout(1500) }));
out.gate = await new Promise(done => { const request = http.request({ socketPath, path: '/complete', method: 'POST' }, response => { response.resume(); response.on('end', () => done(response.statusCode)); }); request.on('error', () => done('failed')); request.end('{}'); });
out.environment = Object.keys(process.env).filter(key => /proxy/i.test(key));
process.stdout.write(JSON.stringify(out));
`);
    const { stdout } = await execute(process.execPath, [child, String(p.port), String(direct.port), socketPath], { env: { PATH: process.env.PATH ?? '' }, timeout: 20_000 });
    expect(JSON.parse(stdout)).toEqual({ netopia: 'failed', other: 'failed', loopback: 'failed', gate: 200, environment: [] });
    // NETOPIA's call went through the proxy to the (stand-in) vendor address: its TLS hello names the host.
    expect(p.log).toEqual([
      { event: 'preview.egress', host: 'secure-sandbox.netopia-payments.com', outcome: 'OPENED' },
      { event: 'preview.egress', host: 'api.example.com', outcome: 'HOST_REFUSED' }
    ]);
    expect(p.target.bytes()[0]).toBe(0x16);
    expect(p.target.bytes().includes(Buffer.from('secure-sandbox.netopia-payments.com'))).toBe(true);
    // Loopback went straight to its port, and the gate's Unix socket answered without the proxy.
    expect(direct.connections()).toBe(1);
    expect(gateRequests).toEqual(['POST /complete']);
  }, 30_000);
});
