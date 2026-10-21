// Root's tool for each release's own env files (side-by-side spec §10). Run as root by the operator only.
//
// Plain words: two releases run side by side, so each reads its own api-<label>.env, runner-<label>.env and
// ui-<label>.env. Each one is a copy of a live file in which only the values that must differ per release change:
// the site version and release key, the ports of the release's slot, the runner's worker identity and the API's mail
// helper inside the release's own folder. Every other line is copied byte for byte, so both releases keep using the
// same spending gates, scope, team and secrets. The SAME check reads the files back and says, check by check, that
// two releases share what they must share and never share what they must not.
//
//   release-env.mjs derive --service api|ui|runner --from <file> --label <label> --slot A|B --release-key <key>
//       <file>: /etc/debateai-v3-preview/auth-dev-v1/<service>.env or <service>-<older label>.env (root-owned, 0640).
//       Writes /etc/debateai-v3-preview/auth-dev-v1/<service>-<label>.env with the source's owner, group and mode;
//       refuses OUTPUT_EXISTS when that file is already there (it never replaces one). That check and the write are
//       two steps: only root writes this folder, so the window between them is root's own (one operator, one run).
//       A WRITE_VERIFY_FAILED file stays where it is; the operator moves it aside before running derive again.
//   release-env.mjs same --labels <label>[,<label>] [--slots A|B[,A|B]]
//       Prints `OK <check>` or `BAD <check>` per check; exit 1 on any BAD. --slots names the slot the operator expects
//       for each label, in the same order, and the SLOT_* checks hold each release to it. Without it, each release's
//       slot is the one its own api file's API_PORT names (the lock does not pin a release yet when this runs,
//       side-by-side plan D15), so SLOT_API_PORT then always passes; the guide passes --slots.
//
// Every refusal is one JSON line on stderr and exit 1. Output carries codes, check names, key names, labels, release
// keys and ports only; never a value read from an env file (they hold secrets and paths to secrets).
import { lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { RELEASE_KEY_PATTERN, parseEnvironmentText, readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { PREVIEW_SLOTS } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { LAYOUT, RELEASE_LABEL, atomicWrite, canonicalJson, envPathFor, logLine } from './common.mjs';

/** Side-by-side plan D8: the only keys a release's env file may change, per service (every other line is the source's). */
export const DERIVED_KEYS = Object.freeze({
  api: Object.freeze(['REGISTER_VERSION', 'RELEASE_KEY', 'API_PORT', 'MAIL_SENDMAIL_PATH']),
  runner: Object.freeze(['REGISTER_VERSION', 'RELEASE_KEY', 'RUNNER_WORKER_ID', 'HATCHET_WORKER_NAME']),
  ui: Object.freeze(['RELEASE_KEY', 'PORT', 'DIALECTICAL_API_BASE'])
});
const SERVICES = Object.freeze(['api', 'runner', 'ui']);
/** Same limit as environment.mjs's reader (parseEnvironmentText refuses anything larger). */
const MAX_ENV_BYTES = 32768;
const ENV_MODE = 0o640;

class ReleaseEnvRefusal extends Error { constructor(code, fields) { super(code); this.name = 'ReleaseEnvRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new ReleaseEnvRefusal(code, fields); };
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
const isSlot = value => typeof value === 'string' && Object.hasOwn(PREVIEW_SLOTS, value);
const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/**
 * The derived values of one service for one release (side-by-side INTERFACE: RUNNER_WORKER_ID and HATCHET_WORKER_NAME
 * differ per release; plan D: they end in the release key). The mail helper is the reviewed launch plan's
 * mailExecutable for the release's API folder.
 */
function derivedValues(service, releaseKey, slot, label) {
  const registerVersion = /^r([1-9][0-9]*)-/.exec(releaseKey)[1];
  const { uiPort, apiPort } = PREVIEW_SLOTS[slot];
  const worker = `debateai-preview-runner-${releaseKey}`;
  if (service === 'api') return { REGISTER_VERSION: registerVersion, RELEASE_KEY: releaseKey, API_PORT: apiPort,
    MAIL_SENDMAIL_PATH: `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-api/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs` };
  if (service === 'runner') return { REGISTER_VERSION: registerVersion, RELEASE_KEY: releaseKey, RUNNER_WORKER_ID: worker, HATCHET_WORKER_NAME: worker };
  return { RELEASE_KEY: releaseKey, PORT: uiPort, DIALECTICAL_API_BASE: `http://127.0.0.1:${apiPort}` };
}

const parseOr = (text, code) => { try { return parseEnvironmentText(text); } catch { return refuse(code); } };

/**
 * The release's env text from a live (or older release's) env text: each derived key's line gets the release's value
 * where it stands, RELEASE_KEY is appended when the source has none, and every other line stays byte for byte.
 * Every derived key but RELEASE_KEY must already be in the source (each is required by its service's parser).
 */
export function deriveEnvironmentText({ service, sourceText, releaseKey, slot, label }) {
  if (!SERVICES.includes(service) || typeof releaseKey !== 'string' || !RELEASE_KEY_PATTERN.test(releaseKey) || !isSlot(slot) || !isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const source = parseOr(sourceText, 'SOURCE_ENV_REFUSED');
  const values = derivedValues(service, releaseKey, slot, label);
  for (const key of DERIVED_KEYS[service]) if (key !== 'RELEASE_KEY' && !Object.hasOwn(source, key)) refuse('SOURCE_KEY_MISSING', { key });
  const lines = sourceText.split('\n').map(line => {
    const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    return key !== undefined && Object.hasOwn(values, key) ? `${key}=${values[key]}` : line;
  });
  // A final newline leaves one empty last element: the appended line goes before it, so the file still ends in one.
  if (!Object.hasOwn(source, 'RELEASE_KEY')) lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `RELEASE_KEY=${releaseKey}`);
  const text = lines.join('\n');
  parseOr(text, 'DERIVED_ENV_REFUSED');
  return text;
}

/** One check: frozen, a name and a verdict, never a value. */
const result = (check, ok) => Object.freeze({ check, ok });
/** All values equal; `required` also wants each one present. An unreadable value (a unique symbol) equals nothing. */
const allSame = (values, required) => values.every(value => value === values[0] && (!required || value !== undefined));
const allDifferent = values => values.every(value => value !== undefined) && new Set(values).size === values.length;
/** One field of the preview configuration JSON, as comparable text; absent config or field is undefined. */
function configField(environment, field) {
  const raw = environment.PREVIEW_PROVIDER_TEST_CONFIG_JSON;
  if (raw === undefined) return undefined;
  let value;
  try { value = JSON.parse(raw); } catch { return Symbol('unreadable'); }
  if (!isPlainObject(value)) return Symbol('unreadable');
  return Object.hasOwn(value, field) ? canonicalJson(value[field]) : undefined;
}

const WITHIN_API_RUNNER = Object.freeze([['PREVIEW_PROVIDER_TEST_CONFIG_JSON', false], ['PREVIEW_TEAM_USER_IDS_JSON', false], ['DEBATEAI_DEPLOYMENT_MODE', false], ['REGISTER_VERSION', true], ['RELEASE_KEY', true]]);
const ACROSS_CONFIG = Object.freeze(['budget_socket', 'anthropic_budget_socket', 'scope_id']);
const ACROSS_SAME = Object.freeze(['DEBATEAI_DEPLOYMENT_MODE', 'HATCHET_WORKFLOW_NAME', 'PREVIEW_TEAM_USER_IDS_JSON']);
const ACROSS_DIFFERENT = Object.freeze([['RELEASE_KEY', 'api'], ['RUNNER_WORKER_ID', 'runner'], ['HATCHET_WORKER_NAME', 'runner'], ['API_PORT', 'api'], ['PORT', 'ui']]);

/**
 * Side-by-side spec §10, the SAME checks. Within each release (`<check>:<label>`): its API and runner agree on the
 * preview configuration, the team, the deployment mode, the site version and the release key; its website names the
 * API's release key; its ports and API address are its slot's. Across releases (two only): every API and runner file
 * names the same spending gates and scope, deployment mode, workflow and team; the release keys, runner identities
 * and ports all differ. Returns every check, OK or not, in a fixed order.
 */
export function sameChecks(releases) {
  if (!Array.isArray(releases) || releases.length < 1 || releases.length > 2
    || releases.some(release => !isPlainObject(release) || !isLabel(release.label) || !isSlot(release.slot) || !SERVICES.every(service => isPlainObject(release[service])))
    || new Set(releases.map(release => release.label)).size !== releases.length) refuse('ARGUMENTS_REFUSED');
  const out = [];
  for (const { label, slot, api, runner, ui } of releases) {
    for (const [key, required] of WITHIN_API_RUNNER) out.push(result(`SAME_API_RUNNER_${key}:${label}`, allSame([api[key], runner[key]], required)));
    out.push(result(`SAME_UI_API_RELEASE_KEY:${label}`, allSame([ui.RELEASE_KEY, api.RELEASE_KEY], true)));
    const { uiPort, apiPort } = PREVIEW_SLOTS[slot];
    out.push(result(`SLOT_API_PORT:${label}`, api.API_PORT === apiPort), result(`SLOT_PORT:${label}`, ui.PORT === uiPort),
      result(`SLOT_DIALECTICAL_API_BASE:${label}`, ui.DIALECTICAL_API_BASE === `http://127.0.0.1:${apiPort}`));
  }
  if (releases.length === 2) {
    const backends = releases.flatMap(release => [release.api, release.runner]);
    for (const field of ACROSS_CONFIG) out.push(result(`SAME_${field.toUpperCase()}`, allSame(backends.map(environment => configField(environment, field)), false)));
    for (const key of ACROSS_SAME) out.push(result(`SAME_${key}`, allSame(backends.map(environment => environment[key]), false)));
    for (const [key, service] of ACROSS_DIFFERENT) out.push(result(`DIFFERENT_${key}`, allDifferent(releases.map(release => release[service][key]))));
  }
  return Object.freeze(out);
}

const ownerOf = layout => layout.ownerUid ?? 0;
/** The env folder's own files only: `<service>.env` (the live one) or `<service>-<label>.env` (a release's). */
const fromPattern = layout => new RegExp(`^${layout.nativePlanRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(api|ui|runner)(?:-(${RELEASE_LABEL.source.slice(1, -1)}))?\\.env$`);
/** Root-owned, 0640, in the root-owned env folder (custody.mjs withPrivateBytes); any group. */
const custodyOf = layout => ({ root: layout.nativePlanRoot, uid: ownerOf(layout), parentUid: ownerOf(layout), mode: ENV_MODE, maxBytes: MAX_ENV_BYTES });

async function deriveCommand({ service, from, label, slot, releaseKey }, layout, write) {
  const out = envPathFor(layout, service, label);
  // Checked before the source is read: a release's file is never replaced, not even by itself. atomicWrite's rename
  // would replace a file created after this check; only root writes the folder, so that window is root's own.
  const present = await lstat(out).then(() => true, error => (error?.code === 'ENOENT' ? false : refuse('OUTPUT_PATH_REFUSED')));
  if (present) refuse('OUTPUT_EXISTS');
  const custody = custodyOf(layout);
  let sourceText, owner;
  try {
    ({ sourceText, owner } = await readEnvironmentText(from, custody));
  } catch { refuse('SOURCE_ENV_REFUSED'); }
  const text = deriveEnvironmentText({ service, sourceText, releaseKey, slot, label });
  const before = parseEnvironmentText(sourceText), after = parseEnvironmentText(text);
  await write(out, Buffer.from(text, 'utf8'), owner);
  // Read back through the launchers' own reader, with the custody they will demand.
  let readBack;
  // On WRITE_VERIFY_FAILED the written file is kept (never deleted here); a rerun refuses OUTPUT_EXISTS until the
  // operator moves it aside.
  try { readBack = await readEnvironmentFile(out, { ...custody, gid: owner.gid }); } catch { refuse('WRITE_VERIFY_FAILED'); }
  if (canonicalJson(readBack) !== canonicalJson(after)) refuse('WRITE_VERIFY_FAILED');
  return Object.freeze({
    event: 'PREVIEW_RELEASE_ENV_WRITTEN', service, label, changed: DERIVED_KEYS[service].filter(key => before[key] !== after[key]),
    registerVersion: /^r([1-9][0-9]*)-/.exec(releaseKey)[1], releaseKey, ports: PREVIEW_SLOTS[slot]
  });
}

/** The source's bytes as text, plus the owner, group and mode the copy keeps (custody already demands root and 0640). */
function readEnvironmentText(path, custody) {
  return withPrivateBytes(path, custody, async raw => {
    const stat = await lstat(path);
    return { sourceText: new TextDecoder('utf8', { fatal: true }).decode(raw), owner: { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 } };
  });
}

async function sameCommand({ labels, slots }, layout, stdout) {
  const custody = custodyOf(layout);
  const releases = [];
  for (const [index, label] of labels.entries()) {
    const files = {};
    for (const service of SERVICES) {
      try { files[service] = await readEnvironmentFile(envPathFor(layout, service, label), custody); } catch { refuse('ENV_FILE_UNREADABLE', { service, label }); }
    }
    const slot = slots?.[index] ?? Object.keys(PREVIEW_SLOTS).find(name => PREVIEW_SLOTS[name].apiPort === files.api.API_PORT) ?? refuse('RELEASE_SLOT_UNKNOWN', { label });
    releases.push({ label, slot, ...files });
  }
  const results = sameChecks(releases);
  for (const { check, ok } of results) stdout.write(`${ok ? 'OK' : 'BAD'} ${check}\n`);
  return results.every(({ ok }) => ok) ? 0 : 1;
}

/** Exact flags (every required one, any optional one), each once; every value checked before any path is touched. */
function parseArguments(argv, layout) {
  const [command, ...rest] = argv;
  const spec = {
    derive: { required: ['--service', '--from', '--label', '--slot', '--release-key'], optional: [] },
    same: { required: ['--labels'], optional: ['--slots'] }
  }[command];
  if (!spec || rest.length % 2 !== 0) refuse('ARGUMENTS_REFUSED');
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const [flag, value] = [rest[index], rest[index + 1]];
    if (!(spec.required.includes(flag) || spec.optional.includes(flag)) || Object.hasOwn(options, flag) || typeof value !== 'string') refuse('ARGUMENTS_REFUSED');
    options[flag] = value;
  }
  if (!spec.required.every(flag => Object.hasOwn(options, flag))) refuse('ARGUMENTS_REFUSED');
  if (command === 'same') {
    const labels = options['--labels'].split(',');
    if (labels.length > 2 || !labels.every(isLabel) || new Set(labels).size !== labels.length) refuse('ARGUMENTS_REFUSED');
    // Two releases never share a slot (side-by-side spec §6), so an expected list naming one twice is a typo.
    const slots = options['--slots']?.split(',');
    if (slots && (slots.length !== labels.length || !slots.every(isSlot) || new Set(slots).size !== slots.length)) refuse('ARGUMENTS_REFUSED');
    return { command, labels, ...(slots ? { slots } : {}) };
  }
  const service = options['--service'], from = options['--from'], label = options['--label'], slot = options['--slot'], releaseKey = options['--release-key'];
  const match = fromPattern(layout).exec(from);
  if (!SERVICES.includes(service) || !match || match[1] !== service || !isLabel(label) || !isSlot(slot) || !RELEASE_KEY_PATTERN.test(releaseKey)) refuse('ARGUMENTS_REFUSED');
  return { command, service, from, label, slot, releaseKey };
}

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** derive: one JSON line, 0 on success. same: one line per check, 0 when every check is OK. Any refusal: 1. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv, layout);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    if (args.command === 'same') return await sameCommand(args, layout, stdout);
    logLine(stdout, await deriveCommand(args, layout, deps.write ?? atomicWrite));
    return 0;
  } catch (error) {
    logLine(stderr, { event: 'PREVIEW_RELEASE_ENV_REFUSED', ...(args ? { command: args.command } : {}), reason: typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED', ...(error instanceof ReleaseEnvRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
