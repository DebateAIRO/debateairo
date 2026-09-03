import type { CSSProperties, JSX } from "react";
import { EXCHANGE_CARDS, RESOLUTION } from "./cards";

/* The document's Z-axis cascade: four turns overlapping up the page, each
   rotated and nudged sideways, alternating transform-origin. */
export function LandingSample(): JSX.Element {
  return (
    <section
      id="transcripts"
      data-landing-section="sample"
      aria-labelledby="landing-sample-title"
      className="lpSection lpExchange"
    >
      <div className="lpExchangeHead">
        <div>
          <p className="lpEyebrow">One round, four turns</p>
          <h2 id="landing-sample-title" className="lpDisplay lpExchangeTitle">
            The pressure lands on the joint, not the wording.
          </h2>
        </div>
        <div className="lpResolution">
          <p className="lpEyebrow lpEyebrowTight">Resolution</p>
          <p className="lpResolutionClaim">{RESOLUTION}</p>
          <div className="lpLegend">
            <span>
              <span className="lpSwatch" data-stance="pro" aria-hidden="true" />
              Pro
            </span>
            <span>
              <span className="lpSwatch" data-stance="con" aria-hidden="true" />
              Con
            </span>
            <span>
              <span className="lpSwatch" data-stance="reasoning" aria-hidden="true" />
              Reasoning
            </span>
          </div>
        </div>
      </div>

      <div className="lpCascade">
        {EXCHANGE_CARDS.map((card, index) => (
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
                data-bezel="core"
                data-stance={card.stance}
                aria-label={`Turn ${card.turn}, ${card.role}`}
              >
                <span className="lpCardAccent" data-stance={card.stance} aria-hidden="true" />
                <div className="lpCardHead">
                  <span className="lpChip lpChipStance" data-stance={card.stance}>
                    {card.arrow} {card.role}
                  </span>
                  <span className="lpChip lpChipBase">BASE {card.base}%</span>
                  <span className="lpChip lpChipStance" data-stance={card.stance}>
                    FINAL {card.final}%
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
                    REVIEW {card.review} BY:
                  </span>
                  <span className="lpChip lpChipReviewer">
                    <span className="lpDot lpDotHalo" data-model={card.reviewerKey} aria-hidden="true" />
                    {card.reviewer}
                  </span>
                  <span className="lpSpacer" />
                  <span className="lpTurn">Turn {card.turn}</span>
                </div>
              </article>
            </div>
          </div>
        ))}
      </div>

      <p className="lpExchangeCoda">
        The round ends here. Nothing is declared won. You get the transcript, the two marks per turn,
        and the joint you conceded.
      </p>
    </section>
  );
}
