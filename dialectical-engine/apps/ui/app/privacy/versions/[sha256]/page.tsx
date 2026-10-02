import { notFound } from "next/navigation";
import { LegalArchivedTextBody } from "@/components/legal/LegalArchiveBodies";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { siteFooterBilling } from "@/lib/billing/footerBilling";
import { t } from "@/lib/i18n/translate";
import { archivedLegalText } from "@/lib/legal/archive";
import { legalPageMetadata, loadLegalPageCatalogs } from "@/lib/legal/pageCatalogs";

export const generateMetadata = () => legalPageMetadata("privacy");

/**
 * Ruling Q-3: one archived Privacy Policy text by its sha256. An unknown or malformed hash, another document's hash or a
 * consent sentence's is "not found" (archivedLegalText checks the name, the manifest's archive and the bytes).
 */
export default async function PrivacyVersionTextPage({ params }: Readonly<{ params: Promise<{ sha256: string }> }>) {
  const { locale, chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  const archived = archivedLegalText("PRIVACY", (await params).sha256, locale);
  if (archived === null) notFound();
  return (
    <LegalPageLayout
      current="privacy"
      chromeCatalog={chromeCatalog}
      legalCatalog={legalCatalog}
      eyebrow={t(chromeCatalog, "chrome.legal.privacy")}
      title={t(legalCatalog, "legal.archive.title", { version: archived.version })}
      meta={t(legalCatalog, "legal.archive.meta")}
      billing={await siteFooterBilling()}
    >
      <LegalArchivedTextBody kind="PRIVACY" archived={archived} legalCatalog={legalCatalog} />
    </LegalPageLayout>
  );
}
