import type { JSX } from "react";
import { AiNotice } from "../AiNotice";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export function LandingHero({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  return (
    <section
      data-landing-section="hero"
      aria-labelledby="landing-hero-title"
      className="lpSection lpHero"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
        <span aria-hidden="true" style={{ width: "26px", height: "1px", background: "var(--pro)" }} />
        <p className="lpEyebrow">{t(catalog, "home.practiceEyebrow")}</p>
      </div>
      <h1 id="landing-hero-title" className="lpDisplay lpHeroTitle">
        {t(catalog, "home.heroTitle")}
      </h1>
      <p className="lpLede">
        {t(catalog, "home.heroLede")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "52px", flexWrap: "wrap" }}>
        <a className="lpCta lpCtaHero" href="/login?next=%2Fnew">
          {t(catalog, "chrome.startRound")}
          <span className="lpArrow" aria-hidden="true">
            →
          </span>
        </a>
        <a className="lpCtaGhost" href="#transcripts">
          {t(catalog, "home.readTranscript")}
        </a>
      </div>
      <div className="lpAiDisclosure">
        <AiNotice catalog={catalog} variant="pill" body={<><strong>{t(catalog, "home.aiGeneratedLead")}</strong> {t(catalog, "home.aiGeneratedHero")}</>} />
      </div>
      <ul aria-label={t(catalog, "home.practiceFacts")} className="lpStatBar">
        <li>{t(catalog, "home.fourTurns")}</li>
        <li aria-hidden="true" className="lpStatRule" />
        <li>{t(catalog, "home.roundsThisWeek")}</li>
        <li aria-hidden="true" className="lpStatRule" />
        <li>{t(catalog, "home.noAudience")}</li>
      </ul>
    </section>
  );
}
