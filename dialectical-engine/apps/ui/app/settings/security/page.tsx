import { cookies } from 'next/headers';
import { SecuritySettingsPageClient } from '@/components/SecuritySettings';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { loadNamespace } from '@/lib/i18n/server';
export default async function SecurityPage() {
    const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale = isLocale(requested) ? requested : 'en';
    const [catalog, settingsCatalog, publicCatalog, newDebateCatalog] = await Promise.all([loadNamespace(locale, 'auth'), loadNamespace(locale, 'settings'), loadNamespace(locale, 'public'), loadNamespace(locale, 'newDebate')]);
    return <SecuritySettingsPageClient catalog={settingsCatalog} authCatalog={catalog} publicCatalog={publicCatalog} newDebateCatalog={newDebateCatalog} locale={locale}/>;
}
