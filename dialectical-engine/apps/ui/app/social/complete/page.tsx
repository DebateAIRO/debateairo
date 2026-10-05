import { cookies, headers } from 'next/headers';
import { SocialCompleteFlow } from '@/components/auth/SocialCompleteFlow';
import { publicTurnstileConfig } from '@/lib/turnstile';
import { isLocale, catalogLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { NONCE_REQUEST_HEADER } from '../../../content-security-policy.mjs';
export default async function SocialCompletePage() { const h = await headers(), requested = (await cookies()).get(LOCALE_COOKIE)?.value, uiLocale = isLocale(requested) ? requested : 'en', locale = catalogLocale(uiLocale); const turnstile = publicTurnstileConfig(process.env.TURNSTILE_SITE_KEY, h.get(NONCE_REQUEST_HEADER) ?? undefined, process.env.NODE_ENV === 'production'); return <SocialCompleteFlow turnstile={turnstile} uiLocale={uiLocale} locale={locale}/>; }
