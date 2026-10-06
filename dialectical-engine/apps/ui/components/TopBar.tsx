"use client";

import { AccountMenu } from "@/components/AccountMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { ModeToggle } from "@/components/ModeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import { isCardFormPath } from "../content-security-policy.mjs";

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

const AUTH_PATHS = new Set(["/login", "/sign-up", "/verify-email", "/enroll-mfa"]);

/**
 * P2-I14 / AMENDMENTS-R1 A11: the card pages are the only documents with xMoney's looser policy, and a browser keeps a
 * document's policy (and the xMoney script it loaded) for as long as the document lives. Leaving a card page must
 * therefore load a new document: there, a top-bar link is a plain <a>, never next/link's in-page move.
 */
function TopBarLink({ fullDocumentLoad, ...props }: ComponentProps<"a"> & { fullDocumentLoad: boolean; href: string }) {
  return fullDocumentLoad ? <a {...props} /> : <Link {...props} />;
}

export function BrandMark({
  href = "/",
  homeNavigationAvailable = true,
  fullDocumentLoad = false
}: {
  href?: string;
  homeNavigationAvailable?: boolean;
  /** True on the card pages (P2-I14): the brand leaves by a full document load. */
  fullDocumentLoad?: boolean;
}) {
  const { catalog } = useChromeI18n();
  const mark = (
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

  if (href === "/" && !homeNavigationAvailable) {
    return (
      <span className="brand" aria-label={t(catalog, "chrome.brandHome")} aria-disabled="true">
        {mark}
      </span>
    );
  }

  return (
    <TopBarLink fullDocumentLoad={fullDocumentLoad} className="brand" href={href} aria-label={t(catalog, "chrome.brandHome")}>
      {mark}
    </TopBarLink>
  );
}

export function TopBar() {
  const { catalog } = useChromeI18n();
  const pathname = usePathname();
  const recoveryAcknowledgementPending = useRecoveryAcknowledgementPending();

  // The debate view renders its own contextual chrome — and a published debate
  // is that same view, so the public route suppresses this bar for the same
  // reason the private one does.
  if (pathname?.startsWith("/debate/") || pathname?.startsWith("/public/debate/")) return null;

  if (pathname !== null && AUTH_PATHS.has(pathname)) {
    return (
      <header className="authTopBar">
        <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} />
        <LanguageSwitcher />
        <ModeToggle />
      </header>
    );
  }

  const titleKey = SCREEN_TITLES[pathname ?? "/"];
  const title = titleKey === undefined ? "" : t(catalog, titleKey);
  const fullDocumentLoad = pathname !== null && isCardFormPath(pathname);

  return (
    <header className="topBar">
      <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} fullDocumentLoad={fullDocumentLoad} />
      {title ? (
        <div className="topBarContext">
          <span className="topBarDivider" aria-hidden />
          <span className="topBarTitle">{title}</span>
        </div>
      ) : (
        <div className="topBarContext" />
      )}
      <div className="topBarActions">
        <AccountMenu catalog={catalog} />
        <TopBarLink fullDocumentLoad={fullDocumentLoad} className="btn btnDark" href="/new">
          <span className="topBarNewLabel">+ {t(catalog, "chrome.newDebate")}</span>
        </TopBarLink>
        <LanguageSwitcher />
        <ModeToggle />

      </div>
    </header>
  );
}
