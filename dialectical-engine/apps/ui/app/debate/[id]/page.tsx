import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import type { Answer, AnswerFloor, DebateMapView } from "@debateai/contract";
import DebatePageGate from "./DebatePageGate";
import { getDebateServer, questionLanguageTagOf, readSessionCookie, readTrustedClientIp } from "@/lib/serverApi";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { CrisisCountryHintProvider } from "@/components/CheckRemovalNotice";
import type { DebateDetail } from "@/lib/types";
import { debateDetailFromRunProjection } from "@/lib/v3/adapter";
import { isLocale, LOCALE_COOKIE, type LocaleCode } from "@/lib/i18n/locales";
import { questionLocale } from "@/lib/i18n/questionLocale";
import { loadNamespace } from "@/lib/i18n/server";
import { runFailureMessage } from "@/lib/v3/runFailure";

export const dynamic = "force-dynamic";

function DebatePageWithCountryHint({ countryHint, ...gateProps }: ComponentProps<typeof DebatePageGate> & { countryHint: string | null }) {
  return <CrisisCountryHintProvider countryHint={countryHint}>
    <DebatePageGate {...gateProps} />
  </CrisisCountryHintProvider>;
}

export default async function DebatePage({
  params,
  searchParams = Promise.resolve({})
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ starting?: string }>;
}) {
  const { id } = await params;
  const starting = (await searchParams).starting === "1";
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [
    timeCatalog,
    debateChromeCatalog,
    debateDrawersCatalog,
    miscCatalog,
    publicCatalog,
    composeCatalog,
    homeCatalog,
    newDebateCatalog
  ] = await Promise.all([
    loadNamespace(locale, "time"),
    loadNamespace(locale, "debateChrome"),
    loadNamespace(locale, "debateDrawers"),
    loadNamespace(locale, "misc"),
    loadNamespace(locale, "public"),
    loadNamespace(locale, "compose"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "newDebate")
  ]);
  const countryHint = readCrisisCountryHint(await headers());

  // The accepted ask already owns a durable run id. Do not make the client
  // transition wait behind the runner's private-content lease: mount the
  // authenticated coordinator shell immediately and let its event stream and
  // bounded projection retry populate the debate. Direct visits and reloads
  // retain the full asker-scoped SSR read below.
  if (starting) {
    return (
      <DebatePageWithCountryHint
        countryHint={countryHint}
        id={id}
        initialDebate={null}
        initialAnswer={null}
        initialError={null}
        initialPending
        timeCatalog={timeCatalog}
        debateChromeCatalog={debateChromeCatalog}
        debateDrawersCatalog={debateDrawersCatalog}
        miscCatalog={miscCatalog}
        publicCatalog={publicCatalog}
        composeCatalog={composeCatalog}
        homeCatalog={homeCatalog}
        newDebateCatalog={newDebateCatalog}
        storyLocale={locale}
        storyCatalog={publicCatalog}
        initialFloor={null}
        initialMapView={null}
      />
    );
  }
  const token = readSessionCookie(cookieStore);
  const userAgent = (await headers()).get("user-agent") ?? undefined;

  // SSR reads the asker-scoped projection with the identity cookie (S05).
  // If no answer has been served, the typed run projection distinguishes a
  // real generating/failed run from an honestly nonexistent id.
  let initialDebate: DebateDetail | null = null;
  let initialAnswer: Answer | null = null;
  let initialPending = true;
  let initialError: string | null = null;
  // A components-only answer's floor (spec 2026-09-26 §14.4.4), read beside
  // the answer; null when there is none or it could not be read.
  let initialFloor: AnswerFloor | null = null;
  let initialMapView: DebateMapView | null = null;
  // The language the debate was argued in (spec 2026-09-26 §14.3); the page
  // offers to switch to it when it differs from the reader's.
  let questionLanguage: LocaleCode | null = null;

  if (token !== null) {
    const result = await getDebateServer(
      id,
      token,
      undefined,
      userAgent,
      readTrustedClientIp(await headers()),
      composeCatalog
    );
    const questionTag = questionLanguageTagOf(result);
    questionLanguage = questionTag === null ? null : questionLocale(questionTag, locale);
    if (result.ok) {
      initialDebate = result.debate;
      initialAnswer = result.answer;
      initialFloor = result.floor;
      initialMapView = result.mapView ?? null;
      initialPending = false;
    } else if (result.kind === "loading") {
      initialDebate = debateDetailFromRunProjection(result.run, composeCatalog, locale);
      initialPending = true;
    } else if (result.kind === "failed") {
      initialDebate = debateDetailFromRunProjection(result.run, composeCatalog, locale);
      initialError = runFailureMessage(result.reason, debateChromeCatalog);
      initialPending = false;
    } else if (result.kind === "not_found") {
      // S01-R39: a deleted debate's notice is taken by this segment's not-found page, from the browser.
      notFound();
    }
  }
  // The verdict story strip speaks the question's language (spec 2026-09-26
  // §14.3): its fixed words come from that locale's `public` catalogue. With no
  // language learned (no read, or none recorded) it keeps the reader's; `und`
  // and unknown tags already name the reader's locale.
  const storyLocale = questionLanguage ?? locale;
  const storyCatalog = storyLocale === locale ? publicCatalog : await loadNamespace(storyLocale, "public");

  return (
    <DebatePageWithCountryHint
      countryHint={countryHint}
      id={id}
      initialDebate={initialDebate}
      initialAnswer={initialAnswer}
      initialError={initialError}
      initialPending={initialPending}
      timeCatalog={timeCatalog}
      debateChromeCatalog={debateChromeCatalog}
      debateDrawersCatalog={debateDrawersCatalog}
      miscCatalog={miscCatalog}
      publicCatalog={publicCatalog}
      composeCatalog={composeCatalog}
      homeCatalog={homeCatalog}
      newDebateCatalog={newDebateCatalog}
      questionLocale={questionLanguage}
      storyLocale={storyLocale}
      storyCatalog={storyCatalog}
      initialFloor={initialFloor}
      initialMapView={initialMapView}
    />
  );
}
