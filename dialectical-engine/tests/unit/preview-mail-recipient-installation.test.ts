import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const v4 = await import('../../deploy/' + 'preview-mail/v4-20261005/sendmail-owned-preview.mjs');
const template = await import('../../deploy/' + 'preview-mail/v4-20261005/account-mail-template.mjs');

// Made-up addresses only. The real recipient allow-list lives in a root-owned server file, never in Git.
const addresses = {
  'verification-forward-primary': 'forward-primary@example.com',
  'verification-forward-secondary': 'forward-secondary@example.org',
  'verification-direct-and-recovery-proof': 'proof@example.com',
  'recovery-notice-secondary': 'notice@example.org'
} as const;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const allowList = () => Object.fromEntries(Object.entries(addresses).map(([alias, address]) => [alias, digest(address)]));
const installation = () => ({ recipientSha256: allowList(), verificationForwardTarget: addresses['verification-forward-secondary'] });
const ownUid = process.getuid!();
let dir = '';
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'preview-mail-recipients-')); });
afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
async function install(name: string, body: unknown, mode = 0o600) {
  const path = join(dir, name);
  await writeFile(path, typeof body === 'string' ? body : JSON.stringify(body), { mode });
  await chmod(path, mode);
  return path;
}
const refusedConfig = /^OWNED_PREVIEW_MAIL_INSTALLATION_CONFIG$/;

describe('preview mail recipient allow-list is read only from the root-owned installation file', () => {
  it('the public source tree carries no recipient allow-list or digest binding', async () => {
    expect(existsSync(new URL('../../deploy/preview-mail/v4-20261005/recipient-bindings.json', import.meta.url))).toBe(false);
    const wrapper = await readFile(new URL('../../deploy/preview-mail/v4-20261005/sendmail-owned-preview.mjs', import.meta.url), 'utf8');
    expect(wrapper).not.toMatch(/recipient-bindings|[0-9a-f]{64}/);
    const handoff = await readFile(new URL('../../deploy/preview-auth-dev/v1/mail-handoff.mjs', import.meta.url), 'utf8');
    expect(handoff).not.toMatch(/recipient-bindings/);
  });

  it('admits allowed recipients for their purposes and refuses every other recipient', async () => {
    const policy = v4.readInstalledRecipientPolicy(await install('allowed.json', installation()), ownUid);
    expect(policy('verification-v1', addresses['verification-forward-primary'])).toBe(addresses['verification-forward-secondary']);
    expect(policy('verification-v1', addresses['verification-direct-and-recovery-proof'])).toBe(addresses['verification-direct-and-recovery-proof']);
    expect(policy('recovery-v1', addresses['verification-direct-and-recovery-proof'])).toBe(addresses['verification-direct-and-recovery-proof']);
    expect(policy('security-scheduled-v1', addresses['recovery-notice-secondary'])).toBe(addresses['recovery-notice-secondary']);
    for (const [purpose, recipient] of [
      ['verification-v1', 'someone-else@example.com'],
      ['recovery-v1', 'someone-else@example.org'],
      ['verification-v1', addresses['recovery-notice-secondary']],
      ['recovery-v1', addresses['recovery-notice-secondary']],
      ['security-scheduled-v1', addresses['verification-forward-primary']]
    ]) expect(() => policy(purpose, recipient)).toThrow(/^OWNED_PREVIEW_MAIL_PURPOSE_RECIPIENT_REFUSED$/);
  });

  it('fails closed when the installation file is missing', () => {
    expect(() => v4.readInstalledRecipientPolicy(join(dir, 'absent.json'), ownUid)).toThrow(refusedConfig);
  });

  it('fails closed on group/other permissions, a foreign owner, a symlink or a second hard link', async () => {
    const groupReadable = await install('group-readable.json', installation(), 0o640);
    expect(() => v4.readInstalledRecipientPolicy(groupReadable, ownUid)).toThrow(refusedConfig);
    const good = await install('custody.json', installation());
    expect(() => v4.readInstalledRecipientPolicy(good, ownUid + 1)).toThrow(refusedConfig);
    await symlink(good, join(dir, 'symlinked.json'));
    expect(() => v4.readInstalledRecipientPolicy(join(dir, 'symlinked.json'), ownUid)).toThrow(refusedConfig);
    const linked = await install('linked.json', installation());
    await link(linked, join(dir, 'linked-twice.json'));
    expect(() => v4.readInstalledRecipientPolicy(linked, ownUid)).toThrow(refusedConfig);
  });

  it('fails closed on the old forward-target-only shape, extra keys and malformed allow-lists', async () => {
    const { recipientSha256, verificationForwardTarget } = installation();
    const withoutAlias = { ...recipientSha256 }; delete withoutAlias['recovery-notice-secondary'];
    for (const [name, body] of Object.entries({
      'forward-only': { verificationForwardTarget },
      'extra-key': { ...installation(), override: 'x@example.com' },
      'missing-alias': { recipientSha256: withoutAlias, verificationForwardTarget },
      'extra-alias': { recipientSha256: { ...recipientSha256, 'unknown-alias': digest('x@example.com') }, verificationForwardTarget },
      'uppercase-digest': { recipientSha256: { ...recipientSha256, 'verification-forward-primary': recipientSha256['verification-forward-primary']!.toUpperCase() }, verificationForwardTarget },
      'array-allow-list': { recipientSha256: Object.values(recipientSha256), verificationForwardTarget },
      'target-not-secondary': { recipientSha256, verificationForwardTarget: addresses['verification-forward-primary'] },
      'not-json': '{"recipientSha256":'
    })) {
      const path = await install(name + '.json', body);
      expect(() => v4.readInstalledRecipientPolicy(path, ownUid), name).toThrow(refusedConfig);
    }
    expect(() => v4.recipientPolicyFromInstallation({ verificationForwardTarget })).toThrow(refusedConfig);
    expect(v4.recipientPolicyFromInstallation(installation())('verification-v1', addresses['verification-forward-primary'])).toBe(verificationForwardTarget);
  });

  it('the executable path refuses before any process starts when the fixed server file is absent', () => {
    const message = Buffer.from(template.serializeAccountMail({ template: 'verification-v1', recipient: addresses['verification-forward-primary'],
      url: new URL('https://v3-preview.dezbatere.ro/verify-email#token=' + 'Z'.repeat(43)), expiresAt: new Date('2026-10-05T07:41:00Z') }, 'noreply@dezbatere.ro'));
    expect(() => v4.ownedForwardingMessage(message)).toThrow(refusedConfig);
  });
});
