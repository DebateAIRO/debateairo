// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SignUpFlow } from '../../apps/ui/components/SignUpFlow.js';
it('renders only a server-advertised provider and does not advertise unconfigured providers', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const client = { register: vi.fn(), checkAge: vi.fn(), authProviders: async () => ({ providers: [{ id: 'google', name: 'Google' }] }), beginSocialLogin: vi.fn() };
    try {
        await act(async () => root.render(<SignUpFlow client={client}/>));
        const buttons = [...host.querySelectorAll('button')].map(x => x.textContent);
        expect(buttons).toContain('Continue with Google');
        expect(buttons.join(' ')).not.toMatch(/Continue with (Apple|Facebook|X)/);
    }
    finally {
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    }
});
import { SocialCompleteFlow } from '../../apps/ui/components/auth/SocialCompleteFlow.js';
import type { ContractClient } from '@debateai/contract';
it('scrubs a signup continuation before fetching prefill and renders required manual phone without password or provider phone data', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/social/complete#kind=signup&token=' + 'a'.repeat(43));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const client = { socialSignupStatus: async () => { expect(window.location.hash).toBe(''); return { provider: 'apple', email: 'relay@privaterelay.appleid.com', name: '<script>untrusted name</script>', expires_at: new Date(Date.now() + 300000).toISOString() }; } } as unknown as ContractClient;
    try {
        await act(async () => root.render(<SocialCompleteFlow client={client}/>));
        expect(host.querySelector<HTMLInputElement>('input[name=email]')?.value).toBe('relay@privaterelay.appleid.com');
        expect(host.querySelector<HTMLInputElement>('input[name=phone]')?.type).toBe('tel');
        expect(host.querySelector('input[type=password]')).toBeNull();
        expect(host.querySelector('script')).toBeNull();
        expect(host.textContent).toContain('<script>untrusted name</script>');
        expect(host.querySelector('form')?.noValidate).toBe(true);
    }
    finally {
        await act(async () => root.unmount());
        host.remove();
        window.history.replaceState(null, '', '/');
        vi.unstubAllGlobals();
    }
});
