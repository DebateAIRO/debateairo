// Preview egress proxy v1 (owner rulings 2026-10-13): the hosted preview API's only way to the Internet.
//
// Plain words: the API's unit denies every IP address but loopback (IPAddressDeny=any), and systemd can allow only
// address ranges, never host names, while NETOPIA's and Quaderno's sandboxes sit behind changing addresses. So the
// hosted API reaches them through this small loopback proxy (launch-api.mjs points the API's fetch at it). It admits
// exactly one request form, `CONNECT <host>:443`, for NETOPIA's two sandbox hosts and Quaderno sandbox account hosts
// (`<account>.sandbox-quadernoapp.com`) only. It resolves the name itself and refuses any address that is not a
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
/** One Quaderno sandbox account host: one DNS label, then `.sandbox-quadernoapp.com` (never Quaderno's live hosts). */
export const PREVIEW_EGRESS_QUADERNO_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sandbox-quadernoapp\.com$/;
export const isAdmittedHost = host => typeof host === 'string' && (PREVIEW_EGRESS_NETOPIA_HOSTS.includes(host) || PREVIEW_EGRESS_QUADERNO_HOST.test(host));

const CONNECT_LINE = /^CONNECT ([a-z0-9.-]{1,253}):([0-9]{1,5}) HTTP\/1\.[01]$/;
/** The one admitted request line: CONNECT of an admitted host on port 443. Returns that host, or null. */
export function admittedTarget(requestLine) {
  const match = CONNECT_LINE.exec(requestLine);
  return match && match[2] === '443' && isAdmittedHost(match[1]) ? match[1] : null;
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
export const PREVIEW_EGRESS_LIMITS = Object.freeze({ headerTimeoutMs: 10_000, connectTimeoutMs: 10_000, idleTimeoutMs: 120_000, maxConnections: 32 });

/**
 * The proxy server (not listening yet). `resolve`, `connect` and `log` exist for the unit tests; the executable uses
 * the system resolver, a plain TCP connection to the resolved address on port 443, and one JSON line on stdout.
 */
export function createEgressProxy({
  resolve = host => lookup(host, { all: true, verbatim: true }),
  connect = (port, address) => net.connect({ port, host: address }),
  log = line => process.stdout.write(`${JSON.stringify(line)}\n`),
  limits = PREVIEW_EGRESS_LIMITS
} = {}) {
  const server = net.createServer({ allowHalfOpen: false }, client => {
    let head = Buffer.alloc(0), state = 'head', upstream = null;
    const record = (host, outcome) => { try { log({ event: 'preview.egress', host, outcome }); } catch { /* the journal never decides */ } };
    const deny = (host, outcome) => {
      if (state === 'closed') return;
      state = 'closed'; clearTimeout(headTimer); record(host, outcome);
      upstream?.destroy();
      client.end(FORBIDDEN);
      setTimeout(() => client.destroy(), 1000).unref();
    };
    const headTimer = setTimeout(() => deny(null, 'HEADER_TIMEOUT'), limits.headerTimeoutMs);
    client.on('error', () => { clearTimeout(headTimer); state = 'closed'; upstream?.destroy(); client.destroy(); });
    client.once('close', () => { clearTimeout(headTimer); upstream?.destroy(); });
    const onData = chunk => {
      if (state !== 'head') return;
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) { if (head.length > MAX_HEAD_BYTES) deny(null, 'HEADER_TOO_LARGE'); return; }
      if (end > MAX_HEAD_BYTES) { deny(null, 'HEADER_TOO_LARGE'); return; }
      clearTimeout(headTimer);
      client.removeListener('data', onData); client.pause();
      const lineEnd = head.indexOf('\r\n');
      const line = head.subarray(0, lineEnd).toString('latin1');
      const host = admittedTarget(line);
      if (host === null) { deny(askedHost(line), 'HOST_REFUSED'); return; }
      const rest = head.subarray(end + 4);
      state = 'resolving';
      Promise.resolve().then(() => resolve(host)).then(addresses => {
        if (state !== 'resolving') return;
        const target = Array.isArray(addresses) ? addresses.find(entry => isPublicAddress(entry?.address, entry?.family)) : undefined;
        if (target === undefined) { deny(host, 'ADDRESS_REFUSED'); return; }
        const socket = connect(443, target.address);
        upstream = socket;
        const connectTimer = setTimeout(() => deny(host, 'CONNECT_TIMEOUT'), limits.connectTimeoutMs);
        socket.once('error', () => { clearTimeout(connectTimer); if (state === 'resolving') deny(host, 'CONNECT_FAILED'); else client.destroy(); });
        socket.once('close', () => { clearTimeout(connectTimer); if (state === 'open') client.destroy(); });
        socket.once('connect', () => {
          clearTimeout(connectTimer);
          if (state !== 'resolving') { socket.destroy(); return; }
          state = 'open'; record(host, 'OPENED');
          const idle = () => { client.destroy(); socket.destroy(); };
          client.setTimeout(limits.idleTimeoutMs, idle); socket.setTimeout(limits.idleTimeoutMs, idle);
          client.write(ESTABLISHED);
          if (rest.length > 0) socket.write(rest);
          client.pipe(socket); socket.pipe(client);
          client.resume();
        });
      }, () => deny(host, 'RESOLVE_FAILED'));
    };
    client.on('data', onData);
  });
  server.maxConnections = limits.maxConnections;
  return server;
}

async function main() {
  if (process.argv.length !== 2) { process.stderr.write('PREVIEW_EGRESS_REFUSED\n'); process.exitCode = 1; return; }
  const server = createEgressProxy();
  server.once('error', () => { process.stderr.write('PREVIEW_EGRESS_REFUSED\n'); process.exitCode = 1; });
  server.listen({ host: PREVIEW_EGRESS_HOST, port: PREVIEW_EGRESS_PORT, exclusive: true }, () =>
    process.stdout.write(`${JSON.stringify({ event: 'preview.egress.listening', host: PREVIEW_EGRESS_HOST, port: PREVIEW_EGRESS_PORT })}\n`));
  const stop = () => server.close();
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
