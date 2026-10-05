import { cookies } from 'next/headers';
import { SecurityActionResume } from '@/components/auth/SecurityActionResume';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { loadNamespace } from '@/lib/i18n/server';
export default async function SecurityPage() {
    const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale = isLocale(requested) ? requested : 'en';
    const [catalog, settingsCatalog, publicCatalog] = await Promise.all([loadNamespace(locale, 'auth'), loadNamespace(locale, 'settings'), loadNamespace(locale, 'public')]);
    return <SecurityActionResume catalog={catalog} settingsCatalog={settingsCatalog} publicCatalog={publicCatalog} locale={locale}/>;
}
