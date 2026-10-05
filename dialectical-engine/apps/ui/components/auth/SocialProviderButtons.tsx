"use client";
import { useEffect, useState } from 'react';
import { AuthProvidersResponseSchema, type AuthProvidersResponse, type ContractClient } from '@debateai/contract';
export function SocialProviderButtons({ client, navigate = (url: string) => window.location.assign(url) }: {
    client: Partial<Pick<ContractClient, 'authProviders' | 'beginSocialLogin'>>;
    navigate?: (url: string) => void;
}) {
    const [providers, setProviders] = useState<AuthProvidersResponse['providers']>([]), [busy, setBusy] = useState(false), [error, setError] = useState(false);
    useEffect(() => { let active = true; if (client.authProviders)
        void client.authProviders().then(value => { const parsed = AuthProvidersResponseSchema.safeParse(value); if (active && parsed.success)
            setProviders(parsed.data.providers); }).catch(() => { }); return () => { active = false; }; }, [client]);
    if (!providers.length || !client.beginSocialLogin)
        return null;
    return <div aria-label="Other ways to sign in">{providers.map(provider => <button key={provider.id} type="button" className="authSecondaryButton" disabled={busy} onClick={async () => { setBusy(true); setError(false); try {
        const requested=new URLSearchParams(window.location.search).get('next');const next=requested==='/settings'||requested==='/account'?requested:'/';const result = await client.beginSocialLogin!(provider.id, {next});
        navigate(result.authorization_url);
    }
    catch {
        setError(true);
        setBusy(false);
    } }}>Continue with {provider.name}</button>)}{error ? <p role="alert">Sign-in is unavailable. Please try again.</p> : null}</div>;
}
