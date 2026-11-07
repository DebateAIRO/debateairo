"use client";

import Link from "next/link";
import type { AnswerContribution } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * Decision 13: a dig made on a public debate says what became of it, to the digger only (the API serves `contribution` to no one else). No reason is shown
 * here; 0157 (D1): after a review step, it links to the person's statement of reasons, which gives the ground and the routes.
 */
const REVIEWED: ReadonlySet<AnswerContribution["state"]> = new Set(["REMOVED_AFTER_REVIEW", "KEPT_PRIVATE_BY_REVIEW", "OFF_THE_PAGE_FOR_REVIEW"]);

export function V4ContributionNote({ contribution, catalog }: Readonly<{ contribution: AnswerContribution | undefined; catalog: MessageCatalog }>) {
  if (contribution === undefined) return null;
  const rewrite = contribution.rewrite ?? null;
  return (
    <>
      <p className="v4ContributionNote" role="status" data-state={contribution.state}>
        {t(catalog, `v4.contribution.${contribution.state}`)}
        {contribution.state === "ON_THE_PAGE" ? (
          <>
            {" "}
            <Link className="v4Link" href={`/public/debate/${encodeURIComponent(contribution.public_ref)}`}>{t(catalog, "v4.contribution.seePage")}</Link>
          </>
        ) : REVIEWED.has(contribution.state) ? (
          <>
            {" "}
            <Link className="v4Link" href="/settings/notices">{t(catalog, "v4.contribution.statement")}</Link>
          </>
        ) : null}
      </p>
      {rewrite === null ? (
        contribution.state === "CHECKING" ? <p className="v4Muted" data-contribution-rewrite="WRITING">{t(catalog, "v4.contribution.rewriteWriting")}</p> : null
      ) : (
        <section className="v4ContributionRewrite" data-contribution-rewrite="READY">
          <h3>{t(catalog, "v4.contribution.rewriteTitle")}</h3>
          <p><strong>{rewrite.line}</strong></p>
          <p>{rewrite.summary}</p>
          {rewrite.what_changed.length === 0 ? null : <ul>{rewrite.what_changed.map((sentence) => <li key={sentence}>{sentence}</li>)}</ul>}
        </section>
      )}
    </>
  );
}
