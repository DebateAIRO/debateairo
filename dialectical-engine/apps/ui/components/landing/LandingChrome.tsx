import { AccountMenu } from "@/components/AccountMenu";
import type { JSX } from "react";
import { ModeToggle } from "@/components/ModeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's floating glass nav: detached, centred, 34px from the top. */
export function LandingChrome({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  return (
    <header
      data-landing-section="chrome"
      style={{
        position: "absolute",
        top: "34px",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 60
      }}
    >
      <div className="lpNav">
        {/* Design Document v2: the wordmark of the public top bar, "Engine" in the brand colour. */}
        <a href="/" className="lpWordmark">
          Dialectical <span className="lpWordmarkAccent">Engine</span>
        </a>
        <nav aria-label={t(catalog, "chrome.landingNavigation")} className="lpNavLinks">
          <a href="#method">{t(catalog, "chrome.method")}</a>
          <a href="#pricing">{t(catalog, "chrome.pricing")}</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* The landing renders only without a session cookie, so the visitor is signed out. */}
          <AccountMenu catalog={catalog} authenticated={false} signInHref="/login" signInClassName="lpNavSignIn" />
          <LanguageSwitcher />
          <ModeToggle />
          <a className="lpCta lpCtaNav" href="/login?next=%2Fv4">
            <span className="lpCtaLabel">{t(catalog, "chrome.startRound")}</span>
            <span className="lpArrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
