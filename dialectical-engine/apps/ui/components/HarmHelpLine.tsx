"use client";

import * as React from "react";
import { harmHelplineFor, type HarmHelpline } from "@debateai/contract";
import { CRISIS_LINES } from "@/lib/crisisLines";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** Keep dialable numbers in reading order inside right-to-left sentences. */
function callLink(template: string, printed: string, tel: string): React.ReactNode {
  const [before, after] = template.split("{number}", 2);
  if (after === undefined) return template;
  return <>{before}<a className="crisisSupportEmergencyCall" href={`tel:${tel}`}>{`\u2066${printed}\u2069`}</a>{after}</>;
}

export function HarmHelpLine({ catalog, country, helpline }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  country: string | null;
  helpline?: HarmHelpline | null;
}>): React.ReactElement {
  const line = helpline === undefined ? harmHelplineFor(country)
    : country !== null && helpline !== null && helpline.countries.includes(country) ? helpline : null;
  const emergency = country === null ? undefined : CRISIS_LINES[country]?.emergency;
  return <>
    {line !== null ? (
      <p className="harmHelpLine" data-part="helpline">
        {callLink(t(catalog, "home.harmHelpLine.helpline", { name: line.name }), line.phone, line.tel)}
      </p>
    ) : null}
    <p className="crisisSupportEmergency" role="note" data-part="emergency">
      {emergency === undefined
        ? t(catalog, "home.crisisSupport.emergencyAnywhere")
        : callLink(t(catalog, "home.crisisSupport.emergency"), emergency, emergency)}
    </p>
  </>;
}
