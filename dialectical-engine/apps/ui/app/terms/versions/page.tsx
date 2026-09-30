import { LegalVersionsBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("versions");

export default async function TermsVersionsPage() {
  const { chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  return (
    <LegalPageLayout
      current="versions"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.versions.eyebrow")}
      title={t(legalCatalog, "legal.versions.title")}
      meta={t(legalCatalog, "legal.versions.meta")}
    >
      <LegalVersionsBody legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
