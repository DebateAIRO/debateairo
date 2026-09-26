import type { JSX } from "react";
import { methodSteps } from "./cards";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The document's editorial split: a sticky left rail against a numbered
   ledger on the right. */
export function LandingMethod({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  const steps = methodSteps(catalog);
  return (
    <section
      id="method"
      data-landing-section="method"
      aria-labelledby="landing-method-title"
      className="lpSection lpMethod"
    >
      <div className="lpMethodGrid">
        <div className="lpMethodRail">
          <p className="lpEyebrow">{t(catalog, "chrome.method")}</p>
          <h2 id="landing-method-title" className="lpDisplay lpMethodTitle">
            {t(catalog, "home.methodTitle")}
          </h2>
          <p className="lpMethodLede">
            {t(catalog, "home.methodLede")}
          </p>
        </div>
        <div className="lpMethodLedgerWrap">
          <p className="lpLedgerLabel">{t(catalog, "home.methodLabel")}</p>
          <ol className="lpLedger">
            {steps.map((step) => (
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
