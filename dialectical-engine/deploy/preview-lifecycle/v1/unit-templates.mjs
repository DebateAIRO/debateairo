// Root's tool for turning the live fixed API and website units into template units (side-by-side spec §10).
//
// Plain words: today the server runs one debateai-preview-api.service and one debateai-preview-ui.service,
// written partly by hand. Side by side, each release runs its own instance, debateai-preview-api@<label>.service.
// This tool copies the live unit (as `systemctl cat` prints it) into the template, changes only the env file
// path to the instance's own file, and refuses any line that still names something of the old single unit.
// After the template is installed, it compares what systemd says about a new instance with what it said
// about the old unit, so the confinement is the same, property by property.
//
//   unit-templates.mjs render --service api|ui --cat <file> --out <dir>
//       <file>: `systemctl cat debateai-preview-<service>.service`, saved by root (root-owned, not group/world-writable).
//       It is split only at the files `systemctl show` reports now (FragmentPath, DropInPaths), and must print exactly those.
//       <dir>: an empty folder only root can enter; gets debateai-preview-<service>@.service and its .d/ drop-ins.
//   unit-templates.mjs compare --service api|ui --label <label> --before <file>
//       <file>: the full `systemctl show debateai-preview-<service>.service` output, saved by root before the change.
//       Reads `systemctl show debateai-preview-<service>@<label>.service` itself; exit 1 on any difference.
//
// Every refusal is one JSON line on stderr and exit 1. Logs carry codes, services, labels, unit file paths,
// line numbers and property names only; never a line of a unit (an Environment= line may hold a value).
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT, RELEASE_LABEL, atomicWrite, ensureDirectory, logLine, runBounded, unitNameFor } from './common.mjs';
import { RELEASE_DROPIN_NAME } from './prestart.mjs';

const SERVICES = Object.freeze(['api', 'ui']);
/** The repo drop-in (deploy/preview-lifecycle/v1/systemd/<unit>@.service.d/) and the instance's release drop-in replace these. */
const DROPPED = Object.freeze(['50-lifecycle.conf', RELEASE_DROPIN_NAME]);
/** Same rule as prestart's checkFrontUnit: a template drop-in is one plain `.conf` name in the template's folder. */
const DROPIN_NAME = /^[A-Za-z0-9._-]+\.conf$/;
/** systemctl's file header: `# ` and the file's path in one of systemd's unit folders (a body comment rarely looks like that). */
const HEADER = /^# (\/(?:etc|run|lib|usr\/lib|usr\/local\/lib)\/systemd\/\S+)$/;
const MAX_INPUT_BYTES = 1024 * 1024;
const ALERT_HOOK = 'OnFailure=debateai-preview-alert@%n.service';
/**
 * Side-by-side plan D: the properties whose effective value must be the same for the old fixed unit and a new
 * instance (identity, confinement, environment, limits, stop and restart). systemd reports them in these names.
 */
export const COMPARED_PROPERTIES = Object.freeze(('User Group SupplementaryGroups ProtectSystem ProtectHome PrivateTmp PrivateDevices ProtectProc ProcSubset '
  + 'NoNewPrivileges RestrictAddressFamilies IPAddressAllow IPAddressDeny ReadWritePaths ReadOnlyPaths InaccessiblePaths BindPaths BindReadOnlyPaths '
  + 'CapabilityBoundingSet AmbientCapabilities SystemCallFilter SystemCallArchitectures RestrictNamespaces RestrictSUIDSGID LockPersonality '
  + 'MemoryDenyWriteExecute UMask LimitNOFILE LimitCORE TasksMax Environment UnsetEnvironment PassEnvironment KillMode TimeoutStopUSec Restart '
  + 'RestartUSec StartLimitBurst StartLimitIntervalUSec ProtectKernelTunables ProtectKernelModules ProtectKernelLogs ProtectControlGroups '
  + 'ProtectClock ProtectHostname RestrictRealtime StateDirectory RuntimeDirectory '
  // D7 review (controller ruling): also the env files, network/user/device isolation, file-system and socket rules.
  + 'EnvironmentFiles PrivateNetwork PrivateUsers DevicePolicy DeviceAllow RestrictFileSystems NoExecPaths ExecPaths TemporaryFileSystem '
  + 'SocketBindAllow SocketBindDeny LogsDirectory').split(' '));
/**
 * The properties `systemctl show` prints once per entry (final fix wave S5): a unit with two EnvironmentFile= lines shows
 * two `EnvironmentFiles=` lines. They are read as ordered lists; every other property holds one value, and a repeat of
 * one of those still refuses (which one would be true?).
 */
export const MULTI_VALUED_PROPERTIES = Object.freeze(['EnvironmentFiles', 'BindPaths', 'BindReadOnlyPaths', 'TemporaryFileSystem', 'DeviceAllow']);

class TemplateRefusal extends Error { constructor(code, fields) { super(code); this.name = 'TemplateRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new TemplateRefusal(code, fields); };
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
/** systemd ignores a line whose first non-blank character is `#` or `;`. */
const isComment = line => /^\s*[#;]/.test(line);
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
const layoutOwner = layout => ({ uid: layout.ownerUid ?? 0, gid: layout.ownerGid ?? 0 });
const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.includes('\0');

/**
 * `systemctl cat` output -> its files, in the order systemd applies them. Each file starts with a `# <path>`
 * header line; systemctl prints one blank line before every header but the first, which is not part of the
 * file before it. Bodies are returned byte for byte (a file without a final newline stays without one).
 * With `paths` (the unit's FragmentPath then its DropInPaths, as `systemctl show` reports them), a header is exactly
 * the next of those paths, so a body comment shaped like a header stays in its file; a header-shaped line naming one
 * of them out of turn, or a file of the unit's own drop-in folder that systemd does not report, refuses, and every
 * reported file must be printed.
 */
export function splitSystemctlCat(text, { paths } = {}) {
  if (typeof text !== 'string' || text === '') refuse('TEMPLATE_CAT_REFUSED');
  if (paths !== undefined && (!Array.isArray(paths) || paths.length === 0 || !paths.every(absolute) || new Set(paths).size !== paths.length)) refuse('TEMPLATE_CAT_REFUSED');
  const ownFolder = paths ? `${paths[0]}.d/` : null;
  const lines = text.split('\n');
  const starts = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    const match = HEADER.exec(line);
    if (paths) {
      if (line === `# ${paths[starts.length]}`) starts.push({ index, offset, path: paths[starts.length] });
      else if (index === 0 || (match && (paths.includes(match[1]) || match[1].startsWith(ownFolder)))) refuse('TEMPLATE_CAT_REFUSED');
    } else if (match) starts.push({ index, offset, path: match[1] });
    else if (index === 0) refuse('TEMPLATE_CAT_REFUSED');
    offset += line.length + 1;
  }
  if (paths && starts.length !== paths.length) refuse('TEMPLATE_CAT_REFUSED');
  const files = [];
  for (const [n, start] of starts.entries()) {
    const bodyStart = start.offset + lines[start.index].length + 1;
    // The blank line systemctl printed before the next header is its separator, never the file's own byte.
    const bodyEnd = n + 1 < starts.length ? starts[n + 1].offset - 1 : text.length;
    if (!absolute(start.path) || files.some(file => file.path === start.path) || bodyEnd < bodyStart) refuse('TEMPLATE_CAT_REFUSED');
    files.push(Object.freeze({ path: start.path, body: text.slice(bodyStart, bodyEnd) }));
  }
  return Object.freeze(files);
}

/**
 * Line indexes of the base unit's [Install] section (an instance is started by name, never enabled). The text after
 * the last newline (normally empty) is never one of them, so the file keeps its own ending.
 */
function installLines(lines) {
  const found = new Set();
  let inInstall = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!isComment(line) && trimmed.startsWith('[')) inInstall = trimmed === '[Install]';
    if (inInstall && !(index === lines.length - 1 && line === '')) found.add(index);
  }
  return found;
}

/**
 * The live fixed unit (splitSystemctlCat output) -> the template's files:
 * - the base `debateai-preview-<service>.service` becomes `debateai-preview-<service>@.service` without its [Install];
 * - 50-lifecycle.conf and the release drop-in are left out (the repo drop-in and the instance drop-in replace them);
 * - every other drop-in of that unit's own folder goes to `debateai-preview-<service>@.service.d/<same name>`;
 * - on every non-comment line, the path token `/etc/debateai-v3-preview/auth-dev-v1/<service>.env` (with or without a
 *   leading `-`) becomes `…/<service>-%i.env`; everything else is copied byte for byte.
 * Any other non-comment mention of `(api|ui|runner).env`, the port 3100 or 3101 (`:3101`, `PORT=3100`),
 * `lifecycle-current` or a fixed `debateai-preview-(api|ui|runner).service`, and any instance specifier (%i %I %n %N
 * %j %J) other than in `OnFailure=debateai-preview-alert@%n.service`, refuses TEMPLATE_LINE_REFUSED { file, line }: the
 * template would otherwise point every release at one release's file, port, plan or unit (O1), or change a name.
 */
export function renderTemplate({ service, files, layout = LAYOUT }) {
  if (!SERVICES.includes(service) || !Array.isArray(files) || files.length === 0) refuse('ARGUMENTS_REFUSED');
  const unitDir = unitDirOf(layout);
  const fixed = `${layout.unitPrefix}${service}.service`;
  const template = `${layout.unitPrefix}${service}@.service`;
  const envRoot = layout.nativePlanRoot;
  const envToken = new RegExp(`(^|[\\s=])(-?)${escape(`${envRoot}/${service}.env`)}(?=\\s|$)`, 'g');
  // Any service's fixed env file (D7 review): the own one is rewritten above; another (a website line hiding the API's
  // api.env, say) would keep naming the old file and silently lose its hardening for every release.
  const fixedEnv = /(api|ui|runner)\.env/;
  // Slot A's ports as whole numbers (`:3101`, `PORT=3100`); a release's port comes from its slot and its plan.
  const fixedPort = /(?<![0-9])310[01](?![0-9])/;
  const fixedUnit = new RegExp(`${escape(layout.unitPrefix)}(api|ui|runner)\\.service`);
  // Instance specifiers mean the old unit's name in its file, but each instance's in a template (`%%` is a literal `%`).
  const specifier = /(?<!%)(?:%%)*%[iInNjJ]/;
  const out = [];
  const seen = new Set();
  for (const [index, file] of files.entries()) {
    const path = file?.path;
    if (typeof path !== 'string' || typeof file.body !== 'string' || seen.has(path)) refuse('TEMPLATE_FILE_REFUSED', { file: String(path) });
    seen.add(path);
    let name;
    if (index === 0) {
      if (path !== `${unitDir}/${fixed}`) refuse('TEMPLATE_FILE_REFUSED', { file: path });
      name = template;
    } else {
      const folder = `${unitDir}/${fixed}.d/`;
      const dropin = path.startsWith(folder) ? path.slice(folder.length) : '';
      if (!DROPIN_NAME.test(dropin)) refuse('TEMPLATE_FILE_REFUSED', { file: path });
      if (DROPPED.includes(dropin)) continue;
      name = `${template}.d/${dropin}`;
    }
    const lines = file.body.split('\n');
    const skipped = index === 0 ? installLines(lines) : new Set();
    const rendered = [];
    for (const [at, line] of lines.entries()) {
      if (skipped.has(at)) continue;
      if (isComment(line)) { rendered.push(line); continue; }
      // The one specifier line that means the same in a template: the alert names the failed instance.
      if (specifier.test(line) && line.trim() !== ALERT_HOOK) refuse('TEMPLATE_LINE_REFUSED', { file: path, line: at + 1 });
      const moved = line.replace(envToken, (_whole, before, dash) => `${before}${dash}${envRoot}/${service}-%i.env`);
      if (fixedEnv.test(moved) || moved.includes('lifecycle-current') || fixedPort.test(moved) || fixedUnit.test(moved)) refuse('TEMPLATE_LINE_REFUSED', { file: path, line: at + 1 });
      rendered.push(moved);
    }
    out.push(Object.freeze({ name, body: rendered.join('\n') }));
  }
  return Object.freeze(out);
}

/**
 * The properties of COMPARED_PROPERTIES whose effective values differ between the old fixed unit (`before`) and the
 * new instance (`after`), in list order. The only accepted difference is the env file path `…/<service>.env` ->
 * `…/<service>-<label>.env`. A property systemd did not print (it omits empty ones) counts as empty.
 */
export function compareEffective({ service, label, before, after, layout = LAYOUT }) {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!SERVICES.includes(service) || !isLabel(label) || !isRecord(before) || !isRecord(after)) refuse('ARGUMENTS_REFUSED');
  // A multi-valued property is its ordered list, one entry per line (parseShow); a single value is itself.
  const value = (record, name) => {
    const raw = Object.hasOwn(record, name) ? record[name] : undefined;
    return typeof raw === 'string' ? raw : Array.isArray(raw) && raw.every(entry => typeof entry === 'string') ? raw.join('\n') : '';
  };
  const oldPath = new RegExp(`${escape(`${layout.nativePlanRoot}/${service}.env`)}(?![A-Za-z0-9._-])`, 'g');
  const newPath = `${layout.nativePlanRoot}/${service}-${label}.env`;
  return Object.freeze(COMPARED_PROPERTIES.filter(name => value(before, name).replace(oldPath, () => newPath) !== value(after, name)));
}

/**
 * `systemctl show` text -> its properties. A multi-valued property (MULTI_VALUED_PROPERTIES) asked about collects its
 * lines in order; any other property asked about (`wanted`) that appears twice refuses: which one is true?
 */
export function parseShow(text, wanted, code) {
  const shown = Object.create(null);
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const at = line.indexOf('=');
    if (at < 1) refuse(code);
    const key = line.slice(0, at);
    if (!wanted.includes(key)) continue;
    if (MULTI_VALUED_PROPERTIES.includes(key)) { (shown[key] ??= []).push(line.slice(at + 1)); continue; }
    if (Object.hasOwn(shown, key)) refuse(code);
    shown[key] = line.slice(at + 1);
  }
  for (const key of MULTI_VALUED_PROPERTIES) if (Object.hasOwn(shown, key)) Object.freeze(shown[key]);
  return shown;
}

/** A small regular file root saved: no link, owned by root, not writable by group or others (it becomes root's unit text). */
async function readInput(path, layout) {
  if (!absolute(path)) refuse('INPUT_FILE_REFUSED');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== layoutOwner(layout).uid || (stat.mode & 0o022) !== 0 || stat.size > MAX_INPUT_BYTES) refuse('INPUT_FILE_REFUSED');
    const bytes = await handle.readFile();
    if (bytes.length > MAX_INPUT_BYTES) refuse('INPUT_FILE_REFUSED');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TemplateRefusal) throw error;
    return refuse('INPUT_FILE_REFUSED');
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** An existing, empty, real folder owned by root that only root can enter. */
async function requireEmptyRootOnly(path, layout) {
  try {
    if (!absolute(path)) refuse('OUT_DIR_REFUSED');
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== layoutOwner(layout).uid || (stat.mode & 0o077) !== 0) refuse('OUT_DIR_REFUSED');
    if (await realpath(path) !== path || (await readdir(path)).length !== 0) refuse('OUT_DIR_REFUSED');
  } catch { refuse('OUT_DIR_REFUSED'); }
}

/** The live fixed unit's files as systemd reports them now: its FragmentPath, then its DropInPaths, in order. */
async function loadedFiles(service, layout, run) {
  const unit = `${layout.unitPrefix}${service}.service`;
  const wanted = ['Id', 'FragmentPath', 'DropInPaths'];
  const result = await run([layout.systemctl, 'show', unit, `--property=${wanted.join(',')}`, '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 64 * 1024 });
  if (!result || result.timedOut || result.overflow || result.error || result.code !== 0) refuse('UNIT_SHOW_UNREADABLE');
  const shown = parseShow(String(result.stdout), wanted, 'UNIT_SHOW_UNREADABLE');
  if (shown.Id !== unit || !shown.FragmentPath) refuse('UNIT_SHOW_UNREADABLE');
  return [shown.FragmentPath, ...(shown.DropInPaths ?? '').split(/\s+/).filter(Boolean)];
}

/** render: read, render (refusing before anything is written), then write each file root-owned 0644. */
export async function renderToFolder({ service, catPath, outDir, layout = LAYOUT, run = runBounded }) {
  const text = await readInput(catPath, layout);
  const paths = await loadedFiles(service, layout, run);
  const rendered = renderTemplate({ service, files: splitSystemctlCat(text, { paths }), layout });
  await requireEmptyRootOnly(outDir, layout);
  const { uid, gid } = layoutOwner(layout);
  if (rendered.some(file => file.name.includes('/'))) await ensureDirectory(join(outDir, `${layout.unitPrefix}${service}@.service.d`), { mode: 0o700, uid });
  for (const file of rendered) await atomicWrite(join(outDir, file.name), Buffer.from(file.body, 'utf8'), { mode: 0o644, uid, gid });
  return Object.freeze({ event: 'PREVIEW_UNIT_TEMPLATE_RENDERED', service, files: Object.freeze(rendered.map(file => file.name)) });
}

/** compare: the saved old unit against what systemd says about the new instance now. */
export async function compareWithInstance({ service, label, beforePath, layout = LAYOUT, run = runBounded }) {
  const wanted = ['Id', 'LoadState', ...COMPARED_PROPERTIES];
  const before = parseShow(await readInput(beforePath, layout), wanted, 'SHOW_UNREADABLE');
  if (before.Id !== `${layout.unitPrefix}${service}.service`) refuse('BEFORE_UNIT_MISMATCH');
  const unit = unitNameFor(layout, service, label);
  const result = await run([layout.systemctl, 'show', unit, `--property=${wanted.join(',')}`, '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 256 * 1024 });
  if (!result || result.timedOut || result.overflow || result.error || result.code !== 0) refuse('UNIT_SHOW_UNREADABLE');
  const after = parseShow(String(result.stdout), wanted, 'UNIT_SHOW_UNREADABLE');
  if (after.Id !== unit) refuse('UNIT_SHOW_UNREADABLE');
  if (after.LoadState !== 'loaded') refuse('UNIT_NOT_LOADED');
  const differs = compareEffective({ service, label, before, after, layout });
  return Object.freeze({ event: differs.length ? 'PREVIEW_UNIT_TEMPLATE_DIFFERS' : 'PREVIEW_UNIT_TEMPLATE_SAME', service, label, differs });
}

/** Exact argv shapes only; anything else refuses before a file, a unit or systemd is touched. */
function parseArguments(argv) {
  const [first, second, third, fourth, fifth, sixth, seventh] = argv;
  const isPath = value => typeof value === 'string' && value.length > 0;
  if (argv.length === 7 && first === 'render' && second === '--service' && SERVICES.includes(third) && fourth === '--cat' && isPath(fifth) && sixth === '--out' && isPath(seventh)) {
    return { command: first, service: third, catPath: fifth, outDir: seventh };
  }
  if (argv.length === 7 && first === 'compare' && second === '--service' && SERVICES.includes(third) && fourth === '--label' && isLabel(fifth) && sixth === '--before' && isPath(seventh)) {
    return { command: first, service: third, label: fifth, beforePath: seventh };
  }
  return refuse('ARGUMENTS_REFUSED');
}
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** One JSON line per run; 0 on success, 1 on any refusal or difference. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = args.command === 'render'
      ? await renderToFolder({ service: args.service, catPath: args.catPath, outDir: args.outDir, layout, run: deps.run ?? runBounded })
      : await compareWithInstance({ service: args.service, label: args.label, beforePath: args.beforePath, layout, run: deps.run ?? runBounded });
    if (result.differs?.length) { logLine(stderr, result); return 1; }
    logLine(stdout, result);
    return 0;
  } catch (error) {
    const context = args ? { service: args.service, ...(args.label ? { label: args.label } : {}) } : {};
    logLine(stderr, { event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', ...context, reason: typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED', ...(error instanceof TemplateRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
