import { LegalCookiesBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("cookies");

export default async function CookiesPage() {
  const { chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  return (
    <LegalPageLayout
      current="cookies"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.cookies.eyebrow")}
      title={t(legalCatalog, "legal.cookies.title")}
      meta={t(legalCatalog, "legal.cookies.meta")}
      billing={await siteFooterBilling()}
    >
      <LegalCookiesBody legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
