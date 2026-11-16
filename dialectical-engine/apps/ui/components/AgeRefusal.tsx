"use client";

import { useEffect, useRef } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * The age-gate refusal — design document Turn 8 · 8j. One sentence and one way
 * home: no retry, no age hint, no reason. The same screen renders after a
 * reload, a back navigation or a second attempt while the lockout cookie is set.
 */
export function AgeRefusal({ catalog, focusTitle = false }: Readonly<{
  catalog: MessageCatalog;
  /** The refusal replaced the form a submit was made from: focus lands on the heading (keyboard audit 2026-11-12). */
  focusTitle?: boolean;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle]);
  return (
    <section className="authScreen scroll" aria-labelledby="age-refusal-title" data-screen="age-refusal">
      <div className="authCard">
        <div className="authCardInner">
          <div className="authBrand">
            <span className="authBrandMark" aria-hidden="true">
              <span className="authBrandDiamond" />
            </span>
            <span className="authBrandName">Dialectical Engine</span>
          </div>
          <div className="authPanel">
            <div className="authPanelCore ageRefusal">
              <span className="ageRefusalMark" aria-hidden="true">
                <span />
              </span>
              <h2 className="ageRefusalTitle" id="age-refusal-title" ref={heading} tabIndex={focusTitle ? -1 : undefined}>{t(catalog, "auth.ageRefusal.title")}</h2>
              <a className="ageRefusalHome" href="/">{t(catalog, "auth.ageRefusal.home")}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
