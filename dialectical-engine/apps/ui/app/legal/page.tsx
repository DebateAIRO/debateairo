import { LegalNoticeBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { COMPANY } from "@/lib/legal/pages";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("notice");

export default async function LegalNoticePage() {
  const [{ locale, chromeCatalog, legalCatalog }, billing] = await Promise.all([loadLegalPageCatalogs(), siteFooterBilling()]);
  return (
    <LegalPageLayout
      current="notice"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.notice.eyebrow")}
      title={t(legalCatalog, "legal.notice.title")}
      meta={t(legalCatalog, "legal.notice.meta", { product: COMPANY.tradingNames[0] ?? COMPANY.legalName })}
      billing={billing}
    >
      <LegalNoticeBody legalCatalog={legalCatalog} chromeCatalog={chromeCatalog} locale={locale} billingOn={billing.billingOn} />
    </LegalPageLayout>
  );
}
