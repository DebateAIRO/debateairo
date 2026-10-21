// deploy/notify-alarm/notify-alarm.mjs: the outside alarm on NETOPIA's notify address (B3d,
// docs/business/2026-10-21-netopia-answers-code-check.md, "Changes to build" 3d; setup in README.md beside this file).
//
// Plain words: NETOPIA puts a first payment's saved card only in its first message to our notify address, then resends
// 5 copies without it, 5 minutes apart. If the site is down for more than about 25 minutes then, the card is lost. Every
// 5 minutes (debateai-notify-alarm.timer) this knocks on the site's own public notify address with the unsigned message
// `pnpm billing:check` already sends (an empty POST with no Verification-token). The route answers it "try again"
// (HTTP 503, NETOPIA's "retry") and stores nothing. A wrong answer is knocked again a minute later. Then the run reports
// to an outside alarm service (Healthchecks.io): "all good" to the ping link, or "broken" with one plain sentence to the
// ping link's /fail address. That service emails the owner when a report says "broken" or stops arriving, so a dead
// server raises the alarm too.
//
// Settings: one JSON file {"site": "<the site's https origin>", "pingUrl": "<the alarm service's ping link>"}, handed
// over by systemd as the credential `notify-alarm` (LoadCredential=), or named with --config for a run by hand. The ping
// link is a secret (anyone holding it can send a fake "all good"), so it is never written to the log.
// Exit codes: 0 the report was taken (whatever the site said), 1 an unexpected failure (NOTIFY_ALARM_FAILED), 2 wrong
// argument or settings, 3 the report was not taken.
// Node built-ins only, so it runs with any Node the host has (the global fetch), outside the release's own tree.
import { open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** N9's NETOPIA_NOTIFY_PATH as the public site serves it (the website passes /api to the API). */
export const NOTIFY_PATH = '/api/v1/billing/netopia/notify';
/** The route's own answer to a message with no Verification-token: netopiaNoticeAnswer("NOTICE_HEADER_MISSING"). */
export const UNSIGNED_ANSWER = Object.freeze({
  status: 503, body: Object.freeze({ errorType: 1, errorCode: 268435713, errorMessage: 'retry' })
});
export const KNOCK_TIMEOUT_MS = 10_000;
/** A wrong answer is knocked again after this pause, so a restart of a few seconds does not raise the alarm. */
export const RETRY_DELAY_MS = 60_000;
export const REPORT_TRIES = 3;
export const REPORT_TIMEOUT_MS = 10_000;
export const REPORT_RETRY_MS = 5_000;
/** The route's answers are a few dozen bytes; a longer body is not one of them and is not read further. */
const BODY_MAX_BYTES = 1_024;
const CONFIG_MAX_BYTES = 4_096;
const URL_MAX_LENGTH = 512;
const USER_AGENT = 'debateai-notify-alarm';
/** The alarm service's own endings of a ping link (Healthchecks.io: /fail, /start, /log, /<exit code>). */
const SERVICE_ENDING = /\/(fail|start|log|\d{1,3})\/?$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const TEST_REASON = 'TEST: this is a test of the alarm on NETOPIA\'s notify address, sent by hand. Nothing is wrong.'
  + ' The next check, within 5 minutes, sends the "back up" email.';
const REPORT_FAILED = 'NOTIFY_ALARM_REPORT_FAILED: the alarm service did not take the report;'
  + ' it emails the owner when reports stop arriving.';

const invalid = (field) => new TypeError(field === undefined ? 'NOTIFY_ALARM_CONFIG_INVALID' : `NOTIFY_ALARM_CONFIG_INVALID:${field}`);

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > URL_MAX_LENGTH) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null;
  return url;
}

/** The settings file's text -> { site: the https origin, pingUrl }; a TypeError naming the field otherwise. */
export function parseAlarmConfig(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'pingUrl' || keys[1] !== 'site') throw invalid('keys');
  const site = httpsUrl(value.site);
  if (site === null || site.pathname !== '/') throw invalid('site');
  const ping = httpsUrl(value.pingUrl);
  if (ping === null || ping.pathname.replace(/\/+$/u, '') === '' || SERVICE_ENDING.test(ping.pathname)) throw invalid('pingUrl');
  // The parsed link, not the raw text: URL parsing drops a space or tab pasted around it, which would otherwise end
  // up inside the /fail address.
  return { site: site.origin, pingUrl: ping.href.replace(/\/+$/u, '') };
}

/** At most BODY_MAX_BYTES of a body as text (null when it is longer); the rest is never read. */
async function boundedText(response) {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isUnsignedAnswer(status, text) {
  if (status !== UNSIGNED_ANSWER.status || text === null) return false;
  let got;
  try {
    got = JSON.parse(text);
  } catch {
    return false;
  }
  const want = UNSIGNED_ANSWER.body;
  return typeof got === 'object' && got !== null && !Array.isArray(got)
    && Object.keys(got).length === Object.keys(want).length
    && Object.entries(want).every(([name, expected]) => got[name] === expected);
}

/** A short code for a failed connection, never a message (a message may carry anything). */
function connectionDetail(error) {
  if (error?.name === 'TimeoutError') return `no answer within ${KNOCK_TIMEOUT_MS / 1000} seconds`;
  const code = error?.cause?.code ?? error?.code;
  return typeof code === 'string' && SAFE_CODE.test(code) ? code : 'connection failed';
}

const down = (code, reason) => Object.freeze({ ok: false, code, reason });

/**
 * One knock: one POST of an empty body with no Verification-token, redirects never followed. { ok: true } only for the
 * route's own answer to an unsigned message; otherwise a code and one plain sentence that starts with the address.
 */
export async function knock(site, fetchImpl) {
  const address = `${site}${NOTIFY_PATH}`;
  let response;
  let text = null;
  try {
    response = await fetchImpl(address, {
      method: 'POST', body: '', redirect: 'manual', headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(KNOCK_TIMEOUT_MS)
    });
    if (response.status === UNSIGNED_ANSWER.status) text = await boundedText(response);
  } catch (error) {
    return down('UNREACHABLE', `${address} could not be reached (${connectionDetail(error)}): the server, its network or its web front door may be down.`);
  }
  if (text === null) await response.body?.cancel().catch(() => undefined);
  const status = response.status;
  if (isUnsignedAnswer(status, text)) return Object.freeze({ ok: true });
  if (response.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
    const shown = status === 0 ? '' : ` (HTTP ${status})`;
    return down('REDIRECT', `${address} answered with a redirect${shown}: NETOPIA does not follow redirects, so its messages cannot arrive.`);
  }
  if (status >= 500) {
    return down('API_DOWN', `${address} answered HTTP ${status}: the website answered, but the program behind it did not, so NETOPIA's messages cannot be received.`);
  }
  if (status === 404) {
    return down('NOT_SERVED', `${address} answered HTTP 404: the site is up, but its program does not serve NETOPIA's address (billing is off, or the program started without NETOPIA's settings).`);
  }
  if (status === 401 || status === 403) {
    return down('GATED', `${address} answered HTTP ${status}: a password gate or a firewall rule in front of the site blocks NETOPIA's messages.`);
  }
  if (status === 429) return down('BUSY', `${address} answered HTTP 429: too many messages reached it just now.`);
  return down('UNEXPECTED', `${address} answered HTTP ${status}, not the notify address's own answer to an unsigned message (HTTP 503, "retry").`);
}

/** POSTs one report (a short text) to the alarm service; true once it answers 2xx, after up to REPORT_TRIES tries. */
async function report(url, text, deps) {
  for (let attempt = 1; attempt <= REPORT_TRIES; attempt += 1) {
    if (attempt > 1) await deps.sleep(REPORT_RETRY_MS);
    try {
      const response = await deps.fetch(url, {
        method: 'POST', body: text, redirect: 'error', headers: { 'user-agent': USER_AGENT, 'content-type': 'text/plain; charset=utf-8' },
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS)
      });
      await response.body?.cancel().catch(() => undefined);
      if (response.status >= 200 && response.status < 300) return true;
    } catch {
      // Tried again; a report that never arrives is itself the alarm (the service emails when reports stop).
    }
  }
  return false;
}

const failUrl = (pingUrl) => `${pingUrl.replace(/\/+$/u, '')}/fail`;

/**
 * One run: knock, knock again after RETRY_DELAY_MS if the answer was wrong, then report. deps: { fetch, sleep, out,
 * err, testAlarm? }. testAlarm sends a "broken" report with a fixed test sentence and knocks nothing.
 */
export async function runAlarm(config, deps) {
  if (deps.testAlarm === true) {
    if (!(await report(failUrl(config.pingUrl), TEST_REASON, deps))) {
      deps.err(REPORT_FAILED);
      return 3;
    }
    deps.out('NOTIFY_ALARM_TEST_SENT');
    return 0;
  }
  let result = await knock(config.site, deps.fetch);
  let first = null;
  if (!result.ok) {
    first = result.code;
    await deps.sleep(RETRY_DELAY_MS);
    result = await knock(config.site, deps.fetch);
  }
  const taken = result.ok
    ? await report(config.pingUrl, 'The notify address gave its own answer to an unsigned message.', deps)
    : await report(failUrl(config.pingUrl), result.reason, deps);
  deps.out(result.ok ? (first === null ? 'NOTIFY_ALARM_OK' : `NOTIFY_ALARM_OK first_knock=${first}`) : `NOTIFY_ALARM_DOWN ${result.code} ${result.reason}`);
  if (!taken) {
    deps.err(REPORT_FAILED);
    return 3;
  }
  return 0;
}

async function readSettings(path) {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    throw new TypeError('NOTIFY_ALARM_CONFIG_UNREADABLE');
  }
  try {
    const buffer = Buffer.alloc(CONFIG_MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > CONFIG_MAX_BYTES) throw new TypeError('NOTIFY_ALARM_CONFIG_TOO_LARGE');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function settingsPath(argv, environment) {
  let path = null;
  let testAlarm = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--test-alarm' && !testAlarm) testAlarm = true;
    else if (argument === '--config' && path === null && typeof argv[index + 1] === 'string' && isAbsolute(argv[index + 1])) {
      path = argv[index + 1];
      index += 1;
    } else throw new TypeError('NOTIFY_ALARM_USAGE');
  }
  if (path === null) {
    const directory = environment.CREDENTIALS_DIRECTORY;
    if (typeof directory !== 'string' || !isAbsolute(directory)) throw new TypeError('NOTIFY_ALARM_CONFIG_MISSING');
    path = join(directory, 'notify-alarm');
  }
  return { path, testAlarm };
}

/** The command: [--test-alarm] [--config <absolute path>]; settings from $CREDENTIALS_DIRECTORY/notify-alarm otherwise. */
export async function main(argv, environment, deps) {
  let config;
  let testAlarm;
  try {
    const chosen = settingsPath(argv, environment);
    testAlarm = chosen.testAlarm;
    config = parseAlarmConfig(await readSettings(chosen.path));
  } catch (error) {
    deps.err(error instanceof TypeError && /^NOTIFY_ALARM_[A-Z_]+(:[A-Za-z]+)?$/u.test(error.message) ? error.message : 'NOTIFY_ALARM_CONFIG_UNREADABLE');
    return 2;
  }
  return runAlarm(config, { ...deps, testAlarm });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deps = {
    fetch: globalThis.fetch, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    out: (line) => console.log(line), err: (line) => console.error(line)
  };
  main(process.argv.slice(2), process.env, deps).then((code) => { process.exitCode = code; }, () => {
    console.error('NOTIFY_ALARM_FAILED');
    process.exitCode = 1;
  });
}
