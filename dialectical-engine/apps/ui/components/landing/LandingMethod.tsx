import type { JSX } from "react";
import { METHOD_STEPS } from "./cards";

/* The document's editorial split: a sticky left rail against a numbered
   ledger on the right. */
export function LandingMethod(): JSX.Element {
  return (
    <section
      id="method"
      data-landing-section="method"
      aria-labelledby="landing-method-title"
      className="lpSection lpMethod"
    >
      <div className="lpMethodGrid">
        <div className="lpMethodRail">
          <p className="lpEyebrow">Method</p>
          <h2 id="landing-method-title" className="lpDisplay lpMethodTitle">
            Four steps, then you do it again tomorrow.
          </h2>
          <p className="lpMethodLede">
            The arena is built for repetition, not for a performance you prepare for once.
          </p>
        </div>
        <div className="lpMethodLedgerWrap">
          <p className="lpLedgerLabel">THE METHOD</p>
          <ol className="lpLedger">
            {METHOD_STEPS.map((step) => (
              <li key={step.number} className="lpLedgerRow">
                <span className="lpLedgerNo" data-stance={step.stance}>
                  {step.number}
                </span>
                <h3 className="lpLedgerTitle">{step.title}</h3>
                <p className="lpLedgerBody">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
