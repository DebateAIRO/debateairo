// Root-only release staging tool for the v3 preview (Linux, Node v26.8.2).
//
// Plain words: the reviewed preview operator (deploy/preview-auth-dev/v1) knows how to hash a
// release, build its website and check every plan, but it had no command line, so releases were
// staged with throwaway scripts and hand-edited JSON. This file is that missing command line.
// It only calls the reviewed functions, derives every changed field from the files they
// produced, runs the reviewed checks before writing, and never overwrites a file.
//
//   release-artifacts.mjs source-manifest --repository <clean git clone> --root <release root> --role api|ui|runner --out <file>
//   release-artifacts.mjs build-env
//   release-artifacts.mjs ui-build --source <ui source manifest> --out <file>
//   release-artifacts.mjs verify --source <source manifest> [--ui-build <ui build manifest>]
//   release-artifacts.mjs operator-digest --source <source manifest>
//   release-artifacts.mjs launch-plan --service api|ui|runner --from <existing plan> --root <release root>
//       --source-manifest <file> [--ui-build <file>] --native-attestation <file> --out <file>
//   release-artifacts.mjs native-plan --operation apply-and-plan|verify --from <existing native plan>
//       --source-manifest <candidate api source manifest> --out <file>
//
// It reads only root-owned 0644 JSON files (so never an env file or a secret: those are 0640/0600)
// and writes only new root-owned 0644 compact JSON files below the fixed artifacts folder.
import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { protectedPath, sha256, strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { generateSourceManifest, operatorFiles, operatorManifestSha256, verifySourceManifest } from '../../preview-auth-dev/v1/source-manifest.mjs';
import { buildUiArtifact, verifyUiBuildManifest } from '../../preview-auth-dev/v1/ui-build.mjs';
import { parsePublicArtifactBytes, validateLaunchPlan } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { validateNativeAttestation } from '../../preview-auth-dev/v1/native-attestation.mjs';
import { validatePublication } from '../../preview-auth-dev/v1/runtime-receipt.mjs';
import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY } from '../../preview-auth-dev/v1/turnstile-custody.mjs';
import { PREVIEW_FREE_MODEL_IDS_JSON } from '../../preview-auth-dev/v1/environment.mjs';

/** The fixed server folders the reviewed launchers already require (launch-plan.mjs:6,17,37). */
export const LAYOUT = Object.freeze({
  artifactsRoot: '/opt/debateai-v3-preview/artifacts',
  releasesRoot: '/opt/debateai-v3-preview/releases',
  // prestart.mjs writes here on every start; a release plan must never be written into it.
  currentDir: '/opt/debateai-v3-preview/artifacts/lifecycle-current',
  ownerUid: 0,
  ownerGid: 0
});

/**
 * Public values the website is BUILT with. Each one is the exact value the reviewed runtime gate
 * (environment.mjs narrowEnvironment, service ui) demands from ui.env, imported from the same
 * constants, so the build and the running site cannot disagree. Nothing here is read from ui.env.
 */
export const UI_PUBLIC_BUILD_VALUES = Object.freeze({
  NODE_ENV: 'production',
  PUBLIC_APP_URL: PREVIEW_ORIGIN,
  NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: PREVIEW_FREE_MODEL_IDS_JSON,
  TURNSTILE_SITE_KEY: PREVIEW_SITE_KEY
});
/** The complete environment of the build child: the public values plus fixed tool settings. */
export const UI_BUILD_ENVIRONMENT = Object.freeze({
  PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', CI: 'true', NEXT_TELEMETRY_DISABLED: '1',
  ...UI_PUBLIC_BUILD_VALUES
});

const MAX_PUBLIC_ARTIFACT_BYTES = 16_777_216; // readPublicArtifact's bound
const MAX_PLAN_BYTES = 32_768; // prepareLaunch, prestart and native-operator read plans up to this size
const ROLES = ['api', 'ui', 'runner'];
const ACTOR_ENV = ['PATH', 'LANG', 'LC_ALL', 'TZ'];
const COMMANDS = Object.freeze({
  'source-manifest': { required: ['--repository', '--root', '--role', '--out'], optional: [] },
  'build-env': { required: [], optional: [] },
  'ui-build': { required: ['--source', '--out'], optional: [] },
  verify: { required: ['--source'], optional: ['--ui-build'] },
  'operator-digest': { required: ['--source'], optional: [] },
  'launch-plan': { required: ['--service', '--from', '--root', '--source-manifest', '--native-attestation', '--out'], optional: ['--ui-build'] },
  'native-plan': { required: ['--operation', '--from', '--source-manifest', '--out'], optional: [] }
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

/**
 * Compact JSON, no trailing newline, created with O_EXCL|O_NOFOLLOW (never replaces anything),
 * root:root 0644, fsynced, then read back through the reviewed custody reader.
 */
export async function writeArtifact(path, value, { layout = LAYOUT, maxBytes = MAX_PUBLIC_ARTIFACT_BYTES, name } = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length < 1 || bytes.length > maxBytes) refuse('OUTPUT_TOO_LARGE');
  if (!absolute(path) || !artifactPattern(layout).test(path) || dirname(path) === layout.currentDir || (name !== undefined && !path.endsWith(`/${name}`))) refuse('OUTPUT_PATH_REFUSED');
  try { await protectedPath(path, { root: layout.artifactsRoot, uid: layout.ownerUid }); } catch { refuse('OUTPUT_PATH_REFUSED'); }
  let handle;
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
  } catch {
    await handle?.close().catch(() => undefined);
    // This process created the file a moment ago (O_EXCL) in a root-only folder: remove the partial copy.
    await unlink(path).catch(() => undefined);
    refuse('OUTPUT_WRITE_REFUSED');
  }
  const digest = sha256(bytes);
  const readBack = await withPrivateBytes(path, { root: dirname(path), uid: layout.ownerUid, gid: layout.ownerGid, mode: 0o644, maxBytes: bytes.length }, raw => sha256(raw)).catch(() => null);
  if (readBack !== digest) refuse('OUTPUT_READBACK_REFUSED');
  return { path, sha256: digest, bytes: bytes.length };
}

async function sourceManifestCommand(options, { layout, deps }) {
  const role = options['--role'], root = options['--root'], repository = options['--repository'];
  if (!ROLES.includes(role)) refuse('ARGUMENTS_REFUSED', ['--role']);
  if (!releasePattern(layout).test(root)) refuse('RELEASE_ROOT_REFUSED');
  await assertDirectory(repository, layout, '--repository');
  await assertDirectory(root, layout, '--root');
  if (repository === root || repository.startsWith(`${root}/`) || root.startsWith(`${repository}/`)) refuse('RELEASE_ROOT_REFUSED');
  const manifest = await (deps.generateSourceManifest ?? generateSourceManifest)({ repositoryRoot: repository, sourceRoot: root, role, uid: layout.ownerUid });
  if (manifest?.sourceRoot !== root || manifest.role !== role || manifest.uid !== layout.ownerUid) refuse('SOURCE_MANIFEST_REFUSED');
  return writeArtifact(options['--out'], manifest, { layout });
}

/** The public build values and their sha256, for comparing with ui.env without printing it. */
export function buildEnvironmentReport() {
  return { schema: 'preview-release-ui-build-values-v1', values: Object.fromEntries(Object.entries(UI_PUBLIC_BUILD_VALUES).map(([key, value]) => [key, { value, sha256: sha256(value) }])) };
}

async function uiBuildCommand(options, { layout, deps }) {
  const source = await readSource(options['--source'], { layout, flag: '--source' });
  if (source.value.role !== 'ui') refuse('SOURCE_ROLE_REFUSED');
  const verifySource = deps.verifySourceManifest ?? verifySourceManifest;
  // Before: the root is exactly what the manifest inventoried. After: the build changed none of it.
  await verifySource(source.value, sourceBinding(source));
  const build = await (deps.buildUiArtifact ?? buildUiArtifact)(source.value, { ...UI_BUILD_ENVIRONMENT });
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

async function launchPlanCommand(options, { layout, deps }) {
  const service = options['--service'], root = options['--root'];
  const validatePlan = deps.validateLaunchPlan ?? validateLaunchPlan;
  if (!ROLES.includes(service)) refuse('ARGUMENTS_REFUSED', ['--service']);
  const kind = releasePattern(layout).exec(root)?.[1] ?? refuse('RELEASE_ROOT_REFUSED');
  const from = await readJson(options['--from'], { layout, flag: '--from', maxBytes: MAX_PLAN_BYTES, artifact: false });
  try { validatePlan(from.value); } catch { refuse('FROM_PLAN_INVALID'); }
  if (from.value.service !== service) refuse('FROM_PLAN_INVALID');
  const source = await readSource(options['--source-manifest'], { layout, flag: '--source-manifest' });
  if (source.value.role !== service || source.value.sourceRoot !== root) refuse('SOURCE_MANIFEST_MISMATCH');
  let uiBuild = null;
  if ((service === 'ui') !== (options['--ui-build'] !== undefined)) refuse('ARGUMENTS_REFUSED', ['--ui-build']);
  if (service === 'ui') {
    const build = await readJson(options['--ui-build'], { layout, flag: '--ui-build', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES, kind: 'ui-build' });
    if (!['sourceRoot', 'sourceRevision', 'sourceTree', 'contractSha256'].every(key => build.value[key] === source.value[key])) refuse('UI_BUILD_MISMATCH');
    uiBuild = { path: build.path, sha256: build.sha256 };
  }
  const native = await readJson(options['--native-attestation'], { layout, flag: '--native-attestation', maxBytes: MAX_PUBLIC_ARTIFACT_BYTES });
  // The base plan's proof only has to be the right proof: prestart replaces it with a fresh one on
  // every start, and the launcher checks its age. So check the binding at the proof's own time.
  try {
    validateNativeAttestation(native.value, { sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree, nativeSourceSha256: source.value.nativeSha256, publication: from.value.publication }, Date.parse(native.value?.verifiedAt));
  } catch { refuse('NATIVE_ATTESTATION_MISMATCH'); }
  const plan = {
    schema: from.value.schema, service, artifact: kind, sourceRoot: root, sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree,
    serviceUid: from.value.serviceUid, serviceGid: from.value.serviceGid,
    sourceManifest: { path: source.path, sha256: source.sha256 }, nativeAttestation: { path: native.path, sha256: native.sha256 }, uiBuild,
    publication: from.value.publication, operatorManifestSha256: operatorManifestSha256(source.value), environment: from.value.environment,
    apiPort: from.value.apiPort, uiPort: from.value.uiPort, mailExecutable: join(root, 'dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs'), mailFrom: from.value.mailFrom
  };
  try { validatePlan(plan); } catch { refuse('LAUNCH_PLAN_INVALID'); }
  return writeArtifact(options['--out'], plan, { layout, maxBytes: MAX_PLAN_BYTES, name: `${service}-launch.json` });
}

async function nativePlanCommand(options, { layout, deps }) {
  const operation = options['--operation'];
  if (!['apply-and-plan', 'verify'].includes(operation)) refuse('ARGUMENTS_REFUSED', ['--operation']);
  // Lazy: native-operator.mjs loads tsx and pg, which exist only in an installed release root.
  const validateNativePlan = deps.validateNativePlan ?? (await import('../../preview-auth-dev/v1/native-operator.mjs')).validateNativePlan;
  const from = await readJson(options['--from'], { layout, flag: '--from', maxBytes: MAX_PLAN_BYTES, artifact: false });
  try { validateNativePlan(from.value); } catch { refuse('FROM_PLAN_INVALID'); }
  const source = await readSource(options['--source-manifest'], { layout, flag: '--source-manifest' });
  if (source.value.role !== 'api') refuse('SOURCE_ROLE_REFUSED');
  // The native operator, prestart and pin accept only a candidate root (native-operator.mjs, prestart.mjs checkNativePlan).
  if (releasePattern(layout).exec(source.value.sourceRoot)?.[1] !== 'candidate') refuse('NATIVE_ROOT_NOT_CANDIDATE');
  let approval = null;
  if (operation === 'verify') {
    // verify uses approval.runtimeObservedAt (a string) and approval.publication (the live receipt,
    // which pin compares with the launch plans). Carried over unchanged from --from.
    approval = from.value.approval;
    if (!plainObject(approval) || typeof approval.runtimeObservedAt !== 'string') refuse('NATIVE_APPROVAL_REQUIRED');
    try { validatePublication(approval.publication); } catch { refuse('NATIVE_APPROVAL_REQUIRED'); }
  }
  const plan = {
    schema: from.value.schema, operation, sourceRoot: source.value.sourceRoot, sourceRevision: source.value.sourceRevision, sourceTree: source.value.sourceTree,
    sourceManifest: { path: source.path, sha256: source.sha256 }, operatorManifestSha256: operatorManifestSha256(source.value),
    selectedBaseRegisterVersion: from.value.selectedBaseRegisterVersion, selectedBaseSnapshotSha256: from.value.selectedBaseSnapshotSha256,
    publicationId: from.value.publicationId, approval
  };
  try { validateNativePlan(plan); } catch { refuse('NATIVE_PLAN_INVALID'); }
  return writeArtifact(options['--out'], plan, { layout, maxBytes: MAX_PLAN_BYTES });
}

/** Parse, then run one subcommand. `layout`/`deps` exist for the unit tests' throwaway roots. */
export async function runCommand(argv, { layout = LAYOUT, deps = {} } = {}) {
  const { command, options } = parseArguments(argv);
  const context = { layout, deps };
  switch (command) {
    case 'source-manifest': return sourceManifestCommand(options, context);
    case 'build-env': return buildEnvironmentReport();
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
