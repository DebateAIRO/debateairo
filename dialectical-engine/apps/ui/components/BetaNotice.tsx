"use client";

import type { MouseEvent, ReactNode } from "react";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { COMPANY } from "@/lib/legal/pages";

/*
 * The site is in Beta, and says so in three ways: a small "Beta" mark beside the site's name, one sentence where a person
 * starts (it asks for patience and for reports), and a "Report a problem" link that is always within reach. All three read
 * the layout's shared words (`chrome`), so they say the same thing wherever they are drawn.
 */

/** A line break inside a mail's body, as a `mailto:` address must write it. */
const MAIL_LINE_BREAK = "\r\n";

/**
 * The address of the page a report is about: the site and the page's path, without what follows a "?" or a "#". That part
 * can hold a one-time code (a password reset, an address confirmation) or the words of a question, and neither belongs in
 * a mail.
 */
export function reportedPageAddress(location: Readonly<{ origin: string; pathname: string }>): string {
  return `${location.origin}${location.pathname}`;
}

/**
 * The mail a report starts as: to our support address, with a subject that says what it is and a body that names the page
 * and leaves room to write. The site sends and keeps nothing: the person's own mail program opens the draft, and they
 * read and can change every word before sending it. Without a page address (the server's first paint) the body only
 * leaves the room to write.
 */
export function reportProblemHref(catalog: MessageCatalog, pageAddress: string | null): string {
  const body = [
    ...(pageAddress === null ? [] : [t(catalog, "chrome.beta.mailPage", { address: pageAddress }), ""]),
    t(catalog, "chrome.beta.mailPrompt"),
    ""
  ].join(MAIL_LINE_BREAK);
  const subject = encodeURIComponent(t(catalog, "chrome.beta.mailSubject"));
  return `mailto:${COMPANY.emails.general}?subject=${subject}&body=${encodeURIComponent(body)}`;
}

/** The small "Beta" mark that sits beside the site's name. */
export function BetaBadge({ className = "" }: Readonly<{ className?: string }>) {
  const { catalog } = useChromeI18n();
  return <span className={`betaBadge ${className}`.trim()}>{t(catalog, "chrome.beta.badge")}</span>;
}

/**
 * A link that starts a report by mail. The page's address is written into the draft at the press, because the server
 * cannot know it and a person may have moved between pages since the link was drawn.
 */
export function ReportProblemLink({ className, role, children, onPress }: Readonly<{
  className?: string;
  /** "menuitem" when the link is an item of a menu. */
  role?: "menuitem";
  /** The link's words; absent: "Report a problem". */
  children?: ReactNode;
  /** Called at the press, after the draft's address is written (a menu closes itself here). */
  onPress?: () => void;
}>) {
  const { catalog } = useChromeI18n();
  const press = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.href = reportProblemHref(catalog, reportedPageAddress(window.location));
    onPress?.();
  };
  return (
    <a className={className} role={role} href={reportProblemHref(catalog, null)} onClick={press} data-report-problem>
      {children ?? t(catalog, "chrome.beta.report")}
    </a>
  );
}

/** The one sentence where a person starts: the site is in Beta, thank you for your patience, tell us what you find. */
export function BetaNote({ className = "" }: Readonly<{ className?: string }>) {
  const { catalog } = useChromeI18n();
  return (
    <p className={`betaNote ${className}`.trim()} role="note">
      <BetaBadge />
      <span>
        {t(catalog, "chrome.beta.note")}{" "}
        {t(catalog, "chrome.beta.tellUsLead")}{" "}
        <ReportProblemLink className="betaNoteLink">{t(catalog, "chrome.beta.tellUs")}</ReportProblemLink>
      </span>
    </p>
  );
}
