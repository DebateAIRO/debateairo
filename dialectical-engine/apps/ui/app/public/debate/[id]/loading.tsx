import "@/app/v4/v4-base.css";
import "./public-lane.css";

/**
 * public-f6 (owner screen review, 3 Nov): while the server reads the whole debate, a plain grey outline of the page shows at once: the header, the
 * title, the answer card and three question rows. No spinner, no words and no movement; the real page replaces it as soon as the debate arrives.
 */
export default function LoadingPublicDebate() {
  return (
    <div className="v4Root v4PubSkel" aria-busy="true" data-public-loading>
      <div className="v4PubSkelHeader" aria-hidden="true">
        <span className="v4PubSkelBar v4PubSkelBrand" />
      </div>
      <div className="v4PubSkelMain" aria-hidden="true">
        <span className="v4PubSkelBar v4PubSkelTitle" />
        <span className="v4PubSkelBar v4PubSkelTitle v4PubSkelShort" />
        <div className="v4PubSkelCard">
          <span className="v4PubSkelBar" />
          <span className="v4PubSkelBar" />
          <span className="v4PubSkelBar v4PubSkelShort" />
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} className="v4PubSkelRow">
            <span className="v4PubSkelBar" />
            <span className="v4PubSkelBar v4PubSkelTag" />
          </div>
        ))}
      </div>
    </div>
  );
}
