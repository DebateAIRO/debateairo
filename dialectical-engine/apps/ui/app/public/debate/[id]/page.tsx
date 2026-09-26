import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";
import { PublicDebatePageClient } from "./PublicDebatePageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [publicCatalog, timeCatalog, debateChromeCatalog, debateDrawersCatalog, miscCatalog, composeCatalog, homeCatalog] = await Promise.all([
    loadNamespace(locale, "public"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "debateChrome"),
    loadNamespace(locale, "debateDrawers"),
    loadNamespace(locale, "misc"),
    loadNamespace(locale, "compose"),
    loadNamespace(locale, "home")
  ]);
  let debate;
  try {
    // DL3-F1: the public-read budget is per visitor; without the stamped address every
    // server-rendered read would count against one bucket shared by all visitors.
    debate = await createServerContractClient(fetch, undefined, undefined, readTrustedClientIp(await headers())).readPublicDebate(id);
  } catch {
    notFound();
  }
  return (
    <PublicDebatePageClient
      debate={debate}
      locale={locale}
      publicCatalog={publicCatalog}
      timeCatalog={timeCatalog}
      debateChromeCatalog={debateChromeCatalog}
      debateDrawersCatalog={debateDrawersCatalog}
      miscCatalog={miscCatalog}
      composeCatalog={composeCatalog}
      homeCatalog={homeCatalog}
    />
  );
}
