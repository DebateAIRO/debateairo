// Real payments, the network half: the egress proxy's live form (`--quaderno-live-account <label>`), its answer to the
// API launcher's mode question, and the launcher's start check that asks it. The sandbox form and the unit file are
// unchanged (preview-egress-proxy.test.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
const egress = await import('../../deploy/' + 'preview-auth-dev/v1/egress-proxy.mjs');
const startCheck = await import('../../deploy/' + 'preview-auth-dev/v1/start-check-payments.mjs');
const refusals = await import('../../deploy/' + 'preview-auth-dev/v1/startup-refusals.mjs');
const execute = promisify(execFile);
const PROXY_FILE = resolve('deploy/preview-auth-dev/v1/egress-proxy.mjs');

const closers: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); });
const listen = async (server: net.Server) => {
 await new Promise<void>((done, fail) => { server.once('error', fail); server.listen({ host: '127.0.0.1', port: 0 }, () => done()); });
 closers.push(() => new Promise(done => server.close(() => done(undefined))));
 return (server.address() as net.AddressInfo).port;
};
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
const LIVE_ACCOUNT = 'dezbatere', SANDBOX_ACCOUNT = 'dezbatere-test';
/** A proxy whose lookups and outgoing connections are recorded; the outgoing ones reach a silent local stand-in. */
async function proxy(form: Record<string, string>) {
 const log: unknown[] = [], resolved: string[] = [], connected: unknown[] = [];
 const target = net.createServer(socket => { socket.on('error', () => undefined); socket.resume(); });
 const targetPort = await listen(target);
 const server = egress.createEgressProxy({ ...form,
  resolve: async (host: string) => { resolved.push(host); return [{ address: '93.184.216.34', family: 4 }]; },
  connect: (port: number, address: string) => { connected.push({ port, address }); return net.connect({ host: '127.0.0.1', port: targetPort }); },
  log: (line: unknown) => log.push(line) });
 return { port: await listen(server), log, resolved, connected };
}
const FORBIDDEN = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const LIVE_HOST = `${LIVE_ACCOUNT}.quadernoapp.com`;
/** The launcher's question, naming the live Quaderno host the API will call; the bare form names none. */
const MODE = `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nX-Preview-Egress-Quaderno: ${LIVE_HOST}\r\n\r\n`;
const BARE_MODE = 'CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\n\r\n';
const LIVE_ANSWER = 'HTTP/1.1 204 No Content\r\nX-Preview-Egress-Payments: live\r\nConnection: close\r\n\r\n';
const OTHER_ACCOUNT_ANSWER = 'HTTP/1.1 409 Conflict\r\nX-Preview-Egress-Payments: live\r\nConnection: close\r\n\r\n';

describe('the egress proxy\'s live form: what it admits', () => {
 const live = { quadernoLiveAccount: LIVE_ACCOUNT };
 it('takes exactly one live account as its argument, and never both forms', () => {
  expect(egress.parseEgressArguments(['--quaderno-live-account', LIVE_ACCOUNT])).toEqual({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(egress.parseEgressArguments(['--quaderno-account', SANDBOX_ACCOUNT])).toEqual({ quadernoAccount: SANDBOX_ACCOUNT });
  for (const argv of [['--quaderno-live-account'], ['--quaderno-live-account', 'a.b'], ['--quaderno-live-account', 'Upper'], ['--quaderno-live-account', '@QUADERNO_LIVE_ACCOUNT@'],
   ['--quaderno-live-account', ''], ['--quaderno-live-account', `${LIVE_ACCOUNT}.quadernoapp.com`], ['--quaderno-account', SANDBOX_ACCOUNT, '--quaderno-live-account', LIVE_ACCOUNT],
   ['--quaderno-live-account', LIVE_ACCOUNT, '--quaderno-account', SANDBOX_ACCOUNT], ['--live', LIVE_ACCOUNT]])
   expect(() => egress.parseEgressArguments(argv), argv.join(' ')).toThrow('PREVIEW_EGRESS_REFUSED');
  expect(() => egress.createEgressProxy({ quadernoAccount: SANDBOX_ACCOUNT, quadernoLiveAccount: LIVE_ACCOUNT })).toThrow('PREVIEW_EGRESS_REFUSED');
  expect(() => egress.createEgressProxy({ quadernoLiveAccount: 'Upper' })).toThrow('PREVIEW_EGRESS_REFUSED');
  expect(() => egress.isAdmittedHost('secure.netopia-payments.com', { quadernoAccount: SANDBOX_ACCOUNT, quadernoLiveAccount: LIVE_ACCOUNT })).toThrow('PREVIEW_EGRESS_REFUSED');
  expect(() => egress.isAdmittedHost('secure.netopia-payments.com', {})).toThrow('PREVIEW_EGRESS_REFUSED');
 });
 it.each([
  ['CONNECT secure.netopia-payments.com:443 HTTP/1.1', 'secure.netopia-payments.com'],
  ['CONNECT dezbatere.quadernoapp.com:443 HTTP/1.1', 'dezbatere.quadernoapp.com'],
  ['CONNECT ws.smartbill.ro:443 HTTP/1.1', 'ws.smartbill.ro']
 ])('admits %s', (line, host) => expect(egress.admittedTarget(line, live)).toBe(host));
 it.each([
  'CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.1',
  'CONNECT secure.sandbox.netopia-payments.com:443 HTTP/1.1',
  'CONNECT dezbatere.sandbox-quadernoapp.com:443 HTTP/1.1',
  'CONNECT dezbatere-test.sandbox-quadernoapp.com:443 HTTP/1.1',
  'CONNECT other.quadernoapp.com:443 HTTP/1.1',
  'CONNECT a.dezbatere.quadernoapp.com:443 HTTP/1.1',
  'CONNECT secure.mobilpay.ro:443 HTTP/1.1',
  'CONNECT ws.smartbill.ro.evil.example:443 HTTP/1.1',
  'CONNECT smartbill.invalid:443 HTTP/1.1',
  'CONNECT ws.smartbill.ro:80 HTTP/1.1',
  'CONNECT secure.netopia-payments.com:8443 HTTP/1.1',
  'CONNECT payments-mode.egress.invalid:443 HTTP/1.1',
  'CONNECT api.openai.com:443 HTTP/1.1'
 ])('refuses %s', line => expect(egress.admittedTarget(line, live)).toBeNull());
 it('the sandbox form admits the same hosts whether it is given as a label or as an object, and no live host', () => {
  for (const host of ['secure-sandbox.netopia-payments.com', 'secure.sandbox.netopia-payments.com', `${SANDBOX_ACCOUNT}.sandbox-quadernoapp.com`]) {
   expect(egress.isAdmittedHost(host, SANDBOX_ACCOUNT), host).toBe(true);
   expect(egress.isAdmittedHost(host, { quadernoAccount: SANDBOX_ACCOUNT }), host).toBe(true);
   expect(egress.isAdmittedHost(host, live), host).toBe(false);
  }
  for (const host of ['secure.netopia-payments.com', 'ws.smartbill.ro', `${SANDBOX_ACCOUNT}.quadernoapp.com`, egress.PREVIEW_EGRESS_MODE_HOST]) {
   expect(egress.isAdmittedHost(host, SANDBOX_ACCOUNT), host).toBe(false);
   expect(egress.isAdmittedHost(host, { quadernoAccount: SANDBOX_ACCOUNT }), host).toBe(false);
  }
 });
});

describe('the egress proxy\'s live form: what it does', () => {
 it('answers the mode question naming its own Quaderno host with the live reply, journals MODE_ASKED, and looks nothing up and connects nowhere', async () => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await exchange(p.port, MODE)).toBe(LIVE_ANSWER);
  expect(egress.PREVIEW_EGRESS_MODE_ANSWER).toBe(LIVE_ANSWER);
  expect(egress.previewEgressModeQuestion(LIVE_HOST)).toBe(MODE);
  expect(p.log).toEqual([{ event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_ASKED' }]);
  expect([p.resolved, p.connected]).toEqual([[], []]);
 });
 it.each([
  ['another live account\'s host', `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nX-Preview-Egress-Quaderno: other.quadernoapp.com\r\n\r\n`],
  ['its own label as a sandbox host', `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nX-Preview-Egress-Quaderno: ${LIVE_ACCOUNT}.sandbox-quadernoapp.com\r\n\r\n`],
  ['no host (the bare question)', BARE_MODE],
  ['the header in other letters', `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nx-preview-egress-quaderno: ${LIVE_HOST}\r\n\r\n`],
  ['a space too many', `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nX-Preview-Egress-Quaderno:  ${LIVE_HOST}\r\n\r\n`],
  ['a second header line', `CONNECT payments-mode.egress.invalid:443 HTTP/1.1\r\nX-Preview-Egress-Quaderno: ${LIVE_HOST}\r\nHost: x\r\n\r\n`]
 ])('answers the mode question naming %s with the other-account reply, journals MODE_OTHER_ACCOUNT, and looks nothing up', async (_name, question) => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await exchange(p.port, question)).toBe(OTHER_ACCOUNT_ANSWER);
  expect(egress.PREVIEW_EGRESS_MODE_OTHER_ACCOUNT).toBe(OTHER_ACCOUNT_ANSWER);
  expect(p.log).toEqual([{ event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_OTHER_ACCOUNT' }]);
  expect([p.resolved, p.connected]).toEqual([[], []]);
 });
 it('refuses the mode name on any other port, as any other host', async () => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await exchange(p.port, 'CONNECT payments-mode.egress.invalid:80 HTTP/1.1\r\n\r\n')).toBe(FORBIDDEN);
  expect(p.log).toEqual([{ event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'HOST_REFUSED' }]);
  expect([p.resolved, p.connected]).toEqual([[], []]);
 });
 it('opens a tunnel to NETOPIA\'s live host and refuses its sandbox host', async () => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await exchange(p.port, 'CONNECT secure.netopia-payments.com:443 HTTP/1.1\r\n\r\n')).toBe('HTTP/1.1 200 Connection Established\r\n\r\n');
  expect(await exchange(p.port, 'CONNECT secure-sandbox.netopia-payments.com:443 HTTP/1.1\r\n\r\n')).toBe(FORBIDDEN);
  expect(p.resolved).toEqual(['secure.netopia-payments.com']);
  expect(p.connected).toEqual([{ port: 443, address: '93.184.216.34' }]);
  expect(p.log).toEqual([
   { event: 'preview.egress', host: 'secure.netopia-payments.com', outcome: 'OPENED' },
   { event: 'preview.egress', host: 'secure-sandbox.netopia-payments.com', outcome: 'HOST_REFUSED' }
  ]);
 });
 it('the sandbox form answers the mode question 403 HOST_REFUSED, as it answers any other host', async () => {
  const p = await proxy({ quadernoAccount: SANDBOX_ACCOUNT });
  expect(await exchange(p.port, MODE)).toBe(FORBIDDEN);
  expect(await exchange(p.port, BARE_MODE)).toBe(FORBIDDEN);
  expect(p.log).toEqual([
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'HOST_REFUSED' },
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'HOST_REFUSED' }
  ]);
  expect([p.resolved, p.connected]).toEqual([[], []]);
 });
 it('the executable refuses a bad live argument or both forms before it listens', async () => {
  for (const argv of [['--quaderno-live-account', 'Upper'], ['--quaderno-account', SANDBOX_ACCOUNT, '--quaderno-live-account', LIVE_ACCOUNT]]) {
   const outcome = await execute(process.execPath, [PROXY_FILE, ...argv], { env: { PATH: process.env.PATH ?? '' }, timeout: 10_000 })
    .then(() => ({ code: 0, stderr: '' }), (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr }));
   expect(outcome, argv.join(' ')).toEqual({ code: 1, stderr: 'PREVIEW_EGRESS_REFUSED\n' });
  }
 });
});

describe('the API launcher\'s start check asks the egress proxy which form it runs', () => {
 const refusalOf = async (run: () => Promise<unknown>) => {
  try { await run(); } catch (error) { return { message: (error as Error).message, cause: (error as Error).cause, line: refusals.startupRefusedLine('PREVIEW_API_STARTUP_REFUSED', error) }; }
  return 'passed';
 };
 const named = (word: string) => ({ message: 'PREVIEW_ENVIRONMENT_REFUSED', cause: `PREVIEW_LIVE_PAYMENTS_REFUSED:${word}`, line: `PREVIEW_API_STARTUP_REFUSED PREVIEW_LIVE_PAYMENTS_REFUSED:${word}` });
 const EGRESS_REFUSED = named('egress'), OTHER_ACCOUNT_REFUSED = named('egress-account');
 /** What the launcher hands the start check: the API file's settings and narrowEnvironment's result. */
 const atStart = (quadernoBase = `https://${LIVE_HOST}/api`, livePayments: unknown = true) => ({ configured: { QUADERNO_API_BASE_URL: quadernoBase }, selected: { livePayments } });
 const closedPort = async () => { const server = net.createServer(); const port = await listen(server); await new Promise(done => server.close(done)); closers.pop(); return port; };
 /** A stand-in that answers every connection with `reply`, in pieces when asked, and keeps what it was asked. */
 const asked: string[] = [];
 const replying = async (pieces: string[], keepOpen = false) => listen(net.createServer(socket => {
  socket.on('error', () => undefined);
  socket.once('data', async chunk => { asked.push(chunk.toString('latin1')); for (const piece of pieces) { socket.write(piece); await new Promise(r => setTimeout(r, 20)); } if (!keepOpen) socket.end(); });
 }));

 it('passes against the live form for the API file\'s own Quaderno account, asking with that host only', async () => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: p.port, quadernoHost: LIVE_HOST }))).toBe('passed');
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart(), { port: p.port }))).toBe('passed');
  expect(p.log).toEqual([
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_ASKED' },
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_ASKED' }
  ]);
  asked.length = 0;
  const port = await replying([LIVE_ANSWER]);
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart(), { port, timeoutMs: 1000 }))).toBe('passed');
  expect(asked).toEqual([MODE]);
 });
 it('refuses by its own name against a live form for another Quaderno account', async () => {
  const p = await proxy({ quadernoLiveAccount: 'dezbatere-ro' });
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart(), { port: p.port }))).toEqual(OTHER_ACCOUNT_REFUSED);
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: p.port, quadernoHost: LIVE_HOST }))).toEqual(OTHER_ACCOUNT_REFUSED);
  expect(p.log).toEqual([
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_OTHER_ACCOUNT' },
   { event: 'preview.egress', host: 'payments-mode.egress.invalid', outcome: 'MODE_OTHER_ACCOUNT' }
  ]);
  const live = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart('https://dezbatere-ro.quadernoapp.com/api'), { port: live.port }))).toEqual(OTHER_ACCOUNT_REFUSED);
 });
 it('refuses by name against the sandbox form', async () => {
  const p = await proxy({ quadernoAccount: SANDBOX_ACCOUNT });
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart(), { port: p.port }))).toEqual(EGRESS_REFUSED);
  // The sandbox form refuses even a question naming its own label's sandbox host: only the live form ever answers.
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: p.port, quadernoHost: `${SANDBOX_ACCOUNT}.quadernoapp.com` }))).toEqual(EGRESS_REFUSED);
 });
 it('refuses by name when nothing listens', async () => {
  const port = await closedPort();
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port, quadernoHost: LIVE_HOST }))).toEqual(EGRESS_REFUSED);
 });
 it('refuses by name when the proxy says nothing within the time allowed', async () => {
  // It reads (so it sees the client leave) but never answers.
  const port = await listen(net.createServer(socket => { socket.on('error', () => undefined); socket.resume(); }));
  const started = Date.now();
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port, timeoutMs: 200, quadernoHost: LIVE_HOST }))).toEqual(EGRESS_REFUSED);
  expect(Date.now() - started).toBeLessThan(2000);
 });
 it.each([
  ['a 204 without the live header', ['HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n']],
  ['a live header on another status', ['HTTP/1.1 200 OK\r\nX-Preview-Egress-Payments: live\r\n\r\n']],
  ['another mode word', ['HTTP/1.1 204 No Content\r\nX-Preview-Egress-Payments: sandbox\r\n\r\n']],
  ['a 409 without the live header', ['HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n']],
  ['a reply cut short', ['HTTP/1.1 204 No Content\r\nX-Preview-Egress']],
  ['the other-account reply cut short', ['HTTP/1.1 409 Conflict\r\nX-Preview-Egress-Payments: li']]
 ])('refuses by name on %s', async (_name, pieces) => {
  const port = await replying(pieces);
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port, timeoutMs: 1000, quadernoHost: LIVE_HOST }))).toEqual(EGRESS_REFUSED);
 });
 it('reads either reply when it comes in pieces, and does not wait for the connection to close', async () => {
  const live = await replying(['HTTP/1.1 204 No', ' Content\r\nX-Preview-Egress-', 'Payments: live\r\n', 'Connection: close\r\n\r\n'], true);
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: live, timeoutMs: 1000, quadernoHost: LIVE_HOST }))).toBe('passed');
  const other = await replying(['HTTP/1.1 409 Con', 'flict\r\nX-Preview-Egress-Payments: ', 'live\r\n'], true);
  expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: other, timeoutMs: 1000, quadernoHost: LIVE_HOST }))).toEqual(OTHER_ACCOUNT_REFUSED);
 });
 it('asks nothing for a Quaderno address that is not one live account\'s, and names that address', async () => {
  const p = await proxy({ quadernoLiveAccount: LIVE_ACCOUNT });
  for (const base of [undefined, '', `https://${SANDBOX_ACCOUNT}.sandbox-quadernoapp.com/api`, `https://${LIVE_HOST}/api/`, 'https://a.b.quadernoapp.com/api'])
   expect(await refusalOf(() => startCheck.checkPaymentsAtStart({ configured: { QUADERNO_API_BASE_URL: base }, selected: { livePayments: true } }, { port: p.port })), String(base))
    .toEqual(named('quaderno-base'));
  for (const quadernoHost of [undefined, '', LIVE_ACCOUNT, `${LIVE_HOST}\r\nHost: x`, `${SANDBOX_ACCOUNT}.sandbox-quadernoapp.com`, `Upper.quadernoapp.com`])
   expect(await refusalOf(() => startCheck.assertEgressIsLive({ port: p.port, quadernoHost })), String(quadernoHost)).toEqual(named('quaderno-base'));
  expect(p.log).toEqual([]);
 });
 it('asks nothing without the owner\'s live line, as before', async () => {
  const port = await closedPort();
  for (const selected of [undefined, {}, { livePayments: false }, { deploymentMode: 'hosted' }, { livePayments: 'true' }])
   expect(await refusalOf(() => startCheck.checkPaymentsAtStart({ configured: {}, selected }, { port, timeoutMs: 50 })), JSON.stringify(selected)).toBe('passed');
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart())).toBe('passed');
  expect(await refusalOf(() => startCheck.checkPaymentsAtStart(atStart(), { port, timeoutMs: 50 }))).toEqual(EGRESS_REFUSED);
 });
});
