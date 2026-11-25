import type { JSX } from "react";
import { methodSteps } from "./cards";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/* The four steps in one row: a title and one short line each, in the order a question takes. */
export function LandingMethod({ catalog }: { catalog: MessageCatalog }): JSX.Element {
  const steps = methodSteps(catalog);
  return (
    <section
      id="method"
      data-landing-section="method"
      aria-labelledby="landing-method-title"
      className="lpSection lpMethod"
    >
      <h2 id="landing-method-title" className="lpDisplay lpMethodTitle">
        {t(catalog, "home.methodTitle")}
      </h2>
      <ol className="lpSteps">
        {steps.map((step) => (
          <li key={step.number} className="lpStep">
            <h3 className="lpStepTitle">{step.title}</h3>
            <p className="lpStepBody">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
