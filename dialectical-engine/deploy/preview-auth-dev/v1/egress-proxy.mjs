// Preview egress proxy v1 (owner rulings 2026-10-13): the hosted preview API's only way to the Internet.
//
// Plain words: the API's unit denies every IP address but loopback (IPAddressDeny=any), and systemd can allow only
// address ranges, never host names, while NETOPIA's and Quaderno's sandboxes sit behind changing addresses. So the
// hosted API reaches them through this small loopback proxy (launch-api.mjs points the API's fetch at it). It admits
// exactly one request form, `CONNECT <host>:443`, for NETOPIA's two sandbox hosts and the preview's one Quaderno sandbox
// account host (`<account>.sandbox-quadernoapp.com`, the unit's `--quaderno-account`) only. It resolves the name itself and refuses any address that is not a
// public one (private, loopback, link-local, carrier-grade NAT, documentation, multicast, IPv4-mapped...), so a name
// pointed at an inside address reaches nothing. Then it only copies bytes: TLS stays end to end, so it never sees a
// key, a path or a body. Anything else is answered 403 and closed. It writes one content-free journal line per
// connection: the host asked for (when it is a well-formed host name) and the outcome.
//
// Standalone on purpose (node: built-ins only, no other file of the release): the server installs this one file under
// /opt/debateai-v3-preview/operator/egress-v1/ and runs it as debateai-preview-egress.service.
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

export const PREVIEW_EGRESS_HOST = '127.0.0.1';
export const PREVIEW_EGRESS_PORT = 3180;
/** What the API's fetch is pointed at (environment.mjs installHostedEgress). */
export const PREVIEW_EGRESS_PROXY_URL = `http://${PREVIEW_EGRESS_HOST}:${PREVIEW_EGRESS_PORT}`;
/** NETOPIA's two sandbox API hosts (packages/payments-netopia/src/hosts.ts; a unit test pins the two lists equal). */
export const PREVIEW_EGRESS_NETOPIA_HOSTS = Object.freeze(['secure-sandbox.netopia-payments.com', 'secure.sandbox.netopia-payments.com']);
/**
 * The ONE Quaderno sandbox account the preview uses, as the unit's argument `--quaderno-account <label>` (the label of
 * `https://<label>.sandbox-quadernoapp.com/api`): one DNS label. Only that account's host is admitted, never another
 * account's and never Quaderno's live hosts.
 */
export const PREVIEW_EGRESS_QUADERNO_ACCOUNT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const quadernoHostOf = account => {
  if (typeof account !== 'string' || !PREVIEW_EGRESS_QUADERNO_ACCOUNT.test(account)) throw new TypeError('PREVIEW_EGRESS_REFUSED');
  return `${account}.sandbox-quadernoapp.com`;
};
export const isAdmittedHost = (host, quadernoAccount) => typeof host === 'string' && (PREVIEW_EGRESS_NETOPIA_HOSTS.includes(host) || host === quadernoHostOf(quadernoAccount));

const CONNECT_LINE = /^CONNECT ([a-z0-9.-]{1,253}):([0-9]{1,5}) HTTP\/1\.[01]$/;
/** The one admitted request line: CONNECT of an admitted host on port 443. Returns that host, or null. */
export function admittedTarget(requestLine, quadernoAccount) {
  const match = CONNECT_LINE.exec(requestLine);
  return match && match[2] === '443' && isAdmittedHost(match[1], quadernoAccount) ? match[1] : null;
}
/** The host a refused line asked for, only when it is a well-formed host name (never raw input in the journal). */
const askedHost = requestLine => CONNECT_LINE.exec(requestLine)?.[1] ?? null;

// One list per family: a BlockList also matches an IPv4 address against an IPv4-mapped IPv6 rule (::ffff:0:0/96).
const REFUSED_V4 = new net.BlockList(), REFUSED_V6 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]]) REFUSED_V4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 127], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) REFUSED_V6.addSubnet(address, prefix, 'ipv6');
/** A public unicast address of the stated family: never an inside, special-use or translated one. */
export function isPublicAddress(address, family) {
  if ((family !== 4 && family !== 6) || net.isIP(address) !== family) return false;
  return family === 4 ? !REFUSED_V4.check(address, 'ipv4') : !REFUSED_V6.check(address, 'ipv6');
}

const FORBIDDEN = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const ESTABLISHED = 'HTTP/1.1 200 Connection Established\r\n\r\n';
const MAX_HEAD_BYTES = 8192;
export const PREVIEW_EGRESS_LIMITS = Object.freeze({ headerTimeoutMs: 10_000, resolveTimeoutMs: 10_000, connectTimeoutMs: 10_000, idleTimeoutMs: 120_000, maxConnections: 32 });

/**
 * The proxy server (not listening yet), for the one Quaderno sandbox account. `resolve`, `connect` and `log` exist for
 * the unit tests; the executable uses the system resolver, a plain TCP connection to a resolved public address on port
 * 443 (each public address in turn until one answers), and one JSON line on stdout.
 */
export function createEgressProxy({
  quadernoAccount,
  resolve = host => lookup(host, { all: true, verbatim: true }),
  connect = (port, address) => net.connect({ port, host: address }),
  log = line => process.stdout.write(`${JSON.stringify(line)}\n`),
  limits = PREVIEW_EGRESS_LIMITS
} = {}) {
  quadernoHostOf(quadernoAccount);
  const server = net.createServer({ allowHalfOpen: false }, client => {
    let head = Buffer.alloc(0), state = 'head', upstream = null, stepTimer;
    const record = (host, outcome) => { try { log({ event: 'preview.egress', host, outcome }); } catch { /* the journal never decides */ } };
    const deny = (host, outcome) => {
      if (state === 'closed') return;
      state = 'closed'; clearTimeout(headTimer); clearTimeout(stepTimer); record(host, outcome);
      upstream?.destroy();
      client.end(FORBIDDEN);
      setTimeout(() => client.destroy(), 1000).unref();
    };
    const headTimer = setTimeout(() => deny(null, 'HEADER_TIMEOUT'), limits.headerTimeoutMs);
    // A client that leaves (before or after the tunnel opened) ends everything: no lookup or connection outlives it.
    const gone = () => { clearTimeout(headTimer); clearTimeout(stepTimer); state = 'closed'; upstream?.destroy(); };
    client.on('error', () => { gone(); client.destroy(); });
    client.once('close', gone);
    const open = (host, socket, rest) => {
      state = 'open'; record(host, 'OPENED');
      const idle = () => { client.destroy(); socket.destroy(); };
      client.setTimeout(limits.idleTimeoutMs, idle); socket.setTimeout(limits.idleTimeoutMs, idle);
      socket.once('close', () => client.destroy());
      socket.on('error', () => client.destroy());
      client.write(ESTABLISHED);
      if (rest.length > 0) socket.write(rest);
      client.pipe(socket); socket.pipe(client);
      client.resume();
    };
    /** Each public address in turn, each within the connect deadline; the first that answers carries the tunnel. */
    const attempt = (host, targets, index, rest) => {
      if (state !== 'resolving') return;
      if (index >= targets.length) { deny(host, 'CONNECT_FAILED'); return; }
      const socket = connect(443, targets[index].address);
      upstream = socket;
      let settled = false;
      const next = () => { if (settled) return; settled = true; clearTimeout(stepTimer); socket.destroy(); attempt(host, targets, index + 1, rest); };
      stepTimer = setTimeout(next, limits.connectTimeoutMs);
      socket.once('error', next);
      socket.once('connect', () => {
        if (settled) return; settled = true; clearTimeout(stepTimer);
        socket.removeListener('error', next);
        if (state !== 'resolving') { socket.destroy(); return; }
        open(host, socket, rest);
      });
    };
    const onData = chunk => {
      if (state !== 'head') return;
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) { if (head.length > MAX_HEAD_BYTES) deny(null, 'HEADER_TOO_LARGE'); return; }
      if (end > MAX_HEAD_BYTES) { deny(null, 'HEADER_TOO_LARGE'); return; }
      clearTimeout(headTimer);
      client.removeListener('data', onData); client.pause();
      const line = head.subarray(0, head.indexOf('\r\n')).toString('latin1');
      const host = admittedTarget(line, quadernoAccount);
      if (host === null) { deny(askedHost(line), 'HOST_REFUSED'); return; }
      const rest = head.subarray(end + 4);
      state = 'resolving';
      stepTimer = setTimeout(() => deny(host, 'RESOLVE_FAILED'), limits.resolveTimeoutMs);
      Promise.resolve().then(() => resolve(host)).then(addresses => {
        if (state !== 'resolving') return;
        clearTimeout(stepTimer);
        const targets = Array.isArray(addresses) ? addresses.filter(entry => isPublicAddress(entry?.address, entry?.family)) : [];
        if (targets.length === 0) { deny(host, 'ADDRESS_REFUSED'); return; }
        attempt(host, targets, 0, rest);
      }, () => deny(host, 'RESOLVE_FAILED')).catch(() => deny(host, 'CONNECT_FAILED'));
    };
    client.on('data', onData);
  });
  server.maxConnections = limits.maxConnections;
  return server;
}

/** Exactly `--quaderno-account <label>`: the one Quaderno sandbox account (the unit's ExecStart). */
export function parseEgressArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== '--quaderno-account') throw new TypeError('PREVIEW_EGRESS_REFUSED');
  quadernoHostOf(argv[1]);
  return Object.freeze({ quadernoAccount: argv[1] });
}

async function main() {
  let options;
  try { options = parseEgressArguments(process.argv.slice(2)); } catch { process.stderr.write('PREVIEW_EGRESS_REFUSED\n'); process.exitCode = 1; return; }
  const server = createEgressProxy(options);
  server.once('error', () => { process.stderr.write('PREVIEW_EGRESS_REFUSED\n'); process.exitCode = 1; });
  server.listen({ host: PREVIEW_EGRESS_HOST, port: PREVIEW_EGRESS_PORT, exclusive: true }, () =>
    process.stdout.write(`${JSON.stringify({ event: 'preview.egress.listening', host: PREVIEW_EGRESS_HOST, port: PREVIEW_EGRESS_PORT })}\n`));
  const stop = () => server.close();
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
