"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { readQuestionShare, type QuestionShare } from "@/lib/v4/money";
import { useQuotaRefresh } from "@/lib/v4/quotaPulse";

/*
 * map-f9 (owner's screen review, 3 Nov 2026): the map's top bar shows the question itself on one line and what this
 * question has used, "This question: 11% of today" ("of this month" on Free). The share comes from the run read's optional
 * `question_share` (lib/v4/money.ts; not in the contract yet), read when the page opens, again after each quota moment
 * (lib/v4/quotaPulse.ts: a dig sent or finished, the question finished) and when the person comes back to the tab. While
 * the server does not say it, only the question shows. Nothing is kept in the browser.
 */

/** This question's share of its window, read now and after every quota moment; null while it is not known. */
export function useQuestionShare(runId: string | null): QuestionShare | null {
  const [share, setShare] = useState<Readonly<{ runId: string; share: QuestionShare }> | null>(null);
  const reads = useRef(0);
  const read = useCallback(() => {
    if (runId === null) return;
    reads.current += 1;
    const mine = reads.current;
    void readQuestionShare(runId).then((next) => {
      // The latest read wins; a failed read keeps what was shown.
      if (mine === reads.current && next !== null) setShare({ runId, share: next });
    });
  }, [runId]);
  useEffect(() => {
    read();
    return () => {
      reads.current += 1;
    };
  }, [read]);
  useQuotaRefresh(read, runId !== null);
  return share !== null && share.runId === runId ? share.share : null;
}

/** "This question: 11% of today" (or of this week, of this month). */
export function questionShareText(share: QuestionShare, catalog: MessageCatalog): string {
  return t(catalog, `v4.debate.questionShare.${share.scope}`, { percent: share.percent });
}

/** The share alone, as a quiet line (the phone's "Your question" screen and its pinned bar). */
export function V4QuestionShareLine({ share, catalog }: Readonly<{ share: QuestionShare | null; catalog: MessageCatalog }>) {
  if (share === null) return null;
  return <p className="v4QuestionShare v4Muted">{questionShareText(share, catalog)}</p>;
}

/** The top bar's line under the header: the question on one line (its whole words on hover), then this question's share. */
export function V4TopLine({ question, share, catalog }: Readonly<{ question: string; share: QuestionShare | null; catalog: MessageCatalog }>) {
  const words = question.replace(/\s+/g, " ").trim();
  if (words.length === 0 && share === null) return null;
  return (
    <div className="v4TopLine">
      {words.length === 0 ? null : (
        // The page's heading already says the question to screen readers; this is its one visible line.
        <p className="v4TopLineQuestion" title={words} aria-hidden="true">{words}</p>
      )}
      {share === null ? null : <p className="v4QuestionShare v4Muted">{questionShareText(share, catalog)}</p>}
    </div>
  );
}
