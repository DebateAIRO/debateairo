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
import { RemovalNoticeTake } from "@/components/CheckRemovalNotice";
import { SynthesisHoldRefresher } from "@/components/SynthesisHoldRefresher";
import { LandingPage } from "@/components/landing/LandingPage";
import type { LandingPlanCards } from "@/components/landing/LandingPricing";
import type { PricingPlan } from "@/components/billing/PricingCards";
import { SupportWidget } from "@/components/support/SupportWidget";
import { ContractHttpError } from "@debateai/contract";
import type { BillingPlansPlace, ContractClient } from "@debateai/contract";
import type { DebateSummary } from "@/lib/types";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { isBillingPlanId } from "@/lib/billing/plans";
import { dailyLimitMessageCatalog, legalGateMessageCatalog } from "@/lib/v3/requestFailure";
import { composerRoomCatalog } from "@/lib/billing/roomCatalog";
import { formatMoney, pricedTax, type PricedTax } from "@/lib/billing/format";
import { availablePaymentMarks, netopiaLogoAddress } from "@/lib/billing/paymentMarks";
import type { SiteFooterBilling } from "@/lib/billing/footerBilling";
import { signInHref } from "@/lib/returnPath";

export const dynamic = "force-dynamic";

type LandingPlans = Readonly<{
  lowestPaidPrice: string | null; tax: PricedTax; footer: SiteFooterBilling; testModeNote: string | null;
  cards: LandingPlanCards | null;
}>;

/** The place a visitor chose in the landing's place form (the pricing page's own form, sent back to the landing). */
type PlaceParams = Readonly<{ country?: string | string[]; postal_code?: string | string[] }>;

/** One value of a search parameter, or nothing: a repeated or empty one is no choice (as on the pricing page). */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** As on the pricing page: an answer without a place (only a hand-made one) is priced nowhere, so it shows no price. */
const NO_PLACE: BillingPlansPlace = Object.freeze({ country: null, postal_code: null, status: "TAX_UNAVAILABLE" });

/** The only billing keys the landing's place form prints: it is a client component, so its catalogue ships to the browser. */
const PLACE_FORM_KEYS: ReadonlySet<string> = new Set([
  "billing.checkout.country", "billing.checkout.postalCode", "billing.checkout.postalCodeInvalid",
  "billing.pricing.showPrices"
]);

function pickMessages(catalog: MessageCatalog, keep: (key: string) => boolean): MessageCatalog {
  return Object.freeze(Object.fromEntries(Object.entries(catalog).filter(([key]) => keep(key))));
}

/**
 * The landing's one plans read: the lowest paid price for the price line (the total with the connection country's tax
 * in it, Terms §12; with no priced place, no price at all), and whether billing is on for the footer. Only the route's
 * 404 means off (local mode, or hosted before the switch), exactly as billingIsOn() decides. The same answer says
 * whether card payments run on NETOPIA's sandbox: then the price line carries the test-mode note, which goes away by
 * itself once the server is switched to live payments. The same answer also fills the plan cards above the closing CTA,
 * for the connection's country or, once the visitor chose one in the cards' place form, for that place (`params`).
 * The cards show our price and the tax apart; the sentence names only the total, so it reads plainly in every language.
 */
async function landingPlans(locale: string, headerStore: Headers, params: PlaceParams = {}): Promise<LandingPlans> {
  const footer = (billingOn: boolean): SiteFooterBilling =>
    Object.freeze({ billingOn, marks: availablePaymentMarks(), netopiaLogo: netopiaLogoAddress() });
  const country = single(params.country);
  const postalCode = single(params.postal_code);
  const chosen = country !== undefined || postalCode !== undefined;
  try {
    const client = createServerContractClient(
      fetch, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    );
    const answer = await (chosen ? client.getBillingPlans({
      ...(country === undefined ? {} : { country }), ...(postalCode === undefined ? {} : { postalCode })
    }) : client.getBillingPlans());
    const paid = answer.plans.filter((plan) => plan.plan_id !== "FREE");
    // `!= null`: an answer without the fields (only a hand-made one: the contract client requires them) is UNPRICED.
    const tax = paid.every((plan) => plan.total_price != null) ? pricedTax(answer) : "UNPRICED";
    const lowest = tax === "UNPRICED" ? undefined : paid
      // Spec 2026-10-05 §2.16.1: in the currency the visitor's connection pays in.
      .flatMap((plan) => plan.total_price ?? [])
      .sort((left, right) => Number(left) - Number(right))[0];
    const billingCatalog = await loadNamespace(locale, "billing");
    const testModeNote = answer.environment === "sandbox" ? t(billingCatalog, "billing.testMode.notice") : null;
    const place = answer.place ?? NO_PLACE;
    // The place form shows only while the cards ask for a place, or to correct one chosen here; a visitor priced by
    // their connection changes the place on the pricing page.
    const placeForm = place.status === "PRICED" && !chosen ? null : Object.freeze({
      catalog: pickMessages(billingCatalog, (key) => PLACE_FORM_KEYS.has(key)),
      regionCatalog: pickMessages(await loadNamespace(locale, "auth"), (key) => key.startsWith("auth.region.")),
      typedPostalCode: postalCode
    });
    return Object.freeze({
      lowestPaidPrice: lowest === undefined ? null : formatMoney(locale, lowest, answer.currency),
      tax: paid.length === 0 ? "UNPRICED" : tax, footer: footer(true), testModeNote,
      cards: Object.freeze({
        catalog: billingCatalog, locale, currency: answer.currency, place,
        tax: answer.place == null ? null : answer.tax ?? null,
        plans: answer.plans.filter((plan): plan is PricingPlan => isBillingPlanId(plan.plan_id)), placeForm
      })
    });
  } catch (failure) {
    return Object.freeze({
      lowestPaidPrice: null, tax: "UNPRICED",
      footer: footer(!(failure instanceof ContractHttpError && failure.status === 404)), testModeNote: null, cards: null
    });
  }
}

export default async function HomePage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ tab?: string } & PlaceParams>;
}) {
  // UI-01 (S05): the V3 answer index is asker-scoped; without a server session
  // cookie the list honestly stays empty with a sign-in hint — never an
  // anonymous global listing.
  const cookieStore = await cookies();
  const token = readSessionCookie(cookieStore);
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [homeCatalog, timeCatalog, chromeCatalog, composeCatalog, publicCatalog] = await Promise.all([
    loadNamespace(locale, "home"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "compose"),
    loadNamespace(locale, "public")
  ]);
  const catalog = Object.freeze({ ...homeCatalog, ...chromeCatalog });
  if (token === null) {
    const plans = await landingPlans(locale, await headers(), await searchParams);
    return <><LandingPage
      catalog={catalog} lowestPaidPrice={plans.lowestPaidPrice} tax={plans.tax} footerBilling={plans.footer}
      testModeNote={plans.testModeNote} plans={plans.cards}
    /><SupportWidget /></>;
  }
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
  const roomCatalog = composerRoomCatalog(await loadNamespace(locale, "newDebate"),await loadNamespace(locale,"billing"));
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
  // Upvotes (design of 26 Nov 2026, section 7.4): which rows of this page the account upvoted, asked once for the page of
  // rows, with the session; the list itself stays anonymous above. A row without a count comes from an API without the
  // vote routes, so nothing is asked about it. A failed read leaves every box unpressed.
  let voted: ReadonlySet<string> = new Set();
  const refs = tab === "public" && sessionConfirmed
    ? published.items.filter((debate) => debate.vote_count !== undefined).map((debate) => debate.public_ref)
    : [];
  if (refs.length > 0) {
    try {
      voted = new Set((await createServerContractClient(fetch, token, userAgent, clientIp).readOwnPublicVotes(refs)).voted);
    } catch {
      voted = new Set();
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
            <LibraryComposer catalog={catalog} newDebateCatalog={newDebateCatalog} roomCatalog={roomCatalog} locale={locale} crisisCountryHint={crisisCountryHint} />
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
              <SynthesisHoldRefresher active={debates.some((debate) => debate.synthesis_check === "CHECKING")} />
              <DebatesBuffer debates={debates} catalog={catalog} timeCatalog={timeCatalog} locale={locale}
                checkingLabel={t(publicCatalog, "public.publication.checkingDebate")} composeCatalog={composeCatalog} />
            </div>
          ) : (
            <p className="tabEmptyHint">{t(catalog, "home.signInHint")}</p>
          )
        ) : (
          <>
            {publishedError ? <div className="error">{publishedError}</div> : null}
            <div className="libList recentList">
              <PublicDebatesBuffer debates={published.items} catalog={catalog} timeCatalog={timeCatalog} locale={locale} composeCatalog={composeCatalog}
                votes={{ signedIn: sessionConfirmed, voted, signInHref: signInHref("/?tab=public") }} />
            </div>
            <p className="libPublicNote">
              {t(catalog, "home.publicIndexingNotice")}
            </p>
          </>
        )}
      </div>
      {/* S01-R39: the notice is taken from the browser, which sends the CSRF pair a signed-in POST needs. */}
      {sessionConfirmed && tab === "yours"
        ? <RemovalNoticeTake catalog={catalog} locale={locale} countryHint={crisisCountryHint} /> : null}
      <SupportWidget />
    </div>
  );
  // While documents are owed the accept screen shows first; the composer and the library only after acceptance.
  return legalGateCatalog === null ? home : <LegalAcceptGate catalog={legalGateCatalog}>{home}</LegalAcceptGate>;
}
