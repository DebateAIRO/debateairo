// Root-only release staging tool for the v3 preview (Linux, Node v26.8.2).
//
// Plain words: the reviewed preview operator (deploy/preview-auth-dev/v1) knows how to hash a
// release, build its website and check every plan, but it had no command line, so releases were
// staged with throwaway scripts and hand-edited JSON. This file is that missing command line.
// It only calls the reviewed functions, derives every changed field from the files they
// produced, runs the reviewed checks before writing, and never overwrites a file.
//
//   release-artifacts.mjs source-manifest --repository <clean git clone> --root <release root> --role api|ui|runner --out <file>
//   release-artifacts.mjs build-env --release-key <key> [--models glm-only|multi-model|all-models]
//   release-artifacts.mjs ui-build --source <ui source manifest> --release-key <key> [--models glm-only|multi-model|all-models] --out <file>
//       (--models picks the website's public model list; default glm-only, the legacy GLM-only list)
//       (--release-key names the release the website is built for, r<site version>-<first 12 hex of the UI source's
//        revision>: side-by-side spec §1, §7; ui-build refuses a key of another revision)
//   release-artifacts.mjs verify --source <source manifest> [--ui-build <ui build manifest>]
//   release-artifacts.mjs operator-digest --source <source manifest>
//   release-artifacts.mjs launch-plan --service api|ui|runner --slot A|B --from <existing plan> --root <release root>
//       (--slot alone names the ports, --root alone names the env file <service>-<label>.env: side-by-side spec §6, §10)
//       (--service runner may name the API plan as --from: the runner's identity then comes from its OS account)
//       --source-manifest <file> [--ui-build <file>] --native-attestation <file> [--publication <publish output>] --out <file>
//   release-artifacts.mjs native-plan --operation apply-and-plan|plan|publish|verify --from <existing native plan>
//       --source-manifest <candidate api source manifest> [--proposal <plan output> --approved-delta-sha256 <owner's yes>]
//       [--publication <publish output>] [--checker glm|deepseek --deepseek-enabled-on-gate yes] --out <file>
//       [--role-rotation on|off] [--call-concurrency '<JSON object>'] [--debate-shape off|'<JSON object>'] [--question-language '<JSON object>']
//       [--length-guidance '<JSON object>']
//       [--hosted-billing '<JSON object>']
//       (--checker, --role-rotation, --call-concurrency and --hosted-billing only with --operation plan; publish carries the plan's choices;
//        defaults glm, on and the base's call-concurrency row kept as it is (or none); --role-rotation off publishes the rotation row disabled: the preview's rollback;
//        --call-concurrency '{"perDebate":12,"perModelPerDebate":3,"perModelPerRunner":{"default":50}}' publishes that row;
//        --hosted-billing '{"billing":"off","perRunCeilingMicros":…,"dailyCeilingMicros":…,"askRoomReads":{"limit":…,"windowMs":…,"capacity":…}}'
//        composes a HOSTED version with kit v3 (the owner's values); verify and apply-and-plan carry it from --from)
//       (--debate-shape only with --operation plan; publish carries the plan's choice; default: the base's debate shape
//        row kept as it is, or none; --debate-shape off publishes the row disabled: the preview's rollback)
//       (--question-language only with --operation plan; publish carries the plan's choice; default: the base's
//        question-language row kept as it is, or none (the code's start values); no off word: '"fastCheck": null' in the
//        policy switches the fast language check off)
//       (--length-guidance only with --operation plan; publish carries the plan's choice; default: the base's length-guidance row
//        kept as it is, or none)
//
// It reads only root-owned 0644 JSON files (so never an env file or a secret: those are 0640/0600)
// and writes only new root-owned 0644 compact JSON files below the fixed artifacts folder.
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { protectedPath, sha256, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { generateSourceManifest, operatorFiles, operatorManifestSha256, verifySourceManifest } from '../../preview-auth-dev/v1/source-manifest.mjs';
import { buildUiArtifact, verifyUiBuildManifest } from '../../preview-auth-dev/v1/ui-build.mjs';
import { PREVIEW_ENV_ROOT, PREVIEW_SLOTS, labelOfSourceRoot, parsePublicArtifactBytes, previewEnvironmentPath, validateLaunchPlan } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { validateNativeAttestation } from '../../preview-auth-dev/v1/native-attestation.mjs';
import { validatePublication } from '../../preview-auth-dev/v1/runtime-receipt.mjs';
import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY } from '../../preview-auth-dev/v1/turnstile-custody.mjs';
import { PREVIEW_MODEL_ROSTER_FLAGS, RELEASE_KEY_PATTERN } from '../../preview-auth-dev/v1/environment.mjs';
import { runBounded } from '../../preview-lifecycle/v1/common.mjs';

/** The fixed server folders the reviewed launchers already require (launch-plan.mjs: ROOT, the artifact file pattern, prepareLaunch's plan path). */
export const LAYOUT = Object.freeze({
  artifactsRoot: '/opt/debateai-v3-preview/artifacts',
  releasesRoot: '/opt/debateai-v3-preview/releases',
  // prestart.mjs writes here on every start; a release plan must never be written into it.
  currentDir: '/opt/debateai-v3-preview/artifacts/lifecycle-current',
  ownerUid: 0,
  ownerGid: 0
});

/** The reviewed public model lists, by stage name (environment.mjs PREVIEW_MODEL_ROSTER_FLAGS); glm-only is the default. */
export const UI_MODEL_ROSTERS = Object.freeze(Object.keys(PREVIEW_MODEL_ROSTER_FLAGS));
const DEFAULT_MODEL_ROSTER = 'glm-only';
/**
 * The RELEASE_KEY of the build-value template below. It is never a release key: every build and every build-env names
 * its own (`--release-key`), and a build given this text refuses (apps/ui/release-edge.mjs: RELEASE_KEY_INVALID).
 */
export const RELEASE_KEY_NOT_GIVEN = 'RELEASE_KEY_NOT_GIVEN';
const publicBuildValues = (flag, releaseKey) => Object.freeze({ NODE_ENV: 'production', PUBLIC_APP_URL: PREVIEW_ORIGIN, NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: flag, TURNSTILE_SITE_KEY: PREVIEW_SITE_KEY, RELEASE_KEY: releaseKey });
/**
 * Public values the website is BUILT with. Each one is the exact value the reviewed runtime gate
 * (environment.mjs narrowEnvironment, service ui) demands from ui.env, imported from the same
 * constants, so the build and the running site cannot disagree. Nothing here is read from ui.env.
 * The model list is one of the reviewed lists, picked by stage name (`--models`); the build records
 * which one (ui-build.mjs), and the UI launcher demands that ui.env names the same list.
 * RELEASE_KEY is the release the build is for (side-by-side spec §1, §7): the website bakes its code part in and
 * refuses to serve under another release's key; the UI launcher demands ui.env's key be the plan's.
 */
export function uiPublicBuildValues(releaseKey, models = DEFAULT_MODEL_ROSTER) {
  if (typeof models !== 'string' || !UI_MODEL_ROSTERS.includes(models)) refuse('ARGUMENTS_REFUSED', ['--models']);
  if (typeof releaseKey !== 'string' || !RELEASE_KEY_PATTERN.test(releaseKey)) refuse('RELEASE_KEY_REFUSED', ['--release-key']);
  return publicBuildValues(PREVIEW_MODEL_ROSTER_FLAGS[models], releaseKey);
}
/** The default (glm-only) public build values, with RELEASE_KEY_NOT_GIVEN where each build puts its own key. */
export const UI_PUBLIC_BUILD_VALUES = publicBuildValues(PREVIEW_MODEL_ROSTER_FLAGS[DEFAULT_MODEL_ROSTER], RELEASE_KEY_NOT_GIVEN);
/** The complete environment of the build child: the public values plus fixed tool settings. */
export const UI_BUILD_ENVIRONMENT = Object.freeze({
  PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', CI: 'true', NEXT_TELEMETRY_DISABLED: '1',
  ...UI_PUBLIC_BUILD_VALUES
});
/**
 * pnpm, next and the route check start `node` from PATH. Put the running Node's own folder first
 * (as prestart.mjs nativeVerifyArgv does), so the build runs on the Node the manifest records.
 */
export const buildEnvironment = (releaseKey, execPath = process.execPath, models = DEFAULT_MODEL_ROSTER) => ({ ...UI_BUILD_ENVIRONMENT, ...uiPublicBuildValues(releaseKey, models), PATH: `${dirname(execPath)}:${UI_BUILD_ENVIRONMENT.PATH}` });

const MAX_PUBLIC_ARTIFACT_BYTES = 16_777_216; // readPublicArtifact's bound
const MAX_PLAN_BYTES = 32_768; // prepareLaunch, prestart and native-operator read plans up to this size
const ROLES = ['api', 'ui', 'runner'];
const ACTOR_ENV = ['PATH', 'LANG', 'LC_ALL', 'TZ'];
const COMMANDS = Object.freeze({
  'source-manifest': { required: ['--repository', '--root', '--role', '--out'], optional: [] },
  'build-env': { required: ['--release-key'], optional: ['--models'] },
  'ui-build': { required: ['--source', '--release-key', '--out'], optional: ['--models'] },
  verify: { required: ['--source'], optional: ['--ui-build'] },
  'operator-digest': { required: ['--source'], optional: [] },
  'launch-plan': { required: ['--service', '--slot', '--from', '--root', '--source-manifest', '--native-attestation', '--out'], optional: ['--ui-build', '--publication'] },
  'native-plan': { required: ['--operation', '--from', '--source-manifest', '--out'], optional: ['--proposal', '--approved-delta-sha256', '--publication', '--checker', '--deepseek-enabled-on-gate', '--role-rotation', '--call-concurrency', '--debate-shape', '--question-language', '--length-guidance', '--hosted-billing'] }
});

export class Refusal extends Error {
  constructor(code, fields) { super(code); this.code = code; if (fields) this.fields = fields; }
}
const refuse = (code, fields) => { throw new Refusal(code, fields); };
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.endsWith('/') && !/[\0-\x1f\x7f]/.test(path);
const releasePattern = layout => new RegExp(`^${escape(layout.releasesRoot)}/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$`);
const artifactPattern = layout => new RegExp(`^${escape(layout.artifactsRoot)}/[a-z0-9-]+/[a-z0-9-]+\\.json$`);
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** Exactly one subcommand, then known `--flag value` pairs: unknown, repeated or missing flags refuse. */
export function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || !Object.hasOwn(COMMANDS, argv[0]) || (argv.length - 1) % 2 !== 0) refuse('ARGUMENTS_REFUSED');
  const spec = COMMANDS[argv[0]], allowed = [...spec.required, ...spec.optional], options = Object.create(null);
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!allowed.includes(flag) || flag in options || typeof value !== 'string' || !value || value.startsWith('-') || /[\0-\x1f\x7f]/.test(value)) refuse('ARGUMENTS_REFUSED', [flag]);
    options[flag] = value;
  }
  const missing = spec.required.filter(flag => !(flag in options));
  if (missing.length) refuse('ARGUMENTS_REFUSED', missing);
  return { command: argv[0], options };
}

/** Root on Linux with the measured Node, umask 022 and an emptied environment (env -i PATH=...). */
export function assertActor({ platform = process.platform, uid = process.getuid?.(), version = process.version, umask = process.umask(), env = process.env } = {}) {
  if (platform !== 'linux' || uid !== 0 || version !== 'v26.8.2' || umask !== 0o022 || Object.keys(env).some(key => !ACTOR_ENV.includes(key))) refuse('ACTOR_REFUSED');
}

/** A real, root-only directory: absolute, no link anywhere in its own name, owner + no group/other write. */
async function assertDirectory(path, layout, flag) {
  try {
    if (!absolute(path)) throw new Error('path');
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== layout.ownerUid || (stat.mode & 0o022) !== 0 || await realpath(path) !== path) throw new Error('dir');
  } catch { refuse('DIRECTORY_REFUSED', [flag]); }
}

/** Git, running as root, obeys the clone's own config (e.g. core.fsmonitor runs a program): it must be root-only too. */
async function assertRepository(path, layout) {
  await assertDirectory(path, layout, '--repository');
  try {
    for (const [name, directory] of [['.git', true], ['.git/config', false]]) {
      const stat = await lstat(join(path, name));
      if (stat.isSymbolicLink() || stat.isDirectory() !== directory || (!directory && !stat.isFile()) || stat.uid !== layout.ownerUid || (stat.mode & 0o022) !== 0) throw new Error(name);
    }
  } catch { refuse('DIRECTORY_REFUSED', ['--repository']); }
}

/**
 * Reads one root-owned 0644 JSON file through the reviewed custody reader (no-follow, single link,
 * bounded, root-owned non-writable parent). `kind` selects the reviewed public-inventory parser.
 */
async function readJson(path, { layout, flag, maxBytes, kind, artifact = true }) {
  if (!absolute(path) || !path.endsWith('.json') || (artifact && !artifactPattern(layout).test(path))) refuse('INPUT_PATH_REFUSED', [flag]);
  try {
    return await withPrivateBytes(path, { root: dirname(path), uid: layout.ownerUid, mode: 0o644, maxBytes },
      raw => ({ path, sha256: sha256(raw), value: kind === undefined ? strictJson(raw) : parsePublicArtifactBytes(raw, kind) }));
  } catch { return refuse('INPUT_REFUSED', [flag]); }
}

/** A source manifest the launchers would accept: root-owned, known role, a release root, git ids. */
async function readSource(path, { layout, flag }) {
  const file = await readJson(path, { layout, flag, maxBytes: MAX_PUBLIC_ARTIFACT_BYTES, kind: 'source' });
  const value = file.value;
  if (value.uid !== layout.ownerUid || !ROLES.includes(value.role) || !releasePattern(layout).test(value.sourceRoot ?? '')
    || !/^[a-f0-9]{40}$/.test(value.sourceRevision ?? '') || !/^[a-f0-9]{40}$/.test(value.sourceTree ?? '') || !Array.isArray(value.files)) refuse('SOURCE_MANIFEST_REFUSED', [flag]);
  return file;
}
/** What verifySourceManifest must find: the manifest's own binding plus the exact bytes on disk. */
const sourceBinding = file => ({ sourceRevision: file.value.sourceRevision, sourceTree: file.value.sourceTree, sourceRoot: file.value.sourceRoot, role: file.value.role, manifestSha256: file.sha256 });

/** Checked before any long work (and again by writeArtifact): the shape, the folders, and that nothing is there yet. */
export async function assertOutputFree(path, { layout = LAYOUT, name } = {}) {
  if (!absolute(path) || !artifactPattern(layout).test(path) || dirname(path) === layout.currentDir || (name !== undefined && !path.endsWith(`/${name}`))) refuse('OUTPUT_PATH_REFUSED');
  try { await protectedPath(path, { root: layout.artifactsRoot, uid: layout.ownerUid }); } catch { refuse('OUTPUT_PATH_REFUSED'); }
  const present = await lstat(path).then(() => true, error => (error?.code === 'ENOENT' ? false : refuse('OUTPUT_PATH_REFUSED')));
  if (present) refuse('OUTPUT_EXISTS');
}

/**
 * Compact JSON, no trailing newline, created with O_EXCL|O_NOFOLLOW (never replaces anything),
 * root:root 0644, fsynced, then read back through the reviewed custody reader.
 */
export async function writeArtifact(path, value, { layout = LAYOUT, maxBytes = MAX_PUBLIC_ARTIFACT_BYTES, name } = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length < 1 || bytes.length > maxBytes) refuse('OUTPUT_TOO_LARGE');
  if (!absolute(path) || !artifactPattern(layout).test(path) || dirname(path) === layout.currentDir || (name !== undefined && !path.endsWith(`/${name}`))) refuse('OUTPUT_PATH_REFUSED');
  try { await protectedPath(path, { root: layout.artifactsRoot, uid: layout.ownerUid }); } catch { refuse('OUTPUT_PATH_REFUSED'); }
  let handle, written = false;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  } catch (error) { refuse(error?.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_PATH_REFUSED'); }
  try {
    await handle.chown(layout.ownerUid, layout.ownerGid);
    await handle.chmod(0o644);
    for (let offset = 0; offset < bytes.length;) offset += (await handle.write(bytes, offset)).bytesWritten;
    await handle.sync();
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== layout.ownerUid || stat.gid !== layout.ownerGid || (stat.mode & 0o7777) !== 0o644 || stat.nlink !== 1 || stat.size !== bytes.length) throw new Error('stat');
    await handle.close(); handle = undefined;
    const folder = await open(dirname(path), constants.O_RDONLY);
    try { await folder.sync(); } catch { /* Some platforms refuse fsync on a directory. */ } finally { await folder.close(); }
    written = true;
  } catch { /* handled below */ }
  const digest = sha256(bytes);
  const readBack = written ? await withPrivateBytes(path, { root: dirname(path), uid: layout.ownerUid, gid: layout.ownerGid, mode: 0o644, maxBytes: bytes.length }, raw => sha256(raw)).catch(() => null) : null;
  if (readBack !== digest) {
    await handle?.close().catch(() => undefined);
    // This process created the file a moment ago (O_EXCL) in a root-only folder: remove the bad copy.
    await unlink(path).catch(() => undefined);
    refuse(written ? 'OUTPUT_READBACK_REFUSED' : 'OUTPUT_WRITE_REFUSED');
  }
  return { path, sha256: digest, bytes: bytes.length };
}

async function sourceManifestCommand(options, { layout, deps }) {
  const role = options['--role'], root = options['--root'], repository = options['--repository'];
  if (!ROLES.includes(role)) refuse('ARGUMENTS_REFUSED', ['--role']);
  if (!releasePattern(layout).test(root)) refuse('RELEASE_ROOT_REFUSED');
  await assertRepository(repository, layout);
  await assertDirectory(root, layout, '--root');
  if (repository === root || repository.startsWith(`${root}/`) || root.startsWith(`${repository}/`)) refuse('RELEASE_ROOT_REFUSED');
  await assertOutputFree(options['--out'], { layout });
  const manifest = await (deps.generateSourceManifest ?? generateSourceManifest)({ repositoryRoot: repository, sourceRoot: root, role, uid: layout.ownerUid });
  if (manifest?.sourceRoot !== root || manifest.role !== role || manifest.uid !== layout.ownerUid) refuse('SOURCE_MANIFEST_REFUSED');
  return writeArtifact(options['--out'], manifest, { layout });
}

/** The public build values (for one reviewed model list and one release key) and their sha256, for comparing with ui.env without printing it. */
export function buildEnvironmentReport(releaseKey, models = DEFAULT_MODEL_ROSTER) {
  return { schema: 'preview-release-ui-build-values-v1', values: Object.fromEntries(Object.entries(uiPublicBuildValues(releaseKey, models)).map(([key, value]) => [key, { value, sha256: sha256(value) }])) };
}

async function uiBuildCommand(options, { layout, deps }) {
  const models = options['--models'] ?? DEFAULT_MODEL_ROSTER, releaseKey = options['--release-key'];
  uiPublicBuildValues(releaseKey, models);
  const source = await readSource(options['--source'], { layout, flag: '--source' });
  if (source.value.role !== 'ui') refuse('SOURCE_ROLE_REFUSED');
  // Side-by-side spec §1, §7: the build bakes the key's code part in, so it must be this source's revision.
  if (releaseKey.slice(releaseKey.indexOf('-') + 1) !== source.value.sourceRevision.slice(0, 12)) refuse('RELEASE_KEY_REFUSED', ['--release-key']);
  await assertOutputFree(options['--out'], { layout });
  // A fresh build only: a folder that already has a build may be the one the live site serves.
  const buildRoot = join(source.value.sourceRoot, 'dialectical-engine/apps/ui/.next');
  if (await lstat(buildRoot).then(() => true, error => (error?.code === 'ENOENT' ? false : refuse('UI_BUILD_EXISTS')))) refuse('UI_BUILD_EXISTS');
  const verifySource = deps.verifySourceManifest ?? verifySourceManifest;
  // Before: the root is exactly what the manifest inventoried. After: the build changed none of it.
  await verifySource(source.value, sourceBinding(source));
  const build = await (deps.buildUiArtifact ?? buildUiArtifact)(source.value, buildEnvironment(releaseKey, deps.execPath, models));
  await verifySource(source.value, sourceBinding(source));
  await (deps.verifyUiBuildManifest ?? verifyUiBuildManifest)(JSON.parse(JSON.stringify(build)), source.value);
  return writeArtifact(options['--out'], build, { layout });
}

async function verifyCommand(options, { layout, deps }) {
  const source = await readSource(options['--source'], { layout, flag: '--source' });
  await (deps.verifySourceManifest ?? verifySourceManifest)(source.value, sourceBinding(source));
  let uiBuild = null;
  if (options['--ui-build'] !== undefined) {
    if (source.value.role !== 'ui') refuse('SOURCE_ROLE_REFUSED');
    const build = await readJson(options['--ui-build'], { layout, flag: '--ui-build', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES, kind: 'ui-build' });
    await (deps.verifyUiBuildManifest ?? verifyUiBuildManifest)(build.value, source.value);
    uiBuild = { path: build.path, sha256: build.sha256 };
  }
  const { sourceRevision, sourceTree, sourceRoot, role } = source.value;
  return { event: 'PREVIEW_RELEASE_VERIFIED', role, sourceRoot, sourceRevision, sourceTree, source: { path: source.path, sha256: source.sha256 }, uiBuild };
}

async function operatorDigestCommand(options, { layout }) {
  const source = await readSource(options['--source'], { layout, flag: '--source' });
  return { operatorManifestSha256: operatorManifestSha256(source.value), operatorFileCount: operatorFiles(source.value).length, role: source.value.role, sourceRevision: source.value.sourceRevision, source: { path: source.path, sha256: source.sha256 } };
}

/** The runner's OS account; its passwd entry is the only source of the runner plan's UID/GID. */
export const RUNNER_OS_ACCOUNT = 'debateai-preview-runner';
const NO_LOGIN_SHELLS = ['/usr/sbin/nologin', '/sbin/nologin', '/bin/false', '/usr/bin/false'];
const accountId = value => (/^[0-9]{1,10}$/.test(value ?? '') ? Number(value) : NaN);
/**
 * `getent passwd` and `getent group` lines for the runner account (getpwnam/getgrnam through NSS):
 * exactly that name, a real uid and primary gid that are neither root's (0) nor nobody's (65534),
 * a group of the same name with that same gid, and a shell nobody can log in with.
 */
export function parseRunnerAccount(passwdText, groupText) {
  const one = text => { const lines = String(text).split('\n').filter(Boolean); return lines.length === 1 ? lines[0].split(':') : []; };
  const [name, , uidText, gidText, , , shell, ...restPasswd] = one(passwdText);
  const [groupName, , groupGidText, , ...restGroup] = one(groupText);
  const uid = accountId(uidText), gid = accountId(gidText);
  if (name !== RUNNER_OS_ACCOUNT || restPasswd.length || shell === undefined || groupName !== RUNNER_OS_ACCOUNT || restGroup.length
    || !(uid >= 1 && uid < 4294967295) || !(gid >= 1 && gid < 4294967295) || uid === 65534 || gid === 65534
    || accountId(groupGidText) !== gid || !NO_LOGIN_SHELLS.includes(shell)) refuse('RUNNER_ACCOUNT_REFUSED');
  return { uid, gid };
}
export async function lookupRunnerAccount({ run = runBounded, getent = '/usr/bin/getent' } = {}) {
  const ask = async database => {
    const result = await run([getent, database, RUNNER_OS_ACCOUNT], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
    if (result.timedOut || result.overflow || result.error || result.stderr?.length) refuse('RUNNER_ACCOUNT_REFUSED');
    if (result.code === 2) refuse('RUNNER_ACCOUNT_MISSING');
    if (result.code !== 0) refuse('RUNNER_ACCOUNT_REFUSED');
    return result.stdout.toString('utf8');
  };
  return parseRunnerAccount(await ask('passwd'), await ask('group'));
}

async function launchPlanCommand(options, { layout, deps }) {
  const service = options['--service'], root = options['--root'];
  const validatePlan = deps.validateLaunchPlan ?? validateLaunchPlan;
  if (!ROLES.includes(service)) refuse('ARGUMENTS_REFUSED', ['--service']);
  // Side-by-side spec §6: the slot alone names the ports (the reviewed table, never --from's).
  const ports = Object.hasOwn(PREVIEW_SLOTS, options['--slot']) ? PREVIEW_SLOTS[options['--slot']] : refuse('ARGUMENTS_REFUSED', ['--slot']);
  const kind = releasePattern(layout).exec(root)?.[1] ?? refuse('RELEASE_ROOT_REFUSED');
  // Side-by-side spec §10: the root ends in its service and carries the release label, which names its env file.
  let label;
  try { label = labelOfSourceRoot(root, service); } catch { refuse('RELEASE_ROOT_REFUSED'); }
  await assertOutputFree(options['--out'], { layout, name: `${service}-launch.json` });
  const from = await readJson(options['--from'], { layout, flag: '--from', maxBytes: MAX_PLAN_BYTES, artifact: false });
  // --from is checked by the reviewed rules with its env path set to its own release's file: that field is never copied
  // (this command derives it from --root), and a plan written before side-by-side (R19: /etc/…/api.env) still names a
  // valid base. Every other field must pass as it stands (side-by-side spec §10, the transition).
  try {
    const fromPath = previewEnvironmentPath(from.value.service, labelOfSourceRoot(from.value.sourceRoot, from.value.service));
    validatePlan({ ...from.value, environment: { ...from.value.environment, path: fromPath } });
  } catch { refuse('FROM_PLAN_INVALID'); }
  // The first runner plan has no runner plan to copy: it is derived from the API plan (below).
  const derivedRunner = service === 'runner' && from.value.service === 'api';
  if (from.value.service !== service && !derivedRunner) refuse('FROM_PLAN_INVALID');
  const source = await readSource(options['--source-manifest'], { layout, flag: '--source-manifest' });
  if (source.value.role !== service || source.value.sourceRoot !== root) refuse('SOURCE_MANIFEST_MISMATCH');
  let uiBuild = null, build = null;
  if ((service === 'ui') !== (options['--ui-build'] !== undefined)) refuse('ARGUMENTS_REFUSED', ['--ui-build']);
  if (service === 'ui') {
    build = await readJson(options['--ui-build'], { layout, flag: '--ui-build', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES, kind: 'ui-build' });
    if (!['sourceRoot', 'sourceRevision', 'sourceTree', 'contractSha256'].every(key => build.value[key] === source.value[key])) refuse('UI_BUILD_MISMATCH');
    uiBuild = { path: build.path, sha256: build.sha256 };
  }
  // A new register publication (after native-plan publish) replaces the old plan's; otherwise it is carried over.
  const publication = options['--publication'] === undefined ? from.value.publication
    : (await readPublishedPublication(options['--publication'], { layout })).publication;
  const native = await readJson(options['--native-attestation'], { layout, flag: '--native-attestation', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES });
  // The base plan's proof only has to be the right proof: prestart replaces it with a fresh one on
  // every start, and the launcher checks its age. So check the binding at the proof's own time.
  try {
    validateNativeAttestation(native.value, { sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree, nativeSourceSha256: source.value.nativeSha256, publication }, Date.parse(native.value?.verifiedAt));
  } catch { refuse('NATIVE_ATTESTATION_MISMATCH'); }
  const envPath = previewEnvironmentPath(service, label);
  let { serviceUid, serviceGid } = from.value, environment = { ...from.value.environment, path: envPath };
  if (derivedRunner) {
    ({ uid: serviceUid, gid: serviceGid } = await (deps.lookupRunnerAccount ?? lookupRunnerAccount)());
    environment = { path: envPath, root: PREVIEW_ENV_ROOT, uid: 0, gid: serviceGid, mode: 0o640, parentUid: 0 };
  }
  const plan = {
    schema: from.value.schema, service, artifact: kind, sourceRoot: root, sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree,
    serviceUid, serviceGid,
    sourceManifest: { path: source.path, sha256: source.sha256 }, nativeAttestation: { path: native.path, sha256: native.sha256 }, uiBuild,
    publication, operatorManifestSha256: operatorManifestSha256(source.value), environment,
    apiPort: ports.apiPort, uiPort: ports.uiPort, mailExecutable: join(root, 'dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs'), mailFrom: from.value.mailFrom
  };
  try { validatePlan(plan); } catch { refuse('LAUNCH_PLAN_INVALID'); }
  // Last and slowest: the release folder still matches its manifests byte for byte (as the launcher will check).
  await (deps.verifySourceManifest ?? verifySourceManifest)(source.value, sourceBinding(source));
  if (build) await (deps.verifyUiBuildManifest ?? verifyUiBuildManifest)(build.value, source.value);
  return writeArtifact(options['--out'], plan, { layout, maxBytes: MAX_PLAN_BYTES, name: `${service}-launch.json` });
}

const HEX64 = /^[a-f0-9]{64}$/;
const GIT40 = /^[a-f0-9]{40}$/;
const PROPOSAL_KEYS = ['schema', 'composer', 'runtimeObservedAt', 'sourceRevision', 'sourceTree', 'operatorManifestSha256', 'baseRegisterVersion', 'baseSnapshotSha256',
  'snapshotSha256', 'deltaSha256', 'rowCount', 'rowKeys', 'addedKeys', 'changedKeys', 'delta'];
const DELTA_KEYS = ['rowKey', 'change', 'reason', 'oldValueJsonText', 'newValueJsonText', 'oldSourceRef', 'newSourceRef', 'oldValueSha256', 'newValueSha256', 'oldSourceRefSha256', 'newSourceRefSha256'];
const sameKeySet = (value, keys) => plainObject(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * The snapshot proposal the native operator printed for `plan` (schema v2), checked against the
 * plan that produced it. Every hash it shows is recomputed here from the values it shows, so the
 * delta the owner read is exactly the delta `deltaSha256` names. Returns the publish approval.
 */
export function proposalApproval(proposal, plan) {
  const bad = () => refuse('PROPOSAL_REFUSED');
  // A plan with the owner's hosted-billing inputs was composed by kit v3; every other plan by kit v2 (native-operator.mjs).
  const composer = Object.hasOwn(plan, 'hostedBilling') ? 'preview-register-composer-v3' : 'preview-register-composer-v2';
  if (!sameKeySet(proposal, PROPOSAL_KEYS) || proposal.schema !== 'preview-auth-dev-snapshot-proposal-v2' || proposal.composer !== composer) bad();
  if (proposal.sourceRevision !== plan.sourceRevision || proposal.sourceTree !== plan.sourceTree || proposal.operatorManifestSha256 !== plan.operatorManifestSha256
    || proposal.baseRegisterVersion !== plan.selectedBaseRegisterVersion || proposal.baseSnapshotSha256 !== plan.selectedBaseSnapshotSha256) refuse('PROPOSAL_MISMATCH');
  if (!GIT40.test(proposal.sourceRevision) || !GIT40.test(proposal.sourceTree) || ![proposal.baseSnapshotSha256, proposal.snapshotSha256, proposal.deltaSha256].every(value => HEX64.test(value ?? ''))
    || typeof proposal.runtimeObservedAt !== 'string' || !Number.isFinite(Date.parse(proposal.runtimeObservedAt))
    || new Date(proposal.runtimeObservedAt).toISOString() !== proposal.runtimeObservedAt) bad();
  const { rowKeys, delta } = proposal;
  if (!Array.isArray(rowKeys) || rowKeys.length < 1 || rowKeys.length !== proposal.rowCount || rowKeys.some(key => typeof key !== 'string' || !key)
    || new Set(rowKeys).size !== rowKeys.length || !Array.isArray(delta)) bad();
  const seen = new Set();
  for (const entry of delta) {
    if (!sameKeySet(entry, DELTA_KEYS) || typeof entry.rowKey !== 'string' || !rowKeys.includes(entry.rowKey) || seen.has(entry.rowKey)
      || !['added', 'changed'].includes(entry.change) || typeof entry.reason !== 'string'
      || typeof entry.newValueJsonText !== 'string' || typeof entry.newSourceRef !== 'string'
      || entry.newValueSha256 !== sha256(entry.newValueJsonText) || entry.newSourceRefSha256 !== sha256(entry.newSourceRef)) bad();
    seen.add(entry.rowKey);
    if (entry.change === 'added') {
      if (entry.oldValueJsonText !== null || entry.oldSourceRef !== null || entry.oldValueSha256 !== null || entry.oldSourceRefSha256 !== null) bad();
    } else if (typeof entry.oldValueJsonText !== 'string' || typeof entry.oldSourceRef !== 'string'
      || entry.oldValueSha256 !== sha256(entry.oldValueJsonText) || entry.oldSourceRefSha256 !== sha256(entry.oldSourceRef)
      || (entry.oldValueJsonText === entry.newValueJsonText && entry.oldSourceRef === entry.newSourceRef)) bad();
  }
  if (!sameList(proposal.addedKeys, delta.filter(entry => entry.change === 'added').map(entry => entry.rowKey))
    || !sameList(proposal.changedKeys, delta.filter(entry => entry.change === 'changed').map(entry => entry.rowKey))
    || sha256(JSON.stringify(delta)) !== proposal.deltaSha256) bad();
  // The runtime time is the one measured into nodeRuntimeVersion's source reference (publish-register-v2.ts buildPreviewSourceRowsV2):
  // a time edited after review would refuse only at the operator, mid-downtime; refuse it here.
  const runtimeEntry = delta.find(entry => entry.rowKey === 'nodeRuntimeVersion');
  if (runtimeEntry && !runtimeEntry.newSourceRef.includes(`; measured ${proposal.runtimeObservedAt}; source ${proposal.sourceRevision}/${proposal.sourceTree}; operator sha256:${proposal.operatorManifestSha256}`)) bad();
  return {
    runtimeObservedAt: proposal.runtimeObservedAt, baseRegisterVersion: proposal.baseRegisterVersion, baseSnapshotSha256: proposal.baseSnapshotSha256,
    snapshotSha256: proposal.snapshotSha256, deltaSha256: proposal.deltaSha256
  };
}

/** The receipt a native-operator `publish` printed (a native attestation whose `publication` is the new version). */
async function readPublishedPublication(path, { layout }) {
  const file = await readJson(path, { layout, flag: '--publication', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES });
  const value = file.value;
  try {
    validateNativeAttestation(value, { sourceRevision: value?.sourceRevision, sourceTree: value?.sourceTree, nativeSourceSha256: value?.nativeSourceSha256, publication: value?.publication }, Date.parse(value?.verifiedAt));
  } catch { refuse('PUBLICATION_REFUSED'); }
  return { path: file.path, sha256: file.sha256, sourceRevision: value.sourceRevision, sourceTree: value.sourceTree, publication: value.publication };
}

async function nativePlanCommand(options, { layout, deps }) {
  const operation = options['--operation'];
  if (!['apply-and-plan', 'plan', 'publish', 'verify'].includes(operation)) refuse('ARGUMENTS_REFUSED', ['--operation']);
  if ((operation === 'publish') !== (options['--proposal'] !== undefined)) refuse('ARGUMENTS_REFUSED', ['--proposal']);
  // The owner's yes names the delta they read; a re-run plan (new runtime time, new hash) needs a new yes.
  if ((operation === 'publish') !== (options['--approved-delta-sha256'] !== undefined) || (operation === 'publish' && !HEX64.test(options['--approved-delta-sha256']))) refuse('ARGUMENTS_REFUSED', ['--approved-delta-sha256']);
  if (options['--publication'] !== undefined && operation !== 'verify') refuse('ARGUMENTS_REFUSED', ['--publication']);
  // The register's checker stays GLM unless the operator chooses DeepSeek for a new `plan` AND states that
  // the gate's GO switches DeepSeek on (publish-register-v2.ts previewCheckerRoleRef checks it again).
  const checker = options['--checker'], acknowledged = options['--deepseek-enabled-on-gate'];
  if (checker !== undefined && !['glm', 'deepseek'].includes(checker)) refuse('ARGUMENTS_REFUSED', ['--checker']);
  if ((checker !== undefined || acknowledged !== undefined) && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--checker']);
  if (checker === 'deepseek' && acknowledged !== 'yes') refuse('CHECKER_DEEPSEEK_NOT_ENABLED_ON_GATE');
  if (acknowledged !== undefined && checker !== 'deepseek') refuse('ARGUMENTS_REFUSED', ['--deepseek-enabled-on-gate']);
  // Role rotation stays on unless the operator says off for a new `plan` (publish-register-v2.ts checks it again).
  const roleRotation = options['--role-rotation'];
  if (roleRotation !== undefined && (!['on', 'off'].includes(roleRotation) || operation !== 'plan')) refuse('ARGUMENTS_REFUSED', ['--role-rotation']);
  // The call-concurrency row changes only when the operator gives the policy for a new `plan`, as one JSON object
  // (native-operator.mjs validateCallConcurrencyChoice below, and publish-register-v2.ts checks it again);
  // without it the kit keeps the base version's row unchanged, or builds none if the base has none (R19).
  const concurrencyText = options['--call-concurrency'];
  if (concurrencyText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--call-concurrency']);
  let concurrencyValue;
  if (concurrencyText !== undefined) try { concurrencyValue = strictJson(Buffer.from(concurrencyText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--call-concurrency']); }
  // Debate shape (P2b Task 6): changes only when the operator gives it for a new `plan`, as the word off or one JSON
  // object (native-operator.mjs validateDebateShapeChoice below; either kit, v2 or v3, runs the register's parser
  // through publish-register-v2.ts's builder); without it the kit keeps the base version's row unchanged, or builds
  // none if the base has none (R19).
  const shapeText = options['--debate-shape'];
  if (shapeText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--debate-shape']);
  let shapeValue;
  if (shapeText === 'off') shapeValue = 'off';
  else if (shapeText !== undefined) try { shapeValue = strictJson(Buffer.from(shapeText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--debate-shape']); }
  // Question language (P2L Task 12): the same plumbing, one JSON object only (no off word: the policy's
  // "fastCheck": null switches the fast check off); native-operator.mjs validateQuestionLanguageChoice below, and the
  // register's own parser in either kit before any row is built.
  const languageText = options['--question-language'];
  if (languageText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--question-language']);
  let languageValue;
  if (languageText !== undefined) try { languageValue = strictJson(Buffer.from(languageText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--question-language']); }
  // Length guidance (LG-C): the same plumbing, one JSON object only (a version without the row is the rollback);
  // native-operator.mjs validateLengthGuidanceChoice below, and the register's own parser in either kit.
  const lengthText = options['--length-guidance'];
  if (lengthText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--length-guidance']);
  let lengthValue;
  if (lengthText !== undefined) try { lengthValue = strictJson(Buffer.from(lengthText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--length-guidance']); }
  // The hosted preview (owner rulings 2026-10-13): the owner's billing switch, ceilings and room-read budget, as one JSON
  // object, for a new `plan` only (native-operator.mjs validateHostedBillingChoice below; publish-register-v3.ts checks it again).
  const hostedText = options['--hosted-billing'];
  if (hostedText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--hosted-billing']);
  let hostedValue;
  if (hostedText !== undefined) try { hostedValue = strictJson(Buffer.from(hostedText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--hosted-billing']); }
  await assertOutputFree(options['--out'], { layout });
  // Lazy: native-operator.mjs loads tsx and pg, which exist only in an installed release root.
  const nativeOperator = () => import('../../preview-auth-dev/v1/native-operator.mjs');
  const validateNativePlan = deps.validateNativePlan ?? (await nativeOperator()).validateNativePlan;
  let concurrencyChoice;
  if (concurrencyText !== undefined) {
    const check = deps.validateCallConcurrencyChoice ?? (await nativeOperator()).validateCallConcurrencyChoice;
    try { concurrencyChoice = check(concurrencyValue); } catch { refuse('ARGUMENTS_REFUSED', ['--call-concurrency']); }
  }
  let shapeChoice;
  if (shapeText !== undefined) {
    const check = deps.validateDebateShapeChoice ?? (await nativeOperator()).validateDebateShapeChoice;
    try { shapeChoice = check(shapeValue); } catch { refuse('ARGUMENTS_REFUSED', ['--debate-shape']); }
  }
  let languageChoice;
  if (languageText !== undefined) {
    const check = deps.validateQuestionLanguageChoice ?? (await nativeOperator()).validateQuestionLanguageChoice;
    try { languageChoice = check(languageValue); } catch { refuse('ARGUMENTS_REFUSED', ['--question-language']); }
  }
  let lengthChoice;
  if (lengthText !== undefined) {
    const check = deps.validateLengthGuidanceChoice ?? (await nativeOperator()).validateLengthGuidanceChoice;
    try { lengthChoice = check(lengthValue); } catch { refuse('ARGUMENTS_REFUSED', ['--length-guidance']); }
  }
  let hostedChoice;
  if (hostedText !== undefined) {
    const check = deps.validateHostedBillingChoice ?? (await nativeOperator()).validateHostedBillingChoice;
    try { hostedChoice = check(hostedValue); } catch { refuse('ARGUMENTS_REFUSED', ['--hosted-billing']); }
  }
  const from = await readJson(options['--from'], { layout, flag: '--from', maxBytes: MAX_PLAN_BYTES, artifact: false });
  try { validateNativePlan(from.value); } catch { refuse('FROM_PLAN_INVALID'); }
  const source = await readSource(options['--source-manifest'], { layout, flag: '--source-manifest' });
  if (source.value.role !== 'api') refuse('SOURCE_ROLE_REFUSED');
  // The native operator, prestart and pin accept only a candidate root (native-operator.mjs, prestart.mjs checkNativePlan).
  if (releasePattern(layout).exec(source.value.sourceRoot)?.[1] !== 'candidate') refuse('NATIVE_ROOT_NOT_CANDIDATE');
  const operatorDigest = operatorManifestSha256(source.value);
  let approval = null, publicationId = from.value.publicationId;
  let selectedBaseRegisterVersion = from.value.selectedBaseRegisterVersion, selectedBaseSnapshotSha256 = from.value.selectedBaseSnapshotSha256;
  if (operation === 'plan') {
    // Publish kit v2 composes from the CURRENT published version: the publication the live verify
    // plan (and so every pinned launch plan) runs on. Derived, never typed.
    if (from.value.operation !== 'verify') refuse('FROM_PLAN_INVALID');
    // A live version composed by kit v3 (hosted) can only be the base of another v3 plan: kit v2 refuses billing on.
    if (Object.hasOwn(from.value, 'hostedBilling') && hostedChoice === undefined) refuse('HOSTED_BILLING_REQUIRED');
    const live = from.value.approval?.publication;
    try { validatePublication(live); } catch { refuse('NATIVE_APPROVAL_REQUIRED'); }
    selectedBaseRegisterVersion = live.registerVersion;
    selectedBaseSnapshotSha256 = live.snapshotSha256;
  } else if (operation === 'publish') {
    // The plan that printed the proposal, for this very release; the approval is copied from the
    // checked proposal and the publication gets a fresh id (a re-run of this plan replays it).
    if (from.value.operation !== 'plan' || from.value.approval !== null) refuse('FROM_PLAN_INVALID');
    if (from.value.sourceRoot !== source.value.sourceRoot || from.value.sourceRevision !== source.value.sourceRevision || from.value.sourceTree !== source.value.sourceTree
      || from.value.sourceManifest?.sha256 !== source.sha256 || from.value.operatorManifestSha256 !== operatorDigest) refuse('PROPOSAL_MISMATCH');
    const proposal = await readJson(options['--proposal'], { layout, flag: '--proposal', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES });
    approval = proposalApproval(proposal.value, from.value);
    if (approval.deltaSha256 !== options['--approved-delta-sha256']) refuse('PROPOSAL_NOT_APPROVED');
    publicationId = (deps.randomUUID ?? randomUUID)();
  } else if (operation === 'verify' && options['--publication'] !== undefined) {
    // After a publish: verify the publication that plan wrote (and only that one).
    if (from.value.operation !== 'publish' || !plainObject(from.value.approval)) refuse('FROM_PLAN_INVALID');
    const published = await readPublishedPublication(options['--publication'], { layout });
    const { publication } = published;
    if (published.sourceRevision !== from.value.sourceRevision || published.sourceTree !== from.value.sourceTree
      || publication.publicationId !== from.value.publicationId || publication.baseRegisterVersion !== from.value.selectedBaseRegisterVersion
      || publication.snapshotSha256 !== from.value.approval.snapshotSha256) refuse('PUBLICATION_MISMATCH');
    const { runtimeObservedAt, baseRegisterVersion, baseSnapshotSha256, snapshotSha256, deltaSha256 } = from.value.approval;
    approval = { runtimeObservedAt, baseRegisterVersion, baseSnapshotSha256, snapshotSha256, deltaSha256, publication };
  } else if (operation === 'verify') {
    // verify uses approval.runtimeObservedAt (a string) and approval.publication (the live receipt,
    // which pin compares with the launch plans). Carried over unchanged from --from.
    approval = from.value.approval;
    if (!plainObject(approval) || typeof approval.runtimeObservedAt !== 'string') refuse('NATIVE_APPROVAL_REQUIRED');
    try { validatePublication(approval.publication); } catch { refuse('NATIVE_APPROVAL_REQUIRED'); }
  }
  // publish recomposes the snapshot the owner approved, so it carries the plan's checker choice unchanged.
  const checkerChoice = operation === 'plan' ? (checker === 'deepseek' ? { checker: 'deepseek', deepseekEnabledOnGate: true } : undefined)
    : operation === 'publish' ? from.value.checkerChoice : undefined;
  // The same for the rotation switch: only 'off' is carried ('on' is the default, no field).
  const rotationChoice = operation === 'plan' ? (roleRotation === 'off' ? 'off' : undefined)
    : operation === 'publish' ? from.value.roleRotation : undefined;
  // The same for the call-concurrency policy: present only when the plan's operator gave one.
  const callConcurrency = operation === 'plan' ? concurrencyChoice
    : operation === 'publish' ? from.value.callConcurrency : undefined;
  // The same for the debate shape choice (P2b Task 6): the word off or the policy object the plan's operator gave.
  const debateShape = operation === 'plan' ? shapeChoice : operation === 'publish' ? from.value.debateShape : undefined;
  // The same for the question-language policy (P2L Task 12): the policy object the plan's operator gave.
  const questionLanguage = operation === 'plan' ? languageChoice : operation === 'publish' ? from.value.questionLanguage : undefined;
  // The same for the length-guidance policy (LG-C): the policy object the plan's operator gave.
  const lengthGuidance = operation === 'plan' ? lengthChoice : operation === 'publish' ? from.value.lengthGuidance : undefined;
  // The hosted inputs: a new plan's own; every other operation carries the --from plan's, so publish recomposes the
  // approved snapshot and verify and apply-and-plan compose from a hosted base with kit v3.
  const hostedBilling = operation === 'plan' ? hostedChoice : from.value.hostedBilling;
  const plan = {
    schema: from.value.schema, operation, sourceRoot: source.value.sourceRoot, sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree,
    sourceManifest: { path: source.path, sha256: source.sha256 }, operatorManifestSha256: operatorDigest,
    selectedBaseRegisterVersion, selectedBaseSnapshotSha256, publicationId, approval,
    ...(checkerChoice === undefined ? {} : { checkerChoice }),
    ...(rotationChoice === undefined ? {} : { roleRotation: rotationChoice }),
    ...(callConcurrency === undefined ? {} : { callConcurrency }),
    ...(debateShape === undefined ? {} : { debateShape }),
    ...(questionLanguage === undefined ? {} : { questionLanguage }),
    ...(lengthGuidance === undefined ? {} : { lengthGuidance }),
    ...(hostedBilling === undefined ? {} : { hostedBilling })
  };
  try { validateNativePlan(plan); } catch { refuse('NATIVE_PLAN_INVALID'); }
  await (deps.verifySourceManifest ?? verifySourceManifest)(source.value, sourceBinding(source));
  const written = await writeArtifact(options['--out'], plan, { layout, maxBytes: MAX_PLAN_BYTES });
  // For publish, echo what the owner approved so it can be compared with the reviewed proposal.
  return operation === 'publish' ? { ...written, publicationId, approval } : written;
}

/** Parse, then run one subcommand. `layout`/`deps` exist for the unit tests' throwaway roots. */
export async function runCommand(argv, { layout = LAYOUT, deps = {} } = {}) {
  const { command, options } = parseArguments(argv);
  const context = { layout, deps };
  switch (command) {
    case 'source-manifest': return sourceManifestCommand(options, context);
    case 'build-env': return buildEnvironmentReport(options['--release-key'], options['--models']);
    case 'ui-build': return uiBuildCommand(options, context);
    case 'verify': return verifyCommand(options, context);
    case 'operator-digest': return operatorDigestCommand(options, context);
    case 'launch-plan': return launchPlanCommand(options, context);
    default: return nativePlanCommand(options, context);
  }
}

/** A stable reason code only: reviewed refusals carry their code as the message; nothing else is echoed. */
export function reasonOf(error) {
  if (error instanceof Refusal) return error.code;
  return typeof error?.message === 'string' && /^PREVIEW_[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'UNEXPECTED';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertActor();
    process.stdout.write(`${JSON.stringify(await runCommand(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: 'PREVIEW_RELEASE_REFUSED', reason: reasonOf(error), ...(error?.fields ? { fields: error.fields } : {}) })}\n`);
    process.exitCode = 1;
  }
}
