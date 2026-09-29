import type { ReactNode } from "react";
import { CookiePreferencesButton } from "@/components/legal/CookiePreferencesButton";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { LegalBlock, LegalDocument } from "@/lib/legalDocument";
import {
  ANPC_ADR_URL,
  COMPANY,
  isUnverified,
  LEGAL_BROWSER_STORAGE,
  LEGAL_COOKIES,
  LEGAL_PAGES,
  MODEL_PROVIDERS,
  TERMS_VERSIONS,
  type LegalPageKey
} from "@/lib/legal/pages";

/**
 * The bodies of the seven legal pages (design 15a). Server components with no state: each one
 * turns data — a generated legal document, or the facts in `lib/legal/pages.ts` — into the
 * numbered column or the table the design draws.
 */

type NumberedSection = Readonly<{ no: string; title: string; blocks: readonly LegalBlock[] }>;

function LegalSection({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section className="legalSection" id={`legal-section-${no}`} aria-labelledby={`legal-section-${no}-title`}>
      <span className="legalSectionNo" aria-hidden>
        {no}
      </span>
      <div>
        <h2 id={`legal-section-${no}-title`}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function NumberedSections({ sections }: { sections: readonly NumberedSection[] }) {
  return (
    <div className="legalSections">
      {sections.map(({ no, title, blocks }) => (
        <LegalSection no={no} title={title} key={no}>
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
        </LegalSection>
      ))}
    </div>
  );
}

/**
 * An email address: a link once it is verified, plain bracketed text until then (R4). Facts are
 * isolated in `<bdi>` (the language switcher's precedent) so a left-to-right value keeps its order
 * on a right-to-left page instead of becoming `[…/…/J40]`.
 */
function Email({ address }: { address: string }) {
  return <bdi>{isUnverified(address) ? address : <a href={`mailto:${address}`}>{address}</a>}</bdi>;
}

/** A catalogue sentence whose placeholders are facts, each fact isolated in `<bdi>`. */
function withFacts(template: string, facts: Readonly<Record<string, string>>): ReactNode[] {
  return template.split(/(\{[A-Za-z][A-Za-z0-9_]*\})/).map((part, index) => {
    const name = /^\{(.+)\}$/.exec(part)?.[1];
    return name !== undefined && Object.hasOwn(facts, name) ? <bdi key={index}>{facts[name]}</bdi> : part;
  });
}

/** "Romanian and English", in the reader's language, from the locale codes in `COMPANY`. */
function languageList(locale: LocaleCode): string {
  const names = new Intl.DisplayNames([locale], { type: "language" });
  const list = new Intl.ListFormat([locale], { type: "conjunction" }).format(
    COMPANY.languages.map((code) => names.of(code) ?? code)
  );
  return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1);
}

const READ_MORE: readonly LegalPageKey[] = ["terms", "privacy", "cookies", "providers"];

/**
 * The legal notice (`/legal`): the company and seller details every user is shown. Every fact —
 * names, numbers, addresses, languages — comes from `COMPANY`; the catalogues carry only the
 * labels and the sentences around them.
 */
export function LegalNoticeBody({
  legalCatalog,
  chromeCatalog,
  locale
}: {
  legalCatalog: MessageCatalog;
  chromeCatalog: MessageCatalog;
  locale: LocaleCode;
}) {
  const [product = COMPANY.legalName, ...otherNames] = COMPANY.tradingNames;
  const vat =
    COMPANY.vat.kind === "registered"
      ? COMPANY.vat.number
      : t(legalCatalog, COMPANY.vat.kind === "not-registered" ? "legal.notice.company.vatNone" : "legal.notice.company.vatUnconfirmed");
  const companyRows: ReadonlyArray<readonly [string, string]> = [
    ["legal.notice.company.name", COMPANY.legalName],
    ["legal.notice.company.tradingNames", COMPANY.tradingNames.join(" · ")],
    ["legal.notice.company.office", COMPANY.registeredOffice],
    ["legal.notice.company.register", COMPANY.tradeRegisterNo],
    ["legal.notice.company.cui", COMPANY.cui],
    ["legal.notice.company.vat", vat],
    ["legal.notice.company.capital", COMPANY.shareCapital],
    ["legal.notice.company.representative", COMPANY.representative]
  ];
  const contactRows: ReadonlyArray<readonly [string, string, string]> = [
    ["legal.notice.contact.authorities", "legal.notice.contact.authoritiesFor", COMPANY.emails.authorities],
    ["legal.notice.contact.users", "legal.notice.contact.usersFor", COMPANY.emails.general],
    ["legal.notice.contact.legal", "legal.notice.contact.legalFor", COMPANY.emails.legal],
    ["legal.notice.contact.privacy", "legal.notice.contact.privacyFor", COMPANY.emails.privacy],
    ["legal.notice.contact.reports", "legal.notice.contact.reportsFor", COMPANY.emails.reports]
  ];

  return (
    <div className="legalSections">
      <LegalSection no="01" title={t(legalCatalog, "legal.notice.s01.title")}>
        <p>
          {withFacts(t(legalCatalog, "legal.notice.s01.body"), {
            product,
            alsoCalled: otherNames.join(", "),
            company: COMPANY.legalName
          })}
        </p>
        <table className="legalTable legalFactTable">
          <tbody>
            {companyRows.map(([labelKey, value]) => (
              <tr key={labelKey}>
                <th scope="row">{t(legalCatalog, labelKey)}</th>
                <td>
                  <bdi>{value}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LegalSection>

      <LegalSection no="02" title={t(legalCatalog, "legal.notice.s02.title")}>
        <p>{t(legalCatalog, "legal.notice.s02.body")}</p>
        <table className="legalTable legalFactTable">
          <tbody>
            {contactRows.map(([labelKey, forKey, address]) => (
              <tr key={labelKey}>
                <th scope="row">{t(legalCatalog, labelKey)}</th>
                <td>
                  <Email address={address} />
                  <span className="legalFactNote">{t(legalCatalog, forKey)}</span>
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t(legalCatalog, "legal.notice.contact.phone")}</th>
              <td>
                <bdi>{isUnverified(COMPANY.phone) ? COMPANY.phone : <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}>{COMPANY.phone}</a>}</bdi>
              </td>
            </tr>
            <tr>
              <th scope="row">{t(legalCatalog, "legal.notice.contact.languages")}</th>
              <td>{languageList(locale)}</td>
            </tr>
          </tbody>
        </table>
      </LegalSection>

      <LegalSection no="03" title={t(legalCatalog, "legal.notice.s03.title")}>
        <p>{withFacts(t(legalCatalog, "legal.notice.s03.body"), { product })}</p>
        <p>
          <a href="/ai-transparency">{t(chromeCatalog, "chrome.aiTransparency")}</a>
        </p>
      </LegalSection>

      <LegalSection no="04" title={t(legalCatalog, "legal.notice.s04.title")}>
        <p>{withFacts(t(legalCatalog, "legal.notice.s04.body"), { product })}</p>
      </LegalSection>

      <LegalSection no="05" title={t(legalCatalog, "legal.notice.s05.title")}>
        <p>{t(legalCatalog, "legal.notice.s05.body")}</p>
        <p>
          <a href="/terms#legal-section-13">{t(legalCatalog, "legal.notice.s05.link")}</a>
        </p>
      </LegalSection>

      <LegalSection no="06" title={t(legalCatalog, "legal.notice.s06.title")}>
        <p>{withFacts(t(legalCatalog, "legal.notice.s06.body"), { reports: COMPANY.emails.reports, legal: COMPANY.emails.legal })}</p>
        <p>
          {t(legalCatalog, "legal.notice.s06.anpc")}{" "}
          <bdi>
            <a href={ANPC_ADR_URL}>{new URL(ANPC_ADR_URL).host}</a>
          </bdi>
        </p>
        <p>
          {t(legalCatalog, "legal.notice.s06.courts")} <a href="/terms#legal-section-18">{t(legalCatalog, "legal.notice.s06.courtsLink")}</a>
        </p>
      </LegalSection>

      <LegalSection no="07" title={t(legalCatalog, "legal.notice.s07.title")}>
        <ul>
          {LEGAL_PAGES.filter(({ key }) => READ_MORE.includes(key)).map(({ key, href, labelKey }) => (
            <li key={key}>
              <a href={href}>{t(chromeCatalog, labelKey)}</a>
            </li>
          ))}
        </ul>
      </LegalSection>
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
