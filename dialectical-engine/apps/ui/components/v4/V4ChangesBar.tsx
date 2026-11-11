"use client";

import { useId, type MouseEvent } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { cardLabel } from "@/lib/v4/mapLooks";
import { answerHolds, type NewsHeadline, type PathResult } from "@/lib/v4/readyMoment";
import { readyText, ReadyWords, type ReadyNoteText } from "./V4ReadyNote";
import { shortText } from "./V4MapTree";

/*
 * V4 initial (2026-10-28), D4: one quiet bar when something changed, with a tour that walks the news one question at a
 * time. N7 (2026-10-29) adds "since your last visit", from the last visit the account kept.
 * V4 screen review (owner picks 3 Nov 2026):
 * - journey-f10: the notice above the map has one name, "What your digs did", and map-d5's "What this round did for you"
 *   list folds into it: one plain line per path a dig settled, with the three result tags (Corrected, Added to,
 *   Confirmed; journey-f11), and the win sentence "Confirmed: the answer holds." when every dig confirmed its path.
 * - dig-f3: the news bar is the finished-dig notice and speaks as a result: "Done: “Mostly renewables” changed." with
 *   [See it], or with several "Done: your digs finished." with [Show me]. No count of news.
 * - wait-f15 / map-f21: the first arrival of the answer is never news (the page decides that, lib/v4/readyMoment.ts).
 */

const SHORT_LINE = 80;

/** A path as these lines name it: its short label (map-f25, r2-20 A), so no outcome words ("held up") reach the notice. */
function pathName(line: string): string {
  return shortText(cardLabel(line), SHORT_LINE);
}

/** The finished-dig notice's sentence, as the notice and the ready note both say it. */
export function newsHeadlineText(catalog: MessageCatalog, headline: NewsHeadline): ReadyNoteText {
  if (headline.kind === "CHANGED" || headline.kind === "HOLDS") {
    return readyText(catalog, `v4.digsDid.news.${headline.kind}`, pathName(headline.path.line));
  }
  if (headline.kind === "FAILED") {
    return headline.path === null
      ? readyText(catalog, "v4.digsDid.news.FAILED.noLine")
      : readyText(catalog, "v4.digsDid.news.FAILED", pathName(headline.path.line));
  }
  return readyText(catalog, `v4.digsDid.news.${headline.kind}`);
}

export function V4ChangesBar(props: Readonly<{
  /** The news the notice shows (since the last "Hide this"); null when there is none. */
  headline: NewsHeadline | null;
  /** N7: some of that news is since the person's last visit (not only from this one). */
  sinceLastVisit: boolean;
  /** How many places the news is at: one opens with "See it", several with the tour ("Show me"). */
  stops: number;
  onSee: (event: MouseEvent<HTMLButtonElement>) => void;
  onDismiss: () => void;
  /** journey-f10: every path a dig settled on this map, with its result. */
  results: readonly PathResult[];
  catalog: MessageCatalog;
}>) {
  const { headline, sinceLastVisit, stops, onSee, onDismiss, results, catalog } = props;
  const titleId = useId();
  if (headline === null && results.length === 0) return null;
  return (
    <section className="v4DebChanges v4DigsDid" aria-labelledby={titleId}>
      <h2 id={titleId} className="v4DigsDidTitle">{t(catalog, "v4.digsDid.title")}</h2>
      {headline === null ? null : (
        <div className="v4DigsDidNews">
          <span className="v4DebChangesDot" aria-hidden="true" />
          <p className="v4DebChangesText">
            {sinceLastVisit ? <><strong>{t(catalog, "v4.changes.sinceLastVisit")}</strong>{" "}</> : null}
            <ReadyWords text={newsHeadlineText(catalog, headline)} />
          </p>
          <div className="v4DebChangesActions">
            {stops > 0 ? (
              <button type="button" className="v4Btn" onClick={onSee}>
                {t(catalog, stops === 1 ? "v4.ready.seeIt" : "v4.ready.showMe")}
              </button>
            ) : null}
            <button type="button" className="v4Link v4DebChangesDismiss" onClick={onDismiss}>{t(catalog, "v4.changes.dismiss")}</button>
          </div>
        </div>
      )}
      {results.length === 0 ? null : (
        <>
          {answerHolds(results) ? <p className="v4DigsDidHolds">{t(catalog, "v4.digsDid.holds")}</p> : null}
          <ul className="v4DigsDidList">
            {results.map((entry) => (
              <li key={entry.path.id} className={`v4DigsDidLine v4DigsDid-${entry.result}`}>
                <ReadyWords text={readyText(catalog, `v4.digsDid.line.${entry.result}`, pathName(entry.path.line))} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
