import { LegalDocumentBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";
import { loadLegalDocument } from "@/lib/legal/server";

export const generateMetadata = () => legalPageMetadata("privacy");

export default async function PrivacyPage({searchParams}:{searchParams?:Promise<{lang?:string}>}) {
  const { locale, chromeCatalog, legalCatalog } = await loadLegalPageCatalogs((await searchParams)?.lang);
  const document = await loadLegalDocument(locale, "privacy");
  return (
    <LegalPageLayout
      current="privacy"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={document.eyebrow}
      title={t(chromeCatalog, "chrome.legal.privacy")}
      meta={document.title}
      billing={await siteFooterBilling()}
    >
      <LegalDocumentBody document={document} />
      <p className="legalIntro">
        <a href="/privacy/versions">{t(legalCatalog, "legal.privacyVersions.link")}</a>
      </p>
    </LegalPageLayout>
  );
}
