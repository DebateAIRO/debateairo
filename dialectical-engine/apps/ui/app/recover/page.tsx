"use client";
import { RecoveryFlow } from '@/components/auth/RecoveryFlow';
import { useSelectedAuthCatalog } from '@/components/AuthShell';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
export default function RecoverPage() {
    const { locale } = useChromeI18n();
    const catalog = useSelectedAuthCatalog(locale);
    return <RecoveryFlow catalog={catalog} locale={locale}/>;
}
