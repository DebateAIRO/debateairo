import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * The age-gate refusal — design document Turn 8 · 8j. One sentence and one way
 * home: no retry, no age hint, no reason. The same screen renders after a
 * reload, a back navigation or a second attempt while the lockout cookie is set.
 */
export function AgeRefusal({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <main className="authScreen scroll" aria-labelledby="age-refusal-title" data-screen="age-refusal">
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
              <h2 className="ageRefusalTitle" id="age-refusal-title">{t(catalog, "auth.ageRefusal.title")}</h2>
              <a className="ageRefusalHome" href="/">{t(catalog, "auth.ageRefusal.home")}</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
