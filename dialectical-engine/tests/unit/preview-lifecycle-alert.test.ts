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
function harness(layout: any, overrides: Record<string, unknown> = {}) {
  const sent: string[] = [], logged: any[] = [];
  let clock = Date.parse('2026-10-09T10:00:00Z');
  const deps = {
    now: () => clock, allowedDigests: allowed,
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
    expect(head.split('\r\n')).toEqual(expect.arrayContaining([`To: ${owner}`, 'From: noreply@dezbatere.ro', `Subject: Preview: ${unit} failed to restart`, 'Content-Type: text/plain; charset=UTF-8', 'Auto-Submitted: auto-generated']));
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
    ['JWT', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl x', 'jwt [REDACTED] x']
  ])('redacts %s', (_name, line, expected) => {
    expect(alert.redactLine(line)).toBe(expected);
  });

  it('keeps ordinary unit names, release folders and codes readable', () => {
    const line = 'debateai-preview-ui.service: /opt/debateai-v3-preview/releases/auth-dev-candidate-556d79afe7b4-task12-v1-ui PREVIEW_UI_STARTUP_REFUSED';
    expect(alert.redactLine(line)).toBe(line);
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
