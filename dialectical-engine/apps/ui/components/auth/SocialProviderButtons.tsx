"use client";
import { useEffect, useRef, useState } from 'react';
import { AuthProvidersResponseSchema, type AuthProvidersResponse, type ContractClient } from '@debateai/contract';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { safeSocialReturnPath } from '@/lib/returnPath';
export function SocialProviderButtons({ client, catalog, navigate = (url: string) => window.location.assign(url), onBegin, disabled = false }: {
    client: Partial<Pick<ContractClient, 'authProviders' | 'beginSocialLogin'>>;
    catalog: MessageCatalog;
    navigate?: (url: string) => void;
    onBegin?: () => void;
    disabled?: boolean;
}) {
    const [providers, setProviders] = useState<AuthProvidersResponse['providers']>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const flight = useRef(false);
    useEffect(() => {
        let active = true;
        if (client.authProviders)
            void client.authProviders().then(value => {
                const parsed = AuthProvidersResponseSchema.safeParse(value);
                if (active && parsed.success)
                    setProviders(parsed.data.providers);
            }).catch(() => {
            });
        return () => {
            active = false;
        };
    }, [client]);
    if (!providers.length || !client.beginSocialLogin)
        return null;
    return <div className="authSocial" role="group" aria-label={t(catalog, "auth.social.methods")}>{providers.map(provider => <button key={provider.id} type="button" className="authSecondaryButton" disabled={busy || disabled} onClick={async () => {
                if (flight.current || disabled)
                    return;
                flight.current = true;
                onBegin?.();
                setBusy(true);
                setError(false);
                try {
                    const next = safeSocialReturnPath(new URLSearchParams(window.location.search).get('next'));
                    const result = await client.beginSocialLogin!(provider.id, { next });
                    navigate(result.authorization_url);
                }
                catch {
                    setError(true);
                    flight.current = false;
                    setBusy(false);
                }
            }}>{t(catalog, "auth.social.continue", { provider: provider.name })}</button>)}{error ? <p className="authFieldError" role="alert">{t(catalog, "auth.social.unavailable")}</p> : null}</div>;
}
