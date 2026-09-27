import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";
import { PublicDebatePageClient } from "./PublicDebatePageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { questionLocale } from "@/lib/i18n/questionLocale";
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
  // The language the debate was argued in, as the snapshot recorded it (spec
  // 2026-09-26 §14.3); an older snapshot without one keeps the reader's.
  const storyLocale = questionLocale(debate.language, locale);
  return (
    <PublicDebatePageClient
      debate={debate}
      locale={locale}
      storyLocale={storyLocale}
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
