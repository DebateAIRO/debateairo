"use client";
import { RecoveryHelpFlow } from '@/components/auth/RecoveryHelpFlow';
import { useSelectedAuthCatalog } from '@/components/AuthShell';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
export default function RecoverHelpPage() {
    const { locale } = useChromeI18n();
    const catalog = useSelectedAuthCatalog(locale);
    return <RecoveryHelpFlow catalog={catalog} locale={locale}/>;
}
