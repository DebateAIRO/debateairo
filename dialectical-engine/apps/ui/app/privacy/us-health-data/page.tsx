import { LegalHealthBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("health");

export default async function HealthDataPage() {
  const { chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  return (
    <LegalPageLayout
      current="health"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(legalCatalog, "legal.health.eyebrow")}
      title={t(legalCatalog, "legal.health.title")}
      meta={t(legalCatalog, "legal.health.meta")}
    >
      <LegalHealthBody legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
