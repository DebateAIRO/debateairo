import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { cookies, headers } from "next/headers";
import { AgeConfirmationFlow } from "@/components/AgeConfirmationFlow";
import { resolveDobLocale } from "@/lib/dob/dobLocale";
import { createServerContractClient, listDebatesPageServer, readSessionCookie, readTrustedClientIp } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { LegalAcceptGate } from "@/components/billing/LegalAcceptGate";
import { DebatesBuffer, PublicDebatesBuffer } from "@/components/DebatesBuffer";
import { LandingPage } from "@/components/landing/LandingPage";
import { SupportWidget } from "@/components/support/SupportWidget";
import type { ContractClient } from "@debateai/contract";
import type { DebateSummary } from "@/lib/types";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { dailyLimitMessageCatalog, legalGateMessageCatalog } from "@/lib/v3/requestFailure";

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
  const token = readSessionCookie(cookieStore);
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [homeCatalog, timeCatalog, chromeCatalog, composeCatalog] = await Promise.all([
    loadNamespace(locale, "home"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "compose")
  ]);
  const catalog = Object.freeze({ ...homeCatalog, ...chromeCatalog });
  if (token === null) return <><LandingPage catalog={catalog} /><SupportWidget /></>;
  const requestedTab = (await searchParams).tab;
  const tab: "yours" | "public" =
    requestedTab === "yours" || requestedTab === "public"
      ? requestedTab
      : token !== null ? "yours" : "public";
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const clientIp = readTrustedClientIp(await headers());
  // Crisis check (V, 2026-09-30): the edge's country, so help numbers show that country first.
  const crisisCountryHint = readCrisisCountryHint(await headers());
  // Task M8 (spec 2026-09-26 §14.4.7): the composer says today's limit for new
  // debates in the words /new uses, so it reads that catalogue too — only the
  // two values that message prints, as the composer's props ship to the browser.
  const newDebateCatalog = dailyLimitMessageCatalog(await loadNamespace(locale, "newDebate"));
  let debates: DebateSummary[] = [];
  let error: string | null = null;
  let sessionConfirmed = false;
  let published: Awaited<ReturnType<ContractClient["readPublicDebates"]>> = { items: [], total: 0 };
  let publishedError: string | null = null;
  try {
    published = await createServerContractClient(fetch, undefined, userAgent, clientIp).readPublicDebates(50, 0);
  } catch {
    publishedError = t(catalog, "home.publishedUnavailable");
  }
  if (token === null) {
    error = t(catalog, "home.signInToStart");
  } else {
    try {
      const page = await listDebatesPageServer(token, undefined, userAgent, clientIp);
      debates = page.summaries;
      sessionConfirmed = true;
    } catch {
      error = t(catalog, "home.sessionUnconfirmed");
    }
  }
  // Age gate (8k): a signed-in account created before the date-of-birth field answers its
  // one-time check here, before anything else. A failed read falls through to the home page.
  let ageCheckOwed = false;
  if (sessionConfirmed) {
    try {
      ageCheckOwed = (await createServerContractClient(fetch, token, userAgent, clientIp)
        .readAgeConfirmation()).status === "required";
    } catch {
      ageCheckOwed = false;
    }
  }
  if (ageCheckOwed) {
    const authCatalog = await loadNamespace(locale, "auth");
    const dobLocale = resolveDobLocale(locale, (await headers()).get("accept-language"));
    return <AgeConfirmationFlow catalog={authCatalog} dobLocale={dobLocale} />;
  }
  // Paid plans L4 (spec 2026-09-29 §2.3.2, R3-2): sign-in lands here, so the blocking accept
  // screen covers this page too — read only once the age check above is not owed. Ruling Q-10:
  // a failed read counts as nothing owed, and the page renders exactly as it did before.
  let legalGateCatalog: ReturnType<typeof legalGateMessageCatalog> | null = null;
  if (sessionConfirmed) {
    try {
      const legal = await createServerContractClient(fetch, token, userAgent, clientIp).getLegalStatus(locale);
      if (legal.must_accept.length > 0) {
        legalGateCatalog = legalGateMessageCatalog(await loadNamespace(locale, "newDebate"));
      }
    } catch {
      legalGateCatalog = null;
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

  const home = (
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
            <LibraryComposer catalog={catalog} newDebateCatalog={newDebateCatalog} locale={locale} crisisCountryHint={crisisCountryHint} />
          </section>
        ) : null}

        <div className="libAiDisclosure"><AiNotice catalog={catalog} /></div>

        <div className="libTabs sectionHead" aria-label={t(catalog, "chrome.debateLibrary")}>
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
              <DebatesBuffer debates={debates} catalog={catalog} timeCatalog={timeCatalog} locale={locale} composeCatalog={composeCatalog} />
            </div>
          ) : (
            <p className="tabEmptyHint">{t(catalog, "home.signInHint")}</p>
          )
        ) : (
          <>
            {publishedError ? <div className="error">{publishedError}</div> : null}
            <div className="libList recentList">
              <PublicDebatesBuffer debates={published.items} catalog={catalog} timeCatalog={timeCatalog} locale={locale} composeCatalog={composeCatalog} />
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
  // While documents are owed the accept screen shows first; the composer and the library only after acceptance.
  return legalGateCatalog === null ? home : <LegalAcceptGate catalog={legalGateCatalog}>{home}</LegalAcceptGate>;
}
