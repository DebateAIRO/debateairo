import { currentDocument, legalArchive, type LegalArchiveKind } from "@debateai/legal-manifest";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { ArchivedLegalText } from "@/lib/legal/archive";

/** Where each document lives: the text `${base}`, its list `${base}/versions`, one archived text `${base}/versions/<sha256>`. */
const BASE_PATH: Readonly<Record<LegalArchiveKind, string>> = Object.freeze({ TERMS: "/terms", PRIVACY: "/privacy" });

/**
 * Ruling Q-3: every archived text of one document in the reader's language, newest first (L2's `legalArchive` order),
 * the one in force tagged, each row linking to its own page. Two archived texts can share a version number (drafts
 * archived before go-live), so a shared number also shows the first 12 hex digits of the text's hash.
 */
export function LegalArchiveVersionsBody({
  kind,
  locale,
  legalCatalog
}: {
  kind: LegalArchiveKind;
  locale: LocaleCode;
  legalCatalog: MessageCatalog;
}) {
  const entries = legalArchive(kind, locale);
  const current = currentDocument(kind, locale);
  const base = BASE_PATH[kind];
  return (
    <>
      <ol className="legalVersions" data-legal-versions={kind}>
        {entries.map((entry) => {
          const shared = entries.filter((other) => other.version === entry.version).length > 1;
          return (
            <li className="legalVersionRow" key={entry.sha256}>
              <span className="legalVersionNo">{entry.version}</span>
              <div>
                <div className="legalVersionHead">
                  {shared ? (
                    <span className="legalVersionDate">{t(legalCatalog, "legal.archive.textId", { id: entry.sha256.slice(0, 12) })}</span>
                  ) : null}
                  {current !== null && current.sha256 === entry.sha256 ? (
                    <span className="legalVersionTag">{t(legalCatalog, "legal.versions.current")}</span>
                  ) : null}
                </div>
              </div>
              <a className="legalVersionAction" href={`${base}/versions/${entry.sha256}`}>
                {t(legalCatalog, "legal.versions.read")}
              </a>
            </li>
          );
        })}
      </ol>
      {entries.length <= 1 ? (
        <p className="legalVersionsNone">
          {t(legalCatalog, kind === "TERMS" ? "legal.versions.none" : "legal.privacyVersions.none")}
        </p>
      ) : null}
    </>
  );
}

/**
 * One archived text, exactly as it was published, as plain preformatted text: the archive keeps the markdown source,
 * not a rendering. The page answers "not found" before this renders when the archive holds no such text.
 */
export function LegalArchivedTextBody({
  kind,
  archived,
  legalCatalog
}: {
  kind: LegalArchiveKind;
  archived: ArchivedLegalText;
  legalCatalog: MessageCatalog;
}) {
  const base = BASE_PATH[kind];
  return (
    <>
      <p className="legalIntro">{t(legalCatalog, "legal.archive.note")}</p>
      <p className="legalIntro">
        <a href={`${base}/versions`}>{t(legalCatalog, "legal.archive.allVersions")}</a>
      </p>
      <p className="legalIntro">
        <a href={base}>{t(legalCatalog, "legal.archive.current")}</a>
      </p>
      <pre className="legalArchiveText" lang={archived.locale} data-legal-archive={archived.sha256}>
        {archived.text}
      </pre>
    </>
  );
}
