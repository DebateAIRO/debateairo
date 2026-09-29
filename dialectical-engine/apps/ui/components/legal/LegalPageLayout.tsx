import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { LEGAL_PAGES, type LegalPageKey } from "@/lib/legal/pages";

/**
 * The one layout the six legal pages share (design 15a): side navigation, a numbered text
 * column, and the full footer. It holds no legal prose — every page hands it the heading block
 * and the body — and it is a server component, so the text is in the first HTML response.
 */
export function LegalPageLayout({
  current,
  chromeCatalog,
  legalCatalog,
  eyebrow,
  title,
  meta,
  children
}: {
  current: LegalPageKey;
  chromeCatalog: MessageCatalog;
  legalCatalog: MessageCatalog;
  eyebrow: string;
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <main className="screen scroll legalPage">
      <div className="legalGrid">
        <nav className="legalNav" aria-label={t(legalCatalog, "legal.navLabel")}>
          <span className="legalNavHead" aria-hidden>
            {t(chromeCatalog, "chrome.legalPages")}
          </span>
          <ul>
            {LEGAL_PAGES.map(({ key, href, labelKey }) => (
              <li key={key}>
                <a className="legalNavLink" href={href} aria-current={key === current ? "page" : undefined}>
                  {t(chromeCatalog, labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="legalMain">
          <p className="legalEyebrow">{eyebrow}</p>
          <h1 className="legalTitle">{title}</h1>
          <p className="legalMeta">{meta}</p>
          {children}
        </article>
      </div>
      <SiteFooter variant="full" />
    </main>
  );
}
