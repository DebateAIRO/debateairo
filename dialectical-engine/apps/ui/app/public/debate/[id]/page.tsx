import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ContractHttpError } from "@debateai/contract";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";
import { MADE_BY_NEWER_RELEASE } from "@/lib/v3/releaseWatch";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import "@/app/v4/v4-base.css";
import "@/app/v4/v4-ask.css";
import "@/app/v4/v4-report.css";
import "./public-lane.css";
import { CouldNotLoadRetry } from "./CouldNotLoad";
import { MadeByNewerRelease } from "./MadeByNewerRelease";
import { PublicDebatePageClient } from "./PublicDebatePageClient";
import { PublicPageNote } from "./PublicPageNote";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { questionLocale } from "@/lib/i18n/questionLocale";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [publicCatalog, timeCatalog, debateChromeCatalog, debateDrawersCatalog, miscCatalog, composeCatalog, homeCatalog, v4Catalog, newDebateCatalog] = await Promise.all([
    loadNamespace(locale, "public"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "debateChrome"),
    loadNamespace(locale, "debateDrawers"),
    loadNamespace(locale, "misc"),
    loadNamespace(locale, "compose"),
    loadNamespace(locale, "home"),
    // Decision 13: the page's contributions, reports and dig box (English for R22, owner N10), and what the ask reads.
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "newDebate")
  ]);
  let debate;
  try {
    // DL3-F1: the public-read budget is per visitor; without the stamped address every
    // server-rendered read would count against one bucket shared by all visitors.
    debate = await createServerContractClient(fetch, undefined, undefined, readTrustedClientIp(await headers())).readPublicDebate(id);
  } catch (failure) {
    // Side-by-side spec §7 (plan C13): a debate a newer version made (the server says so, or its answer does not
    // parse here) is told so plainly.
    // Decision 33: hidden while it is reviewed. One plain line, nothing of the debate, and no search engine keeps it.
    // public-f8: both inside the normal header, with the ways on.
    if (failure instanceof ContractHttpError && failure.serverCode === "DEBATE_UNDER_REVIEW") {
      return <PublicPageNote kind="under-review" v4Catalog={v4Catalog} line={t(v4Catalog, "v4.public.underReview")} />;
    }
    if (failure instanceof ContractHttpError
      && (failure.serverCode === MADE_BY_NEWER_RELEASE || failure.code === "INVALID_RESPONSE")) {
      return <MadeByNewerRelease catalog={await loadNamespace(locale, "chrome")} v4Catalog={v4Catalog} />;
    }
    // public-f7: "not found" only for a debate that does not exist. A passing fault, the read limit or a lost connection
    // says so, with Try again.
    if (failure instanceof ContractHttpError && failure.status === 404) notFound();
    return (
      <PublicPageNote kind="could-not-load" v4Catalog={v4Catalog} line={t(v4Catalog, "v4.public.couldNotLoad")} waysOn={false}>
        <CouldNotLoadRetry catalog={v4Catalog} />
      </PublicPageNote>
    );
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
      v4Catalog={v4Catalog}
      newDebateCatalog={newDebateCatalog}
      crisisCountryHint={readCrisisCountryHint(await headers())}
    />
  );
}
