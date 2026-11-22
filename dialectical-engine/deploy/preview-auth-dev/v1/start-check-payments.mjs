import net from 'node:net';
import { PREVIEW_EGRESS_HOST, PREVIEW_EGRESS_PORT, previewEgressModeQuestion } from './egress-proxy.mjs';
import { PREVIEW_QUADERNO_LIVE_BASE } from './environment.mjs';
import { refuseNamed } from './startup-refusals.mjs';
/** The live form's two replies (egress-proxy.mjs): its own Quaderno account was named, or another one. */
const LIVE_REPLY = 'HTTP/1.1 204 No Content\r\nX-Preview-Egress-Payments: live\r\n';
const OTHER_ACCOUNT_REPLY = 'HTTP/1.1 409 Conflict\r\nX-Preview-Egress-Payments: live\r\n';
/** What a reply says so far: 'live', 'other-account', 'not-live', or undefined while it may still become one of the first two. */
const verdictOf = answer => answer.startsWith(LIVE_REPLY) ? 'live' : answer.startsWith(OTHER_ACCOUNT_REPLY) ? 'other-account'
 : LIVE_REPLY.startsWith(answer) || OTHER_ACCOUNT_REPLY.startsWith(answer) ? undefined : 'not-live';
/** A live Quaderno account's host: one DNS label before quadernoapp.com. */
const QUADERNO_LIVE_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.quadernoapp\.com$/;
/**
 * Asks the loopback egress proxy which form it runs in, naming the live Quaderno host the API will call: one CONNECT of
 * the mode name, which only the live form answers. Its 204 reply passes; its 409 reply (a live form for another Quaderno
 * account) refuses PREVIEW_LIVE_PAYMENTS_REFUSED:egress-account; a sandbox form, an older copy of the proxy, a stopped
 * proxy, a closed port, a wrong reply or no reply within `timeoutMs` refuse PREVIEW_LIVE_PAYMENTS_REFUSED:egress.
 * Nothing else is read, and nothing of the reply or the host is printed.
 */
export async function assertEgressIsLive({ host = PREVIEW_EGRESS_HOST, port = PREVIEW_EGRESS_PORT, timeoutMs = 3000, quadernoHost } = {}) {
 if (typeof quadernoHost !== 'string' || !QUADERNO_LIVE_HOST.test(quadernoHost)) refuseNamed('PREVIEW_LIVE_PAYMENTS_REFUSED:quaderno-base');
 const verdict = await new Promise(done => {
  let answer = '', settled = false;
  const socket = net.connect({ host, port });
  const settle = outcome => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); done(outcome); };
  const timer = setTimeout(() => settle('not-live'), timeoutMs);
  socket.setEncoding('latin1');
  socket.on('connect', () => socket.write(previewEgressModeQuestion(quadernoHost)));
  socket.on('data', chunk => { answer += chunk; const outcome = verdictOf(answer); if (outcome !== undefined) settle(outcome); });
  socket.on('end', () => settle(verdictOf(answer) ?? 'not-live'));
  socket.on('close', () => settle(verdictOf(answer) ?? 'not-live'));
  socket.on('error', () => settle('not-live'));
 });
 if (verdict === 'other-account') refuseNamed('PREVIEW_LIVE_PAYMENTS_REFUSED:egress-account');
 if (verdict !== 'live') refuseNamed('PREVIEW_LIVE_PAYMENTS_REFUSED:egress');
}
/**
 * What the API launcher checks about payments before the API starts. With the owner's live line (narrowEnvironment's
 * `livePayments`), the egress proxy must be in its live form for the Quaderno account of QUADERNO_API_BASE_URL;
 * without it, nothing: the launcher's own rules keep the sandbox. `egress` exists for the unit tests.
 */
export async function checkPaymentsAtStart({ configured, selected } = {}, egress = {}) {
 if (selected?.livePayments !== true) return;
 const base = configured?.QUADERNO_API_BASE_URL;
 if (typeof base !== 'string' || !PREVIEW_QUADERNO_LIVE_BASE.test(base)) refuseNamed('PREVIEW_LIVE_PAYMENTS_REFUSED:quaderno-base');
 await assertEgressIsLive({ ...egress, quadernoHost: base.slice('https://'.length, -'/api'.length) });
}
