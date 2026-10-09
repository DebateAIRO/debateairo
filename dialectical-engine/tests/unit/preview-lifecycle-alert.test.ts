import { describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every path the alert code hands to node:fs/promises, so a test can prove which files it touched.
const touched = vi.hoisted(() => [] as string[]);
vi.mock('node:fs/promises', async original => {
  const real = await original<typeof import('node:fs/promises')>();
  const record = <F extends (...args: any[]) => any>(fn: F) => ((...args: any[]) => { touched.push(String(args[0])); if (args.length > 1 && typeof args[1] === 'string') touched.push(args[1]); return fn(...args); }) as F;
  const wrapped = { ...real, lstat: record(real.lstat), stat: record(real.stat), open: record(real.open), readFile: record(real.readFile), realpath: record(real.realpath), link: record(real.link), rename: record(real.rename) };
  return { ...wrapped, default: wrapped };
});

const alert = await import('../../deploy/' + 'preview-lifecycle/v1/alert.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const me = { uid: process.getuid!(), gid: process.getgid!() };
// Made-up example.invalid addresses only, never a real one and never a fingerprint of one. The real
// owner list lives only in the root-only server file /etc/debateai-v3-preview/lifecycle/owner-alert-digests.json.
const owner = ['owner', 'example.invalid'].join('@');
const secondOwner = ['second-owner', 'example.invalid'].join('@');
const stranger = ['stranger', 'example.invalid'].join('@');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ownerList = (addresses: string[] = [owner]) => JSON.stringify({ version: 1, ownerSha256: addresses.map(digest) });
const unit = 'debateai-preview-api.service';
// The account-mail allow-list the alert used to read. It must never be touched again.
const ACCOUNT_ALLOW_LIST = 'preview-mail-recipient-installation';

/** A throwaway server: the lifecycle folders, the recipient file and the owner list, all owned by the test user. */
function server(recipient = `${owner}\n`, mode = 0o600, { list = ownerList() as string | null, listMode = 0o600 } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-alert-')));
  const lockRoot = join(base, 'lifecycle');
  const layout = { ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid, lockRoot, alertRecipientPath: join(lockRoot, 'alert-recipient'), stateDir: join(base, 'state'),
    ownerAlertDigestsPath: join(lockRoot, 'owner-alert-digests.json') };
  mkdirSync(layout.lockRoot); chmodSync(layout.lockRoot, 0o755);
  mkdirSync(layout.stateDir); chmodSync(layout.stateDir, 0o700);
  if (list !== null) { writeFileSync(layout.ownerAlertDigestsPath, list); chmodSync(layout.ownerAlertDigestsPath, listMode); }
  writeFileSync(layout.alertRecipientPath, recipient); chmodSync(layout.alertRecipientPath, mode);
  return layout;
}
const gaveUp = { result: 'start-limit-hit', nRestarts: 3, activeState: 'failed', subState: 'failed' };
const restarting = { result: 'exit-code', nRestarts: 1, activeState: 'activating', subState: 'auto-restart' };
function harness(layout: any, overrides: Record<string, unknown> = {}) {
  const sent: string[] = [], logged: any[] = [];
  let clock = Date.parse('2026-10-09T10:00:00Z');
  const deps = {
    now: () => clock, readUnitState: async () => gaveUp,
    readJournal: async () => ['2026-10-09T09:59:58+0000 host node[1]: PREVIEW_API_STARTUP_REFUSED', '2026-10-09T09:59:59+0000 host systemd[1]: debateai-preview-api.service: Failed with result exit-code.'],
    sendmail: async (message: Buffer) => { sent.push(message.toString('utf8')); },
    log: (event: unknown) => logged.push(event), ...overrides
  };
  return { sent, logged, deps, advance: (ms: number) => { clock += ms; } };
}

describe('failure alert', () => {
  it('sends one plain message with the unit, both clocks and the redacted journal tail', async () => {
    const layout = server();
    const h = harness(layout);
    await alert.runAlert({ unit, layout, deps: h.deps });
    expect(h.sent).toHaveLength(1);
    const mail = h.sent[0]!, split = mail.indexOf('\r\n\r\n'), head = mail.slice(0, split), body = mail.slice(split + 4);
    expect(head.split('\r\n')).toEqual(expect.arrayContaining([`To: ${owner}`, 'From: noreply@dezbatere.ro', `Subject: Preview: ${unit} gave up after 3 restarts`, 'Content-Type: text/plain; charset=UTF-8', 'Auto-Submitted: auto-generated']));
    expect(body).toContain('systemd gave up after 3 automatic restarts (start limit reached)');
    expect(body).toContain(`Unit: ${unit}`);
    expect(body).toContain('Time (UTC): 2026-10-09 10:00:00 UTC');
    expect(body).toContain('Time (Bucharest): 2026-10-09 13:00:00');
    expect(body).toContain('PREVIEW_API_STARTUP_REFUSED');
    expect(h.logged).toEqual([{ event: 'PREVIEW_LIFECYCLE_ALERT_SENT', unit }]);
    expect(JSON.stringify(h.logged)).not.toContain(owner);
    const state = readdirSync(join(layout.stateDir, 'alert-state'));
    expect(state).toHaveLength(1);
    expect(statSync(join(layout.stateDir, 'alert-state', state[0]!)).mode & 0o777).toBe(0o600);
  });

  it('reads the failed unit\'s Result, NRestarts and state with systemctl show, argv only, no shell', async () => {
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options }); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from('Result=start-limit-hit\nNRestarts=3\nActiveState=failed\nSubState=failed\n'), stderr: Buffer.alloc(0) }; };
    await expect(alert.readUnitState(unit, { layout: common.LAYOUT, run })).resolves.toEqual(gaveUp);
    expect(seen[0].argv).toEqual(['/usr/bin/systemctl', 'show', unit, '--property=Result,NRestarts,ActiveState,SubState', '--no-pager']);
    expect(seen[0].options.env).toEqual({});
    const odd = async () => ({ code: 0, timedOut: false, overflow: false, stdout: Buffer.from('Result=x y\nNRestarts=3\n'), stderr: Buffer.alloc(0) });
    await expect(alert.readUnitState(unit, { layout: common.LAYOUT, run: odd })).resolves.toBeNull();
    await expect(alert.readUnitState(unit, { layout: common.LAYOUT, run: async () => ({ code: 1, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) })).resolves.toBeNull();
  });

  it('does not email while systemd is still restarting the unit after a crash, and does not use up the 30 minutes', async () => {
    const layout = server();
    const h = harness(layout, { readUnitState: async () => restarting });
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_SKIPPED', unit, state: 'restarting', restarts: 1 });
    expect(h.sent).toEqual([]);
    expect(existsSync(join(layout.stateDir, 'alert-state'))).toBe(false);
  });

  // RestartMode=direct: systemd never starts OnFailure= on an automatic restart, so a crash-count
  // email could never fire. There is no such option; self-healing crashes are seen in the journal.
  it('never emails while systemd is still restarting the unit, however many restarts so far', async () => {
    const layout = server();
    const h = harness(layout, { readUnitState: async () => ({ ...restarting, nRestarts: 50 }) });
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_SKIPPED', unit, state: 'restarting', restarts: 50 });
    expect(h.sent).toEqual([]);
    expect(alert.classifyFailure({ ...restarting, nRestarts: 99 })).toEqual({ kind: 'restarting', send: false, restarts: 99 });
  });

  it('still emails when the unit state cannot be read (an alert must not be lost)', async () => {
    const layout = server();
    const h = harness(layout, { readUnitState: async () => null });
    await alert.runAlert({ unit, layout, deps: h.deps });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain(`Subject: Preview: ${unit} failed`);
    expect(h.sent[0]).toContain('could not be read');
  });

  it('words a unit that fails with no automatic restart (backup, team unlock) plainly', () => {
    expect(alert.classifyFailure({ result: 'exit-code', nRestarts: 0, activeState: 'failed', subState: 'failed' })).toEqual({ kind: 'gave-up', send: true, restarts: 0, result: 'exit-code' });
    const text = alert.composeAlert({ unit: 'debateai-preview-backup.service', at: new Date('2026-01-15T10:00:00Z'), lines: [], from: 'noreply@dezbatere.ro', to: owner, failure: { kind: 'gave-up', send: true, restarts: 0, result: 'exit-code' } }).toString();
    expect(text).toContain('Subject: Preview: debateai-preview-backup.service failed and stayed down');
    expect(text).toContain('result: exit-code');
  });

  it('takes the unit or a test send from the command line, nothing else (no repeated-crash option)', () => {
    expect(alert.parseAlertArgs(['--unit', unit])).toEqual({ unit, test: false });
    expect(alert.parseAlertArgs(['--test'])).toEqual({ unit: 'debateai-preview-alert-test.service', test: true });
    for (const argv of [[], ['--unit'], ['--unit', unit, '--crash-alert-after', '3'], ['--unit', unit, '--crash-alert-after', '0'], ['--unit', unit, '--extra'], ['--test', '--unit', unit]]) expect(alert.parseAlertArgs(argv)).toBeNull();
  });

  it('a test send ignores the unit state and says plainly that nothing failed', async () => {
    const layout = server();
    const h = harness(layout, { readUnitState: async () => { throw new Error('must not be asked'); } });
    await expect(alert.runAlert({ unit: 'debateai-preview-alert-test.service', test: true, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_SENT', unit: 'debateai-preview-alert-test.service' });
    expect(h.sent[0]).toContain('Subject: Preview: test alert (nothing failed)');
  });

  it('uses winter time for Bucharest outside daylight saving', () => {
    const text = alert.composeAlert({ unit, at: new Date('2026-01-15T10:00:00Z'), lines: [], from: 'noreply@dezbatere.ro', to: owner }).toString();
    expect(text).toContain('Time (Bucharest): 2026-01-15 12:00:00');
  });

  it('rate-limits to one message per unit per 30 minutes, per unit', async () => {
    const layout = server();
    const h = harness(layout);
    await alert.runAlert({ unit, layout, deps: h.deps });
    h.advance(29 * 60 * 1000);
    await alert.runAlert({ unit, layout, deps: h.deps });
    expect(h.sent).toHaveLength(1);
    expect(h.logged[1]).toMatchObject({ event: 'PREVIEW_LIFECYCLE_ALERT_SUPPRESSED', unit });
    await alert.runAlert({ unit: 'debateai-preview-ui.service', layout, deps: h.deps });
    expect(h.sent).toHaveLength(2);
    h.advance(60 * 1000 + 1);
    await alert.runAlert({ unit, layout, deps: h.deps });
    expect(h.sent).toHaveLength(3);
  });

  it('logs its own MAIL_FAILED line with the sendmail exit, and keeps the next alert allowed', async () => {
    const layout = server();
    const run = async () => ({ code: 75, signal: null, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.from('temporary failure') });
    const h = harness(layout, { sendmail: (bytes: Buffer) => alert.submitMail(bytes, { layout, run }) });
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED', unit, reason: 'MAIL_FAILED', exitCode: 75, signal: null, timedOut: false });
    expect(h.logged).toEqual([{ event: 'PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED', unit, reason: 'MAIL_FAILED', exitCode: 75, signal: null, timedOut: false }]);
    expect(existsSync(join(layout.stateDir, 'alert-state'))).toBe(false);
    const g = harness(server(), { sendmail: async () => { throw new Error('postfix down'); } });
    await expect(alert.runAlert({ unit, layout, deps: g.deps })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED', reason: 'MAIL_FAILED' });
  });

  it.each([
    ['two addresses', `${owner}, ${stranger}\n`],
    ['a header injection', `${owner}\r\nBcc: ${stranger}\n`],
    ['two lines', `${owner}\n${stranger}\n`],
    ['an address that is not on the owner list', `${stranger}\n`],
    ['no address', '\n']
  ])('refuses a recipient file with %s', async (_name, text) => {
    const layout = server(text);
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', reason: 'RECIPIENT_REFUSED' });
    expect(h.sent).toEqual([]);
  });

  it('names the mode when the recipient file is readable by others (an editor that saves by rename can do that)', async () => {
    const layout = server(`${owner}\n`, 0o644);
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit, reason: 'RECIPIENT_FILE_MODE_REFUSED', mode: '0644' });
    expect(h.sent).toEqual([]);
  });

  it.each(['x\r\nBcc: y.service', '../etc/passwd', '', 'debateai preview.service'])('refuses unit name %j', async name => {
    const layout = server();
    const h = harness(layout);
    await expect(alert.runAlert({ unit: name, layout, deps: h.deps })).resolves.toMatchObject({ reason: 'UNIT_REFUSED' });
    expect(h.sent).toEqual([]);
  });

  it.each([
    ['database URL password', 'connect postgresql://debateai_prod_staff_recovery:3f9a2b@127.0.0.1:5434/debateai', 'connect postgresql://[REDACTED]@127.0.0.1:5434/debateai'],
    ['key=value secret', 'PASSWORD=hunter2 token: abc123 api_key="zzz"', 'PASSWORD=[REDACTED] token: [REDACTED] api_key="[REDACTED]"'],
    ['bearer header', 'Authorization: Bearer abc.def.ghi', 'Authorization: [REDACTED]'],
    ['email address', 'sent to someone@example.org ok', 'sent to [EMAIL] ok'],
    ['public IPv4 but not loopback', 'from 203.0.113.7 to 127.0.0.1:3101', 'from [IP] to 127.0.0.1:3101'],
    ['long hex', `sha ${'ab'.repeat(32)} done`, 'sha [HEX] done'],
    ['random token', 'cookie-free value Zx9qL2mN8pR4tV6wY1aB3cD5eF7gH0jK end', 'cookie-free value [TOKEN] end'],
    ['JWT', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl x', 'jwt [REDACTED] x'],
    ['a JSON password', '{"password":"hunter2pass"}', '{"password":"[REDACTED]"}'],
    ['a JSON token', '{"token":"tok_live_abc"}', '{"token":"[REDACTED]"}'],
    ['a JSON session and DSN with spaces', '{"session": "s%3Aabc", "dsn" : "postgres://u:p@h/db"}', '{"session": "[REDACTED]", "dsn" : "[REDACTED]"}'],
    ['DB_PASSWORD=', 'DB_PASSWORD=hunter2pass', 'DB_PASSWORD=[REDACTED]'],
    ['PGPASSWORD=', 'PGPASSWORD=hunter2pass psql', 'PGPASSWORD=[REDACTED] psql'],
    ['client_secret=', 'client_secret=abc123&grant_type=client_credentials', 'client_secret=[REDACTED]&grant_type=client_credentials'],
    ['access_token=', 'access_token=ya29.a0AfH6', 'access_token=[REDACTED]'],
    ['NETOPIA_API_KEY=', 'NETOPIA_API_KEY=nk_9fA2', 'NETOPIA_API_KEY=[REDACTED]'],
    ['an x-api-key header', 'x-api-key: abc123', 'x-api-key: [REDACTED]'],
    ['a token-only URL userinfo', 'clone https://ghp_abc123@github.example/x', 'clone https://[REDACTED]@github.example/x'],
    ['a Basic credential', 'header Basic dXNlcjpwYXNzd29yZA== sent', 'header Basic [REDACTED] sent'],
    ['long hex right after an underscore', `digest_${'ab'.repeat(32)} ok`, 'digest_[HEX] ok'],
    ['a padded base64 blob', 'blob dGhpcyBpcyBhIHNlY3JldCB2YWx1ZSBmb3IgdGVzdHM= end', 'blob [TOKEN] end'],
    ['a base64 blob with + and /', 'blob ab+/CDef0123456789ab+/CDef0123456789xy== end', 'blob [TOKEN] end'],
    ["a single-quoted password=", "password='hunter2 pass' ok", "password='[REDACTED]' ok"],
    ["a single-quoted PGPASSWORD=", "PGPASSWORD='hunter2' psql", "PGPASSWORD='[REDACTED]' psql"],
    ['an SQL PASSWORD literal', "ALTER ROLE r PASSWORD 'hunter2' VALID UNTIL 'x'", "ALTER ROLE r PASSWORD '[REDACTED]' VALID UNTIL 'x'"],
    ['an SQL PASSWORD literal in double quotes', 'ALTER ROLE r PASSWORD "hunter2" ok', 'ALTER ROLE r PASSWORD "[REDACTED]" ok'],
    ['a --password flag with a space', 'tool --password hunter2 --verbose', 'tool --password [REDACTED] --verbose'],
    ['a --db-password flag with a quoted value', "tool --db-password 'a b' --verbose", "tool --db-password '[REDACTED]' --verbose"],
    ['a -p flag with a word', 'mysql -u root -p hunter2 db', 'mysql -u root -p [REDACTED] db'],
    ['URL-encoded JSON', 'body=%7B%22password%22%3A%22hunter2%22%7D', 'body={"password":"[REDACTED]"}'],
    ['malformed percent escapes next to an encoded secret', 'q=%E0%A4%22password%22%3A%22hunter2%22 %zz', 'q=%E0%A4"password":"[REDACTED]" %zz'],
    ['URL userinfo with spaces', 'connect postgres://user:pa ss@db.internal/x', 'connect postgres://[REDACTED]@db.internal/x'],
    ['an encoded slash or @ in a URL password (checked before decoding)', 'a postgres://u:p%2Fss@db.internal/x b postgres://u:p%40ss@db.internal/y', 'a postgres://[REDACTED]@db.internal/x b postgres://[REDACTED]@db.internal/y'],
    ['a JSON password with spaces', '{"password": "a b c"}', '{"password": "[REDACTED]"}'],
    ['a JSON password with escaped quotes', '{"password":"a\\"b","x":1}', '{"password":"[REDACTED]","x":1}'],
    ['a JSON password cut before its closing quote', '{"password": "abc', '{"password": "[REDACTED]']
  ])('redacts %s', (_name, line, expected) => {
    expect(alert.redactLine(line)).toBe(expected);
  });

  it('keeps ordinary unit names, release folders and codes readable', () => {
    const line = 'debateai-preview-ui.service: /opt/debateai-v3-preview/releases/auth-dev-candidate-556d79afe7b4-task12-v1-ui PREVIEW_UI_STARTUP_REFUSED';
    expect(alert.redactLine(line)).toBe(line);
  });

  it.each([
    'debateai-preview-api.service: Main process exited, code=exited, status=1/FAILURE',
    'Started debateai-preview-api.service - DebateAI V3 private preview API.',
    '{"event":"PREVIEW_LIFECYCLE_PRESTART_READY","service":"api","registerVersion":"12","verifyMs":12000,"totalMs":13500}',
    'password reset email queued; token bucket refilled after 30s',
    'Consumed 1.234s CPU time, 120.5M memory peak.',
    'pg_isready -h /run/debateai-v3-preview/postgresql -p 5434 accepting connections',
    'mkdir -p /var/backups/debateai-v3-preview done'
  ])('leaves ordinary log text alone: %s', line => {
    expect(alert.redactLine(line)).toBe(line);
  });

  it('never shows the start of a secret token cut at the examined-length limit', () => {
    // Ten long tokens shrink to [TOKEN] each, so the cut tail would land inside the 300 characters shown.
    const secret = ['skZx9qL2mN8pR4tV6wY', '1aB3cD5eF7gH0jKLmNoP'].join('');
    const line = `${`${'xY3'.repeat(66)}xY `.repeat(10)}abcdefghijklmnopq ${secret}`;
    expect(line.indexOf(secret)).toBe(2028);
    const shown = alert.redactLine(line);
    expect(shown).not.toContain(secret.slice(0, 6));
    expect(shown).toBe(`${'[TOKEN] '.repeat(10)}abcdefghijklmnopq`);
  });

  it.each([
    ['a_ run', 'a_'.repeat(1024)],
    ['escaped quotes after a JSON key', `"password":"${'\\"'.repeat(1020)}`],
    ['URL userinfo without @', `postgres://${'a '.repeat(1020)}`],
    ['repeated schemes', 'a://'.repeat(512)],
    ['percent escapes', '%22'.repeat(682)],
    ['malformed percent escapes', '%E0'.repeat(682)],
    ['password words', 'password '.repeat(227)],
    ['password flags', '--password '.repeat(186)],
    ['-p flags', '-p '.repeat(682)],
    ['open single quotes', "password='".repeat(204)],
    ['a long address-like run', 'a.'.repeat(1024)]
  ])('stays under 50 ms on a hostile 2048-character line: %s', (_name, line) => {
    alert.redactLine(line);
    const started = performance.now();
    alert.redactLine(line.slice(0, 2048));
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('stays fast on a hostile, very long identifier', () => {
    const started = Date.now();
    alert.redactLine(`${'a_'.repeat(30000)}password`);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('strips control characters and bounds each line', () => {
    expect(alert.redactLine(`q\u0007r${'x'.repeat(500)}`)).toBe(`qr${'x'.repeat(298)}`);
    expect(alert.redactLine('a\u001b[31mred')).toBe('a[31mred');
  });

  it('submits through sendmail with recipients taken from the headers, never from argv', async () => {
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options }); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; };
    await alert.submitMail(Buffer.from(`To: ${owner}\r\n\r\nx`), { layout: common.LAYOUT, run });
    // -odi: deliver before sendmail exits, so the process-group kill after exit cannot cut a background delivery.
    expect(seen[0].argv).toEqual(['/usr/sbin/sendmail', '-t', '-i', '-odi', '-f', 'noreply@dezbatere.ro']);
    expect(seen[0].argv.join(' ')).not.toContain(owner);
    expect(seen[0].options.env).toEqual({ PATH: '/usr/sbin:/usr/bin:/bin' });
    await expect(alert.submitMail(Buffer.from('x'), { layout: common.LAYOUT, run: async () => ({ code: 75, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) })).rejects.toThrow();
  });

  it('reads the owner fingerprints only from its own root-only owner list', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: ownerList([owner, secondOwner]), listMode: 0o400 });
    const digests = await alert.loadOwnerDigests({ layout });
    expect([...digests].sort()).toEqual([owner, secondOwner].map(digest).sort());
    expect(common.LAYOUT.ownerAlertDigestsPath).toBe('/etc/debateai-v3-preview/lifecycle/owner-alert-digests.json');
  });

  it('carries no address list of its own in the source tree, and no trace of the account-mail allow-list', () => {
    const source = readFileSync(new URL('../../deploy/preview-lifecycle/v1/alert.mjs', import.meta.url), 'utf8');
    const layoutSource = readFileSync(new URL('../../deploy/preview-lifecycle/v1/common.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/recipient-bindings|[0-9a-f]{64}/);
    for (const text of [source, layoutSource]) expect(text).not.toMatch(/preview-mail\/|preview-mail-recipient-installation|mailRecipientInstallationPath|recipientPolicyFromInstallation/);
    expect(Object.keys(common.LAYOUT)).not.toContain('mailRecipientInstallationPath');
  });

  it('never opens or even looks at the account-mail allow-list file, even when one sits next door', async () => {
    const layout = server();
    // A planted allow-list beside the owner list, and the old layout key pointing at it.
    const planted = join(layout.lockRoot, `${ACCOUNT_ALLOW_LIST}.json`);
    writeFileSync(planted, '{}'); chmodSync(planted, 0o600);
    const legacy = { ...layout, mailRecipientInstallationPath: planted };
    touched.length = 0;
    const h = harness(legacy);
    await alert.runAlert({ unit, layout: legacy, deps: h.deps });
    await alert.runAlert({ unit: alert.TEST_UNIT, test: true, layout: server(), deps: h.deps });
    expect(h.sent).toHaveLength(2);
    expect(touched).toContain(layout.ownerAlertDigestsPath);
    expect(touched).toContain(layout.alertRecipientPath);
    expect(touched.filter(path => path.includes(ACCOUNT_ALLOW_LIST) || path.startsWith('/etc/debateai/'))).toEqual([]);
  });

  it.each([
    ['missing', { list: null }],
    ['readable by others', { listMode: 0o644 }],
    ['readable by its group', { listMode: 0o640 }],
    ['executable', { listMode: 0o700 }],
    ['empty', { list: '' }],
    ['not JSON', { list: '{"version":1,"ownerSha256":' }],
    ['another version', { list: JSON.stringify({ version: 2, ownerSha256: [digest(owner)] }) }],
    ['a version written as text', { list: JSON.stringify({ version: '1', ownerSha256: [digest(owner)] }) }],
    ['an extra key', { list: JSON.stringify({ version: 1, ownerSha256: [digest(owner)], to: owner }) }],
    ['a duplicate key', { list: `{"version":1,"ownerSha256":["${'0'.repeat(64)}"],"ownerSha256":["${digest(owner)}"]}` }],
    ['an empty list', { list: JSON.stringify({ version: 1, ownerSha256: [] }) }],
    ['four fingerprints', { list: ownerList([owner, secondOwner, stranger, 'x'.concat('@example.invalid')]) }],
    ['the same fingerprint twice', { list: JSON.stringify({ version: 1, ownerSha256: [digest(owner), digest(owner)] }) }],
    ['an upper-case fingerprint', { list: JSON.stringify({ version: 1, ownerSha256: [digest(owner).toUpperCase()] }) }],
    ['a short fingerprint', { list: JSON.stringify({ version: 1, ownerSha256: [digest(owner).slice(1)] }) }],
    ['a plain address instead of a fingerprint', { list: JSON.stringify({ version: 1, ownerSha256: [owner] }) }],
    ['over 1 KiB', { list: `${ownerList()}${' '.repeat(1024)}` }]
  ])('sends nothing and logs its own reason when the owner list is %s', async (_name, options) => {
    const layout = server(`${owner}\n`, 0o600, options as any);
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit, reason: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    expect(h.sent).toEqual([]);
  });

  it('refuses a recipient whose fingerprint is not on the owner list, even when the list is otherwise perfect', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: ownerList([secondOwner]) });
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit, reason: 'RECIPIENT_REFUSED' });
    expect(h.sent).toEqual([]);
    expect(JSON.stringify(h.logged)).not.toContain(owner);
    expect(JSON.stringify(h.logged)).not.toContain(digest(owner));
  });

  it('a test send also needs the owner list (README step 2 test)', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: null });
    const h = harness(layout);
    await expect(alert.runAlert({ unit: alert.TEST_UNIT, test: true, layout, deps: h.deps })).resolves.toEqual({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', unit: alert.TEST_UNIT, reason: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    expect(h.sent).toEqual([]);
  });

  it('refuses an owner list reached through a symlink, with a second link, in a folder others can write, or owned by someone else', async () => {
    const linked = server();
    const elsewhere = join(linked.stateDir, 'list.json');
    writeFileSync(elsewhere, ownerList()); chmodSync(elsewhere, 0o600);
    // The real list moved away, a symlink in its place.
    const { unlinkSync } = await import('node:fs');
    unlinkSync(linked.ownerAlertDigestsPath); symlinkSync(elsewhere, linked.ownerAlertDigestsPath);
    await expect(alert.loadOwnerDigests({ layout: linked })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    const twoLinks = server();
    linkSync(twoLinks.ownerAlertDigestsPath, join(twoLinks.stateDir, 'second-name.json'));
    await expect(alert.loadOwnerDigests({ layout: twoLinks })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    const open = server();
    chmodSync(open.lockRoot, 0o777);
    await expect(alert.loadOwnerDigests({ layout: open })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    chmodSync(open.lockRoot, 0o775);
    await expect(alert.loadOwnerDigests({ layout: open })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    const other = server();
    await expect(alert.loadOwnerDigests({ layout: { ...other, ownerUid: me.uid + 1 } })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    await expect(alert.loadOwnerDigests({ layout: { ...other, ownerGid: me.gid + 1 } })).rejects.toMatchObject({ code: 'OWNER_ALERT_LIST_UNAVAILABLE' });
  });
});

describe('owner list install helper (alert.mjs --install-owner-list)', () => {
  /** Runs the helper with its real output path (process.stdout) and captures both streams. */
  async function install(layout: any) {
    const out: string[] = [], err: string[] = [];
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => { out.push(String(chunk)); return true; }) as any);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: any) => { err.push(String(chunk)); return true; }) as any);
    try { return { result: await alert.installOwnerList({ layout }), out: out.join(''), err: err.join('') }; } finally { stdout.mockRestore(); stderr.mockRestore(); }
  }
  const neverShows = (text: string) => {
    for (const secret of [owner, digest(owner), secondOwner, digest(secondOwner), 'example.invalid']) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/[0-9a-f]{64}|@/i);
  };

  it('is its own command-line form, with nothing else on the line', () => {
    expect(alert.parseAlertArgs(['--install-owner-list'])).toEqual({ installOwnerList: true });
    for (const argv of [['--install-owner-list', owner], ['--install-owner-list', '--test'], ['--unit', unit, '--install-owner-list']]) expect(alert.parseAlertArgs(argv)).toBeNull();
  });

  it('builds the list from the recipient file, root-only 0600, and prints only a fixed code and the mode', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: null });
    const { result, out, err } = await install(layout);
    expect(result).toEqual({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_INSTALLED', mode: '0600' });
    expect(out).toBe('{"event":"PREVIEW_LIFECYCLE_OWNER_LIST_INSTALLED","mode":"0600"}\n');
    expect(err).toBe('');
    neverShows(out);
    const stat = statSync(layout.ownerAlertDigestsPath);
    expect([stat.mode & 0o777, stat.uid, stat.gid, stat.nlink]).toEqual([0o600, me.uid, me.gid, 1]);
    expect(JSON.parse(readFileSync(layout.ownerAlertDigestsPath, 'utf8'))).toEqual({ version: 1, ownerSha256: [digest(owner)] });
    // No temporary file left behind next to it.
    expect(readdirSync(layout.lockRoot).sort()).toEqual(['alert-recipient', 'owner-alert-digests.json']);
    // And the alert now sends to that owner.
    const h = harness(layout);
    await alert.runAlert({ unit, layout, deps: h.deps });
    expect(h.sent).toHaveLength(1);
  });

  it('a second run with the same recipient changes nothing and says so', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: null });
    await install(layout);
    const before = statSync(layout.ownerAlertDigestsPath);
    const { result, out, err } = await install(layout);
    expect(result).toEqual({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_ALREADY_INSTALLED', mode: '0600' });
    expect(err).toBe('');
    neverShows(out);
    expect(statSync(layout.ownerAlertDigestsPath).ino).toBe(before.ino);
  });

  it('never replaces a list that holds a different owner, and never says whose', async () => {
    const layout = server(`${owner}\n`, 0o600, { list: ownerList([secondOwner]) });
    const original = readFileSync(layout.ownerAlertDigestsPath);
    const { result, out, err } = await install(layout);
    expect(result).toEqual({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', reason: 'OWNER_ALERT_LIST_EXISTS' });
    neverShows(out); expect(err).toBe('');
    expect(readFileSync(layout.ownerAlertDigestsPath)).toEqual(original);
  });

  it.each([
    ['readable by others', `${owner}\n`, 0o644, { reason: 'RECIPIENT_FILE_MODE_REFUSED', mode: '0644' }],
    ['read-only (0400)', `${owner}\n`, 0o400, { reason: 'RECIPIENT_FILE_MODE_REFUSED', mode: '0400' }],
    ['holding two addresses', `${owner}, ${secondOwner}\n`, 0o600, { reason: 'RECIPIENT_REFUSED' }],
    ['holding a header injection', `${owner}\r\nBcc: ${secondOwner}\n`, 0o600, { reason: 'RECIPIENT_REFUSED' }],
    ['empty', '', 0o600, { reason: 'RECIPIENT_REFUSED' }]
  ])('writes nothing when the recipient file is %s', async (_name, text, mode, expected) => {
    const layout = server(text, mode, { list: null });
    const { result, out, err } = await install(layout);
    expect(result).toEqual({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', ...expected });
    neverShows(out); expect(err).toBe('');
    expect(existsSync(layout.ownerAlertDigestsPath)).toBe(false);
    expect(readdirSync(layout.lockRoot)).toEqual(['alert-recipient']);
  });

  it('writes nothing when the recipient file is a symlink, has a second link, or is missing', async () => {
    const linked = server(`${owner}\n`, 0o600, { list: null });
    const target = join(linked.stateDir, 'recipient');
    writeFileSync(target, `${owner}\n`); chmodSync(target, 0o600);
    const { unlinkSync } = await import('node:fs');
    unlinkSync(linked.alertRecipientPath); symlinkSync(target, linked.alertRecipientPath);
    const twoLinks = server(`${owner}\n`, 0o600, { list: null });
    linkSync(twoLinks.alertRecipientPath, join(twoLinks.stateDir, 'recipient-copy'));
    const missing = server(`${owner}\n`, 0o600, { list: null });
    unlinkSync(missing.alertRecipientPath);
    for (const layout of [linked, twoLinks, missing]) {
      const { result, out, err } = await install(layout);
      expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED' });
      expect(['RECIPIENT_REFUSED', 'RECIPIENT_FILE_MODE_REFUSED']).toContain(result.reason);
      neverShows(out); expect(err).toBe('');
      expect(existsSync(layout.ownerAlertDigestsPath)).toBe(false);
    }
  });

  it('writes nothing in a folder others can write, and never writes through a symlink left at the list path', async () => {
    const open = server(`${owner}\n`, 0o600, { list: null });
    chmodSync(open.lockRoot, 0o777);
    const first = await install(open);
    expect(first.result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED' });
    neverShows(first.out);
    expect(existsSync(open.ownerAlertDigestsPath)).toBe(false);
    const trap = server(`${owner}\n`, 0o600, { list: null });
    const victim = join(trap.stateDir, 'victim.json');
    symlinkSync(victim, trap.ownerAlertDigestsPath);
    const second = await install(trap);
    expect(second.result).toEqual({ event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', reason: 'OWNER_ALERT_LIST_UNAVAILABLE' });
    neverShows(second.out); expect(second.err).toBe('');
    expect(existsSync(victim)).toBe(false);
  });
});
