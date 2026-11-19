"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { ReadingLevel } from "@/lib/v4/types";
import { V4QuotaPill } from "./V4QuotaPill";
import { V4AccountMenu, type V4HeaderSession } from "./V4AccountMenu";
import { allMapsHref } from "./V4MapShelf";
import { BetaBadge } from "@/components/BetaNotice";

/** Which of the header's pages the person is on: the ask page (and every page of a question), or "My questions". */
export type V4HeaderPlace = "ask" | "questions";

/*
 * V4 initial (spec "/v4", header everywhere): brand + badge to /v4 and the page's own extras.
 * V4 screen review (3 Nov 2026), ask-d6 A / ask-f5 / journey-f19: this is the V4 pages' one header row (the site's old top
 * bar steps back on them). It ends in the round account button (V4AccountMenu), whose menu also holds the classic-view
 * link, once; the header itself shows no classic link any more.
 * The owner's answers of 5 Nov 2026:
 *  - The reading level is chosen only when asking and is kept for that debate, its digs and its report, so no header has a
 *    level menu or a "Plain words" label, and no header link carries a level. The level props stay accepted for the pages
 *    that still pass them, and do nothing.
 *    RELEASE ORDER: until the ask page offers the level choice for every question (the start-step session's V4AskClient
 *    item: the choice on every question, starting on "Plain words", nothing kept in the account), this header was the
 *    only way a person who already holds a level could change it. This header must not reach a release before that item.
 *  - Questions 14 B and 15: the quota shows as one round circle that fills as quota is used (V4QuotaPill.tsx), the
 *    fullest period the plan counts, at every screen size.
 *  - Question 15: on a phone the header is one row, the brand's mark (its name stays its accessible name), the circle and
 *    the round account button (app/v4/v4-base.css). Question 18 A (no "Write my report" in the top bar while the bottom
 *    bar shows it) is built in the map's own report item (useMapReport's `bottomShowsReport`, V4BottomStack's
 *    `onReportShown`); only the map page's wiring of the two remains (V4DebateClient, the start-step session's).
 * Design Document v2 (16 Nov 2026):
 *  - The brand is the wordmark alone, "Dialectical Engine" in the display face with "Engine" in the brand colour; the
 *    diamond mark stays only as the phone's one-row brand, and the "V4 preview" badge is gone.
 * While the site is in Beta, a small "Beta" mark follows the wordmark on every V4 page (on a phone it follows the diamond
 * mark). It is inside the brand's link, so a screen reader hears it with the site's name.
 *  - Beside it, the header's own links: Ask, My questions (signed-in people only, as the page is theirs) and How it
 *    works. The link of the page the person is on is underlined in the brand colour and is `aria-current`. On a phone
 *    the links step back (the one-row rule above); the brand and the account menu still reach the same pages.
 */

export function V4Header({
  catalog, classicHref = null, showQuota = true, session, children, after, onBrandClick, place = "ask"
}: Readonly<{
  catalog: MessageCatalog;
  /** The page the header's links mark as the current one; a page of a question counts as "ask". */
  place?: V4HeaderPlace;
  /** Accepted and unused (the 5 Nov reading-level ruling: no level in any header). */
  readingLevel?: ReadingLevel | null;
  /** Accepted and unused (the 5 Nov reading-level ruling: no header link carries a level). */
  linkLevel?: ReadingLevel | null;
  /** Accepted and unused (the 5 Nov reading-level ruling: the level is chosen only when asking). */
  onReadingLevel?: (level: ReadingLevel) => void;
  /** journey-f19 / ask-f6: this page's classic view, offered once, in the account menu (null: none). */
  classicHref?: string | null;
  /**
   * journey-f19: the quota share shows only on the ask, choosing and map pages. False on any other page (a public page's
   * note, for one): no share is shown and the usage is not read.
   */
  showQuota?: boolean;
  /** The page's own knowledge of the session (the ask page learns it beside the page); absent: the menu reads it. */
  session?: V4HeaderSession;
  /** Extras before the account button (e.g. the Report button). */
  children?: ReactNode;
  /**
   * What comes after the account button, on its own row at the end side (the map's report strip, report-d1 A). It is
   * after the button in the page too, so the keyboard meets it in the order it is seen (WCAG 2.4.3; the wave-2 checks).
   * It is a row of the header itself, not of the controls beside the brand, so opening it moves none of them (the browser
   * check, 4 Nov: on a phone they jumped from the start side to the end side).
   */
  after?: ReactNode;
  /**
   * Called when the brand link is pressed, before the browser follows it to /v4; a handler may call event.preventDefault()
   * to keep the page where it is. Asked for by the start-step session (5 Nov), which will pass it; not one of the owner's
   * answers. Absent: the plain link it always was.
   */
  onBrandClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}>) {
  // ask-f16 with the wave-2 checks (4 Nov): the usage is read only for a signed-in person, and a page that knows the person
  // is signed out reads nothing and holds nothing (they never get a circle). While the page is still checking, the circle's
  // place is held from the first frame without reading, so a person who turns out signed in sees nothing jump; it closes
  // at once if they are signed out (ask-f16: "close it quickly if that part does not come").
  const quotaWanted = showQuota && (session === undefined || session === "IN");
  const quotaHeld = showQuota && session === "CHECKING";
  return (
    <header className="v4Hdr">
      <div className="v4HdrLead">
        <Link href="/v4" className="v4HdrBrand" onClick={onBrandClick}>
          {/* On a phone the wordmark is hidden on screen (v4-base.css) and stays the link's name; the mark shows there. */}
          <span className="v4HdrMark" aria-hidden="true" />
          <span className="v4HdrName">Dialectical <span className="v4HdrNameAccent">Engine</span></span>{" "}
          <BetaBadge className="v4HdrBeta" />
        </Link>
        <nav className="v4HdrNav" aria-label={t(catalog, "v4.header.nav.label")}>
          <Link href="/v4" className="v4HdrNavLink" aria-current={place === "ask" ? "page" : undefined} onClick={onBrandClick}>
            {t(catalog, "v4.header.nav.ask")}
          </Link>
          {session === "OUT" || session === "CHECKING" ? null : (
            <a href={allMapsHref()} className="v4HdrNavLink" aria-current={place === "questions" ? "page" : undefined}>
              {t(catalog, "v4.maps.menu")}
            </a>
          )}
          <a href="/help" className="v4HdrNavLink">{t(catalog, "v4.header.nav.how")}</a>
        </nav>
      </div>
      <div className="v4HdrRight">
        <V4QuotaPill catalog={catalog} wanted={quotaWanted} hold={quotaHeld} />
        {children}
        {/* ask-d6 A: the round account button ends the row. */}
        <V4AccountMenu catalog={catalog} classicHref={classicHref} {...(session === undefined ? {} : { session })} />
      </div>
      {after}
    </header>
  );
}
