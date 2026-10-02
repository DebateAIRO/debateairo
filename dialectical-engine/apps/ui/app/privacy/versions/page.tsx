import { LegalArchiveVersionsBody } from "@/components/legal/LegalArchiveBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("privacy");

export default async function PrivacyVersionsPage() {
  const { locale, chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  return (
    <LegalPageLayout
      current="privacy"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.privacyVersions.eyebrow")}
      title={t(legalCatalog, "legal.privacyVersions.title")}
      meta={t(legalCatalog, "legal.privacyVersions.meta")}
      billing={await siteFooterBilling()}
    >
      <LegalArchiveVersionsBody kind="PRIVACY" locale={locale} legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
