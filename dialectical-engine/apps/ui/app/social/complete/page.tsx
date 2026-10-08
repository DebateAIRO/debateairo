import { loadNamespace } from '@/lib/i18n/server';
import { cookies, headers } from 'next/headers';
import { SocialCompleteFlow } from '@/components/auth/SocialCompleteFlow';
import { publicTurnstileConfig } from '@/lib/turnstile';
import { isLocale, catalogLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { NONCE_REQUEST_HEADER } from '../../../content-security-policy.mjs';
export default async function SocialCompletePage() {
    const h = await headers();
    const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
    const uiLocale = isLocale(requested) ? requested : 'en';
    const locale = catalogLocale(uiLocale);
    const turnstile = publicTurnstileConfig(process.env.TURNSTILE_SITE_KEY, h.get(NONCE_REQUEST_HEADER) ?? undefined, process.env.NODE_ENV === 'production');
    const catalog = await loadNamespace(uiLocale, 'auth');
    return <SocialCompleteFlow catalog={catalog} turnstile={turnstile} uiLocale={uiLocale} locale={locale}/>;
}
