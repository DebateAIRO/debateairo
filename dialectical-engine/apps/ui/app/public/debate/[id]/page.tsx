import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerContractClient } from "@/lib/serverApi";
import { PublicDebatePageClient } from "./PublicDebatePageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const timeCatalog = await loadNamespace(locale, "time");
  let debate;
  try {
    debate = await createServerContractClient().readPublicDebate(id);
  } catch {
    notFound();
  }
  return <PublicDebatePageClient debate={debate} timeCatalog={timeCatalog} />;
}
