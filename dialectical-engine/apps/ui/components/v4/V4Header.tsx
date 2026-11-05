"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { ReadingLevel } from "@/lib/v4/types";
import { V4QuotaPill } from "./V4QuotaPill";
import { V4AccountMenu, type V4HeaderSession } from "./V4AccountMenu";

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
 *    bar shows it) is the map's own report item, still to come (V4DebateClient, V4BottomStack: the start-step session's).
 */

export function V4Header({
  catalog, classicHref = null, showQuota = true, session, children, after, onBrandClick
}: Readonly<{
  catalog: MessageCatalog;
  /** Accepted and unused (the 5 Nov reading-level ruling: no level in any header). */
  readingLevel?: ReadingLevel | null;
  /** Accepted and unused (the 5 Nov reading-level ruling: no header link carries a level). */
  linkLevel?: ReadingLevel | null;
  /** Accepted and unused (the 5 Nov reading-level ruling: the level is chosen only when asking). */
  onReadingLevel?: (level: ReadingLevel) => void;
  /** journey-f19 / ask-f6: this page's classic view, offered once, in the account menu (null: none, or the page shows it). */
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
   * Called when the brand link is pressed, before the browser follows it to /v4 (the owner's third round, 5 Nov: the
   * start-step session passes it); a handler may call event.preventDefault() to keep the page where it is. Absent: the
   * plain link it always was.
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
      <Link href="/v4" className="v4HdrBrand" onClick={onBrandClick}>
        <span className="v4HdrMark" aria-hidden="true" />
        {/* On a phone the name and the badge are hidden on screen (v4-base.css) and stay the link's name; the space keeps
            the two words apart when it is read out (a flex row draws no space-only text). */}
        <span className="v4HdrName">Dialectical Engine</span>{" "}
        <span className="v4HdrBadge">{t(catalog, "v4.brand.badge")}</span>
      </Link>
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
