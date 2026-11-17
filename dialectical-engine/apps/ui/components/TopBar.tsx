"use client";

import { AccountMenu } from "@/components/AccountMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { contractClient } from "@/lib/api";
import { ModeToggle } from "@/components/ModeToggle";
import { useRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import { safeReturnPath } from "@/lib/returnPath";

const SCREEN_TITLES: Record<string, string> = {
  "/": "chrome.library",
  "/new": "chrome.newDebate",
  "/settings": "chrome.account",
  "/settings/security": "chrome.security",
  "/ai-transparency": "chrome.aiTransparency",
  "/admin/workers": "chrome.workers",
  "/legal": "chrome.legalPages",
  "/terms": "chrome.legalPages",
  "/terms/versions": "chrome.legalPages",
  "/privacy": "chrome.legalPages",
  "/privacy/us-health-data": "chrome.legalPages",
  "/cookies": "chrome.legalPages",
  "/providers": "chrome.legalPages",
  "/privacy/versions": "chrome.legalPages"
};

/**
 * Design Document v2 (3a): what the identity pill shows — a round face and a name. The name is the account's own
 * pseudonym when the account read carries one, and the face its first letter; without one the pill says the generic
 * word and the face shows the first letter or digit of the account's address (nothing else of the address is shown).
 * Until the read answers, and if it fails, the face is plain. `onPseudonym` tells the bar the name, for the button's own.
 */
function IdentityPill({ fallback, onPseudonym }: { fallback: string; onPseudonym: (pseudonym: string | null) => void }) {
  const [identity, setIdentity] = useState<{ initial: string | null; pseudonym: string | null }>({ initial: null, pseudonym: null });
  useEffect(() => {
    let active = true;
    const firstOf = (text: string) => Array.from(text).find((character) => /[\p{L}\p{N}]/u.test(character))?.toLocaleUpperCase() ?? null;
    void Promise.resolve()
      .then(() => contractClient.readAccountEmail())
      .then((account) => {
        if (!active) return;
        const pseudonym = account.pseudonym ?? null;
        setIdentity({ initial: firstOf(pseudonym ?? account.email.split("@", 1)[0] ?? ""), pseudonym });
        onPseudonym(pseudonym);
      })
      .catch(() => { if (active) { setIdentity({ initial: null, pseudonym: null }); onPseudonym(null); } });
    return () => { active = false; };
  }, [onPseudonym]);
  return (
    <>
      <span className="topBarIdentityFace" aria-hidden="true">{identity.initial}</span>
      <span className="topBarIdentityName">{identity.pseudonym ?? fallback}</span>
    </>
  );
}

const AUTH_PATHS = new Set(["/login", "/sign-up", "/verify-email", "/enroll-mfa"]);

/**
 * Design Document v2 (19a Pricing, 19b Checkout): the pages of the paid plans wear the public bar's brand — the
 * wordmark with the page's address beside it. The bar's actions stay the site's own (spec 2026-10-05 §2.18).
 */
function isPublicPlansPage(pathname: string | null): boolean {
  return pathname === "/pricing" || pathname === "/checkout" || (pathname?.startsWith("/checkout/") ?? false);
}

/** The V4 pages: the ask page (/v4) and everything under it (a debate's map, its report). */
export function isV4Page(pathname: string | null): boolean {
  return pathname === "/v4" || (pathname?.startsWith("/v4/") ?? false);
}

export function BrandMark({
  href = "/",
  homeNavigationAvailable = true,
  wordmarkAddress
}: {
  href?: string;
  homeNavigationAvailable?: boolean;
  /** Design Document v2: draw the public bar's wordmark, with this address beside it, instead of the diamond mark. */
  wordmarkAddress?: string;
}) {
  const { catalog } = useChromeI18n();
  const wordmark = wordmarkAddress !== undefined;
  const mark = wordmark ? (
    <>
      <span className="brandWordmark">
        Dialectical <span className="brandWordmarkAccent">Engine</span>
      </span>
      <span className="brandDomain">{wordmarkAddress}</span>
    </>
  ) : (
    <>
      <span className="brandDiamond" aria-hidden>
        <span className="brandDiamondCore" />
      </span>
      <span className="brandText">
        <span className="brandName">Dialectical Engine</span>
        <span className="brandDomain">dezbatere.ro</span>
      </span>
    </>
  );
  const brand = wordmark ? "wordmark" : undefined;

  if (href === "/" && !homeNavigationAvailable) {
    return (
      <span className="brand" data-brand={brand} aria-label={t(catalog, "chrome.brandHome")} aria-disabled="true">
        {mark}
      </span>
    );
  }

  return (
    <Link className="brand" data-brand={brand} href={href} aria-label={t(catalog, "chrome.brandHome")}>{mark}</Link>
  );
}

export function TopBar() {
  const { catalog } = useChromeI18n();
  const pathname = usePathname();
  const recoveryAcknowledgementPending = useRecoveryAcknowledgementPending();
  // Design Document v2 (3a): the account's pseudonym, once the identity pill has read it.
  const [pseudonym, setPseudonym] = useState<string | null>(null);

  // The debate view renders its own contextual chrome — and a published debate
  // is that same view, so the public route suppresses this bar for the same
  // reason the private one does.
  if (pathname?.startsWith("/debate/") || pathname?.startsWith("/public/debate/")) return null;
  // V4 screen review (ask-f5, 3 Nov 2026): the V4 pages have one header row, their own (V4Header, with the account menu);
  // the cookie and legal links stay in the footer.
  if (isV4Page(pathname)) return null;

  if (pathname !== null && AUTH_PATHS.has(pathname)) {
    return (
      <header className="authTopBar">
        <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} />
        <ModeToggle />
      </header>
    );
  }

  const titleKey = SCREEN_TITLES[pathname ?? "/"];
  const title = titleKey === undefined ? "" : t(catalog, titleKey);
  const publicPlans = isPublicPlansPage(pathname);

  return (
    <header className="topBar" data-chrome={publicPlans ? "public" : undefined}>
      <BrandMark
        homeNavigationAvailable={!recoveryAcknowledgementPending}
        wordmarkAddress={publicPlans ? `dezbatere.ro${pathname ?? ""}` : undefined}
      />
      {title ? (
        <div className="topBarContext">
          <span className="topBarDivider" aria-hidden />
          <span className="topBarTitle">{title}</span>
        </div>
      ) : (
        <div className="topBarContext" />
      )}
      <div className="topBarActions">
        {/* Design Document v2 (3a): "+ New debate", the identity pill, the mode switch, the gear. The language
            switcher the bar used to hold is in the page's footer (SiteFooter), on every page this bar is on. */}
        <Link className="btn btnDark" href="/new">
          <span className="topBarNewLabel">+ {t(catalog, "chrome.newDebate")}</span>
        </Link>
        {/* Its own class: the phone layout hides the bar's other plain buttons but keeps this one. */}
        <AccountMenu catalog={catalog} signInHref={`/login?next=${encodeURIComponent(safeReturnPath(pathname))}`} signInClassName="btn topBarSignIn"
          look={{ trigger: {
            className: "topBarIdentity",
            // The button's name holds the name it shows (the pseudonym), after the generic word.
            label: pseudonym === null ? t(catalog, "chrome.account") : `${t(catalog, "chrome.account")}: ${pseudonym}`,
            content: <IdentityPill fallback={t(catalog, "chrome.account")} onPseudonym={setPseudonym} />
          } }}
        />
        <ModeToggle />
        <Link className="topBarGear" href="/settings" aria-label={t(catalog, "chrome.settings")}>
          <span aria-hidden="true">⚙</span>
        </Link>
      </div>
    </header>
  );
}
