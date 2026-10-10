import { describe, it, expect } from 'vitest';
import { renderAccountEmail, serializeAccountMail, type AccountMailInput } from '../../apps/api/src/account-mail-template.mjs';
const expiresAt = new Date('2026-10-05T12:00:00Z'), recipient = 'primary@example.test';
describe('consumer recovery and security mail purposes', () => {
    it('renders a separate15minute recovery proof purpose and never calls email alone recovery', () => {
        const input = { template: 'consumer-recovery-v1', recipient, expiresAt, url: new URL('https://preview.dezbatere.ro/recover#token=' + 'a'.repeat(43)) } as AccountMailInput;
        const mail = renderAccountEmail(input);
        expect(mail.text).toContain('15 minutes');
        expect(mail.text).toContain('saved recovery code');
        expect(mail.text).not.toContain('Confirm recovery email');
        expect(serializeAccountMail(input, 'noreply@dezbatere.ro')).toContain('X-Account-Template: consumer-recovery-v1');
    });
    // Design note 2026-10-09 item 3: every verified email is told when a recovery code is used; codes are not refilled.
    // Review D3 2026-10-09: the same mail goes out for sign-in, a security confirmation (step-up) and account-recovery
    // proof, so it says "was just used", never "to sign in". The prose is English only; locales format the time.
    it('tells the owner in plain words that a recovery code was just used, with no link and no code', () => {
        const input = { template: 'security-recovery-code-used-v1', recipient, expiresAt, messageId: '11111111-1111-4111-8111-111111111111' } as AccountMailInput;
        const mail = renderAccountEmail(input);
        expect(mail.text).toContain('One of your recovery codes was just used.');
        expect(mail.text).not.toContain('to sign in');
        expect(renderAccountEmail({ ...input, display: { locale: 'ro', timeZone: 'Europe/Bucharest' } }).text).toContain('One of your recovery codes was just used.');
        expect(mail.text).toContain("If this wasn't you,");
        expect(mail.text).not.toMatch(/https?:\/\//u);
        expect(serializeAccountMail(input, 'noreply@dezbatere.ro')).toContain('X-Account-Template: security-recovery-code-used-v1');
    });
    it('marks actual English prose as English and only localized date fragments with their own language', () => {
        const mail = renderAccountEmail({ template: 'verification-v1', recipient, expiresAt, url: new URL('https://preview.dezbatere.ro/verify-email#token=' + 'a'.repeat(43)), display: { locale: 'ro', timeZone: 'Europe/Bucharest' } });
        expect(mail.html).toContain('<html lang="en">');
        expect(mail.html).toContain('<span lang="ro">');
    });
});
