import { LegalProvidersBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("providers");

export default async function ProvidersPage() {
  const { chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  return (
    <LegalPageLayout
      current="providers"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.providers.eyebrow")}
      title={t(legalCatalog, "legal.providers.title")}
      meta={t(legalCatalog, "legal.providers.meta")}
    >
      <LegalProvidersBody legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
