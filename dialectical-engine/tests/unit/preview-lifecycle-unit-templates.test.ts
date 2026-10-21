// Side-by-side spec §10: the API and website template units are rendered from the live units
// (`systemctl cat`), and the effective confinement of a new instance is compared with the old unit's.
import { describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const templates = await import('../../deploy/' + 'preview-lifecycle/v1/unit-templates.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const { splitSystemctlCat, renderTemplate, compareEffective, COMPARED_PROPERTIES, main } = templates;
const me = { uid: process.getuid!(), gid: process.getgid!() };
const layout = { ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid };
const DIR = '/etc/systemd/system';
const ENV = '/etc/debateai-v3-preview/auth-dev-v1';

/** Exactly what `systemctl cat` prints: a `# <path>` header per file, a blank line before every file but the first. */
const cat = (files: (readonly [string, string])[]) => files.map(([path, body], index) => `${index ? '\n' : ''}# ${path}\n${body}`).join('');

const BASE = [
  '# The preview API (base unit, written by hand on the server).',
  '[Unit]',
  'Description=DebateAI V3 private preview API',
  'After=network-online.target',
  '',
  '[Service]',
  'Type=simple',
  'User=debateai-preview-api',
  'Group=debateai-preview-api',
  `EnvironmentFile=-${ENV}/api.env`,
  `ReadOnlyPaths=${ENV}/api.env -/etc/debateai-v3-preview/api`,
  '# Older notes name debateai-preview-api.service, api.env, :3101 and lifecycle-current: comments are copied as they are.',
  'ProtectSystem=strict',
  '',
  '[Install]',
  'WantedBy=debateai-preview.target',
  ''
].join('\n');
const LIFECYCLE = '[Unit]\nWants=debateai-preview-postgresql.service\nAfter=debateai-preview-api.service\n';
const EGRESS = '[Unit]\nWants=debateai-preview-egress.service\nAfter=debateai-preview-egress.service\n';
const FINAL = '[Service]\nReadWritePaths=\nReadWritePaths=/var/lib/debateai-v3-preview/api\n';
// The real repo drop-in: its comment names debateai-preview-api.service.d, which a comment may.
const SPOOL = readFileSync(resolve(import.meta.dirname, '../../deploy/preview-auth-dev/v1/debateai-preview-api-notice-spool.conf'), 'utf8');
// The release drop-in of the old fixed unit; the last file has no final newline (systemctl copies bytes as they are).
const RELEASE = 'ExecStart=\nExecStart=/opt/node /opt/x/launch-api.mjs --plan /opt/debateai-v3-preview/artifacts/lifecycle-current/api-launch.json';
const apiFiles = (overrides: Record<string, string> = {}): (readonly [string, string])[] => ([
  [`${DIR}/debateai-preview-api.service`, BASE],
  [`${DIR}/debateai-preview-api.service.d/50-lifecycle.conf`, LIFECYCLE],
  [`${DIR}/debateai-preview-api.service.d/60-hosted-egress.conf`, EGRESS],
  [`${DIR}/debateai-preview-api.service.d/zzzzzzzzz-auth-dev-task12-final.conf`, FINAL],
  [`${DIR}/debateai-preview-api.service.d/zzzzzzzzzz-billing-notice-spool.conf`, SPOOL],
  [`${DIR}/debateai-preview-api.service.d/zzzzzzzzzz-lifecycle-release.conf`, RELEASE]
] as const).map(([path, body]) => [path, overrides[path.split('/').at(-1)!] ?? body] as const);
type Rendered = readonly Readonly<{ name: string; body: string }>[];
const render = (files = apiFiles(), service = 'api'): Rendered => renderTemplate({ service, files: splitSystemctlCat(cat(files)) });
const bodyOf = (rendered: Rendered, name: string) => rendered.find(file => file.name === name)?.body;

describe('splitSystemctlCat', () => {
  it('gives back every file and its exact bytes, in systemd order', () => {
    const files = apiFiles();
    expect(splitSystemctlCat(cat(files))).toEqual(files.map(([path, body]) => ({ path, body })));
  });
  it('with the paths systemd reports, a body comment shaped like a header stays in its file', () => {
    // A comment naming another unit's file, exactly in systemctl's header shape.
    const egress = `${EGRESS}# ${DIR}/debateai-preview-egress.service\n`;
    const files = apiFiles({ '60-hosted-egress.conf': egress });
    const paths = files.map(([path]) => path);
    expect(splitSystemctlCat(cat(files), { paths })).toEqual(files.map(([path, body]) => ({ path, body })));
    // Without them that comment would split the file in two.
    expect(splitSystemctlCat(cat(files))).toHaveLength(files.length + 1);
  });
  it.each([
    ['a file systemd does not report', (paths: string[]) => paths.slice(0, -1)],
    ['a file systemd reports that is not printed', (paths: string[]) => [...paths, `${DIR}/debateai-preview-api.service.d/zz-new.conf`]],
    ['another order', (paths: string[]) => [paths[0]!, ...paths.slice(1).reverse()]]
  ])('refuses %s', (_name, change) => {
    const files = apiFiles();
    expect(() => splitSystemctlCat(cat(files), { paths: change(files.map(([path]) => path)) })).toThrow(expect.objectContaining({ code: 'TEMPLATE_CAT_REFUSED' }));
  });
  it.each([
    ['empty output', ''],
    ['text before the first header', `[Unit]\n# ${DIR}/debateai-preview-api.service\n`],
    ['the same file twice', cat([[`${DIR}/debateai-preview-api.service`, '[Unit]\n'], [`${DIR}/debateai-preview-api.service`, '[Unit]\n']])],
    ['a header that is not an absolute path', '# debateai-preview-api.service\n[Unit]\n']
  ])('refuses %s', (_name, text) => {
    expect(() => splitSystemctlCat(text)).toThrow(expect.objectContaining({ code: 'TEMPLATE_CAT_REFUSED' }));
  });
});

describe('renderTemplate', () => {
  it('copies the base and every non-lifecycle drop-in into the template, byte for byte', () => {
    const rendered = render();
    expect(rendered.map(file => file.name)).toEqual([
      'debateai-preview-api@.service',
      'debateai-preview-api@.service.d/60-hosted-egress.conf',
      'debateai-preview-api@.service.d/zzzzzzzzz-auth-dev-task12-final.conf',
      'debateai-preview-api@.service.d/zzzzzzzzzz-billing-notice-spool.conf'
    ]);
    expect(bodyOf(rendered, 'debateai-preview-api@.service.d/60-hosted-egress.conf')).toBe(EGRESS);
    expect(bodyOf(rendered, 'debateai-preview-api@.service.d/zzzzzzzzz-auth-dev-task12-final.conf')).toBe(FINAL);
    expect(bodyOf(rendered, 'debateai-preview-api@.service.d/zzzzzzzzzz-billing-notice-spool.conf')).toBe(SPOOL);
    // The base loses only its [Install] section (an instance is started by the target's drop-in, never enabled) and the env path.
    const expected = BASE.replace('[Install]\nWantedBy=debateai-preview.target\n', '').replaceAll(`${ENV}/api.env `, `${ENV}/api-%i.env `).replace(`-${ENV}/api.env\n`, `-${ENV}/api-%i.env\n`);
    expect(bodyOf(rendered, 'debateai-preview-api@.service')).toBe(expected);
    expect(Object.isFrozen(rendered)).toBe(true);
  });

  it("moves the env file path to the instance's own file", () => {
    const base = bodyOf(render(), 'debateai-preview-api@.service')!;
    expect(base).toContain(`\nEnvironmentFile=-${ENV}/api-%i.env\n`);
    expect(base).toContain(`\nReadOnlyPaths=${ENV}/api-%i.env -/etc/debateai-v3-preview/api\n`);
    expect(base.split('\n').filter(line => !line.startsWith('#') && line.includes('api.env'))).toEqual([]);
  });

  it('renders the website from its own unit, moving only its own env file', () => {
    const files = [
      [`${DIR}/debateai-preview-ui.service`, `[Service]\nUser=debateai-preview-ui\nEnvironmentFile=${ENV}/ui.env\n\n[Install]\nWantedBy=multi-user.target\n`],
      [`${DIR}/debateai-preview-ui.service.d/50-lifecycle.conf`, '[Unit]\nWants=debateai-preview-api.service\n'],
      [`${DIR}/debateai-preview-ui.service.d/70-memory.conf`, '[Service]\nTasksMax=128\n']
    ] as const;
    const rendered = render([...files], 'ui');
    expect(rendered).toEqual([
      { name: 'debateai-preview-ui@.service', body: `[Service]\nUser=debateai-preview-ui\nEnvironmentFile=${ENV}/ui-%i.env\n\n` },
      { name: 'debateai-preview-ui@.service.d/70-memory.conf', body: '[Service]\nTasksMax=128\n' }
    ]);
  });

  it("refuses a website line naming the API's env file (a hidden-file line that would keep naming the old fixed file)", () => {
    const files = [
      [`${DIR}/debateai-preview-ui.service`, `[Service]\nUser=debateai-preview-ui\nEnvironmentFile=${ENV}/ui.env\nInaccessiblePaths=-${ENV}/api.env\n`]
    ] as const;
    expect(() => render([...files], 'ui')).toThrow(expect.objectContaining({ code: 'TEMPLATE_LINE_REFUSED', fields: { file: `${DIR}/debateai-preview-ui.service`, line: 4 } }));
  });

  it.each([
    'Environment=PORT=3100',
    'ExecStart=/x --plan /opt/debateai-v3-preview/artifacts/lifecycle-current/api-launch.json',
    'After=debateai-preview-ui.service',
    'Environment=API_URL=http://127.0.0.1:3101',
    `ReadOnlyPaths=${ENV}/api.env.old`,
    'ReadWritePaths=/opt/debateai-v3-preview/artifacts/lifecycle-current-old-v1',
    'Wants=debateai-preview-runner.service',
    'Environment=UPSTREAM=127.0.0.1:3100',
    `InaccessiblePaths=-${ENV}/runner.env`,
    `ReadOnlyPaths=${ENV}/ui.env`,
    'Environment=NAME=%i',
    'Description=API %I',
    'Environment=UNIT=%n',
    'SyslogIdentifier=%N',
    'Environment=PREFIX=%j %J',
    'OnFailure=debateai-preview-alert@%n.service other.service'
  ])('refuses %s outside the dropped files', line => {
    const egress = `${EGRESS}${line}\n`;
    expect(() => render(apiFiles({ '60-hosted-egress.conf': egress }))).toThrow(expect.objectContaining({
      code: 'TEMPLATE_LINE_REFUSED', fields: { file: `${DIR}/debateai-preview-api.service.d/60-hosted-egress.conf`, line: 4 }
    }));
    // The same line in a dropped file (replaced by the repo drop-in or the instance drop-in), or in a comment, is fine.
    expect(() => render(apiFiles({ '50-lifecycle.conf': `${LIFECYCLE}${line}\n` }))).not.toThrow();
    expect(() => render(apiFiles({ 'zzzzzzzzzz-lifecycle-release.conf': `${RELEASE}\n${line}` }))).not.toThrow();
    expect(() => render(apiFiles({ '60-hosted-egress.conf': `${EGRESS}# ${line}\n;${line}\n` }))).not.toThrow();
  });

  it('keeps the alert hook (its %n names the instance, as intended) and an escaped percent sign', () => {
    const egress = `${EGRESS}OnFailure=debateai-preview-alert@%n.service\nEnvironment=RATIO=50%%in\n`;
    expect(bodyOf(render(apiFiles({ '60-hosted-egress.conf': egress })), 'debateai-preview-api@.service.d/60-hosted-egress.conf')).toBe(egress);
  });

  it('builds the fixed-unit refusal from the layout prefix', () => {
    const other = { ...common.LAYOUT, unitPrefix: 'acme-' };
    const files = [[`${DIR}/acme-api.service`, '[Unit]\nAfter=acme-ui.service\n']] as const;
    expect(() => renderTemplate({ service: 'api', files: splitSystemctlCat(cat([...files])), layout: other })).toThrow(expect.objectContaining({ code: 'TEMPLATE_LINE_REFUSED' }));
    expect(renderTemplate({ service: 'api', files: splitSystemctlCat(cat([[`${DIR}/acme-api.service`, '[Unit]\nAfter=acme-egress.service\n']])), layout: other })[0].name).toBe('acme-api@.service');
  });

  it('keeps a number that only contains an old port', () => {
    const egress = `${EGRESS}[Service]\nLimitNOFILE=131000\nTasksMax=31001\n`;
    expect(bodyOf(render(apiFiles({ '60-hosted-egress.conf': egress })), 'debateai-preview-api@.service.d/60-hosted-egress.conf')).toBe(egress);
  });

  it('refuses such a line in the base unit too, naming only the file and line number', () => {
    const base = BASE.replace('Type=simple\n', 'Type=simple\nEnvironment=SECRET_LOOKING=abc PORT=3101\n');
    let thrown: any;
    try { render(apiFiles({ 'debateai-preview-api.service': base })); } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({ code: 'TEMPLATE_LINE_REFUSED', fields: { file: `${DIR}/debateai-preview-api.service`, line: 8 } });
    expect(JSON.stringify({ message: thrown.message, fields: thrown.fields })).not.toContain('SECRET_LOOKING');
  });

  it.each([
    ['a prefix drop-in for every preview unit', [`${DIR}/debateai-preview-.service.d/10-wide.conf`, '[Service]\nTasksMax=10\n']],
    ['a runtime drop-in', [`/run/systemd/system/debateai-preview-api.service.d/override.conf`, '[Service]\nTasksMax=10\n']],
    ["another unit's drop-in", [`${DIR}/debateai-preview-ui.service.d/70-memory.conf`, '[Service]\nTasksMax=10\n']],
    ['a drop-in that is not a .conf file', [`${DIR}/debateai-preview-api.service.d/notes.txt`, '[Service]\n']],
    ['a nested drop-in', [`${DIR}/debateai-preview-api.service.d/x/70.conf`, '[Service]\n']]
  ] as const)('refuses %s', (_name, extra) => {
    expect(() => render([...apiFiles(), extra])).toThrow(expect.objectContaining({ code: 'TEMPLATE_FILE_REFUSED', fields: { file: extra[0] } }));
  });

  it('refuses a base that is not the fixed unit of that service, and any service but api or ui', () => {
    const files = apiFiles();
    expect(() => render([files[2]!, files[0]!])).toThrow(expect.objectContaining({ code: 'TEMPLATE_FILE_REFUSED' }));
    expect(() => render(files, 'ui')).toThrow(expect.objectContaining({ code: 'TEMPLATE_FILE_REFUSED' }));
    expect(() => render([[`/run/systemd/system/debateai-preview-api.service`, BASE]])).toThrow(expect.objectContaining({ code: 'TEMPLATE_FILE_REFUSED' }));
    expect(() => render(files, 'runner')).toThrow(expect.objectContaining({ code: 'ARGUMENTS_REFUSED' }));
  });
});

describe('compareEffective', () => {
  const shown = (overrides: Record<string, string> = {}) => ({
    User: 'debateai-preview-api', Group: 'debateai-preview-api', ProtectSystem: 'strict', ReadOnlyPaths: `${ENV}/api.env -/etc/debateai-v3-preview/api`,
    InaccessiblePaths: '/root', IPAddressDeny: '0.0.0.0/0 ::/0', TimeoutStopUSec: '1min 30s', Restart: 'on-failure', ...overrides
  });
  it('accepts the moved env file in EnvironmentFiles too, and flags a lost device rule', () => {
    const before = shown({ EnvironmentFiles: `${ENV}/api.env (ignore_errors=yes)`, DevicePolicy: 'closed' });
    const after = shown({ ReadOnlyPaths: `${ENV}/api-new-v1.env -/etc/debateai-v3-preview/api`, EnvironmentFiles: `${ENV}/api-new-v1.env (ignore_errors=yes)`, DevicePolicy: 'closed' });
    expect(compareEffective({ service: 'api', label: 'new-v1', before, after })).toEqual([]);
    expect(compareEffective({ service: 'api', label: 'new-v1', before, after: { ...after, DevicePolicy: 'auto' } })).toEqual(['DevicePolicy']);
  });
  it('compareEffective accepts the env substitution and flags a changed user', () => {
    const after = shown({ ReadOnlyPaths: `${ENV}/api-new-v1.env -/etc/debateai-v3-preview/api` });
    expect(compareEffective({ service: 'api', label: 'new-v1', before: shown(), after })).toEqual([]);
    expect(compareEffective({ service: 'api', label: 'new-v1', before: shown(), after: { ...after, User: 'nobody' } })).toEqual(['User']);
  });
  it('flags a path that still names the old file, another label, a lost property and a changed stop timeout, in list order', () => {
    const before = shown();
    expect(compareEffective({ service: 'api', label: 'new-v1', before, after: shown({ InaccessiblePaths: '', TimeoutStopUSec: '10s' }) })).toEqual(['ReadOnlyPaths', 'InaccessiblePaths', 'TimeoutStopUSec']);
    expect(compareEffective({ service: 'api', label: 'new-v1', before, after: shown({ ReadOnlyPaths: `${ENV}/api-old-v1.env -/etc/debateai-v3-preview/api` }) })).toEqual(['ReadOnlyPaths']);
    // A property neither side shows (systemctl omits empty ones without --all) and an empty one are the same.
    const { Restart: _gone, ...noRestart } = shown();
    expect(compareEffective({ service: 'api', label: 'new-v1', before: { ...noRestart, ReadOnlyPaths: '' }, after: { ...noRestart, ReadOnlyPaths: '', Restart: '' } })).toEqual([]);
  });
  it('compares exactly the confinement, identity, environment and restart properties the plan names', () => {
    expect(COMPARED_PROPERTIES).toEqual(('User Group SupplementaryGroups ProtectSystem ProtectHome PrivateTmp PrivateDevices ProtectProc ProcSubset NoNewPrivileges RestrictAddressFamilies '
      + 'IPAddressAllow IPAddressDeny ReadWritePaths ReadOnlyPaths InaccessiblePaths BindPaths BindReadOnlyPaths CapabilityBoundingSet AmbientCapabilities SystemCallFilter '
      + 'SystemCallArchitectures RestrictNamespaces RestrictSUIDSGID LockPersonality MemoryDenyWriteExecute UMask LimitNOFILE LimitCORE TasksMax Environment UnsetEnvironment '
      + 'PassEnvironment KillMode TimeoutStopUSec Restart RestartUSec StartLimitBurst StartLimitIntervalUSec ProtectKernelTunables ProtectKernelModules ProtectKernelLogs '
      + 'ProtectControlGroups ProtectClock ProtectHostname RestrictRealtime StateDirectory RuntimeDirectory '
      // Controller ruling (D7 review): also the env files, network/user/device isolation, file-system and socket rules, logs folder.
      + 'EnvironmentFiles PrivateNetwork PrivateUsers DevicePolicy DeviceAllow RestrictFileSystems NoExecPaths ExecPaths TemporaryFileSystem '
      + 'SocketBindAllow SocketBindDeny LogsDirectory').split(' '));
    expect(Object.isFrozen(COMPARED_PROPERTIES)).toBe(true);
  });
  it('refuses a label that is not a release label and a service but api or ui', () => {
    expect(() => compareEffective({ service: 'api', label: 'New_V1', before: shown(), after: shown() })).toThrow(expect.objectContaining({ code: 'ARGUMENTS_REFUSED' }));
    expect(() => compareEffective({ service: 'runner', label: 'new-v1', before: shown(), after: shown() })).toThrow(expect.objectContaining({ code: 'ARGUMENTS_REFUSED' }));
  });
});

describe('unit-templates.mjs CLI', () => {
  const sink = () => { const lines: string[] = []; return { lines, stream: { write: (text: string) => { lines.push(text); return true; } }, events: () => lines.map(line => JSON.parse(line)) }; };
  const workspace = () => {
    // realpath: the tool refuses an output folder reached through a link (macOS's /var is one).
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-templates-')));
    const out = join(root, 'out'); mkdirSync(out, { mode: 0o700 }); chmodSync(out, 0o700);
    const catFile = join(root, 'api.cat'); writeFileSync(catFile, cat(apiFiles()), { mode: 0o600 });
    return { root, out, catFile };
  };
  function systemd(lines: string[], code = 0) {
    const calls: { argv: string[]; env: unknown }[] = [];
    return { calls, run: async (argv: string[], options: { env: unknown }) => { calls.push({ argv, env: options.env }); return { code, signal: null, timedOut: false, overflow: false, stdout: Buffer.from(lines.join('\n') + '\n'), stderr: Buffer.alloc(0) }; } };
  }
  const fixedShow = (files = apiFiles()) => ['Id=debateai-preview-api.service', `FragmentPath=${files[0]![0]}`, `DropInPaths=${files.slice(1).map(([path]) => path).join(' ')}`];
  const renderArgv = ['/usr/bin/systemctl', 'show', 'debateai-preview-api.service', '--property=Id,FragmentPath,DropInPaths', '--no-pager'];
  const run = async (argv: string[], options: Record<string, unknown> = {}) => {
    const stdout = sink(), stderr = sink();
    const code = await main(argv, { platform: 'linux', uid: 0, layout, stdout: stdout.stream, stderr: stderr.stream, deps: { run: systemd(fixedShow()).run }, ...options });
    return { code, stdout: stdout.events(), stderr: stderr.events() };
  };

  it('render writes the template and its drop-ins into the empty root-only folder', async () => {
    const w = workspace();
    const s = systemd(fixedShow());
    const result = await run(['render', '--service', 'api', '--cat', w.catFile, '--out', w.out], { deps: { run: s.run } });
    // The saved cat is split only at the files systemd itself reports for the live unit.
    expect(s.calls).toEqual([{ argv: renderArgv, env: {} }]);
    expect(result).toEqual({ code: 0, stderr: [], stdout: [{ event: 'PREVIEW_UNIT_TEMPLATE_RENDERED', service: 'api', files: render().map(file => file.name) }] });
    for (const file of render()) {
      expect(readFileSync(join(w.out, file.name), 'utf8')).toBe(file.body);
      expect(statSync(join(w.out, file.name)).mode & 0o777).toBe(0o644);
    }
    expect(statSync(join(w.out, 'debateai-preview-api@.service.d')).mode & 0o777).toBe(0o700);
  });

  it.each([
    ['a folder that is not empty', (w: ReturnType<typeof workspace>) => { writeFileSync(join(w.out, 'left-over'), 'x'); return w.out; }],
    ['a folder others can read', (w: ReturnType<typeof workspace>) => { chmodSync(w.out, 0o755); return w.out; }],
    ['a link to a folder', (w: ReturnType<typeof workspace>) => { symlinkSync(w.out, join(w.root, 'link')); return join(w.root, 'link'); }],
    ['a missing folder', (w: ReturnType<typeof workspace>) => join(w.root, 'missing')],
    ['a relative path', () => 'out']
  ])('render refuses %s and writes nothing', async (_name, prepare) => {
    const w = workspace();
    const out = prepare(w);
    const before = readdirSync(w.root).sort();
    const result = await run(['render', '--service', 'api', '--cat', w.catFile, '--out', out]);
    expect(result.code).toBe(1);
    expect(result.stderr).toEqual([{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', reason: 'OUT_DIR_REFUSED' }]);
    expect(readdirSync(w.root).sort()).toEqual(before);
  });

  it.each([
    ['a link instead of a file', (w: ReturnType<typeof workspace>) => { symlinkSync(w.catFile, join(w.root, 'cat-link')); return join(w.root, 'cat-link'); }],
    ['a file others may write', (w: ReturnType<typeof workspace>) => { chmodSync(w.catFile, 0o666); return w.catFile; }],
    ['a missing file', (w: ReturnType<typeof workspace>) => join(w.root, 'missing.cat')]
  ])('render refuses %s as its input', async (_name, prepare) => {
    const w = workspace();
    const result = await run(['render', '--service', 'api', '--cat', prepare(w), '--out', w.out]);
    expect(result.stderr).toEqual([{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', reason: 'INPUT_FILE_REFUSED' }]);
    expect(readdirSync(w.out)).toEqual([]);
  });

  it.each([
    ['systemd does not answer', systemd(fixedShow(), 1), 'UNIT_SHOW_UNREADABLE'],
    ['systemd answers about another unit', systemd(fixedShow().map(line => line.replace('Id=debateai-preview-api.service', 'Id=debateai-preview-ui.service'))), 'UNIT_SHOW_UNREADABLE'],
    ['the saved cat is not what systemd loads now', systemd([...fixedShow().slice(0, 2), `DropInPaths=${apiFiles().slice(1, -1).map(([path]) => path).join(' ')}`]), 'TEMPLATE_CAT_REFUSED']
  ])('render refuses when %s, and writes nothing', async (_name, s, reason) => {
    const w = workspace();
    const result = await run(['render', '--service', 'api', '--cat', w.catFile, '--out', w.out], { deps: { run: s.run } });
    expect(result).toEqual({ code: 1, stdout: [], stderr: [{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', reason }] });
    expect(readdirSync(w.out)).toEqual([]);
  });

  it('render reports a refused line by file and line number only, and writes nothing', async () => {
    const w = workspace();
    writeFileSync(w.catFile, cat(apiFiles({ '60-hosted-egress.conf': `${EGRESS}Environment=PORT=3100\n` })));
    const result = await run(['render', '--service', 'api', '--cat', w.catFile, '--out', w.out]);
    expect(result).toEqual({ code: 1, stdout: [], stderr: [{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', reason: 'TEMPLATE_LINE_REFUSED', fields: { file: `${DIR}/debateai-preview-api.service.d/60-hosted-egress.conf`, line: 4 } }] });
    expect(readdirSync(w.out)).toEqual([]);
  });

  const showArgv = ['/usr/bin/systemctl', 'show', 'debateai-preview-api@new-v1.service', `--property=Id,LoadState,${COMPARED_PROPERTIES.join(',')}`, '--no-pager'];
  const savedShow = (lines: string[]) => { const w = workspace(); const file = join(w.root, 'api.show'); writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 }); return file; };
  const OLD = ['Id=debateai-preview-api.service', 'Names=debateai-preview-api.service', 'User=debateai-preview-api', `ReadOnlyPaths=${ENV}/api.env`, 'TimeoutStopUSec=1min 30s', 'Description=x=y'];
  const NEW = ['Id=debateai-preview-api@new-v1.service', 'LoadState=loaded', 'User=debateai-preview-api', `ReadOnlyPaths=${ENV}/api-new-v1.env`, 'TimeoutStopUSec=1min 30s'];

  it('compare reads the new instance from systemd itself and exits 0 when only the env file moved', async () => {
    const s = systemd(NEW);
    const result = await run(['compare', '--service', 'api', '--label', 'new-v1', '--before', savedShow(OLD)], { deps: { run: s.run } });
    expect(s.calls).toEqual([{ argv: showArgv, env: {} }]);
    expect(result).toEqual({ code: 0, stderr: [], stdout: [{ event: 'PREVIEW_UNIT_TEMPLATE_SAME', service: 'api', label: 'new-v1', differs: [] }] });
  });

  it('compare exits 1 and names every property that differs', async () => {
    const s = systemd([...NEW.slice(0, 2), 'User=nobody', `ReadOnlyPaths=${ENV}/api-new-v1.env`, 'TimeoutStopUSec=10s']);
    const result = await run(['compare', '--service', 'api', '--label', 'new-v1', '--before', savedShow(OLD)], { deps: { run: s.run } });
    expect(result).toEqual({ code: 1, stdout: [], stderr: [{ event: 'PREVIEW_UNIT_TEMPLATE_DIFFERS', service: 'api', label: 'new-v1', differs: ['User', 'TimeoutStopUSec'] }] });
  });

  it.each([
    ['a saved file of another unit', OLD.map(line => line.replace('Id=debateai-preview-api.service', 'Id=debateai-preview-ui.service')), NEW, 'BEFORE_UNIT_MISMATCH'],
    ['a saved file without the unit name', OLD.slice(1), NEW, 'BEFORE_UNIT_MISMATCH'],
    ['a saved file with a property twice', [...OLD, 'User=root'], NEW, 'SHOW_UNREADABLE'],
    ['an instance systemd has not loaded', OLD, NEW.map(line => line.replace('LoadState=loaded', 'LoadState=not-found')), 'UNIT_NOT_LOADED'],
    ['an answer about another unit', OLD, NEW.map(line => line.replace('@new-v1', '@old-v1')), 'UNIT_SHOW_UNREADABLE'],
    ['an answer with a property twice', OLD, [...NEW, 'User=root'], 'UNIT_SHOW_UNREADABLE']
  ])('compare refuses %s', async (_name, before, after, reason) => {
    const result = await run(['compare', '--service', 'api', '--label', 'new-v1', '--before', savedShow(before)], { deps: { run: systemd(after).run } });
    expect(result).toEqual({ code: 1, stdout: [], stderr: [{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', label: 'new-v1', reason }] });
  });

  it('compare refuses when systemd does not answer', async () => {
    const result = await run(['compare', '--service', 'api', '--label', 'new-v1', '--before', savedShow(OLD)], { deps: { run: systemd(NEW, 1).run } });
    expect(result.stderr).toEqual([{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', label: 'new-v1', reason: 'UNIT_SHOW_UNREADABLE' }]);
  });

  it.each([
    [['render', '--service', 'runner', '--cat', '/x', '--out', '/y']],
    [['compare', '--service', 'api', '--label', '../x', '--before', '/x']],
    [['render', '--service', 'api', '--cat', '/x']],
    [['publish']]
  ])('refuses the arguments %j before touching any file', async argv => {
    const result = await run(argv, { deps: { run: async () => { throw new Error('ran'); } } });
    expect(result).toEqual({ code: 1, stdout: [], stderr: [{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', reason: 'ARGUMENTS_REFUSED' }] });
  });

  it('runs only as root on Linux', async () => {
    const w = workspace();
    for (const options of [{ platform: 'darwin' }, { uid: me.uid === 0 ? 1000 : me.uid }]) {
      const result = await run(['render', '--service', 'api', '--cat', w.catFile, '--out', w.out], options);
      expect(result.stderr).toEqual([{ event: 'PREVIEW_UNIT_TEMPLATE_REFUSED', service: 'api', reason: 'ACTOR_REFUSED' }]);
    }
    expect(readdirSync(w.out)).toEqual([]);
  });
});
