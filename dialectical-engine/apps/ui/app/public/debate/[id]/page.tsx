import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ContractHttpError } from "@debateai/contract";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";
import { MADE_BY_NEWER_RELEASE } from "@/lib/v3/releaseWatch";
import { MadeByNewerRelease } from "./MadeByNewerRelease";
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
  } catch (failure) {
    // Side-by-side spec §7 (plan C13): a debate a newer version made (the server says so, or its answer does not
    // parse here) is told so plainly; every other refusal stays "not found".
    if (failure instanceof ContractHttpError
      && (failure.serverCode === MADE_BY_NEWER_RELEASE || failure.code === "INVALID_RESPONSE")) {
      return <MadeByNewerRelease catalog={await loadNamespace(locale, "chrome")} />;
    }
    notFound();
  }
  // The language the debate was argued in, as the snapshot recorded it (spec
  // 2026-09-26 §14.3); an older snapshot without one keeps the reader's.
  const storyLocale = questionLocale(debate.language, locale);
  // The short story's fixed words are read in that language, whatever the interface's.
  const storyCatalog = storyLocale === locale ? publicCatalog : await loadNamespace(storyLocale, "public");
  return (
    <PublicDebatePageClient
      debate={debate}
      locale={locale}
      storyLocale={storyLocale}
      storyCatalog={storyCatalog}
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
