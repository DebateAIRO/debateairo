import type { JSX } from "react";
import { examplePoints, resolution } from "./cards";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The hero says the promise in one line and lets an example of an answer do the explaining. The example is
   written by hand and says so ("Example"): it shows the shape of a report (the answer, then points with the
   map's trust words), with no scores, turns or model codes. */
export function LandingHero({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  return (
    <section
      data-landing-section="hero"
      aria-labelledby="landing-hero-title"
      className="lpSection lpHero"
      // Keyboard audit 2026-11-12 (CHR1-4): the content starts here, after LandingChrome; the skip link comes here.
      id="page-content"
      tabIndex={-1}
    >
      <div className="lpHeroGrid">
        <div className="lpHeroCopy">
          <h1 id="landing-hero-title" className="lpDisplay lpHeroTitle">
            {t(catalog, "home.heroTitle")}
          </h1>
          <p className="lpLede">
            {t(catalog, "home.heroLede")}
          </p>
          <div className="lpHeroActions">
            <a className="lpCta lpCtaHero" href="/login?next=%2Fv4">
              {t(catalog, "chrome.startRound")}
              <span className="lpArrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
        <figure className="lpExample" data-landing-example>
          <figcaption className="lpExampleLabel">{t(catalog, "home.exampleLabel")}</figcaption>
          <p className="lpExampleQuestion">{resolution(catalog)}</p>
          <div className="lpExampleAnswer">
            <p className="lpExampleAnswerLabel">{t(catalog, "home.exampleAnswerLabel")}</p>
            <p className="lpExampleAnswerText">{t(catalog, "home.exampleAnswer")}</p>
          </div>
          <ul className="lpExamplePoints">
            {examplePoints(catalog).map((point) => (
              <li key={point.id} className="lpExamplePoint" data-trust={point.trust}>
                <span className="lpExampleMark" aria-hidden="true" />
                <span className="lpExampleBody">
                  <span>{point.text}</span>
                  <span className="lpExampleWord">{point.word}</span>
                </span>
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </section>
  );
}
