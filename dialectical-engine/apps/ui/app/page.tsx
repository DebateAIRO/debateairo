import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { cookies, headers } from "next/headers";
import { createServerContractClient, USER_TOKEN_COOKIE, listDebatesPageServer } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { DebatesBuffer, PublicDebatesBuffer } from "@/components/DebatesBuffer";
import { LandingPage } from "@/components/landing/LandingPage";
import { SupportWidget } from "@/components/support/SupportWidget";
import type { ContractClient } from "@debateai/contract";
import type { DebateSummary } from "@/lib/types";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  // UI-01 (S05): the V3 answer index is asker-scoped; without a server session
  // cookie the list honestly stays empty with a sign-in hint — never an
  // anonymous global listing.
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_TOKEN_COOKIE)?.value ?? null;
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [homeCatalog, timeCatalog, chromeCatalog] = await Promise.all([
    loadNamespace(locale, "home"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "chrome")
  ]);
  const catalog = Object.freeze({ ...homeCatalog, ...chromeCatalog });
  if (token === null) return <><LandingPage catalog={catalog} /><SupportWidget /></>;
  const requestedTab = (await searchParams).tab;
  const tab: "yours" | "public" =
    requestedTab === "yours" || requestedTab === "public"
      ? requestedTab
      : token !== null ? "yours" : "public";
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  let debates: DebateSummary[] = [];
  let error: string | null = null;
  let sessionConfirmed = false;
  let published: Awaited<ReturnType<ContractClient["readPublicDebates"]>> = { items: [], total: 0 };
  let publishedError: string | null = null;
  try {
    published = await createServerContractClient(fetch, undefined, userAgent).readPublicDebates(50, 0);
  } catch {
    publishedError = t(catalog, "home.publishedUnavailable");
  }
  if (token === null) {
    error = t(catalog, "home.signInToStart");
  } else {
    try {
      const page = await listDebatesPageServer(token, undefined, userAgent);
      debates = page.summaries;
      sessionConfirmed = true;
    } catch {
      error = t(catalog, "home.sessionUnconfirmed");
    }
  }

  // V's ruling of 2026-09-20: the chip counts what is on screen. It used to
  // show the account-wide or corpus-wide aggregate, so a reader saw "41 TOTAL"
  // standing over four rows and "37 TOTAL" over three. fd82d84e had already
  // derived it from the rendered rows; the 690ebe14 merge kept that slice's
  // test and dropped the change.
  const count = tab === "yours" ? debates.length : published.items.length;

  // The list wrappers carry `recentList` beside `libList`. `recentList` is the
  // name the T3-C2 slice used and the one t3-library still selects on; the
  // 690ebe14 merge discarded it with the rest of that side. The two rules are
  // identical (globals.css:2325 and :6765), so carrying both recovers the
  // dropped name with no visual change.

  return (
    <div className="screen scroll libScreen">
      <div className="libInner">
        <p className="libEyebrow">{t(catalog, "home.reasoningInstrument")}</p>
        <h1 className="libTitle">{t(catalog, "home.title")}</h1>
        <p className="libLede">
          {t(catalog, "home.lede")}
        </p>

        {error ? (
          <div className="error" style={{ marginTop: 18 }}>
            <p>{error}</p>
            <div className="formActions">
              <Link className="btn" href="/login">{t(catalog, token === null ? "home.logIn" : "home.signInAgain")}</Link>
              {token === null ? (
                <Link className="btn btnDark" href="/sign-up">{t(catalog, "home.createAccount")}</Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* The composer is the workspace and renders only for a confirmed
            session; an unconfirmed one gets the notice above instead. */}
        {sessionConfirmed ? (
          <section data-support-primary-control id="start-a-debate" aria-label={t(catalog, "home.startDebateLabel")}>
            <LibraryComposer catalog={catalog} />
          </section>
        ) : null}

        <div className="libAiDisclosure"><AiNotice catalog={catalog} /></div>

        <div className="libTabs sectionHead" aria-label={t(catalog, "chrome.library")}>
          <Link
            aria-current={tab === "yours" ? "page" : undefined}
            href="/?tab=yours"
            className="libTab"
          >
            {t(catalog, "home.yourDebates")}
          </Link>
          <Link
            aria-current={tab === "public" ? "page" : undefined}
            href="/?tab=public"
            className="libTab"
          >
            {t(catalog, "home.publicDebates")}
          </Link>
          <span className="libCount count">{t(catalog, "home.total", { count })}</span>
        </div>

        {tab === "yours" ? (
          sessionConfirmed ? (
            <div className="libList recentList">
              <DebatesBuffer debates={debates} catalog={catalog} timeCatalog={timeCatalog} locale={locale} />
            </div>
          ) : (
            <p className="tabEmptyHint">{t(catalog, "home.signInHint")}</p>
          )
        ) : (
          <>
            {publishedError ? <div className="error">{publishedError}</div> : null}
            <div className="libList recentList">
              <PublicDebatesBuffer debates={published.items} catalog={catalog} timeCatalog={timeCatalog} locale={locale} />
            </div>
            <p className="libPublicNote">
              {t(catalog, "home.publicIndexingNotice")}
            </p>
          </>
        )}
      </div>
      <SupportWidget />
    </div>
  );
}
