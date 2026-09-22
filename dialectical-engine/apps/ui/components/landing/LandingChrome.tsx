import type { JSX } from "react";
import { ModeToggle } from "@/components/ModeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";

/* The document's floating glass nav: detached, centred, 34px from the top. */
export function LandingChrome(): JSX.Element {
  const { catalog } = useChromeI18n();
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
        <a
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "19px",
            letterSpacing: "-.02em",
            fontVariationSettings: "var(--fvs-display)"
          }}
        >
          DebateAI
        </a>
        <nav aria-label={t(catalog, "chrome.landingNavigation")} className="lpNavLinks">
          <a href="#method">{t(catalog, "chrome.method")}</a>
          <a href="#transcripts">{t(catalog, "chrome.transcripts")}</a>
          <a href="#pricing">{t(catalog, "chrome.pricing")}</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <LanguageSwitcher />
          <ModeToggle />
          <a className="lpCta lpCtaNav" href="/login?next=%2Fnew">
            {t(catalog, "chrome.startRound")}
            <span className="lpArrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
