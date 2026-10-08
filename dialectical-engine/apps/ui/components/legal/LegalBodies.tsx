import { Fragment, type ReactNode } from "react";
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
  LEGAL_INVENTORY,
  LEGAL_PAGES,
  PROVIDER_REGISTER,
  TERMS_VERSIONS,
  type LegalInventoryItem,
  type LegalPageKey,
  type ProviderPurpose,
  type ProviderRegisterEntry
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

/** The eight stored-item names of record, longest first, as one alternation (a fixed allow-list, never a pattern). */
const INVENTORY_NAMES = new RegExp(
  `(${LEGAL_INVENTORY.map(({ name }) => name)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`
);

/**
 * Document text with every stored-item name (the privacy policy's §13 lines) as its own left-to-right run: on a
 * right-to-left page a bare `__Host-debateai-session` line is drawn `Host-debateai-session__` (REV-S01 p2 PT2-N2).
 * The ONE place this is done: the legal pages below and the policy modal (`consent/LegalDocumentModal.tsx`) both call it.
 */
export function withNames(text: string): ReactNode {
  const parts = text.split(INVENTORY_NAMES);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 === 1 ? <bdi dir="ltr" key={index}>{part}</bdi> : part));
}

function NumberedSections({ sections }: { sections: readonly NumberedSection[] }) {
  return (
    <div className="legalSections">
      {sections.map(({ no, title, blocks }) => (
        <LegalSection no={no} title={title} key={no}>
          {blocks.map((block, index) =>
            block.kind === "p" ? (
              <p key={index}>{withNames(block.text)}</p>
            ) : (
              <ul key={index}>
                {block.items.map((item, itemIndex) => {
                  // `.legalSection li` is a flex row: a line with an isolated name goes in ONE span, or the name's <bdi>
                  // becomes its own flex item, gets a column of its own and breaks mid-word (REV-S01 p3 PT3-B1).
                  const line = withNames(item);
                  return <li key={itemIndex}>{typeof line === "string" ? line : <span>{line}</span>}</li>;
                })}
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
  locale,
  billingOn = false
}: {
  legalCatalog: MessageCatalog;
  chromeCatalog: MessageCatalog;
  locale: LocaleCode;
  /** Paid plans (P21, R3-4): §01 names the seller, §04 and §05 describe the paid plans. Off: the free-product text. */
  billingOn?: boolean;
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
        {billingOn ? <p>{withFacts(t(legalCatalog, "legal.notice.s01.seller"), { company: COMPANY.legalName })}</p> : null}
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
        {billingOn ? (
          <>
            <p>{t(legalCatalog, "legal.notice.s04.bodyPaid")}</p>
            <p>{t(legalCatalog, "legal.notice.s04.payments")}</p>
            <p>
              <a href="/pricing">{t(legalCatalog, "legal.notice.s04.pricingLink")}</a>
            </p>
            <p>
              <a href="/cancel">{t(legalCatalog, "legal.notice.s04.cancelLink")}</a>
            </p>
          </>
        ) : (
          <p>{withFacts(t(legalCatalog, "legal.notice.s04.body"), { product })}</p>
        )}
      </LegalSection>

      <LegalSection no="05" title={t(legalCatalog, "legal.notice.s05.title")}>
        <p>{t(legalCatalog, billingOn ? "legal.notice.s05.bodyPaid" : "legal.notice.s05.body")}</p>
        {billingOn ? (
          <p>
            <a href="/withdraw">{t(legalCatalog, "legal.notice.s05.withdrawLink")}</a>
          </p>
        ) : null}
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
      {TERMS_VERSIONS.length === 1 ? (
        <p className="legalVersionsNone">{t(legalCatalog, "legal.versions.none")}</p>
      ) : null}
    </>
  );
}

/**
 * A stored item's name, breakable only after a dot (DONE.md default 8): each dot-ended part is one run that
 * `legal.css` keeps from wrapping, with a <wbr> after it. The text is the name exactly, so a copy is the real key.
 * `dir="ltr"` makes it its own left-to-right run (DONE screen 18, as the card draws it): on a right-to-left page the
 * neutral leading `__` of a `__Host-` name would otherwise be drawn at its right end (REV-S01 p2 PT2-N2).
 */
function InventoryName({ name }: { name: string }) {
  const parts = name.split(/(?<=\.)/);
  return (
    <code dir="ltr">
      {parts.map((part, index) => (
        <Fragment key={index}>
          <span className="legalNamePart">{part}</span>
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </code>
  );
}

/** One /cookies row: the name as the code writes it, then kind, purpose, who receives it, and lifetime. */
function InventoryRow({ item, legalCatalog }: { item: LegalInventoryItem; legalCatalog: MessageCatalog }) {
  return (
    <tr>
      <th scope="row">
        <InventoryName name={item.name} />
      </th>
      <td className="legalKindCell">{t(legalCatalog, item.kindKey)}</td>
      <td>{t(legalCatalog, item.purposeKey)}</td>
      <td>{t(legalCatalog, item.recipientKey)}</td>
      <td>{t(legalCatalog, item.lifeKey)}</td>
    </tr>
  );
}

/**
 * The cookie policy (`/cookies`): the eight stored items of record, the four cookies in one table and
 * the four browser-storage keys in another, then how to refuse them and what then stops working.
 */
export function LegalCookiesBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  const head = (
    <thead>
      <tr>
        <th scope="col">{t(legalCatalog, "legal.cookies.colName")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colType")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colPurpose")}</th>
        <th scope="col">{t(legalCatalog, "legal.cookies.colRecipient")}</th>
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
          {LEGAL_COOKIES.map((item) => (
            <InventoryRow item={item} legalCatalog={legalCatalog} key={item.name} />
          ))}
        </tbody>
      </table>
      <h2 className="legalSubhead">{t(legalCatalog, "legal.cookies.storageTitle")}</h2>
      <p className="legalIntro">{t(legalCatalog, "legal.cookies.storageIntro")}</p>
      <table className="legalTable legalCookieTable">
        {head}
        <tbody>
          {LEGAL_BROWSER_STORAGE.map((item) => (
            <InventoryRow item={item} legalCatalog={legalCatalog} key={item.name} />
          ))}
        </tbody>
      </table>
      <p className="legalRefuse">{t(legalCatalog, "legal.cookies.refuse")}</p>
      <p className="legalRefuse">{t(legalCatalog, "legal.cookies.refuseEffect")}</p>
      <CookiePreferencesButton className="btn btnDark legalAction" label={t(legalCatalog, "legal.cookies.change")} />
    </>
  );
}

const PURPOSE_KEYS: Readonly<Record<ProviderPurpose, string>> = {
  arguments: "legal.providers.purpose.arguments",
  judging: "legal.providers.purpose.judging",
  story: "legal.providers.purpose.story",
  support: "legal.providers.purpose.support"
};

const FLAG_KEYS: Readonly<Record<ProviderRegisterEntry["zeroRetention"] | ProviderRegisterEntry["training"], string>> = {
  yes: "legal.providers.yes",
  no: "legal.providers.no",
  unconfirmed: "legal.providers.unconfirmed",
  notNeeded: "legal.providers.zeroNotNeeded"
};

/**
 * The AI Provider Register (`/providers`), which Privacy Policy §5 makes part of the policy: one
 * label/value table per provider with every fact §5 promises, so it stays readable on a phone.
 * Facts come from `PROVIDER_REGISTER`; the catalogues carry only labels and the words around them.
 */
export function LegalProvidersBody({ legalCatalog }: { legalCatalog: MessageCatalog }) {
  return (
    <>
      <p className="legalIntro">{t(legalCatalog, "legal.providers.intro")}</p>
      {PROVIDER_REGISTER.map((entry) => {
        const name = entry.nameKey === null ? entry.provider : t(legalCatalog, entry.nameKey);
        const rows: ReadonlyArray<readonly [string, ReactNode]> = [
          ["legal.providers.colModels", entry.modelsKey === null ? <bdi>{entry.models}</bdi> : `${entry.models} · ${t(legalCatalog, entry.modelsKey)}`],
          ["legal.providers.colEntity", <bdi>{entry.entity}</bdi>],
          ["legal.providers.colCountry", t(legalCatalog, entry.homeCountryKey)],
          [
            "legal.providers.colPurpose",
            <div className="legalProviderPurposes">
              <ul>
                {entry.purposes.map((purpose) => (
                  <li key={purpose}>{t(legalCatalog, PURPOSE_KEYS[purpose])}</li>
                ))}
              </ul>
              {entry.purposesConfirmed ? null : <span className="legalFactNote">{t(legalCatalog, "legal.providers.purposesUnconfirmed")}</span>}
            </div>
          ],
          ["legal.providers.colLocation", t(legalCatalog, entry.locationKey)],
          ["legal.providers.colRetention", t(legalCatalog, entry.retentionKey)],
          ["legal.providers.colZeroRetention", t(legalCatalog, FLAG_KEYS[entry.zeroRetention])],
          ["legal.providers.colTraining", t(legalCatalog, FLAG_KEYS[entry.training])],
          ["legal.providers.colBasis", t(legalCatalog, entry.basisKey)],
          ["legal.providers.colContact", <Email address={entry.contact} />],
          ["legal.providers.colChecked", entry.checkedOn === null ? t(legalCatalog, "legal.providers.notChecked") : <bdi>{entry.checkedOn}</bdi>]
        ];
        return (
          <section key={entry.key} className="legalProviderEntry" aria-labelledby={`legal-provider-${entry.key}`}>
            <h2 id={`legal-provider-${entry.key}`}>{name}</h2>
            <table className="legalTable legalFactTable">
              <tbody>
                {rows.map(([labelKey, value]) => (
                  <tr key={labelKey}>
                    <th scope="row">{t(legalCatalog, labelKey)}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
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
