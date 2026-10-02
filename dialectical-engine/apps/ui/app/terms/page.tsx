import { LegalDocumentBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";
import { loadLegalDocument } from "@/lib/legal/server";

export const generateMetadata = () => legalPageMetadata("terms");

export default async function TermsPage() {
  const { locale, chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  const document = await loadLegalDocument(locale, "terms");
  return (
    <LegalPageLayout
      current="terms"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={document.eyebrow}
      title={t(chromeCatalog, "chrome.legal.terms")}
      meta={document.title}
    >
      <LegalDocumentBody document={document} />
    </LegalPageLayout>
  );
}
