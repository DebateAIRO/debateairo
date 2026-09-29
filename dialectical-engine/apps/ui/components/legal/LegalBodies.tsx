import { CookiePreferencesButton } from "@/components/legal/CookiePreferencesButton";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { LegalBlock, LegalDocument } from "@/lib/legalDocument";
import {
  LEGAL_BROWSER_STORAGE,
  LEGAL_COOKIES,
  MODEL_PROVIDERS,
  TERMS_VERSIONS
} from "@/lib/legal/pages";

/**
 * The bodies of the six legal pages (design 15a). Server components with no state: each one
 * turns data — a generated legal document, or the facts in `lib/legal/pages.ts` — into the
 * numbered column or the table the design draws.
 */

type NumberedSection = Readonly<{ no: string; title: string; blocks: readonly LegalBlock[] }>;

function NumberedSections({ sections }: { sections: readonly NumberedSection[] }) {
  return (
    <div className="legalSections">
      {sections.map(({ no, title, blocks }) => (
        <section className="legalSection" id={`legal-section-${no}`} key={no} aria-labelledby={`legal-section-${no}-title`}>
          <span className="legalSectionNo" aria-hidden>
            {no}
          </span>
          <div>
            <h2 id={`legal-section-${no}-title`}>{title}</h2>
            {blocks.map((block, index) =>
              block.kind === "p" ? (
                <p key={index}>{block.text}</p>
              ) : (
                <ul key={index}>
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * The terms of service and the privacy policy: the SAME generated document the sign-up modals
 * show, in the reader's locale, so the page and the modal cannot say different things. Section
 * ids are page-owned (`legal-section-*`), never the modal's `policy-section-*`.
 */
export function LegalDocumentBody({ document }: { document: LegalDocument }) {
  return <NumberedSections sections={document.sections} />;
}

export function LegalVersionsBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  return (
    <>
      <ol className="legalVersions">
        {TERMS_VERSIONS.map(({ version, dateKey, noteKey, current, href }) => (
          <li className="legalVersionRow" key={version}>
            <span className="legalVersionNo">{version}</span>
            <div>
              <div className="legalVersionHead">
                <span className="legalVersionDate">{t(legalCatalog, dateKey)}</span>
                {current ? <span className="legalVersionTag">{t(legalCatalog, "legal.versions.current")}</span> : null}
              </div>
              <p>{t(legalCatalog, noteKey)}</p>
            </div>
            <a className="legalVersionAction" href={href}>
              {t(legalCatalog, "legal.versions.read")}
            </a>
          </li>
        ))}
      </ol>
      <p className="legalVersionsNone">{t(legalCatalog, "legal.versions.none")}</p>
    </>
  );
}

export function LegalCookiesBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  const head = (
    <thead>
      <tr>
        <th scope="col">{t(legalCatalog, "legal.cookies.colName")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colType")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colPurpose")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colLasts")}</th>
      </tr>
    </thead>
  );
  return (
    <>
      <p className="legalIntro">{t(legalCatalog, "legal.cookies.intro")}</p>
      <table className="legalTable legalCookieTable">
        {head}
        <tbody>
          {LEGAL_COOKIES.map(({ name, purposeKey, lifeKey }) => (
            <tr key={name}>
              <th scope="row">
                <code>{name}</code>
              </th>
              <td className="legalTagEssential">{t(legalCatalog, "legal.cookies.essential")}</td>
              <td>{t(legalCatalog, purposeKey)}</td>
              <td>{t(legalCatalog, lifeKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="legalSubhead">{t(legalCatalog, "legal.cookies.storageTitle")}</h2>
      <p className="legalIntro">{t(legalCatalog, "legal.cookies.storageIntro")}</p>
      <table className="legalTable legalCookieTable">
        {head}
        <tbody>
          {LEGAL_BROWSER_STORAGE.map(({ name, purposeKey }) => (
            <tr key={name}>
              <th scope="row">
                <code>{name}</code>
              </th>
              <td className="legalTagPreference">{t(legalCatalog, "legal.cookies.preference")}</td>
              <td>{t(legalCatalog, purposeKey)}</td>
              <td>{t(legalCatalog, "legal.cookies.untilCleared")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CookiePreferencesButton className="btn btnDark legalAction" label={t(legalCatalog, "legal.cookies.change")} />
    </>
  );
}

export function LegalProvidersBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  return (
    <>
      <p className="legalIntro">{t(legalCatalog, "legal.providers.intro")}</p>
      <table className="legalTable legalProviderTable">
        <thead>
          <tr>
            <th scope="col">{t(legalCatalog, "legal.providers.colProvider")}</th>
            <th scope="col">{t(legalCatalog, "legal.providers.colModels")}</th>
            <th scope="col">{t(legalCatalog, "legal.providers.colLocation")}</th>
            <th scope="col">{t(legalCatalog, "legal.providers.colBasis")}</th>
          </tr>
        </thead>
        <tbody>
          {MODEL_PROVIDERS.map(({ family, provider, models, modelsKey, locationKey, basisKey }) => (
            <tr key={family}>
              <th scope="row">{provider}</th>
              <td>{modelsKey === null ? models : `${models} · ${t(legalCatalog, modelsKey)}`}</td>
              <td>{t(legalCatalog, locationKey)}</td>
              <td>{t(legalCatalog, basisKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const HEALTH_SECTIONS = ["01", "02", "03", "04", "05", "06"] as const;
const HEALTH_RIGHTS = ["legal.health.s05.item1", "legal.health.s05.item2", "legal.health.s05.item3"] as const;

export function LegalHealthBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  const sections: NumberedSection[] = HEALTH_SECTIONS.map((no) => {
    const blocks: LegalBlock[] = [{ kind: "p", text: t(legalCatalog, `legal.health.s${no}.body`) }];
    if (no === "05") blocks.push({ kind: "list", items: HEALTH_RIGHTS.map((key) => t(legalCatalog, key)) });
    return { no, title: t(legalCatalog, `legal.health.s${no}.title`), blocks };
  });
  return <NumberedSections sections={sections} />;
}
