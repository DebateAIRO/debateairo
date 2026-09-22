"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/ModeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";

const SCREEN_TITLES: Record<string, string> = {
  "/": "chrome.library",
  "/new": "chrome.newDebate",
  "/settings": "chrome.settings",
  "/ai-transparency": "chrome.aiTransparency",
  "/admin/workers": "chrome.workers"
};

const AUTH_PATHS = new Set(["/login", "/sign-up", "/verify-email", "/enroll-mfa"]);

export function BrandMark({
  href = "/",
  homeNavigationAvailable = true
}: {
  href?: string;
  homeNavigationAvailable?: boolean;
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
    <Link className="brand" href={href} aria-label={t(catalog, "chrome.brandHome")}>
      {mark}
    </Link>
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

  return (
    <header className="topBar">
      <BrandMark homeNavigationAvailable={!recoveryAcknowledgementPending} />
      {title ? (
        <div className="topBarContext">
          <span className="topBarDivider" aria-hidden />
          <span className="topBarTitle">{title}</span>
        </div>
      ) : (
        <div className="topBarContext" />
      )}
      <div className="topBarActions">
        <Link className="btn" href="/login">
          {t(catalog, "chrome.account")}
        </Link>
        <Link className="btn btnDark" href="/new">
          + {t(catalog, "chrome.newDebate")}
        </Link>
        <span className="roleChip" title={t(catalog, "chrome.askerRolePlaceholder")}>{t(catalog, "chrome.asker")}</span>
        <LanguageSwitcher />
        <ModeToggle />
        <Link className="iconBtn" href="/settings" aria-label={t(catalog, "chrome.settings")} title={t(catalog, "chrome.settings")}>
          ⚙
        </Link>
      </div>
    </header>
  );
}
