import type { CSSProperties, JSX } from "react";
import { exchangeCards, resolution } from "./cards";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's Z-axis cascade: four turns overlapping up the page, each
   rotated and nudged sideways, alternating transform-origin. */
function roleKey(role: "REASONING" | "PRO" | "CON"): "home.reasoning" | "home.pro" | "home.con" {
  return role === "PRO" ? "home.pro" : role === "CON" ? "home.con" : "home.reasoning";
}

export function LandingSample({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  const cards = exchangeCards(catalog);
  return (
    <section
      id="transcripts"
      data-landing-section="sample"
      aria-labelledby="landing-sample-title"
      className="lpSection lpExchange"
    >
      <div className="lpExchangeHead">
        <div>
          <p className="lpEyebrow">{t(catalog, "home.oneRound")}</p>
          <h2 id="landing-sample-title" className="lpDisplay lpExchangeTitle">
            {t(catalog, "home.sampleTitle")}
          </h2>
        </div>
        <div className="lpResolution">
          <p className="lpEyebrow lpEyebrowTight">{t(catalog, "home.resolutionLabel")}</p>
          <p className="lpResolutionClaim">{resolution(catalog)}</p>
          <div className="lpLegend">
            <span>
              <span className="lpSwatch" data-stance="pro" aria-hidden="true" />
              {t(catalog, "home.pro")}
            </span>
            <span>
              <span className="lpSwatch" data-stance="con" aria-hidden="true" />
              {t(catalog, "home.con")}
            </span>
            <span>
              <span className="lpSwatch" data-stance="reasoning" aria-hidden="true" />
              {t(catalog, "home.reasoning")}
            </span>
          </div>
        </div>
      </div>

      <div className="lpCascade">
        {cards.map((card, index) => (
          <div
            key={card.turn}
            className="lpCard"
            data-stance={card.stance}
            style={
              {
                zIndex: index + 1,
                marginTop: `${card.mt}px`,
                transformOrigin: index % 2 === 0 ? "left center" : "right center",
                "--lp-tf": `rotate(${card.rot}deg) translateX(${card.dx}px)`
              } as CSSProperties
            }
          >
            {/* outer shell */}
            <div className="lpCardShell" data-bezel="shell" data-stance={card.stance}>
              {/* inner core */}
              <article
                className="lpCardCore"
                data-ai-generated="true"
                data-bezel="core"
                data-stance={card.stance}
                aria-label={t(catalog, "home.turnLabel", { turn: card.turn, role: t(catalog, roleKey(card.role)) })}
              >
                <span className="lpCardAccent" data-stance={card.stance} aria-hidden="true" />
                <div className="lpCardHead">
                  <span className="lpChip lpChipStance" data-stance={card.stance}>
                    {card.arrow} {t(catalog, roleKey(card.role))}
                  </span>
                  <span className="lpChip lpChipBase">{t(catalog, "home.baseScore", { score: card.base })}</span>
                  <span className="lpChip lpChipStance" data-stance={card.stance}>
                    {t(catalog, "home.finalScore", { score: card.final })}
                  </span>
                  <span className="lpSpacer" />
                  <span className="lpChip lpChipModel" data-model={card.authorKey}>
                    <span className="lpDot" data-model={card.authorKey} aria-hidden="true" />
                    {card.author}
                  </span>
                </div>
                <p className="lpCardClaim">{card.text}</p>
                <div className="lpCardFoot">
                  <span
                    className="lpChip lpChipReview"
                    data-review={card.review === "DISPUTED" ? "dispute" : "agree"}
                  >
                    {t(catalog, card.review === "DISPUTED" ? "home.reviewDisputedBy" : "home.reviewAgreedBy")}
                  </span>
                  <span className="lpChip lpChipReviewer">
                    <span className="lpDot lpDotHalo" data-model={card.reviewerKey} aria-hidden="true" />
                    {card.reviewer}
                  </span>
                  <span className="lpSpacer" />
                  <span className="lpTurn">{t(catalog, "home.turn", { turn: card.turn })}</span>
                </div>
              </article>
            </div>
          </div>
        ))}
      </div>

      <p className="lpExchangeCoda">
        {t(catalog, "home.sampleCoda")}
      </p>
    </section>
  );
}
