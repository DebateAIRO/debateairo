import { LegalProvidersBody } from "@/components/legal/LegalBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";
import { providerRegister } from "@/lib/legal/pages";
import { readAiProviderCompanies } from "@/lib/legal/providerCompanies";

export const generateMetadata = () => legalPageMetadata("providers");

/**
 * Addition D24 (owner 2026-10-22: providers only, not the models, listed automatically): the rows are the companies
 * the API's declared targets reach, read at request time; with no answer, the whole reviewed catalogue.
 */
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
      billing={await siteFooterBilling()}
    >
      <LegalProvidersBody legalCatalog={legalCatalog} entries={providerRegister(await readAiProviderCompanies())} />
    </LegalPageLayout>
  );
}
