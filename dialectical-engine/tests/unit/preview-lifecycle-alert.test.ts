import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const alert = await import('../../deploy/' + 'preview-lifecycle/v1/alert.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const me = { uid: process.getuid!(), gid: process.getgid!() };
const owner = 'owner@example.test';
const allowed = new Set([createHash('sha256').update(owner).digest('hex')]);
const unit = 'debateai-preview-api.service';

function server(recipient = `${owner}\n`, mode = 0o600) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-alert-')));
  const layout = { ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid, lockRoot: join(base, 'lifecycle'), alertRecipientPath: join(base, 'lifecycle', 'alert-recipient'), stateDir: join(base, 'state') };
  mkdirSync(layout.lockRoot); chmodSync(layout.lockRoot, 0o755);
  mkdirSync(layout.stateDir); chmodSync(layout.stateDir, 0o700);
  writeFileSync(layout.alertRecipientPath, recipient); chmodSync(layout.alertRecipientPath, mode);
  return layout;
}
const gaveUp = { result: 'start-limit-hit', nRestarts: 3, activeState: 'failed', subState: 'failed' };
const restarting = { result: 'exit-code', nRestarts: 1, activeState: 'activating', subState: 'auto-restart' };
function harness(layout: any, overrides: Record<string, unknown> = {}) {
  const sent: string[] = [], logged: any[] = [];
  let clock = Date.parse('2026-10-09T10:00:00Z');
  const deps = {
    now: () => clock, allowedDigests: allowed, readUnitState: async () => gaveUp,
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

  it('emails "restarting after a crash" once crashes repeat, when the owner asked for that', async () => {
    const layout = server();
    const h = harness(layout, { readUnitState: async () => ({ ...restarting, nRestarts: 2 }) });
    await alert.runAlert({ unit, layout, deps: h.deps, crashAlertAfter: 3 });
    expect(h.sent).toEqual([]);
    await alert.runAlert({ unit, layout, deps: h.deps, crashAlertAfter: 2 });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain(`Subject: Preview: ${unit} is restarting after a crash`);
    expect(h.sent[0]).toContain('systemd is restarting it by itself (2 automatic restarts so far)');
    expect(h.sent[0]).not.toContain('gave up');
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

  it('takes the unit, an optional repeated-crash threshold, or a test send from the command line, nothing else', () => {
    expect(alert.parseAlertArgs(['--unit', unit])).toEqual({ unit, crashAlertAfter: null, test: false });
    expect(alert.parseAlertArgs(['--unit', unit, '--crash-alert-after', '3'])).toEqual({ unit, crashAlertAfter: 3, test: false });
    expect(alert.parseAlertArgs(['--test'])).toEqual({ unit: 'debateai-preview-alert-test.service', crashAlertAfter: null, test: true });
    for (const argv of [[], ['--unit'], ['--unit', unit, '--crash-alert-after', '0'], ['--unit', unit, '--crash-alert-after', 'x'], ['--unit', unit, '--extra'], ['--test', '--unit', unit]]) expect(alert.parseAlertArgs(argv)).toBeNull();
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

  it('fails quietly to the journal and keeps the next alert allowed when mail fails', async () => {
    const layout = server();
    const h = harness(layout, { sendmail: async () => { throw new Error('postfix down'); } });
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', reason: 'MAIL_FAILED' });
    expect(existsSync(join(layout.stateDir, 'alert-state'))).toBe(false);
  });

  it.each([
    ['two addresses', `${owner}, other@example.test\n`],
    ['a header injection', `${owner}\r\nBcc: other@example.test\n`],
    ['two lines', `${owner}\nother@example.test\n`],
    ['an address that is not already approved for preview mail', 'stranger@example.test\n'],
    ['no address', '\n']
  ])('refuses a recipient file with %s', async (_name, text) => {
    const layout = server(text);
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', reason: 'RECIPIENT_REFUSED' });
    expect(h.sent).toEqual([]);
  });

  it('refuses a recipient file other users can read', async () => {
    const layout = server(`${owner}\n`, 0o644);
    const h = harness(layout);
    await expect(alert.runAlert({ unit, layout, deps: h.deps })).resolves.toMatchObject({ reason: 'RECIPIENT_REFUSED' });
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
    ['a base64 blob with + and /', 'blob ab+/CDef0123456789ab+/CDef0123456789xy== end', 'blob [TOKEN] end']
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
    'Consumed 1.234s CPU time, 120.5M memory peak.'
  ])('leaves ordinary log text alone: %s', line => {
    expect(alert.redactLine(line)).toBe(line);
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
    expect(seen[0].argv).toEqual(['/usr/sbin/sendmail', '-t', '-i', '-f', 'noreply@dezbatere.ro']);
    expect(seen[0].argv.join(' ')).not.toContain(owner);
    expect(seen[0].options.env).toEqual({ PATH: '/usr/sbin:/usr/bin:/bin' });
    await expect(alert.submitMail(Buffer.from('x'), { layout: common.LAYOUT, run: async () => ({ code: 75, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) })).rejects.toThrow();
  });

  it('accepts only addresses whose fingerprint the reviewed preview mail bindings already approve', async () => {
    const digests = await alert.loadApprovedRecipientDigests();
    expect(digests.size).toBe(4);
    for (const value of digests) expect(value).toMatch(/^[a-f0-9]{64}$/);
  });
});
