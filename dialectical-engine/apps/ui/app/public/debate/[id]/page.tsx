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
// public-d1 A: the answer card, the trust words and bars, the read-only map and the waiting card are the own map's.
import "@/app/v4/v4-map.css";
import "@/app/v4/v4-map-looks.css";
import "@/app/v4/v4-wait.css";
// Owner screen review (public-f11, public-d2): the public dig flow uses the site's one Undo note and the map's looks.
import "@/app/v4/v4-undo.css";
import "@/app/v4/v4-public.css";
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

/**
 * The public read gives up after this long, so a hung API ends in "We couldn't load this debate just now." with Try again, instead of the grey
 * loading outline staying (Phase A click-through, 4 Nov: it stayed over 60 s).
 */
const PUBLIC_READ_TIMEOUT_MS = 15_000;

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  // public-d1 A: the page is V4's now; the classic workspace's catalogues (time, debateChrome, debateDrawers, misc, compose) are no longer read.
  // home and chrome: the site's AI notice.
  const [publicCatalog, homeCatalog, chromeCatalog, v4Catalog, newDebateCatalog] = await Promise.all([
    loadNamespace(locale, "public"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "chrome"),
    // Decision 13: the page's contributions, reports and dig box (English for R22, owner N10), and what the ask reads.
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "newDebate")
  ]);
  let debate;
  const timeout = AbortSignal.timeout(PUBLIC_READ_TIMEOUT_MS);
  const timedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: init?.signal === undefined || init.signal === null ? timeout : AbortSignal.any([init.signal, timeout]) });
  try {
    // DL3-F1: the public-read budget is per visitor; without the stamped address every
    // server-rendered read would count against one bucket shared by all visitors.
    debate = await createServerContractClient(timedFetch, undefined, undefined, readTrustedClientIp(await headers())).readPublicDebate(id);
  } catch (failure) {
    // A read that ran out of time (even while its body was arriving, which the client calls an invalid answer) is a passing fault, never "newer".
    if (timeout.aborted) {
      return (
        <PublicPageNote kind="could-not-load" v4Catalog={v4Catalog} line={t(v4Catalog, "v4.public.couldNotLoad")} waysOn={false}>
          <CouldNotLoadRetry catalog={v4Catalog} />
        </PublicPageNote>
      );
    }
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
      homeCatalog={homeCatalog}
      chromeCatalog={chromeCatalog}
      v4Catalog={v4Catalog}
      newDebateCatalog={newDebateCatalog}
      crisisCountryHint={readCrisisCountryHint(await headers())}
    />
  );
}
